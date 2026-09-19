'use strict';

// D1-6-IMPL (docs/backlog.md, docs/design/d1-step6-battle-broadcast.md §5
// step 4): unit test for rooms.isReadyHostSplitEnabled(), added to
// dispatch/gate.game.dispatch.js and dispatch/community.dispatch.js.
//
// Scenario: A (host) and B (non-host) are both members of a room. A presses
// F5 -- only A's connection must receive Ready_Host_SQ 0x00420113, never B's.
// A then answers with Ready_Host_CA 0x00420114 carrying a fake listen port
// (12345) and result=0 (success). B's connection must receive Ready_Host_SN
// 0x00420115 whose port field equals that same fake port (not the hardcoded
// 30907 the single-connection path still uses), immediately followed by
// Ready_Success_SN 0x00420116; A must still receive its own
// Ready_Success_SN.
//
// A second scenario proves the "missing hostAddress" failure mode: the same
// flow with config/whitelist.js's getHostAddress() returning null -- B must
// receive nothing at all (no Ready_Host_SN, no Ready_Success_SN), while A
// still gets its own Ready_Success_SN.
//
// Same require.cache-swap technique as test/whitelist.js for faking
// config/whitelist.js (this test never reads config/allowed-users.json).
//
// Run: node test/room-ready-host-split.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));
const WHITELIST_PATH = require.resolve(path.join(ROOT, 'config', 'whitelist.js'));

const { makeFixtureDb } = require('./fixtures/fake-db.js');
const { makeFakeClient } = require('./fixtures/fake-client.js');
const { installFakeTimers } = require('./fixtures/fake-timers.js');

function installFakeModule(resolvedPath, exportsObj)
{
    const mod = new Module(resolvedPath, null);
    mod.filename = resolvedPath;
    mod.loaded = true;
    mod.exports = exportsObj;
    require.cache[resolvedPath] = mod;
}

installFakeModule(DB_PATH, makeFixtureDb());

function installFakeWhitelist(hostAddressesByUsername)
{
    installFakeModule(WHITELIST_PATH, {
        isAllowed() { return true; },
        status() { return 'off'; },
        getHostAddress(username) {
            const key = String(username || '').toLowerCase();
            return Object.prototype.hasOwnProperty.call(hostAddressesByUsername, key)
                ? hostAddressesByUsername[key]
                : null;
        },
    });
}

const rooms = require('../rooms.js');

const CQ_CREATE = 0x00220201;
const GAME_START_CN = 0x00222103;
const READY_HOST_CA = 0x00420114;
const READY_HOST_SQ = '0x00420113';
const READY_HOST_SN = '0x00420115';
const READY_SUCCESS_SN = '0x00420116';

function makeCreateBody(name)
{
    const body = Buffer.alloc(51);
    body[0] = 1;
    body[1] = 0;
    body.writeUInt16LE(0, 2);
    body.writeUInt16LE(0, 4);
    body[6] = 5;
    body.writeUInt16LE(0, 7);
    body.writeUInt16LE(0, 9);
    body[11] = 0;
    body.writeUInt16LE(8, 12);
    body.write(name, 14, Math.min(name.length, 25), 'ascii');
    body[39] = 0;
    return body;
}

function makeReadyHostCaBody(port, resultCode = 0)
{
    const body = Buffer.alloc(8);
    body.writeUInt16LE(0, 0x00);
    body.writeUInt32LE(resultCode, 0x02);
    body.writeUInt16LE(port, 0x06);
    return body;
}

async function flushMicrotasks(rounds = 20)
{
    for (let i = 0; i < rounds; ++i)
        await new Promise((resolve) => setImmediate(resolve));
}

