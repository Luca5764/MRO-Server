// LEGEND-GRANT-IMPL (docs/backlog.md, docs/research/2026-09-19-legend-grant/
// notes.md): grants the 8 time-limited "legend" mech bodies to specific
// accounts, at the operator's request (own accounts only).
//
// Legend-body <- prototype-body mapping (docs/research/2026-09-19-legend-
// grant/notes.md; 🟡 [CACHE][SRC] static analysis, docs/state.md row on
// 11100101/11200101 -- not yet confirmed against a live client). Each
// mech's prototype ("base") body id is database/default-loadouts.js's
// CANONICAL_LOADOUTS[mech].body, the single source of truth this codebase
// already uses for default loadouts -- not a second hand-copied list.
//   mech 1: 11100101 -> 11200101 RAVEN
//   mech 2: 12100101 -> 12200101 CRUAL MASSACRE
//   mech 3: 13100101 -> 13200101 VALKYRIE
//   mech 4: 14200101 -> 14300101 PHANTOM
//   mech 5: 15200101 -> 15300101 ZODIAC
//   mech 6: 16200101 -> 16300101 ROXANNE
//   mech 7: 17100101 -> 17200101 FENRIS
//   mech 8: 18100101 -> 18200101 SPECTOR
//
// DO NOT RUN THIS AGAINST THE REAL DATABASE without a high-tier review and a
// fresh, full-database backup first (see docs/backlog.md / AGENTS.md 協作與
// 紀錄規則). The exported grantLegendMechs() itself performs no gating; only
// main() (the CLI entrypoint below) does, so a --dry-run call from a test or
// a SELECT-only investigation can call grantLegendMechs(pool, { dryRun: true,
// ... }) directly without ever writing.
//
// Rule (per account, per legend body):
//   - skip (report 'no-license') if the account has no mech_licenses row for
//     that mech_type;
//   - skip (report 'no-base-body') if the account has no items row for that
//     mech's prototype body item_id (Mech_License_Check gates the *slot*,
//     not this specific body -- the notes above flag this as unresolved,
//     hence the belt-and-suspenders check here);
//   - skip (report 'already-owned') if the account already has an items row
//     for the legend item_id itself;
//   - otherwise insert one items row: equipped=0, slot=0, part_slot=0,
//     mech_type=that mech, quantity=1 -- same column set as
//     createAccount()/handleShopPurchase()'s inserts in database/db.js and
//     dispatch/room.dispatch.js. No item_equips row (E1/ITEM_EQUIPS_MODE):
//     the player equips it themselves in the hangar, same as any other
//     unequipped purchased item.
// Idempotent: rerunning finds every legend id already owned and grants
// nothing new.
//
// Usage (once a high-tier has reviewed this, taken a full-DB backup, and set
// both env vars below):
//   ALLOW_REAL_DB_WRITE=1 LEGEND_BACKUP_CONFIRMED=1 node tools/grant-legend-mechs.js --account 4 [--account 7]
//   node tools/grant-legend-mechs.js --account 4 --dry-run

const { CANONICAL_LOADOUTS } = require('../database/default-loadouts');

// mech_type (1..8) -> legend item_id, paired with CANONICAL_LOADOUTS[mech].body
// as the prototype/base body id.
const LEGEND_BODY_BY_MECH = {
    1: 11200101, // RAVEN
    2: 12200101, // CRUAL MASSACRE
    3: 13200101, // VALKYRIE
    4: 14300101, // PHANTOM
    5: 15300101, // ZODIAC
    6: 16300101, // ROXANNE
    7: 17200101, // FENRIS
    8: 18200101, // SPECTOR
};

function baseBodyForMech(mechType)
{
    const loadout = CANONICAL_LOADOUTS[Number(mechType)];
    return loadout ? Number(loadout.body) : null;
}

/**
 * @param {object} pool a mysql2/promise-shaped pool.
 * @param {object} opts
 * @param {(msg: string) => void} [opts.log]
 * @param {boolean} [opts.dryRun] compute and print the plan only, no writes.
 * @param {number[]} opts.accountIds account ids to process.
 * @returns {Promise<{reports: Array<{accountId:number, granted:number[],
 *   grantedList:Array<{mechType:number, itemId:number}>,
 *   skipped:Array<{mechType:number, itemId:number, reason:string}>}>}>}
 */
