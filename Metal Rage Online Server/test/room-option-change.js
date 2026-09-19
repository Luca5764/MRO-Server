'use strict';

// OPTIONMASK-FIX (docs/backlog.md, docs/research/2026-09-19-intrude/notes.md,
// 🟡 待審): unit test for Room_Option_Change_CQ 0x00220215 /
// Room_Option_Change_SA 0x00220216 + Room_Option_SN 0x00220217 broadcast,
// gated by rooms.isRoomOptionSourceEnabled(). Same harness technique as
// test/room-name-change.js: ZGateGameDispatch.dispatch() directly against
// fake clients sharing rooms.js's module-level registry.
//
// Run: node test/room-option-change.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));

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

const rooms = require('../rooms.js');
const GateGameDispatch = require('../dispatch/gate.game.dispatch.js');

const CQ_CREATE = 0x00220201;
const CQ_OPTION_CHANGE = 0x00220215;
const SA_OPTION_CHANGE = '0x00220216';
const ROOM_OPTION_SN = '0x00220217';

/** Mirrors test/room-name-change.js's makeCreateBody(). A non-empty
 *  password at body+39/40.. so scenario 2 can check IsPassword survives. */
function makeCreateBody(name, password)
{
    const body = Buffer.alloc(51 + (password ? password.length : 0));
    body[0] = 1;                      // roomType: 1 = campaign
    body[1] = 0;
    body.writeUInt16LE(0, 2);
    // body[4..5] is PlayTime in minutes (createWord2) -- deliberately
    // non-zero here, to prove the legacy optionMask=createWord2 bug is
    // gone once ROOM_OPTION_SOURCE_MODE is on (old code would have leaked
    // these bits into Room_Option_SN).
    body.writeUInt16LE(0x1234, 4);
    body[6] = 5;
    body.writeUInt16LE(0, 7);
    body.writeUInt16LE(0, 9);
    body[11] = 0;
    body.writeUInt16LE(8, 12);
    body.write(name, 14, Math.min(name.length, 25), 'ascii');
    if (password) {
        body[39] = 1;
        body.write(password, 40, Math.min(password.length, 11), 'ascii');
    } else {
        body[39] = 0;
    }
    return body;
}

/** Room_Option_Change_CQ 0x00220215: DLL sender 0x107eeb80, body+1=IsBalance,
 *  body+2=IsIntrude (docs/research/2026-09-18-room-setting/notes.md Q3). */
function makeOptionChangeBody(isBalance, isIntrude)
{
    const body = Buffer.alloc(0x13);
    body[1] = isBalance ? 1 : 0;
    body[2] = isIntrude ? 1 : 0;
    return body;
}

