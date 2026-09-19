'use strict';

// RANK (docs/backlog.md, docs/research/2026-09-19-rank/notes.md): unit test
// for config/server.json's pveFixedRank, the test-mode switch (default
// absent) in dispatch/lobby.dispatch.js's Campaign_CN 0x00230139 handler
// that sends User_Score_SN 0x00222221 right before EndGame_SN on a
// successful PvE clear. Same technique as test/round-advance.js: calls the
// real ZLobbyDispatch.dispatch() directly (no socket, no server.js) against
// a fake client, with a fake config/server.js (same require.cache-swap
// technique as test/extra-lives.js) so this never reads the operator's real
// config/server.json.
//
// Three cases (per the task contract):
//   1. pveFixedRank configured (10) + Campaign_CN success (action=1) ->
//      User_Score_SN 0x00222221 is sent immediately before EndGame_SN, body
//      byte-for-byte per the disassembly-verified layout in
//      dispatch/lobby.dispatch.js's RANK comment.
//   2. pveFixedRank not configured (undefined, the shipped default) ->
//      Campaign_CN success never sends 0x00222221 at all.
//   3. pveFixedRank configured but Campaign_CN failure (action=2) ->
//      0x00222221 is not sent; only EndGame_SN.
//
// Run: node test/fixed-rank.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));
const CONFIG_SERVER_PATH = require.resolve(path.join(ROOT, 'config', 'server.js'));

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

// Mutable so each test case can flip pveFixedRank without reloading
// lobby.dispatch.js (its top-level `require('../config/server.js')` keeps a
// reference to this same object -- see config/server.js's own getters).
let fakePveFixedRank = undefined;
installFakeModule(CONFIG_SERVER_PATH, {
    getPublicHost() { return '127.0.0.1'; },
    getPveExtraLives() { return 0; },
    getPveFixedRank() { return fakePveFixedRank; },
});

const LobbyDispatch = require('../dispatch/lobby.dispatch.js');

const CAMPAIGN_CN = 0x00230139;
const USER_SCORE_SN = 0x00222221;
const END_GAME_SN = 0x00222213;

// Exact 37-byte (0x25) body per dispatch/lobby.dispatch.js's RANK comment:
//   +0x00 u16 WinTeamIndex=0, +0x02 u16 WinTeamRank, +0x04 u32 WinTeamScore=0
//   +0x08 Team A block (14 bytes, TeamIndex=0, rest 0)
//   +0x16 Team B block (14 bytes, TeamIndex=1, rest 0)
//   +0x24 u8 count=0
function expectedUserScoreBodyHex(rank)
{
    const rankHex = Buffer.from([rank & 0xff, (rank >> 8) & 0xff]).toString('hex');
    return '0000' + rankHex + '00000000'
        + '0000' + '00'.repeat(12)
        + '0100' + '00'.repeat(12)
        + '00';
}

function makeCampaignCnBody(action)
{
    const body = Buffer.alloc(3);
    body[0] = 1;
    body[1] = 0;
    body[2] = action;
    return body;
}

function opHex(op)
{
    return '0x' + op.toString(16).padStart(8, '0');
}

function testConfiguredSendsBeforeEndGame()
{
    fakePveFixedRank = 10;
    const lobbyDispatch = new LobbyDispatch();
    const client = makeFakeClient(1, 30907);

    const handled = lobbyDispatch.dispatch(client, CAMPAIGN_CN, makeCampaignCnBody(1));
    assert.strictEqual(handled, true, 'Campaign_CN success should be handled');

    assert.strictEqual(client._sent.length, 2,
        `expected exactly 2 sends (User_Score_SN + EndGame_SN), got ${client._sent.length}`);

    const [first, second] = client._sent;
    assert.strictEqual(first.op, opHex(USER_SCORE_SN),
        `first send should be User_Score_SN, got ${first.op}`);
    assert.strictEqual(first.len, 0x25, `User_Score_SN body should be exactly 0x25 bytes, got 0x${first.len.toString(16)}`);
    assert.strictEqual(first.hex, expectedUserScoreBodyHex(10),
        'User_Score_SN body mismatch');

    assert.strictEqual(second.op, opHex(END_GAME_SN),
        `second send should be EndGame_SN, got ${second.op}`);

    console.log('[fixed-rank] PASS: pveFixedRank=10 + success -> User_Score_SN 0x00222221 sent before EndGame_SN, body byte-exact');
}

function testUnconfiguredDoesNotSend()
{
    fakePveFixedRank = undefined;
    const lobbyDispatch = new LobbyDispatch();
    const client = makeFakeClient(2, 30907);

    const handled = lobbyDispatch.dispatch(client, CAMPAIGN_CN, makeCampaignCnBody(1));
    assert.strictEqual(handled, true, 'Campaign_CN success should be handled');

    assert.strictEqual(client._sent.length, 1,
        `expected exactly 1 send (EndGame_SN only), got ${client._sent.length}`);
    assert.strictEqual(client._sent[0].op, opHex(END_GAME_SN),
        `only send should be EndGame_SN, got ${client._sent[0].op}`);

    console.log('[fixed-rank] PASS: pveFixedRank unconfigured -> User_Score_SN never sent (unchanged behaviour)');
}

function testFailureDoesNotSend()
{
    fakePveFixedRank = 10;
    const lobbyDispatch = new LobbyDispatch();
    const client = makeFakeClient(3, 30907);

    const handled = lobbyDispatch.dispatch(client, CAMPAIGN_CN, makeCampaignCnBody(2));
    assert.strictEqual(handled, true, 'Campaign_CN failure should be handled');

    assert.strictEqual(client._sent.length, 1,
        `expected exactly 1 send (EndGame_SN only) on failure, got ${client._sent.length}`);
    assert.strictEqual(client._sent[0].op, opHex(END_GAME_SN),
        `only send should be EndGame_SN, got ${client._sent[0].op}`);

    console.log('[fixed-rank] PASS: pveFixedRank configured but Campaign_CN failure -> User_Score_SN not sent');
}

testConfiguredSendsBeforeEndGame();
testUnconfiguredDoesNotSend();
testFailureDoesNotSend();

console.log('[fixed-rank] ALL CASES PASS');
