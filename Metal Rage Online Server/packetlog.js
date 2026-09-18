const fs = require('fs');
const path = require('path');

// Structured packet recorder.
//
// The console output of this server is the primary research instrument, but it
// is scattered across ~190 console.log calls in 14 files and carries no
// timestamps, no connection identity and no scene context. That makes it fine
// for watching a session live and nearly useless for answering the question
// this project actually asks: "I pressed fire in the client — what went over
// the wire, in what order, and what state was the connection in at the time?"
//
// This module records every framed message, in both directions, as one JSON
// object per line, alongside the existing console output rather than replacing
// it. Nothing here changes what the server sends; if this file is deleted the
// server still runs, it just stops remembering.
//
// Writes are synchronous by design. The most valuable packet in any session is
// usually the last one before the client crashes or the server is killed, which
// is exactly the packet a buffered stream loses.

const LOG_DIR = path.join(__dirname, 'logs');

// Chat send, observed 2026-09-15: body is 0x102 bytes, two leading bytes then
// a Big5/cp950 string, NUL-padded. Not UTF-16LE — room names are, chat is not.
//
// Each chat channel has its own opcode with the same body layout. Only the two
// below are confirmed, both by decoding them and reading back exactly what the
// operator had just typed. Others almost certainly exist — whisper, clan, team
// — and they are deliberately not guessed at here: an unlisted channel simply
// produces no marker, which is how 0x00220505 was found in the first place.
//
// Chat doubles as the marker channel. Typing a note into the server console
// means alt-tabbing out of a fullscreen game at the exact moment something
// interesting is happening, which is the moment you least want to. Typing it
// into the game's own chat box costs nothing and lands in the same timeline,
// two bytes away from the packets it describes.
const CHAT_CQ = new Map([
    [0x00220501, 'lobby'],
    [0x00220505, 'room'],
]);
const CHAT_TEXT_OFFSET = 0x2;

// Sends that mark the boundaries of a combat session. The operator cannot type
// a marker mid-fight — that is exactly when they are busy — so the server marks
// these itself and the window brackets itself.
const AUTO_MARK_SEND = new Map([
    [0x00250203, 'Ready_Host_SQ sent — asking client to ready up'],
    [0x00250201, 'Ready_Success_SN sent'],
    [0x00250301, 'BeginRound_SN sent — COMBAT STARTS HERE'],
    [0x00240302, 'Game_Start_SA sent'],
    [0x00222104, 'Game_Start_SN sent'],
]);

let big5 = null;
try { big5 = new TextDecoder('big5'); } catch { /* no ICU: chat stays raw hex */ }

/**
 * Decodes a chat body, or returns null if it does not look like one.
 * @param {Buffer} body
 * @returns {string|null}
 */
function decodeChat(body)
{
    if (big5 === null || body.length <= CHAT_TEXT_OFFSET)
        return null;

    const raw = body.subarray(CHAT_TEXT_OFFSET);
    const end = raw.indexOf(0);
    const text = big5.decode(end === -1 ? raw : raw.subarray(0, end)).trim();

    return text.length > 0 ? text : null;
}

// Per-client scene state worth carrying on every record. These are set ad hoc by
// the dispatch handlers; anything undefined is simply omitted from the record.
const CONTEXT_FIELDS = [
    'accountId_',
    'nickname_',
    'roomIndex_',
    'roomType_',
    'mapId_',
    'gameMode_',
    'gameStarted_',
    'campaignStarted_',
    'isTrueCampaign_',
    'currentHangarSlot_',
];

let fd = null;
let logPath = null;
let connCounter = 0;
let startedAt = 0;

