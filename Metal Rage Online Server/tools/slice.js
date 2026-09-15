#!/usr/bin/env node
//
// Reads a packet recording produced by packetlog.js and cuts it down to the
// part you care about — normally "everything between the moment I pressed a
// button and the moment I pressed the next one".
//
// Usage:
//   node tools/slice.js                          list recorded sessions
//   node tools/slice.js <file>                   markers + opcode summary
//   node tools/slice.js <file> -m 2              window after marker 2
//   node tools/slice.js <file> -m 2 -s           just the opcode counts for it
//   node tools/slice.js <file> --from 1000 --to 5000     window by ms
//   node tools/slice.js <file> --op 0x00250102   only that opcode
//   node tools/slice.js <file> --unhandled       only messages nothing handled
//   node tools/slice.js <file> --dump            hex as an offset dump
//
// Filters combine. Every filter narrows; none of them alter the recording.

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');

function listSessions()
{
    if (!fs.existsSync(LOG_DIR))
    {
        console.log(`No recordings yet (${LOG_DIR} does not exist). Start the server first.`);
        return;
    }

    const files = fs.readdirSync(LOG_DIR).filter(f => f.endsWith('.jsonl')).sort();
    if (files.length === 0)
    {
        console.log('No recordings yet. Start the server first.');
        return;
    }

    console.log('Recorded sessions:\n');
    for (const f of files)
    {
        const full = path.join(LOG_DIR, f);
        const stat = fs.statSync(full);
        const rows = read(full);
        const pkts = rows.filter(r => r.ev === 'pkt').length;
        const marks = rows.filter(r => r.ev === 'marker').length;
        const unh = rows.filter(r => r.ev === 'unhandled').length;
        const fbk = rows.filter(r => r.ev === 'fallback').length;
        console.log(`  ${f}`);
        console.log(`      ${(stat.size / 1024).toFixed(1)} KB · ${pkts} packets · ${marks} markers · ${unh} unhandled · ${fbk} fallback`);
    }
    console.log(`\nInspect one with:  node tools/slice.js ${files[files.length - 1]}`);
}

function read(file)
{
    const rows = [];
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split('\n'))
    {
        if (line.trim().length === 0)
            continue;
        try { rows.push(JSON.parse(line)); }
        catch { /* a half-written final line after a hard kill; ignore it */ }
    }
    return rows;
}

function resolveFile(arg)
{
    const candidates = [arg, path.join(LOG_DIR, arg)];
    for (const c of candidates)
        if (fs.existsSync(c) && fs.statSync(c).isFile())
            return c;
    console.error(`No such recording: ${arg}`);
    process.exit(1);
}

function ms(v) { return (v / 1000).toFixed(3).padStart(9) + 's'; }

function hexDump(hex)
{
    const out = [];
    for (let i = 0; i < hex.length; i += 32)
    {
        const chunk = hex.slice(i, i + 32);
        const bytes = chunk.match(/.{1,2}/g) || [];
        const ascii = bytes.map(b => {
            const c = parseInt(b, 16);
            return (c >= 0x20 && c < 0x7f) ? String.fromCharCode(c) : '.';
        }).join('');
        const grouped = bytes.join(' ').padEnd(47);
        out.push(`        ${(i / 2).toString(16).padStart(4, '0')}  ${grouped}  |${ascii}|`);
    }
    return out.join('\n');
}

function ctxString(ctx)
{
    if (!ctx) return '';
    const keys = Object.keys(ctx);
    if (keys.length === 0) return '';
    return keys.map(k => `${k}=${ctx[k]}`).join(' ');
}

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help')
{
    if (argv.length === 0) listSessions();
    else console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 22).join('\n'));
    process.exit(0);
}

const file = resolveFile(argv[0]);
const opt = { marker: null, from: null, to: null, op: null, unhandled: false, summary: false, dump: false };

for (let i = 1; i < argv.length; i++)
{
    const a = argv[i];
    if (a === '-m' || a === '--marker') opt.marker = parseInt(argv[++i], 10);
    else if (a === '--from') opt.from = parseInt(argv[++i], 10);
    else if (a === '--to') opt.to = parseInt(argv[++i], 10);
    else if (a === '--op') opt.op = argv[++i].toLowerCase();
    else if (a === '--unhandled') opt.unhandled = true;
    else if (a === '-s' || a === '--summary') opt.summary = true;
    else if (a === '--dump') opt.dump = true;
    else { console.error(`Unknown option: ${a}`); process.exit(1); }
}

const rows = read(file);
const markers = rows.filter(r => r.ev === 'marker');

// --------------------------------------------------- no filter: show the map

const noFilter = opt.marker === null && opt.from === null && opt.to === null
              && opt.op === null && !opt.unhandled;

