'use strict';

// D1-6-STEP3 (docs/design/d1-step6-battle-broadcast.md §4, backlog D1-6):
// unit test for BATTLE_END_BROADCAST_MODE (rooms.isBattleEndBroadcastEnabled()),
// added to dispatch/lobby.dispatch.js's Campaign_CN 0x00230139 and Death_CN
// 0x00230123 handlers. Same technique as test/room-battle-start-broadcast.js
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
const CAMPAIGN_CN = 0x00230139;
const DEATH_CN = 0x00230123;
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
    rooms._setBattleEndBroadcastModeForTests('enabled');
    LobbyDispatch._setPveRoundAdvanceModeForTest('enabled');

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
