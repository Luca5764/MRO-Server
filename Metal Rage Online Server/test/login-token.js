'use strict';

// D1 step 0: proves the Gate Leave_SA (0x00220132) -> auth-tokens.js ->
// Login_Again_CQ (0x00110124) identity chain added to
// dispatch/gate.dispatch.js and dispatch/gamelogin.dispatch.js.
//
// Background: docs/journal/2026-09-18-2350-game-login-token-chain.md and
// docs/design/d1-multiplayer-room.md §4. [DLL] ZDispatchGate::Leave_SA body
// 0x107dc7d3 reads body+0x06/+0x0A on success and hands them to
// Certify_Away_Set (0x10715f70, call site 0x107dc846); the same two u32s
// come back in Login_Again_CQ body+0/+4 (0x107c3ef5/0x107c3f00) on the
// 30907 connection, including every reconnect a map travel causes.
//
// Same technique as test/whitelist.js: swap database/db.js and
// (for case c/d) packetlog.js out of require.cache for a lightweight fake,
// call the real ZGateDispatch/ZGameLoginDispatch classes directly (no
// socket, no real MySQL).
//
// Four cases (per the D1-0 task contract in docs/backlog.md's D1 design
// doc, delivered as a contract to this worker):
//   (a) A logs in, then B logs in, then A reconnects using A's issued
//       (accountId, key) -- A is still recognized as A, and the OLD
//       ORDER BY last_login query is shown to resolve to B in the same
//       sequence (the bug this step removes).
//   (b) The same token is presented twice in a row (two map-travel
//       reconnects) and both resolve correctly -- the token is not
//       one-time.
//   (c) Two distinct accounts have logged in via Gate this run; an
//       all-zero Login_Again_CQ body gets the connection destroyed, with a
//       marker recorded, rather than guessed.
//   (d) Only one distinct account has logged in via Gate this run; an
//       all-zero body still falls back to the old last_login behaviour,
//       with a warning marker.
//
// Run: node test/login-token.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');
const Module = require('module');

const { makeFakeClient } = require('./fixtures/fake-client.js');

const ROOT = path.join(__dirname, '..');
const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));
const PACKETLOG_PATH = require.resolve(path.join(ROOT, 'packetlog.js'));
const AUTH_TOKENS_PATH = require.resolve(path.join(ROOT, 'auth-tokens.js'));
const GATE_DISPATCH_PATH = require.resolve(path.join(ROOT, 'dispatch', 'gate.dispatch.js'));
const GAMELOGIN_DISPATCH_PATH = require.resolve(path.join(ROOT, 'dispatch', 'gamelogin.dispatch.js'));

const CQ_LEAVE = 0x220131;
const SA_LEAVE_OP = '0x00220132';
const CQ_GAME_LOGIN = 0x00110124;
const SN_DEFAULT_INFO_OP = '0x00210101';

function installFakeModule(resolvedPath, exportsObj)
{
    const mod = new Module(resolvedPath, null);
    mod.filename = resolvedPath;
    mod.loaded = true;
    mod.exports = exportsObj;
    require.cache[resolvedPath] = mod;
}

/**
 * Fake config/whitelist.js is not needed here (gate/gamelogin dispatch
 * never touch it), but database/db.js is required at module load by both
 * gamelogin.dispatch.js -- fake it with a store of several distinct
 * accounts (the real db.js supports any number of rows; test/fixtures/
 * fake-db.js models exactly one, which is not enough to reproduce case (a)'s
 * two-different-people scenario).
 */
function makeMultiAccountDb()
{
    const accounts = new Map();
    let loginOrder = []; // most-recent-first account ids, mirrors `last_login`
    const calls = [];

    function addAccount(id, nickname)
    {
        accounts.set(id, {
            id, username: nickname.toLowerCase(), nickname, pilot: 101,
            account_level: 1, gender: 1, point: 100000, cash: 0, coupon: 0,
            last_login: null,
        });
    }

    /** Mirrors what a real Gate login does to `accounts.last_login`. */
    function recordLogin(id)
    {
        loginOrder = [id, ...loginOrder.filter((x) => x !== id)];
    }

    return {
        _accounts: accounts,
        _calls: calls,
        addAccount,
        recordLogin,
        pool: {
            async execute(sql, params = [])
            {
                calls.push({ name: 'pool.execute', sql, params });
                const norm = sql.replace(/\s+/g, ' ').trim();
                // gamelogin.dispatch.js's fallback path (unchanged query).
                if (norm.startsWith('SELECT * FROM accounts ORDER BY last_login DESC LIMIT 1'))
                {
                    if (loginOrder.length === 0) return [[]];
                    return [[accounts.get(loginOrder[0])]];
                }
                throw new Error(`login-token test db: unmocked pool.execute: ${norm}`);
            },
        },
        async getAccountById(id)
        {
            calls.push({ name: 'getAccountById', id });
            return accounts.get(Number(id)) || null;
        },
        async getRecord() { return null; },
        async getMechLevels() { return []; },
        async getMechLicenses() { return []; },
        async getTutorials() { return []; },
        async getItems() { return []; },
        // Sol batch5 point 5: without this, gamelogin.dispatch.js:271's real
        // path (db.getItemsWithEquipViews) throws, gets swallowed by the
        // catch at :435-436, and bootstrap silently stops partway -- same
        // shape as getItems() above since no test account here has items.
        async getItemsWithEquipViews() { return []; },
        // SWITCH-CONVERGE: mapInfoOnGameLoginMode's new default 'enabled'
        // means the same bootstrap path now also calls db.getMaps(account.id)
        // (see mapInfoOnGameLoginMode's resend below gamelogin.dispatch.js's
        // case 0x00110124) -- same reasoning as getItemsWithEquipViews above.
        async getMaps() { return []; },
    };
}