if (noFilter && !opt.summary)
{
    const pkts = rows.filter(r => r.ev === 'pkt');
    const unh = rows.filter(r => r.ev === 'unhandled');
    console.log(`${path.basename(file)}`);
    const fbk = rows.filter(r => r.ev === 'fallback');
    console.log(`${pkts.length} packets · ${markers.length} markers · ${unh.length} unhandled · `
              + `${fbk.length} fallback · ${rows.filter(r => r.ev === 'connect').length} connections\n`);

    if (markers.length === 0)
    {
        console.log('No markers in this recording.');
        console.log('Next time, type what you are about to do into the server console');
        console.log('and press Enter before doing it in the client.\n');
    }
    else
    {
        console.log('Markers:');
        markers.forEach((m, i) => {
            const next = markers[i + 1];
            const within = rows.filter(r => r.ev === 'pkt' && r.ms >= m.ms && (!next || r.ms < next.ms));
            const src = m.src && m.src !== 'console' ? `${m.src}` : 'typed';
            console.log(`  [${i}] ${ms(m.ms)}  ${String('[' + src + ']').padEnd(8)} ${m.text}   (${within.length} packets follow)`);
        });
        console.log(`\nSlice one with:  node tools/slice.js ${path.basename(file)} -m 0`);
    }

    const counts = new Map();
    for (const p of pkts)
        counts.set(p.dir + ' ' + p.op, (counts.get(p.dir + ' ' + p.op) || 0) + 1);
    console.log('\nOpcodes seen:');
    [...counts.entries()].sort((a, b) => b[1] - a[1])
        .forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));

    if (unh.length > 0)
    {
        const u = new Map();
        for (const r of unh) u.set(r.op, (u.get(r.op) || 0) + 1);
        console.log('\nUnhandled (nothing claimed these):');
        [...u.entries()].sort((a, b) => b[1] - a[1])
            .forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));
    }

    if (fbk.length > 0)
    {
        const u = new Map();
        for (const r of fbk) u.set(r.op, (u.get(r.op) || 0) + 1);
        console.log('\nFallback (claimed, but nothing understood them — these are the ones to chase):');
        [...u.entries()].sort((a, b) => b[1] - a[1])
            .forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));
    }
    process.exit(0);
}

// ------------------------------------------------------------------- window

let lo = -Infinity, hi = Infinity, title = 'whole recording';

if (opt.marker !== null)
{
    const m = markers[opt.marker];
    if (!m) { console.error(`No marker [${opt.marker}]; recording has ${markers.length}.`); process.exit(1); }
    const next = markers[opt.marker + 1];
    lo = m.ms;
    hi = next ? next.ms : Infinity;
    title = `marker [${opt.marker}] "${m.text}"` + (next ? ` → [${opt.marker + 1}] "${next.text}"` : ' → end');
}
if (opt.from !== null) { lo = Math.max(lo === -Infinity ? opt.from : lo, opt.from); title = `from ${opt.from}ms`; }
if (opt.to !== null) { hi = Math.min(hi === Infinity ? opt.to : hi, opt.to); title += ` to ${opt.to}ms`; }

let sel = rows.filter(r => r.ms >= lo && r.ms < hi);
if (opt.unhandled) sel = sel.filter(r => r.ev === 'unhandled' || r.ev === 'fallback');
if (opt.op) sel = sel.filter(r => r.ev !== 'pkt' || r.op.toLowerCase() === opt.op);

console.log(`${path.basename(file)} — ${title}\n`);

if (opt.summary)
{
    const counts = new Map();
    for (const r of sel.filter(r => r.ev === 'pkt'))
    {
        const k = r.dir + ' ' + r.op;
        counts.set(k, (counts.get(k) || 0) + 1);
    }
    if (counts.size === 0) console.log('  (no packets in this window)');
    [...counts.entries()].sort((a, b) => b[1] - a[1])
        .forEach(([k, v]) => console.log(`  ${String(v).padStart(5)}  ${k}`));
    process.exit(0);
}

let last = null;
for (const r of sel)
{
    switch (r.ev)
    {
        case 'marker':
        {
            const src = r.src && r.src !== 'console' ? ` (${r.src})` : '';
            console.log(`\n${ms(r.ms)}  ======== ${r.text}${src} ========\n`);
            break;
        }

        case 'connect':
            console.log(`${ms(r.ms)}  ++ conn ${r.conn} on port ${r.port} from ${r.peer}`);
            break;

        case 'close':
            console.log(`${ms(r.ms)}  -- conn ${r.conn} closed (${r.server}, ${r.remaining} left)`);
            break;

        case 'unhandled':
            console.log(`${ms(r.ms)}  !! UNHANDLED ${r.op} (${r.len}b) on ${r.server}`);
            if (r.len > 0) console.log(opt.dump ? hexDump(r.hex) : `        ${r.hex}`);
            break;

        case 'fallback':
            console.log(`${ms(r.ms)}  ?? FALLBACK  ${r.op} (${r.len}b) — ${r.server} replied `
                      + `${r.replied ? r.replied + ' (empty EVENT_INFO)' : 'nothing'}, meaning unknown`);
            if (r.len > 0) console.log(opt.dump ? hexDump(r.hex) : `        ${r.hex}`);
            break;

        case 'pkt':
        {
            const arrow = r.dir === 'recv' ? 'C-->S' : 'S-->C';
            const tag = r.route === 'internal' ? ' [internal]' : '';
            console.log(`${ms(r.ms)}  ${arrow} ${r.op} (${r.len}b)${tag}`);

            const ctx = ctxString(r.ctx);
            if (ctx && ctx !== last) { console.log(`        ctx: ${ctx}`); last = ctx; }
            if (r.len > 0) console.log(opt.dump ? hexDump(r.hex) : `        ${r.hex}`);
            break;
        }
    }
}
