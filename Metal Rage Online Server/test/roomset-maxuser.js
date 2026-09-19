'use strict';

// ROOMSET-MAXUSER (docs/backlog.md, docs/journal/2026-09-19-1000-maplist-single-entry.md
// H7 section): unit test for PVE_MAXUSER_WIRE_MODE in
// dispatch/room/room-state.sender.js.
//
// ZPopup_RoomSet.Update_MapList() (~ZPopup_RoomSet.uc:575) only keeps a
// Cache map row when `UserMin <= nUserMax && nUserMax <= UserMax`; nUserMax
// comes straight from MyRoomInfo.MaxUser (Room_Boundary_SN body+1). PvE maps
// 9001-9012 are believed ([CACHE], 🟡 not independently re-verified here) to
// have UserMin=UserMax=16, so the switch sends 16 in that one byte for PvE/
// campaign rooms only. It must not touch Room_Default_SN's join-capacity
// byte (body+7, still `maxPlayers`=8) or any other field.
//
// Calls sendRoomStatePackets() directly (same technique as
// test/map-list-single.js) -- no socket, no server.js, no DB.
//
// Run: node test/roomset-maxuser.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');

const {
    sendRoomStatePackets,
    _setPveMaxUserWireModeForTests,
} = require('../dispatch/room/room-state.sender.js');

const SN_ROOM_DEFAULT = 0x00220203;
const SN_ROOM_BOUNDARY = 0x00220213;

function getExactMessageBuffer(type, bodySize) {
    const msg = Buffer.alloc(0x10 + bodySize);
    msg.writeUint16BE(msg.length, 0x6);
    msg.writeUint32BE(type, 0xC);
    return [msg, msg.subarray(0x10)];
}

function makeFakeClient() {
    const sent = [];
    return {
        send(msg) {
            sent.push({
                op: msg.readUInt32BE(0xC),
                body: msg.subarray(0x10),
            });
        },
        _sent: sent,
    };
}

function findBody(client, op) {
    const pkt = client._sent.find((p) => p.op === op);
    assert.ok(pkt, `expected a sent packet with op 0x${op.toString(16)}`);
    return pkt.body;
}

const PVE_MAX_PLAYERS = 8; // join capacity, gate.game.dispatch.js CQ_CREATE isCampaignLike branch

function makeCtx(isTrueCampaign) {
    return {
        roomIndex: 1,
        accountIndex: 1,
        roomType: 2,
        mapId: 1,
        maxPlayers: PVE_MAX_PLAYERS,
        currentUsers: 1,
        gameMode: 4,
        mapIndex: 9001,
        roomName: 'Room',
        selectedMech: 1,
        primaryBodyCacheIndex: 8,
        roomSettingGoal: 0,
        roomSettingTime: 0,
        roomSettingRound: 1,
        roomDefaultEntryCount: 0,
        roomDefaultEntryHints: [],
        isCampaignRoom: true,
        optionMask: 0,
        isTrueCampaign,
    };
}

function testDisabledUnchanged() {
    _setPveMaxUserWireModeForTests('disabled');
    const client = makeFakeClient();
    sendRoomStatePackets(client, makeCtx(true), getExactMessageBuffer);

    const boundaryBody = findBody(client, SN_ROOM_BOUNDARY);
    assert.strictEqual(boundaryBody.readUint8(0x01), PVE_MAX_PLAYERS, 'disabled: Boundary body+1 stays maxPlayers (8)');

    const defaultBody = findBody(client, SN_ROOM_DEFAULT);
    assert.strictEqual(defaultBody.readUint8(0x07), PVE_MAX_PLAYERS, 'disabled: Default body+7 join-capacity untouched');
    console.log('[roomset-maxuser] disabled path unchanged (Boundary=%d, Default+7=%d) OK', PVE_MAX_PLAYERS, PVE_MAX_PLAYERS);
}

function testEnabledPveSends16() {
    _setPveMaxUserWireModeForTests('enabled');
    try {
        const client = makeFakeClient();
        sendRoomStatePackets(client, makeCtx(true), getExactMessageBuffer);

        const boundaryBody = findBody(client, SN_ROOM_BOUNDARY);
        assert.strictEqual(boundaryBody.readUint8(0x00), 1, 'enabled: Boundary body+0 currentUsers untouched');
        assert.strictEqual(boundaryBody.readUint8(0x01), 16, 'enabled: PvE room Boundary body+1 must be 16');

        const defaultBody = findBody(client, SN_ROOM_DEFAULT);
        assert.strictEqual(defaultBody.readUint8(0x07), PVE_MAX_PLAYERS, 'enabled: join capacity (Default body+7) stays 8');
        console.log('[roomset-maxuser] enabled path: PvE room Boundary=01 10, Default+7 capacity stays 8 OK');
    } finally {
        _setPveMaxUserWireModeForTests('disabled');
    }
}

function testEnabledNonPveUnaffected() {
    _setPveMaxUserWireModeForTests('enabled');
    try {
        const client = makeFakeClient();
        sendRoomStatePackets(client, makeCtx(false), getExactMessageBuffer);

        const boundaryBody = findBody(client, SN_ROOM_BOUNDARY);
        assert.strictEqual(boundaryBody.readUint8(0x01), PVE_MAX_PLAYERS, 'enabled but non-campaign room: Boundary body+1 stays maxPlayers (8)');
        console.log('[roomset-maxuser] enabled path leaves non-PvE rooms alone (Boundary=%d) OK', PVE_MAX_PLAYERS);
    } finally {
        _setPveMaxUserWireModeForTests('disabled');
    }
}

testDisabledUnchanged();
testEnabledPveSends16();
testEnabledNonPveUnaffected();
console.log('[roomset-maxuser] ALL CASES PASS');
