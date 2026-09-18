'use strict';

// Backlog K2: exercises the two pieces added for manual reconnect testing
// (D1 step 0 -- does Login_Again_CQ 0x00110124 keep the same accountId+key
// across a reconnect?) without opening any socket or requiring server.js.
//
// Two independent things, tested separately:
//   1. packetlog.js's listenForMarkers() command dispatch: `/reload` (no
//      args) still calls its function with no meaningful argument, `/drop 3`
//      calls its function with the argument text "3", and plain text with no
//      matching first token still falls through to marker().
//   2. The account-matching logic that `/drop <accountId>` in server.js uses
//      to destroy exactly one client's socket -- reimplemented here against
//      a fake `clients` array (server.js's dropAccount() is a closure over
//      real DispatchServer instances, not something this test can require in
//      isolation without binding real ports; this checks the same
//      `.find(client => Number(client.accountId_) === accountId)` shape that
//      function uses).
//
// Run: node test/console-commands.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');

function testMarkerCommandDispatch()
{
    // Load a fresh copy of packetlog.js so this test's LOG_DIR-touching
    // open() (triggered lazily by listenForMarkers) does not interfere with
    // any other test's require.cache entry.
    delete require.cache[require.resolve('../packetlog.js')];
    const packetlog = require('../packetlog.js');

    // listenForMarkers() returns immediately (no-ops) unless stdin is a TTY.
    // Fake that for the duration of this test only, and fake stdin as a
    // plain EventEmitter so no real terminal/pipe is touched.
    const EventEmitter = require('events');
    const realStdin = process.stdin;
    const fakeStdin = new EventEmitter();
    fakeStdin.isTTY = true;
    fakeStdin.setEncoding = () => {};
    Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true });

    const calls = [];
    try
    {
        packetlog.listenForMarkers({
            '/reload': (args) => calls.push(['/reload', args]),
            '/drop': (args) => calls.push(['/drop', args]),
        });

        fakeStdin.emit('data', '/reload\n');
        fakeStdin.emit('data', '/drop 3\n');
        fakeStdin.emit('data', 'started PvE map 9010\n');
    }
    finally
    {
        Object.defineProperty(process, 'stdin', { value: realStdin, configurable: true });
    }

    assert.deepStrictEqual(calls[0], ['/reload', ''],
        '/reload with no trailing text must still invoke its handler, with empty args');
    assert.deepStrictEqual(calls[1], ['/drop', '3'],
        '/drop 3 must invoke its handler with args="3"');
    assert.strictEqual(calls.length, 2,
        'plain marker text ("started PvE map 9010") must not match any command');

    console.log('[console-commands] PASS: /reload keeps working with no args, '
        + '/drop gets its argument, plain text is not mistaken for a command');
}

// Mirrors the `.find()` server.js's dropAccount() uses to locate the one
// GameServer client to destroy, against a fake clients array -- no real
// NetworkClient/socket involved.
function findAccountClient(clients, accountId)
{
    return clients.find((client) => Number(client.accountId_) === accountId);
}

function testDropOnlyTouchesMatchingAccount()
{
    function fakeClient(accountId)
    {
        return {
            accountId_: accountId,
            socket_: { destroyed: false, destroy() { this.destroyed = true; } },
        };
    }

    const clients = [fakeClient(1), fakeClient(2), fakeClient(3)];
    const target = findAccountClient(clients, 2);

    assert.ok(target, 'accountId=2 must be found among the fake clients');
    target.socket_.destroy();

    assert.strictEqual(clients[0].socket_.destroyed, false, 'accountId=1 must be untouched');
    assert.strictEqual(clients[1].socket_.destroyed, true, 'accountId=2 must be destroyed');
    assert.strictEqual(clients[2].socket_.destroyed, false, 'accountId=3 must be untouched');

    const missing = findAccountClient(clients, 99);
    assert.strictEqual(missing, undefined, 'an accountId with no connection must not match anything');

    console.log('[console-commands] PASS: /drop destroys only the matching accountId\'s socket');
}

testMarkerCommandDispatch();
testDropOnlyTouchesMatchingAccount();
console.log('[console-commands] ALL CHECKS PASS');
