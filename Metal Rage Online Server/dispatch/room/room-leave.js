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
const { broadcastRoomListChange } = require('./room-list.sender');

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
function leaveRoomAndNotify(accountId) {
    const room = rooms.getRoomByAccount(accountId);
    if (!room) return;

    const wasHost = room.hostAccountId === accountId;
    const remainingMembers = Array.from(room.members.values()).filter((m) => m.accountId !== accountId);

    rooms.removeMember(accountId);

    if (remainingMembers.length > 0 && rooms.isRoomJoinEnabled()) {
        // Leave_SN 0x00220236: u16 UserIndex + u8 Kickout.
        for (const member of remainingMembers) {
            if (!member.client) continue;
            const [leaveMsg, leaveBody] = getExactMessageBuffer(0x00220236, 0x03);
            leaveBody.writeUInt16LE(accountId, 0x00);
            leaveBody.writeUInt8(0, 0x02); // Kickout=0: voluntary leave/disconnect, not a kick
            member.client.send(leaveMsg);
        }
        console.log(`[room-leave] >> Sent Leave_SN 0x220236 to ${remainingMembers.length} remaining room member(s) (left=${accountId})`);

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
    }
}

module.exports = {
    leaveRoomAndNotify,
};
