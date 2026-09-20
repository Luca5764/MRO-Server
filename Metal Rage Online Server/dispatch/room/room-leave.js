'use strict';

// D1-4 correction (design §4 "斷線即離開", 2026-09-19 PM decision
// superseding the earlier grace-period draft that server.js's socket close
// hook comment still described): shared by both trigger paths that mean
// "this account is gone from its room" --
//   - Leave_CQ 0x00220234 (client pressed "back" in the room)
//   - server.js's socket close hook (any disconnect -- the client never
//     auto-reconnects, and does not reconnect across a map change either;
//     see docs/journal/2026-09-19-0230-*.md, so a closed socket always
//     means "gone", never "changing maps mid-session")
// No-op if the account is not currently tracked as a member of any room --
// both call sites can call this unconditionally. (D1-4b, docs/backlog.md,
// PM 2026-09-19: this used to also be a no-op whenever ROOM_JOIN_MODE was
// disabled, which silently dropped the lobby-list delete/member-count
// broadcast too; see leaveRoomAndNotify()'s own doc comment below for what
// changed and why.)
const rooms = require('../../rooms.js');
const { sendRoomUserPackets, buildMemberUserCtx } = require('./room-user.sender');
const { broadcastRoomListChange, sendFullRoomList } = require('./room-list.sender');
// P3 step 2 (docs/design/p3-step1-writeback.md §2.2/§6, MATCH_STATS_MODE):
// a match that never reached EndGame_SN (host leaves / room empties) gets
// one MATCH-ABORTED log line instead of a summary -- see leaveRoomAndNotify
// below.
const matchStats = require('./match-stats');

// Same pure header-builder duplicated in gate.game.dispatch.js/room.dispatch.js/
// community.dispatch.js (existing precedent in this codebase, not centralized).
function getExactMessageBuffer(type, bodySize) {
    const msg = Buffer.alloc(0x10 + bodySize);
    msg.writeUint16BE(msg.length, 0x6);
    msg.writeUint32BE(type, 0xC);
    return [msg, msg.subarray(0x10)];
}

/**
 * Removes `accountId` from whatever room it is in (no-op if none). Tells the
 * remaining members via Leave_SN 0x00220236 [DLL 0x107edb70] and reassigns
 * the host if the leaver was host (design §2: "加入最早的成員") via
 * User_Master_SN — both gated by ROOM_JOIN_MODE, since those only matter to
 * clients that got into the room through the ROOM_JOIN_MODE-gated Enter_CQ
 * flow in the first place. Telling the *lobby* that the room's member count
 * changed or the room is gone is a separate concern, gated only by
 * LOBBY_ROOM_LIST_MODE.
 *
 * D1-4b bug fix (docs/backlog.md, PM 2026-09-19): before this fix, the whole
 * function (including membership removal) short-circuited on
 * `!rooms.isRoomJoinEnabled()`, and the lobby-delete broadcast was nested
 * inside the `remainingMembers.length > 0` branch, both gated by
 * ROOM_JOIN_MODE too. That meant a solo host's Leave_CQ with
 * LOBBY_ROOM_LIST_MODE on but ROOM_JOIN_MODE off (a real combination — see
 * gate.game.dispatch.js's CQ_CREATE broadcast, which was already
 * LOBBY_ROOM_LIST_MODE-only) never removed the room from the registry and
 * never told the lobby it was gone — [OBS] session-20260919-100817.jsonl:
 * Lucas's room stayed in the laptop's list after Lucas's Leave_CQ (line 188
 * onward). PM's follow-up broadened the fix: *any* event that changes the
 * lobby list's content — create, delete, member-count change — is gated
 * only by LOBBY_ROOM_LIST_MODE, matching the CQ_CREATE precedent
 * (gate.game.dispatch.js ~line 800) instead of double-gating on
 * ROOM_JOIN_MODE as well.
 */
