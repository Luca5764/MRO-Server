'use strict';

// D1 step 1 (docs/backlog.md D1-1, docs/design/d1-multiplayer-room.md §2,
// §6 step 1): unit tests for rooms.js, the write-only Room registry
// dual-written by CQ_CREATE (see dispatch/gate.game.dispatch.js) and by the
// leave/disconnect paths this step wires up.
//
// This does not touch dispatch/*.js, server.js or any socket -- it calls
// the rooms.js module functions directly, the same way an in-process caller
// (gate.game.dispatch.js, server.js) would.
//
// Three cases (per the task contract):
//   1. Create a room -> the creator ends up as a correct member.
//   2. Leave a room (removeMember) -> the room is deleted once empty.
//   3. Disconnect (setMemberClient(id, null)) -> membership survives, only
//      the client reference goes null and disconnectedAt gets stamped.
//
// Run: node test/rooms.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const rooms = require('../rooms.js');

function testCreateRoomAddsHostAsMember()
{
    const id = rooms.allocateRoomId();
    const room = rooms.createRoom({
        id,
        name: 'Test Room',
        mapId: 9001,
        playTime: 0,
        playRound: 5,
        maxPlayers: 8,
        campaign: true,
        hostAccountId: 1,
    });

    assert.strictEqual(room.id, id);
    assert.strictEqual(room.state, 'lobby');
    assert.strictEqual(room.members.size, 0, 'createRoom must not add members itself');

    const fakeClient = { tag: 'host-client' };
    const member = rooms.addMember(room.id, {
        accountId: 1,
        nickname: 'Host',
        team: 0,
        slot: 0,
        ready: false,
        client: fakeClient,
    });

    assert.strictEqual(room.members.size, 1);
    assert.strictEqual(room.members.get(1), member);
    assert.strictEqual(member.accountId, 1);
    assert.strictEqual(member.nickname, 'Host');
    assert.strictEqual(member.team, 0);
    assert.strictEqual(member.slot, 0);
    assert.strictEqual(member.ready, false);
    assert.strictEqual(member.client, fakeClient);
    assert.strictEqual(member.disconnectedAt, null);

    const found = rooms.getRoomByAccount(1);
    assert.strictEqual(found, room, 'getRoomByAccount must resolve the room the member was just added to');

    console.log('[rooms test] PASS: createRoom + addMember produces a correct member');
    return room.id;
}

function testAllocateRoomIdIncrementsFromPreviousCall()
{
    // Not "from 1" in this process -- allocateRoomId is a single shared
    // counter for the module's lifetime (docs/backlog.md D1-1: "從 1
    // 遞增", verified by the golden-sample regression instead, where a
    // freshly required rooms.js module genuinely starts at 1; see the D1-1
    // handback report). Here we only prove monotonic, non-repeating
    // allocation, since testCreateRoomAddsHostAsMember() above already
    // consumed id 1 in this same process.
    const a = rooms.allocateRoomId();
    const b = rooms.allocateRoomId();
    assert.strictEqual(b, a + 1);
    console.log('[rooms test] PASS: allocateRoomId increments monotonically');
}

function testLeaveRemovesMemberAndDeletesEmptyRoom()
{
    const id = rooms.allocateRoomId();
    const room = rooms.createRoom({
        id,
        name: 'Leave Test Room',
        mapId: 9002,
        playTime: 0,
        playRound: 3,
        maxPlayers: 8,
        campaign: true,
        hostAccountId: 2,
    });
    rooms.addMember(room.id, { accountId: 2, nickname: 'Solo', client: { tag: 'solo-client' } });

    assert.ok(rooms.getRoomByAccount(2), 'member must be tracked before leaving');

    const removed = rooms.removeMember(2);
    assert.strictEqual(removed, true);
    assert.strictEqual(rooms.getRoomByAccount(2), undefined, 'account must no longer resolve to a room');
    assert.strictEqual(rooms.listRooms().some((r) => r.id === id), false, 'room must be deleted once its last member leaves');

    // Removing an account with no tracked membership is a no-op, not a
    // throw -- server.js's socket-close hook calls this unconditionally.
    const removedAgain = rooms.removeMember(2);
    assert.strictEqual(removedAgain, false);

    console.log('[rooms test] PASS: removeMember drops membership and deletes the now-empty room');
}

function testLeaveKeepsRoomAliveWhileOtherMembersRemain()
{
    const id = rooms.allocateRoomId();
    const room = rooms.createRoom({
        id,
        name: 'Two Player Room',
        mapId: 9003,
        playTime: 0,
        playRound: 3,
        maxPlayers: 8,
        campaign: true,
        hostAccountId: 3,
    });
    rooms.addMember(room.id, { accountId: 3, nickname: 'Host', client: { tag: 'host' } });
    rooms.addMember(room.id, { accountId: 4, nickname: 'Guest', client: { tag: 'guest' } });

    rooms.removeMember(4);

    assert.strictEqual(rooms.getRoomByAccount(4), undefined);
    assert.ok(rooms.getRoomByAccount(3), 'room must still exist for the remaining member');
    assert.strictEqual(room.members.size, 1);

    console.log('[rooms test] PASS: room survives a partial leave while members remain');
}

function testDisconnectClearsClientButKeepsMembership()
{
    const id = rooms.allocateRoomId();
    const room = rooms.createRoom({
        id,
        name: 'Disconnect Test Room',
        mapId: 9004,
        playTime: 0,
        playRound: 3,
        maxPlayers: 8,
        campaign: true,
        hostAccountId: 5,
    });
    const fakeClient = { tag: 'about-to-disconnect' };
    rooms.addMember(room.id, { accountId: 5, nickname: 'Flaky', client: fakeClient });

    const before = Date.now();
    const changed = rooms.setMemberClient(5, null);
    assert.strictEqual(changed, true);

    const member = room.members.get(5);
    assert.strictEqual(member.client, null, 'client reference must go null on disconnect');
    assert.ok(member.disconnectedAt >= before, 'disconnectedAt must be stamped');
    assert.strictEqual(room.members.size, 1, 'membership must survive a disconnect (design §4)');
    assert.strictEqual(rooms.getRoomByAccount(5), room, 'account must still resolve to the room while disconnected');

    // Reconnect: setting a client again clears disconnectedAt.
    const reconnectClient = { tag: 'reconnected' };
    rooms.setMemberClient(5, reconnectClient);
    assert.strictEqual(member.client, reconnectClient);
    assert.strictEqual(member.disconnectedAt, null);

    // setMemberClient on an account with no membership is a no-op false,
    // not a throw -- matches removeMember's contract.
    assert.strictEqual(rooms.setMemberClient(999999, null), false);

    console.log('[rooms test] PASS: setMemberClient(null) keeps membership, setMemberClient(client) clears disconnectedAt');
}

function main()
{
    testCreateRoomAddsHostAsMember();
    testAllocateRoomIdIncrementsFromPreviousCall();
    testLeaveRemovesMemberAndDeletesEmptyRoom();
    testLeaveKeepsRoomAliveWhileOtherMembersRemain();
    testDisconnectClearsClientButKeepsMembership();
    console.log('[rooms test] ALL CHECKS PASS');
    process.exit(0);
}

main();
