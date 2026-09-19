'use strict';

// E1-IMPL (docs/design/e1-item-ownership.md, docs/backlog.md E1): proves
// ITEM_EQUIPS_MODE='enabled' behaviour without touching the real DB.
//
//   1. a ShareType=1 sub-weapon (32100101, [CACHE] verified via
//      database/item-share-type.js against the real Cache.Bin -- see
//      docs/design/e1-item-ownership.md section 1) equipped on mech 1 and
//      mech 2 at the same time appears in both mechs' SN_WEAR_INFO slots;
//   2. a ShareType=0 main weapon (26300101, same source) moved from mech 1
//      to mech 2 via database/db.js's real saveEquippedLoadout() disappears
//      from mech 1's item_equips row but the account still owns the serial
//      (ItemFree() parity, ZPage_Hangar.uc:917-924);
//   3. buying an already-owned ShareType=1/UseTime=0 (permanent) item does
//      not insert a second `items` row;
//   4. tools/migrate-e1-item-equips.js is idempotent against an in-memory
//      mock pool.
//
// database/db.js's real functions are exercised directly for (2) and (4)
// (its own `pool` object is monkey-patched with an in-memory mock
// connection -- never database/config.json's real MySQL). (1) and (3) go
// through dispatch/room.dispatch.js with test/fixtures/fake-db.js, same
// technique as the rest of test/*.js.
//
// Run: node test/item-equips.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');

const { makeFixtureDb } = require('./fixtures/fake-db.js');
const { makeFakeClient } = require('./fixtures/fake-client.js');

const SHARED_ITEM_ID = 32100101;    // [CACHE] verified ShareType=1, UseTime=0 (permanent sub-weapon)
const NONSHARED_ITEM_ID = 26300101; // [CACHE] verified ShareType=0, UseTime=0 (permanent main weapon)

function installFakeModule(resolvedPath, exportsObj)
{
    const mod = new Module(resolvedPath, null);
    mod.filename = resolvedPath;
    mod.loaded = true;
    mod.exports = exportsObj;
    require.cache[resolvedPath] = mod;
}

// ---------------------------------------------------------------------
// Test 1: shared item equipped on two mechs shows up in both WearInfo slots
// ---------------------------------------------------------------------
async function testSharedItemOnTwoMechs()
{
    const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));
    const ROOM_DISPATCH_PATH = require.resolve(path.join(ROOT, 'dispatch', 'room.dispatch.js'));

    const serial = 100050;
    const fixtureDb = makeFixtureDb({
        itemEquipsMode: 'enabled',
        items: [
            { id: serial, account_id: 1, item_id: SHARED_ITEM_ID, slot: 2, mech_type: 1, part_slot: 2, quantity: 1, equipped: 1 },
        ],
        itemEquips: [
            { id: 1, account_id: 1, item_id: serial, mech_slot: 1, part_slot: 2 },
            { id: 2, account_id: 1, item_id: serial, mech_slot: 2, part_slot: 2 },
        ],
    });
    installFakeModule(DB_PATH, fixtureDb);
    delete require.cache[ROOM_DISPATCH_PATH];
    const ZRoomDispatch = require(ROOM_DISPATCH_PATH);

    const roomDispatch = new ZRoomDispatch();
    const client = makeFakeClient(1, 30907);
    client.accountId_ = 1;
    client.pilot_ = 101;

    await roomDispatch.sendHangarWearInfo(client);

    const sent = client._sent.find(p => p.op === '0x00210113');
    assert.ok(sent, 'expected a WearInfo_SN 0x00210113 send');
    const body = Buffer.from(sent.hex, 'hex');

    const ENTRY_SIZE = 52;
    const HEADER_SIZE = 14;
    function readSlot(mechIndex1Based, partSlot)
    {
        const entryOffset = HEADER_SIZE + (mechIndex1Based - 1) * ENTRY_SIZE;
        const uniqueKey = body.readUInt32LE(entryOffset + 4 + partSlot * 8);
        const itemIndex = body.readUInt32LE(entryOffset + 4 + partSlot * 8 + 4);
        return { uniqueKey, itemIndex };
    }

    const mech1 = readSlot(1, 2);
    const mech2 = readSlot(2, 2);
    assert.strictEqual(mech1.uniqueKey, serial, `mech1 part_slot=2 uniqueKey should be the shared serial, got ${mech1.uniqueKey}`);
    assert.strictEqual(mech1.itemIndex, SHARED_ITEM_ID, `mech1 part_slot=2 itemIndex should be ${SHARED_ITEM_ID}, got ${mech1.itemIndex}`);
    assert.strictEqual(mech2.uniqueKey, serial, `mech2 part_slot=2 uniqueKey should be the shared serial too, got ${mech2.uniqueKey}`);
    assert.strictEqual(mech2.itemIndex, SHARED_ITEM_ID, `mech2 part_slot=2 itemIndex should be ${SHARED_ITEM_ID}, got ${mech2.itemIndex}`);

    console.log('[item-equips test] PASS: ShareType=1 serial equipped on mech1+mech2 both appear in WearInfo_SN');
}

