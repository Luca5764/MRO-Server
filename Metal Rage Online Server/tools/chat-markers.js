#!/usr/bin/env node
//
// Prints every chat line in a recording as a marker, including the channels
// packetlog.js does not turn into markers itself.
//
// packetlog.js only marks lobby (0x00220501) and room (0x00220505) chat. The
// in-game chat box uses 0x00220507 (Team) / 0x00220509 (All), and during a
// match that is the only chat box the operator can reach — so exactly the
// notes typed while something interesting was happening were the ones missing
// from the marker list (2026-09-20, projectile test). The packets were always
// recorded in full; only the marker line was absent. This reads them back out
// of the recording, so the fix to CHAT_CQ can wait for a restart that does not
// interrupt a live test.
//
// Usage:
//   node tools/chat-markers.js                 newest recording, all chat
//   node tools/chat-markers.js <file>          that recording
//   node tools/chat-markers.js -f              follow the newest recording
//   node tools/chat-markers.js --auto          also show the server's own markers
//
// Times are the recording's own UTC timestamps, shown as HH:MM:SS.

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const CHAT_TEXT_OFFSET = 0x2;

// Same layout for every channel: two leading bytes, then a NUL-terminated
// Big5 string. Names follow docs/client-dispatch-map.md.
const CHAT_OPS = new Map([
    ['0x00220501', 'lobby'],
    ['0x00220505', 'room'],
    ['0x00220503', 'room/team'],
    ['0x00220507', 'game/team'],
    ['0x00220509', 'game/all'],
]);

let big5 = null;
try { big5 = new TextDecoder('big5'); } catch { /* no ICU: fall back to latin1 */ }

function decodeChat(hex)
{
    const body = Buffer.from(hex || '', 'hex');
    if (body.length <= CHAT_TEXT_OFFSET)
        return null;

    const raw = body.subarray(CHAT_TEXT_OFFSET);
    const end = raw.indexOf(0);
    const cut = end === -1 ? raw : raw.subarray(0, end);
    const text = (big5 ? big5.decode(cut) : cut.toString('latin1')).trim();

    return text.length > 0 ? text : null;
}

function newestLog()
{
    const files = fs.readdirSync(LOG_DIR)
        .filter(f => f.startsWith('session-') && f.endsWith('.jsonl'))
        .map(f => path.join(LOG_DIR, f));

    if (files.length === 0)
        return null;

    // By mtime, not by name: a restart inside the same second, and a session
    // that was started earlier but is still being written to, both break the
    // assumption that the highest name is the live one.
    return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
}

function show(line, showAuto)
{
    let r;
    try { r = JSON.parse(line); } catch { return; }

    const at = typeof r.t === 'string' ? r.t.substr(11, 8) : '--:--:--';

    if (r.ev === 'marker' && showAuto && r.src !== 'chat')
    {
        console.log(`${at}  [${r.src || 'auto'}] ${r.text}`);
        return;
    }

    if (r.ev !== 'pkt' || r.dir !== 'recv')
        return;

    const channel = CHAT_OPS.get(r.op);
    if (!channel)
        return;

    const text = decodeChat(r.hex);
    if (text === null)
        return;

    console.log(`${at}  [${channel}] ${text}`);
}

function main()
{
    const args = process.argv.slice(2);
    const follow = args.includes('-f') || args.includes('--follow');
    const showAuto = args.includes('--auto');
    const file = args.find(a => !a.startsWith('-')) || newestLog();

    if (!file)
    {
        console.log(`No recordings in ${LOG_DIR}.`);
        return;
    }

    console.log(`# ${path.basename(file)}\n`);

    let size = 0;
    const flush = () =>
    {
        const stat = fs.statSync(file);
        if (stat.size <= size)
            return;

        const fd = fs.openSync(file, 'r');
        const buf = Buffer.alloc(stat.size - size);
        fs.readSync(fd, buf, 0, buf.length, size);
        fs.closeSync(fd);
        size = stat.size;

        for (const line of buf.toString('utf8').split('\n'))
            if (line) show(line, showAuto);
    };

    flush();

    if (follow)
        setInterval(flush, 1000);
}

main();
