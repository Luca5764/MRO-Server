// docs/journal/2026-09-22-0748-firerate-probe.md, docs/backlog.md (round2
// mech-select probe): pressing F2/F3/F4/F5 on the mech-select screen keeps
// resulting in Map_PC04.MOM_a (22100101, mech_type 1) -- F-keys do not pick
// a mech there (Engine/OptionAll.uc:1008-1012 shows in-battle F1-F5 are
// bound to UseSPPoint_BD 0-4, SP skills, not mech select). Swapping
// mech_licenses slot 0 <-> slot 5 (database/swap-test-mech-slots.js) did NOT
// change which mech gets auto-picked either -- it's still always
// mech_type 1, cause still 🟡 unknown. So instead of continuing to fight
// "how do we pick a different mech", this script re-equips mech_type 1
// itself: round 2 needs a cannon-class / projectile main weapon
// (25300101, Zweapon.MTE_a) to test something a hitscan machine gun
// (22100101, Map_PC04.MOM_a) can't. See
// docs/research/2026-09-21-netspeed-host-patch/round2-plan.md.
//
// Only touches the ONE items row where
// account_id IN (5,6) AND mech_type=1 AND part_slot=1 AND equipped=1
// (the equipped main weapon on the auto-picked mech). Does not touch any
// other mech_type, part_slot, item_equips, mech_licenses, or accounts row.
//
// Fully reversible: pass --revert to put 22100101 back. Idempotent in both
// directions -- if an account's target item_id is already reached,
// --apply (or --revert) prints a notice and writes nothing for that
// account.
//
// Refuses to touch anything if a target account's row is not exactly
// FROM_ID (22100101) or TO_ID (25300101) -- that would mean something else
// already changed this item and a blind overwrite could stomp on it.
//
// TEST ACCOUNTS ONLY. account_id is hardcoded to [5, 6] below and the
// script also checks accounts.username to make sure those ids still mean
// mrotest / mrotesthost before writing anything. Do not repoint this at a
// real player account.
//
// mech_type 1 (Small/light frame) has never been tested with a
// cannon-class main weapon before -- client-side mech/weapon compatibility
// filtering is real (dispatch/room.dispatch.js:114, G6d: "the client owns
// mech/item compatibility filtering") but has only ever been characterized
// for the shop list, not for what happens when an incompatible weapon is
// already equipped and loaded into a match. This script does not attempt
// to predict or guard against that -- if the client rejects/misrenders/
// crashes on this loadout, that is itself a result to record, not a bug in
// this script.
//
// Usage (reads connection settings from database/config.json, same as
// database/db.js -- no password lives in this file):
//   node database/swap-test-mech1-weapon.js                 # dry run (default): dump + plan, no writes
//   node database/swap-test-mech1-weapon.js --apply          # apply 22100101 -> 25300101
//   node database/swap-test-mech1-weapon.js --revert --apply # undo it (25300101 -> 22100101)
// --revert alone (no --apply) also just dry-runs the revert plan.

const ACCOUNTS = [
    { id: 5, expectedUsername: 'mrotest' },
    { id: 6, expectedUsername: 'mrotesthost' },
];

const FROM_ID = 22100101; // Map_PC04.MOM_a, machine gun / hitscan
const TO_ID = 25300101;   // Zweapon.MTE_a, cannon / projectile

async function dumpMainWeapons(pool, accountIds, label)
{
    const [rows] = await pool.execute(
        `SELECT id, account_id, item_id, slot, mech_type, part_slot, equipped FROM items
         WHERE account_id IN (${accountIds.map(() => '?').join(',')}) AND mech_type = 1 AND part_slot = 1
         ORDER BY account_id`,
        accountIds
    );
    console.log(`[swap-test-mech1-weapon] ${label}:`);
    for (const row of rows) {
        console.log(`  id=${row.id} account_id=${row.account_id} item_id=${row.item_id} slot=${row.slot} mech_type=${row.mech_type} part_slot=${row.part_slot} equipped=${row.equipped}`);
    }
    return rows;
}

