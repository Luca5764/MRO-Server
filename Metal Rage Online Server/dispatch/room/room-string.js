// R2 verified: the room-name path consumes ANSI/narrow input. This contradicts
// the old AGENTS.md note for 0x0022021A; the high-level owner will update it.
// Keep the switch shared so both room-state and room-user senders agree.
const ROOM_STRING_ANSI_MODE = 'enabled'; // 'disabled' | 'enabled'
const ROOM_STRING_MAX_CHARS = 25;

// ROOMNAME-BIG5 (docs/journal/2026-09-19-*-room-name-big5.md, 🟡, 未經跨公司
// 審查): Create_CQ 0x00220201 carries the room name/password as ANSI (cp950
// /Big5 for CJK) bytes at body+14/body+40 -- [LOG] session-20260919-122616
// .jsonl ms 4742361, `b4fab8d5a9d0b6a1` = 測試房間. gate.game.dispatch.js
// decodes that with .toString('ascii') and toSafeAscii() below replaces
// every non-ASCII byte with '?' on the way back out, so a Big5 room name
// round-trips as garbage. Decoding/encoding with 'latin1' instead makes the
// bytes round-trip exactly (latin1 is 1 byte <-> 1 JS char, so the original
// Big5 byte sequence survives unchanged all the way to the wire) without
// this server understanding Big5 itself -- only the console/log helper
// below actually decodes it, for readability.
// `let` + accessor (same pattern as room-map.sender.js's
// mapAllSingleEntryMode) so tests can flip it on for their own run without
// touching the shipped default. OFF by default: no byte written to the wire
// changes while this stays 'disabled'.
let roomNameRawBytesMode = 'disabled'; // 'disabled' | 'enabled'

function isRoomNameRawBytesEnabled() {
    return roomNameRawBytesMode === 'enabled';
}

function _setRoomNameRawBytesModeForTests(mode) {
    roomNameRawBytesMode = mode;
}

function toSafeAscii(value) {
    const source = String(value ?? '');
    let result = '';
    for (const character of source) {
        if (result.length >= ROOM_STRING_MAX_CHARS) break;
        const codePoint = character.codePointAt(0);
        result += codePoint <= 0x7F ? character : '?';
    }
    return result;
}

// ROOMNAME-BIG5: decodes a Create_CQ name/password byte range. 'latin1'
// keeps every byte value intact (unlike 'ascii', which Node treats as
// 7-bit and masks the high bit off, corrupting Big5's lead bytes); the
// disabled path is unchanged ('ascii', same as the two inline call sites in
// gate.game.dispatch.js before this switch existed).
function decodeAnsiBytes(buffer) {
    const encoding = isRoomNameRawBytesEnabled() ? 'latin1' : 'ascii';
    return buffer.toString(encoding).split('\0').shift();
}

// ROOMNAME-BIG5: best-effort Big5 decode for console/log readability only --
// never written to the wire. Requires a full-ICU Node build (verified
// available: Node 24.21.0 in this worktree, `new TextDecoder('big5')`
// round-tripped session-20260919-122616.jsonl's `b4fab8d5a9d0b6a1` back to
// 測試房間). Falls back to null (caller prints nothing extra) if the
// runtime lacks the 'big5' decoder or the bytes are not valid Big5, so the
// hex/ascii dump this project already prints for unknown data never
// disappears.
function decodeBig5ForLog(value) {
    if (!isRoomNameRawBytesEnabled()) return null;
    try {
        const bytes = Buffer.from(String(value ?? ''), 'latin1');
        return new TextDecoder('big5', { fatal: true }).decode(bytes);
    } catch {
        return null;
    }
}

function writeAnsiStringField(buffer, value, offset, fieldSize) {
    buffer.fill(0, offset, offset + fieldSize);
    if (isRoomNameRawBytesEnabled()) {
        // ROOMNAME-BIG5: write the exact bytes back out with 'latin1'
        // (1 byte per JS char, so this is the inverse of decodeAnsiBytes
        // above). Reserve the last byte of the field as the NUL terminator,
        // same contract writeAnsiStringField already had (buffer.fill(0, ...)
        // above zero-fills the field first).
        const raw = String(value ?? '');
        const maxBytes = Math.max(0, fieldSize - 1);
        const byteLen = Math.min(raw.length, maxBytes);
        buffer.write(raw, offset, byteLen, 'latin1');
        return;
    }
    const ascii = toSafeAscii(value);
    buffer.write(ascii, offset, Math.min(ascii.length, fieldSize), 'ascii');
}

// ROOMNAME-BIG5: Room_List_SN's room-name field (see room-list.sender.js) is
// length-prefixed, not fixed-width -- no buffer/offset/fieldSize to zero-
// fill, just "how many bytes, which encoding". Mirrors writeAnsiStringField's
// switch so both wire sites agree byte-for-byte when the mode is enabled.
// maxBytes is that field's u8 length prefix ceiling (0xFF).
function toRoomNameWireBytes(value, maxBytes) {
    if (isRoomNameRawBytesEnabled()) {
        const raw = String(value ?? '');
        const text = raw.length > maxBytes ? raw.slice(0, maxBytes) : raw;
        return { text, encoding: 'latin1' };
    }
    const ascii = toSafeAscii(value);
    const text = ascii.length > maxBytes ? ascii.slice(0, maxBytes) : ascii;
    return { text, encoding: 'ascii' };
}

module.exports = {
    ROOM_STRING_ANSI_MODE,
    writeAnsiStringField,
    // D1-4: Room_List_SN's room-name field is length-prefixed (no fixed
    // field width to pad to), so it needs the ASCII-clamp logic without
    // writeAnsiStringField's fixed-width zero-fill. Exporting the existing
    // helper rather than duplicating it.
    toSafeAscii,
    // ROOMNAME-BIG5 additions:
    isRoomNameRawBytesEnabled,
    _setRoomNameRawBytesModeForTests,
    decodeAnsiBytes,
    decodeBig5ForLog,
    toRoomNameWireBytes,
};
