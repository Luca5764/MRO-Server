'use strict';

// LIVES (test mode, docs/backlog.md): proves config/server.json's
// pveExtraLives reaches Game_User_SN 0x00222112's rec+0x64
// (GAME_ITEM_INFO.PveRespawnAddCount, confirmed against the real disassembly
// at 0x107d8ae0/0x107d8d63/0x107d8d9f and Game_Item_Add 0x107029ff -- see
// dispatch/room/room-game-user.sender.js's LIVES comment).
//
// Same require.cache-swap technique as test/whitelist.js: installs a fake
// config/server.js so this never reads the operator's real
// config/server.json.
//
// Run: node test/extra-lives.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');
const Module = require('module');

const { makeFixtureDb } = require('./fixtures/fake-db.js');
const { makeFakeClient } = require('./fixtures/fake-client.js');

const ROOT = path.join(__dirname, '..');
const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));
const CONFIG_SERVER_PATH = require.resolve(path.join(ROOT, 'config', 'server.js'));
const SENDER_PATH = require.resolve(path.join(ROOT, 'dispatch', 'room', 'room-game-user.sender.js'));

const SN_GAME_USER = '0x00222112';
const REC_HEADER_SIZE = 0x02;
const PVE_RESPAWN_ADD_COUNT_OFFSET = 0x64; // see comment above

function installFakeModule(resolvedPath, exportsObj)
{
    const mod = new Module(resolvedPath, null);
    mod.filename = resolvedPath;
    mod.loaded = true;
    mod.exports = exportsObj;
    require.cache[resolvedPath] = mod;
}

function makeFakeServerConfig(pveExtraLives)
{
    return { getPublicHost() { return '127.0.0.1'; }, getPveExtraLives() { return pveExtraLives; } };
}

// Same shape as room.dispatch.js's own getExactMessageBuffer -- no 16-byte
// padding, unlike fake-client's getMessageBuffer (see test/README.md).
function getExactMessageBuffer(type, bodySize)
{
    const msg = Buffer.alloc(0x10 + bodySize);
    msg.writeUint16BE(msg.length, 0x6);
    msg.writeUint32BE(type, 0xC);
    return [msg, msg.subarray(0x10)];
}

/**
 * Loads a fresh room-game-user.sender.js against the given fixture DB and
 * fake pveExtraLives value. Deletes it from the cache each call so the
 * module doesn't cache a stale config/server.js reference between cases.
 */
function loadSender(fixtureDb, pveExtraLives)
{
    installFakeModule(DB_PATH, fixtureDb);
    installFakeModule(CONFIG_SERVER_PATH, makeFakeServerConfig(pveExtraLives));
    delete require.cache[SENDER_PATH];
    return require(SENDER_PATH);
}

async function sendAndReadPveRespawnAddCount(pveExtraLives)
{
    const fixtureDb = makeFixtureDb();
    const { sendGameUserBootstrap } = loadSender(fixtureDb, pveExtraLives);
    const client = makeFakeClient(1, 30907);
    client.accountId_ = 1; // fixture account, exercises the db.getItems() path

    const ctx = {
        accountIndex: 1,
        nickname: 'Tester',
        userLevelText: '1',
        teamIndex: 0,
        selectedMech: 1,
        pilotId: 101,
    };

    await sendGameUserBootstrap(client, ctx, getExactMessageBuffer);

    const sent = client._sent.find((p) => p.op === SN_GAME_USER);
    assert.ok(sent, 'expected a Game_User_SN 0x00222112 send');
    const body = Buffer.from(sent.hex, 'hex');
    return body.readUInt32LE(REC_HEADER_SIZE + PVE_RESPAWN_ADD_COUNT_OFFSET);
}

async function testDefaultIsZero()
{
    const value = await sendAndReadPveRespawnAddCount(0);
    assert.strictEqual(value, 0, `pveExtraLives=0 should leave rec+0x64 at 0, got ${value}`);
    console.log('[extra-lives test] PASS: pveExtraLives=0 -> rec+0x64 == 0 (byte-identical to before LIVES)');
}

async function testNinetySeven()
{
    const value = await sendAndReadPveRespawnAddCount(97);
    assert.strictEqual(value, 97, `pveExtraLives=97 should write 97 at rec+0x64, got ${value}`);
    console.log('[extra-lives test] PASS: pveExtraLives=97 -> rec+0x64 == 97');
}

async function main()
{
    await testDefaultIsZero();
    await testNinetySeven();
    console.log('[extra-lives test] ALL CHECKS PASS');
    process.exit(0);
}

main().catch((err) => {
    console.error('[extra-lives test] FAIL:', err);
    process.exit(1);
});
