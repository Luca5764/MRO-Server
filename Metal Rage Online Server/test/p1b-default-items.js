'use strict';

// P1B-IMPL (docs/backlog.md P1b): proves the P1B_NO_DEFAULT_ITEMS switch and
// tools/p1b-remove-default-items.js without touching the real DB.
//
//   1. database/db.js's real createAccount(), with P1B_NO_DEFAULT_ITEMS
//      'enabled', inserts zero `items`/`item_equips` rows.
//   2. tools/p1b-remove-default-items.js's runCleanup() on a seeded account
//      removes default-matching item_equips rows and the now-orphaned
//      items serials, but keeps a purchased extra copy (never equipped) and
//      a serial that is also equipped non-default on another mech.
//   3. a second runCleanup() call is a no-op (idempotent).
//   4. database/db.js's real saveEquippedLoadout() (what the 0x00240107
//      Slot_Change_CQ handler calls) with a 0 serial for one part removes
//      only that part's item_equips row, without throwing.
//
// database/db.js's real functions are exercised directly, same technique as
// test/item-equips.js: its own `pool` is monkey-patched with an in-memory
// mock connection -- never database/config.json's real MySQL.
//
// Run: node test/p1b-default-items.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));

function clone(rows) { return JSON.parse(JSON.stringify(rows)); }

