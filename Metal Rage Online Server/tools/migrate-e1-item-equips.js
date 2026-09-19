// E1 migration (docs/design/e1-item-ownership.md section 4, docs/backlog.md):
// creates item_equips and copies every currently-equipped items row into it,
// so ITEM_EQUIPS_MODE can be flipped to 'enabled' without every existing
// account losing its current loadout.
//
// DO NOT RUN THIS AGAINST THE REAL DATABASE without a high-tier review and a
// fresh backup first (see docs/backlog.md E1 / AGENTS.md 協作與紀錄規則). This
// script only ever ran against test/fixtures/fake-db.js and an in-memory
// mock pool while it was written (see test/item-equips.js) -- never against
// database/config.json's real `mro` database.
//
// Idempotent when re-run with --force: every row it would insert that
// already exists with the same item_id is skipped, not duplicated. Without
// --force a rerun refuses outright once item_equips has any rows (see the
// rerun-safety comment inside runMigration()). Fails loudly (throws, rolls
// back, exits non-zero from the CLI) if a target (account_id, mech_slot,
// part_slot) already holds a *different* item_id than the items row being
// copied -- that would mean two different serials both claim equipped=1 on
// the same mech+part, which the UNIQUE constraint says can't happen but the
// script checks explicitly instead of trusting that.
//
// E1 fix round (Sol batch4, docs/research/2026-09-19-sol-review/batch4.md
// "Must fix before migration", item 1): CREATE TABLE now runs BEFORE
// beginTransaction(). MySQL DDL implicitly commits, so having it inside the
// transaction meant a later collision's rollback could not undo it (or
// anything else the implicit commit had already flushed) -- not truly
// atomic. The transaction now only wraps the SELECT/INSERT work, so a
// collision rolls all of that back.
//
// E1 fix round (coordinator decision 2026-09-19): this script no longer
// prints a mysqldump hint -- it is not reliable as a real backup command
// (fails outright the first time, before item_equips exists) and the
// high-tier operator takes their own full-database backup before running
// this. The CLI now requires E1_BACKUP_CONFIRMED=1 on top of
// ALLOW_REAL_DB_WRITE=1, so a real run can't happen without an explicit
// "yes, I already backed up" signal.
//
// Usage (once a high-tier has reviewed this, taken a full-DB backup, and set
// both env vars below):
//   ALLOW_REAL_DB_WRITE=1 E1_BACKUP_CONFIRMED=1 node tools/migrate-e1-item-equips.js [--force]
// --force is required for a rerun once item_equips already has rows (see
// the rerun-safety comment inside runMigration() below).

/**
 * @param {object} pool a mysql2/promise-shaped pool: pool.getConnection()
 *   returns {beginTransaction, commit, rollback, release, execute}.
 * @param {object} [opts]
 * @param {(msg: string) => void} [opts.log]
 * @param {boolean} [opts.force] proceed even if item_equips already has rows
 *   (see the rerun-safety note below). Default false.
 * @returns {Promise<{before: number, after: number, itemsTotal: number, inserted: number, skipped: number}>}
 */
