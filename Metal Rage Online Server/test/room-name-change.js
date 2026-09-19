'use strict';

// ROOMNAME-BIG5 scope addition (coordinator live-test finding,
// docs/journal/2026-09-19-*-room-name-big5.md, 🟡, 未經跨公司審查): unit
// test for Name_Change_CQ 0x00220218 / Name_Change_SA 0x00220219, gated by
// the existing rooms.isRoomJoinEnabled() switch. Same harness technique as
// test/room-join.js: ZGateGameDispatch.dispatch() directly against fake
// clients sharing rooms.js's module-level registry.
//
// Run: node test/room-name-change.js  (exit 0 = pass, exit 1 = fail)

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
const CQ_NAME_CHANGE = 0x00220218;
const SA_NAME_CHANGE = '0x00220219';
const ROOM_NAME_SN = '0x0022021a';
const ROOM_LIST_SN = '0x00220204';

/** Mirrors test/room-join.js's makeCreateBody(). */
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
    body[39] = 0;
    return body;
}

/** Name_Change_CQ 0x00220218: 25-byte ANSI name, no other fields (per the
 *  coordinator's live-test log). */
function makeNameChangeBody(name)
{
    const body = Buffer.alloc(25);
    body.write(name, 0, Math.min(name.length, 25), 'ascii');
    return body;
}

