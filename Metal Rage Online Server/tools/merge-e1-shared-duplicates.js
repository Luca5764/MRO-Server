// E1 follow-up (operator-approved 2026-09-19, after tools/migrate-e1-item-equips.js):
// merges historical duplicate purchases of permanently-shared items into one
// serial per (account_id, item_id). Pre-E1, buying a ShareType=1 item never
// checked whether the account already owned one (room.dispatch.js's E1 fix
// added that check going forward, but did nothing about existing rows) --
// this script cleans up the backlog those old duplicate purchases left.
//
// DO NOT RUN THIS AGAINST THE REAL DATABASE without a high-tier review and a
// fresh, full-database backup first. Run tools/migrate-e1-item-equips.js
// FIRST -- this script only makes sense once item_equips exists and reflects
// current equip state. Only ever exercised against an in-memory mock pool
// (test/item-equips.js) -- never database/config.json's real `mro`
// database.
//
// Preflight reference check (2026-09-19, read-only grep, no DB writes):
// grepped metalrageserver.sql, database/schema.sql and every database/*.js /
// dispatch/*.js / tools/*.js for a FOREIGN KEY or informal reference to
// items.id. The only FOREIGN KEYs in either schema file reference
// accounts(id); no table besides item_equips (item_equips.item_id, added by
// E1) stores an items.id value. tools/renumber-item-serials.js's own
// preflight (before item_equips existed) already found no child references
// either. Deleting the merged-away serials from `items` therefore only
// requires repointing item_equips first, which this script does before any
// DELETE.
//
// Scope: only items with ShareType==1 AND UseTime==0 (permanent shared
// items, [CACHE] database/item-share-type.js against Cache.Bin), grouped by
// (account_id, item_id), where the account owns more than one serial of
// that item_id. Non-shared items (duplicate main weapons etc.) and rentals
// (UseTime>0 -- legitimately allowed to stack/extend, per E1's own purchase
// dedup rule) are never touched.
//
// Which serial survives: prefer one that already has item_equips rows (so
// nothing currently-equipped moves to a "new" serial identity), then the
// lowest id. Every item_equips row belonging to the other (removed)
// serials of that (account_id, item_id) is repointed (UPDATE item_id) to
// the kept serial -- so if two duplicate serials were each equipped on a
// different mech (both had item_equips rows), the kept serial ends up
// equipped on both. A repoint changes item_equips.item_id but never
// item_equips.mech_slot/part_slot, so it cannot violate the
// UNIQUE(account_id, mech_slot, part_slot) key (item_id is not part of that
// key) -- if a repoint still ever throws a duplicate-key error, that is
// treated as a genuine bug and propagates up (transaction rolls back,
// script exits non-zero) rather than being caught and ignored.
// Then the removed serials' `items` rows are deleted. Points already spent
// buying the now-removed duplicates are NOT refunded (the design doc treats
// this as a data cleanup, not a refund policy -- see docs/backlog.md E1
// "疑點").
//
// Idempotent: after a real run, every (account_id, item_id) group has
// exactly one serial left, so the count>1 filter finds nothing on a rerun.
//
// Usage (once a high-tier has reviewed this, taken a full-DB backup, run
// migrate-e1-item-equips.js first, and set both env vars below):
//   ALLOW_REAL_DB_WRITE=1 E1_BACKUP_CONFIRMED=1 node tools/merge-e1-shared-duplicates.js [--dry-run]
// --dry-run only computes and prints the plan; it does not open a
// transaction or write anything.

const { getShareType, getUseTimeSeconds } = require('../database/item-share-type');

/**
 * @param {object} pool a mysql2/promise-shaped pool.
 * @param {object} [opts]
 * @param {(msg: string) => void} [opts.log]
 * @param {boolean} [opts.dryRun] compute and print the plan only, no writes.
 * @returns {Promise<{itemsBefore: number, itemsAfter: number, itemEquipsBefore: number,
 *   itemEquipsAfter: number, groupsMerged: number, serialsRemoved: number,
 *   plan: Array<{accountId: number, itemId: number, kept: number, removed: number[]}>}>}
 */
