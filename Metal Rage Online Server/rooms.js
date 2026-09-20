// rooms.js — shared room registry (D1 design, docs/design/d1-multiplayer-room.md §2).
//
// Deliberately lives outside dispatch/: `/reload` only re-requires
// dispatch/*.js (see dispatch.js/game.js), and a room must survive that so a
// live room does not vanish out from under connected clients when the
// dispatch code gets hot-reloaded. 9211 (login/gate) and 30907 (game) are
// the same Node process (docs/design/d1-multiplayer-room.md §2), so a single
// module-level registry is visible to both.
//
// Step 1 (docs/design/d1-multiplayer-room.md §6 step 1): write-only mirror.
// `CQ_CREATE` in dispatch/gate.game.dispatch.js writes a Room here *in
// addition to* its existing client.xxx_ fields (dual-write); nothing reads
// from this module yet, so every packet the server sends stays byte-for-byte
// identical. Leaving a room and socket close write here too, per §4/§6 step
// 1's disconnect note (record-only, no grace-period timeout — that is step
// 5).
//
// user index: per the design doc §1, this module always uses `accountId`
// (== accounts.id), not a separate 1..N room-local index.

'use strict';

/**
 * @typedef {Object} Member
 * @property {number} accountId
 * @property {string} nickname
 * @property {number} team - 0 red, 1 blue (design §2)
 * @property {number} slot
 * @property {boolean} ready
 * @property {object|null} client - the live NetworkClient, or null while disconnected/reconnecting
 * @property {number|null} disconnectedAt - Date.now() ms when client went null, else null
 */

/**
 * @typedef {Object} Room
 * @property {number} id
 * @property {string} name
 * @property {number} mapId
 * @property {number} playTime
 * @property {number} playRound
 * @property {number} maxPlayers
 * @property {boolean} campaign
 * @property {number} hostAccountId
 * @property {number} roomType - ROOM_INFO.RoomType (0 normal/1 clan/2 campaign/3 quick), see ZNetwork_DJ.uc
 * @property {boolean} hasPassword
 * @property {string} password
 * @property {Map<number, Member>} members
 * @property {'lobby'|'playing'} state
 * @property {number} rawRoomType - D1-4c: the CQ_CREATE body[0] value as-is
 *   (mirrors client.rawRoomType_). NOT the same thing as `roomType` above --
 *   that one is the Room_List_SN-normalized value. This is what
 *   Room_Default_SN's own roomType byte needs (room.dispatch.js
 *   sendRoomState()'s `rawRoomType` local). Sending the normalized value
 *   there instead flips the client to a PvP room shell -- [LOG]
 *   session-20260919-104728.jsonl:118 (host, roomType byte=1) vs :164
 *   (joiner, roomType byte=2, `room.roomType` was read there), matching
 *   [OBS] line 198 marker "PVP畫面有紅藍隊".
 * @property {boolean} isTrueCampaign - mirrors client.isTrueCampaign_ at
 *   creation (true campaign, excludes plain PvP roomType 2). Gates
 *   Map_Change_ALL/ONE and Campaign_SN for a joiner (room-map.sender.js).
 * @property {number} gameMode - mirrors client.gameMode_ at creation
 *   (Room_Default_SN body+0x08).
 * @property {number} optionMask - mirrors client.createWord2_ at creation
 *   (Room_Option_SN's 4 bits). Kept for byte-identical behaviour while
 *   ROOM_OPTION_SOURCE_MODE is off -- see the `options` property below for
 *   the field this bug was meant to represent.
 * @property {{password: boolean, balance: boolean, intrude: boolean, training: boolean}} options -
 *   OPTIONMASK-FIX (docs/research/2026-09-19-intrude/notes.md, 🟡): the real
 *   room option state. `password` mirrors `hasPassword` above; `balance`/
 *   `intrude`/`training` default false at creation (no create-dialog
 *   control for them) and only change via Room_Option_Change_CQ
 *   (0x00220215, host-only). Only consulted by senders/handlers when
 *   isRoomOptionSourceEnabled() is true.
 * @property {number} createMapId - mirrors client.mapId_/client.createdMapId_
 *   at creation (the raw CQ_CREATE body[6] byte). NOT the same thing as
 *   `mapId` above -- that one prioritizes campaignMapCacheKey_ (the real
 *   Cache.Bin 9001..9012 index). This is the small-number id
 *   CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID is keyed on, needed for
 *   Room_Default_SN's mech-slot entry table (offset 0x20).
 * @property {Map<number, {kills: number, deaths: number}>} [battleStats] -
 *   D1-6-STEP3 (design doc §4): room-shared Death_SN kill/death totals,
 *   keyed by accountId. Absent until the first BeginRound_CN resets it;
 *   only written/read by lobby.dispatch.js's case 0x00230151/0x00230123.
 * @property {number} [pveRoundsCleared_] - D1-6-STEP3: room-level twin of
 *   the old client.pveRoundsCleared_ (lobby.dispatch.js case 0x00230139),
 *   used whenever isRoomJoinEnabled() finds a tracked room -- otherwise
 *   round counting stays on the trigger client, unchanged.
 */