/**
 * @param {object} pool a mysql2/promise-shaped pool
 * @param {object} [opts]
 * @param {boolean} [opts.apply] actually write (default false = dry run)
 * @param {boolean} [opts.revert] go back to 22100101 instead of forward to 25300101
 * @param {(msg: string) => void} [opts.log]
 */
async function runSwap(pool, opts = {})
{
    const log = opts.log || console.log;
    const apply = !!opts.apply;
    const revert = !!opts.revert;
    const targetId = revert ? FROM_ID : TO_ID;
    const otherId = revert ? TO_ID : FROM_ID;
    const accountIds = ACCOUNTS.map(a => a.id);

    // Verify the hardcoded account ids still mean what this script assumes
    // before touching anything.
    const [accountRows] = await pool.execute(
        `SELECT id, username FROM accounts WHERE id IN (${accountIds.map(() => '?').join(',')})`,
        accountIds
    );
    const byId = new Map(accountRows.map(r => [Number(r.id), r.username]));
    for (const { id, expectedUsername } of ACCOUNTS) {
        const actual = byId.get(id);
        if (actual !== expectedUsername) {
            throw new Error(
                `[swap-test-mech1-weapon] Refusing: account_id=${id} has username=${JSON.stringify(actual)}, `
                + `expected ${JSON.stringify(expectedUsername)}. This script only ever touches the test `
                + `accounts by id -- update ACCOUNTS at the top of the file if the ids genuinely changed.`
            );
        }
    }

    await dumpMainWeapons(pool, accountIds, 'before');

    const plan = [];
    for (const { id } of ACCOUNTS) {
        const [rows] = await pool.execute(
            'SELECT id, item_id FROM items WHERE account_id = ? AND mech_type = 1 AND part_slot = 1 AND equipped = 1',
            [id]
        );
        if (rows.length !== 1) {
            throw new Error(
                `[swap-test-mech1-weapon] Refusing: account_id=${id} has ${rows.length} rows matching `
                + `mech_type=1 AND part_slot=1 AND equipped=1 (expected exactly 1). Inspect by hand.`
            );
        }
        const row = rows[0];
        const current = Number(row.item_id);

        if (current === targetId) {
            log(`[swap-test-mech1-weapon] account_id=${id}: already at target (item_id=${current}) -- skipping`);
            continue;
        }
        if (current !== otherId) {
            throw new Error(
                `[swap-test-mech1-weapon] Refusing: account_id=${id} mech_type=1/part_slot=1 item_id=${current}, `
                + `which is neither the expected ${FROM_ID} nor ${TO_ID}. Not overwriting blindly -- inspect by hand.`
            );
        }
        plan.push({ id, rowId: row.id, from: current, to: targetId });
    }

    if (plan.length === 0) {
        log('[swap-test-mech1-weapon] Nothing to do -- every target account is already at the target state.');
        return { plan, applied: false };
    }

    for (const step of plan) {
        log(`[swap-test-mech1-weapon] plan: account_id=${step.id} items.id=${step.rowId} item_id ${step.from}->${step.to}`);
    }

    if (!apply) {
        log('[swap-test-mech1-weapon] Dry run only (pass --apply to write). No changes made.');
        return { plan, applied: false };
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        for (const step of plan) {
            await conn.execute(
                'UPDATE items SET item_id = ? WHERE id = ?',
                [step.to, step.rowId]
            );
        }
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    await dumpMainWeapons(pool, accountIds, 'after');
    return { plan, applied: true };
}

async function main()
{
    const apply = process.argv.includes('--apply');
    const revert = process.argv.includes('--revert');

    const db = require('./db');
    try {
        await runSwap(db.pool, { apply, revert });
    } finally {
        await db.pool.end();
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('[swap-test-mech1-weapon] Failed:', err.message);
        process.exitCode = 1;
    });
}

module.exports = { runSwap, dumpMainWeapons, ACCOUNTS, FROM_ID, TO_ID };
