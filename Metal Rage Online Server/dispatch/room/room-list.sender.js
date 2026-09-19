'use strict';

// D1-4 (docs/backlog.md, docs/design/d1-multiplayer-room.md §5/§6 step 4):
// Room_List_SN 0x00220204 -- the lobby room list broadcast. Wire format is
// from docs/research/2026-09-18-d1-room-formats/notes.md (client thunk
// 0x10702ef0 -> body 0x107e4640, ZNetwork.dll disassembly):
//
//   header: +0x00 u8 (notes.md: "讀了但沒用" -- client reads this byte and
//           discards it; sender still tracks a continuation flag here for
//           its own bookkeeping, but it has no confirmed client-side
//           effect), +0x01 u8 entry count (<=255)
//   per entry:
//     u16 RoomIndex
//     u8  UpdateType (1=new room [+u16 RoomNumber follows immediately],
//                      3=delete, other=partial update)
//     u16 FieldMask, then only the fields whose bit is set:
//       bit0 u8 RoomType (raw byte, needs translation -- see
//         ROOM_TYPE_NORM_TO_RAW below, D1-4b 2026-09-19)
//       bit1 u8+u8 (matching/playing flags; 2nd byte's meaning unconfirmed)
//       bit2 u8 CurrentUser, u8 MaxUser (D1-4b 2026-09-19 correction: this
//         order was verified backwards before -- see the field-write site
//         below for the disassembly)
//       bit3 u8 flags (bit0=has password, bit3=training)
//       bit5 6 bytes: 2 rotate-flag source bytes + 2 unread bytes + u16
//         MapIndex *at the end*, not the start (D1-4b 2026-09-19 correction
//         -- see the field-write site below)
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

// ROOMNAME-BIG5 (docs/journal/2026-09-19-*-room-name-big5.md, 🟡):
// toRoomNameWireBytes() is toSafeAscii() (unchanged) unless
// ROOM_NAME_RAW_BYTES_MODE is on, in which case it hands back the exact
// latin1 bytes instead of mangling non-ASCII (e.g. Big5) bytes to '?'.
const { toRoomNameWireBytes } = require('./room-string');

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

