'use strict';

// D1-6-IMPL (docs/backlog.md, docs/design/d1-step6-battle-broadcast.md §5
// step 5, §3.2): unit test for HOST_ADDRESS_REQUIRE_MODE, added to
// dispatch/gate.game.dispatch.js, plus config/whitelist.js's new
// getHostAddress().
//
// Three scenarios (per the task contract):
//   (a) A whitelisted account with no configured hostAddress, hosting a 2+
//       member room, presses F5 -- nothing at all (not even Game_Wait_SN)
//       must reach either connection, and a refusal must be logged.
//   (b) A non-host connection sends Game_Start_CN 0x00222103 -- it must be
//       ignored, and neither connection receives anything.
//   (c) A 1-person room (host alone, no configured hostAddress) must be
//       unaffected -- the check never triggers when there is nobody else to
//       tell (design doc §5 step 5: "1 人房不受影響").
//
// Run: node test/room-host-address-require.js  (exit 0 = pass, exit 1 = fail)

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
const GAME_WAIT_SN = '0x00420111';

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

async function flushMicrotasks(rounds = 20)
{
    for (let i = 0; i < rounds; ++i)
        await new Promise((resolve) => setImmediate(resolve));
}

function loadGateDispatch()
{
    delete require.cache[require.resolve('../dispatch/gate.game.dispatch.js')];
    return require('../dispatch/gate.game.dispatch.js');
}

async function createRoomWithTwoMembers(gate)
{
    const clientA = makeFakeClient(1, 30907);
    const clientB = makeFakeClient(2, 30907);
    clientA.accountId_ = 1;
    clientB.accountId_ = 2;
    clientA.nickname_ = 'Alice';
    clientB.nickname_ = 'Bob';
    clientA.username_ = 'Alice';
    clientB.username_ = 'Bob';
    clientA.pilot_ = 101;
    clientB.pilot_ = 102;
    clientA.currentHangarSlot_ = 1;
    clientB.currentHangarSlot_ = 2;

    const createHandled = gate.dispatch(clientA, CQ_CREATE, makeCreateBody('Alice Room'));
    assert.strictEqual(createHandled, true, 'CQ_CREATE must be handled');
    const roomId = clientA.createdRoomIndex_;
    assert.ok(roomId, 'A must have a createdRoomIndex_ after CQ_CREATE');
    rooms.addMember(roomId, { accountId: 2, nickname: 'Bob', team: 0, slot: 0, ready: false, client: clientB });
    assert.strictEqual(rooms.getRoom(roomId).members.size, 2, 'room must have 2 members');

    return { clientA, clientB, roomId };
}

async function testMissingHostAddressRefusesStart()
{
    installFakeWhitelist({}); // Alice whitelisted (per real config elsewhere) but no hostAddress entry here
    const GateGameDispatch = loadGateDispatch();
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    GateGameDispatch._setHostAddressRequireModeForTest('enabled');

    const gate = new GateGameDispatch();
    const fakeTimers = installFakeTimers();
    try {
        const { clientA, clientB } = await createRoomWithTwoMembers(gate);
        while (fakeTimers.fireNext()) { /* drain CQ_CREATE's own retries */ }
        await flushMicrotasks();
        clientA._sent.length = 0;
        clientB._sent.length = 0;

        const startHandled = gate.dispatch(clientA, GAME_START_CN, Buffer.alloc(0));
        assert.strictEqual(startHandled, true, 'the opcode is still claimed (handled=true), just refused internally');

        while (fakeTimers.hasPending()) {
            fakeTimers.fireNext();
            await flushMicrotasks();
        }

        assert.strictEqual(clientA._sent.length, 0, 'host must receive nothing at all -- not even Game_Wait_SN');
        assert.strictEqual(clientB._sent.length, 0, 'non-host must receive nothing at all');
        console.log('[room-host-address-require test] PASS: missing hostAddress in a 2-member room refuses the whole battle-start sequence');
    } finally {
        fakeTimers.restore();
        rooms._resetForTests();
    }
}

async function testNonHostTriggerIgnored()
{
    installFakeWhitelist({ alice: '203.0.113.5' });
    const GateGameDispatch = loadGateDispatch();
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    GateGameDispatch._setHostAddressRequireModeForTest('enabled');

    const gate = new GateGameDispatch();
    const fakeTimers = installFakeTimers();
    try {
        const { clientA, clientB } = await createRoomWithTwoMembers(gate);
        while (fakeTimers.fireNext()) { /* drain CQ_CREATE's own retries */ }
        await flushMicrotasks();
        clientA._sent.length = 0;
        clientB._sent.length = 0;

        // B (non-host) sends 0x00222103 instead of A.
        const startHandled = gate.dispatch(clientB, GAME_START_CN, Buffer.alloc(0));
        assert.strictEqual(startHandled, true, 'the opcode is still claimed (handled=true), just ignored internally');

        while (fakeTimers.hasPending()) {
            fakeTimers.fireNext();
            await flushMicrotasks();
        }

        assert.strictEqual(clientA._sent.length, 0, 'host must receive nothing from a non-host-triggered 0x00222103');
        assert.strictEqual(clientB._sent.length, 0, 'the non-host sender itself must receive nothing either');
        console.log('[room-host-address-require test] PASS: a non-host 0x00222103 is ignored, no packets sent to anyone');
    } finally {
        fakeTimers.restore();
        rooms._resetForTests();
    }
}

async function testSoloRoomUnaffected()
{
    installFakeWhitelist({}); // no hostAddress configured, must not matter for a solo room
    const GateGameDispatch = loadGateDispatch();
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    GateGameDispatch._setHostAddressRequireModeForTest('enabled');

    const gate = new GateGameDispatch();
    const clientA = makeFakeClient(1, 30907);
    clientA.accountId_ = 1;
    clientA.nickname_ = 'Alice';
    clientA.username_ = 'Alice';
    clientA.pilot_ = 101;
    clientA.currentHangarSlot_ = 1;

    const fakeTimers = installFakeTimers();
    try {
        const createHandled = gate.dispatch(clientA, CQ_CREATE, makeCreateBody('Solo Room'));
        assert.strictEqual(createHandled, true, 'CQ_CREATE must be handled');
        while (fakeTimers.fireNext()) { /* drain CQ_CREATE's own retries */ }
        await flushMicrotasks();
        clientA._sent.length = 0;

        const startHandled = gate.dispatch(clientA, GAME_START_CN, Buffer.alloc(0));
        assert.strictEqual(startHandled, true, 'Game_Start_CN 0x00222103 must be handled');

        while (fakeTimers.hasPending()) {
            fakeTimers.fireNext();
            await flushMicrotasks();
        }

        assert.strictEqual(clientA._sent.some((s) => s.op === GAME_WAIT_SN), true, 'a 1-person room must still battle-start normally, hostAddress check does not apply');
        console.log('[room-host-address-require test] PASS: a 1-person room is unaffected by the missing-hostAddress check');
    } finally {
        fakeTimers.restore();
        rooms._resetForTests();
    }
}

async function main()
{
    await testMissingHostAddressRefusesStart();
    await testNonHostTriggerIgnored();
    await testSoloRoomUnaffected();
    console.log('[room-host-address-require test] ALL CHECKS PASS');
    process.exit(0);
}

main().catch((err) => {
    console.error('[room-host-address-require test] FAIL:', err);
    process.exit(1);
});
