'use strict';

// P3 step 2 (docs/design/p3-step1-writeback.md §2.2, high-tier review
// 2026-09-20 point 1): unit test for dispatch/room/match-stats.js and its
// wiring into gate.game.dispatch.js (0x00222103)/lobby.dispatch.js
// (0x00230151/0x00230123/0x00230139)/dispatch/room/room-leave.js. Same
// technique as test/battle-end-broadcast.js: calls the real dispatch()
// methods directly (no socket, no server.js) against two fake clients
// sharing rooms.js's module-level registry, with MATCH_STATS_MODE (default
// 'disabled') and PVE_ROUND_ADVANCE_MODE flipped on via their test-only
// setters.
//
// Cases (per the task contract "unit tests for attribution and round
// timing"):
//   1. Switch off (default): room.matchStats never gets created, no
//      MATCH-SUMMARY/MATCH-ABORTED marker, even though the same opcodes
//      flow through the same handlers.
//   2. Switch on, a 2-round match: Game_Start_CN starts room.matchStats
//      with the room's mapId/playRound/hostAccountId; each BeginRound_CN
//      starts a round; each Death_CN attributes kills/deaths to the
//      *accountId* in the body (index 0 = AI, never gets a participant
//      entry) and bumps the round's death_cn_count; the R-ROUND round-end
//      branch closes round 1 into matchStats.rounds; the last round's
//      Campaign_CN (falls through to EndGame_SN) emits one MATCH-SUMMARY
//      marker with both rounds, correct participants, result, map_id,
//      difficulty and round_target.
//   3. Switch on, host leaves before EndGame_SN: one MATCH-ABORTED marker,
//      no MATCH-SUMMARY -- and matchStats.finalized prevents a stray later
//      EndGame_SN-equivalent from emitting a second marker.
//
// Run: node test/match-stats.js  (exit 0 = pass, exit 1 = fail)

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
installFakeModule(CONFIG_SERVER_PATH, {
    getPublicHost() { return '127.0.0.1'; },
    getPveExtraLives() { return 0; },
    getPveFixedRank() { return undefined; },
});

const rooms = require('../rooms.js');
const GateGameDispatch = require('../dispatch/gate.game.dispatch.js');
const LobbyDispatch = require('../dispatch/lobby.dispatch.js');
const matchStats = require('../dispatch/room/match-stats.js');
const packetlog = require('../packetlog.js');

const CQ_CREATE = 0x00220201;
const GAME_START_CN = 0x00222103;
const CAMPAIGN_CN = 0x00230139;
const DEATH_CN = 0x00230123;
const BEGIN_ROUND_CN = 0x00230151;
const LEAVE_CQ = 0x00220234;

