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
 * @property {Map<number, Member>} members
 * @property {'lobby'|'playing'} state
 */

/** @type {Map<number, Room>} */
const rooms = new Map();

/** accountId -> roomId */
const byAccount = new Map();

let nextRoomId = 1;

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
function createRoom({ id, name, mapId, playTime, playRound, maxPlayers, campaign, hostAccountId }) {
    const room = {
        id,
        name,
        mapId,
        playTime,
        playRound,
        maxPlayers,
        campaign,
        hostAccountId,
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

module.exports = {
    allocateRoomId,
    createRoom,
    getRoomByAccount,
    addMember,
    removeMember,
    setMemberClient,
    listRooms,
};