function main()
{
    // --- 1. Switch off (default): must reproduce the exact pre-existing
    // "no reply, client hangs" behaviour -- nothing sent at all, since
    // 0x00220218 is even and the generic fallback's odd-opcode auto-ACK
    // never covered it. ---
    rooms._resetForTests();
    {
        const gate = new GateGameDispatch();
        const client = makeFakeClient(1, 30907);
        client.accountId_ = 1;
        const handled = gate.dispatch(client, CQ_NAME_CHANGE, makeNameChangeBody('123'));
        assert.strictEqual(handled, true, 'CQ must be handled (falls to the default case) even with the switch off');
        assert.strictEqual(client._sent.length, 0, 'switch off: no reply must be sent, matching the pre-existing hang');
    }
    console.log('[room-name-change test] PASS: switch off reproduces the pre-existing no-reply behaviour byte-for-byte');

    // --- 2. Switch on: host renames the room. ---
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    rooms._setLobbyRoomListModeForTests('enabled');
    const fakeTimers = installFakeTimers();
    try {
        const gate = new GateGameDispatch();
        const host = makeFakeClient(1, 30907);
        const other = makeFakeClient(2, 30907);
        const lobbyViewer = makeFakeClient(3, 30907);
        host.accountId_ = 1;
        other.accountId_ = 2;
        lobbyViewer.accountId_ = 3;
        host.nickname_ = 'Host';
        other.nickname_ = 'Other';
        rooms.registerLobbyClientSource([host, lobbyViewer]);

        const createHandled = gate.dispatch(host, CQ_CREATE, makeCreateBody('Old Name'));
        assert.strictEqual(createHandled, true, 'CQ_CREATE must be handled');
        const roomId = host.createdRoomIndex_;

        // Second member joins so the broadcast-to-every-member path has
        // more than one recipient.
        rooms.addMember(roomId, { accountId: 2, nickname: 'Other', team: 0, slot: 1, ready: false, client: other });

        while (fakeTimers.fireNext()) { /* drain CQ_CREATE's room-state retry burst */ }
        host._sent.length = 0;
        other._sent.length = 0;
        lobbyViewer._sent.length = 0;

        const renameHandled = gate.dispatch(host, CQ_NAME_CHANGE, makeNameChangeBody('New Name'));
        assert.strictEqual(renameHandled, true, 'Name_Change_CQ must be handled');
        assert.strictEqual(rooms.getRoom(roomId).name, 'New Name', 'the Room object must be updated');

        const hostSa = host._sent.filter((s) => s.op === SA_NAME_CHANGE);
        assert.strictEqual(hostSa.length, 1, 'host must receive exactly one Name_Change_SA');
        {
            const saBody = Buffer.from(hostSa[0].hex, 'hex');
            assert.strictEqual(saBody.readUInt16LE(0x00), 0, 'Name_Change_SA result word must be 0 (success)');
            assert.strictEqual(saBody.readUInt32LE(0x02), 0, 'Name_Change_SA error dword must be 0 (success)');
            // The client takes the name from its own pending CQ (DLL 0x107eb22d/0x107eb2a8),
            // so the SA is just the 6-byte header.
            assert.strictEqual(saBody.length, 6, 'Name_Change_SA body is the 6-byte success header');
        }
        console.log('[room-name-change test] PASS: host renaming gets a success Name_Change_SA (6-byte header)');

        const hostRoomName = host._sent.filter((s) => s.op === ROOM_NAME_SN);
        const otherRoomName = other._sent.filter((s) => s.op === ROOM_NAME_SN);
        assert.strictEqual(hostRoomName.length, 1, 'host must receive one Room_Name_SN broadcast');
        assert.strictEqual(otherRoomName.length, 1, 'the other member must also receive one Room_Name_SN broadcast');
        assert.strictEqual(Buffer.from(hostRoomName[0].hex, 'hex').subarray(0, 8).toString('ascii'), 'New Name', 'Room_Name_SN body must carry the new name');
        assert.strictEqual(Buffer.from(otherRoomName[0].hex, 'hex').subarray(0, 8).toString('ascii'), 'New Name', 'the other member must see the same new name');
        console.log('[room-name-change test] PASS: every room member (host included) receives a Room_Name_SN with the new name');

        const lobbyListUpdates = lobbyViewer._sent.filter((s) => s.op === ROOM_LIST_SN);
        assert.strictEqual(lobbyListUpdates.length, 1, 'a lobby-list viewer must receive one Room_List_SN update for the rename');
        {
            const entry = Buffer.from(lobbyListUpdates[0].hex, 'hex');
            // header: [0] continuation flag, [1] count; entry starts at [2].
            // UpdateType==2 (partial update) has no RoomNumber field, so the
            // entry header is RoomIndex(2)+UpdateType(1)+FieldMask(2) = 5
            // bytes, then the same 14 bytes of fixed fields as scenario 1 in
            // test/room-name-big5.js before the NAME field.
            assert.strictEqual(entry.readUInt8(4), 2, 'lobby update entry UpdateType must be 2 (partial update, a rename is not a new room)');
        }
        console.log('[room-name-change test] PASS: the lobby also gets a Room_List_SN update (UpdateType=2) for the rename');
    } finally {
        fakeTimers.restore();
        rooms._resetForTests();
    }

    // --- 3. Switch on: a non-host renaming must fail, room name unchanged. ---
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    const fakeTimers2 = installFakeTimers();
    try {
        const gate = new GateGameDispatch();
        const host = makeFakeClient(1, 30907);
        const other = makeFakeClient(2, 30907);
        host.accountId_ = 1;
        other.accountId_ = 2;
        host.nickname_ = 'Host';
        rooms.registerLobbyClientSource([host]);

        gate.dispatch(host, CQ_CREATE, makeCreateBody('Stays Same'));
        const roomId = host.createdRoomIndex_;
        rooms.addMember(roomId, { accountId: 2, nickname: 'Other', team: 0, slot: 1, ready: false, client: other });

        while (fakeTimers2.fireNext()) { /* drain */ }
        other._sent.length = 0;

        const renameHandled = gate.dispatch(other, CQ_NAME_CHANGE, makeNameChangeBody('Hijacked'));
        assert.strictEqual(renameHandled, true, 'Name_Change_CQ must still be handled (and refused)');
        assert.strictEqual(rooms.getRoom(roomId).name, 'Stays Same', 'a non-host rename must not change the Room object');

        const otherSa = other._sent.filter((s) => s.op === SA_NAME_CHANGE);
        assert.strictEqual(otherSa.length, 1, 'the non-host must still receive exactly one Name_Change_SA');
        const saBody = Buffer.from(otherSa[0].hex, 'hex');
        assert.strictEqual(saBody.readUInt16LE(0x00), 1, 'Name_Change_SA result word must be non-zero (failure) for a non-host');
        assert.strictEqual(other._sent.some((s) => s.op === ROOM_NAME_SN), false, 'no Room_Name_SN broadcast must follow a refused rename');
        console.log('[room-name-change test] PASS: a non-host rename is refused and does not change the room');
    } finally {
        fakeTimers2.restore();
        rooms._resetForTests();
    }

    console.log('[room-name-change test] ALL CHECKS PASS');
    process.exit(0);
}

main();