/** @type {Map<number, Room>} */
const rooms = new Map();

/** accountId -> roomId */
const byAccount = new Map();

let nextRoomId = 1;

// D1-4 (docs/backlog.md, docs/design/d1-multiplayer-room.md §5/§6 step 4):
// lobby room list broadcast, join, leave-notify, host reassignment.
// SWITCH-CONVERGE: verified live against a real second client
// (docs/journal/2026-09-19-0330-d1-step4-room-join.md), default flipped to
// 'enabled'. A `let` + accessor pair, not a plain `module.exports` const,
// because gate.game.dispatch.js, lobby.dispatch.js and room.dispatch.js all
// need to read the SAME switch, and test/room-join.js needs to flip it for
// its own run (same pattern as _resetForTests() below, which still forces
// this back to 'disabled' between test scenarios).
let roomJoinMode = 'enabled'; // 'disabled' | 'enabled'

function isRoomJoinEnabled() {
    return roomJoinMode === 'enabled';
}

function _setRoomJoinModeForTests(mode) {
    roomJoinMode = mode;
}

// D1-4 PM contract (docs/backlog.md): Room_List_SN 0x00220204 needs its OWN
// switch, separate from roomJoinMode above, because sending it changes
// single-player-visible behaviour on its own (the lobby starts showing your
// own room) independent of whether Enter_CQ actually works -- the two need
// to be regression-tested separately. SWITCH-CONVERGE: verified live
// (docs/journal/2026-09-19-0330-d1-step4-room-join.md), default flipped to
// 'enabled'.
let lobbyRoomListMode = 'enabled'; // 'disabled' | 'enabled'

function isLobbyRoomListEnabled() {
    return lobbyRoomListMode === 'enabled';
}

function _setLobbyRoomListModeForTests(mode) {
    lobbyRoomListMode = mode;
}

// ROOM-PLAYING-STATE (docs/backlog.md INTRUDE, docs/research/
// 2026-09-19-intrude/notes.md "過渡規則", 🟡 待審): conservative interim
// rule ahead of a real INTRUDE (mid-battle join) implementation -- whether
// a Room's `state` field (already declared on the typedef above, always
// 'lobby' until now because nothing ever wrote 'playing') actually gets
// flipped when a battle starts/ends. Requires roomJoinMode -- there is no
// tracked Room to flip without it. Same `let` + accessor + test-only setter
// pattern as every other switch in this file.
let roomPlayingStateMode = 'disabled'; // 'disabled' | 'enabled'

function isRoomPlayingStateEnabled() {
    return roomPlayingStateMode === 'enabled';
}

function _setRoomPlayingStateModeForTests(mode) {
    roomPlayingStateMode = mode;
}

// D1-6-BLEAVE (docs/design/d1-step6-battle-broadcast.md "補充：戰鬥中離開",
// 🟡 未經跨公司審查, contract BATTLE-LEAVE docs/backlog.md): whether Leave_CQ
// 0x00222131 (ESC -> leave while in battle, or closing the game mid-battle)
// and a socket closing mid-battle get room-aware handling -- broadcasting
// Leave_SN 0x00420133 to the rest of the room when a non-host leaves (battle
// keeps going), or ending the battle for everyone with EndGame_SN 0x00222213
// when the host leaves (design §6 "保守行為": no P2P host handover, the
// match just ends and the room goes back to 'lobby'). Lives here (not just
// gate.game.dispatch.js) because dispatch/room/room-leave.js's
// handleBattleLeave() is shared by both the explicit 0x00222131 case
// (gate.game.dispatch.js) and the socket-close/leaveRoomAndNotify path
// (server.js), same reasoning as every other cross-file switch in this
// file. Also requires isRoomPlayingStateEnabled() -- there is no tracked
// 'playing' state to act on without it. Same `let` + accessor + test-only
// setter pattern as every other switch here.
let battleLeaveMode = 'disabled'; // 'disabled' | 'enabled'

