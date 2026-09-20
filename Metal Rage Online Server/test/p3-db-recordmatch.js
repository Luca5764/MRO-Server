'use strict';

// P3 step 3 (docs/design/p3-step3-writeback-impl.md; Sol batch6 review,
// docs/research/2026-09-20-sol-review/p3.md): SQL-level coverage for
// database/db.js's recordMatchWithAccumulation(), against an in-memory fake
// pool that asserts the exact statements/params issued -- never a real MySQL
// connection. Complements test/match-writeback.js, which only exercises
// dispatch/room/match-stats.js's call site with db.recordMatchWithAccumulation
// entirely mocked out (a function-level spy, no SQL text checked at all);
// this file is what actually proves the SQL that function issues matches
// what the design doc documents.
//
// Sol batch6 review points 3/4 ("需修改 -- 整場寫回不是原子操作" /
// "需修改 -- UPDATE 靜默零列"): db.recordMatch()/db.applyMatchAccumulation()
// used to be two separate functions, each its own transaction -- merged into
// one recordMatchWithAccumulation(match, rounds, participants, accumulations)
// so the whole match (rows + every accumulation UPDATE) commits or rolls
// back together, and every accumulation UPDATE now checks affectedRows === 1
// (throwing, which rolls back the transaction, otherwise).
//
// Cases:
//   1. Insert sequence: matches -> match_rounds(N) -> match_participants(N)
//      -> records/mech_levels accumulation UPDATEs, all inside one
//      transaction, matchId comes from the matches INSERT's insertId.
//   2. A mid-transaction failure during the rounds insert rolls back --
//      neither the participants loop nor any accumulation runs.
//   3. records UPDATE is always `col = col + ?` (never `= ?`), and
//      mech_levels UPDATE is only issued when delta.mechType is given.
//   4. An accumulation UPDATE affecting 0 rows (unknown account_id, or a
//      mechType with no matching mech_levels row) throws and rolls back the
//      WHOLE transaction -- including the matches/match_rounds/
//      match_participants rows already inserted earlier in the same call.
//
// Run: node test/p3-db-recordmatch.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));

function makeFakePool()
{
    const calls = []; // { sql (normalized), params }
    let committed = false;
    let rolledBack = false;
    let nextMatchId = 100;

    function makeConnection(opts)
    {
        return {
            async beginTransaction() { calls.push({ sql: 'BEGIN', params: [] }); },
            async commit() { committed = true; calls.push({ sql: 'COMMIT', params: [] }); },
            async rollback() { rolledBack = true; calls.push({ sql: 'ROLLBACK', params: [] }); },
            release() {},
            async execute(sql, params = [])
            {
                const norm = sql.replace(/\s+/g, ' ').trim();
                calls.push({ sql: norm, params });

                if (norm.startsWith('INSERT INTO matches')) {
                    return [{ insertId: nextMatchId }];
                }
                if (norm.startsWith('INSERT INTO match_rounds')) {
                    if (opts && opts.failOnRound === params[1] /* round_number */) {
                        throw new Error(`fake pool: forced failure on round ${params[1]}`);
                    }
                    return [{ insertId: 0, affectedRows: 1 }];
                }
                if (norm.startsWith('INSERT INTO match_participants')) {
                    return [{ insertId: 0, affectedRows: 1 }];
                }
                if (norm.startsWith('UPDATE records')) {
                    const accountId = params[params.length - 1];
                    if (opts && opts.zeroAffectedForAccount === accountId) {
                        return [{ affectedRows: 0 }];
                    }
                    return [{ affectedRows: 1 }];
                }
                if (norm.startsWith('UPDATE mech_levels')) {
                    const accountId = params[params.length - 2]; // [.., account_id, mech_type]
                    if (opts && opts.zeroAffectedMechForAccount === accountId) {
                        return [{ affectedRows: 0 }];
                    }
                    return [{ affectedRows: 1 }];
                }
                throw new Error(`p3-db-recordmatch test fake pool: unmocked SQL: ${norm}`);
            },
        };
    }

    return {
        calls,
        get committed() { return committed; },
        get rolledBack() { return rolledBack; },
        pool: {
            opts: null, // set by a test before calling recordMatchWithAccumulation
            async getConnection() { return makeConnection(this.opts); },
        },
    };
}

function loadFreshDb()
{
    delete require.cache[DB_PATH];
    return require(DB_PATH);
}