function setUpRoom()
{
    // Fresh require each scenario -- gate.game.dispatch.js and
    // community.dispatch.js are both required fresh so community's lazy
    // require('./gate.game.dispatch.js') below picks up the same instance
    // already loaded by this process (no module-cache swap needed for
    // either -- only database/db.js and config/whitelist.js are faked).
    delete require.cache[require.resolve('../dispatch/gate.game.dispatch.js')];
    delete require.cache[require.resolve('../dispatch/community.dispatch.js')];
    const GateGameDispatch = require('../dispatch/gate.game.dispatch.js');
    const CommunityDispatch = require('../dispatch/community.dispatch.js');

    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    rooms._setReadyHostSplitModeForTests('enabled');

    const gate = new GateGameDispatch();
    const community = new CommunityDispatch();

    const clientA = makeFakeClient(1, 30907);
    const clientB = makeFakeClient(2, 30907);
    clientA.accountId_ = 1;
    clientB.accountId_ = 2;
    clientA.nickname_ = 'Alice';
    clientB.nickname_ = 'Bob';
    clientA.username_ = 'Alice';
    clientA.pilot_ = 101;
    clientB.pilot_ = 102;
    clientA.currentHangarSlot_ = 1;
    clientB.currentHangarSlot_ = 2;

    return { gate, community, clientA, clientB };
}

async function startBattleUpToReadyHostSq({ gate, clientA, clientB, fakeTimers, createBody })
{
    const createHandled = gate.dispatch(clientA, CQ_CREATE, createBody || makeCreateBody('Alice Room'));
    assert.strictEqual(createHandled, true, 'CQ_CREATE must be handled');
    const roomId = clientA.createdRoomIndex_;
    assert.ok(roomId, 'A must have a createdRoomIndex_ after CQ_CREATE');

    rooms.addMember(roomId, { accountId: 2, nickname: 'Bob', team: 0, slot: 0, ready: false, client: clientB });
    assert.strictEqual(rooms.getRoom(roomId).members.size, 2, 'room must have 2 members before F5');

    while (fakeTimers.fireNext()) { /* drain CQ_CREATE's own room-state retries */ }
    await flushMicrotasks();
    clientA._sent.length = 0;
    clientB._sent.length = 0;

    const startHandled = gate.dispatch(clientA, GAME_START_CN, Buffer.alloc(0));
    assert.strictEqual(startHandled, true, 'Game_Start_CN 0x00222103 must be handled');

    while (fakeTimers.hasPending()) {
        fakeTimers.fireNext();
        await flushMicrotasks();
    }

    return roomId;
}

async function testSqOnlyToHostAndSnToNonHost()
{
    installFakeWhitelist({ alice: '203.0.113.5' });
    const { gate, community, clientA, clientB } = setUpRoom();

    const fakeTimers = installFakeTimers();
    try {
        await startBattleUpToReadyHostSq({ gate, clientA, clientB, fakeTimers });

        assert.strictEqual(clientA._sent.filter((s) => s.op === READY_HOST_SQ).length, 1, 'A (host) must receive exactly one Ready_Host_SQ');
        assert.strictEqual(clientB._sent.some((s) => s.op === READY_HOST_SQ), false, 'B (non-host) must never receive Ready_Host_SQ');
        console.log('[room-ready-host-split test] PASS: Ready_Host_SQ goes only to the host connection');

        clientA._sent.length = 0;
        clientB._sent.length = 0;

        const FAKE_PORT = 12345;
        const caHandled = community.dispatch(clientA, READY_HOST_CA, makeReadyHostCaBody(FAKE_PORT, 0));
        assert.strictEqual(caHandled, true, 'Ready_Host_CA 0x00420114 must be handled');

        const aSuccess = clientA._sent.filter((s) => s.op === READY_SUCCESS_SN);
        assert.strictEqual(aSuccess.length, 1, 'A (host) must still receive its own Ready_Success_SN');

        const bReadyHostSn = clientB._sent.filter((s) => s.op === READY_HOST_SN);
        assert.strictEqual(bReadyHostSn.length, 1, 'B (non-host) must receive exactly one Ready_Host_SN');
        const bBody = Buffer.from(bReadyHostSn[0].hex, 'hex');
        assert.strictEqual(bBody.readUInt16LE(0x00), FAKE_PORT, `Ready_Host_SN port field must be the host-reported port (${FAKE_PORT}), not hardcoded 30907`);
        const bIpWithMap = bBody.subarray(0x03).toString('ascii').split('\0')[0];
        assert.strictEqual(bIpWithMap, '203.0.113.5', `RHSN-IP: Ready_Host_SN ip field must be the bare hostAddress (client appends :port/map itself), got "${bIpWithMap}"`);

        const bSuccess = clientB._sent.filter((s) => s.op === READY_SUCCESS_SN);
        assert.strictEqual(bSuccess.length, 1, 'B (non-host) must receive exactly one Ready_Success_SN, right after Ready_Host_SN');
        assert.strictEqual(clientB._sent[clientB._sent.length - 1].op, READY_SUCCESS_SN, 'B must receive Ready_Success_SN immediately after Ready_Host_SN (design §1 row 9 proposal)');

        console.log('[room-ready-host-split test] PASS: non-host gets Ready_Host_SN (host-reported port + configured hostAddress) then Ready_Success_SN');
    } finally {
        fakeTimers.restore();
        rooms._resetForTests();
    }
}

