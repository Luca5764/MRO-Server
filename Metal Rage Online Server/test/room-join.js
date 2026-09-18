'use strict';

// D1-4 (docs/backlog.md, docs/design/d1-multiplayer-room.md §5/§6 step 4):
// unit test for the lobby room list broadcast + Enter_CQ join + disconnect
// notify path added to dispatch/gate.game.dispatch.js, dispatch/lobby.
// dispatch.js, dispatch/room/room-leave.js and rooms.js. Same technique as
// test/room-chat.js: calls the real ZGateGameDispatch.dispatch() directly
// (no socket, no server.js) against fake clients sharing rooms.js's
// module-level registry.
//
// ROOM_JOIN_MODE and LOBBY_ROOM_LIST_MODE (rooms.js, both default
// 'disabled') are switched on for the duration of this file via
// rooms._setRoomJoinModeForTests()/_setLobbyRoomListModeForTests(), per the
// task contract ("開關在測試內暫時開啟") -- this does not change the
// default any other code sees; test/replay-golden.js's pve-full-match and
// login-* samples still run with both off (rooms.js's _resetForTests()
// resets both back to 'disabled').
//
// Scenario (per the task contract):
//   1. A creates a room (CQ_CREATE) -> B, sitting in the lobby, gets
//      Room_List_SN (0x00220204) with the new room.
//   2. B sends Enter_CQ (0x00220231) for that room -> both A and B end up
//      with a User_Default_SN (0x00220233) for each other.
//   3. B disconnects (socket close, not Leave_CQ) -> A gets Leave_SN
//      (0x00220236). Disconnect is simulated by calling
//      dispatch/room/room-leave.js's leaveRoomAndNotify() directly, the
//      same function server.js's socket 'close' hook calls -- there is no
//      real net.Socket in this harness to close.
//   4. A (the host) disconnects -> B receives User_Master_SN (0x00220319)
//      naming B the new host.
//   5. Enough rooms to overflow one 0x400-byte frame -> Room_List_SN splits
//      into multiple frames, none exceeding 0x400 wire bytes.
//
// Run: node test/room-join.js  (exit 0 = pass, exit 1 = fail)

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
const LobbyDispatch = require('../dispatch/lobby.dispatch.js');
const { leaveRoomAndNotify } = require('../dispatch/room/room-leave.js');

const CQ_CREATE = 0x00220201;
const ENTER_CQ = 0x00220231;
const ROOM_LIST_SN = '0x00220204';
const USER_DEFAULT_SN = '0x00220233';
const USER_MASTER_SN = '0x00220319';
const LEAVE_SN = '0x00220236';
const LOBBY_ENTER_CQ = 0x00230111;

/**
 * Builds a CQ_CREATE body (ZDispatchLobby::Create_CQ layout, see the case
 * 0x00220201 comment in gate.game.dispatch.js): a PvE campaign room.
 */
function makeCreateBody(name)
{
    const body = Buffer.alloc(51);
    body[0] = 1;                      // roomType: 1 = campaign
    body[1] = 0;                      // createByte1
    body.writeUInt16LE(0, 2);         // createWord1
    body.writeUInt16LE(0, 4);         // createWord2
    body[6] = 5;                      // mapId / playRound (same byte, existing quirk)
    body.writeUInt16LE(0, 7);         // createWord3
    body.writeUInt16LE(0, 9);         // createWord4 (gameMode = 0)
    body[11] = 0;                     // roomNumberFlag
    body.writeUInt16LE(8, 12);        // roomNumberValue
    body.write(name, 14, Math.min(name.length, 25), 'ascii');
    body[39] = 0;                     // no password
    return body;
}

function makeEnterBody(roomIndex)
{
    const body = Buffer.alloc(0x1D);
    body.writeUInt16LE(roomIndex, 0x00);
    return body; // rest zero -> empty UTF-16LE password
}

