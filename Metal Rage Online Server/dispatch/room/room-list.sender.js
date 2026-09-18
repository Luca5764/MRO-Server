'use strict';

// D1-4 (docs/backlog.md, docs/design/d1-multiplayer-room.md §5/§6 step 4):
// Room_List_SN 0x00220204 -- the lobby room list broadcast. Wire format is
// from docs/research/2026-09-18-d1-room-formats/notes.md (client thunk
// 0x10702ef0 -> body 0x107e4640, ZNetwork.dll disassembly):
//
//   header: +0x00 u8 "more frames follow" flag, +0x01 u8 entry count (<=255)
//   per entry:
//     u16 RoomIndex
//     u8  UpdateType (1=new room [+u16 RoomNumber follows immediately],
//                      3=delete, other=partial update)
//     u16 FieldMask, then only the fields whose bit is set:
//       bit0 u8 RoomType
//       bit1 u8+u8 (matching/playing flags; 2nd byte's meaning unconfirmed)
//       bit2 u8 MaxUser, u8 CurrentUser
//       bit3 u8 flags (bit0=has password, bit3=training)
//       bit5 u16 MapIndex + 4 unknown bytes
//       bit8 u16 RoomNameIndex
//       bit9 u8 name length + N bytes ANSI room name
//
// bit4 (2 bytes, read-and-discarded by the client) and bit6 are known to
// exist but their content was never pinned down -- per the D1-4 task
// contract, never set those bits.
//
// Two fields are best-guesses, not DLL-confirmed, flagged 🟡 pending
// high-tier review (see docs/journal/2026-09-19-*-d1-step4-room-join.md):
// RoomNumber (only sent for UpdateType==1) and RoomNameIndex (bit8) both
// reuse RoomIndex's value. The client reads and stores them
// (ZNetwork_DJ.uc's ROOM_SIMPLE_INFO) but nothing in the notes.md pass
// pinned down what either is used for downstream, so echoing RoomIndex is
// the least-surprising placeholder rather than an invented distinct number.
const SN_ROOM_LIST = 0x00220204;

// AGENTS.md pitfall table: the client silently wedges every packet after
// the first frame over 0x400 bytes (header included). Leave real slack
// under that, not just enough for the declared body -- some callers pass
// client.getMessageBuffer (pads to a 16-byte multiple), so the true wire
// size of a "just under the line" frame can be up to 15 bytes larger than
// what this module computed.
const MAX_FRAME_BYTES = 0x400;
const FRAME_HEADER_BYTES = 0x10;
const LIST_HEADER_BYTES = 0x02;
const SAFETY_MARGIN_BYTES = 0x20;
const MAX_ENTRIES_BYTES = MAX_FRAME_BYTES - FRAME_HEADER_BYTES - LIST_HEADER_BYTES - SAFETY_MARGIN_BYTES;

const { toSafeAscii } = require('./room-string');

const FIELD_BIT = {
    ROOM_TYPE: 1 << 0,
    MATCH_FLAGS: 1 << 1,
    USER_COUNT: 1 << 2,
    ROOM_FLAGS: 1 << 3,
    MAP: 1 << 5,
    NAME_INDEX: 1 << 8,
    NAME: 1 << 9,
};

const FULL_FIELD_MASK = FIELD_BIT.ROOM_TYPE | FIELD_BIT.MATCH_FLAGS | FIELD_BIT.USER_COUNT |
    FIELD_BIT.ROOM_FLAGS | FIELD_BIT.MAP | FIELD_BIT.NAME_INDEX | FIELD_BIT.NAME;

/**
 * Builds one Room_List_SN entry for `room`.
 * @param {object} room - a rooms.js Room
 * @param {1|2|3} updateType - 1 new (full fields, +RoomNumber), 2 partial
 *   update (same full field set -- see journal for why a real minimal diff
 *   was not attempted), 3 delete (RoomIndex + UpdateType only).
 */
