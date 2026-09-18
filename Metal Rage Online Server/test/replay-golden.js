/**
 * replay-golden.js - Byte-exact dispatch regression harness (A6).
 * =================================================================
 * Feeds a golden sample's recorded client->server (recv) packets straight
 * into the real dispatch/*.js handler chain -- no TCP socket, no live
 * server, no real MySQL -- and compares every packet the handlers send back
 * against a previously captured baseline.
 *
 * WHAT "GOLDEN" MEANS HERE (read this before trusting a PASS):
 *   The recv packets in test/golden/<name>/recv.jsonl are real bytes the
 *   client sent, sliced out of a real session-*.jsonl log (see
 *   extract-golden.js). That part is real evidence.
 *
 *   The expected.jsonl each sample is compared against is NOT what the
 *   server actually sent during that historical session. This harness has
 *   no access to the MySQL state the server had at that moment (no DB
 *   credentials in this sandbox, and the task forbids touching the real
 *   `mro` database regardless), and that state has since drifted (money,
 *   items, records). So expected.jsonl is a snapshot captured once, with
 *   `--record`, against the fixture account in test/fixtures/fake-db.js, at
 *   a specific commit. From then on this tool checks "does the same input
 *   still produce the same output", which catches accidental changes to
 *   packet layout/order/opcode from refactors -- it does NOT prove the
 *   original live session replays byte-identical, because that would need
 *   the real historical DB row. See docs/backlog.md A6 report for the
 *   options this was weighed against.
 *
 * Usage:
 *   node test/replay-golden.js                 # run every sample, compare
 *   node test/replay-golden.js <name>           # run one sample, compare
 *   node test/replay-golden.js --record <name>  # (re)capture the baseline
 *   node test/replay-golden.js --record-all     # (re)capture every sample
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const GOLDEN_DIR = path.join(__dirname, 'golden');

const { makeFixtureDb } = require('./fixtures/fake-db.js');
const { makeFakeClient } = require('./fixtures/fake-client.js');
const { installFakeTimers } = require('./fixtures/fake-timers.js');

const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));

/**
 * Replaces database/db.js in the module cache with a fresh fixture, and
 * drops every dispatch module so module-level state (e.g. nextRoomIndex in
 * gate.game.dispatch.js) starts clean for this sample, matching a freshly
 * started server rather than carrying state from a previous sample's run.
 */
function resetModulesWithFixtureDb(fixtureDb)
{
    const dbModule = new Module(DB_PATH, null);
    dbModule.filename = DB_PATH;
    dbModule.loaded = true;
    dbModule.exports = fixtureDb;
    require.cache[DB_PATH] = dbModule;

    const dispatchDir = path.join(ROOT, 'dispatch') + path.sep;
    for (const file of Object.keys(require.cache))
    {
        if (file === DB_PATH) continue;
        if (file.startsWith(dispatchDir) ||
            file === path.join(ROOT, 'dispatch.js') ||
            file === path.join(ROOT, 'game.js'))
        {
            delete require.cache[file];
        }
    }
}

function loadServicesForPort(port)
{
    if (port === 9211) return require(path.join(ROOT, 'dispatch.js'));
    if (port === 30907) return require(path.join(ROOT, 'game.js'));
    throw new Error(`replay-golden: no service list for port ${port}`);
}

/** Lets any already-scheduled microtasks/promise chains finish. Does not
 * touch setTimeout -- fake-timers.js owns that -- so this is safe to call
 * as many times as needed. */
