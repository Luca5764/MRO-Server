'use strict';

// P3 step 3 (docs/design/p3-step1-writeback.md, docs/design/
// p3-step3-writeback-impl.md): unit tests for dispatch/room/match-stats.js's
// MATCH_WRITEBACK_MODE (scheduleMatchWriteback()), against a fake
// database/db.js -- never a real MySQL connection. Calls matchStats's own
// exported functions directly against a hand-built room fixture (same
// technique test/match-stats.js's testIsTestPropagatesFromAnyParticipant()
// uses), not the full gate/lobby dispatch flow -- what is under test here is
// the writeback payload/accumulation math and the MATCH_WRITEBACK_MODE
// switch/error-handling behaviour, both already covered by
// test/match-stats.js for the opcode-flow side.
//
// Sol batch6 review (docs/research/2026-09-20-sol-review/p3.md, "需修改 --
// 整場寫回不是原子操作"): db.recordMatch()/db.applyMatchAccumulation() were
// merged into one db.recordMatchWithAccumulation(match, rounds, participants,
// accumulations) call -- these tests were updated to spy on that single
// function instead of two.
//
// Cases (task contract "one full match; matches row fields, N round rows,
// participants, accumulation math, aborted -> nothing written, switch off ->
// nothing at all, DB error -> logged and swallowed"):
//   1. Switch off (MATCH_STATS_MODE enabled, MATCH_WRITEBACK_MODE disabled):
//      emitMatchSummary still emits its MATCH-SUMMARY marker (step 2,
//      unaffected) but db.recordMatchWithAccumulation is never called.
//   2. Both switches on, a 2-round match: db.recordMatchWithAccumulation is
//      called once with the correct matches/rounds/participants payload and
//      one accumulations[] entry per participant (exp/point = kills *
//      EXP_PER_KILL/POINT_PER_KILL, wins/losses from the match result,
//      mechType from client.currentHangarSlot_).
//   3. Aborted match (emitMatchAborted, never reaches EndGame_SN):
//      db.recordMatchWithAccumulation is never called, even with both
//      switches on (ABORTED_MATCHES_ARE_NOT_PERSISTED).
//   4. db.recordMatchWithAccumulation rejects: emitMatchSummary() itself does
//      not throw (nothing for a caller in dispatch/lobby.dispatch.js to
//      catch).
//   5. LEAD DECISION (2026-09-20, resolving open question 2 from docs/design/
//      p3-step3-writeback-impl.md §6): an is_test match still calls
//      db.recordMatchWithAccumulation (matches/match_rounds/
//      match_participants rows are written, is_test=true) but with an empty
//      accumulations[] array -- a dedicated test account must never pollute
//      real records/mech_levels totals.
//
// Run: node test/match-writeback.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const db = require(path.join(ROOT, 'database', 'db.js'));
const matchStats = require(path.join(ROOT, 'dispatch', 'room', 'match-stats.js'));
const packetlog = require(path.join(ROOT, 'packetlog.js'));

async function flushAsync(rounds = 20)
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

function captureConsoleError()
{
    const captured = [];
    const real = console.error;
    console.error = (...args) => { captured.push(args.join(' ')); };
    return {
        captured,
        restore() { console.error = real; },
    };
}

function makeRoom()
{
    return {
        id: 42,
        members: new Map([
            [1, { accountId: 1, team: 0, client: { currentHangarSlot_: 3, isTestAccount_: false } }],
            [2, { accountId: 2, team: 0, client: { currentHangarSlot_: 5, isTestAccount_: false } }],
        ]),
    };
}

/** Same as makeRoom(), but account 2 is a configured test account. */
function makeRoomWithTestAccount()
{
    return {
        id: 43,
        members: new Map([
            [1, { accountId: 1, team: 0, client: { currentHangarSlot_: 3, isTestAccount_: false } }],
            [2, { accountId: 2, team: 0, client: { currentHangarSlot_: 5, isTestAccount_: true } }],
        ]),
    };
}

/** Plays a fixed 2-round match through matchStats's own exported functions. */
function playTwoRoundMatch(room)
{
    matchStats.startMatch(room, { hostAccountId: 1, mapId: 9002, roundTarget: 2 });
    matchStats.beginRound(room);
    matchStats.recordDeathCn(room, 1, 2); // account 1 kills account 2
    matchStats.recordDeathCn(room, 1, 2); // account 1 kills account 2 again
    matchStats.closeRound(room); // round 1 done (2 kills, 2 deaths_cn)
    matchStats.beginRound(room);
    matchStats.recordDeathCn(room, 2, 1); // account 2 kills account 1
    // round 2 left open -- emitMatchSummary() below closes it itself.
}

