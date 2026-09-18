const NetworkClient = require('./client.js');
const { createServer } = require('net');
const packetlog = require('./packetlog.js');
const session = require('./session.js');
// D1 step 1 (docs/design/d1-multiplayer-room.md §4, §6 step 1): record-only
// disconnect hook. Client changing maps always reconnects (session.js
// header comment), so a closed socket does not mean the player left the
// room — just note the client went away; step 5 adds the grace-period
// timeout that turns a stale disconnect into an actual removeMember().
const rooms = require('./rooms.js');

const SERVER_PORT = 9211;
const GAME_PORT = 30907;

// Backlog X1: one bad client packet used to be able to crash the whole
// process (both listeners, every connected client, mid-match) because
// nothing between the socket and the reverse-engineered handler code caught
// exceptions. Register the process-level nets before either server starts
// listening. These are last resorts, not the primary defense — the primary
// defense is the per-connection try/catch around service.dispatch() in
// DispatchServer.onConnection() below (and the matching one in
// client.js:onData()), which can attribute the failure to a connection and
// drop just that socket. Anything that reaches here instead (e.g. thrown
// from inside a setTimeout callback a handler scheduled, long after
// dispatch() returned) cannot be mapped back to a connection — that is a
// known limitation, not an oversight. Per the operator's decision recorded
// in docs/backlog.md (X1): log loudly, do not process.exit(), do not
// swallow it silently.
process.on('uncaughtException', (err, origin) => {
    const stack = err && err.stack ? err.stack : String(err);
    console.error(`[process] !!! UNCAUGHT EXCEPTION (origin=${origin}) — server kept alive:\n${stack}`);
    packetlog.marker(`!!! UNCAUGHT EXCEPTION (origin=${origin}): ${err && err.message || err} — could not be attributed to a connection, server kept running`, 'auto');
});

process.on('unhandledRejection', (reason) => {
    const stack = reason && reason.stack ? reason.stack : String(reason);
    console.error(`[process] !!! UNHANDLED REJECTION — server kept alive:\n${stack}`);
    packetlog.marker(`!!! UNHANDLED REJECTION: ${reason && reason.message || reason} — could not be attributed to a connection, server kept running`, 'auto');
});

class DispatchServer
{
    constructor(name, port, services)
    {
        this.name = name;
        this.port = port;
        this.server = createServer();
        this.services = services;
        this.clients = [];

        this.server.on('connection', (socket) => this.onConnection(socket));
    }

    start()
    {
        // Bind IPv4 explicitly. listen(port) with no host binds '::' (IPv6
        // dual-stack), and WSL2 in its default NAT networking mode only relays
        // IPv4 binds to the Windows host — so a server left on '::' is
        // unreachable from a Windows game client at 127.0.0.1, while the same
        // server answers fine from inside WSL. That failure looks exactly like
        // the client being misconfigured, which is an expensive thing to debug.
        // The client is a 2009 title and IPv4-only, so nothing is lost here.
        this.server.listen(this.port, '0.0.0.0', () => {
            const addr = this.server.address();
            console.log(`[${this.name}] Listening on ${addr.address}:${addr.port} (${addr.family})`);
        });
    }

    onConnection(socket)
    {
        console.log(`[${this.name}] New connection from ${socket.remoteAddress}:${socket.remotePort}`);
        const client = new NetworkClient(socket, (client, type, data) => {
            for (const service of this.services)
            {
                // Backlog X1: dispatch() runs reverse-engineered handler code
                // against a live client packet — the least-trusted input this
                // process sees. A synchronous throw here (bad offset read,
                // unexpected null, etc.) used to be an uncaught exception
                // that killed the whole process, taking every other
                // connected client down with it. Catch it here and drop only
                // this one connection.
                let handled;
                try
                {
                    handled = service.dispatch(client, type, data);
                }
                catch (err)
                {
                    this.onDispatchException(client, type, data, err);
                    return;
                }

                // None of the services in dispatch.js/game.js currently
                // return a Promise from dispatch() itself — the async
                // handlers they call (e.g. account.dispatch.js's
                // handleCreate) are fired without being awaited or returned,
                // so a throw inside one becomes an unhandledRejection (see
                // the process-level net above), not something catchable
                // here. This branch only guards against a future
                // `async dispatch()` producing a rejected promise that would
                // otherwise go unhandled silently.
                if (handled && typeof handled.then === 'function')
                {
                    handled.catch((err) => this.onDispatchException(client, type, data, err));
                    handled = true;
                }

                if (handled)
                {
                    // Handlers keep their state on the client, which dies with
                    // the socket. Mirror it into the account session so it can
                    // outlive the reconnect the client performs when it travels
                    // to a game map.
                    session.save(client);
                    return;
                }
            }

            // Log unhandled messages with full hex dump for reverse engineering
            console.log(`[${this.name}] Unhandled message type 0x${type.toString(16).padStart(8, '0')} (${data.length} bytes)`);
            if (data.length > 0) {
                console.log(`[${this.name}] Body hex:`, data.toString('hex'));
            }

            // No service claimed it. These are the packets worth investigating,
            // so flag them in the log rather than leaving them to be found by
            // eye among everything else.
            packetlog.connection('unhandled', client.connId_, {
                server: this.name,
                op: '0x' + (type >>> 0).toString(16).padStart(8, '0'),
                len: data.length,
                hex: data.toString('hex'),
            });
        });

        this.clients.push(client);

        socket.on('error', (err) => {
            console.log(`[${this.name}] Socket error: ${err.code}`);
        });

        socket.on('close', () => {
            const idx = this.clients.indexOf(client);
            if (idx !== -1) this.clients.splice(idx, 1);
            console.log(`[${this.name}] Connection closed (${this.clients.length} remaining)`);
            packetlog.connection('close', client.connId_, {
                server: this.name,
                remaining: this.clients.length,
            });

            // Save here too, not only after dispatch: several handlers are
            // async and finish after dispatch() has already returned, and
            // keep-alives never reach the dispatch chain at all. A connection
            // that set game state and then sat idle until close would
            // otherwise lose exactly the state this is meant to preserve.
            session.save(client);

            // D1 step 1 [design §4]: this socket is gone (map-change
            // reconnect or real disconnect — session.js can't tell them
            // apart either, see its header comment). Only clear the
            // member's client reference and stamp disconnectedAt; do not
            // remove membership. A no-op if this account was never tracked
            // in rooms.js (e.g. closed before CQ_CREATE).
            if (client.accountId_) {
                rooms.setMemberClient(Number(client.accountId_), null);
            }
        });
    }