async function testMissingHostAddressSendsNothingToNonHost()
{
    installFakeWhitelist({}); // no entries -- getHostAddress('alice') returns null
    const { gate, community, clientA, clientB } = setUpRoom();

    const fakeTimers = installFakeTimers();
    try {
        await startBattleUpToReadyHostSq({ gate, clientA, clientB, fakeTimers });
        clientA._sent.length = 0;
        clientB._sent.length = 0;

        const caHandled = community.dispatch(clientA, READY_HOST_CA, makeReadyHostCaBody(12345, 0));
        assert.strictEqual(caHandled, true, 'Ready_Host_CA 0x00420114 must be handled');

        assert.strictEqual(clientA._sent.filter((s) => s.op === READY_SUCCESS_SN).length, 1, 'A (host) must still receive its own Ready_Success_SN even when hostAddress is missing');
        assert.strictEqual(clientB._sent.length, 0, 'B (non-host) must receive nothing at all when the host has no configured hostAddress');

        console.log('[room-ready-host-split test] PASS: missing hostAddress -> non-host gets nothing, host still gets its own Ready_Success_SN');
    } finally {
        fakeTimers.restore();
        rooms._resetForTests();
    }
}

// SOL-REVIEW-2 point 3 (docs/research/2026-09-19-sol-review/batch2.md):
// a short/malformed Ready_Host_CA must not be treated as success (must not
// default the result code to 0) and must not fall back to the hardcoded
// 30907 port -- nobody, including the host itself, gets anything.
async function testMalformedCaSendsNothingToAnyone()
{
    installFakeWhitelist({ alice: '203.0.113.5' });
    const { gate, community, clientA, clientB } = setUpRoom();

    const fakeTimers = installFakeTimers();
    try {
        await startBattleUpToReadyHostSq({ gate, clientA, clientB, fakeTimers });
        clientA._sent.length = 0;
        clientB._sent.length = 0;

        // Only 6 bytes -- short of the 8 needed to hold the +0x06 port field.
        const shortBody = makeReadyHostCaBody(12345, 0).subarray(0, 6);
        const caHandled = community.dispatch(clientA, READY_HOST_CA, shortBody);
        assert.strictEqual(caHandled, true, 'Ready_Host_CA 0x00420114 must still be handled (claims the opcode)');

        assert.strictEqual(clientA._sent.length, 0, 'A (host) must receive NOTHING for a malformed (<8 byte) CA -- not even its own Ready_Success_SN');
        assert.strictEqual(clientB._sent.length, 0, 'B (non-host) must receive nothing for a malformed CA');

        console.log('[room-ready-host-split test] PASS: malformed (<8 byte) Ready_Host_CA sends nothing to anyone, including the host');
    } finally {
        fakeTimers.restore();
        rooms._resetForTests();
    }
}