function makeMarkerSpy()
{
    const markers = [];
    return {
        markers,
        marker(text, src) { markers.push({ text, src }); },
    };
}

async function flushMicrotasks(rounds = 20)
{
    for (let i = 0; i < rounds; ++i)
        await new Promise((resolve) => setImmediate(resolve));
}

/** Loads fresh gate/gamelogin dispatch instances against the given fakes. */
function loadDispatchers(db, packetlogFake)
{
    installFakeModule(DB_PATH, db);
    installFakeModule(PACKETLOG_PATH, packetlogFake);
    delete require.cache[GATE_DISPATCH_PATH];
    delete require.cache[GAMELOGIN_DISPATCH_PATH];
    const ZGateDispatch = require(GATE_DISPATCH_PATH);
    const ZGameLoginDispatch = require(GAMELOGIN_DISPATCH_PATH);
    return { gate: new ZGateDispatch(), gamelogin: new ZGameLoginDispatch() };
}

/** Drives a Gate CQ_LEAVE (0x00220131) for accountId and returns the
 * (accountId, key) pair the client would store, read back from the real
 * SA_LEAVE 0x00220132 response bytes -- not predicted, so this exercises
 * the actual crypto.randomInt() key path (auth-tokens.js), same as
 * production. */
function gateLeave(gate, accountId, connId)
{
    const client = makeFakeClient(connId, 9211);
    client.accountId_ = accountId;
    const handled = gate.dispatch(client, CQ_LEAVE, Buffer.alloc(0));
    assert.strictEqual(handled, true, 'ZGateDispatch should claim CQ_LEAVE');

    const sa = client._sent.find((p) => p.op === SA_LEAVE_OP);
    assert.ok(sa, 'expected an SA_LEAVE 0x00220132 reply');
    const buf = Buffer.from(sa.hex, 'hex');
    return { accountId: buf.readUInt32LE(6), key: buf.readUInt32LE(10) };
}

function makeLoginAgainBody(accountId, key)
{
    const body = Buffer.alloc(8);
    body.writeUInt32LE(accountId >>> 0, 0);
    body.writeUInt32LE(key >>> 0, 4);
    return body;
}

async function gameLogin(gamelogin, connId, body)
{
    const client = makeFakeClient(connId, 30907);
    const handled = gamelogin.dispatch(client, CQ_GAME_LOGIN, body);
    assert.strictEqual(handled, true, 'ZGameLoginDispatch should claim CQ_GAME_LOGIN');
    await flushMicrotasks();
    return client;
}

function nicknameFromSnDefaultInfo(client)
{
    const pkt = client._sent.find((p) => p.op === SN_DEFAULT_INFO_OP);
    assert.ok(pkt, 'expected an SN_DEFAULT_INFO 0x00210101 reply');
    const buf = Buffer.from(pkt.hex, 'hex');
    const nulAt = buf.indexOf(0, 2);
    return buf.toString('ascii', 2, nulAt === -1 ? buf.length : nulAt);
}

async function testCaseA_ReconnectStaysAsSelf()
{
    const db = makeMultiAccountDb();
    db.addAccount(1, 'Lucas');
    db.addAccount(2, 'Dusk');
    const authTokens = require(AUTH_TOKENS_PATH);
    authTokens.resetForTest();
    authTokens.resetKeyGenerator();

    const { gate, gamelogin } = loadDispatchers(db, makeMarkerSpy());

    // A logs in at the Gate, then B logs in at the Gate (A is still
    // connected elsewhere -- both are live players).
    const tokenA = gateLeave(gate, 1, 101);
    db.recordLogin(1);
    const tokenB = gateLeave(gate, 2, 102);
    db.recordLogin(2);

    // A's client travels to a map and reconnects to 30907, echoing back
    // exactly what Gate gave it.
    const clientA = await gameLogin(gamelogin, 201, makeLoginAgainBody(tokenA.accountId, tokenA.key));
    assert.strictEqual(clientA.accountId_, 1, 'A must be recognized as account #1, not whoever logged in most recently');
    assert.strictEqual(nicknameFromSnDefaultInfo(clientA), 'Lucas');

    // The OLD approach (ORDER BY last_login DESC LIMIT 1) would have picked
    // B in this exact sequence -- proving this is a real fix, not just a
    // new code path that happens to agree with the old one.
    const [rows] = await db.pool.execute('SELECT * FROM accounts ORDER BY last_login DESC LIMIT 1');
    assert.strictEqual(rows[0].nickname, 'Dusk', 'sanity check: the old query really would have misidentified A as B here');

    console.log('[login-token test] PASS (a): A reconnects correctly as A after B logs in; old last_login query would have picked B');
}

