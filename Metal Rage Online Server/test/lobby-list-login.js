'use strict';

// LOBBY-LIST-LOGIN (docs/backlog.md, follow-up to D1-4): a client that logs
// in after a room already exists never received Room_List_SN (0x00220204)
// on lobby entry -- the only pre-existing send sites were the Leave_CQ-back-
// to-lobby path (room.dispatch.js sendLobbyBootstrapAfterRoomLeave) and the
// explicit lobby-open poll (lobby.dispatch.js, 0x00230111), neither of
// which a freshly-logged-in client that never joined a room hits. Calls the
// real ZGameLoginDispatch.dispatch() directly (no socket, no server.js),
// same technique as test/room-join.js.
//
// [LOG] session-20260919-122616.jsonl conn4: 0x00220111 recv / 0x00220112
// + 0x00230112 send at ms 492276, no Room_List_SN follows until another
// connection's own broadcast at ms 537346/539206.
//
// Run: node test/lobby-list-login.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));

const { makeFixtureDb } = require('./fixtures/fake-db.js');
const { makeFakeClient } = require('./fixtures/fake-client.js');

function installFakeModule(resolvedPath, exportsObj)
{
    const mod = new Module(resolvedPath, null);
    mod.filename = resolvedPath;
    mod.loaded = true;
    mod.exports = exportsObj;
    require.cache[resolvedPath] = mod;
}

installFakeModule(DB_PATH, makeFixtureDb());

const rooms = require('../rooms.js');
const GameLoginDispatch = require('../dispatch/gamelogin.dispatch.js');

const CHANNEL_ENTER_CQ = 0x00220111;
const ROOM_LIST_SN = '0x00220204';

function makeExistingRoom() {
    const room = rooms.createRoom({
        id: rooms.allocateRoomId(),
        name: 'Existing Room',
        mapId: 9001,
        playTime: 10,
        playRound: 1,
        maxPlayers: 4,
        campaign: true,
        hostAccountId: 900,
        roomType: 1,
        hasPassword: false,
        password: '',
    });
    rooms.addMember(room.id, { accountId: 900, nickname: 'Host', team: 0, slot: 0, ready: false, client: null });
    return room;
}

function main()
{
    const gameLogin = new GameLoginDispatch();

    // --- switch on: a client logging in after the room already exists
    // must get exactly one Room_List_SN containing that room, on the same
    // 0x00220111 (Channel enter CQ) that already triggers 0x00220112/
    // 0x00230112. ---
    rooms._resetForTests();
    rooms._setLobbyRoomListModeForTests('enabled');
    try {
        const room = makeExistingRoom();

        const client = makeFakeClient(1, 30907);
        client.accountId_ = 1; // set by handleGameLogin (0x00110124) before handleChannelEnter runs, same order as the real dispatch chain
        // Same live-array reference server.js passes to
        // rooms.registerLobbyClientSource(gameServer.clients) -- must
        // already include this connection before 0x00220111 is dispatched,
        // same as a real socket already being in gameServer.clients by the
        // time its own login CQs are processed.
        rooms.registerLobbyClientSource([client]);

        const handled = gameLogin.dispatch(client, CHANNEL_ENTER_CQ, Buffer.from([0]));
        assert.strictEqual(handled, true, '0x00220111 must be handled');

        assert.strictEqual(client._sent.some((s) => s.op === '0x00220112'), true, 'existing Channel enter SA must still be sent');
        assert.strictEqual(client._sent.some((s) => s.op === '0x00230112'), true, 'existing Lobby Enter SA must still be sent');

        const listPackets = client._sent.filter((s) => s.op === ROOM_LIST_SN);
        assert.strictEqual(listPackets.length, 1, 'channel enter must send exactly one Room_List_SN when LOBBY_ROOM_LIST_MODE is enabled');

        const entry = Buffer.from(listPackets[0].hex, 'hex');
        // body layout: [0]=continuation flag [1]=count, entry starts at [2]
        assert.strictEqual(entry.readUInt8(1), 1, 'Room_List_SN must report one room');
        assert.strictEqual(entry.readUInt16LE(2), room.id, 'entry RoomIndex must be the pre-existing room');
        assert.strictEqual(entry.readUInt8(4), 1, 'entry UpdateType must be 1 (new/full room)');

        // The connection must also be counted as "in the lobby" by then, so
        // later incremental Room_List_SN broadcasts (rooms.js
        // getLobbyClients()) reach it too.
        assert.ok(rooms.getLobbyClients().includes(client), 'client must be registered as a lobby client immediately after channel enter');

        console.log('[lobby-list-login test] PASS: LOBBY_ROOM_LIST_MODE on -- channel enter sends the full room list including a room created before login');
    } finally {
        rooms._resetForTests();
    }

    // --- switch left 'disabled' (via rooms._resetForTests() below -- no
    // longer the production default after SWITCH-CONVERGE): behaviour must
    // stay byte-identical to before that change -- no Room_List_SN at all
    // on channel enter. ---
    rooms._resetForTests();
    try {
        makeExistingRoom();

        const client2 = makeFakeClient(2, 30907);
        client2.accountId_ = 2;
        rooms.registerLobbyClientSource([client2]);

        const handled2 = gameLogin.dispatch(client2, CHANNEL_ENTER_CQ, Buffer.from([0]));
        assert.strictEqual(handled2, true, '0x00220111 must be handled');

        const listPackets2 = client2._sent.filter((s) => s.op === ROOM_LIST_SN);
        assert.strictEqual(listPackets2.length, 0, 'LOBBY_ROOM_LIST_MODE disabled: channel enter must send no Room_List_SN at all');

        console.log('[lobby-list-login test] PASS: LOBBY_ROOM_LIST_MODE disabled -- channel enter sends no Room_List_SN');
    } finally {
        rooms._resetForTests();
    }

    console.log('[lobby-list-login test] ALL CHECKS PASS');
    process.exit(0);
}

main();