// ---------------------------------------------------------------------
// In-memory mock pool for database/db.js's real functions (tests 2 and 4).
// Mirrors exactly the SQL shapes saveEquippedLoadout()/runMigration() issue
// -- see database/db.js and tools/migrate-e1-item-equips.js.
// ---------------------------------------------------------------------
function makeMockPool(state)
{
    let nextEquipId = state.itemEquips.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1;

    async function execute(sql, params = [])
    {
        const norm = sql.replace(/\s+/g, ' ').trim();

        if (norm.startsWith('CREATE TABLE IF NOT EXISTS item_equips'))
            return [{}];

        if (norm.startsWith('SELECT COUNT(*) AS itemsTotal FROM items'))
            return [[{ itemsTotal: state.items.length }]];
        if (norm.startsWith('SELECT COUNT(*) AS before FROM item_equips'))
            return [[{ before: state.itemEquips.length }]];
        if (norm.startsWith('SELECT COUNT(*) AS after FROM item_equips'))
            return [[{ after: state.itemEquips.length }]];

        if (norm.startsWith('SELECT account_id, id AS item_id, mech_type AS mech_slot, part_slot FROM items WHERE equipped = 1'))
        {
            const rows = state.items
                .filter(item => Number(item.equipped) === 1 && Number(item.part_slot) >= 0 && Number(item.part_slot) <= 5)
                .map(item => ({ account_id: item.account_id, item_id: item.id, mech_slot: item.mech_type, part_slot: item.part_slot }));
            return [rows];
        }

        if (norm.startsWith('SELECT item_id FROM item_equips WHERE account_id = ? AND mech_slot = ? AND part_slot = ?'))
        {
            const [accountId, mechSlot, partSlot] = params;
            const rows = state.itemEquips.filter(e =>
                Number(e.account_id) === Number(accountId) && Number(e.mech_slot) === Number(mechSlot) && Number(e.part_slot) === Number(partSlot)
            );
            return [rows.map(r => ({ item_id: r.item_id }))];
        }

        if (norm.startsWith('SELECT id, item_id FROM items WHERE account_id = ? AND id IN'))
        {
            const accountId = params[0];
            const ids = params.slice(1).map(Number);
            const rows = state.items.filter(item => Number(item.account_id) === Number(accountId) && ids.includes(Number(item.id)));
            return [rows.map(r => ({ id: r.id, item_id: r.item_id }))];
        }

        if (norm.startsWith('UPDATE items SET equipped = 0 WHERE account_id = ? AND mech_type = ? AND part_slot BETWEEN 0 AND 5'))
        {
            const [accountId, mechType] = params;
            for (const item of state.items) {
                if (Number(item.account_id) === Number(accountId) && Number(item.mech_type) === Number(mechType)
                    && Number(item.part_slot) >= 0 && Number(item.part_slot) <= 5) {
                    item.equipped = 0;
                }
            }
            return [{ affectedRows: 0 }];
        }

        if (norm.startsWith('UPDATE items SET equipped = 0 WHERE account_id = ? AND id IN'))
        {
            const accountId = params[0];
            const ids = params.slice(1).map(Number);
            for (const item of state.items) {
                if (Number(item.account_id) === Number(accountId) && ids.includes(Number(item.id))) item.equipped = 0;
            }
            return [{ affectedRows: 0 }];
        }

        if (norm.startsWith('UPDATE items SET equipped = 1, mech_type = ?, part_slot = ? WHERE account_id = ? AND id = ?'))
        {
            const [mechType, partSlot, accountId, id] = params;
            const item = state.items.find(i => Number(i.account_id) === Number(accountId) && Number(i.id) === Number(id));
            if (item) { item.equipped = 1; item.mech_type = Number(mechType); item.part_slot = Number(partSlot); }
            return [{ affectedRows: item ? 1 : 0 }];
        }

        if (norm.startsWith('UPDATE items SET equipped = 1, part_slot = ? WHERE account_id = ? AND id = ?'))
        {
            const [partSlot, accountId, id] = params;
            const item = state.items.find(i => Number(i.account_id) === Number(accountId) && Number(i.id) === Number(id));
            if (item) { item.equipped = 1; item.part_slot = Number(partSlot); }
            return [{ affectedRows: item ? 1 : 0 }];
        }

        if (norm.startsWith('DELETE FROM item_equips WHERE account_id = ? AND mech_slot = ?'))
        {
            const [accountId, mechSlot] = params;
            state.itemEquips = state.itemEquips.filter(e =>
                !(Number(e.account_id) === Number(accountId) && Number(e.mech_slot) === Number(mechSlot))
            );
            return [{ affectedRows: 0 }];
        }

        if (norm.startsWith('DELETE FROM item_equips WHERE account_id = ? AND item_id = ?'))
        {
            const [accountId, itemId] = params;
            state.itemEquips = state.itemEquips.filter(e =>
                !(Number(e.account_id) === Number(accountId) && Number(e.item_id) === Number(itemId))
            );
            return [{ affectedRows: 0 }];
        }

        if (norm.startsWith('INSERT INTO item_equips (account_id, item_id, mech_slot, part_slot) VALUES'))
        {
            const [accountId, itemId, mechSlot, partSlot] = params;
            const id = nextEquipId++;
            state.itemEquips.push({ id, account_id: Number(accountId), item_id: Number(itemId), mech_slot: Number(mechSlot), part_slot: Number(partSlot) });
            return [{ insertId: id, affectedRows: 1 }];
        }

        throw new Error(`item-equips test mock pool: unmocked SQL: ${norm}`);
    }

    return {
        async getConnection()
        {
            return {
                async beginTransaction() {},
                async commit() {},
                async rollback() {},
                release() {},
                execute,
            };
        },
    };
}

