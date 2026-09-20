'use strict';

// ASSIST-FIX (docs/backlog.md, docs/research/2026-09-20-assist-fix/notes.md,
// docs/research/2026-09-20-fallback-ack-audit/notes.md): unit test for
// rooms.isAssistSnFormatEnabled() (default 'disabled'), the switch that
// changes dispatch/lobby.dispatch.js's Assist_CN 0x00230121 handler's reply
// (Assist_SN 0x00230122) from the old 16-byte-padded all-zero body (an
// out-of-bounds read on the client's success-path handler) to a real
// 25-byte (0x19) body that echoes the CN's own fields. Same technique as
// test/round-advance.js: calls the real ZLobbyDispatch.dispatch() directly
// (no socket, no server.js) against a fake client.
//
// Three cases (per the task contract):
//   1. Switch off (default) -> byte-identical to today: Assist_SN
//      0x00230122 with a 16-byte all-zero body.
//   2. Switch on, a real 7-byte CN body (`00000300040150` from
//      docs/research/2026-09-20-assist-fix/notes.md §2's session log
//      sample) -> every byte of the 25-byte reply body checked.
//   3. Switch on, a short/malformed CN body (< 7 bytes) -> falls back to
//      the same 16-byte all-zero body as case 1, never indexing past the
//      short buffer.
//
// Run: node test/assist-sn-format.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));

const { makeFixtureDb } = require('./fixtures/fake-db.js');
const { makeFakeClient } = require('./fixtures/fake-client.js');

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
const LobbyDispatch = require('../dispatch/lobby.dispatch.js');

const ASSIST_CN = 0x00230121;
const ASSIST_SN = '0x00230122';

// [LOG] session-20260919-200917.jsonl ms 335944, docs/research/
// 2026-09-20-assist-fix/notes.md §2: AssistUserIndex=0, UserIndex=3,
// AssistType=4, Action=1, HP=0x50 (80).
const REAL_CN_BODY = Buffer.from('00000300040150', 'hex');
assert.strictEqual(REAL_CN_BODY.length, 7);

// Independently-built expected 25-byte body (not sharing code with the
// handler) so this test can actually catch a field/offset bug there.
function buildExpectedSnBody(assistUserIndex, userIndex, assistType, action, hp)
{
    const body = Buffer.alloc(0x19);
    body.writeUInt16LE(0, 0x00);              // Status -- success gate
    body.writeUInt32LE(0, 0x02);               // Result -- success gate
    body.writeUInt16LE(assistUserIndex, 0x0A);
    body.writeUInt16LE(userIndex, 0x0C);
    body[0x0E] = assistType;
    body[0x0F] = action;
    body[0x10] = hp;
    // 0x06-0x09 and 0x11-0x18 stay 0 (Exp/Point fields, no known formula).
    return body;
}

function lastSent(client)
{
    return client._sent[client._sent.length - 1];
}

function runSwitchOffCase()
{
    rooms._resetForTests();
    const lobbyDispatch = new LobbyDispatch();

    const client = makeFakeClient(1, 30907);
    const handled = lobbyDispatch.dispatch(client, ASSIST_CN, REAL_CN_BODY);
    assert.strictEqual(handled, true, 'Assist_CN should be handled');

    const sent = lastSent(client);
    assert.strictEqual(sent.op, ASSIST_SN, `expected Assist_SN, got ${sent.op}`);
    assert.strictEqual(sent.len, 0x10, `default body should stay 16 bytes, got ${sent.len}`);
    assert.strictEqual(sent.hex, '00'.repeat(0x10), `default body should stay all-zero, got ${sent.hex}`);

    console.log('[assist-sn-format] PASS: switch off -> byte-identical 16-byte zero Assist_SN');
}

function runSwitchOnRealBodyCase()
{
    rooms._resetForTests();
    rooms._setAssistSnFormatModeForTests('enabled');
    const lobbyDispatch = new LobbyDispatch();

    const client = makeFakeClient(2, 30907);
    const handled = lobbyDispatch.dispatch(client, ASSIST_CN, REAL_CN_BODY);
    assert.strictEqual(handled, true, 'Assist_CN should be handled');

    const sent = lastSent(client);
    assert.strictEqual(sent.op, ASSIST_SN, `expected Assist_SN, got ${sent.op}`);
    assert.strictEqual(sent.len, 0x19, `enabled body should be exactly 25 bytes, got ${sent.len}`);

    const expected = buildExpectedSnBody(0, 3, 4, 1, 0x50);
    assert.strictEqual(sent.hex, expected.toString('hex'),
        `Assist_SN body mismatch\n  got:      ${sent.hex}\n  expected: ${expected.toString('hex')}`);

    rooms._resetForTests();
    console.log('[assist-sn-format] PASS: switch on -> 25-byte Assist_SN echoing the real CN fields');
}

function runSwitchOnShortBodyCase()
{
    rooms._resetForTests();
    rooms._setAssistSnFormatModeForTests('enabled');
    const lobbyDispatch = new LobbyDispatch();

    const client = makeFakeClient(3, 30907);
    // Malformed: only 3 of the real 7 bytes.
    const shortBody = REAL_CN_BODY.subarray(0, 3);
    const handled = lobbyDispatch.dispatch(client, ASSIST_CN, shortBody);
    assert.strictEqual(handled, true, 'Assist_CN should be handled even with a short body');

    const sent = lastSent(client);
    assert.strictEqual(sent.op, ASSIST_SN, `expected Assist_SN, got ${sent.op}`);
    assert.strictEqual(sent.len, 0x10, `short-body fallback should stay 16 bytes, got ${sent.len}`);
    assert.strictEqual(sent.hex, '00'.repeat(0x10), `short-body fallback should stay all-zero, got ${sent.hex}`);

    rooms._resetForTests();
    console.log('[assist-sn-format] PASS: switch on + short CN body -> falls back to zero Assist_SN, no OOB index');
}

runSwitchOffCase();
runSwitchOnRealBodyCase();
runSwitchOnShortBodyCase();

console.log('[assist-sn-format] ALL CASES PASS');
