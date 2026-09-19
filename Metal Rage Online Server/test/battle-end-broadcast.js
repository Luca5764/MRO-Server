'use strict';

// D1-6-STEP3 (docs/design/d1-step6-battle-broadcast.md §4, backlog D1-6):
// unit test for the room-wide battle-end broadcast (rooms.js's
// isRoomJoinEnabled() finding a tracked room), added to dispatch/
// lobby.dispatch.js's Campaign_CN 0x00230139 and Death_CN 0x00230123
// handlers. SWITCH-CONVERGE: the BATTLE_END_BROADCAST_MODE switch this used
// to gate was removed once verified live. Same technique as test/room-battle-start-broadcast.js
// and test/round-advance.js: calls the real ZLobbyDispatch.dispatch()
// directly (no socket, no server.js) against two fake clients sharing
// rooms.js's module-level registry, with a fake config/server.js (same
// technique as test/fixed-rank.js) so pveFixedRank is under test control.
//
// Scenario (per the task contract):
//   1. A (host) sends Campaign_CN on the last round -> both A and B receive
//      User_Score_SN 0x00222221 and EndGame_SN 0x00222213.
//   2. B (non-host) sends Campaign_CN -> ignored, nobody receives anything.
//   3. A (host) sends Death_CN -> both A and B receive Death_SN 0x00230124,
//      and the kills/deaths totals live on room.battleStats, shared by both
//      connections (not reset just because a different connection would
//      have sent the next Death_CN).
//
// Run: node test/battle-end-broadcast.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));
const CONFIG_SERVER_PATH = require.resolve(path.join(ROOT, 'config', 'server.js'));

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

// Mutable so this test controls pveFixedRank without touching the
// operator's real config/server.json (same technique as test/fixed-rank.js).
let fakePveFixedRank = 10;
installFakeModule(CONFIG_SERVER_PATH, {
    getPublicHost() { return '127.0.0.1'; },
    getPveExtraLives() { return 0; },
    getPveFixedRank() { return fakePveFixedRank; },
});

const rooms = require('../rooms.js');
const GateGameDispatch = require('../dispatch/gate.game.dispatch.js');
const LobbyDispatch = require('../dispatch/lobby.dispatch.js');

const CQ_CREATE = 0x00220201;
const GAME_START_CN = 0x00222103;
const CAMPAIGN_CN = 0x00230139;
const DEATH_CN = 0x00230123;
const BEGIN_ROUND_CN = 0x00230151;
const USER_SCORE_SN = '0x00222221';
const END_GAME_SN = '0x00222213';
const DEATH_SN = '0x00230124';