async function grantLegendMechs(pool, opts = {})
{
    const log = opts.log || console.log;
    const dryRun = !!opts.dryRun;
    const accountIds = (opts.accountIds || []).map(Number);

    if (accountIds.length === 0) {
        throw new Error('grant-legend-mechs: specify accountIds (--account <id>, repeatable)');
    }

    const conn = await pool.getConnection();
    try {
        if (!dryRun) await conn.beginTransaction();

        const reports = [];
        try {
            for (const accountId of accountIds) {
                const [licenseRows] = await conn.execute(
                    'SELECT mech_type FROM mech_licenses WHERE account_id = ?',
                    [accountId]
                );
                const licensedMechTypes = new Set(licenseRows.map(row => Number(row.mech_type)));

                const [ownedRows] = await conn.execute(
                    'SELECT item_id FROM items WHERE account_id = ?',
                    [accountId]
                );
                const ownedItemIds = new Set(ownedRows.map(row => Number(row.item_id)));

                const grantedList = [];
                const skipped = [];

                for (const mechType of Object.keys(LEGEND_BODY_BY_MECH).map(Number).sort((a, b) => a - b)) {
                    const legendItemId = LEGEND_BODY_BY_MECH[mechType];
                    const baseBodyId = baseBodyForMech(mechType);

                    if (!licensedMechTypes.has(mechType)) {
                        skipped.push({ mechType, itemId: legendItemId, reason: 'no-license' });
                        continue;
                    }
                    if (baseBodyId === null || !ownedItemIds.has(baseBodyId)) {
                        skipped.push({ mechType, itemId: legendItemId, reason: 'no-base-body' });
                        continue;
                    }
                    if (ownedItemIds.has(legendItemId)) {
                        skipped.push({ mechType, itemId: legendItemId, reason: 'already-owned' });
                        continue;
                    }

                    grantedList.push({ mechType, itemId: legendItemId });
                    if (!dryRun) {
                        await conn.execute(
                            'INSERT INTO items (account_id, item_id, slot, mech_type, part_slot, quantity, equipped) VALUES (?, ?, ?, ?, ?, 1, 0)',
                            [accountId, legendItemId, 0, mechType, 0]
                        );
                        // Reflect the just-inserted row so a later mech in
                        // this same loop (or a later account) can't see it
                        // as still-missing / double-grant it.
                        ownedItemIds.add(legendItemId);
                    }
                }

                reports.push({ accountId, grantedList, skipped });
                log(
                    `[Legend grant] account=${accountId}: ${grantedList.length} legend body/bodies granted `
                    + `(${grantedList.map(g => g.itemId).join(', ') || 'none'}), ${skipped.length} skipped`
                    + `${dryRun ? ' (dry-run, no writes)' : ''}`
                );
                for (const s of skipped) {
                    log(`[Legend grant]   skip mech=${s.mechType} item=${s.itemId} reason=${s.reason}`);
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
    const accountIds = [];
    for (let i = 0; i < process.argv.length; i++) {
        if (process.argv[i] === '--account' && process.argv[i + 1]) {
            accountIds.push(Number(process.argv[i + 1]));
        }
    }

    if (!dryRun) {
        if (process.env.ALLOW_REAL_DB_WRITE !== '1') {
            console.error(
                '[Legend grant] Refusing to write: set ALLOW_REAL_DB_WRITE=1 only after a high-tier has '
                + 'reviewed this script and you have a fresh, full-database backup (see the comment at the '
                + 'top of this file). Pass --dry-run to only compute and print the plan.'
            );
            process.exitCode = 1;
            return;
        }
        if (process.env.LEGEND_BACKUP_CONFIRMED !== '1') {
            console.error(
                '[Legend grant] Refusing to write: take a full-database backup yourself first, then set '
                + 'LEGEND_BACKUP_CONFIRMED=1 to confirm you have done so (in addition to ALLOW_REAL_DB_WRITE=1).'
            );
            process.exitCode = 1;
            return;
        }
    }

    if (accountIds.length === 0) {
        console.error('[Legend grant] Usage: node tools/grant-legend-mechs.js --account <id> [--account <id> ...] [--dry-run]');
        process.exitCode = 1;
        return;
    }

    const db = require('../database/db');
    try {
        await grantLegendMechs(db.pool, { dryRun, accountIds });
    } finally {
        await db.pool.end();
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('[Legend grant] Failed:', err.message);
        process.exitCode = 1;
    });
}

module.exports = { grantLegendMechs, LEGEND_BODY_BY_MECH, baseBodyForMech };
