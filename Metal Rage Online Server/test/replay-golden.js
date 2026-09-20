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
// D1 step 0: auth-tokens.js hands out a crypto-random key on Gate Leave_SA
// 0x00220132 (dispatch/gate.dispatch.js). It is deliberately outside
// dispatch/ so a real /reload does not wipe it (see server.js
// reloadServices()), but that means it is NOT reset by
// resetModulesWithFixtureDb() below. Pin its generator here so a sample that
// reaches CQ_LEAVE records/compares a fixed key instead of a fresh random
// one every run -- see the setKeyGenerator() call in replaySample().
const authTokens = require(path.join(ROOT, 'auth-tokens.js'));

const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));
const ROOMS_PATH = require.resolve(path.join(ROOT, 'rooms.js'));
// D1-1 review fix: config/server.js and config/whitelist.js each read a
// per-operator, gitignored file from disk (config/server.json,
// config/allowed-users.json) the first time they are require()d, then cache
// the result for the life of the process (neither lives under dispatch/, so
// resetModulesWithFixtureDb's cache wipe below never touches them either).
// packetlog.js requires both at its own top level and keeps a direct
// reference, and packetlog.js itself is loaded once and never reset the
// same way. Net effect: this harness's output used to depend on whatever
// happens to be sitting in the operator's local config/ directory -- e.g.
// login-dispatch's SN_SERVER_ADD 0x00220101 body bakes in the literal
// '127.0.0.1' (config/server.js's pre-N1 default), and goes red if a real
// config/server.json with a different publicHost is present, even though
// nothing about the code under test changed. Pin both to fixed values here,
// the same require.cache-swap technique as DB_PATH, so a replay is
// deterministic regardless of local config files (test/whitelist.js already
// does this for config/whitelist.js on its own path; this applies the same
// fix here since this harness loads dispatch/account.dispatch.js too).
const CONFIG_SERVER_PATH = require.resolve(path.join(ROOT, 'config', 'server.js'));
const CONFIG_WHITELIST_PATH = require.resolve(path.join(ROOT, 'config', 'whitelist.js'));

function installFakeModule(resolvedPath, exportsObj)
{
    const mod = new Module(resolvedPath, null);
    mod.filename = resolvedPath;
    mod.loaded = true;
    mod.exports = exportsObj;
    require.cache[resolvedPath] = mod;
}

// Fixed publicHost -- matches config/server.js's own DEFAULT_PUBLIC_HOST,
// which is what every existing golden sample's expected.jsonl was captured
// against (no config/server.json in this repo/CI). pveExtraLives 0 matches
// config/server.js's own DEFAULT_PVE_EXTRA_LIVES for the same reason (LIVES,
// dispatch/room/room-game-user.sender.js); test/extra-lives.js exercises the
// non-default value directly instead of through this fixture. pveFixedRank
// undefined matches "not configured" (RANK, dispatch/lobby.dispatch.js);
// test/fixed-rank.js exercises the non-default value directly instead.
function makeFixtureServerConfig()
{
    return {
        getPublicHost() { return '127.0.0.1'; },
        getPveExtraLives() { return 0; },
        getPveFixedRank() { return undefined; },
    };
}

// Whitelist always off -- matches pre-W1 behaviour, what every existing
// golden sample was captured against (no config/allowed-users.json in this
// repo/CI).
//
// ISTEST-WIRE: gamelogin.dispatch.js's handleGameLogin() now also calls
// whitelist.isTestAccount() (same place it already reads username_). This
// fixture must stay a complete stand-in for the real module's shape -- a
// missing method here throws inside handleGameLogin's try/catch, silently
// falling back to hardcoded defaults instead of the fixture DB's real
// account data (caught the hard way: this broke the pve-full-match golden
// sample's SN_DEFAULT_INFO body until isTestAccount() was added here).
// getHostAddress() is included too even though no path this harness
// exercises currently calls it (HOST_ADDRESS_REQUIRE_MODE default is
// 'disabled', gate.game.dispatch.js/community.dispatch.js's own switch),
// for the same "stay a complete stand-in" reason.
function makeFixtureWhitelist()
{
    return {
        isAllowed() { return true; },
        status() { return 'off'; },
        getHostAddress() { return null; },
        isTestAccount() { return false; },
    };
}

/**
 * Replaces database/db.js in the module cache with a fresh fixture, and
 * drops every dispatch module so module-level state (e.g. nextRoomIndex in
 * gate.game.dispatch.js) starts clean for this sample, matching a freshly
 * started server rather than carrying state from a previous sample's run.
 *
 * D1 step 1: rooms.js deliberately lives outside dispatch/ (so a live
 * server's rooms survive a dispatch/ /reload -- see its header comment),
 * which means the dispatch-dir cache wipe below does not touch it. Call its
 * test-only _resetForTests() here instead, at the same "start of sample"
 * point, so each sample still gets a room registry that starts empty with
 * the room-id counter back at 1, same as before the counter moved out of
 * gate.game.dispatch.js and into rooms.js.
 */
function resetModulesWithFixtureDb(fixtureDb)
{
    const dbModule = new Module(DB_PATH, null);
    dbModule.filename = DB_PATH;
    dbModule.loaded = true;
    dbModule.exports = fixtureDb;
    require.cache[DB_PATH] = dbModule;

    // Must happen before the first require() of dispatch.js/game.js below
    // (and therefore before packetlog.js's own first load, which is what
    // actually reads these) -- resetModulesWithFixtureDb() always runs
    // ahead of loadServicesForPort() in replaySample(), including on the
    // very first sample, so this is early enough.
    installFakeModule(CONFIG_SERVER_PATH, makeFixtureServerConfig());
    installFakeModule(CONFIG_WHITELIST_PATH, makeFixtureWhitelist());

    const dispatchDir = path.join(ROOT, 'dispatch') + path.sep;
    for (const file of Object.keys(require.cache))
    {
        if (file === DB_PATH || file === CONFIG_SERVER_PATH || file === CONFIG_WHITELIST_PATH) continue;
        if (file.startsWith(dispatchDir) ||
            file === path.join(ROOT, 'dispatch.js') ||
            file === path.join(ROOT, 'game.js'))
        {
            delete require.cache[file];
        }
    }

    require(ROOMS_PATH)._resetForTests();
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
    // Each golden sample models an independent server run, so start
    // auth-tokens.js clean too and pin its key generator (see the top-of-file
    // comment) -- a fixed value keeps a sample that hits Gate Leave_SA
    // deterministic across --record and every later replay.
    authTokens.resetForTest();
    authTokens.setKeyGenerator(() => 0x11223344);
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
