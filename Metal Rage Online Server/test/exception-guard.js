'use strict';

// Backlog X1: proves the per-connection exception guard added in server.js
// (the try/catch around service.dispatch() in DispatchServer.onConnection())
// end-to-end, over a real TCP socket -- not a reimplementation of the logic
// being tested.
//
// This starts its own DispatchServer on an OS-assigned ephemeral port
// (server.listen(0, ...)), never 9211/30907, so it cannot collide with the
// real server the operator runs in tmux. The service under test is a
// throwaway, test-only fake -- no real dispatch/*.js handler is touched or
// modified to make this pass. server.js is `require()`d, not run, and its
// top-level bootstrap (binding the real ports, /reload, marker listener) is
// gated behind `require.main === module`, so requiring it here has no side
// effect beyond defining the DispatchServer class and the two process-level
// uncaughtException/unhandledRejection listeners.
//
// Run: node test/exception-guard.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const net = require('net');
const { DispatchServer } = require('../server.js');
const { make } = require('../message.js');

const MSG_DEFAULT_SALT = 0xf0f00f0f;

// Test-only opcodes -- not in docs/client-dispatch-map.md, never sent by the
// real client, never read by a real dispatch/*.js file.
const TEST_FAULT_OP = 0x00ee0001;
const TEST_OK_OP = 0x00ee0002;

class FaultInjectingService
{
    dispatch(client, type, body)
    {
        if (type === TEST_FAULT_OP)
            throw new Error('X1 test fault: intentional throw from injected test service');
        if (type === TEST_OK_OP)
            return true;
        return false;
    }
}

function connectRaw(port)
{
    return new Promise((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1');
        socket.once('connect', () => resolve(socket));
        socket.once('error', reject);
    });
}

// Builds and sends one framed message exactly like a real client would --
// reuses message.js's own pack/CRC, not a hand-rolled copy of it. Since the
// handshake (MSG_HANDSHAKE) is never sent, NetworkClient's salt_ stays at
// MSG_DEFAULT_SALT the whole time, so this can be computed up front.
function sendFrame(socket, type, bodyHex = '')
{
    const body = Buffer.from(bodyHex, 'hex');
    socket.write(make(body, type, MSG_DEFAULT_SALT));
}

function waitEvent(emitter, event, timeoutMs = 2000)
{
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`timed out waiting for '${event}'`)), timeoutMs);
        emitter.once(event, (...args) => { clearTimeout(timer); resolve(args); });
    });
}

function sleep(ms)
{
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main()
{
    const server = new DispatchServer('X1-TestServer', 0, [new FaultInjectingService()]);
    await new Promise((resolve) => {
        server.server.once('listening', resolve);
        server.start();
    });
    const port = server.server.address().port;
    console.log(`[exception-guard] test server on 127.0.0.1:${port} (pid ${process.pid})`);

    // --- Connection A: sends the opcode the fake service throws on. -------
    // Expect: the socket gets dropped (server.js's catch -> onDispatchException
    // -> client.socket_.destroy()), and the process itself keeps running.
    const a = await connectRaw(port);
    sendFrame(a, TEST_FAULT_OP);
    await waitEvent(a, 'close');
    console.log('[exception-guard] PASS: connection A was dropped after its handler threw');

    // --- Connection B: independent, connects and sends *after* A's crash. -
    // If the listener or the process had gone down, this would hang or the
    // connect itself would fail.
    const b = await connectRaw(port);
    let bClosedEarly = false;
    b.once('close', () => { bClosedEarly = true; });
    sendFrame(b, TEST_OK_OP);
    await sleep(300);
    assert.strictEqual(bClosedEarly, false,
        "connection B should be unaffected by connection A's exception");
    b.destroy();
    console.log("[exception-guard] PASS: unrelated connection B kept working after A's exception");

    server.server.close();
    console.log('[exception-guard] ALL CHECKS PASS -- process is still alive');
    process.exit(0);
}

main().catch((err) => {
    console.error('[exception-guard] FAIL:', err);
    process.exit(1);
});