// ---------------------------------------------------------------------
// Test 2: non-shared item moved from mech1 to mech2 -- gone from mech1's
// item_equips, still owned (still in `items`).
// ---------------------------------------------------------------------
async function testNonSharedMoveBetweenMechs()
{
    const { _setTablesForTests } = require(path.join(ROOT, 'database', 'item-share-type.js'));
    _setTablesForTests(
        { [SHARED_ITEM_ID]: 1, [NONSHARED_ITEM_ID]: 0 },
        { [SHARED_ITEM_ID]: 0, [NONSHARED_ITEM_ID]: 0 },
    );

    // database/db.js's ITEM_EQUIPS_MODE defaults to 'disabled' (byte-identical
    // to pre-E1 behaviour for every other test/golden sample); this test-only
    // setter flips it just for this process so saveEquippedLoadout()'s real
    // item_equips write path can be exercised. Reset in the `finally` below
    // so later tests in this same file see the default again.
    // Earlier tests in this file (installFakeModule) may have left
    // require.cache[DB_PATH] pointing at a fixture object instead of the
    // real database/db.js -- drop it so this test gets the real module,
    // whose actual saveEquippedLoadout()/pool this test exercises.
    const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));
    delete require.cache[DB_PATH];
    const db = require(DB_PATH);
    db._setItemEquipsModeForTests('enabled');
    const originalGetConnection = db.pool.getConnection;

    try {
        const serial = 100060;
        const state = {
            items: [
                { id: serial, account_id: 1, item_id: NONSHARED_ITEM_ID, slot: 1, mech_type: 1, part_slot: 1, quantity: 1, equipped: 1 },
            ],
            itemEquips: [
                { id: 1, account_id: 1, item_id: serial, mech_slot: 1, part_slot: 1 },
            ],
        };
        db.pool.getConnection = makeMockPool(state).getConnection;

        // Equip the same serial on mech 2's main-weapon slot (part_slot=1).
        const serials = [0, serial, 0, 0, 0, 0]; // body, main, left, right, equipment, skin
        await db.saveEquippedLoadout(1, 2, serials);

        const onMech1 = state.itemEquips.filter(e => Number(e.mech_slot) === 1);
        const onMech2 = state.itemEquips.filter(e => Number(e.mech_slot) === 2);
        assert.strictEqual(onMech1.length, 0, `mech1 should have no item_equips rows left after the move, got ${onMech1.length}`);
        assert.strictEqual(onMech2.length, 1, `mech2 should have exactly one item_equips row, got ${onMech2.length}`);
        assert.strictEqual(Number(onMech2[0].item_id), serial, 'mech2 row should reference the moved serial');

        const stillOwned = state.items.find(item => Number(item.id) === serial);
        assert.ok(stillOwned, 'the serial must still exist in items (still owned) after moving mechs');

        console.log('[item-equips test] PASS: ShareType=0 serial moved mech1->mech2 leaves mech1, stays owned');
    } finally {
        db._setItemEquipsModeForTests('disabled');
        db.pool.getConnection = originalGetConnection;
    }
}

