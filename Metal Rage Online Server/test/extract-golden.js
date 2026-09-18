/**
 * extract-golden.js - Slices one connection's dispatch-layer recv traffic out
 * of a real session-*.jsonl log into a golden sample under test/golden/.
 *
 * Only recv packets tagged route:'dispatch' are kept (system-layer messages
 * -- handshake/time-sync/keep-alive -- are handled inside client.js, which
 * this harness does not replay; see test/replay-golden.js header comment).
 * Expected send output is NOT copied from the source log: it is produced
 * separately by `node test/replay-golden.js --record <name>` against the
 * fixture DB, once, and becomes the new baseline. See fake-db.js for why.
 *
 * Usage:
 *   node test/extract-golden.js <source.jsonl> <connId> <outName> [--until <op>]
 *
 * --until <op> stops the slice right after including the first recv packet
 * matching that opcode (e.g. "0x00220234" to cut a sample off at Leave_CQ).
 * Without it the whole connection's dispatch-route recv traffic is taken.
 */

const fs = require('fs');
const path = require('path');

const [, , sourcePath, connIdArg, outName, ...rest] = process.argv;
let untilOp = null;
const untilIdx = rest.indexOf('--until');
if (untilIdx !== -1) untilOp = rest[untilIdx + 1];

if (!sourcePath || !connIdArg || !outName) {
    console.error('Usage: node test/extract-golden.js <source.jsonl> <connId> <outName> [--until <op>]');
    process.exit(1);
}

const connId = parseInt(connIdArg, 10);
const lines = fs.readFileSync(sourcePath, 'utf-8').split('\n');

let port = null;
const recv = [];

for (const line of lines) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.ev !== 'pkt' || e.conn !== connId) continue;
    if (port === null) port = e.port;
    if (e.dir !== 'recv') continue;
    if (e.route !== 'dispatch') continue; // system-layer, not replayed here
    recv.push({ op: e.op, hex: e.hex });
    if (untilOp && e.op === untilOp) break;
}

if (recv.length === 0) {
    console.error(`No dispatch-route recv packets found for conn ${connId} in ${sourcePath}`);
    process.exit(1);
}

const outDir = path.join(__dirname, 'golden', outName);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'recv.jsonl'), recv.map(r => JSON.stringify(r)).join('\n') + '\n');
fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify({
    source: path.basename(sourcePath),
    connId,
    port,
    extractedAt: new Date().toISOString(),
}, null, 2) + '\n');

console.log(`Wrote ${recv.length} recv packets to ${outDir} (port ${port})`);
console.log('Next: node test/replay-golden.js --record ' + outName);