// D1-4b (docs/backlog.md, PM follow-up 2026-09-19): bit0 RoomType on the
// wire is NOT the same value space as the in-memory ROOM_SIMPLE_INFO.RoomType
// the UI switches on (ZNetwork_DJ.uc:537 "0:일반, 1:클랜전, 2:캠페인,
// 3:퀵매칭"; ZPage_Lobby.uc:794 `RoomType==2` is the PvE/campaign branch).
// The client runs the raw wire byte through a 6-entry jump table before
// storing it -- confirmed by disassembly of the Room_List_SN body handler
// (0x107e4640, ZNetwork.dll):
//   0x107e48ae-0x107e48c4: read 1 raw byte off the wire -> [esp+0x5c]
//   0x107e48d0 `dec eax` (eax = raw-1); 0x107e48d1/4 `cmp eax,5; ja 0x107e4901`
//     -- raw outside [1,6] falls through to the default case
//   0x107e48d6 `jmp dword ptr [eax*4 + 0x107e4e40]` -- jump table, read
//     directly from the DLL's .text bytes at VA 0x107e4e40 (6 dwords):
//       raw=1 -> target 0x107e48dd -> stores norm 2 (campaign/PvE)
//       raw=2 -> target 0x107e4901 -> norm 0 (== the default/out-of-range case)
//       raw=3 -> target 0x107e48e6 -> norm 1 (clan)
//       raw=4 -> target 0x107e4901 -> norm 0 (default)
//       raw=5 -> target 0x107e48ef -> norm 3 (quick)
//       raw=6 -> target 0x107e48f8 -> norm 4
//       raw=0 or raw>=7 -> norm 0 (default, `ja` catches the range miss)
// Before this fix, buildRoomListEntry() wrote room.roomType's already-
// normalized value (2 for campaign) straight onto the wire as if it were
// raw; raw=2 re-normalizes to norm=0 (normal/일반전) per the table above,
// which is why a PvE room's lobby entry showed "type battle" instead of
// PvE. [OBS][LOG] session-20260919-100817.jsonl:124 (Room_List_SN for
// Lucas's PvE/campaign room) had bit0 RoomType byte = 0x02 on the wire --
// exactly the pre-fix raw=2 case, i.e. "battle" was the observed
// consequence of this exact byte value (journal 2026-09-19-0330 "M1 실측 1
// 후 수정"). This table sends the raw byte the client needs to land on
// each normalized RoomType.
const ROOM_TYPE_NORM_TO_RAW = { 0: 0, 1: 3, 2: 1, 3: 5, 4: 6 };

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

    // ROOMNAME-BIG5: name.length below is a JS-string char count, but for
    // both 'ascii' and 'latin1' that equals the byte count too, so the wire
    // math (fieldsSize, the u8 length prefix) stays correct either way.
    const { text: name, encoding: nameEncoding } = toRoomNameWireBytes(room.name, 0xFF);
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

    // bit0 RoomType: send the RAW byte the client's jump table (see
    // ROOM_TYPE_NORM_TO_RAW above) needs to land on room.roomType's
    // normalized value -- room.roomType itself must stay normalized
    // (0 normal/1 clan/2 campaign/3 quick/4 attack, rooms.js's own
    // convention and what ZPage_Lobby.uc's switches compare against).
    buf.writeUInt8((ROOM_TYPE_NORM_TO_RAW[room.roomType] ?? 0) & 0xFF, off); off += 1;
    buf.writeUInt8(room.state === 'playing' ? 1 : 0, off); off += 1; // bit1 matching/playing flag
    buf.writeUInt8(0, off); off += 1;                                // bit1 2nd byte, unread (notes.md)
    // bit2: D1-4b 2026-09-19 correction -- disassembly of the field-read
    // block (0x107e4a2d-0x107e4a76) shows the client stores the FIRST wire
    // byte into ROOM_SIMPLE_INFO.CurrentUser (struct offset ebp+0x40:
    // `0x107e4a73 mov dword ptr [ebp+0x40], edx` where edx came from the
    // byte read at 0x107e4a2d) and the SECOND wire byte into MaxUser
    // (offset ebp+0x3c: `0x107e4a76 mov dword ptr [ebp+0x3c], eax`).
    // Struct offsets confirmed by walking ROOM_SIMPLE_INFO's declared field
    // order (ZNetwork_DJ.uc:533-556) against this function's other stores
    // (ebp+4=RoomNumber, ebp+8=RoomType -- both already used above -- with
    // RoomName/MapName/MapMode as 12-byte FStrings in between). Sending
    // Max then Current (the old order) put our maxPlayers value into the
    // client's CurrentUser and vice versa -- [OBS] session-20260919-100817
    // .jsonl:124 sent bytes `08 01` (Max=8, Current=1) for an 8-slot room
    // with 1 player, and the lobby showed "Plyr 8/1"
    // (CurrentUser $"/"$ MaxUser, ZPage_Lobby.uc:800) instead of "1/8".
    buf.writeUInt8(Math.min(room.members.size, 0xFF), off); off += 1; // bit2 CurrentUser (wire byte 0)
    buf.writeUInt8(Math.min(room.maxPlayers, 0xFF), off); off += 1;   // bit2 MaxUser (wire byte 1)
    buf.writeUInt8(room.hasPassword ? 0x01 : 0x00, off); off += 1;   // bit3 flags (bit0=password; training unmodeled)
    // bit5: D1-4b 2026-09-19 correction -- disassembly of the field-read
    // block (0x107e4b5b-0x107e4c22) shows the 6 bytes are NOT "MapIndex +
    // 4 unknown": buffer[0]/[1] only feed an IsRotate-ish bool (set when
    // either byte > 1, cleared when both <=1 -- 0x107e4b72-0x107e4b8e),
    // buffer[2]/[3] are read but never referenced downstream (still
    // unknown), and MapIndex is the LAST 2 bytes (`movzx eax, word ptr
    // [esp+0x2c]` at 0x107e4b94, which is buffer offset 4 -- confirmed by
    // walking the same buffer's offset-0/1 reads at 0x107e4b72/0x107e4b79).
    // MapIndex is then used to look up a Cache.Bin map-info table (helper
    // at 0x1091ba60, array stride 0xbc, key at entry+0x0) and copy
    // MapName (entry+0xc), MapMode (entry+0x48), MapLevel (entry+0x68) and
    // MapImage (entry+0x4) into the room struct -- MapName/MapMode/etc are
    // never sent on the wire at all, only MapIndex is. Sending MapIndex in
    // the first 2 bytes (the old code) meant the client looked up MapIndex
    // 0 for the map name/mode -- not found, so the fields stayed at their
    // default empty value. [OBS] session-20260919-100817.jsonl:124 sent
    // `32 23 00 00 00 00` for map 9010 (0x2332) in the old first-2-bytes
    // position; the lobby showed a blank Map and Mode column.
    buf.writeUInt16LE(0, off); off += 2;                              // bit5 rotate-flag source bytes (0,0 = not rotating)
    buf.writeUInt16LE(0, off); off += 2;                              // bit5 2 unread bytes, still unknown
    buf.writeUInt16LE(room.mapId & 0xFFFF, off); off += 2;            // bit5 MapIndex (last 2 bytes)
    buf.writeUInt16LE(room.id & 0xFFFF, off); off += 2;              // bit8 RoomNameIndex, see header comment
    buf.writeUInt8(name.length, off); off += 1;                      // bit9 name length
    buf.write(name, off, name.length, nameEncoding); off += name.length; // bit9 name bytes

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