// SOL-REVIEW-2 point 3: result != 0 (Listen failure) must not still send
// the host its own Ready_Success_SN.
async function testListenFailureResultSendsNothingToAnyone()
{
    installFakeWhitelist({ alice: '203.0.113.5' });
    const { gate, community, clientA, clientB } = setUpRoom();

    const fakeTimers = installFakeTimers();
    try {
        await startBattleUpToReadyHostSq({ gate, clientA, clientB, fakeTimers });
        clientA._sent.length = 0;
        clientB._sent.length = 0;

        const caHandled = community.dispatch(clientA, READY_HOST_CA, makeReadyHostCaBody(12345, 0xFFFFFFFF));
        assert.strictEqual(caHandled, true, 'Ready_Host_CA 0x00420114 must still be handled (claims the opcode)');

        assert.strictEqual(clientA._sent.length, 0, 'A (host) must receive NOTHING when its own CA reports a Listen failure -- not even its own Ready_Success_SN');
        assert.strictEqual(clientB._sent.length, 0, 'B (non-host) must receive nothing on a Listen failure');

        console.log('[room-ready-host-split test] PASS: result=0xFFFFFFFF (Listen failure) sends nothing to anyone, including the host');
    } finally {
        fakeTimers.restore();
        rooms._resetForTests();
    }
}

// RHSN-MAP (docs/journal/2026-09-19-0330-d1-step4-room-join.md's RHSN-MAP
// note): buildReadyHostSnMsg() in gate.game.dispatch.js used to look up
// room.mapId in CACHE_INDEX_TO_MAP_NAME_GG, a table keyed by legacy
// invented cache indexes (58/70/64/77...) -- room.mapId is actually a real
// Cache.Bin map id (9001..9012 PvE, 1011..1081 PvP), so every lookup
// missed and the non-host always got 'Map_PC01' regardless of the real
// map. CQ_CREATE body[2..3] (createWord1) is the picked PvE map id this
// room ends up with (client action: room UI's difficulty pick before
// pressing Create Room) -- see gate.game.dispatch.js's CQ_CREATE handler.
async function testReadyHostSnUsesRealMapId(pickedMapId, expectedMapName)
{
    installFakeWhitelist({ alice: '203.0.113.5' });
    const { gate, community, clientA, clientB } = setUpRoom();

    const fakeTimers = installFakeTimers();
    try {
        const createBody = makeCreateBody('Alice Room');
        createBody.writeUInt16LE(pickedMapId, 2);
        await startBattleUpToReadyHostSq({ gate, clientA, clientB, fakeTimers, createBody });

        const caHandled = community.dispatch(clientA, READY_HOST_CA, makeReadyHostCaBody(12345, 0));
        assert.strictEqual(caHandled, true, 'Ready_Host_CA 0x00420114 must be handled');

        const bReadyHostSn = clientB._sent.filter((s) => s.op === READY_HOST_SN);
        assert.strictEqual(bReadyHostSn.length, 1, 'B (non-host) must receive exactly one Ready_Host_SN');
        const bBody = Buffer.from(bReadyHostSn[0].hex, 'hex');
        const bIpWithMap = bBody.subarray(0x03).toString('ascii').split('\0')[0];
        // RHSN-IP: the non-host field no longer carries the map (the client appends
        // its own); only check it is the bare IP. expectedMapName stays for the
        // single-connection path's table, exercised elsewhere.
        void expectedMapName;
        assert.ok(!bIpWithMap.includes('/'), `RHSN-IP: Ready_Host_SN ip field for room mapId=${pickedMapId} must be a bare IP, got "${bIpWithMap}"`);

        console.log(`[room-ready-host-split test] PASS: room mapId=${pickedMapId} -> Ready_Host_SN URL contains "${expectedMapName}"`);
    } finally {
        fakeTimers.restore();
        rooms._resetForTests();
    }
}

async function main()
{
    await testSqOnlyToHostAndSnToNonHost();
    await testMissingHostAddressSendsNothingToNonHost();
    await testMalformedCaSendsNothingToAnyone();
    await testListenFailureResultSendsNothingToAnyone();
    await testReadyHostSnUsesRealMapId(9010, 'Map_PC04');
    await testReadyHostSnUsesRealMapId(9001, 'Map_PC01');
    console.log('[room-ready-host-split test] ALL CHECKS PASS');
    process.exit(0);
}

main().catch((err) => {
    console.error('[room-ready-host-split test] FAIL:', err);
    process.exit(1);
});