async function flushMicrotasks(rounds = 10)
{
    for (let i = 0; i < rounds; ++i)
        await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Runs every microtask and every fake timer to completion, in the order the
 * real event loop would (timer callbacks may themselves schedule more
 * microtasks or timers; this keeps going until both queues are empty for a
 * full round). Used both between recv packets (room create schedules a
 * resend via setTimeout -- see gate.game.dispatch.js ROOM_STATE_RETRY_SCHEDULE)
 * and once at the end of a sample.
 */
async function drainAll(timers)
{
    for (let iterations = 0; iterations < 1000; ++iterations)
    {
        await flushMicrotasks();
        if (timers.hasPending())
        {
            timers.fireNext();
            continue;
        }
        break;
    }
}

async function replaySample(name)
{
    const dir = path.join(GOLDEN_DIR, name);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf-8'));
    const recvLines = fs.readFileSync(path.join(dir, 'recv.jsonl'), 'utf-8')
        .split('\n').filter(l => l.trim());
    const recv = recvLines.map(l => JSON.parse(l));

    const fixtureDb = makeFixtureDb();
    resetModulesWithFixtureDb(fixtureDb);
    const services = loadServicesForPort(meta.port);
    const client = makeFakeClient(meta.connId, meta.port);
    const timers = installFakeTimers();

    try
    {
        for (const pkt of recv)
        {
            const type = parseInt(pkt.op, 16);
            const body = Buffer.from(pkt.hex, 'hex');

            let handled = false;
            for (const service of services)
            {
                if (service.dispatch(client, type, body))
                {
                    handled = true;
                    break;
                }
            }
            if (!handled)
            {
                // Do not silently drop it -- same rule as the real server's
                // unhandled-message hex dump (AGENTS.md). A golden sample whose
                // recv packets are no longer all handled is itself a finding.
                console.warn(`[replay-golden][${name}] UNHANDLED recv op=${pkt.op} len=${body.length} hex=${pkt.hex}`);
            }

            await drainAll(timers);
        }
        await drainAll(timers);
    }
    finally
    {
        timers.restore();
    }

    return { client, fixtureDb };
}

function diffHex(expectedHex, actualHex)
{
    const len = Math.min(expectedHex.length, actualHex.length);
    for (let i = 0; i < len; i += 2)
    {
        if (expectedHex.substr(i, 2) !== actualHex.substr(i, 2))
        {
            const byteOffset = i / 2;
            const window = (hex, center) => {
                const start = Math.max(0, center - 8) * 2;
                const end = Math.min(hex.length, (center + 8) * 2);
                return hex.slice(start, end);
            };
            return {
                byteOffset,
                expectedByte: expectedHex.substr(i, 2),
                actualByte: actualHex.substr(i, 2),
                expectedWindow: window(expectedHex, byteOffset),
                actualWindow: window(actualHex, byteOffset),
            };
        }
    }
    if (expectedHex.length !== actualHex.length)
        return { byteOffset: len / 2, lengthMismatch: true };
    return null;
}

function compare(name, expected, actual)
{
    const n = Math.max(expected.length, actual.length);
    for (let i = 0; i < n; ++i)
    {
        const e = expected[i];
        const a = actual[i];

        if (!e)
            return { pass: false, index: i, reason: `actual has an extra packet: op=${a.op} len=${a.len}` };
        if (!a)
            return { pass: false, index: i, reason: `actual is missing a packet: expected op=${e.op} len=${e.len}` };
        if (e.op !== a.op)
            return { pass: false, index: i, reason: `opcode mismatch: expected ${e.op}, got ${a.op}` };
        if (e.len !== a.len)
            return { pass: false, index: i, reason: `length mismatch on op=${e.op}: expected ${e.len}, got ${a.len}` };
        if (e.hex !== a.hex)
        {
            const d = diffHex(e.hex, a.hex);
            return {
                pass: false, index: i,
                reason: `body mismatch on op=${e.op} at byte offset 0x${d.byteOffset.toString(16)}: `
                    + `expected .. ${d.expectedWindow} .., got .. ${d.actualWindow} ..`,
            };
        }
    }
    return { pass: true };
}

async function runOne(name, record)
{
    const dir = path.join(GOLDEN_DIR, name);
    const { client } = await replaySample(name);
    const actual = client._sent;

    if (record)
    {
        fs.writeFileSync(path.join(dir, 'expected.jsonl'), actual.map(p => JSON.stringify(p)).join('\n') + '\n');
        let commit = 'unknown';
        try { commit = require('child_process').execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch {}
        fs.writeFileSync(path.join(dir, 'expected.meta.json'), JSON.stringify({
            recordedAt: new Date().toISOString(),
            recordedAtCommit: commit,
            packetCount: actual.length,
        }, null, 2) + '\n');
        console.log(`[${name}] RECORDED ${actual.length} send packets -> ${path.join(dir, 'expected.jsonl')}`);
        return true;
    }

    const expectedPath = path.join(dir, 'expected.jsonl');
    if (!fs.existsSync(expectedPath))
    {
        console.log(`[${name}] NO BASELINE -- run with --record first`);
        return false;
    }
    const expected = fs.readFileSync(expectedPath, 'utf-8').split('\n').filter(l => l.trim()).map(l => JSON.parse(l));

    const result = compare(name, expected, actual);
    if (result.pass)
    {
        console.log(`[${name}] PASS (${actual.length} packets)`);
        return true;
    }

    console.log(`[${name}] FAIL at send #${result.index}: ${result.reason}`);
    return false;
}

async function main()
{
    const args = process.argv.slice(2);
    let record = false;
    let names = [];

    if (args[0] === '--record-all')
    {
        record = true;
        names = fs.readdirSync(GOLDEN_DIR).filter(f => fs.statSync(path.join(GOLDEN_DIR, f)).isDirectory());
    }
    else if (args[0] === '--record')
    {
        record = true;
        names = [args[1]];
    }
    else if (args.length === 1)
    {
        names = [args[0]];
    }
    else
    {
        names = fs.readdirSync(GOLDEN_DIR).filter(f => fs.statSync(path.join(GOLDEN_DIR, f)).isDirectory());
    }

    if (names.length === 0 || !names[0])
    {
        console.error('No golden samples found under test/golden/.');
        process.exit(1);
    }

    let allPass = true;
    for (const name of names)
    {
        const ok = await runOne(name, record);
        allPass = allPass && ok;
    }

    if (!record)
    {
        console.log(allPass ? '\nALL SAMPLES PASS' : '\nSOME SAMPLES FAILED');
        process.exit(allPass ? 0 : 1);
    }
}

main().catch((err) => {
    console.error('[replay-golden] fatal:', err);
    process.exit(1);
});