// ---------------------------------------------------------------------
// In-memory mock pool covering every SQL statement createAccount(),
// saveEquippedLoadout() and tools/p1b-remove-default-items.js's runCleanup()
// issue. Same real-transaction-snapshot approach as test/item-equips.js's
// makeMockPool.
// ---------------------------------------------------------------------
function makeMockPool(state)
{
    let nextAccountId = state._nextAccountId || 1;
    let nextItemId = state._nextItemId || 100001;
    let nextEquipId = state._nextEquipId || 1;

    async function execute(sql, params = [])
    {
        const norm = sql.replace(/\s+/g, ' ').trim();

        if (norm.startsWith('INSERT INTO accounts')) {
            const id = nextAccountId++;
            state.accounts.push({ id, username: params[0], nickname: params[1], pilot: params[2] });
            return [{ insertId: id }];
        }
        if (norm.startsWith('INSERT INTO records')) return [{ insertId: 0 }];
        if (norm.startsWith('INSERT INTO mech_levels')) return [{ insertId: 0 }];
        if (norm.startsWith('INSERT INTO mech_licenses')) return [{ insertId: 0 }];
        if (norm.startsWith('INSERT INTO maps')) return [{ insertId: 0 }];
        if (norm.startsWith('INSERT INTO tutorials')) return [{ insertId: 0 }];

        if (norm.startsWith('INSERT INTO items (account_id, item_id, slot, mech_type, part_slot, quantity, equipped) VALUES')) {
            const [accountId, itemId, slot, mechType, partSlot] = params;
            const id = nextItemId++;
            state.items.push({
                id, account_id: Number(accountId), item_id: Number(itemId),
                slot: Number(slot), mech_type: Number(mechType), part_slot: Number(partSlot),
                quantity: 1, equipped: 1,
            });
            return [{ insertId: id }];
        }
        if (norm.startsWith('INSERT INTO item_equips (account_id, item_id, mech_slot, part_slot) VALUES')) {
            const [accountId, itemId, mechSlot, partSlot] = params;
            const id = nextEquipId++;
            state.itemEquips.push({ id, account_id: Number(accountId), item_id: Number(itemId), mech_slot: Number(mechSlot), part_slot: Number(partSlot) });
            return [{ insertId: id, affectedRows: 1 }];
        }

        // saveEquippedLoadout() (ITEM_EQUIPS_MODE 'enabled' path).
        if (norm.startsWith('SELECT id, item_id FROM items WHERE account_id = ? AND id IN')) {
            const accountId = params[0];
            const ids = params.slice(1).map(Number);
            const rows = state.items.filter(item => Number(item.account_id) === Number(accountId) && ids.includes(Number(item.id)));
            return [rows.map(r => ({ id: r.id, item_id: r.item_id }))];
        }
        if (norm.startsWith('DELETE FROM item_equips WHERE account_id = ? AND mech_slot = ?')) {
            const [accountId, mechSlot] = params;
            state.itemEquips = state.itemEquips.filter(e =>
                !(Number(e.account_id) === Number(accountId) && Number(e.mech_slot) === Number(mechSlot))
            );
            return [{ affectedRows: 0 }];
        }
        if (norm.startsWith('DELETE FROM item_equips WHERE account_id = ? AND item_id = ?')) {
            const [accountId, itemId] = params;
            state.itemEquips = state.itemEquips.filter(e =>
                !(Number(e.account_id) === Number(accountId) && Number(e.item_id) === Number(itemId))
            );
            return [{ affectedRows: 0 }];
        }

        // tools/p1b-remove-default-items.js's runCleanup().
        if (norm.startsWith('SELECT DISTINCT account_id FROM item_equips')) {
            const ids = [...new Set(state.itemEquips.map(e => Number(e.account_id)))];
            return [ids.map(id => ({ account_id: id }))];
        }
        if (norm.startsWith('SELECT ie.id AS equip_id, ie.item_id AS serial, ie.mech_slot, ie.part_slot, i.item_id AS catalog_item_id')) {
            const [accountId] = params;
            const byId = new Map(state.items.map(item => [Number(item.id), item]));
            const rows = state.itemEquips
                .filter(e => Number(e.account_id) === Number(accountId))
                .map(e => {
                    const item = byId.get(Number(e.item_id));
                    return {
                        equip_id: e.id, serial: e.item_id, mech_slot: e.mech_slot, part_slot: e.part_slot,
                        catalog_item_id: item ? item.item_id : null,
                    };
                })
                .filter(row => row.catalog_item_id !== null); // INNER JOIN semantics
            return [rows];
        }
        if (norm.startsWith('DELETE FROM item_equips WHERE id = ?')) {
            const [equipId] = params;
            const before = state.itemEquips.length;
            state.itemEquips = state.itemEquips.filter(e => Number(e.id) !== Number(equipId));
            return [{ affectedRows: before - state.itemEquips.length }];
        }
        if (norm.startsWith('DELETE FROM items WHERE account_id = ? AND id IN')) {
            const accountId = params[0];
            const ids = params.slice(1).map(Number);
            const before = state.items.length;
            state.items = state.items.filter(item => !(Number(item.account_id) === Number(accountId) && ids.includes(Number(item.id))));
            return [{ affectedRows: before - state.items.length }];
        }

        throw new Error(`p1b test mock pool: unmocked SQL: ${norm}`);
    }

    return {
        async getConnection()
        {
            let snapshot = null;
            return {
                async beginTransaction()
                {
                    snapshot = { accounts: clone(state.accounts), items: clone(state.items), itemEquips: clone(state.itemEquips) };
                },
                async commit() { snapshot = null; },
                async rollback()
                {
                    if (snapshot) {
                        state.accounts.length = 0; state.accounts.push(...snapshot.accounts);
                        state.items.length = 0; state.items.push(...snapshot.items);
                        state.itemEquips.length = 0; state.itemEquips.push(...snapshot.itemEquips);
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
// Test 1: P1B_NO_DEFAULT_ITEMS 'enabled' -> createAccount() inserts zero
// items/item_equips rows.
// ---------------------------------------------------------------------
async function testNewAccountOwnsZeroDefaultItems()
{
    delete require.cache[DB_PATH];
    const db = require(DB_PATH);
    const originalGetConnection = db.pool.getConnection;
    try {
        const state = { accounts: [], items: [], itemEquips: [] };
        db.pool.getConnection = makeMockPool(state).getConnection;
        db._setItemEquipsModeForTests('enabled');
        db._setP1bNoDefaultItemsForTests('enabled');

        const accountId = await db.createAccount('p1btest', 'P1BTest', 101);

        const ownedItems = state.items.filter(item => Number(item.account_id) === Number(accountId));
        const ownedEquips = state.itemEquips.filter(e => Number(e.account_id) === Number(accountId));
        assert.strictEqual(ownedItems.length, 0, `expected 0 owned items, got ${ownedItems.length}`);
        assert.strictEqual(ownedEquips.length, 0, `expected 0 item_equips rows, got ${ownedEquips.length}`);

        console.log('[p1b-default-items test] PASS: P1B_NO_DEFAULT_ITEMS enabled -> new account owns 0 default items');
    } finally {
        db._setItemEquipsModeForTests('disabled');
        db._setP1bNoDefaultItemsForTests('disabled');
        db.pool.getConnection = originalGetConnection;
    }
}

// ---------------------------------------------------------------------
// Shared seed for the cleanup tests: account 4, mech 1's default body/main/
// left/booster all issued as real equipped items+item_equips rows (the P1B
// bug), plus:
//   - serial 100005: another copy of mech 1's default booster (41100101),
//     bought but never equipped -- no item_equips row at all. Must survive.
//   - serial 100004: mech 1's default booster item_id (41100101) equipped
//     on mech 1 (default match) AND on mech 6's booster slot too, where
//     41100101 is NOT mech 6's default (43100101). The mech-1 item_equips
//     row must be deleted, but the serial itself must survive (still
//     equipped, non-default, on mech 6).
//   - serial 100006: an arbitrary non-default item equipped on mech 2's
//     main slot. Untouched entirely.
// ---------------------------------------------------------------------
function makeCleanupSeedState()
{
    return {
        accounts: [{ id: 4, username: 'test', nickname: 'test', pilot: 101 }],
        items: [
            { id: 100001, account_id: 4, item_id: 11100101, mech_type: 1, part_slot: 0, quantity: 1, equipped: 1 }, // mech1 default body
            { id: 100002, account_id: 4, item_id: 22100101, mech_type: 1, part_slot: 1, quantity: 1, equipped: 1 }, // mech1 default main
            { id: 100003, account_id: 4, item_id: 32100101, mech_type: 1, part_slot: 2, quantity: 1, equipped: 1 }, // mech1 default left
            { id: 100004, account_id: 4, item_id: 41100101, mech_type: 6, part_slot: 4, quantity: 1, equipped: 1 }, // shared booster, equipped non-default on mech6
            { id: 100005, account_id: 4, item_id: 41100101, mech_type: 1, part_slot: 4, quantity: 1, equipped: 0 }, // extra purchased copy, never equipped
            { id: 100006, account_id: 4, item_id: 99999999, mech_type: 2, part_slot: 1, quantity: 1, equipped: 1 }, // unrelated non-default item
        ],
        itemEquips: [
            { id: 1, account_id: 4, item_id: 100001, mech_slot: 1, part_slot: 0 },
            { id: 2, account_id: 4, item_id: 100002, mech_slot: 1, part_slot: 1 },
            { id: 3, account_id: 4, item_id: 100003, mech_slot: 1, part_slot: 2 },
            { id: 4, account_id: 4, item_id: 100004, mech_slot: 1, part_slot: 4 }, // matches mech1 default booster (41100101)
            { id: 5, account_id: 4, item_id: 100004, mech_slot: 6, part_slot: 4 }, // mech6 default booster is 43100101 -- no match
            { id: 6, account_id: 4, item_id: 100006, mech_slot: 2, part_slot: 1 }, // mech2 default main is 26300101 -- no match
        ],
    };
}

async function testCleanupRemovesDefaultsKeepsExtrasAndSharedNonDefault()
{
    const { runCleanup } = require(path.join(ROOT, 'tools', 'p1b-remove-default-items.js'));
    const state = makeCleanupSeedState();
    const pool = makeMockPool(state);
    const silent = () => {};

    const result = await runCleanup(pool, { log: silent, accountIds: [4] });
    const report = result.reports.find(r => r.accountId === 4);
    assert.ok(report, 'expected a report for account 4');
    assert.strictEqual(report.equipRowsDeleted, 4, `expected 4 default item_equips rows deleted, got ${report.equipRowsDeleted}`);
    assert.deepStrictEqual([...report.serialsDeletedList].sort((a, b) => a - b), [100001, 100002, 100003],
        `expected serials [100001,100002,100003] deleted, got [${report.serialsDeletedList.join(',')}]`);

    const remainingIds = state.items.map(i => Number(i.id)).sort((a, b) => a - b);
    assert.deepStrictEqual(remainingIds, [100004, 100005, 100006],
        `expected only [100004,100005,100006] to remain in items, got [${remainingIds.join(',')}]`);

    const remainingEquipIds = state.itemEquips.map(e => Number(e.id)).sort((a, b) => a - b);
    assert.deepStrictEqual(remainingEquipIds, [5, 6], `expected only item_equips rows 5 and 6 to remain, got [${remainingEquipIds.join(',')}]`);

    console.log('[p1b-default-items test] PASS: cleanup removes default-matching rows, keeps a purchased extra copy and a shared non-default equip');

    return state; // handed to the idempotency test below
}

async function testCleanupIsIdempotent(state)
{
    const { runCleanup } = require(path.join(ROOT, 'tools', 'p1b-remove-default-items.js'));
    const pool = makeMockPool(state);
    const silent = () => {};

    const itemsBefore = state.items.length;
    const equipsBefore = state.itemEquips.length;

    const result = await runCleanup(pool, { log: silent, accountIds: [4] });
    const report = result.reports.find(r => r.accountId === 4);
    assert.strictEqual(report.equipRowsDeleted, 0, `rerun should delete nothing, got ${report.equipRowsDeleted}`);
    assert.strictEqual(report.serialsDeleted, 0, `rerun should delete no serials, got ${report.serialsDeleted}`);
    assert.strictEqual(state.items.length, itemsBefore, 'rerun must not change items row count');
    assert.strictEqual(state.itemEquips.length, equipsBefore, 'rerun must not change item_equips row count');

    console.log('[p1b-default-items test] PASS: rerunning the cleanup is a no-op');
}

async function testCleanupDryRunMakesNoChanges()
{
    const { runCleanup } = require(path.join(ROOT, 'tools', 'p1b-remove-default-items.js'));
    const state = makeCleanupSeedState();
    const pool = makeMockPool(state);
    const silent = () => {};

    const itemsBefore = state.items.length;
    const equipsBefore = state.itemEquips.length;

    const result = await runCleanup(pool, { log: silent, accountIds: [4], dryRun: true });
    const report = result.reports.find(r => r.accountId === 4);
    assert.strictEqual(report.equipRowsDeleted, 4, 'dry-run should still compute the would-delete count');
    assert.strictEqual(state.items.length, itemsBefore, 'dry-run must not delete anything from items');
    assert.strictEqual(state.itemEquips.length, equipsBefore, 'dry-run must not delete anything from item_equips');

    console.log('[p1b-default-items test] PASS: cleanup --dry-run computes the plan without writing anything');
}

// ---------------------------------------------------------------------
// Test 4: a serial-0 Slot_Change_CQ (database/db.js's real
// saveEquippedLoadout(), what the 0x00240107 handler calls) clears that
// part's item_equips row without throwing, and leaves the other parts
// alone.
// ---------------------------------------------------------------------
async function testSerialZeroSlotChangeClearsPart()
{
    delete require.cache[DB_PATH];
    const db = require(DB_PATH);
    const originalGetConnection = db.pool.getConnection;
    try {
        db._setItemEquipsModeForTests('enabled');

        const state = {
            accounts: [],
            items: [
                { id: 100010, account_id: 4, item_id: 13100101, mech_type: 3, part_slot: 0, quantity: 1, equipped: 1 }, // body
                { id: 100011, account_id: 4, item_id: 21200101, mech_type: 3, part_slot: 1, quantity: 1, equipped: 1 }, // main
            ],
            itemEquips: [
                { id: 1, account_id: 4, item_id: 100010, mech_slot: 3, part_slot: 0 },
                { id: 2, account_id: 4, item_id: 100011, mech_slot: 3, part_slot: 1 },
            ],
        };
        db.pool.getConnection = makeMockPool(state).getConnection;

        // body=100010 (keep), main=0 (clear -- player re-selected the
        // default), left/right/equipment/skin=0 (already empty).
        await db.saveEquippedLoadout(4, 3, [100010, 0, 0, 0, 0, 0]);

        const mainRow = state.itemEquips.find(e => Number(e.mech_slot) === 3 && Number(e.part_slot) === 1);
        assert.strictEqual(mainRow, undefined, 'main slot (part_slot=1) item_equips row should be gone after a serial-0 Slot_Change');

        const bodyRow = state.itemEquips.find(e => Number(e.mech_slot) === 3 && Number(e.part_slot) === 0);
        assert.ok(bodyRow, 'body slot (part_slot=0) item_equips row should survive untouched');
        assert.strictEqual(Number(bodyRow.item_id), 100010, 'body slot should still reference serial 100010');

        assert.ok(state.items.find(i => Number(i.id) === 100010), 'body serial must still be owned');
        assert.ok(state.items.find(i => Number(i.id) === 100011), 'main serial must still be owned (unequipping is not deleting)');

        console.log('[p1b-default-items test] PASS: serial-0 Slot_Change_CQ clears only that part\'s item_equips row, does not throw');
    } finally {
        db._setItemEquipsModeForTests('disabled');
        db.pool.getConnection = originalGetConnection;
    }
}

async function main()
{
    await testNewAccountOwnsZeroDefaultItems();
    const stateAfterCleanup = await testCleanupRemovesDefaultsKeepsExtrasAndSharedNonDefault();
    await testCleanupIsIdempotent(stateAfterCleanup);
    await testCleanupDryRunMakesNoChanges();
    await testSerialZeroSlotChangeClearsPart();
    console.log('[p1b-default-items test] ALL CHECKS PASS');
    process.exit(0);
}

main().catch(err => {
    console.error('[p1b-default-items test] FAIL:', err);
    process.exit(1);
});
