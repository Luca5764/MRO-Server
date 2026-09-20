'use strict';

// P3 step 3 (docs/design/p3-step3-writeback-impl.md): SQL-level coverage for
// database/db.js's recordMatch()/applyMatchAccumulation(), against an
// in-memory fake pool that asserts the exact statements/params issued --
// never a real MySQL connection. Complements test/match-writeback.js, which
// only exercises dispatch/room/match-stats.js's call sites with db.recordMatch/
// applyMatchAccumulation entirely mocked out (function-level spies, no SQL
// text checked at all); this file is what actually proves the SQL those
// functions issue matches what docs/design/p3-step3-writeback-impl.md
// documents.
//
// Cases:
//   1. recordMatch(): correct INSERT sequence (matches, then one
//      match_rounds row per round, then one match_participants row per
//      participant), all inside one transaction, matchId comes from the
//      matches INSERT's insertId.
//   2. recordMatch(): a mid-transaction failure (a round insert throws)
//      rolls back -- the fake pool proves this by tracking whether rollback
//      was called and that no partial state survives.
//   3. applyMatchAccumulation(): UPDATE records is always `col = col + ?`
//      (never `= ?`), and UPDATE mech_levels is only issued when
//      delta.mechType is given.
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

    function makeConnection(fail)
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
                    if (fail && fail.onRound === params[1] /* round_number */) {
                        throw new Error(`fake pool: forced failure on round ${params[1]}`);
                    }
                    return [{ insertId: 0, affectedRows: 1 }];
                }
                if (norm.startsWith('INSERT INTO match_participants')) {
                    return [{ insertId: 0, affectedRows: 1 }];
                }
                if (norm.startsWith('UPDATE records')) {
                    return [{ affectedRows: 1 }];
                }
                if (norm.startsWith('UPDATE mech_levels')) {
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
            failNextRoundInsert: null, // { onRound: number } set by a test before calling recordMatch
            async getConnection() { return makeConnection(this.failNextRoundInsert); },
        },
    };
}

function loadFreshDb()
{
    delete require.cache[DB_PATH];
    return require(DB_PATH);
}