// ---------------------------------------------------------------------
// Test 3: buying an owned ShareType=1/UseTime=0 (permanent) item does not
// insert a second items row.
// ---------------------------------------------------------------------
async function testBuyOwnedPermanentSharedNoDuplicate()
{
    const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));
    const ROOM_DISPATCH_PATH = require.resolve(path.join(ROOT, 'dispatch', 'room.dispatch.js'));

    const serial = 100070;
    const fixtureDb = makeFixtureDb({
        itemEquipsMode: 'enabled',
        items: [
            { id: serial, account_id: 1, item_id: SHARED_ITEM_ID, slot: 2, mech_type: 1, part_slot: 2, quantity: 1, equipped: 0 },
        ],
        itemEquips: [],
    });
    installFakeModule(DB_PATH, fixtureDb);
    delete require.cache[ROOM_DISPATCH_PATH];
    const ZRoomDispatch = require(ROOM_DISPATCH_PATH);

    const roomDispatch = new ZRoomDispatch();
    const client = makeFakeClient(1, 30907);
    client.accountId_ = 1;
    client.point_ = 100000;

    const beforeCount = fixtureDb._fixture.items.filter(item => Number(item.item_id) === SHARED_ITEM_ID).length;
    assert.strictEqual(beforeCount, 1, 'test setup: account should start owning exactly one serial of the shared item');

    await roomDispatch.handleShopPurchase(client, SHARED_ITEM_ID, Buffer.alloc(4));

    const afterCount = fixtureDb._fixture.items.filter(item => Number(item.item_id) === SHARED_ITEM_ID).length;
    assert.strictEqual(afterCount, 1, `buying an already-owned ShareType=1 permanent item must not add a row, got ${afterCount} rows`);
    assert.ok(client.point_ < 100000, 'the purchase should still charge points even though no row was inserted');

    console.log('[item-equips test] PASS: buying an owned ShareType=1/permanent item does not duplicate the items row');
}

// ---------------------------------------------------------------------
// Test 4: migration is idempotent against an in-memory mock pool.
// ---------------------------------------------------------------------
async function testMigrationIdempotent()
{
    const { runMigration } = require(path.join(ROOT, 'tools', 'migrate-e1-item-equips.js'));

    const state = {
        items: [
            { id: 100001, account_id: 1, item_id: 11100101, mech_type: 1, part_slot: 0, equipped: 1 },
            { id: 100002, account_id: 1, item_id: 22100101, mech_type: 1, part_slot: 1, equipped: 1 },
            { id: 100003, account_id: 1, item_id: 32100101, mech_type: 1, part_slot: 2, equipped: 0 }, // not equipped -- must not be migrated
        ],
        itemEquips: [],
    };
    const pool = makeMockPool(state);
    const silent = () => {};

    const first = await runMigration(pool, { log: silent });
    assert.strictEqual(first.inserted, 2, `first run should insert the 2 equipped=1 rows, got ${first.inserted}`);
    assert.strictEqual(state.itemEquips.length, 2, `item_equips should have 2 rows after first run, got ${state.itemEquips.length}`);

    const second = await runMigration(pool, { log: silent });
    assert.strictEqual(second.inserted, 0, `second run should insert nothing (idempotent), got ${second.inserted}`);
    assert.strictEqual(second.skipped, 2, `second run should skip the 2 already-migrated rows, got ${second.skipped}`);
    assert.strictEqual(state.itemEquips.length, 2, `item_equips should still have exactly 2 rows after re-running, got ${state.itemEquips.length}`);

    console.log('[item-equips test] PASS: tools/migrate-e1-item-equips.js is idempotent on a mock pool');
}

async function main()
{
    await testSharedItemOnTwoMechs();
    await testNonSharedMoveBetweenMechs();
    await testBuyOwnedPermanentSharedNoDuplicate();
    await testMigrationIdempotent();
    console.log('[item-equips test] ALL CHECKS PASS (or clearly SKIPped -- see above)');
    process.exit(0);
}

main().catch(err => {
    console.error('[item-equips test] FAIL:', err);
    process.exit(1);
});