// KICK task (docs/backlog.md, 2026-09-19): `kickout` lets the Kickout_CQ
// 0x00220337 handler (gate.game.dispatch.js) reuse this same remove-member/
// Leave_SN/host-reassign path instead of duplicating it, per that task's
// contract. Per the DLL (0x107edb70, ZDispatchRoom::Leave_SN, decompiled for
// this task), the Kickout byte only changes behaviour for a client reading
// UserIndex==itself (fires NETWORK_ROOM_KICKOUT_ME in addition to
// NETWORK_GOTO_LOBBY, both gated on the "self" branch); a client reading a
// *different* UserIndex (the "someone else left" branch, `uVar3 != uVar4`)
// never loads the Kickout byte at all, it just calls Room_User_Delete either
// way. That means it is safe to send Kickout=1 to every remaining member
// below (host included) without changing their behaviour -- the kicked
// account's own self-targeted Leave_SN (sent separately by the Kickout_CQ
// handler *before* calling this function, since the kicked account is never
// part of `remainingMembers`) is the one where Kickout=1 actually matters.
function leaveRoomAndNotify(accountId, { kickout = false } = {}) {
    const room = rooms.getRoomByAccount(accountId);
    if (!room) return;

    // D1-6-BLEAVE (see handleBattleLeave's own doc comment below): this
    // function's callers (Leave_CQ 0x00220234, Kickout_CQ 0x00220337,
    // server.js's socket-close hook) mean "actually gone from the room" --
    // unlike the battle-only Leave_CQ 0x00222131 (which keeps the leaver's
    // membership, see gate.game.dispatch.js's own case), so the
    // remove-member/host-reassign logic below always runs regardless. This
    // just sends the battle-aware packets FIRST when the room happens to be
    // mid-battle (room.state==='playing') -- in practice that only really
    // fires from the socket-close call site (a room-screen Leave_CQ/Kickout
    // should not be reachable from battle scene 6), but is safe to call
    // unconditionally: handleBattleLeave() is a no-op whenever the room is
    // not 'playing' or the switches are off, and it never touches room
    // membership itself, so it cannot change wasHost/remainingMembers below.
    handleBattleLeave(accountId, room);
    // LEAVE-LIST: grab the leaver's own connection before removeMember() drops
    // the membership (that is the only place it is reachable from here).
    const leaverMember = room.members.get(accountId);
    const leaverClient = leaverMember ? leaverMember.client : null;
    const wasHost = room.hostAccountId === accountId;
    const remainingMembers = Array.from(room.members.values()).filter((m) => m.accountId !== accountId);

    // P3 step 2 (docs/design/p3-step1-writeback.md §6 review point 2,
    // MATCH_STATS_MODE): a match still in progress (room.matchStats set,
    // not yet finalized by Campaign_CN's EndGame branch) counts as aborted
    // the moment its host leaves or the room empties -- checked here, the
    // one place both trigger paths (Leave_CQ, Kickout_CQ, socket close)
    // funnel through, instead of duplicating the check at each call site.
    // No-op (matchStats.emitMatchAborted) unless MATCH_STATS_MODE is
    // enabled and a matchStats is actually in progress.
    if (wasHost || remainingMembers.length === 0) {
        matchStats.emitMatchAborted(room, wasHost ? 'host-left' : 'room-emptied');
    }

    rooms.removeMember(accountId);

    if (remainingMembers.length > 0 && rooms.isRoomJoinEnabled()) {
        // Leave_SN 0x00220236: u16 UserIndex + u8 Kickout.
        for (const member of remainingMembers) {
            if (!member.client) continue;
            const [leaveMsg, leaveBody] = getExactMessageBuffer(0x00220236, 0x03);
            leaveBody.writeUInt16LE(accountId, 0x00);
            leaveBody.writeUInt8(kickout ? 1 : 0, 0x02); // 0: voluntary leave/disconnect; 1: kicked (see fn comment)
            member.client.send(leaveMsg);
        }
        console.log(`[room-leave] >> Sent Leave_SN 0x220236 to ${remainingMembers.length} remaining room member(s) (left=${accountId}, kickout=${kickout})`);

        if (wasHost) {
            // rooms.js's Member map preserves insertion (join) order, so the
            // first surviving entry is whoever joined earliest (design §2).
            const newHost = remainingMembers[0];
            rooms.setHost(room.id, newHost.accountId);
            console.log(`[room-leave] >> Host left room #${room.id}; reassigned to account ${newHost.accountId}`);
            for (const member of remainingMembers) {
                if (!member.client) continue;
                sendRoomUserPackets(member.client, buildMemberUserCtx(newHost), getExactMessageBuffer);
            }
        }
    }

    // Lobby room-list broadcast: gated ONLY by LOBBY_ROOM_LIST_MODE (see
    // function doc comment above), independent of ROOM_JOIN_MODE and of
    // whether there happened to be other members to notify inside the room.
    if (rooms.isLobbyRoomListEnabled()) {
        const updateType = remainingMembers.length > 0 ? 2 : 3;
        broadcastRoomListChange(rooms.getLobbyClients(), room, updateType, getExactMessageBuffer);

        // LEAVE-LIST (2026-09-20): the leaver lands back in the lobby but only
        // ever got the incremental update about the room it just left, so any
        // room created by someone else while it was inside stayed invisible --
        // the client does not send the lobby request (0x00230141) again on its
        // own after Leave_CQ ([LOG] session-20260920-140707.jsonl: Leave_SA ->
        // one delete entry -> nothing, reproduced in session-20260919-184235
        // too; research/2026-09-20-roomlist-empty/notes.md). Send the leaver a
        // full list so the lobby it returns to is current.
        if (leaverClient) sendFullRoomList(leaverClient, rooms.listRooms(), getExactMessageBuffer);
    }
}

