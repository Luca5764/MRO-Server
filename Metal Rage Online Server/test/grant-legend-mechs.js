'use strict';

// LEGEND-GRANT-IMPL (docs/backlog.md, docs/research/2026-09-19-legend-grant/
// notes.md): proves tools/grant-legend-mechs.js's grantLegendMechs() against
// an in-memory mock pool, never the real DB. Same mock-pool technique as
// test/p1b-default-items.js.
//
//   1. an account with all 8 licenses and all 8 base bodies gets all 8
//      legend bodies inserted (equipped=0, part_slot=0, mech_type=1..8);
//   2. rerunning is a no-op (idempotent) -- every legend id is already owned;
//   3. an account missing mech 3's license and missing mech 5's base body
//      skips those two (reasons reported), still grants the rest;
//   4. an account that already owns one legend id (e.g. bought/granted
//      earlier) skips just that one, reason 'already-owned';
//   5. --dry-run computes the plan without writing anything.
//
// Run: node test/grant-legend-mechs.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { grantLegendMechs, LEGEND_BODY_BY_MECH } = require(path.join(ROOT, 'tools', 'grant-legend-mechs.js'));
const { CANONICAL_LOADOUTS } = require(path.join(ROOT, 'database', 'default-loadouts.js'));

function clone(rows) { return JSON.parse(JSON.stringify(rows)); }

// ---------------------------------------------------------------------
// In-memory mock pool covering every SQL statement grantLegendMechs() issues.
// Same real-transaction-snapshot approach as test/p1b-default-items.js's
// makeMockPool.
// ---------------------------------------------------------------------
function makeMockPool(state)
{
    let nextItemId = state._nextItemId || 200001;

    async function execute(sql, params = [])
    {
        const norm = sql.replace(/\s+/g, ' ').trim();

        if (norm.startsWith('SELECT mech_type FROM mech_licenses WHERE account_id = ?')) {
            const [accountId] = params;
            const rows = state.mechLicenses.filter(l => Number(l.account_id) === Number(accountId));
            return [rows.map(l => ({ mech_type: l.mech_type }))];
        }
        if (norm.startsWith('SELECT item_id FROM items WHERE account_id = ?')) {
            const [accountId] = params;
            const rows = state.items.filter(i => Number(i.account_id) === Number(accountId));
            return [rows.map(i => ({ item_id: i.item_id }))];
        }
        if (norm.startsWith('INSERT INTO items (account_id, item_id, slot, mech_type, part_slot, quantity, equipped) VALUES')) {
            const [accountId, itemId, slot, mechType, partSlot] = params;
            const id = nextItemId++;
            state.items.push({
                id, account_id: Number(accountId), item_id: Number(itemId),
                slot: Number(slot), mech_type: Number(mechType), part_slot: Number(partSlot),
                quantity: 1, equipped: 0,
            });
            return [{ insertId: id }];
        }

        throw new Error(`grant-legend-mechs test mock pool: unmocked SQL: ${norm}`);
    }

    return {
        async getConnection()
        {
            let snapshot = null;
            return {
                async beginTransaction()
                {
                    snapshot = { items: clone(state.items) };
                },
                async commit() { snapshot = null; },
                async rollback()
                {
                    if (snapshot) {
                        state.items.length = 0; state.items.push(...snapshot.items);
                    }
                    snapshot = null;
                },
                release() {},
                execute,
            };
        },
    };
}

// ---------------------------------------------------------------------
// Shared seed: account 4, all 8 mech_licenses and all 8 CANONICAL_LOADOUTS
// base bodies owned (equipped, as createAccount() would leave them).
// ---------------------------------------------------------------------
function makeFullyEligibleState(accountId)
{
    const mechLicenses = [];
    const items = [];
    let itemId = 100001;
    for (let mechType = 1; mechType <= 8; mechType++) {
        mechLicenses.push({ account_id: accountId, slot: mechType - 1, mech_type: mechType, license_type: 1 });
        items.push({
            id: itemId++, account_id: accountId, item_id: CANONICAL_LOADOUTS[mechType].body,
            slot: 0, mech_type: mechType, part_slot: 0, quantity: 1, equipped: 1,
        });
    }
    return { items, mechLicenses, _nextItemId: itemId + 100000 };
}

