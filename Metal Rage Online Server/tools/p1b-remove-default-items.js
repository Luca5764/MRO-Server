// P1B-IMPL (docs/backlog.md P1b): cleans up the pre-fix duplicate default
// items createAccount used to hand out (docs/journal/2026-09-19-*-p1b-default-
// items.md) -- every mech's DefaultSetList loadout was inserted as a real
// owned `items` row plus an `item_equips` row, so the client showed five
// identical copies of the same booster instead of the one it already
// synthesizes at SerialIndex=0 (ZPanel_InvenItems.uc:338-383).
//
// DO NOT RUN THIS AGAINST THE REAL DATABASE without a high-tier review and a
// fresh, full-database backup first (see docs/backlog.md P1b / AGENTS.md
// 協作與紀錄規則). This script only ever ran against an in-memory mock pool
// while it was written (see test/p1b-remove-default-items.js) -- never
// database/config.json's real `mro` database. The exported runCleanup()
// itself performs no gating; only main() (the CLI entrypoint below) does, so
// a --dry-run call from a test or from a SELECT-only investigation can call
// runCleanup(pool, { dryRun: true, ... }) directly without ever writing.
//
// Rule (per account, per item_equips row): if (mech_slot, part_slot,
// items.item_id) equals that mech's Cache.Bin Table 4 DefaultSetList default
// (database/default-loadouts.js -- the exact table Game_User_SN's
// CANONICAL_LOADOUTS fallback uses, not a second hand-copied list), delete
// that item_equips row. Then delete the underlying items serial too, but
// only if (a) at least one of its item_equips rows was just deleted as a
// default match, AND (b) it has no item_equips rows left after that (i.e. it
// is not also equipped somewhere non-default, and not a legitimately-
// purchased extra copy that was never equipped as a default in the first
// place -- an unequipped copy has no item_equips row at all, so it is never
// looked at). Idempotent: a rerun finds no matching item_equips rows left to
// delete.
//
// Usage (once a high-tier has reviewed this, taken a full-DB backup, and set
// both env vars below):
//   ALLOW_REAL_DB_WRITE=1 P1B_BACKUP_CONFIRMED=1 node tools/p1b-remove-default-items.js --account 4 [--account 7] [--dry-run]
//   ALLOW_REAL_DB_WRITE=1 P1B_BACKUP_CONFIRMED=1 node tools/p1b-remove-default-items.js --all
// --dry-run computes and prints the plan only; no transaction is opened and
// nothing is written.

const { CANONICAL_LOADOUTS, PART_SLOT_FIELDS } = require('../database/default-loadouts');

const FIELD_BY_PART_SLOT = new Map(PART_SLOT_FIELDS.map(([field, slot]) => [slot, field]));

// null = no default for this mech/part (Table 4 has 0, e.g. mech 4/5's
// booster) -- can never match a real owned serial's item_id, so it is
// treated as "nothing to match" rather than "match item_id 0".
function defaultItemIdFor(mechSlot, partSlot)
{
    const loadout = CANONICAL_LOADOUTS[Number(mechSlot)];
    if (!loadout) return null;
    const field = FIELD_BY_PART_SLOT.get(Number(partSlot));
    if (!field) return null;
    const value = Number(loadout[field]);
    return value > 0 ? value : null;
}

/**
 * @param {object} pool a mysql2/promise-shaped pool.
 * @param {object} opts
 * @param {(msg: string) => void} [opts.log]
 * @param {boolean} [opts.dryRun] compute and print the plan only, no writes.
 * @param {number[]} [opts.accountIds] account ids to process.
 * @param {boolean} [opts.all] process every account that has any item_equips
 *   row, instead of a fixed list. Ignored if accountIds is non-empty.
 * @returns {Promise<{reports: Array<{accountId:number, equipRowsDeleted:number,
 *   serialsDeleted:number, serialsDeletedList:number[]}>}>}
 */
