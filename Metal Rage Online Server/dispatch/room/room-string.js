// R2 verified: the room-name path consumes ANSI/narrow input. This contradicts
// the old AGENTS.md note for 0x0022021A; the high-level owner will update it.
// Keep the switch shared so both room-state and room-user senders agree.
const ROOM_STRING_ANSI_MODE = 'enabled'; // 'disabled' | 'enabled'
const ROOM_STRING_MAX_CHARS = 25;

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

function writeAnsiStringField(buffer, value, offset, fieldSize) {
    buffer.fill(0, offset, offset + fieldSize);
    const ascii = toSafeAscii(value);
    buffer.write(ascii, offset, Math.min(ascii.length, fieldSize), 'ascii');
}

module.exports = {
    ROOM_STRING_ANSI_MODE,
    writeAnsiStringField,
};
