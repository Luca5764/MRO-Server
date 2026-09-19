'use strict';

// SELF-AVATAR-EXP (docs/backlog.md): unit test for the ROOM_SELF_RECORD_RESEND_MODE
// switch added to dispatch/room/room-user.sender.js, wired into
// dispatch/room.dispatch.js's sendRoomState() (host/CREATE path) and
// dispatch/gate.game.dispatch.js's sendFullRoomStateToClient() (joiner/ENTER
// path). Default 'disabled' -- this switch tests the hypothesis that a
// client's own avatar in the room slot grid only draws when its own user
// record arrives *after* the room page is already open (see the switch's
// own doc comment in room-user.sender.js for the [LOG] evidence). Same
// technique as test/room-join.js: calls the real dispatch() directly (no
// socket, no server.js) against fake clients sharing rooms.js's registry,
// with fake timers so the 1500ms delay does not slow the suite down.
//
// Run: node test/self-avatar-resend.js  (exit 0 = pass, exit 1 = fail)

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
const roomUserSender = require('../dispatch/room/room-user.sender.js');
const { leaveRoomAndNotify } = require('../dispatch/room/room-leave.js');

const CQ_CREATE = 0x00220201;
const ENTER_CQ = 0x00220231;
const USER_DEFAULT_SN = '0x00220233';

/**
 * Filters a fake client's _sent list down to User_Default_SN packets whose
 * userIndex field (body+0x02, LE u16 -- see room-user.sender.js's
 * SN_USER_DEFAULT layout) is this account's own -- needed once more than
 * one member is in play (e.g. a joiner's burst carries one record per
 * member, not just her own).
 */
function ownUserDefaultRecords(sentList, accountId)
{
    return sentList.filter((s) => {
        if (s.op !== USER_DEFAULT_SN) return false;
        return Buffer.from(s.hex, 'hex').readUInt16LE(0x02) === accountId;
    });
}

/** Same PvE CQ_CREATE body shape as test/room-join.js's makeCreateBody(). */
function makeCreateBody(name)
{
    const body = Buffer.alloc(51);
    body[0] = 1;                      // roomType: 1 = campaign
    body[1] = 0;
    body.writeUInt16LE(0, 2);
    body.writeUInt16LE(0, 4);
    body[6] = 5;
    body.writeUInt16LE(0, 7);
    body.writeUInt16LE(0, 9);
    body[11] = 0;
    body.writeUInt16LE(8, 12);
    body.write(name, 14, Math.min(name.length, 25), 'ascii');
    body[39] = 0;                     // no password
    return body;
}

function makeEnterBody(roomIndex)
{
    const body = Buffer.alloc(0x1D);
    body.writeUInt16LE(roomIndex, 0x00);
    return body;
}