async function testRecordMatchInsertSequence()
{
    const db = loadFreshDb();
    const fake = makeFakePool();
    db.pool.getConnection = fake.pool.getConnection.bind(fake.pool);

    const match = {
        roomId: 7, mapId: 9002, difficulty: 1, roundTarget: 2, hostAccountId: 1,
        startedAtMs: 1000, endedAtMs: 2000, result: 1, winTeamRank: 0, isTest: false, suspicious: false,
    };
    const rounds = [
        { roundNumber: 1, startedAtMs: 1000, durationSeconds: 30, deathCnCount: 2, suspicious: false },
        { roundNumber: 2, startedAtMs: 1500, durationSeconds: 20, deathCnCount: 1, suspicious: false },
    ];
    const participants = [
        { accountId: 1, team: 0, kills: 2, deaths: 1, expGained: 20, pointGained: 20, result: 1 },
        { accountId: 2, team: 0, kills: 1, deaths: 2, expGained: 10, pointGained: 10, result: 1 },
    ];

    const matchId = await db.recordMatch(match, rounds, participants);
    assert.strictEqual(matchId, 100, 'recordMatch must return the matches INSERT\'s insertId');

    const kinds = fake.calls.map((c) => c.sql.split(' ').slice(0, 3).join(' '));
    assert.deepStrictEqual(kinds, [
        'BEGIN', '',
        'INSERT INTO matches',
        'INSERT INTO match_rounds', 'INSERT INTO match_rounds',
        'INSERT INTO match_participants', 'INSERT INTO match_participants',
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

    assert.strictEqual(fake.committed, true);
    assert.strictEqual(fake.rolledBack, false);

    console.log('[p3-db-recordmatch test] PASS: recordMatch() issues matches -> match_rounds(N) -> match_participants(N) inside one transaction');
}

async function testRecordMatchRollsBackOnFailure()
{
    const db = loadFreshDb();
    const fake = makeFakePool();
    fake.pool.failNextRoundInsert = { onRound: 2 }; // second round's INSERT throws
    db.pool.getConnection = fake.pool.getConnection.bind(fake.pool);

    const match = {
        roomId: 7, mapId: 9002, difficulty: 1, roundTarget: 2, hostAccountId: 1,
        startedAtMs: 1000, endedAtMs: 2000, result: 1,
    };
    const rounds = [
        { roundNumber: 1, startedAtMs: 1000, durationSeconds: 30, deathCnCount: 2 },
        { roundNumber: 2, startedAtMs: 1500, durationSeconds: 20, deathCnCount: 1 },
    ];
    const participants = [{ accountId: 1, kills: 2, deaths: 1, expGained: 20, pointGained: 20, result: 1 }];

    await assert.rejects(
        () => db.recordMatch(match, rounds, participants),
        /forced failure on round 2/,
        'recordMatch must propagate the underlying error'
    );

    assert.strictEqual(fake.committed, false, 'a failed recordMatch must never commit');
    assert.strictEqual(fake.rolledBack, true, 'a failed recordMatch must roll back');
    const participantCalls = fake.calls.filter((c) => c.sql.startsWith('INSERT INTO match_participants'));
    assert.strictEqual(participantCalls.length, 0, 'the participants loop must never run once an earlier round insert has thrown');

    console.log('[p3-db-recordmatch test] PASS: a mid-transaction failure (round 2 insert) rolls back, never reaches the participants loop');
}

async function testApplyMatchAccumulationRecordsAlwaysAccumulates()
{
    const db = loadFreshDb();
    const fake = makeFakePool();
    db.pool.getConnection = fake.pool.getConnection.bind(fake.pool);

    await db.applyMatchAccumulation(1, { exp: 20, wins: 1, losses: 0, kills: 2, deaths: 1 });

    const recordsCall = fake.calls.find((c) => c.sql.startsWith('UPDATE records'));
    assert.ok(recordsCall, 'expected one UPDATE records call');
    assert.ok(/exp\s*=\s*exp\s*\+\s*\?/.test(recordsCall.sql), 'exp must be accumulated (col = col + ?), never overwritten');
    assert.ok(/wins\s*=\s*wins\s*\+\s*\?/.test(recordsCall.sql), 'wins must be accumulated');
    assert.ok(/kills\s*=\s*kills\s*\+\s*\?/.test(recordsCall.sql), 'kills must be accumulated');
    assert.deepStrictEqual(recordsCall.params, [20, 1, 0, 0, 2, 1, 1], 'params order: exp, wins, losses, draws, kills, deaths, account_id');

    const mechCall = fake.calls.find((c) => c.sql.startsWith('UPDATE mech_levels'));
    assert.strictEqual(mechCall, undefined, 'no delta.mechType given -- mech_levels must not be touched at all');
    assert.strictEqual(fake.committed, true);

    console.log('[p3-db-recordmatch test] PASS: applyMatchAccumulation() accumulates records via col = col + ?, skips mech_levels without a mechType');
}

async function testApplyMatchAccumulationTouchesMechLevelsWhenGiven()
{
    const db = loadFreshDb();
    const fake = makeFakePool();
    db.pool.getConnection = fake.pool.getConnection.bind(fake.pool);

    await db.applyMatchAccumulation(1, {
        exp: 20, wins: 1, losses: 0, kills: 2, deaths: 1,
        mechType: 3, mechExp: 20, mechKills: 2, mechDeaths: 1, mechSorties: 1,
    });

    const mechCall = fake.calls.find((c) => c.sql.startsWith('UPDATE mech_levels'));
    assert.ok(mechCall, 'delta.mechType given -- expected one UPDATE mech_levels call');
    assert.ok(/exp\s*=\s*exp\s*\+\s*\?/.test(mechCall.sql), 'mech_levels.exp must also be accumulated');
    assert.ok(/sorties\s*=\s*sorties\s*\+\s*\?/.test(mechCall.sql), 'sorties must be accumulated');
    assert.deepStrictEqual(mechCall.params, [20, 2, 1, 1, 1, 3], 'params order: mechExp, mechKills, mechDeaths, mechSorties, account_id, mechType');

    console.log('[p3-db-recordmatch test] PASS: applyMatchAccumulation() also accumulates mech_levels when a mechType is given');
}

async function main()
{
    await testRecordMatchInsertSequence();
    await testRecordMatchRollsBackOnFailure();
    await testApplyMatchAccumulationRecordsAlwaysAccumulates();
    await testApplyMatchAccumulationTouchesMechLevelsWhenGiven();
    console.log('[p3-db-recordmatch test] ALL CHECKS PASS');
    process.exit(0);
}

main().catch((err) => {
    console.error('[p3-db-recordmatch test] FAIL:', err);
    process.exit(1);
});