function isBattleLeaveEnabled() {
    return battleLeaveMode === 'enabled';
}

function _setBattleLeaveModeForTests(mode) {
    battleLeaveMode = mode;
}

// ROOM-OPTION-SOURCE (docs/backlog.md OPTIONMASK-FIX, docs/research/
// 2026-09-19-intrude/notes.md, 🟡 待審): Create_CQ's body carries no
// balance/intrude flags at all -- ZNetwork_DJ.uc:1435
// `Lobby_Room_Create(RoomType, RoomName, Password, MaxUser, MapIndex,
// PlayRound, PlayTime, PlayKill, PlayGoal)` has no such params, and
// ZPopup_CreateRoom.uc only has a password checkbox (b_Password). The old
// `optionMask: createWord2` field (still populated above, untouched) is
// body[4..5] of CQ_CREATE, which is the chosen PlayTime in minutes (see
// gate.game.dispatch.js's "PM-F1 fix 2" comment on client.createPlayTime_),
// not option bits -- so the option bits it decoded into were garbage. When
// enabled, senders read `room.options` instead (see createRoom below).
// IsBalance/IsIntrude only ever get set post-creation, host-only, via
// Room_Option_Change (CQ 0x00220215) -- ZPopup_RoomSet.uc:1367/1373 -- so
// they default to false at creation; IsTraining has no known client control
// at all yet, also defaults false.
let roomOptionSourceMode = 'disabled'; // 'disabled' | 'enabled'

function isRoomOptionSourceEnabled() {
    return roomOptionSourceMode === 'enabled';
}

function _setRoomOptionSourceModeForTests(mode) {
    roomOptionSourceMode = mode;
}

// ASSIST-FIX (docs/backlog.md, docs/research/2026-09-20-assist-fix/notes.md,
// docs/research/2026-09-20-fallback-ack-audit/notes.md, 🟡 待審):
// Assist_CN 0x00230121's reply Assist_SN 0x00230122
// (dispatch/lobby.dispatch.js) was falling into the same 16-byte-padded
// all-zero shape as the generic fallback ACK -- the client's success-path
// handler (`0x107d5fa0`) reads out to body+0x18, past what a 16-byte body
// has, an out-of-bounds read. Disabled (default) keeps the existing
// 6-byte-requested/16-byte-padded zero reply byte-for-byte. Enabled sends
// the documented 25-byte (0x19) body: echoing the CN's own
// AssistUserIndex/UserIndex/AssistType/Action/HP fields back (index 0
// lookups miss in `Game_User_Assist_Set`, so today's padding garbage is
// discarded there; the notes explain why the index echo and the length fix
// cannot ship as separate commits) with the two Exp/Point score-write field
// pairs left at 0 (no known formula yet -- see notes.md §3, do not guess).
// Same `let` + accessor + test-only setter pattern as every other switch in
// this file.
let assistSnFormatMode = 'disabled'; // 'disabled' | 'enabled'

function isAssistSnFormatEnabled() {
    return assistSnFormatMode === 'enabled';
}

function _setAssistSnFormatModeForTests(mode) {
    assistSnFormatMode = mode;
}

// D1-4: which live client objects count as "in the lobby" for the
// Room_List_SN broadcast. There is no separate "entered lobby" flag on
// NetworkClient (login goes straight from channel-enter to the client
// polling 0x00230111), so this is approximated from state that already
// exists: authenticated on the game server (`accountId_` set) and not
// currently tracked as a member of any room (`byAccount`). That means a
// client between "socket connected" and "finished game-server login" is
// briefly counted as not-in-lobby (accountId_ unset) rather than in-lobby,
// which just means it misses room list broadcasts until its next lobby
// open/request (0x00230111/0x00230141) — those still send the full list.
// `clientSource` is server.js's live `DispatchServer.clients` array
// reference for the 30907 game server (registerLobbyClientSource), so this
// module does not need its own connect/disconnect bookkeeping.
let clientSource = [];

function registerLobbyClientSource(clientArrayRef) {
    clientSource = clientArrayRef || [];
}

function getLobbyClients() {
    return clientSource.filter((client) => client && client.accountId_ && !byAccount.has(Number(client.accountId_)));
}

/**
 * Allocates the next room id. Same generation rule as the counter this
 * replaces (`gate.game.dispatch.js`'s old module-level `let nextRoomIndex = 1`):
 * increments from 1, once per call, never reused.
 */