    /**
     * Handles an exception thrown (or rejected) by a service's dispatch()
     * for a given connection. Triggered by whatever client packet drove the
     * reverse-engineered handler into a bad state — an offset that did not
     * hold what the handler expected, an unanticipated value, etc. Logs a
     * loud marker with the full packet that caused it, then drops only that
     * connection; every other connected client keeps playing.
     * @private
     * @param {NetworkClient} client
     * @param {number} type - Opcode
     * @param {Buffer} data - Message body, excluding the 16-byte header
     * @param {Error} err
     */
    onDispatchException(client, type, data, err)
    {
        const op = '0x' + (type >>> 0).toString(16).padStart(8, '0');
        const stack = err && err.stack ? err.stack : String(err);

        console.error(`[${this.name}] !!! DISPATCH EXCEPTION conn=${client.connId_} op=${op} — dropping this connection:\n${stack}`);

        packetlog.connection('exception', client.connId_, {
            server: this.name,
            op,
            len: data.length,
            hex: data.toString('hex'),
            stack,
        });
        packetlog.marker(`!!! DISPATCH EXCEPTION conn=${client.connId_} op=${op}: ${err && err.message || err} — connection dropped, server kept running`, 'auto');

        // Only this connection is compromised; its handler state may now be
        // inconsistent. destroy() rather than the graceful disconnect() —
        // it should not linger waiting on a reply that is never coming.
        if (client.socket_)
            client.socket_.destroy();
    }
};

// Everything below only runs when this file is executed directly (`node
// server.js` / the launcher .bat), which is the only way anything in this
// codebase has ever run it. Guarded so test/exception-guard.js (backlog X1)
// can `require('../server.js')` to reuse the real DispatchServer class —
// including the try/catch this test exists to exercise — without also
// binding the real ports 9211/30907 a second time. Nothing here changes
// what happens when server.js is run the normal way: require.main === module
// is true in that case, same as before this guard existed.
function main()
{
    // Dispatch server handles: Account login, Gate (server/channel selection)
    const dispatchServices = require('./dispatch.js');
    const dispatchServer = new DispatchServer('DispatchServer', SERVER_PORT, dispatchServices);
    dispatchServer.start();

    // Game server handles: Lobby, Room, Game, Hangar, Community, etc.
    const gameServices = require('./game.js');
    const gameServer = new DispatchServer('GameServer', GAME_PORT, gameServices);
    gameServer.start();

    // Stamps the session log with which build produced it — see packetlog.js.
    // This is the only thing tying a recording back to the code that made it, so
    // it has to run even if nothing has connected yet.
    packetlog.recordBuild('start');

    // Hot reload: typing /reload in the server console swaps in freshly loaded
    // dispatch code without closing sockets, so the client stays logged in and
    // the operator does not have to log in again after every handler change.
    // Handler state lives on the client objects and survives. What does not:
    // module-level variables in dispatch/ (currently only nextRoomIndex in
    // gate.game.dispatch.js restarts at 1), and timers already scheduled by the
    // old code, which finish running the old code. Anything outside dispatch/
    // (client.js, message.js, session.js, packetlog.js, database/) still needs a
    // full restart.
    function reloadServices()
    {
        const path = require('path');
        const root = __dirname + path.sep;
        const isReloadable = (file) =>
            file.startsWith(root + 'dispatch' + path.sep) ||
            file === root + 'dispatch.js' ||
            file === root + 'game.js';

        const saved = {};
        for (const file of Object.keys(require.cache))
        {
            if (isReloadable(file))
            {
                saved[file] = require.cache[file];
                delete require.cache[file];
            }
        }

        try
        {
            const nextDispatch = require('./dispatch.js');
            const nextGame = require('./game.js');
            dispatchServer.services = nextDispatch;
            gameServer.services = nextGame;
            console.log(`[reload] Dispatch code reloaded (${Object.keys(saved).length} modules); connections kept.`);
            packetlog.marker('RELOAD: dispatch code reloaded', 'auto');
            packetlog.recordBuild('reload');
        }
        catch (err)
        {
            // Put the old modules back so a later require() of them does not pick
            // up the broken files half-way; the running services never changed.
            for (const file of Object.keys(require.cache))
                if (isReloadable(file)) delete require.cache[file];
            Object.assign(require.cache, saved);
            console.error(`[reload] FAILED, still running the previous code:`, err);
        }
    }

    // Lets the operator annotate the recording from the console while playing:
    // type what you just did in the client, press Enter, and it lands in the log
    // between the packets it caused.
    packetlog.listenForMarkers({ '/reload': reloadServices });
}

if (require.main === module)
    main();

module.exports = { DispatchServer };