function main()
{
    const gate = new GateGameDispatch();

    // --- A: CREATE (host) path, switch OFF (default) -- baseline is the
    // two-entry ROOM_STATE_RETRY_SCHEDULE burst (350ms/1200ms), nothing
    // extra. ---
    {
        rooms._resetForTests();
        const fakeTimers = installFakeTimers();
        try {
            const host = makeFakeClient(101, 30907);
            host.accountId_ = 101;
            host.nickname_ = 'HostOff';
            rooms.registerLobbyClientSource([host]);

            const createHandled = gate.dispatch(host, CQ_CREATE, makeCreateBody('Off Room'));
            assert.strictEqual(createHandled, true, 'CQ_CREATE must be handled');
            while (fakeTimers.fireNext()) { /* drain the retry burst */ }

            const ownRecords = host._sent.filter((s) => s.op === USER_DEFAULT_SN);
            assert.strictEqual(ownRecords.length, 2, 'switch off (default): host must get only the 2-entry retry burst, no extra resend');
            console.log('[self-avatar-resend test] PASS: switch off (default) -- CREATE path sends no extra own-record resend');
        } finally {
            fakeTimers.restore();
            rooms._resetForTests();
        }
    }

    // --- B: CREATE (host) path, switch ON -- exactly one extra own-record
    // resend, debounced across the two-entry retry burst. ---
    {
        rooms._resetForTests();
        roomUserSender._setSelfRecordResendModeForTest('enabled');
        const fakeTimers = installFakeTimers();
        try {
            const host = makeFakeClient(102, 30907);
            host.accountId_ = 102;
            host.nickname_ = 'HostOn';
            rooms.registerLobbyClientSource([host]);

            const createHandled = gate.dispatch(host, CQ_CREATE, makeCreateBody('On Room'));
            assert.strictEqual(createHandled, true, 'CQ_CREATE must be handled');
            while (fakeTimers.fireNext()) { /* drain the retry burst + the debounced self-resend */ }

            const ownRecords = host._sent.filter((s) => s.op === USER_DEFAULT_SN);
            assert.strictEqual(ownRecords.length, 3, 'switch on: host must get the 2-entry retry burst plus exactly one debounced self-resend');
            console.log('[self-avatar-resend test] PASS: switch on -- CREATE path (2-entry burst) collapses to exactly one extra own-record resend');
        } finally {
            fakeTimers.restore();
            roomUserSender._setSelfRecordResendModeForTest('disabled');
            rooms._resetForTests();
        }
    }

    // --- C: ENTER (joiner) path, switch ON, but the joiner leaves before
    // the scheduled resend fires -- guard must skip it (nothing extra). ---
    {
        rooms._resetForTests();
        rooms._setRoomJoinModeForTests('enabled');
        roomUserSender._setSelfRecordResendModeForTest('enabled');
        const fakeTimers = installFakeTimers();
        try {
            const host = makeFakeClient(103, 30907);
            host.accountId_ = 103;
            host.nickname_ = 'HostC';
            const joiner = makeFakeClient(104, 30907);
            joiner.accountId_ = 104;
            joiner.nickname_ = 'JoinerC';
            rooms.registerLobbyClientSource([host, joiner]);

            const createHandled = gate.dispatch(host, CQ_CREATE, makeCreateBody('Leave Room'));
            assert.strictEqual(createHandled, true, 'CQ_CREATE must be handled');
            while (fakeTimers.fireNext()) { /* drain host's own retry burst + debounced self-resend, unrelated to this case */ }

            const roomId = host.createdRoomIndex_;
            joiner._sent.length = 0;

            const enterHandled = gate.dispatch(joiner, ENTER_CQ, makeEnterBody(roomId));
            assert.strictEqual(enterHandled, true, 'Enter_CQ must be handled');

            // Fire only the 350ms scene-change-race timer -- this sends the
            // joiner's full room-state burst (including her own record) and
            // schedules the self-resend timer, still pending.
            assert.strictEqual(fakeTimers.fireNext(), true, 'the 350ms joiner room-state timer must be pending');

            const baselineOwnRecords = ownUserDefaultRecords(joiner._sent, 104);
            assert.strictEqual(baselineOwnRecords.length, 1, 'joiner must have exactly one own User_Default_SN from the initial burst before the resend fires');

            // Joiner disconnects before the self-resend timer fires (same
            // shared function server.js's socket close hook calls).
            leaveRoomAndNotify(104);
            assert.strictEqual(rooms.getRoomByAccount(104), undefined, 'joiner must no longer be tracked in the room after leaving');

            // Now fire the pending self-resend timer -- guard must skip it.
            while (fakeTimers.fireNext()) { /* drain remaining timers, including the self-resend */ }

            const finalOwnRecords = ownUserDefaultRecords(joiner._sent, 104);
            assert.strictEqual(finalOwnRecords.length, 1, 'client left before the timer fired: no extra own-record resend must reach the joiner');
            console.log('[self-avatar-resend test] PASS: switch on, joiner leaves before the delay -- guard skips the resend');
        } finally {
            fakeTimers.restore();
            roomUserSender._setSelfRecordResendModeForTest('disabled');
            rooms._resetForTests();
        }
    }

    console.log('[self-avatar-resend test] ALL CHECKS PASS');
    process.exit(0);
}

main();