function buildRoomListEntry(room, updateType) {
    if (updateType === 3) {
        const buf = Buffer.alloc(0x03);
        buf.writeUInt16LE(room.id & 0xFFFF, 0x00);
        buf.writeUInt8(3, 0x02);
        return buf;
    }

    const name = toSafeAscii(room.name);
    const headerSize = 0x02 + 0x01 + (updateType === 1 ? 0x02 : 0) + 0x02; // RoomIndex+UpdateType[+RoomNumber]+FieldMask
    const fieldsSize = 0x01 /* ROOM_TYPE */ + 0x02 /* MATCH_FLAGS */ + 0x02 /* USER_COUNT */
        + 0x01 /* ROOM_FLAGS */ + 0x06 /* MAP */ + 0x02 /* NAME_INDEX */ + (0x01 + name.length) /* NAME */;
    const buf = Buffer.alloc(headerSize + fieldsSize);

    let off = 0;
    buf.writeUInt16LE(room.id & 0xFFFF, off); off += 2;
    buf.writeUInt8(updateType, off); off += 1;
    if (updateType === 1) {
        buf.writeUInt16LE(room.id & 0xFFFF, off); off += 2; // RoomNumber, see header comment
    }
    buf.writeUInt16LE(FULL_FIELD_MASK, off); off += 2;

    buf.writeUInt8(room.roomType & 0xFF, off); off += 1; // bit0 RoomType
    buf.writeUInt8(room.state === 'playing' ? 1 : 0, off); off += 1; // bit1 matching/playing flag
    buf.writeUInt8(0, off); off += 1;                                // bit1 2nd byte, unread (notes.md)
    buf.writeUInt8(Math.min(room.maxPlayers, 0xFF), off); off += 1;  // bit2 MaxUser
    buf.writeUInt8(Math.min(room.members.size, 0xFF), off); off += 1; // bit2 CurrentUser
    buf.writeUInt8(room.hasPassword ? 0x01 : 0x00, off); off += 1;   // bit3 flags (bit0=password; training unmodeled)
    buf.writeUInt16LE(room.mapId & 0xFFFF, off); off += 2;           // bit5 MapIndex
    buf.writeUInt32LE(0, off); off += 4;                             // bit5 4 unknown bytes (notes.md)
    buf.writeUInt16LE(room.id & 0xFFFF, off); off += 2;              // bit8 RoomNameIndex, see header comment
    buf.writeUInt8(name.length, off); off += 1;                      // bit9 name length
    buf.write(name, off, name.length, 'ascii'); off += name.length;  // bit9 name bytes

    return buf;
}

/**
 * Sends `entries` (Buffers built by buildRoomListEntry) to `client`,
 * splitting into multiple <=0x400-byte Room_List_SN frames as needed. An
 * empty `entries` array still sends one zero-count frame, so a client
 * refreshing its lobby view after every room disappeared gets an explicit
 * "nothing here" rather than silence.
 */
function sendRoomListEntries(client, entries, getExactMessageBuffer) {
    const chunks = [[]];
    let currentSize = 0;
    for (const entry of entries) {
        const last = chunks[chunks.length - 1];
        if (last.length >= 0xFF || (currentSize + entry.length) > MAX_ENTRIES_BYTES) {
            chunks.push([]);
            currentSize = 0;
        }
        chunks[chunks.length - 1].push(entry);
        currentSize += entry.length;
    }

    chunks.forEach((chunkEntries, index) => {
        const isLast = index === chunks.length - 1;
        const bodySize = LIST_HEADER_BYTES + chunkEntries.reduce((sum, e) => sum + e.length, 0);
        const [msg, body] = getExactMessageBuffer(SN_ROOM_LIST, bodySize);
        body.writeUInt8(isLast ? 0 : 1, 0x00); // "more frames follow", see module header comment
        body.writeUInt8(chunkEntries.length, 0x01);
        let off = LIST_HEADER_BYTES;
        for (const entry of chunkEntries) {
            entry.copy(body, off);
            off += entry.length;
        }
        client.send(msg);
    });
}

/** Sends the full current room list (all UpdateType=1) to `client`. Trigger: lobby open/refresh (0x00230111/0x00230141) or returning to the lobby after Leave_CQ. */
function sendFullRoomList(client, roomList, getExactMessageBuffer) {
    const entries = roomList.map((room) => buildRoomListEntry(room, 1));
    sendRoomListEntries(client, entries, getExactMessageBuffer);
}

/** Sends a single-room incremental update (create/member-count-change/delete) to every client in `lobbyClients`. */
function broadcastRoomListChange(lobbyClients, room, updateType, getExactMessageBuffer) {
    const entry = buildRoomListEntry(room, updateType);
    for (const client of lobbyClients) {
        sendRoomListEntries(client, [entry], getExactMessageBuffer);
    }
}

module.exports = {
    SN_ROOM_LIST,
    buildRoomListEntry,
    sendRoomListEntries,
    sendFullRoomList,
    broadcastRoomListChange,
};
