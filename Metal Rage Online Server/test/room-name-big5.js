'use strict';

// ROOMNAME-BIG5 (docs/backlog.md contract, docs/journal/2026-09-19-*-room-
// name-big5.md, 🟡, 未經跨公司審查): unit test for ROOM_NAME_RAW_BYTES_MODE
// (dispatch/room/room-string.js, default 'disabled'). Creates a room whose
// Create_CQ 0x00220201 name is real Big5 bytes (測試房間, the exact sample
// from session-20260919-122616.jsonl ms 4742361: `b4fab8d5a9d0b6a1`) and
// checks they round-trip byte-for-byte into Room_Name_SN 0x0022021A and
// Room_List_SN 0x00220204, instead of being mangled to '?' by the default
// ASCII-clamp path.
//
// Same harness technique as test/room-join.js: calls
// ZGateGameDispatch.dispatch() directly against fake clients sharing
// rooms.js's module-level registry, no socket, no server.js.
//
// Run: node test/room-name-big5.js  (exit 0 = pass, exit 1 = fail)

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
const roomString = require('../dispatch/room/room-string.js');

const CQ_CREATE = 0x00220201;
const ROOM_NAME_SN = '0x0022021a';
const ROOM_LIST_SN = '0x00220204';

// Big5 bytes for 測試房間, exactly as observed on the wire
// (session-20260919-122616.jsonl ms 4742361, body+14).
const BIG5_NAME_BYTES = Buffer.from('b4fab8d5a9d0b6a1', 'hex');
const BIG5_NAME_TEXT = '測試房間'; // for the console-log assertion only

/**
 * Builds a CQ_CREATE body (ZDispatchLobby::Create_CQ layout) with a raw
 * byte sequence for the name instead of an ASCII JS string -- see
 * test/room-join.js's makeCreateBody() for the field layout this mirrors.
 */
function makeCreateBodyRawName(nameBytes)
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
    nameBytes.copy(body, 14, 0, Math.min(nameBytes.length, 25));
    body[39] = 0;                     // no password
    return body;
}

function main()
{
    rooms._resetForTests();
    rooms._setRoomJoinModeForTests('enabled');
    rooms._setLobbyRoomListModeForTests('enabled');
    roomString._setRoomNameRawBytesModeForTests('enabled');

    const gate = new GateGameDispatch();

    const clientA = makeFakeClient(1, 30907);
    const clientB = makeFakeClient(2, 30907); // stays in the lobby, gets the Room_List_SN broadcast
    clientA.accountId_ = 1;
    clientB.accountId_ = 2;
    clientA.nickname_ = 'Alice';
    clientB.nickname_ = 'Bob';
    rooms.registerLobbyClientSource([clientA, clientB]);

    const fakeTimers = installFakeTimers();
    try {
        const createHandled = gate.dispatch(clientA, CQ_CREATE, makeCreateBodyRawName(BIG5_NAME_BYTES));
        assert.strictEqual(createHandled, true, 'CQ_CREATE must be handled');

        const roomId = clientA.createdRoomIndex_;
        assert.ok(roomId, 'A must have a createdRoomIndex_ after CQ_CREATE');

        // Room_List_SN went out synchronously (lobby broadcast, same as
        // room-join.js scenario 1) to B, the other lobby client.
        const listEntries = clientB._sent.filter((s) => s.op === ROOM_LIST_SN);
        assert.strictEqual(listEntries.length, 1, 'B must receive exactly one Room_List_SN for the new room');
        {
            const entry = Buffer.from(listEntries[0].hex, 'hex');
            // header: [0] continuation flag, [1] count; entry starts at [2].
            // RoomIndex(2) + UpdateType(1) + RoomNumber(2, UpdateType==1) +
            // FieldMask(2) = 7 bytes before the field data; NAME is the last
            // field (bit9), preceded by ROOM_TYPE(1)+MATCH(2)+USER_COUNT(2)
            // +ROOM_FLAGS(1)+MAP(6)+NAME_INDEX(2) = 14 bytes -- see
            // dispatch/room/room-list.sender.js buildRoomListEntry().
            const nameFieldOffset = 2 + 7 + 14;
            const nameLen = entry.readUInt8(nameFieldOffset);
            const nameBytesOnWire = entry.subarray(nameFieldOffset + 1, nameFieldOffset + 1 + nameLen);
            assert.strictEqual(nameBytesOnWire.equals(BIG5_NAME_BYTES), true,
                `Room_List_SN NAME field must carry the exact Big5 bytes, got ${nameBytesOnWire.toString('hex')}`);
        }
        console.log('[room-name-big5 test] PASS: Room_List_SN NAME field round-trips the exact Big5 bytes');

        // Room_Name_SN is sent from the delayed room-state resend
        // (ROOM_STATE_RETRY_SCHEDULE) -- drain the fake timers, same as
        // test/room-join.js.
        while (fakeTimers.fireNext()) { /* run every pending timer */ }

        const roomNamePackets = clientA._sent.filter((s) => s.op === ROOM_NAME_SN);
        assert.ok(roomNamePackets.length >= 1, 'A must receive at least one Room_Name_SN');
        for (const packet of roomNamePackets) {
            const body = Buffer.from(packet.hex, 'hex');
            const nameBytesOnWire = body.subarray(0, BIG5_NAME_BYTES.length);
            assert.strictEqual(nameBytesOnWire.equals(BIG5_NAME_BYTES), true,
                `Room_Name_SN body must start with the exact Big5 bytes, got ${nameBytesOnWire.toString('hex')}`);
            // Byte past the name must be the NUL terminator (writeAnsiStringField
            // zero-fills the field first, then writes exactly BIG5_NAME_BYTES.length bytes).
            assert.strictEqual(body[BIG5_NAME_BYTES.length], 0, 'byte after the name must be the NUL terminator');
        }
        console.log('[room-name-big5 test] PASS: Room_Name_SN body round-trips the exact Big5 bytes with a NUL terminator');

        // Sanity check the readability helper this same task added: decoding
        // the stored raw-latin1 room name as Big5 recovers the original text.
        const room = rooms.getRoom(roomId);
        const decoded = roomString.decodeBig5ForLog(room.name);
        assert.strictEqual(decoded, BIG5_NAME_TEXT, 'decodeBig5ForLog() must recover 測試房間 from the stored raw bytes');
        console.log('[room-name-big5 test] PASS: decodeBig5ForLog() recovers the original Big5 text for log readability');
    } finally {
        fakeTimers.restore();
        roomString._setRoomNameRawBytesModeForTests('disabled');
        rooms._resetForTests();
    }

    console.log('[room-name-big5 test] ALL CHECKS PASS');
    process.exit(0);
}

main();
