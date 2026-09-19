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
// E1 fix round (Sol batch4, docs/research/2026-09-19-sol-review/batch4.md)
// added:
//   5. a real UNIQUE collision during migration rolls back every row that
//      transaction had already inserted (mock pool now implements real
//      beginTransaction/rollback snapshot+restore semantics, not just "stop
//      inserting");
//   6. a source row with mech_type outside 1..8 makes the whole migration
//      refuse (and roll back) instead of writing it;
//   7. rerunning the migration when item_equips already has rows refuses
//      unless --force is passed;
//   8. ITEM_EQUIPS_MODE 'enabled' saveEquippedLoadout() leaves
//      items.equipped/items.mech_type completely untouched (no clear, no
//      set) -- item_equips is the only source of truth.
//
// database/db.js's real functions are exercised directly for (2), (4)-(8)
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
// Real account 3 case, docs/design/e1-item-ownership.md section 5 / Sol
// batch4 review item (2): [CACHE] verified ShareType=1, UseTime=0 (permanent).
const SHARED_ITEM_ID_3X = 33800101;

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
// In-memory mock pool for database/db.js's real functions. Mirrors exactly
// the SQL shapes saveEquippedLoadout()/runMigration()/runMerge() issue --
// see database/db.js, tools/migrate-e1-item-equips.js and
// tools/merge-e1-shared-duplicates.js.
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
        if (norm.startsWith('SELECT COUNT(*) AS existingCount FROM item_equips'))
            return [[{ existingCount: state.itemEquips.length }]];
        // tools/merge-e1-shared-duplicates.js's own before/after counts.
        if (norm.startsWith('SELECT COUNT(*) AS itemsBefore FROM items'))
            return [[{ itemsBefore: state.items.length }]];
        if (norm.startsWith('SELECT COUNT(*) AS itemEquipsBefore FROM item_equips'))
            return [[{ itemEquipsBefore: state.itemEquips.length }]];
        if (norm.startsWith('SELECT COUNT(*) AS itemsAfter FROM items'))
            return [[{ itemsAfter: state.items.length }]];
        if (norm.startsWith('SELECT COUNT(*) AS itemEquipsAfter FROM item_equips'))
            return [[{ itemEquipsAfter: state.itemEquips.length }]];

        if (norm.startsWith('SELECT account_id, id AS item_id, mech_type AS mech_slot, part_slot FROM items WHERE equipped = 1'))
        {
            const rows = state.items
                .filter(item => Number(item.equipped) === 1 && Number(item.part_slot) >= 0 && Number(item.part_slot) <= 5)
                .map(item => ({ account_id: item.account_id, item_id: item.id, mech_slot: item.mech_type, part_slot: item.part_slot }));
            return [rows];
        }

        // tools/merge-e1-shared-duplicates.js's full-table reads.
        if (norm.startsWith('SELECT id, account_id, item_id FROM items ORDER BY account_id, item_id, id'))
        {
            const rows = [...state.items]
                .sort((a, b) => Number(a.account_id) - Number(b.account_id) || Number(a.item_id) - Number(b.item_id) || Number(a.id) - Number(b.id))
                .map(item => ({ id: item.id, account_id: item.account_id, item_id: item.item_id }));
            return [rows];
        }
        if (norm.startsWith('SELECT id, account_id, item_id, mech_slot, part_slot FROM item_equips'))
        {
            const rows = state.itemEquips.map(e => ({ id: e.id, account_id: e.account_id, item_id: e.item_id, mech_slot: e.mech_slot, part_slot: e.part_slot }));
            return [rows];
        }
        if (norm.startsWith('UPDATE item_equips SET item_id = ? WHERE account_id = ? AND item_id = ?'))
        {
            const [newItemId, accountId, oldItemId] = params;
            let affected = 0;
            for (const e of state.itemEquips) {
                if (Number(e.account_id) === Number(accountId) && Number(e.item_id) === Number(oldItemId)) {
                    e.item_id = Number(newItemId);
                    affected++;
                }
            }
            return [{ affectedRows: affected }];
        }
        if (norm.startsWith('DELETE FROM items WHERE account_id = ? AND id IN'))
        {
            const accountId = params[0];
            const ids = params.slice(1).map(Number);
            const before = state.items.length;
            state.items = state.items.filter(item => !(Number(item.account_id) === Number(accountId) && ids.includes(Number(item.id))));
            return [{ affectedRows: before - state.items.length }];
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
            // Real snapshot/restore, not a no-op -- E1 fix round (1)/(5):
            // proves a mid-transaction throw (collision, invalid slot) truly
            // undoes every row that same transaction had already inserted,
            // matching what the real InnoDB ROLLBACK the production code
            // relies on actually does.
            let snapshot = null;
            return {
                async beginTransaction()
                {
                    snapshot = {
                        items: JSON.parse(JSON.stringify(state.items)),
                        itemEquips: JSON.parse(JSON.stringify(state.itemEquips)),
                    };
                },
                async commit() { snapshot = null; },
                async rollback()
                {
                    if (snapshot) {
                        state.items.length = 0;
                        state.items.push(...snapshot.items);
                        state.itemEquips.length = 0;
                        state.itemEquips.push(...snapshot.itemEquips);
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
// Test 2: non-shared item moved from mech1 to mech2 -- gone from mech1's
// item_equips, still owned (still in `items`).
// ---------------------------------------------------------------------
async function testNonSharedMoveBetweenMechs()
{
    // NONSHARED_ITEM_ID's ShareType/UseTime come from the real Cache.Bin
    // (already [CACHE]-verified, see its declaration above) -- no need to
    // force database/item-share-type.js's tables here. Forcing them was
    // tried and reverted: _setTablesForTests() replaces the *entire*
    // module-level table, which then stays forced for every later test in
    // this same process (e.g. testMergeSharedDuplicates()'s own item id),
    // not just for this function.

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
// Test 4: migration is idempotent against an in-memory mock pool (with
// --force, since a bare rerun now refuses -- see testMigrationRerunRefusal).
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

    const second = await runMigration(pool, { log: silent, force: true });
    assert.strictEqual(second.inserted, 0, `second run (--force) should insert nothing (idempotent), got ${second.inserted}`);
    assert.strictEqual(second.skipped, 2, `second run (--force) should skip the 2 already-migrated rows, got ${second.skipped}`);
    assert.strictEqual(state.itemEquips.length, 2, `item_equips should still have exactly 2 rows after re-running, got ${state.itemEquips.length}`);

    console.log('[item-equips test] PASS: tools/migrate-e1-item-equips.js is idempotent on a mock pool (with --force)');
}

// ---------------------------------------------------------------------
// Test 5 (Sol batch4 (7)): rerunning without --force refuses outright once
// item_equips already has rows, instead of silently trusting legacy
// items.equipped/items.mech_type (which stop being maintained once the mode
// is on -- see database/db.js's saveEquippedLoadout()).
// ---------------------------------------------------------------------
async function testMigrationRerunRefusal()
{
    const { runMigration } = require(path.join(ROOT, 'tools', 'migrate-e1-item-equips.js'));

    const state = {
        items: [
            { id: 100001, account_id: 1, item_id: 11100101, mech_type: 1, part_slot: 0, equipped: 1 },
        ],
        itemEquips: [],
    };
    const pool = makeMockPool(state);
    const silent = () => {};

    await runMigration(pool, { log: silent });
    assert.strictEqual(state.itemEquips.length, 1, 'first run should have migrated the one equipped row');

    await assert.rejects(
        () => runMigration(pool, { log: silent }),
        /item_equips already has 1 row.*--force/s,
        'a bare rerun (no --force) with existing item_equips rows should refuse'
    );
    assert.strictEqual(state.itemEquips.length, 1, 'a refused rerun must not change item_equips at all');

    console.log('[item-equips test] PASS: migration refuses to rerun without --force once item_equips has rows');
}

// ---------------------------------------------------------------------
// Test 6 (Sol batch4 (1)/"Must fix"): a UNIQUE collision rolls back every
// row that same migration run had already inserted -- not just "stops
// inserting from here".
// ---------------------------------------------------------------------
async function testMigrationAtomicOnCollision()
{
    const { runMigration } = require(path.join(ROOT, 'tools', 'migrate-e1-item-equips.js'));

    const state = {
        items: [
            // Migrates cleanly first (account 1, mech 1, part 0).
            { id: 100001, account_id: 1, item_id: 11100101, mech_type: 1, part_slot: 0, equipped: 1 },
            // Two different equipped=1 serials claiming the same
            // (account_id=1, mech_slot=2, part_slot=1) -- a real collision.
            { id: 100002, account_id: 1, item_id: 22100101, mech_type: 2, part_slot: 1, equipped: 1 },
            { id: 100003, account_id: 1, item_id: 22100102, mech_type: 2, part_slot: 1, equipped: 1 },
        ],
        itemEquips: [],
    };
    const pool = makeMockPool(state);
    const silent = () => {};

    await assert.rejects(
        () => runMigration(pool, { log: silent }),
        /UNIQUE collision/,
        'a genuine collision should throw'
    );
    assert.strictEqual(
        state.itemEquips.length, 0,
        `a collision must roll back the whole transaction, including the 100001 row inserted earlier in the ` +
        `same run -- got ${state.itemEquips.length} row(s) left over`
    );

    console.log('[item-equips test] PASS: a migration collision rolls back every row from that run, not just itself');
}

// ---------------------------------------------------------------------
// Test 7 (Sol batch4 "Must fix"): source rows with an out-of-range
// mech_type are refused (and rolled back), not silently written.
// ---------------------------------------------------------------------
async function testMigrationRefusesInvalidMechSlot()
{
    const { runMigration } = require(path.join(ROOT, 'tools', 'migrate-e1-item-equips.js'));

    const state = {
        items: [
            { id: 100001, account_id: 1, item_id: 11100101, mech_type: 1, part_slot: 0, equipped: 1 }, // valid
            { id: 100002, account_id: 1, item_id: 22100101, mech_type: 9, part_slot: 1, equipped: 1 }, // mech_type out of range (1..8)
            { id: 100003, account_id: 1, item_id: 22100102, mech_type: 0, part_slot: 1, equipped: 1 }, // mech_type out of range (1..8)
        ],
        itemEquips: [],
    };
    const pool = makeMockPool(state);
    const silent = () => {};

    await assert.rejects(
        () => runMigration(pool, { log: silent }),
        /out-of-range mech_slot.*item_id\(serial\)=100002.*item_id\(serial\)=100003/s,
        'should refuse and list every offending row'
    );
    assert.strictEqual(state.itemEquips.length, 0, 'a refused migration must not write the valid row 100001 either (whole run rolls back)');

    console.log('[item-equips test] PASS: migration refuses (and rolls back) source rows with an out-of-range mech_type');
}

// ---------------------------------------------------------------------
// Test 8 (Sol batch4 (5), coordinator decision): with ITEM_EQUIPS_MODE
// 'enabled', saveEquippedLoadout() must not touch items.equipped or
// items.mech_type at all -- no clear, no set.
// ---------------------------------------------------------------------
async function testSaveEquippedLoadoutLeavesLegacyColumnsUntouched()
{
    const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));
    delete require.cache[DB_PATH];
    const db = require(DB_PATH);
    db._setItemEquipsModeForTests('enabled');
    const originalGetConnection = db.pool.getConnection;

    try {
        const serial = 100080;
        // Deliberately stale/inconsistent legacy columns -- equipped=0 and
        // mech_type pointing at a mech that has nothing to do with the
        // saveEquippedLoadout() call below. If the fix is correct, this
        // must still be exactly this after the call: item_equips is the
        // only thing that changes.
        const legacyBefore = { id: serial, account_id: 1, item_id: NONSHARED_ITEM_ID, slot: 1, mech_type: 5, part_slot: 3, quantity: 1, equipped: 0 };
        const state = {
            items: [{ ...legacyBefore }],
            itemEquips: [],
        };
        db.pool.getConnection = makeMockPool(state).getConnection;

        const serials = [0, serial, 0, 0, 0, 0]; // body, main, left, right, equipment, skin
        await db.saveEquippedLoadout(1, 2, serials);

        const afterRow = state.items.find(item => Number(item.id) === serial);
        assert.deepStrictEqual(
            { equipped: afterRow.equipped, mech_type: afterRow.mech_type, part_slot: afterRow.part_slot },
            { equipped: legacyBefore.equipped, mech_type: legacyBefore.mech_type, part_slot: legacyBefore.part_slot },
            'items.equipped/items.mech_type/items.part_slot must be completely untouched when ITEM_EQUIPS_MODE is enabled'
        );

        const equipRow = state.itemEquips.find(e => Number(e.item_id) === serial);
        assert.ok(equipRow, 'item_equips should still get the new row (that part of the write path is unaffected)');
        assert.strictEqual(Number(equipRow.mech_slot), 2, 'item_equips should reflect the real equip, even though items.mech_type was left alone');

        console.log('[item-equips test] PASS: mode-on saveEquippedLoadout leaves items.equipped/items.mech_type/items.part_slot untouched');
    } finally {
        db._setItemEquipsModeForTests('disabled');
        db.pool.getConnection = originalGetConnection;
    }
}

// ---------------------------------------------------------------------
// tools/merge-e1-shared-duplicates.js tests. SHARED_ITEM_ID_3X (declared at
// the top of this file) mirrors the real account 3 case from
// docs/design/e1-item-ownership.md section 5 -- item_id=33800101,
// [CACHE]-verified ShareType=1/UseTime=0 (permanent shared, Sol batch4
// review item (2): `33800101@0x13a35` = UseTime=0, ShareType=1) -- owned
// three times, two of the three equipped on different mechs.
// ---------------------------------------------------------------------

async function testMergeSharedDuplicates()
{
    const { runMerge } = require(path.join(ROOT, 'tools', 'merge-e1-shared-duplicates.js'));

    // Three owned serials of the same permanent shared item; the lowest
    // (100201) and the highest (100203) each have an item_equips row on a
    // different mech, the middle one (100202) has none.
    const state = {
        items: [
            { id: 100201, account_id: 3, item_id: SHARED_ITEM_ID_3X, mech_type: 5, part_slot: 2, equipped: 1 },
            { id: 100202, account_id: 3, item_id: SHARED_ITEM_ID_3X, mech_type: 5, part_slot: 2, equipped: 0 },
            { id: 100203, account_id: 3, item_id: SHARED_ITEM_ID_3X, mech_type: 1, part_slot: 2, equipped: 1 },
        ],
        itemEquips: [
            { id: 1, account_id: 3, item_id: 100201, mech_slot: 5, part_slot: 2 },
            { id: 2, account_id: 3, item_id: 100203, mech_slot: 1, part_slot: 2 },
        ],
    };
    const pool = makeMockPool(state);
    const silent = () => {};

    const result = await runMerge(pool, { log: silent });
    assert.strictEqual(result.groupsMerged, 1, `expected exactly 1 merged group, got ${result.groupsMerged}`);
    assert.strictEqual(result.serialsRemoved, 2, `expected 2 serials removed, got ${result.serialsRemoved}`);

    const remaining = state.items.filter(item => Number(item.item_id) === SHARED_ITEM_ID_3X);
    assert.strictEqual(remaining.length, 1, `exactly one serial of ${SHARED_ITEM_ID_3X} should remain, got ${remaining.length}`);
    const keptSerial = Number(remaining[0].id);
    assert.strictEqual(keptSerial, 100201, `should keep the lowest-id serial that had item_equips rows (100201), got ${keptSerial}`);

    const keptEquips = state.itemEquips.filter(e => Number(e.item_id) === keptSerial);
    const mechSlots = keptEquips.map(e => Number(e.mech_slot)).sort();
    assert.deepStrictEqual(mechSlots, [1, 5], `the kept serial should end up equipped on both mech 1 and mech 5, got [${mechSlots.join(', ')}]`);
    assert.strictEqual(state.itemEquips.length, 2, `item_equips row count should be unchanged (repoint, not delete), got ${state.itemEquips.length}`);

    console.log('[item-equips test] PASS: merge collapses 3 shared duplicates into 1 serial equipped on both mechs (account 3 case)');
}

async function testMergeLeavesNonSharedAlone()
{
    const { runMerge } = require(path.join(ROOT, 'tools', 'merge-e1-shared-duplicates.js'));

    const state = {
        items: [
            // Two owned serials of the same non-shared main weapon --
            // legitimate (e.g. bought before ever equipping either),
            // must not be merged.
            { id: 100301, account_id: 3, item_id: NONSHARED_ITEM_ID, mech_type: 1, part_slot: 1, equipped: 1 },
            { id: 100302, account_id: 3, item_id: NONSHARED_ITEM_ID, mech_type: 2, part_slot: 1, equipped: 1 },
        ],
        itemEquips: [
            { id: 1, account_id: 3, item_id: 100301, mech_slot: 1, part_slot: 1 },
            { id: 2, account_id: 3, item_id: 100302, mech_slot: 2, part_slot: 1 },
        ],
    };
    const pool = makeMockPool(state);
    const silent = () => {};

    const result = await runMerge(pool, { log: silent });
    assert.strictEqual(result.groupsMerged, 0, `non-shared duplicates must not be merged, got groupsMerged=${result.groupsMerged}`);
    assert.strictEqual(state.items.length, 2, 'both non-shared serials should still exist');
    assert.strictEqual(state.itemEquips.length, 2, 'both item_equips rows should be untouched');

    console.log('[item-equips test] PASS: merge leaves non-shared duplicate serials alone');
}

async function testMergeIdempotentSecondRun()
{
    const { runMerge } = require(path.join(ROOT, 'tools', 'merge-e1-shared-duplicates.js'));

    const state = {
        items: [
            { id: 100401, account_id: 3, item_id: SHARED_ITEM_ID_3X, mech_type: 5, part_slot: 2, equipped: 1 },
            { id: 100402, account_id: 3, item_id: SHARED_ITEM_ID_3X, mech_type: 1, part_slot: 2, equipped: 1 },
        ],
        itemEquips: [
            { id: 1, account_id: 3, item_id: 100401, mech_slot: 5, part_slot: 2 },
            { id: 2, account_id: 3, item_id: 100402, mech_slot: 1, part_slot: 2 },
        ],
    };
    const pool = makeMockPool(state);
    const silent = () => {};

    const first = await runMerge(pool, { log: silent });
    assert.strictEqual(first.groupsMerged, 1, 'first run should merge the one duplicate group');

    const second = await runMerge(pool, { log: silent });
    assert.strictEqual(second.groupsMerged, 0, `second run should find nothing to do, got groupsMerged=${second.groupsMerged}`);
    assert.strictEqual(second.serialsRemoved, 0, `second run should remove nothing, got serialsRemoved=${second.serialsRemoved}`);
    assert.strictEqual(state.items.length, 1, 'exactly one serial should remain after both runs');

    console.log('[item-equips test] PASS: merge is idempotent -- a second run finds nothing to do');
}

async function testMergeDryRunMakesNoChanges()
{
    const { runMerge } = require(path.join(ROOT, 'tools', 'merge-e1-shared-duplicates.js'));

    const state = {
        items: [
            { id: 100501, account_id: 3, item_id: SHARED_ITEM_ID_3X, mech_type: 5, part_slot: 2, equipped: 1 },
            { id: 100502, account_id: 3, item_id: SHARED_ITEM_ID_3X, mech_type: 1, part_slot: 2, equipped: 1 },
        ],
        itemEquips: [
            { id: 1, account_id: 3, item_id: 100501, mech_slot: 5, part_slot: 2 },
            { id: 2, account_id: 3, item_id: 100502, mech_slot: 1, part_slot: 2 },
        ],
    };
    const pool = makeMockPool(state);
    const silent = () => {};

    const result = await runMerge(pool, { log: silent, dryRun: true });
    assert.strictEqual(result.plan.length, 1, 'dry-run should still compute the plan');
    assert.strictEqual(state.items.length, 2, 'dry-run must not delete anything');
    assert.strictEqual(state.itemEquips.length, 2, 'dry-run must not repoint anything');
    assert.strictEqual(Number(state.itemEquips[1].item_id), 100502, 'dry-run must not have repointed item_equips');

    console.log('[item-equips test] PASS: merge --dry-run computes the plan without writing anything');
}

async function main()
{
    await testSharedItemOnTwoMechs();
    await testNonSharedMoveBetweenMechs();
    await testBuyOwnedPermanentSharedNoDuplicate();
    await testMigrationIdempotent();
    await testMigrationRerunRefusal();
    await testMigrationAtomicOnCollision();
    await testMigrationRefusesInvalidMechSlot();
    await testSaveEquippedLoadoutLeavesLegacyColumnsUntouched();
    await testMergeSharedDuplicates();
    await testMergeLeavesNonSharedAlone();
    await testMergeIdempotentSecondRun();
    await testMergeDryRunMakesNoChanges();
    console.log('[item-equips test] ALL CHECKS PASS (or clearly SKIPped -- see above)');
    process.exit(0);
}

main().catch(err => {
    console.error('[item-equips test] FAIL:', err);
    process.exit(1);
});
