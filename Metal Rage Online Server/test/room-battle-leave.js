'use strict';

// D1-6-BLEAVE (docs/design/d1-step6-battle-broadcast.md "補充：戰鬥中離開",
// contract BATTLE-LEAVE docs/backlog.md, explorer 🟡 待審): unit test for
// BATTLE_LEAVE_MODE (rooms.js's battleLeaveMode), added to rooms.js +
// dispatch/room/room-leave.js (handleBattleLeave) + dispatch/gate.game.dispatch.js
// (case 0x00222131). Same technique as test/room-playing-state.js: calls the
// real ZGateGameDispatch.dispatch() directly against fake clients sharing
// rooms.js's module-level registry, with a 3-member room (host + two
// members) started via Game_Start_CN so room.state is 'playing' before each
// scenario.
//
// Run: node test/room-battle-leave.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');
const Module = require('module');

const ROOT = path.join(__dirname, '..');
const DB_PATH = require.resolve(path.join(ROOT, 'database', 'db.js'));

const { makeFixtureDb } = require('./fixtures/fake-db.js');
const { makeFakeClient } = require('./fixtures/fake-client.js');
const { installFakeTimers } = require('./fixtures/fake-timers.js');

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
const { leaveRoomAndNotify } = require('../dispatch/room/room-leave.js');
const GateGameDispatch = require('../dispatch/gate.game.dispatch.js');

const CQ_CREATE = 0x00220201;
const GAME_START_CN = 0x00222103;
const LEAVE_CQ_BATTLE = 0x00222131;
const LEAVE_SA_BATTLE = '0x00222132';
const LEAVE_SN_BATTLE = '0x00420133';
const END_GAME_SN = '0x00222213';
// Leave_SA is sent via client.getMessageBuffer(0x00222132, 0x6) -- same
// 16-byte-aligned padding as the old generic-fallback auto-ACK it mirrors
// (0x6 header-relative size -> 0x16 -> rounds up to 0x20 total, 16-byte body).
const LEAVE_SA_ZERO_HEX = Buffer.alloc(16).toString('hex');

function makeCreateBody(name)
{
    const body = Buffer.alloc(51);
    body[0] = 1;                      // roomType: 1 = campaign
    body[1] = 0;
    body.writeUInt16LE(0, 2);
    body.writeUInt16LE(0, 4);
    body[6] = 5;
    body.writeUInt16LE(0, 7);
    body.writeUInt16LE(0, 9);
    body[11] = 0;
    body.writeUInt16LE(8, 12);
    body.write(name, 14, Math.min(name.length, 25), 'ascii');
    body[39] = 0;
    return body;
}

async function flushMicrotasks(rounds = 20)
{
    for (let i = 0; i < rounds; ++i)
        await new Promise((resolve) => setImmediate(resolve));
}