function main()
{
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    rooms._setLobbyRoomListModeForTests('enabled');

    const gate = new GateGameDispatch();
    const lobby = new LobbyDispatch();

    const clientA = makeFakeClient(1, 30907);
    const clientB = makeFakeClient(2, 30907);
    clientA.accountId_ = 1;
    clientB.accountId_ = 2;
    clientA.nickname_ = 'Alice';
    clientB.nickname_ = 'Bob';

    // Both connected and sitting in the lobby before anything happens --
    // same array server.js would pass to rooms.registerLobbyClientSource()
    // (its live DispatchServer.clients list for the 30907 game server).
    rooms.registerLobbyClientSource([clientA, clientB]);

    const fakeTimers = installFakeTimers();
    try {
        // --- 1. A creates a room; B (still in the lobby) should see it. ---
        const createHandled = gate.dispatch(clientA, CQ_CREATE, makeCreateBody('Alice Room'));
        assert.strictEqual(createHandled, true, 'CQ_CREATE must be handled');

        const roomId = clientA.createdRoomIndex_;
        assert.ok(roomId, 'A must have a createdRoomIndex_ after CQ_CREATE');
        assert.ok(rooms.getRoom(roomId), 'room must be tracked in rooms.js');

        const bRoomListPackets = clientB._sent.filter((s) => s.op === ROOM_LIST_SN);
        assert.strictEqual(bRoomListPackets.length, 1, 'B (in the lobby) must receive exactly one Room_List_SN for the new room');
        assert.strictEqual(clientA._sent.some((s) => s.op === ROOM_LIST_SN), false, 'A (now a room member) must not receive the lobby broadcast of her own room');
        console.log('[room-join test] PASS: CQ_CREATE broadcasts Room_List_SN to the lobby, not the creator');

        // Also sanity-check the lobby-open path independently: B "opening
        // the lobby" (0x00230111) gets the same room in a full-list send.
        const freshB = makeFakeClient(3, 30907);
        freshB.accountId_ = 3;
        rooms.registerLobbyClientSource([clientA, clientB, freshB]);
        lobby.dispatch(freshB, LOBBY_ENTER_CQ, Buffer.alloc(0));
        assert.strictEqual(freshB._sent.filter((s) => s.op === ROOM_LIST_SN).length, 1, 'opening the lobby must send a full Room_List_SN including the existing room');
        console.log('[room-join test] PASS: opening the lobby sends the full room list');

        // CQ_CREATE schedules its own room-state resend retries for A
        // (ROOM_STATE_RETRY_SCHEDULE, unrelated to joining) -- drain those
        // now so they do not land in the middle of step 2 below and get
        // mistaken for join-triggered traffic.
        while (fakeTimers.fireNext()) { /* run every pending timer */ }

        clientA._sent.length = 0;
        clientB._sent.length = 0;

        // --- 2. B joins the room. ---
        const enterHandled = gate.dispatch(clientB, ENTER_CQ, makeEnterBody(roomId));
        assert.strictEqual(enterHandled, true, 'Enter_CQ must be handled');
        assert.strictEqual(clientB._sent.some((s) => s.op === '0x00220232'), true, 'B must receive Enter_SA');

        assert.strictEqual(rooms.getRoomByAccount(2), rooms.getRoom(roomId), 'B must now be tracked as a member of the room');

        // A (already in the room scene) is notified synchronously.
        assert.strictEqual(clientA._sent.some((s) => s.op === USER_DEFAULT_SN), true, 'A must receive a User_Default_SN for B immediately');

        // B's own full room-state burst (including A's User_Default_SN) is
        // scheduled behind a setTimeout (scene-change race, same rationale
        // as CQ_CREATE's ROOM_STATE_RETRY_SCHEDULE) -- drain it.
        while (fakeTimers.fireNext()) { /* run every pending timer */ }

        const bUserDefaults = clientB._sent.filter((s) => s.op === USER_DEFAULT_SN);
        assert.strictEqual(bUserDefaults.length, 2, 'B must receive one User_Default_SN per room member (herself + A) after the scene-change retry fires');

        const aUserDefaults = clientA._sent.filter((s) => s.op === USER_DEFAULT_SN);
        assert.strictEqual(aUserDefaults.length, 1, 'A must receive exactly one User_Default_SN (for B)');

        console.log('[room-join test] PASS: both sides receive each other\'s User_Default_SN after Enter_CQ');

        clientA._sent.length = 0;
        clientB._sent.length = 0;

        // --- 3. B disconnects (not Leave_CQ); A must be told via Leave_SN. ---
        leaveRoomAndNotify(2);

        assert.strictEqual(rooms.getRoomByAccount(2), undefined, 'B must no longer be tracked in the room after disconnect');
        assert.ok(rooms.getRoomByAccount(1), 'A must still be in the room (room survives a partial leave)');

        const aLeaveNotices = clientA._sent.filter((s) => s.op === LEAVE_SN);
        assert.strictEqual(aLeaveNotices.length, 1, 'A must receive exactly one Leave_SN for B');
        assert.strictEqual(aLeaveNotices[0].hex.slice(0, 4), '0200', 'Leave_SN UserIndex must be B (account 2), little-endian u16');

        console.log('[room-join test] PASS: B disconnecting notifies the remaining member with Leave_SN');

        clientA._sent.length = 0;

        // --- 4. A (host) disconnects; B must become the new host. ---
        // Re-add B as a second member first (step 3 removed her) so there
        // is someone left to hand the room off to.
        rooms.addMember(roomId, { accountId: 2, nickname: 'Bob', team: 0, slot: 0, ready: false, client: clientB });
        clientB._sent.length = 0;

        assert.strictEqual(rooms.getRoom(roomId).hostAccountId, 1, 'A must be host before disconnecting');

        leaveRoomAndNotify(1);

        assert.strictEqual(rooms.getRoomByAccount(1), undefined, 'A must no longer be tracked in the room after disconnect');
        const roomAfterHostLeave = rooms.getRoom(roomId);
        assert.ok(roomAfterHostLeave, 'room must survive A leaving (B is still in it)');
        assert.strictEqual(roomAfterHostLeave.hostAccountId, 2, 'host must be reassigned to B (design §2: earliest remaining joiner)');

        const bMasterNotices = clientB._sent.filter((s) => s.op === USER_MASTER_SN);
        assert.strictEqual(bMasterNotices.length, 1, 'B must receive exactly one User_Master_SN naming her the new host');
        assert.strictEqual(bMasterNotices[0].hex.slice(0, 4), '0200', 'User_Master_SN UserIndex must be B (account 2), little-endian u16');

        const bLeaveNotices = clientB._sent.filter((s) => s.op === LEAVE_SN);
        assert.strictEqual(bLeaveNotices.length, 1, 'B must also receive Leave_SN for A leaving');

        console.log('[room-join test] PASS: host disconnecting hands the room to the earliest remaining member');
    } finally {
        fakeTimers.restore();
        rooms._resetForTests();
    }

    // --- 5. Multi-room Room_List_SN must split into <=0x400-byte frames. ---
    // Separate rooms._resetForTests() scope: independent of the join/leave
    // scenario above, only exercises the lobby list send path.
    rooms._resetForTests();
    rooms._setLobbyRoomListModeForTests('enabled');
    try {
        const lobby2 = new LobbyDispatch();
        const viewer = makeFakeClient(9, 30907);
        viewer.accountId_ = 9;
        rooms.registerLobbyClientSource([viewer]);

        // 25-char names (ROOM_STRING_MAX_CHARS, room-string.js) to push each
        // entry to its largest size; 25 such rooms comfortably overflows one
        // frame's ~974-byte entry budget (dispatch/room/room-list.sender.js).
        const ROOM_COUNT = 25;
        const LONG_NAME = 'A'.repeat(25);
        for (let i = 0; i < ROOM_COUNT; i++) {
            const room = rooms.createRoom({
                id: rooms.allocateRoomId(),
                name: LONG_NAME,
                mapId: 9001,
                playTime: 10,
                playRound: 1,
                maxPlayers: 4,
                campaign: true,
                hostAccountId: 100 + i,
                roomType: 1,
                hasPassword: false,
                password: '',
            });
            rooms.addMember(room.id, { accountId: 100 + i, nickname: `Host${i}`, team: 0, slot: 0, ready: false, client: null });
        }

        lobby2.dispatch(viewer, LOBBY_ENTER_CQ, Buffer.alloc(0));

        const listFrames = viewer._sent.filter((s) => s.op === ROOM_LIST_SN);
        assert.ok(listFrames.length > 1, `expected the ${ROOM_COUNT}-room list to split into multiple Room_List_SN frames, got ${listFrames.length}`);
        for (const frame of listFrames) {
            const wireBytes = frame.len + 0x10; // + header, matches fake-client's getMessageBuffer padding
            assert.ok(wireBytes <= 0x400, `Room_List_SN frame must not exceed 0x400 wire bytes, got ${wireBytes}`);
        }
        console.log(`[room-join test] PASS: ${ROOM_COUNT}-room list split into ${listFrames.length} frames, all <= 0x400 bytes`);
    } finally {
        rooms._resetForTests();
    }

    console.log('[room-join test] ALL CHECKS PASS');
    process.exit(0);
}

main();