async function runMigration(pool, opts = {})
{
    const log = opts.log || console.log;
    const force = !!opts.force;

    const conn = await pool.getConnection();
    try {
        // DDL first, outside any transaction: MySQL implicitly commits DDL,
        // so running it inside a transaction would make the whole thing
        // non-atomic (a later collision's rollback cannot undo a DDL's
        // implicit commit, nor anything else that implicit commit already
        // flushed). Safe to run every time -- IF NOT EXISTS.
        await conn.execute(`
            CREATE TABLE IF NOT EXISTS item_equips (
              id INT AUTO_INCREMENT PRIMARY KEY,
              account_id INT NOT NULL,
              item_id INT NOT NULL,
              mech_slot TINYINT NOT NULL,
              part_slot TINYINT NOT NULL,
              UNIQUE KEY uniq_mech_part (account_id, mech_slot, part_slot)
            )
        `);

        // E1 fix round (Sol batch4, coordinator decision 2026-09-19):
        // refuse if item_equips already has rows, unless --force. Once
        // ITEM_EQUIPS_MODE has been 'enabled', saveEquippedLoadout() stops
        // updating items.equipped/items.mech_type entirely (see
        // database/db.js), so on a rerun those legacy columns can no longer
        // be trusted to reflect current reality -- re-deriving item_equips
        // from them would silently write stale data.
        const [[{ existingCount }]] = await conn.execute('SELECT COUNT(*) AS existingCount FROM item_equips');
        if (Number(existingCount) > 0 && !force) {
            throw new Error(
                `E1 migration: item_equips already has ${existingCount} row(s). Refusing to rerun without `
                + `--force, because once ITEM_EQUIPS_MODE has been 'enabled' items.equipped/items.mech_type `
                + `are no longer kept up to date and re-deriving item_equips from them would write stale `
                + `data. Pass --force only if you have verified this run should proceed anyway.`
            );
        }

        await conn.beginTransaction();

        const [[{ itemsTotal }]] = await conn.execute('SELECT COUNT(*) AS itemsTotal FROM items');
        const [[{ before }]] = await conn.execute('SELECT COUNT(*) AS before FROM item_equips');
        log(`[E1 migration] Before: items=${itemsTotal} item_equips=${before}`);

        const [equippedRows] = await conn.execute(
            'SELECT account_id, id AS item_id, mech_type AS mech_slot, part_slot ' +
            'FROM items WHERE equipped = 1 AND part_slot BETWEEN 0 AND 5'
        );

        // E1 fix round (Sol batch4 "Must fix before migration", item):
        // refuse the whole migration (listing every offender) instead of
        // silently writing an out-of-range mech_slot. part_slot is already
        // constrained by the SELECT's WHERE clause above; checked again
        // here too, defence in depth, in case that clause is ever loosened.
        const invalidRows = equippedRows.filter(row => {
            const mechSlot = Number(row.mech_slot);
            const partSlot = Number(row.part_slot);
            return !(mechSlot >= 1 && mechSlot <= 8) || !(partSlot >= 0 && partSlot <= 5);
        });
        if (invalidRows.length > 0) {
            const list = invalidRows.map(row =>
                `account_id=${row.account_id} item_id(serial)=${row.item_id} mech_slot=${row.mech_slot} part_slot=${row.part_slot}`
            ).join('; ');
            throw new Error(
                `E1 migration: refusing to migrate ${invalidRows.length} equipped=1 row(s) with an `
                + `out-of-range mech_slot/part_slot: ${list}`
            );
        }

        let inserted = 0;
        let skipped = 0;
        for (const row of equippedRows) {
            const accountId = Number(row.account_id);
            const itemId = Number(row.item_id);
            const mechSlot = Number(row.mech_slot);
            const partSlot = Number(row.part_slot);

            const [existing] = await conn.execute(
                'SELECT item_id FROM item_equips WHERE account_id = ? AND mech_slot = ? AND part_slot = ?',
                [accountId, mechSlot, partSlot]
            );
            if (existing.length > 0) {
                if (Number(existing[0].item_id) === itemId) {
                    skipped++; // already migrated -- idempotent re-run (only reached with --force)
                    continue;
                }
                throw new Error(
                    `E1 migration: UNIQUE collision at account_id=${accountId} mech_slot=${mechSlot} `
                    + `part_slot=${partSlot} -- item_equips already has item_id=${existing[0].item_id}, `
                    + `items has equipped=1 item_id(serial)=${itemId}. Refusing to silently pick one; `
                    + `resolve the duplicate equipped=1 row by hand before re-running.`
                );
            }

            await conn.execute(
                'INSERT INTO item_equips (account_id, item_id, mech_slot, part_slot) VALUES (?, ?, ?, ?)',
                [accountId, itemId, mechSlot, partSlot]
            );
            inserted++;
        }

        const [[{ after }]] = await conn.execute('SELECT COUNT(*) AS after FROM item_equips');
        log(`[E1 migration] After: item_equips=${after} (inserted=${inserted}, already-present=${skipped})`);

        await conn.commit();
        return { before, after, itemsTotal, inserted, skipped };
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

async function main()
{
    if (process.env.ALLOW_REAL_DB_WRITE !== '1') {
        console.error(
            '[E1 migration] Refusing to run: set ALLOW_REAL_DB_WRITE=1 only after a high-tier has '
            + 'reviewed this script and you have a fresh, full-database backup (see the comment at the '
            + 'top of this file).'
        );
        process.exitCode = 1;
        return;
    }
    if (process.env.E1_BACKUP_CONFIRMED !== '1') {
        console.error(
            '[E1 migration] Refusing to run: this script no longer prints a backup command for you -- '
            + 'take a full-database backup yourself first, then set E1_BACKUP_CONFIRMED=1 to confirm you '
            + 'have done so (in addition to ALLOW_REAL_DB_WRITE=1).'
        );
        process.exitCode = 1;
        return;
    }
    const force = process.argv.includes('--force');
    const db = require('../database/db');
    try {
        await runMigration(db.pool, { force });
    } finally {
        await db.pool.end();
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('[E1 migration] Failed:', err.message);
        process.exitCode = 1;
    });
}

module.exports = { runMigration };
