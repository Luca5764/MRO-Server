'use strict';

// D1-6-IMPL (docs/backlog.md, docs/design/d1-step6-battle-broadcast.md §5
// step 1): unit test for GAME_USER_SN_BROADCAST_MODE, added to
// dispatch/gate.game.dispatch.js + dispatch/room/room-game-user.sender.js.
// Same technique as test/room-join.js: calls the real
// ZGateGameDispatch.dispatch() directly (no socket, no server.js) against
// two fake clients sharing rooms.js's module-level registry, with
// test/fixtures/fake-timers.js standing in for the case 0x00222103
// handler's setTimeout chain.
//
// Scenario: A creates a PvE room (host), B is added directly as a second
// member (same shortcut test/room-join.js's step 4 uses -- rooms.addMember,
// bypassing Enter_CQ). A presses F5 (0x00222103). With
// GAME_USER_SN_BROADCAST_MODE='enabled' (and ROOM_JOIN_MODE on), both A and
// B's connections must each receive one Game_User_SN 0x00222112 per room
// member (2 packets total per connection), each packet's UserIndex equal
// to the record's *subject* accountId -- not always the trigger (A)'s own.
//
// Run: node test/room-game-user-broadcast.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));

const { makeFixtureDb } = require('./fixtures/fake-db.js');
const { makeFakeClient } = require('./fixtures/fake-client.js');
const { installFakeTimers } = require('./fixtures/fake-timers.js');

function installFakeModule(resolvedPath, exportsObj)
{
    const mod = new Module(resolvedPath, null);
    mod.filename = resolvedPath;
    mod.loaded = true;
    mod.exports = exportsObj;
    require.cache[resolvedPath] = mod;
}

installFakeModule(DB_PATH, makeFixtureDb());

const rooms = require('../rooms.js');
const GateGameDispatch = require('../dispatch/gate.game.dispatch.js');

const CQ_CREATE = 0x00220201;
const GAME_START_CN = 0x00222103;
const SN_GAME_USER = '0x00222112';

/**
 * Builds a CQ_CREATE body (same layout as test/room-join.js's
 * makeCreateBody): a PvE campaign room.
 */
function makeCreateBody(name)
{
    const body = Buffer.alloc(51);
    body[0] = 1;                      // roomType: 1 = campaign
    body[1] = 0;                      // createByte1
    body.writeUInt16LE(0, 2);         // createWord1
    body.writeUInt16LE(0, 4);         // createWord2
    body[6] = 5;                      // mapId / playRound (same byte, existing quirk)
    body.writeUInt16LE(0, 7);         // createWord3
    body.writeUInt16LE(0, 9);         // createWord4 (gameMode = 0)
    body[11] = 0;                     // roomNumberFlag
    body.writeUInt16LE(8, 12);        // roomNumberValue
    body.write(name, 14, Math.min(name.length, 25), 'ascii');
    body[39] = 0;                     // no password
    return body;
}

async function flushMicrotasks(rounds = 20)
{
    for (let i = 0; i < rounds; ++i)
        await new Promise((resolve) => setImmediate(resolve));
}

function gameUserRecords(sent)
{
    return sent
        .filter((s) => s.op === SN_GAME_USER)
        .map((s) => {
            const body = Buffer.from(s.hex, 'hex');
            return { userIndex: body.readUInt16LE(0x02), count: body.readUInt8(0x01) };
        });
}

async function main()
{
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    GateGameDispatch._setGameUserSnBroadcastModeForTest('enabled');
    // This file doesn't cover HOST_ADDRESS_REQUIRE_MODE (that's
    // test/room-host-address-require.js's job) -- SWITCH-CONVERGE flipped
    // its production default to 'enabled', so force it off here or the
    // fixture's unconfigured hostAddress would block this file's 2-member
    // Game_Start_CN 0x00222103.
    GateGameDispatch._setHostAddressRequireModeForTest('disabled');

    const gate = new GateGameDispatch();

    const clientA = makeFakeClient(1, 30907);
    const clientB = makeFakeClient(2, 30907);
    clientA.accountId_ = 1;
    clientB.accountId_ = 2;
    clientA.nickname_ = 'Alice';
    clientB.nickname_ = 'Bob';
    clientA.pilot_ = 101;
    clientB.pilot_ = 102;
    clientA.currentHangarSlot_ = 1;
    clientB.currentHangarSlot_ = 2;

    const fakeTimers = installFakeTimers();
    try {
        const createHandled = gate.dispatch(clientA, CQ_CREATE, makeCreateBody('Alice Room'));
        assert.strictEqual(createHandled, true, 'CQ_CREATE must be handled');
        const roomId = clientA.createdRoomIndex_;
        assert.ok(roomId, 'A must have a createdRoomIndex_ after CQ_CREATE');

        rooms.addMember(roomId, { accountId: 2, nickname: 'Bob', team: 0, slot: 0, ready: false, client: clientB });
        assert.strictEqual(rooms.getRoom(roomId).members.size, 2, 'room must have 2 members before F5');

        // Drain CQ_CREATE's own room-state retry timers before F5, same as
        // test/room-join.js, so they are not mistaken for F5-triggered sends.
        while (fakeTimers.fireNext()) { /* run every pending timer */ }
        await flushMicrotasks();
        clientA._sent.length = 0;
        clientB._sent.length = 0;

        // --- A (host) presses F5. ---
        const startHandled = gate.dispatch(clientA, GAME_START_CN, Buffer.alloc(0));
        assert.strictEqual(startHandled, true, 'Game_Start_CN 0x00222103 must be handled');

        // Drain the case handler's setTimeout chain (60/150/300/450/600ms),
        // flushing microtasks between each so sendGameUserBootstrap's
        // db.getItems() awaits resolve before the next timer fires.
        while (fakeTimers.hasPending()) {
            fakeTimers.fireNext();
            await flushMicrotasks();
        }

        const aRecords = gameUserRecords(clientA._sent);
        const bRecords = gameUserRecords(clientB._sent);

        assert.strictEqual(aRecords.length, 2, `A must receive one Game_User_SN per room member (2), got ${aRecords.length}`);
        assert.strictEqual(bRecords.length, 2, `B must receive one Game_User_SN per room member (2), got ${bRecords.length}`);

        for (const rec of [...aRecords, ...bRecords]) {
            assert.strictEqual(rec.count, 1, 'every Game_User_SN must carry count=1 (never batched, 0x400 frame cap)');
        }

        const aUserIndexes = aRecords.map((r) => r.userIndex).sort();
        const bUserIndexes = bRecords.map((r) => r.userIndex).sort();
        assert.deepStrictEqual(aUserIndexes, [1, 2], 'A must see both UserIndex 1 (herself) and 2 (Bob)');
        assert.deepStrictEqual(bUserIndexes, [1, 2], 'B must see both UserIndex 1 (Alice) and 2 (herself)');

        console.log('[room-game-user-broadcast test] PASS: both connections get one Game_User_SN per room member, count=1, correct UserIndexes');
    } finally {
        fakeTimers.restore();
        GateGameDispatch._setGameUserSnBroadcastModeForTest('disabled');
        rooms._resetForTests();
    }

    console.log('[room-game-user-broadcast test] ALL CHECKS PASS');
    process.exit(0);
}

main().catch((err) => {
    console.error('[room-game-user-broadcast test] FAIL:', err);
    process.exit(1);
});
