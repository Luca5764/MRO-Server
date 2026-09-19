'use strict';

// D1-6-IMPL (docs/backlog.md, docs/design/d1-step6-battle-broadcast.md §5
// step 2): unit test for ROOM_BATTLE_START_BROADCAST_MODE
// (rooms.isRoomBattleStartBroadcastEnabled()), added to
// dispatch/gate.game.dispatch.js and dispatch/lobby.dispatch.js. Same
// technique as test/room-game-user-broadcast.js.
//
// Scenario: A creates a PvE room (host), B is added directly as a second
// member. A presses F5 (0x00222103) -- both A and B's connections must
// receive Game_Wait_SN, both Game_Info_SN sends, Game_Ready_SN and
// Game_Start_SN. Then A sends BeginRound_CN (0x00230151) -- both connections
// must receive BeginRound_SN.
//
// Run: node test/room-battle-start-broadcast.js  (exit 0 = pass, exit 1 = fail)

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
const LobbyDispatch = require('../dispatch/lobby.dispatch.js');

const CQ_CREATE = 0x00220201;
const GAME_START_CN = 0x00222103;
const BEGIN_ROUND_CN = 0x00230151;
const GAME_WAIT_SN = '0x00420111';
const GAME_INFO_SN = '0x00222111';
const GAME_READY_SN = '0x00222102';
const GAME_START_SN = '0x00222104';
const BEGIN_ROUND_SN = '0x00230152';

function makeCreateBody(name)
{
    const body = Buffer.alloc(51);
    body[0] = 1;
    body[1] = 0;
    body.writeUInt16LE(0, 2);
    body.writeUInt16LE(0, 4);
    body[6] = 5;
    body.writeUInt16LE(0, 7);
    body.writeUInt16LE(0, 9);
    body[11] = 0;
    body.writeUInt16LE(8, 12);
    body.write(name, 14, Math.min(name.length, 25), 'ascii');
    body[39] = 0;
    return body;
}

async function flushMicrotasks(rounds = 20)
{
    for (let i = 0; i < rounds; ++i)
        await new Promise((resolve) => setImmediate(resolve));
}

function countOp(sent, op)
{
    return sent.filter((s) => s.op === op).length;
}

async function main()
{
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    rooms._setRoomBattleStartBroadcastModeForTests('enabled');

    const gate = new GateGameDispatch();
    const lobby = new LobbyDispatch();

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

        while (fakeTimers.fireNext()) { /* drain CQ_CREATE's own room-state retries */ }
        await flushMicrotasks();
        clientA._sent.length = 0;
        clientB._sent.length = 0;

        // --- A (host) presses F5. ---
        const startHandled = gate.dispatch(clientA, GAME_START_CN, Buffer.alloc(0));
        assert.strictEqual(startHandled, true, 'Game_Start_CN 0x00222103 must be handled');

        while (fakeTimers.hasPending()) {
            fakeTimers.fireNext();
            await flushMicrotasks();
        }

        for (const [label, client] of [['A', clientA], ['B', clientB]]) {
            assert.strictEqual(countOp(client._sent, GAME_WAIT_SN), 1, `${label} must receive exactly one Game_Wait_SN`);
            assert.strictEqual(countOp(client._sent, GAME_INFO_SN), 2, `${label} must receive both Game_Info_SN sends (150ms + 600ms retry)`);
            assert.strictEqual(countOp(client._sent, GAME_READY_SN), 1, `${label} must receive exactly one Game_Ready_SN`);
            assert.strictEqual(countOp(client._sent, GAME_START_SN), 1, `${label} must receive exactly one Game_Start_SN`);
        }
        console.log('[room-battle-start-broadcast test] PASS: Game_Wait/Info(x2)/Ready/Start_SN all reach both room members');

        clientA._sent.length = 0;
        clientB._sent.length = 0;

        // --- BeginRound_CN/SN (design §1 row 10). ---
        const beginHandled = lobby.dispatch(clientA, BEGIN_ROUND_CN, Buffer.alloc(0));
        assert.strictEqual(beginHandled, true, 'BeginRound_CN 0x00230151 must be handled');

        assert.strictEqual(countOp(clientA._sent, BEGIN_ROUND_SN), 1, 'A must receive exactly one BeginRound_SN');
        assert.strictEqual(countOp(clientB._sent, BEGIN_ROUND_SN), 1, 'B must receive exactly one BeginRound_SN');
        console.log('[room-battle-start-broadcast test] PASS: BeginRound_SN reaches both room members');
    } finally {
        fakeTimers.restore();
        rooms._resetForTests();
    }

    console.log('[room-battle-start-broadcast test] ALL CHECKS PASS');
    process.exit(0);
}

main().catch((err) => {
    console.error('[room-battle-start-broadcast test] FAIL:', err);
    process.exit(1);
});