function stamp(d)
{
    const p = (n, w = 2) => String(n).padStart(w, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
         + `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function open()
{
    if (fd !== null)
        return;

    fs.mkdirSync(LOG_DIR, { recursive: true });

    startedAt = Date.now();
    logPath = path.join(LOG_DIR, `session-${stamp(new Date(startedAt))}.jsonl`);
    fd = fs.openSync(logPath, 'a');

    console.log(`[packetlog] Recording to ${logPath}`);

    write({ ev: 'session', note: 'recording started', pid: process.pid });
}

function write(entry)
{
    if (fd === null)
        open();

    const now = Date.now();
    const line = JSON.stringify(Object.assign({
        t: new Date(now).toISOString(),
        ms: now - startedAt,
    }, entry));

    try {
        fs.writeSync(fd, line + '\n');
    } catch (err) {
        // Recording must never be the reason the server dies.
        console.log(`[packetlog] write failed: ${err.message}`);
    }
}

/**
 * Snapshots the scene context of a client, skipping fields never set.
 * @param {object} client
 * @returns {object}
 */
function context(client)
{
    const ctx = {};
    for (const field of CONTEXT_FIELDS)
    {
        const value = client[field];
        if (value !== undefined && value !== null)
            ctx[field.replace(/_$/, '')] = value;
    }
    return ctx;
}

/**
 * Allocates a connection id, so records from concurrent clients can be
 * separated after the fact.
 * @returns {number}
 */
function nextConnId()
{
    open();
    return ++connCounter;
}

/**
 * Records a connection-level event (connect / close).
 */
function connection(ev, conn, fields)
{
    write(Object.assign({ ev, conn }, fields));
}

/**
 * Records one framed message.
 * @param {string} dir - 'recv' or 'send'
 * @param {object} client - The NetworkClient the message belongs to
 * @param {number} type - Opcode
 * @param {Buffer} body - Message body, excluding the 16-byte header
 * @param {object} [fields] - Extra fields (route, handled, ...)
 */
function packet(dir, client, type, body, fields)
{
    // A chat line is also a marker, so it appears in both roles: as the packet
    // it is, and as an annotation on the packets around it.
    if (dir === 'recv' && CHAT_CQ.has(type))
    {
        const text = decodeChat(body);
        if (text !== null)
        {
            const channel = CHAT_CQ.get(type);
            write({ ev: 'marker', text, src: 'chat', channel, conn: client.connId_ });
            console.log(`[packetlog] --- MARKER (chat/${channel}): ${text} ---`);
        }
    }

    if (dir === 'send' && AUTO_MARK_SEND.has(type))
        marker(AUTO_MARK_SEND.get(type), 'auto');

    write(Object.assign({
        ev: 'pkt',
        conn: client.connId_,
        port: client.socket_ && client.socket_.localPort,
        dir,
        op: '0x' + (type >>> 0).toString(16).padStart(8, '0'),
        len: body.length,
        hex: body.toString('hex'),
        ctx: context(client),
    }, fields));
}

/**
 * Records that a dispatch answered a message it does not understand.
 *
 * Every dispatch claims a whole opcode namespace and ends in a default branch
 * that replies to odd opcodes with an empty EVENT_INFO and to even ones with
 * nothing at all. Both cases return true, so server.js never reports them as
 * unhandled, and the recording cannot tell them apart from real handling.
 *
 * The silent case is worse than invisible: the client sits waiting for an
 * answer that is never coming. That is how the 0x00220234 hang was found —
 * the client froze on a loading screen while the log looked entirely normal.
 *
 * @param {object} client
 * @param {string} tag - Which dispatch claimed it
 * @param {number} type - Opcode
 * @param {Buffer} body
 * @param {number|null} [repliedType] - What was sent back, or null for nothing
 */
function fallback(client, tag, type, body, repliedType = null)
{
    const hex = (n) => '0x' + (n >>> 0).toString(16).padStart(8, '0');

    connection('fallback', client.connId_, {
        server: tag,
        op: hex(type),
        len: body.length,
        hex: body.toString('hex'),
        replied: repliedType === null ? null : hex(repliedType),
    });

    if (repliedType === null)
        console.log(`[packetlog] !! ${tag} answered NOTHING to ${hex(type)} — the client may hang waiting for a reply`);
}

/**
 * Records a marker, so a session can be sliced by what was happening.
 * @param {string} text
 * @param {string} [src] - 'console' (typed), 'chat' (in-game), 'auto' (server)
 */
function marker(text, src = 'console')
{
    write({ ev: 'marker', text, src });
    console.log(`[packetlog] --- MARKER${src === 'console' ? '' : ` (${src})`}: ${text} ---`);
}

/**
 * Reads marker text from stdin, one per line, while the server runs.
 * Silently does nothing when stdin is not an interactive terminal, so running
 * the server from a batch file or under a supervisor is unaffected.
 */
function listenForMarkers(commands = {})
{
    if (!process.stdin.isTTY)
        return;

    open();
    console.log('[packetlog] Type a note + Enter at any time to drop a marker into the log.');
    for (const name of Object.keys(commands))
        console.log(`[packetlog] Command: ${name}`);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
        for (const line of chunk.split('\n'))
        {
            const text = line.trim();
            if (commands[text])
                commands[text]();
            else if (text.length > 0)
                marker(text);
        }
    });
    process.stdin.on('error', () => {});
}

function currentPath()
{
    open();
    return logPath;
}

module.exports = {
    nextConnId,
    connection,
    packet,
    fallback,
    marker,
    listenForMarkers,
    currentPath,
};
