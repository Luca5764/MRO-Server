'use strict';

// ISTEST-WIRE (docs/backlog.md, docs/design/p3-step1-writeback.md §5 step
// 3): unit test for config/whitelist.js's `isTest` field parsing and the
// new isTestAccount() accessor -- test/whitelist.js and the other test/
// files that touch config/whitelist.js all fake the whole module (a plain
// isAllowed()/status()/getHostAddress() stub), so none of them exercise the
// real load()/parsing logic in config/whitelist.js itself. This test does,
// the same way test/whitelist.js avoids the real config/allowed-users.json:
// by installing a fake config/allowed-users.json.
//
// Since config/whitelist.js computes CONFIG_PATH once from its own
// __dirname (not overridable via an argument), this monkey-patches
// fs.readFileSync for exactly that one path, restoring it in a
// try/finally, and always deletes config/whitelist.js from require.cache
// first so its own module-level `cached` var never leaks between cases.
//
// Run: node test/whitelist-parse.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WHITELIST_PATH = require.resolve(path.join(ROOT, 'config', 'whitelist.js'));
const CONFIG_PATH = path.join(ROOT, 'config', 'allowed-users.json');

function loadWhitelistWithFixture(jsonObj)
{
    delete require.cache[WHITELIST_PATH];
    const realReadFileSync = fs.readFileSync;
    fs.readFileSync = function (p, ...rest) {
        if (p === CONFIG_PATH)
            return JSON.stringify(jsonObj);
        return realReadFileSync.call(fs, p, ...rest);
    };
    try {
        const whitelist = require(WHITELIST_PATH);
        // load() is lazy (only runs on the first isAllowed()/isTestAccount()/
        // getHostAddress()/status() call), but its result is cached at module
        // scope -- force it to run now, while fs.readFileSync is still
        // patched, so every call the test itself makes afterwards (with the
        // real fs.readFileSync restored below) hits that cache instead of
        // re-reading the real config/allowed-users.json.
        whitelist.status();
        return whitelist;
    } finally {
        fs.readFileSync = realReadFileSync;
    }
}

function testIsTestTrueForFlaggedEntry()
{
    const whitelist = loadWhitelistWithFixture({
        users: [
            'Lucas',
            { name: 'dusk', hostAddress: '192.168.0.42' },
            { name: 'mrotest', isTest: true },
        ],
    });

    assert.strictEqual(whitelist.isTestAccount('mrotest'), true, 'entry with isTest:true must report true');
    assert.strictEqual(whitelist.isTestAccount('MroTest'), true, 'isTestAccount must be case-insensitive, same as isAllowed');
    console.log('[whitelist-parse test] PASS: isTest:true entry -> isTestAccount() true, case-insensitive');
}

function testIsTestDefaultsFalse()
{
    const whitelist = loadWhitelistWithFixture({
        users: [
            'Lucas',                                        // old plain-string format
            { name: 'dusk', hostAddress: '192.168.0.42' },   // object format, no isTest field
            { name: 'notedtest', isTest: false },            // object format, explicit false
        ],
    });

    assert.strictEqual(whitelist.isTestAccount('lucas'), false, 'plain-string entry must default to isTest false');
    assert.strictEqual(whitelist.isTestAccount('dusk'), false, 'object entry without isTest must default to false');
    assert.strictEqual(whitelist.isTestAccount('notedtest'), false, 'explicit isTest:false must stay false');
    assert.strictEqual(whitelist.isTestAccount('nobody'), false, 'a username not in the whitelist must be false, not throw');

    // Regression: adding isTest must not disturb isAllowed()/getHostAddress()
    // for entries that do not use it.
    assert.strictEqual(whitelist.isAllowed('dusk'), true);
    assert.strictEqual(whitelist.getHostAddress('dusk'), '192.168.0.42');

    console.log('[whitelist-parse test] PASS: isTest omitted/false defaults to false, no effect on isAllowed()/getHostAddress()');
}

function testIsTestAccountWhenWhitelistOff()
{
    delete require.cache[WHITELIST_PATH];
    const realReadFileSync = fs.readFileSync;
    fs.readFileSync = function (p, ...rest) {
        if (p === CONFIG_PATH) {
            const err = new Error('ENOENT (fixture)');
            err.code = 'ENOENT';
            throw err;
        }
        return realReadFileSync.call(fs, p, ...rest);
    };
    let whitelist;
    try {
        whitelist = require(WHITELIST_PATH);
        whitelist.status(); // force the lazy load() to run now, see loadWhitelistWithFixture's comment
    } finally {
        fs.readFileSync = realReadFileSync;
    }

    assert.strictEqual(whitelist.isTestAccount('anyone'), false, 'whitelist off (no config file) -- isTestAccount must be false, not throw');
    console.log('[whitelist-parse test] PASS: whitelist off -> isTestAccount() false');
}

function main()
{
    testIsTestTrueForFlaggedEntry();
    testIsTestDefaultsFalse();
    testIsTestAccountWhenWhitelistOff();
    console.log('[whitelist-parse test] ALL CHECKS PASS');
    process.exit(0);
}

try {
    main();
} catch (err) {
    console.error('[whitelist-parse test] FAIL:', err);
    process.exit(1);
}
