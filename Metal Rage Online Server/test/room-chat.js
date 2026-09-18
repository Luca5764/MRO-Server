'use strict';

// D1 step 2 (docs/backlog.md D1-2, docs/design/d1-multiplayer-room.md §5/§6
// step 2): unit tests for the room-chat broadcast added to
// dispatch/gate.game.dispatch.js's 0x00220505 (Chat_Room_All)/0x00220503
// (Chat_Room_Team) case, and for rooms.js's new sendAll()/sendOthers().
//
// Calls the real ZGateGameDispatch.dispatch() directly (no socket, no
// server.js) against two fake clients that share rooms.js's module-level
// registry -- same technique as test/login-token.js. database/db.js is
// swapped for the golden harness's fixture before gate.game.dispatch.js is
// required, because dispatch/room/room-game-user.sender.js requires db.js
// at module load time (this test never exercises that path, but the
// require chain still runs it); this test never touches the real MySQL `mro`
// database.
//
// Three cases (per the task contract):
//   1. Two clients (A, B) both members of the same room -> A sends
//      Chat_Room_All (0x00220505) -> both A and B receive the same body
//      back on the same opcode.
//   2. B is not in a room -> only A receives it (rooms.sendAll only walks
//      the room A is actually in).
//   3. Chat_Room_Team (0x00220503) -> only same-team members receive it.
//
// Run: node test/room-chat.js  (exit 0 = pass, exit 1 = fail)

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
const GateGameDispatch = require('../dispatch/gate.game.dispatch.js');

const CHAT_ROOM_ALL = 0x00220505;
const CHAT_ROOM_TEAM = 0x00220503;

/** Builds a 258-byte room-chat body: u16 header + ASCII text, zero-padded (matches the observed 0x00220505 shape from session-20260918-225741.jsonl). */
function makeChatBody(text)
{
    const body = Buffer.alloc(258);
    body.writeUint16LE(0x0000, 0);
    body.write(text, 2, 'latin1');
    return body;
}

function setUpTwoMemberRoom(dispatch)
{
    rooms._resetForTests();

    const id = rooms.allocateRoomId();
    rooms.createRoom({
        id, name: 'Chat Test Room', mapId: 9001, playTime: 0, playRound: 5,
        maxPlayers: 8, campaign: true, hostAccountId: 1,
    });

    const clientA = makeFakeClient(1, 30907);
    const clientB = makeFakeClient(2, 30907);
    clientA.accountId_ = 1;
    clientB.accountId_ = 2;

    rooms.addMember(id, { accountId: 1, nickname: 'Alice', team: 0, client: clientA });
    rooms.addMember(id, { accountId: 2, nickname: 'Bob', team: 0, client: clientB });

    return { id, clientA, clientB };
}

function testRoomChatAllReachesBothMembers()
{
    const dispatch = new GateGameDispatch();
    const { clientA, clientB } = setUpTwoMemberRoom(dispatch);
    const body = makeChatBody('hello room');

    const handled = dispatch.dispatch(clientA, CHAT_ROOM_ALL, body);
    assert.strictEqual(handled, true, 'dispatch must claim the packet');

    assert.strictEqual(clientA._sent.length, 1, 'sender must receive its own chat back (design says "including self")');
    assert.strictEqual(clientB._sent.length, 1, 'other room member must receive the chat');

    for (const client of [clientA, clientB]) {
        assert.strictEqual(client._sent[0].op, '0x00220505');
        assert.strictEqual(client._sent[0].hex, body.toString('hex'), 'broadcast body must be byte-identical to the CQ body');
    }

    console.log('[room-chat test] PASS: Chat_Room_All reaches every room member including the sender');
}

function testRoomChatAllSkipsMemberNotInRoom()
{
    const dispatch = new GateGameDispatch();
    const { clientA, clientB } = setUpTwoMemberRoom(dispatch);

    // B leaves the room -- no longer tracked by rooms.js.
    rooms.removeMember(2);
    assert.strictEqual(rooms.getRoomByAccount(2), undefined, 'precondition: B must not be in any room');
    assert.ok(rooms.getRoomByAccount(1), 'precondition: A must still be in the room');

    const body = makeChatBody('only A should see this');
    dispatch.dispatch(clientA, CHAT_ROOM_ALL, body);

    assert.strictEqual(clientA._sent.length, 1, 'A (still in room) must receive the broadcast');
    assert.strictEqual(clientB._sent.length, 0, 'B (left the room) must not receive anything');

    console.log('[room-chat test] PASS: Chat_Room_All does not reach a client no longer tracked in the room');
}

function testRoomChatTeamOnlyReachesSameTeam()
{
    const dispatch = new GateGameDispatch();
    rooms._resetForTests();

    const id = rooms.allocateRoomId();
    rooms.createRoom({
        id, name: 'Team Chat Room', mapId: 9001, playTime: 0, playRound: 5,
        maxPlayers: 8, campaign: true, hostAccountId: 1,
    });

    const clientA = makeFakeClient(1, 30907); // team 0 (red), sender
    const clientB = makeFakeClient(2, 30907); // team 0 (red), same team
    const clientC = makeFakeClient(3, 30907); // team 1 (blue), other team
    clientA.accountId_ = 1;
    clientB.accountId_ = 2;
    clientC.accountId_ = 3;

    rooms.addMember(id, { accountId: 1, nickname: 'Alice', team: 0, client: clientA });
    rooms.addMember(id, { accountId: 2, nickname: 'Bob', team: 0, client: clientB });
    rooms.addMember(id, { accountId: 3, nickname: 'Carol', team: 1, client: clientC });

    const body = makeChatBody('red team only');
    dispatch.dispatch(clientA, CHAT_ROOM_TEAM, body);

    assert.strictEqual(clientA._sent.length, 1, 'sender (team 0) must receive its own team chat back');
    assert.strictEqual(clientB._sent.length, 1, 'same-team member (team 0) must receive it');
    assert.strictEqual(clientC._sent.length, 0, 'other-team member (team 1) must not receive it');

    assert.strictEqual(clientA._sent[0].op, '0x00220503');
    assert.strictEqual(clientA._sent[0].hex, body.toString('hex'));
    assert.strictEqual(clientB._sent[0].hex, body.toString('hex'));

    console.log('[room-chat test] PASS: Chat_Room_Team only reaches same-team members');
}

function main()
{
    testRoomChatAllReachesBothMembers();
    testRoomChatAllSkipsMemberNotInRoom();
    testRoomChatTeamOnlyReachesSameTeam();
    console.log('[room-chat test] ALL CHECKS PASS');
    process.exit(0);
}

main();