const BASE_MATCH = {
    roomId: 7, mapId: 9002, difficulty: 1, roundTarget: 2, hostAccountId: 1,
    startedAtMs: 1000, endedAtMs: 2000, result: 1, winTeamRank: 0, isTest: false, suspicious: false,
};
const BASE_ROUNDS = [
    { roundNumber: 1, startedAtMs: 1000, durationSeconds: 30, deathCnCount: 2, suspicious: false },
    { roundNumber: 2, startedAtMs: 1500, durationSeconds: 20, deathCnCount: 1, suspicious: false },
];
const BASE_PARTICIPANTS = [
    { accountId: 1, team: 0, kills: 2, deaths: 1, expGained: 20, pointGained: 20, result: 1 },
    { accountId: 2, team: 0, kills: 1, deaths: 2, expGained: 10, pointGained: 10, result: 1 },
];

async function testRecordMatchInsertSequenceWithAccumulation()
{
    const db = loadFreshDb();
    const fake = makeFakePool();
    db.pool.getConnection = fake.pool.getConnection.bind(fake.pool);

    const accumulations = [
        { accountId: 1, exp: 20, wins: 1, losses: 0, kills: 2, deaths: 1, mechType: 3, mechExp: 20, mechKills: 2, mechDeaths: 1, mechSorties: 1 },
        { accountId: 2, exp: 10, wins: 1, losses: 0, kills: 1, deaths: 2 },
    ];

    const matchId = await db.recordMatchWithAccumulation(BASE_MATCH, BASE_ROUNDS, BASE_PARTICIPANTS, accumulations);
    assert.strictEqual(matchId, 100, 'recordMatchWithAccumulation must return the matches INSERT\'s insertId');

    const kinds = fake.calls.map((c) => c.sql.split(' ').slice(0, 3).join(' '));
    assert.deepStrictEqual(kinds, [
        'BEGIN', '',
        'INSERT INTO matches',
        'INSERT INTO match_rounds', 'INSERT INTO match_rounds',
        'INSERT INTO match_participants', 'INSERT INTO match_participants',
        'UPDATE records SET', 'UPDATE mech_levels SET', // account 1 has a mechType
        'UPDATE records SET', // account 2 has no mechType -- no mech_levels UPDATE
        'COMMIT',
    ].filter((s) => s !== ''), `unexpected SQL call sequence: ${JSON.stringify(kinds)}`);

    const matchesCall = fake.calls.find((c) => c.sql.startsWith('INSERT INTO matches'));
    assert.ok(matchesCall.sql.includes('room_id') && matchesCall.sql.includes('map_id')
        && matchesCall.sql.includes('difficulty') && matchesCall.sql.includes('round_target')
        && matchesCall.sql.includes('host_account_id') && matchesCall.sql.includes('started_at')
        && matchesCall.sql.includes('ended_at') && matchesCall.sql.includes('result')
        && matchesCall.sql.includes('win_team_rank') && matchesCall.sql.includes('is_test')
        && matchesCall.sql.includes('suspicious'), 'matches INSERT must name every schema column');
    assert.strictEqual(matchesCall.params[0], 7, 'room_id param');
    assert.strictEqual(matchesCall.params[1], 9002, 'map_id param');
    assert.ok(matchesCall.params[5] instanceof Date, 'started_at param must be a Date (mysql2 DATETIME binding)');
    assert.ok(matchesCall.params[6] instanceof Date, 'ended_at param must be a Date when endedAtMs is given');
    assert.strictEqual(matchesCall.params[9], 0, 'is_test must be bound as 0/1, not a boolean');

    const roundCalls = fake.calls.filter((c) => c.sql.startsWith('INSERT INTO match_rounds'));
    assert.strictEqual(roundCalls.length, 2);
    assert.strictEqual(roundCalls[0].params[0], 100, 'match_rounds.match_id must be the matches insertId');
    assert.strictEqual(roundCalls[0].params[1], 1, 'round_number');
    assert.strictEqual(roundCalls[0].params[4], 2, 'death_cn_count');

    const participantCalls = fake.calls.filter((c) => c.sql.startsWith('INSERT INTO match_participants'));
    assert.strictEqual(participantCalls.length, 2);
    assert.strictEqual(participantCalls[0].params[0], 100, 'match_participants.match_id must be the matches insertId');
    assert.strictEqual(participantCalls[0].params[1], 1, 'account_id');
    assert.strictEqual(participantCalls[0].params[5], 20, 'exp_gained');

    const recordsCalls = fake.calls.filter((c) => c.sql.startsWith('UPDATE records'));
    assert.strictEqual(recordsCalls.length, 2, 'one UPDATE records per accumulations[] entry');
    const mechCalls = fake.calls.filter((c) => c.sql.startsWith('UPDATE mech_levels'));
    assert.strictEqual(mechCalls.length, 1, 'only account 1 (has a mechType) gets an UPDATE mech_levels');

    assert.strictEqual(fake.committed, true);
    assert.strictEqual(fake.rolledBack, false);

    console.log('[p3-db-recordmatch test] PASS: recordMatchWithAccumulation() issues matches -> match_rounds(N) -> match_participants(N) -> accumulation UPDATEs, all inside one transaction');
}