async function testGrantsAllEightForFullyEligibleAccount()
{
    const state = makeFullyEligibleState(4);
    const pool = makeMockPool(state);
    const silent = () => {};

    const result = await grantLegendMechs(pool, { log: silent, accountIds: [4] });
    const report = result.reports.find(r => r.accountId === 4);
    assert.ok(report, 'expected a report for account 4');
    assert.strictEqual(report.grantedList.length, 8, `expected 8 legend bodies granted, got ${report.grantedList.length}`);
    assert.strictEqual(report.skipped.length, 0, `expected 0 skipped, got ${report.skipped.length}`);

    const grantedIds = report.grantedList.map(g => g.itemId).sort((a, b) => a - b);
    const expectedIds = Object.values(LEGEND_BODY_BY_MECH).sort((a, b) => a - b);
    assert.deepStrictEqual(grantedIds, expectedIds, 'granted item_ids must be exactly the 8 legend bodies');

    for (const g of report.grantedList) {
        const row = state.items.find(i => Number(i.account_id) === 4 && Number(i.item_id) === g.itemId);
        assert.ok(row, `expected an items row for legend id ${g.itemId}`);
        assert.strictEqual(row.equipped, 0, `legend row ${g.itemId} must be equipped=0`);
        assert.strictEqual(row.part_slot, 0, `legend row ${g.itemId} must be part_slot=0`);
        assert.strictEqual(row.slot, 0, `legend row ${g.itemId} must be slot=0`);
        assert.strictEqual(row.mech_type, g.mechType, `legend row ${g.itemId} must have mech_type=${g.mechType}`);
    }

    console.log('[grant-legend-mechs test] PASS: fully eligible account gets all 8 legend bodies (equipped=0, part_slot=0)');
    return state;
}

async function testRerunIsIdempotent(state)
{
    const pool = makeMockPool(state);
    const silent = () => {};
    const itemsBefore = state.items.length;

    const result = await grantLegendMechs(pool, { log: silent, accountIds: [4] });
    const report = result.reports.find(r => r.accountId === 4);
    assert.strictEqual(report.grantedList.length, 0, `rerun should grant nothing, got ${report.grantedList.length}`);
    assert.strictEqual(report.skipped.length, 8, `rerun should skip all 8 as already-owned, got ${report.skipped.length}`);
    assert.ok(report.skipped.every(s => s.reason === 'already-owned'), 'every rerun skip reason should be already-owned');
    assert.strictEqual(state.items.length, itemsBefore, 'rerun must not add any items rows');

    console.log('[grant-legend-mechs test] PASS: rerunning is a no-op (idempotent)');
}