function installDbSpies()
{
    const recordMatchCalls = [];
    const original = db.recordMatchWithAccumulation;

    db.recordMatchWithAccumulation = async (match, rounds, participants, accumulations) => {
        recordMatchCalls.push({ match, rounds, participants, accumulations });
        return 12345; // fake matches.id
    };

    return {
        recordMatchCalls,
        restore() {
            db.recordMatchWithAccumulation = original;
        },
    };
}

async function testSwitchOffNoWriteback()
{
    matchStats._setMatchStatsModeForTest('enabled');
    matchStats._setMatchWritebackModeForTest('disabled');
    const spies = installDbSpies();
    const markers = captureMarkers((t) => t.startsWith('MATCH-'));

    try {
        const room = makeRoom();
        playTwoRoundMatch(room);
        matchStats.emitMatchSummary(room, { result: 1 });
        await flushAsync();

        assert.strictEqual(spies.recordMatchCalls.length, 0, 'MATCH_WRITEBACK_MODE disabled: db.recordMatchWithAccumulation must never be called');
        const summaryMarkers = markers.captured.filter((t) => t.startsWith('MATCH-SUMMARY '));
        assert.strictEqual(summaryMarkers.length, 1, 'step 2 behaviour (MATCH-SUMMARY marker) must be unaffected by the writeback switch being off');
        const writebackMarkers = markers.captured.filter((t) => t.startsWith('MATCH-WRITEBACK'));
        assert.strictEqual(writebackMarkers.length, 0, 'no MATCH-WRITEBACK-OK/FAILED marker when the switch is off');

        console.log('[match-writeback test] PASS: MATCH_WRITEBACK_MODE disabled (default) -- no DB calls, MATCH-SUMMARY still emitted');
    } finally {
        markers.restore();
        spies.restore();
        matchStats._setMatchStatsModeForTest('disabled');
        matchStats._setMatchWritebackModeForTest('disabled');
    }
}