function allocateRoomId() {
    return nextRoomId++;
}

/**
 * Creates a Room and registers it. Does not add any members — call
 * addMember() separately (the CQ_CREATE handler adds the creator as host
 * right after this).
 */
function createRoom({
    id, name, mapId, playTime, playRound, maxPlayers, campaign, hostAccountId, roomType, hasPassword, password,
    rawRoomType, isTrueCampaign, gameMode, optionMask, createMapId,
}) {
    const room = {
        id,
        name,
        mapId,
        playTime,
        playRound,
        maxPlayers,
        campaign,
        hostAccountId,
        // D1-4: optional, default to "no password / normal type" so the
        // existing test/rooms.js and test/room-chat.js callers (which do
        // not pass these) are unaffected.
        roomType: roomType || 0,
        hasPassword: !!hasPassword,
        password: password || '',
        // D1-4c: same "optional, default to a harmless value" reasoning as
        // roomType/hasPassword above -- existing test/rooms.js and
        // test/room-chat.js callers do not pass these.
        rawRoomType: rawRoomType || 0,
        isTrueCampaign: !!isTrueCampaign,
        gameMode: gameMode || 0,
        optionMask: (optionMask >>> 0) || 0,
        // D1-4c: raw CQ_CREATE mapId byte, distinct from `mapId` above (see
        // rooms.js Room typedef comment) -- needed for
        // CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID lookups a joiner's ctx has to
        // redo the same way the creator's own sendRoomState() does.
        createMapId: createMapId || 0,
        // OPTIONMASK-FIX: see Room typedef comment above. Always stored
        // (inert data -- nothing reads it unless isRoomOptionSourceEnabled()
        // is true), so this cannot change any byte sent while the switch is
        // off.
        options: {
            password: !!hasPassword,
            balance: false,
            intrude: false,
            training: false,
        },
        members: new Map(),
        state: 'lobby',
    };
    rooms.set(id, room);
    return room;
}

/** Looks up the Room a given accountId currently belongs to, or undefined. */
function getRoomByAccount(accountId) {
    const roomId = byAccount.get(accountId);
    if (roomId === undefined) return undefined;
    return rooms.get(roomId);
}

/** Looks up a Room by id, or undefined. D1-4: used by the Enter_CQ handler. */
function getRoom(roomId) {
    return rooms.get(roomId);
}

/**
 * D1-4: reassigns a room's host (design §2: "房主離開時，交給加入最早的成員").
 * Does not touch membership or send anything -- callers broadcast
 * User_Master_SN themselves once this returns. No-op (returns false) if the
 * room is not tracked.
 */
function setHost(roomId, accountId) {
    const room = rooms.get(roomId);
    if (!room) return false;
    room.hostAccountId = accountId;
    return true;
}

/**
 * D1-4c: keeps a room's map/time/round selection current after Map_Change_One_CQ
 * (dispatch/gate.game.dispatch.js case 0x00220221) updates the sending
 * client's own client.campaignMapCacheKey_/mapChangeOneTime_/playRound_ --
 * otherwise a room created, then re-mapped before anyone else joins, would
 * still hand a joiner the stale creation-time selection (the same class of
 * bug as the roomType field above, just for the map picker instead of the
 * room shell). Only touches the three map-selection fields; does not
 * validate ranges (caller already validated MapIndex 9001..9012 before
 * calling). No-op (returns false) if the room is not tracked.
 */
function updateRoomMapSelection(roomId, { mapId, playTime, playRound }) {
    const room = rooms.get(roomId);
    if (!room) return false;
    if (mapId !== undefined) room.mapId = mapId;
    if (playTime !== undefined) room.playTime = playTime;
    if (playRound !== undefined) room.playRound = playRound;
    return true;
}

/**
 * Adds (or replaces) a member in a room. Fills in defaults for any field the
 * caller omits so partial member objects (e.g. { accountId, nickname,
 * client }) are safe to pass.
 */
function addMember(roomId, member) {
    const room = rooms.get(roomId);
    if (!room) throw new Error(`rooms.addMember: no room ${roomId}`);
    /** @type {Member} */
    const full = {
        accountId: member.accountId,
        nickname: member.nickname || '',
        team: member.team || 0,
        slot: member.slot || 0,
        ready: member.ready || false,
        client: member.client || null,
        disconnectedAt: member.disconnectedAt || null,
    };
    room.members.set(full.accountId, full);
    byAccount.set(full.accountId, roomId);
    return full;
}