async function runCleanup(pool, opts = {})
{
    const log = opts.log || console.log;
    const dryRun = !!opts.dryRun;
    const all = !!opts.all;
    const accountIds = (opts.accountIds || []).map(Number);

    if (!all && accountIds.length === 0) {
        throw new Error('p1b cleanup: specify accountIds (--account <id>, repeatable) or all (--all)');
    }

    const conn = await pool.getConnection();
    try {
        let targetAccountIds = accountIds;
        if (all) {
            const [rows] = await conn.execute('SELECT DISTINCT account_id FROM item_equips');
            targetAccountIds = rows.map(row => Number(row.account_id));
        }

        if (!dryRun) await conn.beginTransaction();

        const reports = [];
        try {
            for (const accountId of targetAccountIds) {
                const [equipRows] = await conn.execute(
                    'SELECT ie.id AS equip_id, ie.item_id AS serial, ie.mech_slot, ie.part_slot, i.item_id AS catalog_item_id ' +
                    'FROM item_equips ie JOIN items i ON i.id = ie.item_id AND i.account_id = ie.account_id ' +
                    'WHERE ie.account_id = ?',
                    [accountId]
                );

                const matchedEquipIds = new Set();
                const matchedSerials = new Set();
                for (const row of equipRows) {
                    const defaultId = defaultItemIdFor(row.mech_slot, row.part_slot);
                    if (defaultId !== null && Number(row.catalog_item_id) === defaultId) {
                        matchedEquipIds.add(Number(row.equip_id));
                        matchedSerials.add(Number(row.serial));
                    }
                }

                // How many item_equips rows each serial has left once the
                // matched ones are removed -- a serial equipped elsewhere
                // non-default (e.g. a ShareType=1 item also equipped on a
                // second mech) still has a row here and must not be deleted.
                const remainingCountBySerial = new Map();
                for (const row of equipRows) {
                    if (matchedEquipIds.has(Number(row.equip_id))) continue;
                    const serial = Number(row.serial);
                    remainingCountBySerial.set(serial, (remainingCountBySerial.get(serial) || 0) + 1);
                }

                const serialsToDelete = [...matchedSerials].filter(serial => !remainingCountBySerial.has(serial));

                reports.push({
                    accountId,
                    equipRowsDeleted: matchedEquipIds.size,
                    serialsDeleted: serialsToDelete.length,
                    serialsDeletedList: serialsToDelete,
                });
                log(
                    `[P1B cleanup] account=${accountId}: ${matchedEquipIds.size} default item_equips row(s) `
                    + `matched, ${serialsToDelete.length} serial(s) to delete${dryRun ? ' (dry-run, no writes)' : ''}`
                );

                if (dryRun) continue;

                for (const equipId of matchedEquipIds) {
                    await conn.execute('DELETE FROM item_equips WHERE id = ?', [equipId]);
                }
                if (serialsToDelete.length > 0) {
                    const placeholders = serialsToDelete.map(() => '?').join(', ');
                    await conn.execute(
                        `DELETE FROM items WHERE account_id = ? AND id IN (${placeholders})`,
                        [accountId, ...serialsToDelete]
                    );
                }
            }
        } catch (err) {
            if (!dryRun) await conn.rollback();
            throw err;
        }

        if (!dryRun) await conn.commit();
        return { reports };
    } finally {
        conn.release();
    }
}

async function main()
{
    const dryRun = process.argv.includes('--dry-run');
    const all = process.argv.includes('--all');
    const accountIds = [];
    for (let i = 0; i < process.argv.length; i++) {
        if (process.argv[i] === '--account' && process.argv[i + 1]) {
            accountIds.push(Number(process.argv[i + 1]));
        }
    }

    if (!dryRun) {
        if (process.env.ALLOW_REAL_DB_WRITE !== '1') {
            console.error(
                '[P1B cleanup] Refusing to write: set ALLOW_REAL_DB_WRITE=1 only after a high-tier has '
                + 'reviewed this script and you have a fresh, full-database backup (see the comment at the '
                + 'top of this file). Pass --dry-run to only compute and print the plan.'
            );
            process.exitCode = 1;
            return;
        }
        if (process.env.P1B_BACKUP_CONFIRMED !== '1') {
            console.error(
                '[P1B cleanup] Refusing to write: take a full-database backup yourself first, then set '
                + 'P1B_BACKUP_CONFIRMED=1 to confirm you have done so (in addition to ALLOW_REAL_DB_WRITE=1).'
            );
            process.exitCode = 1;
            return;
        }
    }

    if (!all && accountIds.length === 0) {
        console.error('[P1B cleanup] Usage: node tools/p1b-remove-default-items.js --account <id> [--account <id> ...] | --all [--dry-run]');
        process.exitCode = 1;
        return;
    }

    const db = require('../database/db');
    try {
        await runCleanup(db.pool, { dryRun, all, accountIds });
    } finally {
        await db.pool.end();
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('[P1B cleanup] Failed:', err.message);
        process.exitCode = 1;
    });
}

module.exports = { runCleanup, defaultItemIdFor };