async function testFullMatchWriteback()
{
    matchStats._setMatchStatsModeForTest('enabled');
    matchStats._setMatchWritebackModeForTest('enabled');
    const spies = installDbSpies();
    const markers = captureMarkers((t) => t.startsWith('MATCH-'));

    try {
        const room = makeRoom();
        playTwoRoundMatch(room);
        matchStats.emitMatchSummary(room, { result: 1 }); // win
        await flushAsync();

        assert.strictEqual(spies.recordMatchCalls.length, 1, 'expected exactly one db.recordMatchWithAccumulation call');
        const { match, rounds, participants, accumulations } = spies.recordMatchCalls[0];

        // --- matches row fields ---
        assert.strictEqual(match.roomId, 42);
        assert.strictEqual(match.mapId, 9002);
        assert.strictEqual(match.difficulty, (9002 - 9001) % 3, 'difficulty must be (map_id-9001)%3');
        assert.strictEqual(match.roundTarget, 2);
        assert.strictEqual(match.hostAccountId, 1);
        assert.strictEqual(typeof match.startedAtMs, 'number');
        assert.strictEqual(typeof match.endedAtMs, 'number');
        assert.ok(match.endedAtMs >= match.startedAtMs, 'endedAtMs must not be before startedAtMs');
        assert.strictEqual(match.result, 1);
        assert.strictEqual(match.winTeamRank, 0);
        assert.strictEqual(match.isTest, false);
        assert.strictEqual(match.suspicious, false);

        // --- N round rows ---
        assert.strictEqual(rounds.length, 2, 'expected 2 round rows (both rounds closed)');
        assert.strictEqual(rounds[0].roundNumber, 1);
        assert.strictEqual(rounds[0].deathCnCount, 2, 'round 1 had 2 Death_CN');
        assert.strictEqual(rounds[1].roundNumber, 2);
        assert.strictEqual(rounds[1].deathCnCount, 1, 'round 2 had 1 Death_CN (closed by emitMatchSummary itself)');
        for (const round of rounds) {
            assert.strictEqual(typeof round.startedAtMs, 'number');
            assert.strictEqual(typeof round.durationSeconds, 'number');
            assert.ok(round.durationSeconds >= 0);
            assert.strictEqual(round.suspicious, false);
        }

        // --- participants ---
        assert.strictEqual(participants.length, 2);
        const p1 = participants.find((p) => p.accountId === 1);
        const p2 = participants.find((p) => p.accountId === 2);
        assert.ok(p1 && p2, 'both room members must appear in the participants payload');
        assert.strictEqual(p1.kills, 2, 'account 1: 2 kills (round 1)');
        assert.strictEqual(p1.deaths, 1, 'account 1: 1 death (round 2)');
        assert.strictEqual(p1.expGained, 20, 'expGained = kills * EXP_PER_KILL (10)');
        assert.strictEqual(p1.pointGained, 20, 'pointGained = kills * POINT_PER_KILL (10)');
        assert.strictEqual(p1.team, 0);
        assert.strictEqual(p1.result, 1, 'PvE co-op: every participant shares the match result');
        assert.strictEqual(p1.mechType, 3, 'mechType must come from client.currentHangarSlot_');

        assert.strictEqual(p2.kills, 1, 'account 2: 1 kill (round 2)');
        assert.strictEqual(p2.deaths, 2, 'account 2: 2 deaths (round 1, killed by account 1 twice)');
        assert.strictEqual(p2.expGained, 10);
        assert.strictEqual(p2.pointGained, 10);
        assert.strictEqual(p2.mechType, 5);

        // --- accumulation math (same one-transaction call's accumulations[] array) ---
        assert.strictEqual(accumulations.length, 2, 'expected one accumulations[] entry per participant');
        const acc1 = accumulations.find((a) => a.accountId === 1);
        const acc2 = accumulations.find((a) => a.accountId === 2);

        assert.deepStrictEqual(acc1, {
            accountId: 1,
            exp: 20, wins: 1, losses: 0,
            kills: 2, deaths: 1,
            mechType: 3, mechExp: 20, mechKills: 2, mechDeaths: 1, mechSorties: 1,
        }, 'account 1 accumulation delta must match kills/deaths/exp and a win, never an overwrite');

        assert.deepStrictEqual(acc2, {
            accountId: 2,
            exp: 10, wins: 1, losses: 0,
            kills: 1, deaths: 2,
            mechType: 5, mechExp: 10, mechKills: 1, mechDeaths: 2, mechSorties: 1,
        }, 'account 2 accumulation delta must match kills/deaths/exp and a win');

        const okMarkers = markers.captured.filter((t) => t.startsWith('MATCH-WRITEBACK-OK '));
        assert.strictEqual(okMarkers.length, 1, 'expected exactly one MATCH-WRITEBACK-OK marker');
        assert.ok(okMarkers[0].includes('matchId=12345'), 'MATCH-WRITEBACK-OK must include the matchId db.recordMatchWithAccumulation returned');

        console.log('[match-writeback test] PASS: a full 2-round match writes correct matches/rounds/participants rows and accumulation deltas in one call');
    } finally {
        markers.restore();
        spies.restore();
        matchStats._setMatchStatsModeForTest('disabled');
        matchStats._setMatchWritebackModeForTest('disabled');
    }
}

async function testAbortedMatchNotWritten()
{
    matchStats._setMatchStatsModeForTest('enabled');
    matchStats._setMatchWritebackModeForTest('enabled');
    const spies = installDbSpies();
    const markers = captureMarkers((t) => t.startsWith('MATCH-'));

    try {
        const room = makeRoom();
        playTwoRoundMatch(room);
        matchStats.emitMatchAborted(room, 'host-left'); // never reached EndGame_SN
        await flushAsync();

        assert.strictEqual(spies.recordMatchCalls.length, 0, 'ABORTED_MATCHES_ARE_NOT_PERSISTED: db.recordMatchWithAccumulation must never be called for an aborted match');
        const abortedMarkers = markers.captured.filter((t) => t.startsWith('MATCH-ABORTED '));
        assert.strictEqual(abortedMarkers.length, 1, 'the (memory/log-only) MATCH-ABORTED marker must still be emitted');

        console.log('[match-writeback test] PASS: an aborted match writes nothing to the DB, even with MATCH_WRITEBACK_MODE enabled');
    } finally {
        markers.restore();
        spies.restore();
        matchStats._setMatchStatsModeForTest('disabled');
        matchStats._setMatchWritebackModeForTest('disabled');
    }
}