async function testSkipsMissingLicenseAndMissingBaseBody()
{
    const state = makeFullyEligibleState(7);
    // Remove mech 3's license entirely.
    state.mechLicenses = state.mechLicenses.filter(l => !(Number(l.account_id) === 7 && Number(l.mech_type) === 3));
    // Remove mech 5's base body (15200101).
    state.items = state.items.filter(i => !(Number(i.account_id) === 7 && Number(i.mech_type) === 5 && Number(i.part_slot) === 0));

    const pool = makeMockPool(state);
    const silent = () => {};
    const result = await grantLegendMechs(pool, { log: silent, accountIds: [7] });
    const report = result.reports.find(r => r.accountId === 7);

    assert.strictEqual(report.grantedList.length, 6, `expected 6 granted (8 minus mech 3 and mech 5), got ${report.grantedList.length}`);
    assert.strictEqual(report.skipped.length, 2, `expected 2 skipped, got ${report.skipped.length}`);

    const mech3Skip = report.skipped.find(s => s.mechType === 3);
    const mech5Skip = report.skipped.find(s => s.mechType === 5);
    assert.ok(mech3Skip, 'expected mech 3 to be skipped');
    assert.strictEqual(mech3Skip.reason, 'no-license', `mech 3 skip reason should be no-license, got ${mech3Skip.reason}`);
    assert.ok(mech5Skip, 'expected mech 5 to be skipped');
    assert.strictEqual(mech5Skip.reason, 'no-base-body', `mech 5 skip reason should be no-base-body, got ${mech5Skip.reason}`);

    assert.strictEqual(
        state.items.filter(i => Number(i.account_id) === 7 && Number(i.item_id) === LEGEND_BODY_BY_MECH[3]).length, 0,
        'mech 3 legend body must not have been inserted'
    );
    assert.strictEqual(
        state.items.filter(i => Number(i.account_id) === 7 && Number(i.item_id) === LEGEND_BODY_BY_MECH[5]).length, 0,
        'mech 5 legend body must not have been inserted'
    );

    console.log('[grant-legend-mechs test] PASS: missing license and missing base body are skipped with distinct reasons');
}

async function testSkipsAlreadyOwnedLegendId()
{
    const state = makeFullyEligibleState(9);
    // Account 9 already owns mech 2's legend body somehow (e.g. granted earlier
    // by hand, or a previous partial run).
    state.items.push({
        id: 999001, account_id: 9, item_id: LEGEND_BODY_BY_MECH[2],
        slot: 0, mech_type: 2, part_slot: 0, quantity: 1, equipped: 0,
    });

    const pool = makeMockPool(state);
    const silent = () => {};
    const result = await grantLegendMechs(pool, { log: silent, accountIds: [9] });
    const report = result.reports.find(r => r.accountId === 9);

    assert.strictEqual(report.grantedList.length, 7, `expected 7 granted, got ${report.grantedList.length}`);
    assert.strictEqual(report.skipped.length, 1, `expected 1 skipped, got ${report.skipped.length}`);
    assert.strictEqual(report.skipped[0].mechType, 2, 'the one skip should be mech 2');
    assert.strictEqual(report.skipped[0].reason, 'already-owned', `expected reason already-owned, got ${report.skipped[0].reason}`);

    const mech2Rows = state.items.filter(i => Number(i.account_id) === 9 && Number(i.item_id) === LEGEND_BODY_BY_MECH[2]);
    assert.strictEqual(mech2Rows.length, 1, 'must not have inserted a second row for the already-owned legend id');

    console.log('[grant-legend-mechs test] PASS: an already-owned legend id is skipped, no duplicate row');
}

async function testDryRunMakesNoChanges()
{
    const state = makeFullyEligibleState(11);
    const pool = makeMockPool(state);
    const silent = () => {};
    const itemsBefore = state.items.length;

    const result = await grantLegendMechs(pool, { log: silent, accountIds: [11], dryRun: true });
    const report = result.reports.find(r => r.accountId === 11);
    assert.strictEqual(report.grantedList.length, 8, 'dry-run should still compute the would-grant count');
    assert.strictEqual(state.items.length, itemsBefore, 'dry-run must not add any items rows');

    console.log('[grant-legend-mechs test] PASS: --dry-run computes the plan without writing anything');
}

async function main()
{
    const stateAfterGrant = await testGrantsAllEightForFullyEligibleAccount();
    await testRerunIsIdempotent(stateAfterGrant);
    await testSkipsMissingLicenseAndMissingBaseBody();
    await testSkipsAlreadyOwnedLegendId();
    await testDryRunMakesNoChanges();
    console.log('[grant-legend-mechs test] ALL CHECKS PASS');
    process.exit(0);
}

main().catch(err => {
    console.error('[grant-legend-mechs test] FAIL:', err);
    process.exit(1);
});
