'use strict';

// ROOM-PLAYING-STATE (docs/backlog.md INTRUDE, docs/research/
// 2026-09-19-intrude/notes.md "過渡規則", 🟡 待審): unit test for the
// conservative interim rule added to rooms.js/dispatch/gate.game.dispatch.js/
// dispatch/lobby.dispatch.js -- room.state flips to 'playing' once a battle
// actually starts (Game_Start_CN 0x00222103, the accepted host path) and
// back to 'lobby' once it ends (EndGame_SN 0x00222213, sent from the
// Campaign_CN 0x00230139 handler). While 'playing', Enter_CQ 0x00220231
// must refuse a third client instead of adding her to the room. Same
// technique as test/room-join.js: calls the real dispatch() functions
// directly against fake clients sharing rooms.js's module-level registry.
//
// Run: node test/room-playing-state.js  (exit 0 = pass, exit 1 = fail)

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
const GateGameDispatch = require('../dispatch/gate.game.dispatch.js');
const LobbyDispatch = require('../dispatch/lobby.dispatch.js');

const CQ_CREATE = 0x00220201;
const ENTER_CQ = 0x00220231;
const ENTER_SA = '0x00220232';
const GAME_START_CN = 0x00222103;
const CAMPAIGN_CN = 0x00230139;
const ROOM_LIST_SN = '0x00220204';

/**
 * Builds a CQ_CREATE body (ZDispatchLobby::Create_CQ layout, see the case
 * 0x00220201 comment in gate.game.dispatch.js): a PvE campaign room.
 * Same shape as test/room-join.js's makeCreateBody().
 */
function makeCreateBody(name)
{
    const body = Buffer.alloc(51);
    body[0] = 1;                      // roomType: 1 = campaign
    body[1] = 0;                      // createByte1
    body.writeUInt16LE(0, 2);         // createWord1
    body.writeUInt16LE(0, 4);         // createWord2
    body[6] = 5;                      // mapId / playRound (same byte, existing quirk)
    body.writeUInt16LE(0, 7);         // createWord3
    body.writeUInt16LE(0, 9);         // createWord4 (gameMode = 0)
    body[11] = 0;                     // roomNumberFlag
    body.writeUInt16LE(8, 12);        // roomNumberValue
    body.write(name, 14, Math.min(name.length, 25), 'ascii');
    body[39] = 0;                     // no password
    return body;
}

function makeEnterBody(roomIndex)
{
    const body = Buffer.alloc(0x1D);
    body.writeUInt16LE(roomIndex, 0x00);
    return body; // rest zero -> empty UTF-16LE password
}

/** Campaign_CN body: body[0]=1, body[1]=0, body[2]=action (1 success, 2 fail). */
function makeCampaignBody(action)
{
    return Buffer.from([1, 0, action]);
}

function decodeEnterSa(hex)
{
    const buf = Buffer.from(hex, 'hex');
    return { status: buf.readUInt16LE(0x00), result: buf.readUInt32LE(0x02) };
}