async function testDbErrorIsLoggedAndSwallowed()
{
    matchStats._setMatchStatsModeForTest('enabled');
    matchStats._setMatchWritebackModeForTest('enabled');
    const original = db.recordMatchWithAccumulation;
    db.recordMatchWithAccumulation = async () => { throw new Error('fake DB connection refused'); };
    const markers = captureMarkers((t) => t.startsWith('MATCH-'));
    const errors = captureConsoleError();

    try {
        const room = makeRoom();
        playTwoRoundMatch(room);

        // The dispatch-path call itself must not throw -- there is nothing
        // synchronous downstream of emitMatchSummary() that could catch it.
        assert.doesNotThrow(() => {
            matchStats.emitMatchSummary(room, { result: 1 });
        }, 'emitMatchSummary() must never throw synchronously, even if the DB write it schedules will fail');

        await flushAsync();

        assert.ok(errors.captured.some((line) => line.includes('fake DB connection refused')), 'the DB error must be logged via console.error');
        const failedMarkers = markers.captured.filter((t) => t.startsWith('MATCH-WRITEBACK-FAILED '));
        assert.strictEqual(failedMarkers.length, 1, 'expected exactly one MATCH-WRITEBACK-FAILED marker');
        assert.ok(failedMarkers[0].includes('fake DB connection refused'), 'the marker should include the error message');
        const okMarkers = markers.captured.filter((t) => t.startsWith('MATCH-WRITEBACK-OK '));
        assert.strictEqual(okMarkers.length, 0, 'must not also emit a success marker');

        console.log('[match-writeback test] PASS: a db.recordMatchWithAccumulation failure is logged (console.error + MATCH-WRITEBACK-FAILED) and swallowed, never thrown');
    } finally {
        markers.restore();
        errors.restore();
        db.recordMatchWithAccumulation = original;
        matchStats._setMatchStatsModeForTest('disabled');
        matchStats._setMatchWritebackModeForTest('disabled');
    }
}

// LEAD DECISION (2026-09-20, resolving open question 2 from docs/design/
// p3-step3-writeback-impl.md §6): an is_test match's rows are still written
// (is_test=true, useful for debugging the writeback pipeline itself), but
// it must never accumulate into records/mech_levels -- a dedicated test
// account (docs/reference/unattended-policy.md, docs/backlog.md AUTO
// section) exists precisely so unattended/cheated runs never pollute real
// stats, and accumulation is exactly that pollution. Sol batch6 review
// point 3: this is now expressed as an empty accumulations[] array passed
// to the single recordMatchWithAccumulation() call, not a separate
// early-return before a second DB call.
async function testIsTestMatchRecordedButNotAccumulated()
{
    matchStats._setMatchStatsModeForTest('enabled');
    matchStats._setMatchWritebackModeForTest('enabled');
    const spies = installDbSpies();
    const markers = captureMarkers((t) => t.startsWith('MATCH-'));

    try {
        const room = makeRoomWithTestAccount(); // account 2 is a test account
        playTwoRoundMatch(room);
        matchStats.emitMatchSummary(room, { result: 1 });
        await flushAsync();

        assert.strictEqual(spies.recordMatchCalls.length, 1, 'an is_test match must still call db.recordMatchWithAccumulation');
        const { match, rounds, participants, accumulations } = spies.recordMatchCalls[0];
        assert.strictEqual(match.isTest, true, 'matches.is_test must be true (host OR any participant is the test account)');
        assert.strictEqual(rounds.length, 2, 'match_rounds rows must still be written for an is_test match');
        assert.strictEqual(participants.length, 2, 'match_participants rows must still be written for an is_test match');

        assert.strictEqual(accumulations.length, 0, 'an is_test match must pass an EMPTY accumulations[] array -- never accumulate for any participant');

        const okMarkers = markers.captured.filter((t) => t.startsWith('MATCH-WRITEBACK-OK '));
        assert.strictEqual(okMarkers.length, 1, 'expected exactly one MATCH-WRITEBACK-OK marker');
        assert.ok(okMarkers[0].includes('isTest=true'), 'the success marker should note that this was an is_test match (accumulation skipped)');

        console.log('[match-writeback test] PASS: an is_test match still writes matches/match_rounds/match_participants rows but passes an empty accumulations[] array');
    } finally {
        markers.restore();
        spies.restore();
        matchStats._setMatchStatsModeForTest('disabled');
        matchStats._setMatchWritebackModeForTest('disabled');
    }
}

async function main()
{
    await testSwitchOffNoWriteback();
    await testFullMatchWriteback();
    await testAbortedMatchNotWritten();
    await testDbErrorIsLoggedAndSwallowed();
    await testIsTestMatchRecordedButNotAccumulated();
    console.log('[match-writeback test] ALL CHECKS PASS');
    process.exit(0);
}

main().catch((err) => {
    console.error('[match-writeback test] FAIL:', err);
    process.exit(1);
});
