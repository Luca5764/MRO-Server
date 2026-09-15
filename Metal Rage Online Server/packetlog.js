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
 * Records an operator marker, so a session can be sliced by "what I was doing".
 * @param {string} text
 */
function marker(text)
{
    write({ ev: 'marker', text });
    console.log(`[packetlog] --- MARKER: ${text} ---`);
}

/**
 * Reads marker text from stdin, one per line, while the server runs.
 * Silently does nothing when stdin is not an interactive terminal, so running
 * the server from a batch file or under a supervisor is unaffected.
 */
function listenForMarkers()
{
    if (!process.stdin.isTTY)
        return;

    open();
    console.log('[packetlog] Type a note + Enter at any time to drop a marker into the log.');

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
        for (const line of chunk.split('\n'))
        {
            const text = line.trim();
            if (text.length > 0)
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
    marker,
    listenForMarkers,
    currentPath,
};