async function runMerge(pool, opts = {})
{
    const log = opts.log || console.log;
    const dryRun = !!opts.dryRun;

    const conn = await pool.getConnection();
    try {
        const [[{ itemsBefore }]] = await conn.execute('SELECT COUNT(*) AS itemsBefore FROM items');
        const [[{ itemEquipsBefore }]] = await conn.execute('SELECT COUNT(*) AS itemEquipsBefore FROM item_equips');
        log(`[E1 merge] Before: items=${itemsBefore} item_equips=${itemEquipsBefore}`);

        const [allItems] = await conn.execute('SELECT id, account_id, item_id FROM items ORDER BY account_id, item_id, id');
        const [allEquips] = await conn.execute('SELECT id, account_id, item_id, mech_slot, part_slot FROM item_equips');

        // serial (items.id) -> its item_equips rows.
        const equipsBySerial = new Map();
        for (const row of allEquips) {
            const serial = Number(row.item_id);
            if (!equipsBySerial.has(serial)) equipsBySerial.set(serial, []);
            equipsBySerial.get(serial).push(row);
        }

        // (account_id, item_id) -> [serial, serial, ...]
        const groups = new Map();
        for (const row of allItems) {
            const key = `${row.account_id}:${row.item_id}`;
            if (!groups.has(key)) groups.set(key, { accountId: Number(row.account_id), itemId: Number(row.item_id), serials: [] });
            groups.get(key).serials.push(Number(row.id));
        }

        const plan = [];
        for (const group of groups.values()) {
            if (group.serials.length <= 1) continue;
            if (getShareType(group.itemId) !== 1) continue;   // non-shared: duplicates are legitimate, never touched
            if (getUseTimeSeconds(group.itemId) !== 0) continue; // rental: legitimately stacks/extends, never touched

            // Prefer a serial that already has item_equips rows, then the
            // lowest id -- see the header comment.
            const sorted = [...group.serials].sort((a, b) => {
                const aHasRows = equipsBySerial.has(a) ? 0 : 1;
                const bHasRows = equipsBySerial.has(b) ? 0 : 1;
                if (aHasRows !== bHasRows) return aHasRows - bHasRows;
                return a - b;
            });
            const kept = sorted[0];
            const removed = sorted.slice(1);
            plan.push({ accountId: group.accountId, itemId: group.itemId, kept, removed });
        }

        for (const entry of plan) {
            log(
                `[E1 merge] account=${entry.accountId} item_id=${entry.itemId} kept=${entry.kept} `
                + `removed=[${entry.removed.join(', ')}]`
            );
        }

        if (dryRun) {
            log(`[E1 merge] --dry-run: ${plan.length} group(s) would be merged, no writes made.`);
            return {
                itemsBefore, itemsAfter: itemsBefore,
                itemEquipsBefore, itemEquipsAfter: itemEquipsBefore,
                groupsMerged: 0, serialsRemoved: 0, plan,
            };
        }

        await conn.beginTransaction();

        let serialsRemoved = 0;
        for (const entry of plan) {
            for (const removedSerial of entry.removed) {
                await conn.execute(
                    'UPDATE item_equips SET item_id = ? WHERE account_id = ? AND item_id = ?',
                    [entry.kept, entry.accountId, removedSerial]
                );
            }
            if (entry.removed.length > 0) {
                const placeholders = entry.removed.map(() => '?').join(', ');
                await conn.execute(
                    `DELETE FROM items WHERE account_id = ? AND id IN (${placeholders})`,
                    [entry.accountId, ...entry.removed]
                );
                serialsRemoved += entry.removed.length;
            }
        }

        const [[{ itemsAfter }]] = await conn.execute('SELECT COUNT(*) AS itemsAfter FROM items');
        const [[{ itemEquipsAfter }]] = await conn.execute('SELECT COUNT(*) AS itemEquipsAfter FROM item_equips');
        log(
            `[E1 merge] After: items=${itemsAfter} item_equips=${itemEquipsAfter} `
            + `(groups merged=${plan.length}, serials removed=${serialsRemoved}, points NOT refunded)`
        );

        await conn.commit();
        return { itemsBefore, itemsAfter, itemEquipsBefore, itemEquipsAfter, groupsMerged: plan.length, serialsRemoved, plan };
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
            '[E1 merge] Refusing to run: set ALLOW_REAL_DB_WRITE=1 only after a high-tier has reviewed '
            + 'this script, run tools/migrate-e1-item-equips.js first, and taken a fresh, full-database '
            + 'backup (see the comment at the top of this file).'
        );
        process.exitCode = 1;
        return;
    }
    if (process.env.E1_BACKUP_CONFIRMED !== '1') {
        console.error(
            '[E1 merge] Refusing to run: take a full-database backup yourself first, then set '
            + 'E1_BACKUP_CONFIRMED=1 to confirm you have done so (in addition to ALLOW_REAL_DB_WRITE=1).'
        );
        process.exitCode = 1;
        return;
    }
    const dryRun = process.argv.includes('--dry-run');
    const db = require('../database/db');
    try {
        await runMerge(db.pool, { dryRun });
    } finally {
        await db.pool.end();
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('[E1 merge] Failed:', err.message);
        process.exitCode = 1;
    });
}

module.exports = { runMerge };