function main()
{
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    rooms._setRoomPlayingStateModeForTests('enabled');
    // HOST_ADDRESS_REQUIRE_MODE now defaults on (switch convergence); this test
    // has no fixture hostAddress and is not testing that switch.
    GateGameDispatch._setHostAddressRequireModeForTest('disabled');
    rooms._setLobbyRoomListModeForTests('enabled');

    const gate = new GateGameDispatch();
    const lobby = new LobbyDispatch();

    const hostA = makeFakeClient(1, 30907);
    hostA.accountId_ = 1;
    hostA.nickname_ = 'Alice';
    const joinerB = makeFakeClient(2, 30907);
    joinerB.accountId_ = 2;
    joinerB.nickname_ = 'Bob';
    const outsiderC = makeFakeClient(3, 30907);
    outsiderC.accountId_ = 3;
    outsiderC.nickname_ = 'Cara';

    rooms.registerLobbyClientSource([hostA, joinerB, outsiderC]);

    const fakeTimers = installFakeTimers();
    try {
        const createHandled = gate.dispatch(hostA, CQ_CREATE, makeCreateBody('Alice Room'));
        assert.strictEqual(createHandled, true, 'CQ_CREATE must be handled');
        const roomId = hostA.createdRoomIndex_;
        assert.ok(rooms.getRoom(roomId), 'room must be tracked');
        assert.strictEqual(rooms.getRoom(roomId).state, 'lobby', 'a freshly created room must start in state lobby');
        while (fakeTimers.fireNext()) { /* drain CQ_CREATE's own retry schedule */ }

        const enterHandled = gate.dispatch(joinerB, ENTER_CQ, makeEnterBody(roomId));
        assert.strictEqual(enterHandled, true, 'Enter_CQ must be handled');
        assert.ok(rooms.getRoom(roomId).members.has(2), 'Bob must have joined before the battle starts');
        while (fakeTimers.fireNext()) { /* drain the 350ms joiner room-state send */ }

        outsiderC._sent.length = 0;

        // --- 1. Host presses F5 (Game_Start_CN) -> room flips to playing. ---
        const startHandled = gate.dispatch(hostA, GAME_START_CN, Buffer.alloc(0));
        assert.strictEqual(startHandled, true, 'Game_Start_CN must be handled');
        assert.strictEqual(rooms.getRoom(roomId).state, 'playing', 'room.state must flip to playing once Game_Start_CN is accepted');

        // SERVER_DRIVEN_START_MODE schedules setTimeout callbacks (Game_User_SN
        // etc.) referencing the room; drain them so nothing is left pending
        // when the test moves on.
        while (fakeTimers.fireNext()) { /* drain battle-start callbacks */ }

        const playingListHits = outsiderC._sent.filter((s) => s.op === ROOM_LIST_SN);
        assert.strictEqual(playingListHits.length, 1, 'a lobby client must get one Room_List_SN partial update when the room starts playing');
        console.log('[room-playing-state test] PASS: Game_Start_CN flips room.state to playing and broadcasts a lobby list update');

        // --- 2. A third client tries to join mid-battle -> must be refused. ---
        outsiderC._sent.length = 0;
        const enterHandledMidBattle = gate.dispatch(outsiderC, ENTER_CQ, makeEnterBody(roomId));
        assert.strictEqual(enterHandledMidBattle, true, 'Enter_CQ mid-battle must still be handled (with a failure reply)');

        const midBattleSa = outsiderC._sent.filter((s) => s.op === ENTER_SA);
        assert.strictEqual(midBattleSa.length, 1, 'Cara must receive exactly one Enter_SA');
        assert.deepStrictEqual(decodeEnterSa(midBattleSa[0].hex), { status: 1, result: 1 }, 'Enter_SA mid-battle must be the 1/1 failure header');
        assert.strictEqual(rooms.getRoomByAccount(3), undefined, 'Cara must not be added to the room while it is playing');
        assert.strictEqual(rooms.getRoom(roomId).members.size, 2, 'room membership must stay at 2 (Alice + Bob) after the refused join');
        console.log('[room-playing-state test] PASS: Enter_CQ against a playing room replies 1/1 Enter_SA and does not add the member');

        // --- 3. Host's Campaign_CN success -> EndGame_SN -> back to lobby. ---
        outsiderC._sent.length = 0;
        const campaignHandled = lobby.dispatch(hostA, CAMPAIGN_CN, makeCampaignBody(1));
        assert.strictEqual(campaignHandled, true, 'Campaign_CN must be handled');
        assert.strictEqual(rooms.getRoom(roomId).state, 'lobby', 'room.state must flip back to lobby once EndGame_SN is sent');

        const lobbyListHits = outsiderC._sent.filter((s) => s.op === ROOM_LIST_SN);
        assert.strictEqual(lobbyListHits.length, 1, 'a lobby client must get one Room_List_SN partial update when the room returns to lobby');
        console.log('[room-playing-state test] PASS: Campaign_CN success -> EndGame_SN flips room.state back to lobby and broadcasts a lobby list update');

        // --- 4. Cara can now join. ---
        outsiderC._sent.length = 0;
        const enterHandledAfterEnd = gate.dispatch(outsiderC, ENTER_CQ, makeEnterBody(roomId));
        assert.strictEqual(enterHandledAfterEnd, true, 'Enter_CQ after the battle ends must be handled');
        const afterEndSa = outsiderC._sent.filter((s) => s.op === ENTER_SA);
        assert.strictEqual(afterEndSa.length, 1, 'Cara must receive exactly one Enter_SA');
        assert.deepStrictEqual(decodeEnterSa(afterEndSa[0].hex), { status: 0, result: 0 }, 'Enter_SA after the battle ends must be the 0/0 success header');
        assert.ok(rooms.getRoomByAccount(3), 'Cara must now be tracked as a room member');
        assert.strictEqual(rooms.getRoom(roomId).members.size, 3, 'room membership must be 3 (Alice + Bob + Cara) after the successful join');
        console.log('[room-playing-state test] PASS: once the room is back in the lobby state, a new member can join normally');
    } finally {
        fakeTimers.restore();
        rooms._resetForTests();
    }

    // --- 5. Switch off (default) -- Enter_CQ into a room whose state was
    // never flipped (nothing ever sets it) must succeed exactly as before
    // this feature existed. Regression guard for the "switch off is
    // byte-identical" contract, independent of the full replay-golden run.
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    // rooms._setRoomPlayingStateModeForTests(...) deliberately left at its
    // default 'disabled'.
    const fakeTimers2 = installFakeTimers();
    try {
        const hostD = makeFakeClient(11, 30907);
        hostD.accountId_ = 11;
        hostD.nickname_ = 'Dana';
        const joinerE = makeFakeClient(12, 30907);
        joinerE.accountId_ = 12;
        rooms.registerLobbyClientSource([hostD, joinerE]);

        const createHandled2 = gate.dispatch(hostD, CQ_CREATE, makeCreateBody('Dana Room'));
        assert.strictEqual(createHandled2, true, 'CQ_CREATE must be handled with the switch off');
        const roomId2 = hostD.createdRoomIndex_;
        while (fakeTimers2.fireNext()) { /* drain CQ_CREATE's own retry schedule */ }

        gate.dispatch(hostD, GAME_START_CN, Buffer.alloc(0));
        while (fakeTimers2.fireNext()) { /* drain battle-start callbacks */ }
        assert.strictEqual(rooms.getRoom(roomId2).state, 'lobby', 'with the switch off, room.state must never leave lobby, even after Game_Start_CN');

        const enterHandled2 = gate.dispatch(joinerE, ENTER_CQ, makeEnterBody(roomId2));
        assert.strictEqual(enterHandled2, true, 'Enter_CQ must be handled with the switch off');
        const sa2 = joinerE._sent.filter((s) => s.op === ENTER_SA);
        assert.strictEqual(sa2.length, 1, 'joiner must receive exactly one Enter_SA');
        assert.deepStrictEqual(decodeEnterSa(sa2[0].hex), { status: 0, result: 0 }, 'with the switch off, Enter_CQ after Game_Start_CN must still succeed (unchanged behaviour)');
        console.log('[room-playing-state test] PASS: switch off (default) -- Enter_CQ succeeds after Game_Start_CN exactly as before this feature existed');
    } finally {
        fakeTimers2.restore();
        rooms._resetForTests();
    }

    console.log('[room-playing-state test] ALL CHECKS PASS');
    process.exit(0);
}

main();
