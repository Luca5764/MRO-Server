'use strict';

// D1-6-IMPL (docs/backlog.md, docs/design/d1-step6-battle-broadcast.md §5
// step 2): unit test for the room-wide battle-start broadcast (rooms.js's
// isRoomJoinEnabled() finding a tracked room), added to
// dispatch/gate.game.dispatch.js and dispatch/lobby.dispatch.js. Same
// technique as test/room-game-user-broadcast.js. SWITCH-CONVERGE: the
// ROOM_BATTLE_START_BROADCAST_MODE switch this used to gate was removed
// once verified live.
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
    // This file doesn't cover HOST_ADDRESS_REQUIRE_MODE (that's
    // test/room-host-address-require.js's job) -- SWITCH-CONVERGE flipped
    // its production default to 'enabled', so force it off here or the
    // fixture's unconfigured hostAddress would block this file's 2-member
    // Game_Start_CN 0x00222103.
    GateGameDispatch._setHostAddressRequireModeForTest('disabled');

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

        // SOL-REVIEW-2 must-fix list (docs/research/2026-09-19-sol-review/
        // batch2.md): gameStarted_/campaignStarted_ must be set
        // synchronously (before any of the setTimeout callbacks even run)
        // on every live room member's own client, not only the trigger's --
        // otherwise a non-host's later 0x00230111 lobby poll would be
        // treated as a real return to the lobby.
        assert.strictEqual(clientA.gameStarted_, true, 'A (host, trigger) must have gameStarted_=true');
        assert.strictEqual(clientB.gameStarted_, true, 'B (non-host) must also have gameStarted_=true, not just the trigger');
        assert.strictEqual(clientA.campaignStarted_, true, 'A must have campaignStarted_=true (PvE room)');
        assert.strictEqual(clientB.campaignStarted_, true, 'B must also have campaignStarted_=true');
        console.log('[room-battle-start-broadcast test] PASS: gameStarted_/campaignStarted_ are set on every live room member, not only the trigger');

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
        const genAfterFirstAccept = rooms.getRoom(roomId).beginRoundGen;
        assert.strictEqual(genAfterFirstAccept, 1, 'room.beginRoundGen must be 1 after the first accepted host CN');
        console.log('[room-battle-start-broadcast test] PASS: BeginRound_SN reaches both room members');

        clientA._sent.length = 0;
        clientB._sent.length = 0;

        // SOL-REVIEW-2 point 5: a non-host BeginRound_CN must be ignored --
        // no reply to anyone, no state change.
        const nonHostBeginHandled = lobby.dispatch(clientB, BEGIN_ROUND_CN, Buffer.alloc(0));
        assert.strictEqual(nonHostBeginHandled, true, 'the opcode is still claimed (handled=true), just ignored internally');
        assert.strictEqual(clientA._sent.length, 0, 'A must receive nothing from a non-host BeginRound_CN');
        assert.strictEqual(clientB._sent.length, 0, 'B (the non-host sender) must receive nothing either');
        assert.strictEqual(rooms.getRoom(roomId).beginRoundGen, genAfterFirstAccept, 'a non-host CN must not bump beginRoundGen');
        console.log('[room-battle-start-broadcast test] PASS: a non-host BeginRound_CN is ignored, no reply to anyone');

        // SOL-REVIEW-2 point 5: a second host CN that arrives immediately
        // after (well within the 2s dedup window) must also be ignored.
        const dupBeginHandled = lobby.dispatch(clientA, BEGIN_ROUND_CN, Buffer.alloc(0));
        assert.strictEqual(dupBeginHandled, true, 'the opcode is still claimed (handled=true), just ignored internally');
        assert.strictEqual(clientA._sent.length, 0, 'A must receive nothing for a duplicate host BeginRound_CN inside the dedup window');
        assert.strictEqual(clientB._sent.length, 0, 'B must receive nothing for a duplicate host BeginRound_CN inside the dedup window');
        assert.strictEqual(rooms.getRoom(roomId).beginRoundGen, genAfterFirstAccept, 'a deduped CN must not bump beginRoundGen');
        console.log('[room-battle-start-broadcast test] PASS: a duplicate host BeginRound_CN inside the 2s window is ignored');

        // Past the dedup window (mock Date.now() forward, same technique as
        // fake-timers.js but for wall-clock time instead of setTimeout --
        // this handler reads Date.now() directly, not the fake timer
        // queue's virtual clock), a new round's host CN must broadcast again
        // and bump the generation.
        const realDateNow = Date.now;
        try {
            Date.now = () => realDateNow() + 2500;
            const secondRoundHandled = lobby.dispatch(clientA, BEGIN_ROUND_CN, Buffer.alloc(0));
            assert.strictEqual(secondRoundHandled, true, 'BeginRound_CN 0x00230151 must be handled');
            assert.strictEqual(countOp(clientA._sent, BEGIN_ROUND_SN), 1, 'A must receive exactly one BeginRound_SN for the new round');
            assert.strictEqual(countOp(clientB._sent, BEGIN_ROUND_SN), 1, 'B must receive exactly one BeginRound_SN for the new round');
            assert.strictEqual(rooms.getRoom(roomId).beginRoundGen, genAfterFirstAccept + 1, 'beginRoundGen must bump past the dedup window');
        } finally {
            Date.now = realDateNow;
        }
        console.log('[room-battle-start-broadcast test] PASS: a host CN past the dedup window starts a new round and bumps beginRoundGen');
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