async function testCaseB_TokenNotOneTime()
{
    const db = makeMultiAccountDb();
    db.addAccount(1, 'Lucas');
    const authTokens = require(AUTH_TOKENS_PATH);
    authTokens.resetForTest();
    authTokens.resetKeyGenerator();

    const { gate, gamelogin } = loadDispatchers(db, makeMarkerSpy());

    const token = gateLeave(gate, 1, 111);
    db.recordLogin(1);

    // Two map-travel reconnects in a row, same token both times.
    const first = await gameLogin(gamelogin, 211, makeLoginAgainBody(token.accountId, token.key));
    assert.strictEqual(first.accountId_, 1);
    const second = await gameLogin(gamelogin, 212, makeLoginAgainBody(token.accountId, token.key));
    assert.strictEqual(second.accountId_, 1);

    console.log('[login-token test] PASS (b): the same token authenticates two reconnects in a row (not one-time)');
}

async function testCaseC_TwoAccountsAllZeroBodyIsRefused()
{
    const db = makeMultiAccountDb();
    db.addAccount(1, 'Lucas');
    db.addAccount(2, 'Dusk');
    const authTokens = require(AUTH_TOKENS_PATH);
    authTokens.resetForTest();
    authTokens.resetKeyGenerator();
    const packetlogFake = makeMarkerSpy();

    const { gate, gamelogin } = loadDispatchers(db, packetlogFake);

    gateLeave(gate, 1, 121);
    db.recordLogin(1);
    gateLeave(gate, 2, 122);
    db.recordLogin(2);
    assert.strictEqual(authTokens.seenAccountCount(), 2);

    const client = await gameLogin(gamelogin, 221, Buffer.alloc(8)); // all-zero body
    assert.strictEqual(client.destroyed_, true, 'an unverifiable identity with >=2 accounts seen must close the connection');
    assert.strictEqual(client.accountId_, undefined, 'must not silently assign any account');
    assert.ok(
        packetlogFake.markers.some((m) => /REFUSING Login_Again_CQ/.test(m.text)),
        'expected a marker recording the refusal'
    );

    console.log('[login-token test] PASS (c): all-zero body with 2 accounts seen -> connection destroyed, marker recorded');
}

async function testCaseD_OneAccountAllZeroBodyFallsBack()
{
    const db = makeMultiAccountDb();
    db.addAccount(1, 'Lucas');
    const authTokens = require(AUTH_TOKENS_PATH);
    authTokens.resetForTest();
    authTokens.resetKeyGenerator();
    const packetlogFake = makeMarkerSpy();

    const { gate, gamelogin } = loadDispatchers(db, packetlogFake);

    gateLeave(gate, 1, 131);
    db.recordLogin(1);
    assert.strictEqual(authTokens.seenAccountCount(), 1);

    const client = await gameLogin(gamelogin, 231, Buffer.alloc(8)); // all-zero body
    assert.notStrictEqual(client.destroyed_, true, 'the <=1-account fallback must not close the connection');
    assert.strictEqual(client.accountId_, 1, 'fallback must still resolve to the only known account');
    assert.ok(
        packetlogFake.markers.some((m) => /WARNING: Login_Again_CQ token missing\/invalid/.test(m.text)),
        'expected a warning marker recording the fallback'
    );

    console.log('[login-token test] PASS (d): all-zero body with only 1 account seen -> falls back to last_login, with a warning marker');
}

// Sol batch5 point 5: gamelogin.dispatch.js's bootstrap try/catch
// (dispatch/gamelogin.dispatch.js:433-436) swallows real DB errors and logs
// "DB Error" instead of throwing, so a missing fake-DB mock (like the
// getItemsWithEquipViews gap this fixed) used to leave the test exiting 0
// with a half-run bootstrap. Spy on console.error for the whole run and fail
// if any such swallowed error was logged -- none of the four cases below
// expect one.
const realConsoleError = console.error;
const swallowedDbErrors = [];
console.error = (...args) => {
    realConsoleError(...args);
    if (args.some((a) => typeof a === 'string' && /DB Error/i.test(a)))
        swallowedDbErrors.push(args.map(String).join(' '));
};

async function main()
{
    await testCaseA_ReconnectStaysAsSelf();
    await testCaseB_TokenNotOneTime();
    await testCaseC_TwoAccountsAllZeroBodyIsRefused();
    await testCaseD_OneAccountAllZeroBodyFallsBack();
    console.error = realConsoleError;
    assert.strictEqual(swallowedDbErrors.length, 0,
        `expected no swallowed bootstrap DB errors, got: ${swallowedDbErrors.join(' | ')}`);
    console.log('[login-token test] ALL CHECKS PASS');
    process.exit(0);
}

main().catch((err) => {
    console.error = realConsoleError;
    console.error('[login-token test] FAIL:', err);
    process.exit(1);
});
