'use strict';

// H7-MAPINFO-30907 (docs/backlog.md): unit test for
// mapInfoOnGameLoginMode in dispatch/gamelogin.dispatch.js.
//
// Background (docs/journal/2026-09-19-1000-maplist-single-entry.md): the
// only pre-existing MapInfo_SN 0x00210115 send site is the 9211 login
// (dispatch/account.dispatch.js), but the client's post-9211-login level
// travel appears to reset ZNetwork_DJ's default-object data, losing
// m_MapList -- the room map selector then finds m_MapInfoList empty
// (ZPopup_MapSelect "Accessed array 'm_MapInfoList' out of bounds (0/0)"),
// even though data sent on the 30907 login (ItemInfo/WearInfo) survives.
// This switch resends MapInfo_SN on that same 30907 login. 🟡 hypothesis,
// off by default -- this test only proves the wire bytes are correct when
// the switch is flipped on, not that it fixes the client symptom.
//
// Same technique as test/login-token.js (real ZGateDispatch/
// ZGameLoginDispatch, fake db/packetlog/auth-tokens swapped into
// require.cache -- no socket, no real MySQL).
//
// Run: node test/map-info-game-login.js  (exit 0 = pass, exit 1 = fail)

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
const MAP_INFO_SENDER_PATH = require.resolve(path.join(ROOT, 'dispatch', 'map-info.sender.js'));

const CQ_LEAVE = 0x220131;
const SA_LEAVE_OP = '0x00220132';
const CQ_GAME_LOGIN = 0x00110124;
const SN_MAP_INFO_OP = '0x00210115';

const MAP_IDS_PVE = [9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009, 9010, 9011, 9012];

function installFakeModule(resolvedPath, exportsObj)
{
    const mod = new Module(resolvedPath, null);
    mod.filename = resolvedPath;
    mod.loaded = true;
    mod.exports = exportsObj;
    require.cache[resolvedPath] = mod;
}

/** Same shape as test/login-token.js's makeMultiAccountDb, plus getMaps
 * (unused there because that test's fake db never exercises this switch). */
function makeFakeDb()
{
    const accounts = new Map();
    accounts.set(1, {
        id: 1, username: 'lucas', nickname: 'Lucas', pilot: 101,
        account_level: 1, gender: 1, point: 100000, cash: 0, coupon: 0,
        last_login: null,
    });

    return {
        pool: {
            async execute() { throw new Error('map-info-game-login test db: unmocked pool.execute'); },
        },
        async getAccountById(id) { return accounts.get(Number(id)) || null; },
        async getRecord() { return null; },
        async getMechLevels() { return []; },
        async getMechLicenses() { return []; },
        async getTutorials() { return []; },
        async getItems() { return []; },
        async getItemsWithEquipViews() { return []; }, // SN_WEAR_INFO reads this; must not throw or the handler bails before SN_LICENSE_INFO/SN_MAP_INFO
        async getMaps(accountId) {
            // Legacy/fallback list this test's db would otherwise return --
            // distinct from MAP_IDS_PVE so the two paths cannot be confused.
            return [{ map_id: 1 }, { map_id: 2 }, { map_id: 3 }];
        },
    };
}

function makeMarkerSpy()
{
    return { markers: [], marker(text, src) { this.markers.push({ text, src }); } };
}

async function flushMicrotasks(rounds = 20)
{
    for (let i = 0; i < rounds; ++i)
        await new Promise((resolve) => setImmediate(resolve));
}

function loadDispatchers(db, packetlogFake)
{
    installFakeModule(DB_PATH, db);
    installFakeModule(PACKETLOG_PATH, packetlogFake);
    delete require.cache[GATE_DISPATCH_PATH];
    delete require.cache[GAMELOGIN_DISPATCH_PATH];
    delete require.cache[MAP_INFO_SENDER_PATH];
    const ZGateDispatch = require(GATE_DISPATCH_PATH);
    const ZGameLoginDispatch = require(GAMELOGIN_DISPATCH_PATH);
    const mapInfoSender = require(MAP_INFO_SENDER_PATH);
    return { gate: new ZGateDispatch(), gamelogin: new ZGameLoginDispatch(), GameLoginDispatchClass: ZGameLoginDispatch, mapInfoSender };
}

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

function parseMapInfoBody(hex)
{
    const buf = Buffer.from(hex, 'hex');
    const count = buf.readUInt8(1);
    const ids = [];
    for (let i = 0; i < count; i++)
        ids.push(buf.readUInt32LE(2 + i * 4));
    return { count, ids };
}

async function testDisabledSendsNoMapInfo()
{
    const db = makeFakeDb();
    const authTokens = require(AUTH_TOKENS_PATH);
    authTokens.resetForTest();
    authTokens.resetKeyGenerator();

    const { gate, gamelogin, GameLoginDispatchClass } = loadDispatchers(db, makeMarkerSpy());
    // SWITCH-CONVERGE flipped mapInfoOnGameLoginMode's production default
    // to 'enabled' -- force it off explicitly here so the off path stays
    // covered.
    GameLoginDispatchClass._setMapInfoOnGameLoginModeForTests('disabled');

    const token = gateLeave(gate, 1, 301);
    const client = await gameLogin(gamelogin, 302, makeLoginAgainBody(token.accountId, token.key));

    const mapInfoPackets = client._sent.filter((p) => p.op === SN_MAP_INFO_OP);
    assert.strictEqual(mapInfoPackets.length, 0, 'disabled: 30907 login must send no MapInfo_SN at all');

    console.log('[map-info-game-login] disabled -- no MapInfo_SN sent OK');
}

async function testEnabledWithRealIdSendsPveIds()
{
    const db = makeFakeDb();
    const authTokens = require(AUTH_TOKENS_PATH);
    authTokens.resetForTest();
    authTokens.resetKeyGenerator();

    const { gate, gamelogin, GameLoginDispatchClass, mapInfoSender } = loadDispatchers(db, makeMarkerSpy());
    GameLoginDispatchClass._setMapInfoOnGameLoginModeForTests('enabled');
    mapInfoSender._setMapInfoRealIdModeForTests('enabled');
    try {
        const token = gateLeave(gate, 1, 311);
        const client = await gameLogin(gamelogin, 312, makeLoginAgainBody(token.accountId, token.key));

        const mapInfoPackets = client._sent.filter((p) => p.op === SN_MAP_INFO_OP);
        assert.strictEqual(mapInfoPackets.length, 1, 'enabled + REAL_ID enabled: 30907 login must send exactly one MapInfo_SN');

        const { count, ids } = parseMapInfoBody(mapInfoPackets[0].hex);
        assert.strictEqual(count, 12, 'count must be 12 (the real PvE map count)');
        assert.deepStrictEqual(ids, MAP_IDS_PVE, 'ids must be the real PvE ids 9001..9012, in order');

        console.log('[map-info-game-login] enabled + REAL_ID enabled -- count=12, ids=9001..9012 OK');
    } finally {
        mapInfoSender._setMapInfoRealIdModeForTests('disabled');
    }
}

async function main()
{
    await testDisabledSendsNoMapInfo();
    await testEnabledWithRealIdSendsPveIds();
    console.log('[map-info-game-login] ALL CHECKS PASS');
    process.exit(0);
}

main().catch((err) => {
    console.error('[map-info-game-login] FAIL:', err);
    process.exit(1);
});