/**
 * Removes an accountId's membership from whatever room it is in. Deletes
 * the room itself once it has no members left. Returns false if the account
 * was not in any tracked room (nothing to do — safe to call unconditionally
 * from a leave/disconnect path).
 */
function removeMember(accountId) {
    const roomId = byAccount.get(accountId);
    if (roomId === undefined) return false;
    const room = rooms.get(roomId);
    if (room) {
        room.members.delete(accountId);
        if (room.members.size === 0) {
            rooms.delete(roomId);
        }
    }
    byAccount.delete(accountId);
    return true;
}

/**
 * Sets (or clears) the live connection for a member without removing them
 * from the room — this is the "disconnect keeps membership" behaviour from
 * design §4. Passing null records disconnectedAt = Date.now(); passing a
 * client clears disconnectedAt (reconnect). No grace-period expiry here —
 * that is step 5. Returns false if the account has no tracked membership.
 */
function setMemberClient(accountId, client) {
    const room = getRoomByAccount(accountId);
    if (!room) return false;
    const member = room.members.get(accountId);
    if (!member) return false;
    member.client = client || null;
    member.disconnectedAt = client ? null : Date.now();
    return true;
}

/** Returns every tracked room, newest-created last (Map insertion order). */
function listRooms() {
    return Array.from(rooms.values());
}

/**
 * D1 step 2 (design §3, backlog D1-2): broadcast helper. Calls
 * `build(client)` once per member with a live connection and sends
 * whatever it returns. `build` must produce a *fresh* buffer per call --
 * `client.getMessageBuffer`/`getExactMessageBuffer` are per-connection
 * (client.js's `sndbuf_` is a single reusable scratch region, "only one
 * message can be acquired at a time"), so the same buffer object cannot be
 * handed to two different clients' `.send()`. Members with `client === null`
 * (disconnected/reconnecting, design §4) are skipped, not errored.
 */
function sendAll(roomId, build) {
    const room = rooms.get(roomId);
    if (!room) return;
    for (const member of room.members.values()) {
        if (!member.client) continue;
        const msg = build(member.client);
        if (msg) member.client.send(msg);
    }
}

/** Same as sendAll(), but skips the member whose accountId === exceptAccountId. */
function sendOthers(roomId, exceptAccountId, build) {
    const room = rooms.get(roomId);
    if (!room) return;
    for (const member of room.members.values()) {
        if (member.accountId === exceptAccountId) continue;
        if (!member.client) continue;
        const msg = build(member.client);
        if (msg) member.client.send(msg);
    }
}

/**
 * Test-only reset: clears every room and index, and resets the room-id
 * counter back to 1. Not called anywhere in the real dispatch/server path —
 * this module intentionally lives outside dispatch/ so a live server's
 * rooms survive a dispatch/ /reload (see header comment), and that same
 * persistence means test/replay-golden.js's per-sample module-cache reset
 * (which only drops dispatch/*.js) does not touch this module's state on
 * its own. Call this from the harness at the same point it resets the
 * fixture DB, so each golden sample starts from a fresh registry, matching
 * a freshly started server, the same as it always did back when the room-id
 * counter was a local variable inside gate.game.dispatch.js.
 */
function _resetForTests() {
    rooms.clear();
    byAccount.clear();
    nextRoomId = 1;
    roomJoinMode = 'disabled';
    lobbyRoomListMode = 'disabled';
    roomPlayingStateMode = 'disabled';
    roomOptionSourceMode = 'disabled';
    battleLeaveMode = 'disabled';
    assistSnFormatMode = 'disabled';
    clientSource = [];
}

module.exports = {
    allocateRoomId,
    createRoom,
    getRoomByAccount,
    getRoom,
    setHost,
    updateRoomMapSelection,
    addMember,
    removeMember,
    setMemberClient,
    listRooms,
    sendAll,
    sendOthers,
    isRoomJoinEnabled,
    _setRoomJoinModeForTests,
    isLobbyRoomListEnabled,
    _setLobbyRoomListModeForTests,
    isRoomPlayingStateEnabled,
    _setRoomPlayingStateModeForTests,
    isRoomOptionSourceEnabled,
    _setRoomOptionSourceModeForTests,
    isBattleLeaveEnabled,
    _setBattleLeaveModeForTests,
    isAssistSnFormatEnabled,
    _setAssistSnFormatModeForTests,
    registerLobbyClientSource,
    getLobbyClients,
    _resetForTests,
};