function main()
{
    // --- 1. Switch off (default): must reproduce the exact pre-existing
    // behaviour -- unconditional success ack, no host check, no broadcast to
    // other members. ---
    rooms._resetForTests();
    const fakeTimers0 = installFakeTimers();
    try {
        const gate = new GateGameDispatch();
        const host = makeFakeClient(1, 30907);
        const other = makeFakeClient(2, 30907);
        host.accountId_ = 1;
        other.accountId_ = 2;
        host.nickname_ = 'Host';

        gate.dispatch(host, CQ_CREATE, makeCreateBody('Room', null));
        const roomId = host.createdRoomIndex_;
        rooms.addMember(roomId, { accountId: 2, nickname: 'Other', team: 0, slot: 1, ready: false, client: other });
        while (fakeTimers0.fireNext()) { /* drain CQ_CREATE's room-state retry burst */ }
        host._sent.length = 0;
        other._sent.length = 0;

        // A non-host sending the CQ still gets an unconditional success ack
        // while the switch is off -- this is the pre-existing bug, kept
        // byte-for-byte.
        const handled = gate.dispatch(other, CQ_OPTION_CHANGE, makeOptionChangeBody(1, 1));
        assert.strictEqual(handled, true, 'CQ must be handled');
        const sa = other._sent.filter((s) => s.op === SA_OPTION_CHANGE);
        assert.strictEqual(sa.length, 1, 'sender must get exactly one Option_Change_SA');
        assert.strictEqual(Buffer.from(sa[0].hex, 'hex').readUInt16LE(0), 0, 'switch off: always success, no host check');
        assert.strictEqual(rooms.getRoom(roomId).options.balance, false, 'switch off: room.options must never be touched');
        assert.strictEqual(host._sent.filter((s) => s.op === ROOM_OPTION_SN).length, 0, 'switch off: no broadcast to other members');
    } finally {
        fakeTimers0.restore();
        rooms._resetForTests();
    }
    console.log('[room-option-change test] PASS: switch off reproduces the pre-existing unconditional-ack behaviour');

    // --- 2. Switch on: room creation reflects the password; no
    // balance/intrude leak from the old createWord2 bug. ---
    rooms._resetForTests();
    rooms._setRoomOptionSourceModeForTests('enabled');
    const fakeTimers1 = installFakeTimers();
    try {
        const gate = new GateGameDispatch();
        const host = makeFakeClient(1, 30907);
        host.accountId_ = 1;
        host.nickname_ = 'Host';

        gate.dispatch(host, CQ_CREATE, makeCreateBody('Locked Room', 'secret'));
        const roomId = host.createdRoomIndex_;
        while (fakeTimers1.fireNext()) { /* drain */ }

        const room = rooms.getRoom(roomId);
        assert.strictEqual(room.options.password, true, 'room.options.password must reflect the non-empty CQ_CREATE password');
        assert.strictEqual(room.options.balance, false, 'room.options.balance must default false at creation');
        assert.strictEqual(room.options.intrude, false, 'room.options.intrude must default false at creation (no leaked createWord2 bits)');

        const optionSn = host._sent.filter((s) => s.op === ROOM_OPTION_SN);
        assert.ok(optionSn.length >= 1, 'Room_Option_SN must have been sent during room-state burst');
        const optBody = Buffer.from(optionSn[optionSn.length - 1].hex, 'hex');
        assert.strictEqual(optBody.readUInt8(0), 1, 'Room_Option_SN body+0 (IsPassword) must be 1');
        assert.strictEqual(optBody.readUInt8(1), 0, 'Room_Option_SN body+1 (IsBalance) must be 0, not leaked from createWord2=0x1234');
        assert.strictEqual(optBody.readUInt8(2), 0, 'Room_Option_SN body+2 (IsIntrude) must be 0, not leaked from createWord2=0x1234');
    } finally {
        fakeTimers1.restore();
        rooms._resetForTests();
    }
    console.log('[room-option-change test] PASS: switch on -- room creation reflects the password, no createWord2 leak');

    // --- 3. Switch on: host sends Option_Change with intrude=0 -- all
    // members get Room_Option_SN with body+2=0, host gets a success SA. ---
    rooms._resetForTests();
    rooms._setRoomOptionSourceModeForTests('enabled');
    const fakeTimers2 = installFakeTimers();
    try {
        const gate = new GateGameDispatch();
        const host = makeFakeClient(1, 30907);
        const other = makeFakeClient(2, 30907);
        host.accountId_ = 1;
        other.accountId_ = 2;
        host.nickname_ = 'Host';

        gate.dispatch(host, CQ_CREATE, makeCreateBody('Room', null));
        const roomId = host.createdRoomIndex_;
        // Pre-set intrude=true directly on the Room object so the CQ below
        // (isIntrude=0) is an observable change, not a no-op.
        rooms.getRoom(roomId).options.intrude = true;
        rooms.addMember(roomId, { accountId: 2, nickname: 'Other', team: 0, slot: 1, ready: false, client: other });
        while (fakeTimers2.fireNext()) { /* drain */ }
        host._sent.length = 0;
        other._sent.length = 0;

        const handled = gate.dispatch(host, CQ_OPTION_CHANGE, makeOptionChangeBody(1, 0));
        assert.strictEqual(handled, true, 'Option_Change_CQ must be handled');

        const hostSa = host._sent.filter((s) => s.op === SA_OPTION_CHANGE);
        assert.strictEqual(hostSa.length, 1, 'host must receive exactly one Option_Change_SA');
        assert.strictEqual(Buffer.from(hostSa[0].hex, 'hex').readUInt16LE(0), 0, 'Option_Change_SA must be success for the host');

        const room = rooms.getRoom(roomId);
        assert.strictEqual(room.options.balance, true, 'room.options.balance must be updated from the CQ');
        assert.strictEqual(room.options.intrude, false, 'room.options.intrude must be updated from the CQ');

        for (const [label, client] of [['host', host], ['other', other]]) {
            const sn = client._sent.filter((s) => s.op === ROOM_OPTION_SN);
            assert.strictEqual(sn.length, 1, `${label} must receive exactly one Room_Option_SN broadcast`);
            const snBody = Buffer.from(sn[0].hex, 'hex');
            assert.strictEqual(snBody.readUInt8(1), 1, `${label}: Room_Option_SN body+1 (IsBalance) must be 1`);
            assert.strictEqual(snBody.readUInt8(2), 0, `${label}: Room_Option_SN body+2 (IsIntrude) must be 0`);
        }
    } finally {
        fakeTimers2.restore();
        rooms._resetForTests();
    }
    console.log('[room-option-change test] PASS: host Option_Change broadcasts Room_Option_SN to every member');

    // --- 4. Switch on: a non-host is refused, room.options unchanged, no
    // broadcast. ---
    rooms._resetForTests();
    rooms._setRoomOptionSourceModeForTests('enabled');
    const fakeTimers3 = installFakeTimers();
    try {
        const gate = new GateGameDispatch();
        const host = makeFakeClient(1, 30907);
        const other = makeFakeClient(2, 30907);
        host.accountId_ = 1;
        other.accountId_ = 2;
        host.nickname_ = 'Host';

        gate.dispatch(host, CQ_CREATE, makeCreateBody('Room', null));
        const roomId = host.createdRoomIndex_;
        rooms.addMember(roomId, { accountId: 2, nickname: 'Other', team: 0, slot: 1, ready: false, client: other });
        while (fakeTimers3.fireNext()) { /* drain */ }
        host._sent.length = 0;
        other._sent.length = 0;

        const handled = gate.dispatch(other, CQ_OPTION_CHANGE, makeOptionChangeBody(1, 1));
        assert.strictEqual(handled, true, 'Option_Change_CQ must still be handled (and refused)');

        const otherSa = other._sent.filter((s) => s.op === SA_OPTION_CHANGE);
        assert.strictEqual(otherSa.length, 1, 'the non-host must still receive exactly one Option_Change_SA');
        assert.strictEqual(Buffer.from(otherSa[0].hex, 'hex').readUInt16LE(0), 1, 'Option_Change_SA result word must be non-zero (failure) for a non-host');

        const room = rooms.getRoom(roomId);
        assert.strictEqual(room.options.balance, false, 'a non-host Option_Change must not change room.options');
        assert.strictEqual(room.options.intrude, false, 'a non-host Option_Change must not change room.options');
        assert.strictEqual(host._sent.some((s) => s.op === ROOM_OPTION_SN), false, 'no Room_Option_SN broadcast must follow a refused change');
        assert.strictEqual(other._sent.filter((s) => s.op === ROOM_OPTION_SN).length, 0, 'no Room_Option_SN broadcast must follow a refused change');
    } finally {
        fakeTimers3.restore();
        rooms._resetForTests();
    }
    console.log('[room-option-change test] PASS: a non-host is refused and room.options stays unchanged');

    console.log('[room-option-change test] ALL CHECKS PASS');
    process.exit(0);
}

main();
