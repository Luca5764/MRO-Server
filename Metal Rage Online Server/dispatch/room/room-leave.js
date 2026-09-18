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
// No-op if ROOM_JOIN_MODE is disabled (rooms.js) or the account is not
// currently tracked as a member of any room -- both call sites can call
// this unconditionally.
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
 * Removes `accountId` from whatever room it is in (no-op if none), tells the
 * remaining members via Leave_SN 0x00220236 [DLL 0x107edb70], reassigns the
 * host if the leaver was host (design §2: "加入最早的成員") via
 * User_Master_SN, and — only when LOBBY_ROOM_LIST_MODE (rooms.js) is also
 * enabled — tells the lobby the room's member count changed or the room is
 * gone.
 */
function leaveRoomAndNotify(accountId) {
    if (!rooms.isRoomJoinEnabled()) return;

    const room = rooms.getRoomByAccount(accountId);
    if (!room) return;

    const wasHost = room.hostAccountId === accountId;
    const remainingMembers = Array.from(room.members.values()).filter((m) => m.accountId !== accountId);

    rooms.removeMember(accountId);

    if (remainingMembers.length > 0) {
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

        if (rooms.isLobbyRoomListEnabled()) {
            broadcastRoomListChange(rooms.getLobbyClients(), room, 2, getExactMessageBuffer);
        }
    } else if (rooms.isLobbyRoomListEnabled()) {
        // Room now empty -- removeMember() above already deleted it from
        // the registry; tell the lobby.
        broadcastRoomListChange(rooms.getLobbyClients(), room, 3, getExactMessageBuffer);
    }
}

module.exports = {
    leaveRoomAndNotify,
};