async function testRecordMatchRollsBackOnRoundInsertFailure()
{
    const db = loadFreshDb();
    const fake = makeFakePool();
    fake.pool.opts = { failOnRound: 2 }; // second round's INSERT throws
    db.pool.getConnection = fake.pool.getConnection.bind(fake.pool);

    const accumulations = [{ accountId: 1, exp: 20, wins: 1, losses: 0, kills: 2, deaths: 1 }];

    await assert.rejects(
        () => db.recordMatchWithAccumulation(BASE_MATCH, BASE_ROUNDS, [BASE_PARTICIPANTS[0]], accumulations),
        /forced failure on round 2/,
        'recordMatchWithAccumulation must propagate the underlying error'
    );

    assert.strictEqual(fake.committed, false, 'a failed recordMatchWithAccumulation must never commit');
    assert.strictEqual(fake.rolledBack, true, 'a failed recordMatchWithAccumulation must roll back');
    const participantCalls = fake.calls.filter((c) => c.sql.startsWith('INSERT INTO match_participants'));
    assert.strictEqual(participantCalls.length, 0, 'the participants loop must never run once an earlier round insert has thrown');
    const recordsCalls = fake.calls.filter((c) => c.sql.startsWith('UPDATE records'));
    assert.strictEqual(recordsCalls.length, 0, 'the accumulation loop must never run either');

    console.log('[p3-db-recordmatch test] PASS: a mid-transaction failure (round 2 insert) rolls back, never reaches participants or accumulation');
}

// Sol batch6 review point 3 ("不接受逐玩家部分成功"): this is the case the
// atomic-transaction restructuring exists for -- a failure partway through
// the accumulation loop (participant 2's UPDATE records) must roll back
// EVERYTHING, including the matches/match_rounds/match_participants rows
// that were already (successfully) inserted earlier in the SAME call.
async function testFailedAccumulationRollsBackWholeMatch()
{
    const db = loadFreshDb();
    const fake = makeFakePool();
    fake.pool.opts = { zeroAffectedForAccount: 2 }; // account 2's UPDATE records affects 0 rows
    db.pool.getConnection = fake.pool.getConnection.bind(fake.pool);

    const accumulations = [
        { accountId: 1, exp: 20, wins: 1, losses: 0, kills: 2, deaths: 1 },
        { accountId: 2, exp: 10, wins: 1, losses: 0, kills: 1, deaths: 2 }, // this one "fails" (0 rows)
    ];

    await assert.rejects(
        () => db.recordMatchWithAccumulation(BASE_MATCH, BASE_ROUNDS, BASE_PARTICIPANTS, accumulations),
        /account_id=2/,
        'recordMatchWithAccumulation must reject with an error naming the affected account'
    );

    assert.strictEqual(fake.committed, false, 'a failed accumulation must never commit ANY of the match');
    assert.strictEqual(fake.rolledBack, true, 'a failed accumulation must roll back the whole transaction');

    // Sanity: the matches/rounds/participants inserts and account 1's own
    // (successful) UPDATE records DID run before the failure -- proving the
    // rollback is what undoes them, not that they were skipped.
    assert.strictEqual(fake.calls.filter((c) => c.sql.startsWith('INSERT INTO matches')).length, 1);
    assert.strictEqual(fake.calls.filter((c) => c.sql.startsWith('INSERT INTO match_participants')).length, 2);
    assert.strictEqual(fake.calls.filter((c) => c.sql.startsWith('UPDATE records')).length, 2, 'account 1\'s UPDATE records ran before account 2\'s failed one');
    assert.strictEqual(fake.calls[fake.calls.length - 1].sql, 'ROLLBACK', 'the last statement issued must be ROLLBACK, never COMMIT');

    console.log('[p3-db-recordmatch test] PASS: a failed accumulation (0 affectedRows) rolls back the WHOLE match, not just the accumulation loop');
}