function makeCreateBody(name)
{
    const body = Buffer.alloc(51);
    body[0] = 1;                      // roomType: 1 = campaign
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

function makeCampaignCnBody(action)
{
    const body = Buffer.alloc(3);
    body[0] = 1;
    body[1] = 0;
    body[2] = action;
    return body;
}

function makeDeathCnBody(attackerIndex, victimIndex, deathType)
{
    const body = Buffer.alloc(11);
    body.writeUInt16LE(attackerIndex, 0x00);
    body.writeUInt16LE(victimIndex, 0x02);
    body[0x04] = deathType;
    body[0x05] = 0;
    body[0x06] = 0;
    body.writeUInt32LE(0, 0x07);
    return body;
}

function countOp(sent, op)
{
    return sent.filter((s) => s.op === op).length;
}

function lastOfOp(sent, op)
{
    const matches = sent.filter((s) => s.op === op);
    return matches[matches.length - 1];
}

async function flushMicrotasks(rounds = 20)
{
    for (let i = 0; i < rounds; ++i)
        await new Promise((resolve) => setImmediate(resolve));
}

async function main()
{
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    LobbyDispatch._setPveRoundAdvanceModeForTest('enabled');
    // This file doesn't cover HOST_ADDRESS_REQUIRE_MODE (that's
    // test/room-host-address-require.js's job) -- SWITCH-CONVERGE flipped
    // its production default to 'enabled', so force it off here or the
    // fixture's unconfigured hostAddress would block this file's 2-member
    // Game_Start_CN 0x00222103.
    GateGameDispatch._setHostAddressRequireModeForTest('disabled');

    const gate = new GateGameDispatch();
    const lobby = new LobbyDispatch();

    const clientA = makeFakeClient(1, 30907); // host
    const clientB = makeFakeClient(2, 30907); // non-host
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

        // Last round already -- a single Campaign_CN success falls straight
        // through to EndGame_SN, same as round-advance.js's
        // runFiveRoundsCase() clear #5. Set AFTER CQ_CREATE: its own handler
        // (gate.game.dispatch.js:1180) overwrites client.playRound_ from the
        // create body.
        clientA.playRound_ = 1;
        clientB.playRound_ = 1;

        rooms.addMember(roomId, { accountId: 2, nickname: 'Bob', team: 0, slot: 0, ready: false, client: clientB });
        assert.strictEqual(rooms.getRoom(roomId).members.size, 2, 'room must have 2 members');
        assert.strictEqual(rooms.getRoom(roomId).hostAccountId, 1, 'A must be the host');

        while (fakeTimers.fireNext()) { /* drain CQ_CREATE's own room-state retries */ }
        await flushMicrotasks();
        clientA._sent.length = 0;
        clientB._sent.length = 0;

        // --- Case 2 first (order doesn't matter, but checking "nothing
        // happens" before any real traffic makes the assertion unambiguous):
        // B (non-host) sends Campaign_CN -> ignored, no reply to anyone. ---
        const nonHostHandled = lobby.dispatch(clientB, CAMPAIGN_CN, makeCampaignCnBody(1));
        assert.strictEqual(nonHostHandled, true, 'the opcode is still claimed (handled=true), just ignored internally');
        assert.strictEqual(clientA._sent.length, 0, 'A must receive nothing from a non-host Campaign_CN');
        assert.strictEqual(clientB._sent.length, 0, 'B (the non-host sender) must receive nothing either');
        console.log('[battle-end-broadcast test] PASS: a non-host Campaign_CN is ignored, no reply to anyone');

        // --- Case 1: A (host) sends Campaign_CN on the last round -> both
        // receive User_Score_SN and EndGame_SN. ---
        const hostHandled = lobby.dispatch(clientA, CAMPAIGN_CN, makeCampaignCnBody(1));
        assert.strictEqual(hostHandled, true, 'Campaign_CN 0x00230139 must be handled');

        for (const [label, client] of [['A', clientA], ['B', clientB]]) {
            assert.strictEqual(countOp(client._sent, USER_SCORE_SN), 1, `${label} must receive exactly one User_Score_SN`);
            assert.strictEqual(countOp(client._sent, END_GAME_SN), 1, `${label} must receive exactly one EndGame_SN`);
            const rank = lastOfOp(client._sent, USER_SCORE_SN);
            assert.strictEqual(rank.hex.slice(4, 8), '0a00', `${label}'s User_Score_SN WinTeamRank must be 10 (0x0a) LE, got ${rank.hex}`);
        }
        console.log('[battle-end-broadcast test] PASS: host Campaign_CN on the last round broadcasts User_Score_SN + EndGame_SN to both members');

        clientA._sent.length = 0;
        clientB._sent.length = 0;

        // --- Case 3: Death_SN broadcast + shared room.battleStats. A
        // (the P2P host) sends two Death_CN for the same killer/victim
        // pair; both connections must see the same, cumulative K/D. ---
        const death1Handled = lobby.dispatch(clientA, DEATH_CN, makeDeathCnBody(1, 2, 1));
        assert.strictEqual(death1Handled, true, 'Death_CN 0x00230123 must be handled');
        for (const [label, client] of [['A', clientA], ['B', clientB]]) {
            assert.strictEqual(countOp(client._sent, DEATH_SN), 1, `${label} must receive exactly one Death_SN`);
        }
        console.log('[battle-end-broadcast test] PASS: Death_SN reaches both room members');

        const room = rooms.getRoom(roomId);
        assert.ok(room.battleStats instanceof Map, 'room.battleStats must be a Map once Death_CN has been processed');
        assert.strictEqual(room.battleStats.get(1).kills, 1, 'killer (accountId 1) must have 1 kill on room.battleStats');
        assert.strictEqual(room.battleStats.get(2).deaths, 1, 'victim (accountId 2) must have 1 death on room.battleStats');

        // A second Death_CN for the same pair must accumulate on the SAME
        // room-level totals, not reset just because it is a second call --
        // this is the "not tied to the sending connection" behaviour design
        // §4 asks for.
        const death2Handled = lobby.dispatch(clientA, DEATH_CN, makeDeathCnBody(1, 2, 1));
        assert.strictEqual(death2Handled, true, 'second Death_CN 0x00230123 must be handled');
        assert.strictEqual(room.battleStats.get(1).kills, 2, 'killer kills must accumulate to 2 on room.battleStats');
        for (const [label, client] of [['A', clientA], ['B', clientB]]) {
            const death = lastOfOp(client._sent, DEATH_SN);
            // Killer block starts at body+0x31: u16 kills LE.
            const killsLE = death.hex.slice(0x31 * 2, 0x31 * 2 + 4);
            assert.strictEqual(killsLE, '0200', `${label}'s Death_SN must carry the shared kill total (2), got ${killsLE}`);
        }
        console.log('[battle-end-broadcast test] PASS: room.battleStats accumulates across Death_CN calls and both members see the same totals');

        clientA._sent.length = 0;
        clientB._sent.length = 0;

        // --- Sol batch3 review (docs/research/2026-09-19-sol-review/
        // batch3.md, Part B): B (non-host) sends Death_CN -> ignored, no
        // stats change, no packet to anyone. ---
        const nonHostDeathHandled = lobby.dispatch(clientB, DEATH_CN, makeDeathCnBody(2, 1, 1));
        assert.strictEqual(nonHostDeathHandled, true, 'the opcode is still claimed (handled=true), just ignored internally');
        assert.strictEqual(clientA._sent.length, 0, 'A must receive nothing from a non-host Death_CN');
        assert.strictEqual(clientB._sent.length, 0, 'B (the non-host sender) must receive nothing either');
        assert.strictEqual(room.battleStats.get(1).kills, 2, 'a non-host Death_CN must not touch room.battleStats (killer kills stay 2)');
        // accountId 2 already has an entry (victim of the two earlier host
        // Death_CN calls) -- assert its kills stay 0, i.e. the non-host
        // Death_CN (attacker=2) did not credit it a kill.
        assert.strictEqual(room.battleStats.get(2).kills, 0, 'a non-host Death_CN must not credit its sender a kill on room.battleStats');
        console.log('[battle-end-broadcast test] PASS: a non-host Death_CN is ignored, no reply to anyone, no stats change');

        // --- Sol batch3 review (docs/research/2026-09-19-sol-review/
        // batch3.md, Part B "需修改 -- round/reset ownership"): a
        // BeginRound_CN rejected by the host/dedup check must NOT wipe
        // room.battleStats -- the reset lives inside that acceptance branch
        // (lobby.dispatch.js's case 0x00230151). ---
        const statsBeforeBeginRound = room.battleStats.get(1).kills;
        assert.strictEqual(statsBeforeBeginRound, 2, 'sanity: room.battleStats still has 2 kills going into the BeginRound_CN case');

        // Duplicate/non-host BeginRound_CN attempts, all inside the dedup
        // window right after the first accepted one below -- each must
        // leave room.battleStats untouched.
        const firstBeginHandled = lobby.dispatch(clientA, BEGIN_ROUND_CN, Buffer.alloc(0));
        assert.strictEqual(firstBeginHandled, true, 'first BeginRound_CN must be handled');
        assert.strictEqual(room.battleStats.size, 0, 'the FIRST accepted BeginRound_CN (host, not a duplicate) legitimately resets room.battleStats to an empty Map');

        // Re-accumulate a kill, then send a duplicate (same host, inside
        // the dedup window) and a non-host BeginRound_CN -- neither is
        // accepted, so neither may reset room.battleStats again.
        lobby.dispatch(clientA, DEATH_CN, makeDeathCnBody(1, 2, 1));
        assert.strictEqual(room.battleStats.get(1).kills, 1, 'sanity: re-accumulated 1 kill after the legitimate reset');

        const dupBeginHandled = lobby.dispatch(clientA, BEGIN_ROUND_CN, Buffer.alloc(0));
        assert.strictEqual(dupBeginHandled, true, 'duplicate BeginRound_CN inside the dedup window is still claimed (handled=true)');
        assert.strictEqual(room.battleStats.get(1).kills, 1, 'a duplicate BeginRound_CN rejected by the dedup window must NOT reset room.battleStats');

        const nonHostBeginHandled = lobby.dispatch(clientB, BEGIN_ROUND_CN, Buffer.alloc(0));
        assert.strictEqual(nonHostBeginHandled, true, 'non-host BeginRound_CN is still claimed (handled=true)');
        assert.strictEqual(room.battleStats.get(1).kills, 1, 'a non-host BeginRound_CN must NOT reset room.battleStats either');
        console.log('[battle-end-broadcast test] PASS: BeginRound_CN only resets room.battleStats when actually accepted (host, past the dedup window)');

        // --- Sol batch3 review (docs/research/2026-09-19-sol-review/
        // batch3.md Part B "需修改 -- round/reset ownership"): the
        // room.pveRoundsCleared_ reset on Game_Start_CN 0x00222103
        // (gate.game.dispatch.js, commit dba178e) must only fire for the
        // room's current host, not any tracked member. ---
        room.pveRoundsCleared_ = 3; // simulate mid-match state from a previous battle
        const nonHostStartHandled = gate.dispatch(clientB, GAME_START_CN, Buffer.alloc(0));
        assert.strictEqual(nonHostStartHandled, true, 'non-host Game_Start_CN 0x00222103 is still claimed (handled=true)');
        assert.strictEqual(room.pveRoundsCleared_, 3, 'a non-host Game_Start_CN must NOT reset room.pveRoundsCleared_');
        while (fakeTimers.fireNext()) { /* drain whatever this (unintended, non-host) F5 press queued */ }
        await flushMicrotasks();

        const hostStartHandled = gate.dispatch(clientA, GAME_START_CN, Buffer.alloc(0));
        assert.strictEqual(hostStartHandled, true, 'host Game_Start_CN 0x00222103 must be handled');
        assert.strictEqual(room.pveRoundsCleared_, 0, 'the host Game_Start_CN must reset room.pveRoundsCleared_ to 0');
        while (fakeTimers.fireNext()) { /* drain the host's own F5 press */ }
        await flushMicrotasks();
        console.log('[battle-end-broadcast test] PASS: Game_Start_CN 0x00222103 only resets room.pveRoundsCleared_ for the room host');
    } finally {
        fakeTimers.restore();
        rooms._resetForTests();
    }

    console.log('[battle-end-broadcast test] ALL CHECKS PASS');
    process.exit(0);
}

main().catch((err) => {
    console.error('[battle-end-broadcast test] FAIL:', err);
    process.exit(1);
});