/**
 * D1-6-BLEAVE (docs/design/d1-step6-battle-broadcast.md "補充：戰鬥中離開",
 * §6 "房主戰鬥中離開＝該場結束、其餘成員回房間"; explorer 🟡 待審): shared by
 * both trigger paths for "this account is leaving a room whose battle is in
 * progress" --
 *   - Leave_CQ 0x00222131 (client pressed ESC -> leave, or closed the game,
 *     while in battle scene 6; gate.game.dispatch.js's case 0x00222131
 *     calls this directly, in addition to always sending Leave_SA
 *     0x00222132 0/0)
 *   - a socket closing mid-battle (leaveRoomAndNotify below calls this
 *     before its own existing remove-member logic, so server.js's close
 *     hook gets the same battle-aware packets without changing what it
 *     already does once the battle-specific side effects are handled)
 *
 * Gated by rooms.isBattleLeaveEnabled() AND rooms.isRoomPlayingStateEnabled()
 * (no tracked 'playing' room to act on without the latter). No-op (returns
 * false, "did not touch anything") when either switch is off, `room` is
 * undefined, or `room.state !== 'playing'` -- callers fall back to whatever
 * they already did in that case.
 *
 * - Host leaves: the DLL fact this is built on (Leave_SN 0x00420133 body+0
 *   u16 UserIndex; non-self UserIndex just removes that one player from the
 *   reader's local roster) has no "everyone leaves at once" semantics, so a
 *   host leaving needs its own packet -- EndGame_SN 0x00222213, the same
 *   0x1E-byte body lobby.dispatch.js's Campaign_CN handler already sends
 *   (winTeam=1/lose here -- the match was cut short, not won), broadcast to
 *   every OTHER live member. `room.state` flips back to 'lobby' and the
 *   lobby gets the same partial Room_List_SN update member-count changes
 *   already use. Does NOT touch room membership -- the host stays a member
 *   (and stays host); only the caller decides whether to actually remove
 *   them (see the two call sites' own comments).
 * - Non-host leaves: room.state stays 'playing' (the battle keeps going for
 *   everyone else). Broadcasts Leave_SN 0x00420133 (body+0 u16 UserIndex =
 *   the leaver's accountId) to every OTHER live member, and flags the
 *   leaving member `inBattle = false` on its own Room Member record (ad-hoc
 *   field, same pattern as room.battleStartGen / room.pveRoundsCleared_
 *   elsewhere in this codebase) so a future INTRUDE implementation has
 *   somewhere to read "already left this battle" independent of room
 *   membership.
 *
 * @param {number} accountId
 * @param {import('../../rooms.js').Room|undefined} room
 * @returns {boolean} true if this handled a mid-battle leave, false if it
 *   was a no-op (switch off, no room, or room not 'playing').
 */
function handleBattleLeave(accountId, room) {
    if (!rooms.isBattleLeaveEnabled() || !rooms.isRoomPlayingStateEnabled()) return false;
    if (!room || room.state !== 'playing') return false;

    if (room.hostAccountId === accountId) {
        let sentCount = 0;
        for (const member of room.members.values()) {
            if (member.accountId === accountId) continue;
            if (!member.client) continue;
            const [msg, eb] = getExactMessageBuffer(0x00222213, 0x1E);
            eb.writeUInt16LE(1, 0x00); // WinTeamIndex=1 (lose) -- battle cut short, no real winner
            eb.writeUInt16LE(0, 0x02); // Team A block: TeamIndex=0 (red)
            eb.writeUInt16LE(1, 0x10); // Team B block: TeamIndex=1 (blue)
            member.client.send(msg);
            sentCount++;
        }
        room.state = 'lobby';
        console.log(`[room-leave] >> Host (account ${accountId}) left mid-battle: Broadcast EndGame_SN 0x222213 to ${sentCount} room member(s) (room #${room.id}), state -> lobby`);
        if (rooms.isLobbyRoomListEnabled()) {
            broadcastRoomListChange(rooms.getLobbyClients(), room, 2, getExactMessageBuffer);
        }
    } else {
        const member = room.members.get(accountId);
        if (member) member.inBattle = false;
        let sentCount = 0;
        for (const other of room.members.values()) {
            if (other.accountId === accountId) continue;
            if (!other.client) continue;
            // Leave_SN 0x00420133 [DLL 0x107d8390]: body+0 u16 UserIndex.
            const [msg, eb] = getExactMessageBuffer(0x00420133, 0x02);
            eb.writeUInt16LE(accountId, 0x00);
            other.client.send(msg);
            sentCount++;
        }
        console.log(`[room-leave] >> Non-host (account ${accountId}) left mid-battle: Broadcast Leave_SN 0x420133 to ${sentCount} room member(s) (room #${room.id}), state stays playing`);
    }
    return true;
}

module.exports = {
    leaveRoomAndNotify,
    handleBattleLeave,
};
