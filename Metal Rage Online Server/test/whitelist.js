'use strict';

// Backlog W1: proves the account-whitelist gate added to
// dispatch/account.dispatch.js's CQ_LOGIN_WASABII handler (0x00110151).
//
// This calls the real ZAccountDispatch class directly (no TCP socket, no
// real MySQL) -- the same require.cache-swap technique test/replay-golden.js
// uses for database/db.js is applied here to *both* database/db.js (fixture
// from test/fixtures/fake-db.js) and config/whitelist.js (a tiny in-memory
// fake), so this test never reads or writes the real
// config/allowed-users.json the operator may or may not have on disk.
//
// Two cases (per docs/backlog.md W1's completion condition):
//   1. A whitelisted username logs in normally.
//   2. A non-whitelisted username never reaches db.createAccount() (so no
//      row would be added to `accounts`), and the connection is rejected.
//
// Run: node test/whitelist.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');
const Module = require('module');

const { makeFixtureDb } = require('./fixtures/fake-db.js');
const { makeFakeClient } = require('./fixtures/fake-client.js');

const ROOT = path.join(__dirname, '..');
const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));
const WHITELIST_PATH = require.resolve(path.join(ROOT, 'config', 'whitelist.js'));
const ACCOUNT_DISPATCH_PATH = require.resolve(path.join(ROOT, 'dispatch', 'account.dispatch.js'));

const CQ_LOGIN_WASABII = 0x00110151;
const SA_LOGIN_WASABII = '0x00110152';

function installFakeModule(resolvedPath, exportsObj)
{
    const mod = new Module(resolvedPath, null);
    mod.filename = resolvedPath;
    mod.loaded = true;
    mod.exports = exportsObj;
    require.cache[resolvedPath] = mod;
}

// Fake config/whitelist.js -- same shape as the real module, backed by a
// plain Set instead of reading config/allowed-users.json.
//
// ISTEST-WIRE: account.dispatch.js's CQ_LOGIN_WASABII handler now also
// calls whitelist.isTestAccount() unconditionally (same place username_ is
// set), so this fake needs the method too -- otherwise handleLogin's
// try/catch would swallow a TypeError there and this test would silently
// stop exercising the real success path. Always returns false: this file's
// two cases (allowed/rejected login) do not care about isTest.
function makeFakeWhitelist(allowedLower)
{
    return {
        isAllowed(username) { return allowedLower.has(String(username).toLowerCase()); },
        status() { return `on(${allowedLower.size} users)`; },
        isTestAccount() { return false; },
    };
}

/**
 * Loads a fresh dispatch/account.dispatch.js against the given fixture DB
 * and fake whitelist. Deletes account.dispatch.js from the cache each call
 * so module-level state never leaks between the two test cases.
 */
function loadAccountDispatch(fixtureDb, whitelistModule)
{
    installFakeModule(DB_PATH, fixtureDb);
    installFakeModule(WHITELIST_PATH, whitelistModule);
    delete require.cache[ACCOUNT_DISPATCH_PATH];
    const ZAccountDispatch = require(ACCOUNT_DISPATCH_PATH);
    return new ZAccountDispatch();
}

// CQ_LOGIN_WASABII body: username is ASCII in the first 0x19 bytes,
// NUL-padded; handleLogin() only reads that field, so the rest of the
// 0x381-byte body (its required exact length, see handleLogin's guard) can
// stay zero-filled. Layout cross-checked against a real recv packet in
// test/golden/login-dispatch/recv.jsonl.
function makeLoginBody(username)
{
    const body = Buffer.alloc(0x381);
    body.write(username, 0, 'ascii');
    return body;
}

async function flushMicrotasks(rounds = 20)
{
    for (let i = 0; i < rounds; ++i)
        await new Promise((resolve) => setImmediate(resolve));
}

async function testAllowedUserLogsIn()
{
    const fixtureDb = makeFixtureDb();
    const whitelistModule = makeFakeWhitelist(new Set(['lucas']));
    const dispatch = loadAccountDispatch(fixtureDb, whitelistModule);
    const client = makeFakeClient(1, 9211);

    const handled = dispatch.dispatch(client, CQ_LOGIN_WASABII, makeLoginBody('Lucas'));
    await flushMicrotasks();

    assert.strictEqual(handled, true, 'dispatch() should claim CQ_LOGIN_WASABII');
    assert.notStrictEqual(client.disconnected_, true, 'a whitelisted login must not disconnect the client');

    const sa = client._sent.find((p) => p.op === SA_LOGIN_WASABII);
    assert.ok(sa, 'expected an SA_LOGIN_WASABII reply');
    const code = Buffer.from(sa.hex, 'hex').readUInt16LE(0);
    assert.strictEqual(code, 0, `expected success code 0x0000, got 0x${code.toString(16)}`);

    const createCalls = fixtureDb._calls.filter((c) => c.name === 'createAccount');
    assert.strictEqual(createCalls.length, 0,
        'logging in as the whitelisted username on an already-existing fixture account must not call createAccount');

    console.log('[whitelist test] PASS: whitelisted username logs in (code 0x0000, no createAccount call)');
}

async function testRejectedUserNeverCreatesAccount()
{
    const fixtureDb = makeFixtureDb();
    const whitelistModule = makeFakeWhitelist(new Set(['lucas']));
    const dispatch = loadAccountDispatch(fixtureDb, whitelistModule);
    const client = makeFakeClient(2, 9211);

    const handled = dispatch.dispatch(client, CQ_LOGIN_WASABII, makeLoginBody('intruder'));
    await flushMicrotasks();

    assert.strictEqual(handled, true,
        'dispatch() still claims the opcode -- the whitelist is checked inside the CQ_LOGIN_WASABII handler, not at the dispatch() switch');

    const createCalls = fixtureDb._calls.filter((c) => c.name === 'createAccount');
    assert.strictEqual(createCalls.length, 0,
        'a non-whitelisted username must never reach db.createAccount() -- no row should be added to `accounts`');

    assert.strictEqual(client.disconnected_, true, 'a rejected login must close the connection (client.disconnect())');

    // DLL evidence for this being a real failure SA and not a guessed format:
    // ZDispatchAccount::Login_Wasabii_SA (tools/ghidra/decompile.sh 0x10701717,
    // confirmed as the 0x00110152 handler via
    // `tools/dispatch-map.py 0x107039db`) reads body+0x0 as a uint16 code and
    // body+0x2 as a uint32; either non-zero makes the client call
    // ZNetworkManager::Disconnect() itself instead of transitioning to the
    // gate. See dispatch/account.dispatch.js's whitelist-gate comment.
    const sa = client._sent.find((p) => p.op === SA_LOGIN_WASABII);
    assert.ok(sa, 'expected a failure SA_LOGIN_WASABII reply');
    const code = Buffer.from(sa.hex, 'hex').readUInt16LE(0);
    assert.notStrictEqual(code, 0, 'expected a non-zero failure code');

    console.log('[whitelist test] PASS: non-whitelisted username never calls createAccount, connection closed, failure SA sent');
}

async function main()
{
    await testAllowedUserLogsIn();
    await testRejectedUserNeverCreatesAccount();
    console.log('[whitelist test] ALL CHECKS PASS');
    process.exit(0);
}

main().catch((err) => {
    console.error('[whitelist test] FAIL:', err);
    process.exit(1);
});