// Sol batch6 review point 4 ("需修改 -- UPDATE 靜默零列"): same as above, but
// for the mech_levels UPDATE (only issued when delta.mechType is given).
async function testZeroAffectedMechLevelsRollsBack()
{
    const db = loadFreshDb();
    const fake = makeFakePool();
    fake.pool.opts = { zeroAffectedMechForAccount: 1 }; // account 1's UPDATE mech_levels affects 0 rows
    db.pool.getConnection = fake.pool.getConnection.bind(fake.pool);

    const accumulations = [
        { accountId: 1, exp: 20, wins: 1, losses: 0, kills: 2, deaths: 1, mechType: 9 /* e.g. bad mechType */, mechExp: 20, mechKills: 2, mechDeaths: 1, mechSorties: 1 },
    ];

    await assert.rejects(
        () => db.recordMatchWithAccumulation(BASE_MATCH, BASE_ROUNDS, [BASE_PARTICIPANTS[0]], accumulations),
        /mech_levels.*account_id=1/,
        'recordMatchWithAccumulation must reject naming the mech_levels mismatch'
    );

    assert.strictEqual(fake.committed, false);
    assert.strictEqual(fake.rolledBack, true, 'a 0-row mech_levels UPDATE must roll back the whole transaction too');

    console.log('[p3-db-recordmatch test] PASS: a 0-affectedRows mech_levels UPDATE also rolls back the whole match');
}

async function testRecordsAlwaysAccumulatesMechOnlyWhenMechTypeGiven()
{
    const db = loadFreshDb();
    const fake = makeFakePool();
    db.pool.getConnection = fake.pool.getConnection.bind(fake.pool);

    const accumulations = [
        { accountId: 1, exp: 20, wins: 1, losses: 0, kills: 2, deaths: 1 }, // no mechType
        { accountId: 2, exp: 10, wins: 1, losses: 0, kills: 1, deaths: 2, mechType: 3, mechExp: 10, mechKills: 1, mechDeaths: 2, mechSorties: 1 },
    ];

    await db.recordMatchWithAccumulation(BASE_MATCH, BASE_ROUNDS, BASE_PARTICIPANTS, accumulations);

    const recordsCalls = fake.calls.filter((c) => c.sql.startsWith('UPDATE records'));
    assert.strictEqual(recordsCalls.length, 2);
    for (const call of recordsCalls) {
        assert.ok(/exp\s*=\s*exp\s*\+\s*\?/.test(call.sql), 'exp must be accumulated (col = col + ?), never overwritten');
        assert.ok(/wins\s*=\s*wins\s*\+\s*\?/.test(call.sql), 'wins must be accumulated');
        assert.ok(/kills\s*=\s*kills\s*\+\s*\?/.test(call.sql), 'kills must be accumulated');
    }
    assert.deepStrictEqual(recordsCalls[0].params, [20, 1, 0, 0, 2, 1, 1], 'params order: exp, wins, losses, draws, kills, deaths, account_id');

    const mechCalls = fake.calls.filter((c) => c.sql.startsWith('UPDATE mech_levels'));
    assert.strictEqual(mechCalls.length, 1, 'only the accumulations[] entry with a mechType gets an UPDATE mech_levels');
    assert.ok(/exp\s*=\s*exp\s*\+\s*\?/.test(mechCalls[0].sql), 'mech_levels.exp must also be accumulated');
    assert.ok(/sorties\s*=\s*sorties\s*\+\s*\?/.test(mechCalls[0].sql), 'sorties must be accumulated');
    assert.deepStrictEqual(mechCalls[0].params, [10, 1, 2, 1, 2, 3], 'params order: mechExp, mechKills, mechDeaths, mechSorties, account_id, mechType');

    console.log('[p3-db-recordmatch test] PASS: records always accumulates via col = col + ?, mech_levels only when a mechType is given');
}

async function main()
{
    await testRecordMatchInsertSequenceWithAccumulation();
    await testRecordMatchRollsBackOnRoundInsertFailure();
    await testFailedAccumulationRollsBackWholeMatch();
    await testZeroAffectedMechLevelsRollsBack();
    await testRecordsAlwaysAccumulatesMechOnlyWhenMechTypeGiven();
    console.log('[p3-db-recordmatch test] ALL CHECKS PASS');
    process.exit(0);
}

main().catch((err) => {
    console.error('[p3-db-recordmatch test] FAIL:', err);
    process.exit(1);
});