async function main()
{
    // --- Shared 3-member "playing" room setup, reused by scenarios 1-2. ---
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    rooms._setRoomPlayingStateModeForTests('enabled');
    rooms._setBattleLeaveModeForTests('enabled');
    GateGameDispatch._setHostAddressRequireModeForTest('disabled');

    const gate = new GateGameDispatch();

    const clientA = makeFakeClient(1, 30907); // host
    const clientB = makeFakeClient(2, 30907); // non-host member
    const clientC = makeFakeClient(3, 30907); // non-host member
    clientA.accountId_ = 1;
    clientB.accountId_ = 2;
    clientC.accountId_ = 3;
    clientA.nickname_ = 'Alice';
    clientB.nickname_ = 'Bob';
    clientC.nickname_ = 'Cara';
    clientA.pilot_ = 101;
    clientB.pilot_ = 102;
    clientC.pilot_ = 103;
    clientA.currentHangarSlot_ = 1;
    clientB.currentHangarSlot_ = 2;
    clientC.currentHangarSlot_ = 3;

    const fakeTimers = installFakeTimers();
    let roomId;
    try {
        const createHandled = gate.dispatch(clientA, CQ_CREATE, makeCreateBody('Alice Room'));
        assert.strictEqual(createHandled, true, 'CQ_CREATE must be handled');
        roomId = clientA.createdRoomIndex_;
        assert.ok(roomId, 'A must have a createdRoomIndex_ after CQ_CREATE');

        rooms.addMember(roomId, { accountId: 2, nickname: 'Bob', team: 0, slot: 0, ready: false, client: clientB });
        rooms.addMember(roomId, { accountId: 3, nickname: 'Cara', team: 1, slot: 1, ready: false, client: clientC });
        assert.strictEqual(rooms.getRoom(roomId).members.size, 3, 'room must have 3 members before F5');

        while (fakeTimers.fireNext()) { /* drain CQ_CREATE's own retry schedule */ }
        await flushMicrotasks();

        const startHandled = gate.dispatch(clientA, GAME_START_CN, Buffer.alloc(0));
        assert.strictEqual(startHandled, true, 'Game_Start_CN must be handled');
        while (fakeTimers.hasPending()) {
            fakeTimers.fireNext();
            await flushMicrotasks();
        }
        assert.strictEqual(rooms.getRoom(roomId).state, 'playing', 'room.state must be playing before the leave scenarios');
    } finally {
        fakeTimers.restore();
    }

    // --- 1. Non-host (Bob) leaves the battle: Leave_SN to the other two,
    //     state stays playing, Bob is NOT removed from the room. ---
    clientA._sent.length = 0;
    clientB._sent.length = 0;
    clientC._sent.length = 0;

    const bobLeaveHandled = gate.dispatch(clientB, LEAVE_CQ_BATTLE, Buffer.alloc(0));
    assert.strictEqual(bobLeaveHandled, true, 'Leave_CQ 0x00222131 must be handled');

    const bobSa = clientB._sent.filter((s) => s.op === LEAVE_SA_BATTLE);
    assert.strictEqual(bobSa.length, 1, 'Bob must get exactly one Leave_SA 0x00222132');
    assert.strictEqual(bobSa[0].hex, LEAVE_SA_ZERO_HEX, 'Leave_SA must be the 0/0 success header');

    const aliceLeaveSn = clientA._sent.filter((s) => s.op === LEAVE_SN_BATTLE);
    const caraLeaveSn = clientC._sent.filter((s) => s.op === LEAVE_SN_BATTLE);
    assert.strictEqual(aliceLeaveSn.length, 1, 'Alice (host) must get one Leave_SN 0x00420133 for Bob');
    assert.strictEqual(caraLeaveSn.length, 1, 'Cara must get one Leave_SN 0x00420133 for Bob');
    assert.strictEqual(Buffer.from(aliceLeaveSn[0].hex, 'hex').readUInt16LE(0x00), 2, "Leave_SN body's UserIndex must be Bob's accountId (2)");
    assert.strictEqual(Buffer.from(caraLeaveSn[0].hex, 'hex').readUInt16LE(0x00), 2, "Leave_SN body's UserIndex must be Bob's accountId (2)");
    assert.strictEqual(clientB._sent.filter((s) => s.op === LEAVE_SN_BATTLE).length, 0, 'Bob (the leaver) must not get a Leave_SN about himself');

    assert.strictEqual(rooms.getRoom(roomId).state, 'playing', 'room.state must stay playing after a non-host battle-leave');
    assert.ok(rooms.getRoom(roomId).members.has(2), 'Bob must still be a room member (battle-leave, not room-leave)');
    assert.strictEqual(rooms.getRoom(roomId).members.get(2).inBattle, false, "Bob's member record must be flagged inBattle=false");
    console.log('[room-battle-leave test] PASS: non-host battle-leave broadcasts Leave_SN 0x420133, room stays playing, leaver stays a room member');

    // --- 2. Host (Alice) leaves the battle: EndGame_SN to the other two,
    //     state becomes lobby, Alice is NOT removed from the room. ---
    clientA._sent.length = 0;
    clientB._sent.length = 0;
    clientC._sent.length = 0;

    const aliceLeaveHandled = gate.dispatch(clientA, LEAVE_CQ_BATTLE, Buffer.alloc(0));
    assert.strictEqual(aliceLeaveHandled, true, 'Leave_CQ 0x00222131 must be handled');

    const aliceSa = clientA._sent.filter((s) => s.op === LEAVE_SA_BATTLE);
    assert.strictEqual(aliceSa.length, 1, 'Alice must get exactly one Leave_SA 0x00222132');
    assert.strictEqual(aliceSa[0].hex, LEAVE_SA_ZERO_HEX, 'Leave_SA must be the 0/0 success header');

    const bobEndGame = clientB._sent.filter((s) => s.op === END_GAME_SN);
    const caraEndGame = clientC._sent.filter((s) => s.op === END_GAME_SN);
    assert.strictEqual(bobEndGame.length, 1, 'Bob must get one EndGame_SN 0x00222213');
    assert.strictEqual(caraEndGame.length, 1, 'Cara must get one EndGame_SN 0x00222213');
    const bobEndGameBody = Buffer.from(bobEndGame[0].hex, 'hex');
    assert.strictEqual(bobEndGameBody.readUInt16LE(0x00), 1, 'EndGame_SN WinTeamIndex must be 1 (lose -- cut short)');
    assert.strictEqual(clientA._sent.filter((s) => s.op === END_GAME_SN).length, 0, 'Alice (the leaver) must not get an EndGame_SN about her own leave');

    assert.strictEqual(rooms.getRoom(roomId).state, 'lobby', 'room.state must flip back to lobby after the host battle-leaves');
    assert.strictEqual(rooms.getRoom(roomId).members.size, 3, 'all 3 accounts must still be room members (battle-leave never removes membership)');
    assert.strictEqual(rooms.getRoom(roomId).hostAccountId, 1, 'Alice must still be the room host (no P2P host handover attempted, design §6)');
    console.log('[room-battle-leave test] PASS: host battle-leave broadcasts EndGame_SN 0x222213, room.state -> lobby, membership/host unchanged');

    rooms._resetForTests();

    // --- 3. Switch off (default) -- Leave_CQ 0x00222131 must produce
    //     exactly the same bytes as the old generic-fallback path, and must
    //     not touch the room at all. ---
    rooms._setRoomJoinModeForTests('enabled');
    rooms._setRoomPlayingStateModeForTests('enabled');
    // rooms._setBattleLeaveModeForTests(...) deliberately left at its
    // default 'disabled'.
    GateGameDispatch._setHostAddressRequireModeForTest('disabled');

    const clientD = makeFakeClient(4, 30907);
    const clientE = makeFakeClient(5, 30907);
    clientD.accountId_ = 4;
    clientE.accountId_ = 5;
    clientD.nickname_ = 'Dana';
    clientE.nickname_ = 'Eve';
    clientD.pilot_ = 104;
    clientE.pilot_ = 105;
    clientD.currentHangarSlot_ = 1;
    clientE.currentHangarSlot_ = 2;

    const fakeTimers2 = installFakeTimers();
    let roomId2;
    try {
        const createHandled2 = gate.dispatch(clientD, CQ_CREATE, makeCreateBody('Dana Room'));
        assert.strictEqual(createHandled2, true, 'CQ_CREATE must be handled with the switch off');
        roomId2 = clientD.createdRoomIndex_;
        rooms.addMember(roomId2, { accountId: 5, nickname: 'Eve', team: 0, slot: 0, ready: false, client: clientE });
        while (fakeTimers2.fireNext()) { /* drain CQ_CREATE's own retry schedule */ }
        await flushMicrotasks();

        gate.dispatch(clientD, GAME_START_CN, Buffer.alloc(0));
        while (fakeTimers2.hasPending()) {
            fakeTimers2.fireNext();
            await flushMicrotasks();
        }
        assert.strictEqual(rooms.getRoom(roomId2).state, 'playing', 'room.state must still flip to playing (ROOM_PLAYING_STATE_MODE is on; only BATTLE_LEAVE_MODE is off here)');
    } finally {
        fakeTimers2.restore();
    }

    clientD._sent.length = 0;
    clientE._sent.length = 0;

    const danaLeaveHandled = gate.dispatch(clientD, LEAVE_CQ_BATTLE, Buffer.alloc(0));
    assert.strictEqual(danaLeaveHandled, true, 'Leave_CQ 0x00222131 must be handled with the switch off');

    assert.strictEqual(clientD._sent.length, 1, 'with the switch off, the sender must get exactly one packet');
    assert.strictEqual(clientD._sent[0].op, LEAVE_SA_BATTLE, 'with the switch off, the sender must still get Leave_SA 0x00222132');
    assert.strictEqual(clientD._sent[0].hex, LEAVE_SA_ZERO_HEX, 'Leave_SA bytes must match the old generic-fallback 0/0 reply exactly');
    assert.strictEqual(clientE._sent.length, 0, 'with the switch off, no other room member gets any packet from this Leave_CQ');
    assert.strictEqual(rooms.getRoom(roomId2).state, 'playing', 'with the switch off, room.state must be untouched by Leave_CQ 0x00222131');
    assert.ok(rooms.getRoom(roomId2).members.has(4), 'with the switch off, the room membership must be untouched too');
    console.log('[room-battle-leave test] PASS: switch off (default) -- Leave_CQ 0x00222131 is byte-identical to the old fallback and does not touch the room');

    rooms._resetForTests();

    // --- 4. Socket disconnect mid-battle reuses the same battle-aware
    //     packets via leaveRoomAndNotify() -- BUT (unlike the CQ path above)
    //     still actually removes the disconnecting account from the room,
    //     since a closed socket never reconnects (see room-leave.js's own
    //     comment on why this differs from the CQ 0x00222131 case). ---
    rooms._setRoomJoinModeForTests('enabled');
    rooms._setRoomPlayingStateModeForTests('enabled');
    rooms._setBattleLeaveModeForTests('enabled');
    rooms._setLobbyRoomListModeForTests('enabled');
    GateGameDispatch._setHostAddressRequireModeForTest('disabled');

    const clientF = makeFakeClient(6, 30907);
    const clientG = makeFakeClient(7, 30907);
    clientF.accountId_ = 6;
    clientG.accountId_ = 7;
    clientF.nickname_ = 'Finn';
    clientG.nickname_ = 'Gus';
    clientF.pilot_ = 106;
    clientG.pilot_ = 107;
    clientF.currentHangarSlot_ = 1;
    clientG.currentHangarSlot_ = 2;
    rooms.registerLobbyClientSource([clientF, clientG]);

    const fakeTimers3 = installFakeTimers();
    let roomId3;
    try {
        const createHandled3 = gate.dispatch(clientF, CQ_CREATE, makeCreateBody('Finn Room'));
        assert.strictEqual(createHandled3, true, 'CQ_CREATE must be handled');
        roomId3 = clientF.createdRoomIndex_;
        rooms.addMember(roomId3, { accountId: 7, nickname: 'Gus', team: 0, slot: 0, ready: false, client: clientG });
        while (fakeTimers3.fireNext()) { /* drain CQ_CREATE's own retry schedule */ }
        await flushMicrotasks();

        gate.dispatch(clientF, GAME_START_CN, Buffer.alloc(0));
        while (fakeTimers3.hasPending()) {
            fakeTimers3.fireNext();
            await flushMicrotasks();
        }
        assert.strictEqual(rooms.getRoom(roomId3).state, 'playing', 'room.state must be playing before the disconnect scenario');
    } finally {
        fakeTimers3.restore();
    }

    clientF._sent.length = 0;
    clientG._sent.length = 0;

    // Non-host (Gus) disconnects mid-battle.
    leaveRoomAndNotify(7);
    const finnEndGame = clientF._sent.filter((s) => s.op === END_GAME_SN);
    const finnLeaveSnBattle = clientF._sent.filter((s) => s.op === LEAVE_SN_BATTLE);
    assert.strictEqual(finnEndGame.length, 0, 'a non-host disconnect must not end the battle');
    assert.strictEqual(finnLeaveSnBattle.length, 1, 'Finn (host) must get a battle Leave_SN 0x420133 for the disconnecting non-host');
    assert.strictEqual(Buffer.from(finnLeaveSnBattle[0].hex, 'hex').readUInt16LE(0x00), 7, "Leave_SN body's UserIndex must be Gus's accountId (7)");
    assert.strictEqual(rooms.getRoom(roomId3).state, 'playing', 'room.state must stay playing after a non-host disconnect');
    assert.strictEqual(rooms.getRoomByAccount(7), undefined, 'unlike the CQ 0x00222131 case, a real disconnect DOES remove the account from the room');
    console.log('[room-battle-leave test] PASS: non-host socket disconnect mid-battle sends battle Leave_SN AND removes the account from the room');

    console.log('[room-battle-leave test] ALL CHECKS PASS');
    process.exit(0);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