function makeCreateBody(name, mapId, playRound)
{
    const body = Buffer.alloc(51);
    body[0] = 1;                      // roomType: 1 = campaign
    body[1] = 0;
    body.writeUInt16LE(0, 2);
    body.writeUInt16LE(0, 4);
    body[6] = playRound;              // also read as `mapId` locally, see
                                       // gate.game.dispatch.js:1177 -- both
                                       // are overwritten directly below once
                                       // the room exists, same as
                                       // battle-end-broadcast.js's pattern.
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

async function flushMicrotasks(rounds = 20)
{
    for (let i = 0; i < rounds; ++i)
        await new Promise((resolve) => setImmediate(resolve));
}

function captureMarkers(predicate)
{
    const captured = [];
    const realMarker = packetlog.marker;
    packetlog.marker = (text, src) => {
        if (predicate(text)) captured.push(text);
        realMarker(text, src);
    };
    return {
        captured,
        restore() { packetlog.marker = realMarker; },
    };
}

async function setUpTwoMemberRoom(clientA, clientB, gate, fakeTimers, mapId, playRound)
{
    const createHandled = gate.dispatch(clientA, CQ_CREATE, makeCreateBody('Alice Room', mapId, playRound));
    assert.strictEqual(createHandled, true, 'CQ_CREATE must be handled');
    const roomId = clientA.createdRoomIndex_;
    assert.ok(roomId, 'A must have a createdRoomIndex_ after CQ_CREATE');

    rooms.addMember(roomId, { accountId: 2, nickname: 'Bob', team: 0, slot: 0, ready: false, client: clientB });
    const room = rooms.getRoom(roomId);
    assert.strictEqual(room.members.size, 2, 'room must have 2 members');
    assert.strictEqual(room.hostAccountId, 1, 'A must be the host');

    // Overwrite mapId/playRound directly -- CQ_CREATE's body only carries
    // one byte shared (per its own comment) between mapId and playRound;
    // same override pattern battle-end-broadcast.js uses for playRound_.
    room.mapId = mapId;
    room.playRound = playRound;
    clientA.playRound_ = playRound;
    clientB.playRound_ = playRound;

    while (fakeTimers.fireNext()) { /* drain CQ_CREATE's own room-state retries */ }
    await flushMicrotasks();
    clientA._sent.length = 0;
    clientB._sent.length = 0;
    return room;
}

async function testSwitchOffIsNoOp()
{
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    LobbyDispatch._setPveRoundAdvanceModeForTest('disabled');
    matchStats._setMatchStatsModeForTest('disabled');
    GateGameDispatch._setHostAddressRequireModeForTest('disabled');

    const gate = new GateGameDispatch();
    const lobby = new LobbyDispatch();
    const clientA = makeFakeClient(1, 30907);
    const clientB = makeFakeClient(2, 30907);
    clientA.accountId_ = 1; clientB.accountId_ = 2;
    clientA.nickname_ = 'Alice'; clientB.nickname_ = 'Bob';
    clientA.pilot_ = 101; clientB.pilot_ = 102;
    clientA.currentHangarSlot_ = 1; clientB.currentHangarSlot_ = 2;

    const fakeTimers = installFakeTimers();
    const markers = captureMarkers((t) => t.startsWith('MATCH-'));
    try {
        const room = await setUpTwoMemberRoom(clientA, clientB, gate, fakeTimers, 9001, 1);

        gate.dispatch(clientA, GAME_START_CN, Buffer.alloc(0));
        while (fakeTimers.fireNext()) { /* drain */ }
        await flushMicrotasks();
        assert.strictEqual(room.matchStats, undefined, 'switch off: Game_Start_CN must not create room.matchStats');

        lobby.dispatch(clientA, BEGIN_ROUND_CN, Buffer.alloc(0));
        lobby.dispatch(clientA, DEATH_CN, makeDeathCnBody(1, 2, 1));
        lobby.dispatch(clientA, CAMPAIGN_CN, makeCampaignCnBody(1)); // last round (playRound=1) -> EndGame_SN
        assert.strictEqual(room.matchStats, undefined, 'switch off: room.matchStats must stay undefined through a full match');
        assert.strictEqual(markers.captured.length, 0, 'switch off: no MATCH-SUMMARY/MATCH-ABORTED marker must be emitted');
        console.log('[match-stats test] PASS: MATCH_STATS_MODE disabled (default) -- no room.matchStats, no MATCH- marker');
    } finally {
        markers.restore();
        fakeTimers.restore();
        rooms._resetForTests();
    }
}

async function testTwoRoundMatchSummary()
{
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    LobbyDispatch._setPveRoundAdvanceModeForTest('enabled');
    matchStats._setMatchStatsModeForTest('enabled');
    GateGameDispatch._setHostAddressRequireModeForTest('disabled');

    const gate = new GateGameDispatch();
    const lobby = new LobbyDispatch();
    const clientA = makeFakeClient(1, 30907);
    const clientB = makeFakeClient(2, 30907);
    clientA.accountId_ = 1; clientB.accountId_ = 2;
    clientA.nickname_ = 'Alice'; clientB.nickname_ = 'Bob';
    clientA.pilot_ = 101; clientB.pilot_ = 102;
    clientA.currentHangarSlot_ = 1; clientB.currentHangarSlot_ = 2;

    const fakeTimers = installFakeTimers();
    const markers = captureMarkers((t) => t.startsWith('MATCH-'));
    try {
        const room = await setUpTwoMemberRoom(clientA, clientB, gate, fakeTimers, 9002, 2);

        gate.dispatch(clientA, GAME_START_CN, Buffer.alloc(0));
        while (fakeTimers.fireNext()) { /* drain */ }
        await flushMicrotasks();

        assert.ok(room.matchStats, 'Game_Start_CN (host, accepted) must create room.matchStats');
        assert.strictEqual(room.matchStats.mapId, 9002, 'matchStats.mapId must be room.mapId');
        assert.strictEqual(room.matchStats.roundTarget, 2, 'matchStats.roundTarget must be room.playRound');
        assert.strictEqual(room.matchStats.hostAccountId, 1, 'matchStats.hostAccountId must be the room host');
        assert.strictEqual(room.matchStats.rounds.length, 0);
        console.log('[match-stats test] PASS: Game_Start_CN (accepted) creates room.matchStats with map/round/host');

        // --- Round 1 ---
        lobby.dispatch(clientA, BEGIN_ROUND_CN, Buffer.alloc(0));
        assert.ok(room.matchStats.currentRound, 'BeginRound_CN (accepted) must start a round');
        assert.strictEqual(room.matchStats.currentRound.number, 1);
        assert.strictEqual(room.matchStats.currentRound.deathCnCount, 0);

        // A (accountId 1) kills B (accountId 2).
        lobby.dispatch(clientA, DEATH_CN, makeDeathCnBody(1, 2, 1));
        // A kills an AI (victim index 0) -- must count as a kill for A but
        // must NOT create a participants entry for accountId 0.
        lobby.dispatch(clientA, DEATH_CN, makeDeathCnBody(1, 0, 0x0b));

        assert.strictEqual(room.matchStats.currentRound.deathCnCount, 2, 'round 1 must have 2 Death_CN');
        assert.strictEqual(room.matchStats.participants.get(1).kills, 2, 'accountId 1 must have 2 kills (1 player, 1 AI)');
        assert.strictEqual(room.matchStats.participants.get(2).deaths, 1, 'accountId 2 must have 1 death');
        assert.strictEqual(room.matchStats.participants.has(0), false, 'AI (index 0) must never get a participants entry');
        console.log('[match-stats test] PASS: Death_CN attributes kills/deaths by accountId and bumps the round death_cn_count, AI victims excluded');

        // Round 1 of 2 -> R-ROUND round-end branch (EndRound_SN), not the
        // last round yet.
        lobby.dispatch(clientA, CAMPAIGN_CN, makeCampaignCnBody(1));
        assert.strictEqual(room.matchStats.rounds.length, 1, 'R-ROUND round-end must close round 1 into matchStats.rounds');
        assert.strictEqual(room.matchStats.rounds[0].round_number, 1);
        assert.strictEqual(room.matchStats.rounds[0].death_cn_count, 2);
        assert.strictEqual(typeof room.matchStats.rounds[0].duration_seconds, 'number');
        assert.ok(room.matchStats.rounds[0].duration_seconds >= 0);
        assert.strictEqual(room.matchStats.currentRound, null, 'currentRound must be cleared once closed');
        console.log('[match-stats test] PASS: R-ROUND round-end closes the round with duration_seconds + death_cn_count');

        // --- Round 2 (past the 2s BeginRound_CN dedup window) ---
        const realDateNow = Date.now;
        try {
            Date.now = () => realDateNow() + 2500;
            lobby.dispatch(clientA, BEGIN_ROUND_CN, Buffer.alloc(0));
        } finally {
            Date.now = realDateNow;
        }
        assert.ok(room.matchStats.currentRound, 'second BeginRound_CN (past dedup window) must start round 2');
        assert.strictEqual(room.matchStats.currentRound.number, 2);

        // B (accountId 2) kills A (accountId 1) this round.
        lobby.dispatch(clientA, DEATH_CN, makeDeathCnBody(2, 1, 1)); // Death_CN is host-only; A is host, reports B's kill

        // Round 2 of 2 -> last round, falls through to EndGame_SN ->
        // emitMatchSummary.
        lobby.dispatch(clientA, CAMPAIGN_CN, makeCampaignCnBody(1));

        assert.strictEqual(room.matchStats.finalized, true, 'EndGame must finalize matchStats');
        assert.strictEqual(room.matchStats.rounds.length, 2, 'round 2 must also be closed (by emitMatchSummary)');
        assert.strictEqual(room.matchStats.rounds[1].round_number, 2);
        assert.strictEqual(room.matchStats.rounds[1].death_cn_count, 1);

        const summaryMarkers = markers.captured.filter((t) => t.startsWith('MATCH-SUMMARY '));
        assert.strictEqual(summaryMarkers.length, 1, 'exactly one MATCH-SUMMARY marker must be emitted');
        const summary = JSON.parse(summaryMarkers[0].slice('MATCH-SUMMARY '.length));
        assert.strictEqual(summary.map_id, 9002);
        assert.strictEqual(summary.difficulty, (9002 - 9001) % 3, 'difficulty must be (map_id-9001)%3');
        assert.strictEqual(summary.round_target, 2);
        assert.strictEqual(summary.rounds.length, 2);
        assert.strictEqual(summary.result, 1, 'result must be Campaign_CN\'s action byte (1=win)');
        assert.strictEqual(summary.host_account_id, 1);
        assert.strictEqual(summary.is_test, false, 'no isTest wiring exists yet -- must default false');

        const pA = summary.participants.find((p) => p.account_id === 1);
        const pB = summary.participants.find((p) => p.account_id === 2);
        assert.ok(pA && pB, 'both room members must appear in participants');
        assert.strictEqual(pA.kills, 2, 'A: 2 kills from round 1');
        assert.strictEqual(pA.deaths, 1, 'A: 1 death from round 2');
        assert.strictEqual(pB.kills, 1, 'B: 1 kill from round 2 (host-reported)');
        assert.strictEqual(pB.deaths, 1, 'B: 1 death from round 1');
        console.log('[match-stats test] PASS: last-round Campaign_CN emits one MATCH-SUMMARY with both rounds and correct per-account totals');

        const abortedMarkers = markers.captured.filter((t) => t.startsWith('MATCH-ABORTED '));
        assert.strictEqual(abortedMarkers.length, 0, 'a match that reached EndGame_SN must never also emit MATCH-ABORTED');
    } finally {
        markers.restore();
        fakeTimers.restore();
        rooms._resetForTests();
    }
}

async function testHostLeaveBeforeEndGameEmitsAborted()
{
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    LobbyDispatch._setPveRoundAdvanceModeForTest('enabled');
    matchStats._setMatchStatsModeForTest('enabled');
    GateGameDispatch._setHostAddressRequireModeForTest('disabled');

    const gate = new GateGameDispatch();
    const lobby = new LobbyDispatch();
    const clientA = makeFakeClient(1, 30907);
    const clientB = makeFakeClient(2, 30907);
    clientA.accountId_ = 1; clientB.accountId_ = 2;
    clientA.nickname_ = 'Alice'; clientB.nickname_ = 'Bob';
    clientA.pilot_ = 101; clientB.pilot_ = 102;
    clientA.currentHangarSlot_ = 1; clientB.currentHangarSlot_ = 2;

    const fakeTimers = installFakeTimers();
    const markers = captureMarkers((t) => t.startsWith('MATCH-'));
    try {
        const room = await setUpTwoMemberRoom(clientA, clientB, gate, fakeTimers, 9004, 5);

        gate.dispatch(clientA, GAME_START_CN, Buffer.alloc(0));
        while (fakeTimers.fireNext()) { /* drain */ }
        await flushMicrotasks();
        lobby.dispatch(clientA, BEGIN_ROUND_CN, Buffer.alloc(0));
        lobby.dispatch(clientA, DEATH_CN, makeDeathCnBody(1, 2, 1));
        assert.ok(room.matchStats && !room.matchStats.finalized, 'sanity: a match is in progress, not finalized');

        // Host (A) presses Leave_CQ mid-match, before any EndGame_SN.
        const leaveHandled = gate.dispatch(clientA, LEAVE_CQ, Buffer.from([0x02])); // sub=0x2, matches room-leave usage elsewhere
        assert.strictEqual(leaveHandled, true, 'Leave_CQ 0x00220234 must be handled');

        assert.strictEqual(room.matchStats.finalized, true, 'matchStats must be finalized once the host leaves mid-match');
        const abortedMarkers = markers.captured.filter((t) => t.startsWith('MATCH-ABORTED '));
        assert.strictEqual(abortedMarkers.length, 1, 'exactly one MATCH-ABORTED marker must be emitted');
        const aborted = JSON.parse(abortedMarkers[0].slice('MATCH-ABORTED '.length));
        assert.strictEqual(aborted.host_account_id, 1);
        assert.strictEqual(aborted.map_id, 9004);
        assert.strictEqual(aborted.reason, 'host-left');
        assert.strictEqual(aborted.rounds_completed, 0, 'round 1 was still open (not closed by an R-ROUND round-end) when the host left');

        const summaryMarkers = markers.captured.filter((t) => t.startsWith('MATCH-SUMMARY '));
        assert.strictEqual(summaryMarkers.length, 0, 'an aborted match must never also emit MATCH-SUMMARY');
        console.log('[match-stats test] PASS: host leaving mid-match emits one MATCH-ABORTED, no MATCH-SUMMARY, matchStats.finalized guards against a second marker');
    } finally {
        markers.restore();
        fakeTimers.restore();
        rooms._resetForTests();
    }
}

async function main()
{
    await testSwitchOffIsNoOp();
    await testTwoRoundMatchSummary();
    await testHostLeaveBeforeEndGameEmitsAborted();
    console.log('[match-stats test] ALL CHECKS PASS');
    process.exit(0);
}

main().catch((err) => {
    console.error('[match-stats test] FAIL:', err);
    process.exit(1);
});
