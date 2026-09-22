// docs/backlog.md (round2 mech-select probe), docs/journal/2026-09-22-0748-
// firerate-probe.md: [TEST] 2026-09-22 showed pressing F5 on the mech-select
// screen still resulted in Map_PC04.MOM_a (22100101 = mech_type 1), not the
// mech we asked for. Engine/OptionAll.uc:1008-1012 binds in-battle F1-F5 to
// UseSPPoint_BD 0-4 (SP skills), so 🟡 the working theory is that F-keys do
// nothing on the mech-select screen and the countdown just auto-picks
// whatever sits in mech_licenses slot 0. Slot 0 currently holds mech_type 1
// (MOM_a, machine gun / hitscan); round 2 needs a cannon-class main weapon
// (MTE_a, projectile) to test something hitscan can't
// (docs/research/2026-09-21-netspeed-host-patch/round2-plan.md), and
// mech_type 6 (MTE_a) already sits in slot 5.
//
// This script swaps mech_licenses.mech_type between slot 0 and slot 5 for
// the two test accounts only (mrotest=5, mrotesthost=6), so that IF the
// countdown really does auto-pick slot 0, it now picks the mech_type 6 loadout
// without needing the F-key to do anything. Does not touch license_type, and
// does not touch any other slot, table, or account -- both test accounts keep
// all 8 mechs, just with slot 0 and slot 5 relabelled.
//
// Fully reversible: pass --revert to put mech_type 1 back in slot 0 and
// mech_type 6 back in slot 5. Idempotent in both directions -- re-running
// --apply (or --revert) once the target state is already reached prints a
// notice and writes nothing for that account, it does not swap again.
//
// Refuses to touch anything if a target account's slot 0 / slot 5
// mech_type pair is not exactly one of the two expected states (1/6 or
// 6/1) -- that would mean something else already changed this data and a
// blind swap could produce a mech_type this table has never held before.
//
// TEST ACCOUNTS ONLY. account_id is hardcoded to [5, 6] below and the
// script also checks accounts.username to make sure those ids still mean
// mrotest / mrotesthost before writing anything. Do not repoint this at a
// real player account.
//
// Usage (reads connection settings from database/config.json, same as
// database/db.js -- no password lives in this file):
//   node database/swap-test-mech-slots.js                 # dry run (default): dump + plan, no writes
//   node database/swap-test-mech-slots.js --apply          # apply the slot0<->slot5 swap
//   node database/swap-test-mech-slots.js --revert --apply # undo it
// --revert alone (no --apply) also just dry-runs the revert plan.

const ACCOUNTS = [
    { id: 5, expectedUsername: 'mrotest' },
    { id: 6, expectedUsername: 'mrotesthost' },
];

const FORWARD = { 0: 6, 5: 1 }; // target state: slot 0 -> mech_type 6, slot 5 -> mech_type 1
const REVERSE = { 0: 1, 5: 6 }; // original state: slot 0 -> mech_type 1, slot 5 -> mech_type 6

async function dumpMechLicenses(pool, accountIds, label)
{
    const [rows] = await pool.execute(
        `SELECT account_id, slot, mech_type, license_type FROM mech_licenses
         WHERE account_id IN (${accountIds.map(() => '?').join(',')})
         ORDER BY account_id, slot`,
        accountIds
    );
    console.log(`[swap-test-mech-slots] ${label}:`);
    for (const row of rows) {
        console.log(`  account_id=${row.account_id} slot=${row.slot} mech_type=${row.mech_type} license_type=${row.license_type}`);
    }
    return rows;
}

/**
 * @param {object} pool a mysql2/promise-shaped pool
 * @param {object} [opts]
 * @param {boolean} [opts.apply] actually write (default false = dry run)
 * @param {boolean} [opts.revert] go back to the original 1/6 layout instead of the target 6/1 layout
 * @param {(msg: string) => void} [opts.log]
 */
async function runSwap(pool, opts = {})
{
    const log = opts.log || console.log;
    const apply = !!opts.apply;
    const revert = !!opts.revert;
    const target = revert ? REVERSE : FORWARD;
    const other = revert ? FORWARD : REVERSE;
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
                `[swap-test-mech-slots] Refusing: account_id=${id} has username=${JSON.stringify(actual)}, `
                + `expected ${JSON.stringify(expectedUsername)}. This script only ever touches the test `
                + `accounts by id -- update ACCOUNTS at the top of the file if the ids genuinely changed.`
            );
        }
    }

    await dumpMechLicenses(pool, accountIds, 'before');

    const plan = [];
    for (const { id } of ACCOUNTS) {
        const [rows] = await pool.execute(
            'SELECT slot, mech_type FROM mech_licenses WHERE account_id = ? AND slot IN (0, 5)',
            [id]
        );
        const bySlot = new Map(rows.map(r => [Number(r.slot), Number(r.mech_type)]));
        const slot0 = bySlot.get(0);
        const slot5 = bySlot.get(5);

        const atTarget = slot0 === target[0] && slot5 === target[5];
        const atOther = slot0 === other[0] && slot5 === other[5];

        if (atTarget) {
            log(`[swap-test-mech-slots] account_id=${id}: already at target (slot0=${slot0}, slot5=${slot5}) -- skipping`);
            continue;
        }
        if (!atOther) {
            throw new Error(
                `[swap-test-mech-slots] Refusing: account_id=${id} has slot0=${slot0}, slot5=${slot5}, `
                + `which is neither the expected 1/6 nor 6/1 pairing. Not swapping blindly -- inspect by hand.`
            );
        }
        plan.push({ id, slot0From: slot0, slot0To: target[0], slot5From: slot5, slot5To: target[5] });
    }

    if (plan.length === 0) {
        log('[swap-test-mech-slots] Nothing to do -- every target account is already at the target state.');
        return { plan, applied: false };
    }

    for (const step of plan) {
        log(`[swap-test-mech-slots] plan: account_id=${step.id} slot0 ${step.slot0From}->${step.slot0To}, slot5 ${step.slot5From}->${step.slot5To}`);
    }

    if (!apply) {
        log('[swap-test-mech-slots] Dry run only (pass --apply to write). No changes made.');
        return { plan, applied: false };
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        for (const step of plan) {
            await conn.execute(
                'UPDATE mech_licenses SET mech_type = ? WHERE account_id = ? AND slot = 0',
                [step.slot0To, step.id]
            );
            await conn.execute(
                'UPDATE mech_licenses SET mech_type = ? WHERE account_id = ? AND slot = 5',
                [step.slot5To, step.id]
            );
        }
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    await dumpMechLicenses(pool, accountIds, 'after');
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
        console.error('[swap-test-mech-slots] Failed:', err.message);
        process.exitCode = 1;
    });
}

module.exports = { runSwap, dumpMechLicenses, ACCOUNTS, FORWARD, REVERSE };
