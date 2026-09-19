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
//   6. D1-4b (docs/backlog.md, PM 2026-09-19 follow-up): with only
//      LOBBY_ROOM_LIST_MODE on (ROOM_JOIN_MODE off), CQ_CREATE still
//      broadcasts a room (UpdateType=1) and a solo host's Leave_CQ still
//      broadcasts its deletion (UpdateType=3) -- the switch combination the
//      real session that surfaced the "room stays in the list after Leave_CQ"
//      bug used.
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
const MAP_CHANGE_ONE_CQ = 0x00220221;
const MAP_CHANGE_ONE_SN = '0x00220223';

/**
 * Builds a Room_Map_Change_One_CQ body (ZDispatchRoom 0x107eec30 layout,
 * same 10-byte shape as the SA/SN it echoes -- see the case 0x00220221
 * comment in gate.game.dispatch.js): b0=slot, w1=MapIndex, w2=MapTime,
 * b5=MapRound, w6=MapKill, w8=Goal.
 */
function makeMapChangeOneBody({ b0 = 0, w1, w2 = 0, b5 = 0, w6 = 0, w8 = 0 })
{
    const body = Buffer.alloc(10);
    body.writeUInt8(b0, 0);
    body.writeUInt16LE(w1, 1);
    body.writeUInt16LE(w2, 3);
    body.writeUInt8(b5, 5);
    body.writeUInt16LE(w6, 6);
    body.writeUInt16LE(w8, 8);
    return body;
}

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

        // D1-4b (docs/backlog.md, PM follow-up 2026-09-19): decode the
        // UpdateType=1 entry's field bytes against the DLL-confirmed
        // offsets in dispatch/room/room-list.sender.js (RoomType jump
        // table at 0x107e48d6/0x107e4e40; CurrentUser/MaxUser order at
        // 0x107e4a73/0x107e4a76; MapIndex at bit5 buffer offset 4, per
        // 0x107e4b94). Makes a regression that swaps a byte back visible
        // here instead of only in a live client's HUD.
        {
            const entry = Buffer.from(bRoomListPackets[0].hex, 'hex');
            // body layout: [0]=continuation flag [1]=count, entry starts at [2]
            assert.strictEqual(entry.readUInt16LE(2), roomId, 'entry RoomIndex must be the created room');
            assert.strictEqual(entry.readUInt8(4), 1, 'entry UpdateType must be 1 (new room)');
            // UpdateType==1 -> +2 bytes RoomNumber before FieldMask
            const fieldMask = entry.readUInt16LE(7);
            assert.strictEqual(fieldMask, 0x032F, 'FieldMask must be the full field set (ROOM_TYPE|MATCH|USER_COUNT|ROOM_FLAGS|MAP|NAME_INDEX|NAME)');
            assert.strictEqual(entry.readUInt8(9), 1, 'wire RoomType for a campaign room (normalized 2) must be raw 1, per the jump table');
            assert.strictEqual(entry.readUInt8(12), 1, 'USER_COUNT wire byte 0 must be CurrentUser (1 member: the host)');
            assert.strictEqual(entry.readUInt8(13), 8, 'USER_COUNT wire byte 1 must be MaxUser (8 for a campaign room)');
            assert.strictEqual(entry.readUInt16LE(19), 9001, 'MAP field bytes 4-5 (wire offset 19-20) must carry MapIndex');
            assert.strictEqual(entry.readUInt32LE(15), 0, 'MAP field bytes 0-3 (wire offset 15-18, rotate-flag source + unread) must stay zero');
        }
        console.log('[room-join test] PASS: Room_List_SN entry bytes match the DLL-confirmed RoomType/UserCount/MapIndex layout');

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

    // --- 6. D1-4b (docs/backlog.md, PM 2026-09-19 follow-up): with only
    // LOBBY_ROOM_LIST_MODE on and ROOM_JOIN_MODE off, the lobby list must
    // still see a room appear on creation and disappear once its last
    // member (the solo host) leaves -- both are "lobby list content"
    // events per the PM's boundary rule, not gated by ROOM_JOIN_MODE. This
    // is the exact switch combination the real session that surfaced the
    // bug used (session-20260919-100817.jsonl: Room_List_SN worked, but
    // Lucas's room never disappeared after his Leave_CQ). Separate
    // rooms._resetForTests() scope, reusing `gate` (stateless beyond the
    // module-level rooms registry, same as scenario 5 reusing `lobby`
    // indirectly via a fresh LobbyDispatch). ---
    rooms._resetForTests();
    rooms._setLobbyRoomListModeForTests('enabled');
    // ROOM_JOIN_MODE deliberately left 'disabled' (the state
    // rooms._resetForTests() above already put it in -- SWITCH-CONVERGE
    // flipped the production default to 'enabled', so this is no longer
    // "the default" but the scenario still needs the off path covered).
    try {
        const solo = makeFakeClient(21, 30907);
        solo.accountId_ = 21;
        solo.nickname_ = 'Solo';
        const viewer2 = makeFakeClient(22, 30907);
        viewer2.accountId_ = 22;
        rooms.registerLobbyClientSource([solo, viewer2]);

        const createHandled2 = gate.dispatch(solo, CQ_CREATE, makeCreateBody('Solo Room'));
        assert.strictEqual(createHandled2, true, 'CQ_CREATE must be handled with ROOM_JOIN_MODE off');
        const soloRoomId = solo.createdRoomIndex_;
        assert.ok(rooms.getRoom(soloRoomId), 'room must be tracked even with ROOM_JOIN_MODE off (dual-write is unconditional)');

        const createBroadcasts = viewer2._sent.filter((s) => s.op === ROOM_LIST_SN);
        assert.strictEqual(createBroadcasts.length, 1, 'viewer must get one Room_List_SN on room creation with ROOM_JOIN_MODE off');
        assert.strictEqual(Buffer.from(createBroadcasts[0].hex, 'hex').readUInt8(4), 1, 'create broadcast UpdateType must be 1 (new room)');

        viewer2._sent.length = 0;

        // Solo (host, only member) leaves -- same shared function Leave_CQ
        // and server.js's socket close hook both call.
        leaveRoomAndNotify(21);

        assert.strictEqual(rooms.getRoom(soloRoomId), undefined, 'room must be removed from the registry once its last member leaves, even with ROOM_JOIN_MODE off');

        const deleteBroadcasts = viewer2._sent.filter((s) => s.op === ROOM_LIST_SN);
        assert.strictEqual(deleteBroadcasts.length, 1, 'viewer must get one Room_List_SN (UpdateType=3) when the room empties, ROOM_JOIN_MODE off -- this is the D1-4b bug fix');
        const deleteEntry = Buffer.from(deleteBroadcasts[0].hex, 'hex');
        assert.strictEqual(deleteEntry.readUInt8(4), 3, 'delete broadcast UpdateType must be 3');
        assert.strictEqual(deleteEntry.readUInt16LE(2), soloRoomId, 'delete broadcast RoomIndex must match the room that emptied');

        console.log('[room-join test] PASS: create + solo Leave_CQ both broadcast to the lobby with LOBBY_ROOM_LIST_MODE on and ROOM_JOIN_MODE off');
    } finally {
        rooms._resetForTests();
    }

    // --- 7 (D1-4c, docs/backlog.md PM contract): a joiner's full room-state
    // burst must match the creator's own, byte-for-byte, in every field
    // that is not identity-dependent. Regression test for the PvP-shell bug
    // ([LOG] session-20260919-104728.jsonl:118 vs :164, [OBS] marker at line
    // 198 "PVP畫面有紅藍隊") -- root cause was gate.game.dispatch.js's
    // Enter_CQ handler reading `room.roomType` (Room_List_SN-normalized)
    // instead of `room.rawRoomType`, and never calling sendRoomMapPackets()/
    // sendCampaignBootstrap() at all (matching [OBS] line 295 "中間地圖設定
    // 還有房間設定都為空"). Separate rooms._resetForTests() scope, same
    // pattern as scenarios 5/6 above.
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    rooms._setLobbyRoomListModeForTests('enabled');
    const fakeTimers2 = installFakeTimers();
    try {
        const hostC = makeFakeClient(31, 30907);
        hostC.accountId_ = 31;
        hostC.nickname_ = 'Carol';
        const joinerD = makeFakeClient(32, 30907);
        joinerD.accountId_ = 32;
        joinerD.nickname_ = 'Dave';
        rooms.registerLobbyClientSource([hostC, joinerD]);

        const createHandled3 = gate.dispatch(hostC, CQ_CREATE, makeCreateBody('PvE Room'));
        assert.strictEqual(createHandled3, true, 'CQ_CREATE must be handled');
        const pveRoomId = hostC.createdRoomIndex_;

        // Drain both ROOM_STATE_RETRY_SCHEDULE entries (350ms, 1200ms) --
        // both sends are identical to each other, only the first is needed
        // for comparison.
        while (fakeTimers2.fireNext()) { /* run every pending timer */ }

        // Opcodes that make up "the room state a client is told about",
        // per the task contract's list (Room_Default, Map_Change_All/One,
        // Room_Option, Room_Boundary, "任務相關" == Campaign_SN bootstrap).
        // Room_State_SN (0x00220214) and Room_Name_SN (0x0022021a) included
        // too -- sendRoomStatePackets() always sends both alongside the
        // others listed in the contract.
        const ROOM_STATE_OPS = [
            '0x00220203', // Room_Default_SN
            '0x0022021a', // Room_Name_SN
            '0x00220213', // Room_Boundary_SN
            '0x00220217', // Room_Option_SN
            '0x00220214', // Room_State_SN
            '0x00220226', // Map_Change_ALL_SN (sent twice per burst)
            '0x00220223', // Map_Change_ONE_SN
            '0x0023013a', // Campaign_SN bootstrap
        ];
        function firstStateBurst(sentList) {
            const out = {};
            for (const op of ROOM_STATE_OPS) {
                const hits = sentList.filter((s) => s.op === op);
                assert.ok(hits.length > 0, `expected at least one ${op} in the room-state burst`);
                out[op] = hits[0].hex;
            }
            return out;
        }
        const hostBurst = firstStateBurst(hostC._sent);

        joinerD._sent.length = 0;
        const enterHandled3 = gate.dispatch(joinerD, ENTER_CQ, makeEnterBody(pveRoomId));
        assert.strictEqual(enterHandled3, true, 'Enter_CQ must be handled');
        while (fakeTimers2.fireNext()) { /* run every pending timer */ }
        const joinerBurst = firstStateBurst(joinerD._sent);

        // Room_Default_SN: identical except the two identity-dependent u16
        // fields at the front (accountIndex @0x00, roomLinkIndex @0x02 --
        // for a campaign room roomLinkIndex mirrors accountIndex, per
        // room-state.sender.js's `isCampaignRoom ? accountIndex : roomIndex`,
        // so it differs from the host's for the same identity reason).
        // Bytes from 0x04 onward (roomType, mapIndex, maxPlayers, gameMode,
        // team indices, room settings, the mech-slot entry table) must match
        // exactly -- this is where the PvP-shell bug lived (offset 0x04).
        assert.strictEqual(
            hostBurst['0x00220203'].slice(8), // skip 4 bytes = 8 hex chars
            joinerBurst['0x00220203'].slice(8),
            'Room_Default_SN bytes from offset 0x04 onward must match between host and joiner (roomType/mapIndex/maxPlayers/gameMode/teams/settings/entries)'
        );
        assert.notStrictEqual(
            hostBurst['0x00220203'].slice(0, 8),
            joinerBurst['0x00220203'].slice(0, 8),
            'Room_Default_SN offset 0x00-0x03 (accountIndex/roomLinkIndex) is identity-dependent and must differ (host=31, joiner=32)'
        );
        // Explicitly pin down the PvP-shell byte (offset 0x04, roomType) to
        // the PvE value both sides must agree on -- 1 (raw CQ_CREATE type),
        // not 2 (what `room.roomType`, the Room_List_SN-normalized value,
        // used to produce).
        assert.strictEqual(Buffer.from(hostBurst['0x00220203'], 'hex').readUInt8(4), 1, 'host roomType byte must be 1 (PvE)');
        assert.strictEqual(Buffer.from(joinerBurst['0x00220203'], 'hex').readUInt8(4), 1, 'joiner roomType byte must be 1 (PvE), not 2 (PvP shell)');

        // Room_Boundary_SN (0x00220213) carries `currentUsers` at byte 0 --
        // legitimately different here because the two bursts were captured
        // at different points in room membership (host's burst: 1 member,
        // right after CQ_CREATE; joiner's burst: 2 members, right after her
        // own Enter_CQ added her). This is not an identity field and not the
        // bug under test -- room.members.size is genuinely different at the
        // two send times, same as it would be for two real connections.
        // maxPlayers (byte 1) is not time-dependent and must still match.
        // BOUNDARY-SWAP [DLL 0x107ea8e0]: currentUsers/maxPlayers order
        // swapped to match Room_Boundary_SN's real body (currentUsers at
        // body+0, maxPlayers at body+1) -- see room-state.sender.js.
        assert.strictEqual(
            hostBurst['0x00220213'].slice(2, 4),
            joinerBurst['0x00220213'].slice(2, 4),
            'Room_Boundary_SN maxPlayers byte must match'
        );
        assert.strictEqual(Buffer.from(hostBurst['0x00220213'], 'hex').readUInt8(0), 1, 'host burst currentUsers must be 1 (captured solo, right after CQ_CREATE)');
        assert.strictEqual(Buffer.from(joinerBurst['0x00220213'], 'hex').readUInt8(0), 2, 'joiner burst currentUsers must be 2 (captured after her own Enter_CQ added her)');

        // The remaining opcodes carry no identity- or membership-count-
        // dependent fields at all -- must be byte-for-byte identical.
        for (const op of ROOM_STATE_OPS) {
            if (op === '0x00220203') continue; // checked above with the identity-field exception
            if (op === '0x00220213') continue; // checked above with the currentUsers exception
            assert.strictEqual(hostBurst[op], joinerBurst[op], `${op} must be byte-for-byte identical between host and joiner`);
        }

        console.log('[room-join test] PASS: joiner\'s room-state burst matches the host\'s byte-for-byte (except accountIndex/roomLinkIndex), including Map_Change_ALL/ONE and Campaign_SN which were previously never sent to a joiner at all');
    } finally {
        fakeTimers2.restore();
        rooms._resetForTests();
    }

    // --- 8 (J1b, docs/backlog.md): a non-host member pressing "Ready"
    // (0x00222101, ZDispatchRoom's scene-load-complete/ready notification --
    // see the case handler's comment in gate.game.dispatch.js) after
    // joining someone else's room must not get a room-state resend built
    // from her own (unset/stale) client.xxx_ fields. Regression test for
    // [LOG] session-20260919-111258.jsonl:231-246 ([OBS] "加入者以為自己
    // 變成房主、地圖變成動力奪取戰" -- MAP_ID_DEFAULT_PVE,
    // dispatch/room.dispatch.js:180 = 9001, is exactly what the old
    // client.xxx_-based resendRoomState() path fell back to for any
    // campaign room whose real map/host identity it could not read off a
    // joiner's own connection). Uses a map (9007) distinct from
    // MAP_ID_DEFAULT_PVE (9001) so a coincidental match cannot hide the bug.
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    rooms._setLobbyRoomListModeForTests('enabled');
    const fakeTimers3 = installFakeTimers();
    try {
        const hostE = makeFakeClient(41, 30907);
        hostE.accountId_ = 41;
        hostE.nickname_ = 'Erin';
        const joinerF = makeFakeClient(42, 30907);
        joinerF.accountId_ = 42;
        joinerF.nickname_ = 'Frank';
        rooms.registerLobbyClientSource([hostE, joinerF]);

        const createBody4 = makeCreateBody('Erin Room');
        createBody4.writeUInt16LE(9007, 2); // createWord1: picked PvE map (9001..9012 range)
        const createHandled4 = gate.dispatch(hostE, CQ_CREATE, createBody4);
        assert.strictEqual(createHandled4, true, 'CQ_CREATE must be handled');
        const roomId4 = hostE.createdRoomIndex_;
        assert.strictEqual(rooms.getRoom(roomId4).mapId, 9007, 'room.mapId must be the map Erin picked');
        while (fakeTimers3.fireNext()) { /* drain the CQ_CREATE retry schedule */ }

        const enterHandled4 = gate.dispatch(joinerF, ENTER_CQ, makeEnterBody(roomId4));
        assert.strictEqual(enterHandled4, true, 'Enter_CQ must be handled');
        while (fakeTimers3.fireNext()) { /* drain the 350ms joiner room-state send */ }

        joinerF._sent.length = 0;
        const readyBody = Buffer.from('270a000001', 'hex'); // observed CQ body; unused by the handler
        const readyHandled = gate.dispatch(joinerF, 0x00222101, readyBody);
        assert.strictEqual(readyHandled, true, 'Ready/Room_Enter_CN 0x00222101 must be handled');

        const roomDefaultHits = joinerF._sent.filter((s) => s.op === '0x00220203');
        assert.ok(roomDefaultHits.length > 0, 'Ready resend must include Room_Default_SN');
        const mapIndex = Buffer.from(roomDefaultHits[0].hex, 'hex').readUInt16LE(0x05);
        assert.strictEqual(mapIndex, 9007, "Ready resend must carry the room's actual map (9007), not MAP_ID_DEFAULT_PVE (9001) or any other joiner-side fallback");

        const masterHits = joinerF._sent.filter((s) => s.op === USER_MASTER_SN);
        assert.ok(masterHits.length > 0, 'Ready resend must include User_Master_SN');
        const masterAccountIndex = Buffer.from(masterHits[0].hex, 'hex').readUInt16LE(0x00);
        assert.strictEqual(masterAccountIndex, 41, 'User_Master_SN in the Ready resend must name the host (Erin, account 41), not the joiner (Frank, account 42) who pressed Ready');

        console.log('[room-join test] PASS: joiner pressing Ready (0x00222101) after joining gets a room-state resend read from the shared Room, not her own client fields -- correct map and host identity');
    } finally {
        fakeTimers3.restore();
        rooms._resetForTests();
    }

    // --- 9 (KICK, docs/backlog.md 2026-09-19): host presses "kick" on a
    // member -- [LOG] session-20260919-111258.jsonl ms 2121418, [OBS] the
    // kicked player disappeared from the host's own screen but stayed fully
    // in the room server-side (still able to chat) because there was no
    // handler for Kickout_CQ 0x00220337 and it fell through to the generic
    // odd-opcode fallback, which echoes a *success* Kickout_SA without
    // touching `rooms`. Covers: host kicking a real member (success SA to
    // the host, Leave_SN(self, kickout=1) to the kicked member, room
    // membership actually drops), and a non-host member trying to kick the
    // host (must fail, no state change).
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    rooms._setLobbyRoomListModeForTests('enabled');
    const fakeTimers4 = installFakeTimers();
    try {
        const hostG = makeFakeClient(51, 30907);
        hostG.accountId_ = 51;
        hostG.nickname_ = 'Grace';
        const joinerH = makeFakeClient(52, 30907);
        joinerH.accountId_ = 52;
        joinerH.nickname_ = 'Heidi';
        rooms.registerLobbyClientSource([hostG, joinerH]);

        const createHandled5 = gate.dispatch(hostG, CQ_CREATE, makeCreateBody('Grace Room'));
        assert.strictEqual(createHandled5, true, 'CQ_CREATE must be handled');
        const roomId5 = hostG.createdRoomIndex_;
        while (fakeTimers4.fireNext()) { /* drain the CQ_CREATE retry schedule */ }

        const enterHandled5 = gate.dispatch(joinerH, ENTER_CQ, makeEnterBody(roomId5));
        assert.strictEqual(enterHandled5, true, 'Enter_CQ must be handled');
        while (fakeTimers4.fireNext()) { /* drain the 350ms joiner room-state send */ }

        assert.ok(rooms.getRoom(roomId5).members.has(52), 'Heidi must be a member before either kick attempt');

        hostG._sent.length = 0;
        joinerH._sent.length = 0;

        // Non-host (Heidi) tries to kick the host (Grace) -- must fail, no
        // state change, no packet reaches Grace at all.
        const kickBodyByNonHost = Buffer.alloc(2);
        kickBodyByNonHost.writeUInt16LE(51, 0); // target = Grace (the host)
        const kickHandled1 = gate.dispatch(joinerH, 0x00220337, kickBodyByNonHost);
        assert.strictEqual(kickHandled1, true, 'Kickout_CQ from a non-host must still be handled (with a failure reply)');

        const nonHostSa = joinerH._sent.filter((s) => s.op === '0x00220338');
        assert.strictEqual(nonHostSa.length, 1, 'non-host kicker must get exactly one Kickout_SA');
        assert.notStrictEqual(nonHostSa[0].hex, '000000000000', 'non-host Kickout_SA must be a failure (non-zero header), not the 0/0 success header');
        assert.strictEqual(hostG._sent.length, 0, 'the target (host) must receive nothing when a non-host tries to kick her');
        assert.ok(rooms.getRoom(roomId5).members.has(51), 'the host must still be a member after a failed kick attempt');
        assert.ok(rooms.getRoom(roomId5).members.has(52), 'the non-host kicker must still be a member after her own failed kick attempt');
        console.log('[room-join test] PASS: a non-host Kickout_CQ against the host fails and changes nothing');

        joinerH._sent.length = 0;

        // Host (Grace) kicks the member (Heidi) -- must succeed.
        const kickBodyByHost = Buffer.alloc(2);
        kickBodyByHost.writeUInt16LE(52, 0); // target = Heidi
        const kickHandled2 = gate.dispatch(hostG, 0x00220337, kickBodyByHost);
        assert.strictEqual(kickHandled2, true, 'Kickout_CQ from the host must be handled');

        const hostSa = hostG._sent.filter((s) => s.op === '0x00220338');
        assert.strictEqual(hostSa.length, 1, 'host kicker must get exactly one Kickout_SA');
        assert.strictEqual(hostSa[0].hex, '000000000000', 'host Kickout_SA must be a success (0/0 header)');

        const kickedLeaveSn = joinerH._sent.filter((s) => s.op === LEAVE_SN);
        assert.strictEqual(kickedLeaveSn.length, 1, 'the kicked member must receive exactly one Leave_SN');
        assert.strictEqual(kickedLeaveSn[0].hex, '340001', 'Leave_SN to the kicked member must be UserIndex=52 (LE u16 0x0034) + Kickout=1');

        assert.strictEqual(rooms.getRoomByAccount(52), undefined, 'the kicked member must no longer be tracked as a room member');
        assert.ok(rooms.getRoomByAccount(51), 'the host must still be in the room after kicking someone else');
        assert.strictEqual(rooms.getRoom(roomId5).members.size, 1, 'the room must have exactly one member (the host) left');

        console.log('[room-join test] PASS: a host Kickout_CQ against a real member succeeds -- success SA to the host, Leave_SN(kicked, kickout=1) to the kicked member, room membership actually drops');
    } finally {
        fakeTimers4.restore();
        rooms._resetForTests();
    }

    // --- 10 (ROOM-OPT-BC, docs/backlog.md): host changes room difficulty
    // (Room_Map_Change_One_CQ 0x00220221, triggered by clicking a
    // difficulty tile in ZPanel_PVE) -- [LOG] session-20260919-111258.jsonl
    // ms 2067166: the SA/SN pair back then only ever reached the host's own
    // connection; a room member should also see Map_Change_One_SN
    // 0x00220223 so the display updates. Covers both switch positions:
    // ROOM_MAP_BROADCAST_MODE='disabled' (default, joiner gets nothing) and
    // 'enabled' (joiner gets exactly one 0x00220223, identical body to what
    // the host's own change produced).
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    rooms._setLobbyRoomListModeForTests('enabled');
    const fakeTimers5 = installFakeTimers();
    try {
        const hostI = makeFakeClient(61, 30907);
        hostI.accountId_ = 61;
        hostI.nickname_ = 'Ivy';
        const joinerJ = makeFakeClient(62, 30907);
        joinerJ.accountId_ = 62;
        joinerJ.nickname_ = 'Judy';
        rooms.registerLobbyClientSource([hostI, joinerJ]);

        const createHandled6 = gate.dispatch(hostI, CQ_CREATE, makeCreateBody('Ivy Room'));
        assert.strictEqual(createHandled6, true, 'CQ_CREATE must be handled');
        const roomId6 = hostI.createdRoomIndex_;
        while (fakeTimers5.fireNext()) { /* drain the CQ_CREATE retry schedule */ }

        const enterHandled6 = gate.dispatch(joinerJ, ENTER_CQ, makeEnterBody(roomId6));
        assert.strictEqual(enterHandled6, true, 'Enter_CQ must be handled');
        while (fakeTimers5.fireNext()) { /* drain the 350ms joiner room-state send */ }

        const mapChangeBody = makeMapChangeOneBody({ b0: 0, w1: 9007, w2: 45, b5: 3, w6: 0, w8: 0 });
        // Expected Map_Change_One_SN payload: same 10-byte fields the CQ
        // carried (MAP_CHANGE_SA_ECHO_MODE adopts w1/b5 from the client
        // state the handler just set from this same CQ, so they round-trip
        // unchanged here).
        const expectedSnHex = makeMapChangeOneBody({ b0: 0, w1: 9007, w2: 45, b5: 3, w6: 0, w8: 0 }).toString('hex');

        // --- 10a: switch off (default) -- joiner must get nothing. ---
        hostI._sent.length = 0;
        joinerJ._sent.length = 0;
        const mapChangeHandledOff = gate.dispatch(hostI, MAP_CHANGE_ONE_CQ, mapChangeBody);
        assert.strictEqual(mapChangeHandledOff, true, 'Map_Change_One_CQ must be handled');
        const joinerHitsOff = joinerJ._sent.filter((s) => s.op === MAP_CHANGE_ONE_SN);
        assert.strictEqual(joinerHitsOff.length, 0, 'ROOM_MAP_BROADCAST_MODE off (default): joiner must receive no Map_Change_One_SN');
        console.log('[room-join test] PASS: ROOM_MAP_BROADCAST_MODE off (default) -- host map change is unicast only, joiner gets nothing');

        // --- 10b: switch on -- joiner must get exactly one, identical body. ---
        GateGameDispatch._setRoomMapBroadcastModeForTest('enabled');
        hostI._sent.length = 0;
        joinerJ._sent.length = 0;
        try {
            const mapChangeHandledOn = gate.dispatch(hostI, MAP_CHANGE_ONE_CQ, mapChangeBody);
            assert.strictEqual(mapChangeHandledOn, true, 'Map_Change_One_CQ must be handled');
            const joinerHitsOn = joinerJ._sent.filter((s) => s.op === MAP_CHANGE_ONE_SN);
            assert.strictEqual(joinerHitsOn.length, 1, 'ROOM_MAP_BROADCAST_MODE on: joiner must receive exactly one Map_Change_One_SN');
            assert.strictEqual(joinerHitsOn[0].hex, expectedSnHex, "joiner's Map_Change_One_SN body must be identical to the host's own map-change payload");
            console.log('[room-join test] PASS: ROOM_MAP_BROADCAST_MODE on -- joiner receives one Map_Change_One_SN with the host-identical body');
        } finally {
            GateGameDispatch._setRoomMapBroadcastModeForTest('disabled');
        }
    } finally {
        fakeTimers5.restore();
        rooms._resetForTests();
    }

    // --- 11 (READY-IMPL, docs/backlog.md): a non-host member pressing
    // "Ready" (0x00222101, see the case handler's READY-IMPL comment in
    // gate.game.dispatch.js) must broadcast User_State_SN 0x00220401 raw
    // state 2 (READY once client-normalized) to every room member,
    // including herself, and a member joining afterward must see that same
    // ready state in her own room-state burst. Switch left 'disabled' (via
    // rooms._resetForTests() below -- no longer the production default
    // after SWITCH-CONVERGE): no such broadcast at all.
    // rooms.isRoomReadyStateEnabled() lives in
    // rooms.js (not a gate.game.dispatch.js-local switch), same pattern as
    // roomJoinMode/lobbyRoomListMode -- see the READY-IMPL comment there.
    const USER_STATE_SN = '0x00220401';
    function decodeUserState(hex) {
        const buf = Buffer.from(hex, 'hex');
        return { userIndex: buf.readUInt16LE(0x02), raw: buf.readUInt32LE(0x04) };
    }
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    rooms._setLobbyRoomListModeForTests('enabled');
    const fakeTimers6 = installFakeTimers();
    try {
        const hostK = makeFakeClient(71, 30907);
        hostK.accountId_ = 71;
        hostK.nickname_ = 'Kara';
        const joinerL = makeFakeClient(72, 30907);
        joinerL.accountId_ = 72;
        joinerL.nickname_ = 'Liam';
        rooms.registerLobbyClientSource([hostK, joinerL]);

        const createHandled7 = gate.dispatch(hostK, CQ_CREATE, makeCreateBody('Kara Room'));
        assert.strictEqual(createHandled7, true, 'CQ_CREATE must be handled');
        const roomId7 = hostK.createdRoomIndex_;
        while (fakeTimers6.fireNext()) { /* drain the CQ_CREATE retry schedule */ }

        const enterHandled7 = gate.dispatch(joinerL, ENTER_CQ, makeEnterBody(roomId7));
        assert.strictEqual(enterHandled7, true, 'Enter_CQ must be handled');
        while (fakeTimers6.fireNext()) { /* drain the 350ms joiner room-state send */ }

        // --- 11a: switch left 'disabled' -- pressing Ready must not
        // broadcast anything to the host (resendRoomState only ever
        // unicasts to the presser herself, see scenario 8 above).
        hostK._sent.length = 0;
        joinerL._sent.length = 0;
        const readyBodyOff = Buffer.from('270a000001', 'hex'); // observed CQ body: +0x00 u32 unknown, +0x04 u8 ready=1
        const readyHandledOff = gate.dispatch(joinerL, 0x00222101, readyBodyOff);
        assert.strictEqual(readyHandledOff, true, 'Ready 0x00222101 must be handled with the switch off');
        assert.strictEqual(hostK._sent.length, 0, 'ROOM_READY_STATE disabled: the host must receive nothing at all from a joiner pressing Ready');
        console.log('[room-join test] PASS: rooms.isRoomReadyStateEnabled() disabled -- pressing Ready broadcasts no User_State_SN');

        // --- 11b: switch on -- both host and joiner must see raw state 2
        // for the joiner's own UserIndex (72).
        rooms._setRoomReadyStateModeForTests('enabled');
        hostK._sent.length = 0;
        joinerL._sent.length = 0;
        // A second "first occurrence" resend isn't needed here -- the ready
        // broadcast added by READY-IMPL fires on every call regardless of
        // client.roomEnterAcked_, only the room-state resend above is
        // first-occurrence-only. joinerL already pressed Ready once in 11a,
        // so roomEnterAcked_ is already true here and this call only
        // exercises the ACK + broadcast.
        const readyHandledOn = gate.dispatch(joinerL, 0x00222101, Buffer.from('270a000001', 'hex'));
        assert.strictEqual(readyHandledOn, true, 'Ready 0x00222101 must be handled with the switch on');

        const hostReadyHits = hostK._sent.filter((s) => s.op === USER_STATE_SN).map((s) => decodeUserState(s.hex));
        assert.strictEqual(hostReadyHits.length, 1, 'the host must receive exactly one User_State_SN broadcast');
        assert.deepStrictEqual(hostReadyHits[0], { userIndex: 72, raw: 2 }, "the host's User_State_SN must name the joiner (72) READY (raw 2)");

        const joinerReadyHits = joinerL._sent.filter((s) => s.op === USER_STATE_SN).map((s) => decodeUserState(s.hex));
        const joinerOwnReadyBroadcast = joinerReadyHits.filter((h) => h.userIndex === 72 && h.raw === 2);
        assert.strictEqual(joinerOwnReadyBroadcast.length, 1, 'the joiner must also receive her own User_State_SN broadcast (raw 2), sendAll includes the sender');
        console.log('[room-join test] PASS: rooms.isRoomReadyStateEnabled() on -- pressing Ready broadcasts User_State_SN raw=2 to every room member including the presser');

        // --- 11c: a member joining afterward must see the joiner's ready
        // state (raw 2) in her own room-state burst (buildMemberUserCtx
        // reading member.ready off the shared Room, not a stale constant).
        const freshM = makeFakeClient(73, 30907);
        freshM.accountId_ = 73;
        freshM.nickname_ = 'Mona';
        rooms.registerLobbyClientSource([hostK, joinerL, freshM]);
        const enterHandled8 = gate.dispatch(freshM, ENTER_CQ, makeEnterBody(roomId7));
        assert.strictEqual(enterHandled8, true, 'Enter_CQ for the third member must be handled');
        while (fakeTimers6.fireNext()) { /* drain the 350ms newcomer room-state send */ }

        const newcomerReadyHits = freshM._sent.filter((s) => s.op === USER_STATE_SN).map((s) => decodeUserState(s.hex));
        const joinerAsSeenByNewcomer = newcomerReadyHits.filter((h) => h.userIndex === 72);
        assert.strictEqual(joinerAsSeenByNewcomer.length, 1, 'the newcomer must receive exactly one User_State_SN for the already-ready joiner');
        assert.strictEqual(joinerAsSeenByNewcomer[0].raw, 2, "the newcomer's room-state burst must show the joiner already READY (raw 2)");
        const hostAsSeenByNewcomer = newcomerReadyHits.filter((h) => h.userIndex === 71);
        assert.strictEqual(hostAsSeenByNewcomer.length, 1, 'the newcomer must also receive exactly one User_State_SN for the host');
        assert.strictEqual(hostAsSeenByNewcomer[0].raw, 1, "the host has not pressed Ready -- newcomer's burst must show raw 1 for her");
        console.log('[room-join test] PASS: a member joining afterward sees the already-ready joiner\'s User_State_SN raw=2 in her own room-state burst');
    } finally {
        fakeTimers6.restore();
        rooms._resetForTests();
    }

    console.log('[room-join test] ALL CHECKS PASS');
    process.exit(0);
}

main();
