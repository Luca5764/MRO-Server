'use strict';

// MAPLIST (docs/backlog.md H6, 2026-09-19): unit test for
// MAP_ALL_SINGLE_ENTRY_MODE in dispatch/room/room-map.sender.js.
//
// Root cause ([SRC] ZPage_Room.uc:654-686 UpdateRoomInfo()): the client
// loops every non-zero MapInfo[] entry in SN_MAP_CHANGE_ALL 0x00220226 with
// no break, so p_PVE.m_Difficulty ends up set from the LAST non-zero entry
// in the list, not the one actually selected. When the switch is enabled,
// the sender should shrink that list to exactly the one map the player
// currently has selected (count=1), so there is nothing left to overwrite
// it with. Disabled must stay byte-for-byte identical to the pre-existing
// full-list behaviour (see test/replay-golden.js's pve-full-match sample,
// which already covers the disabled path end-to-end).
//
// Calls sendRoomMapPackets() directly (same technique as test/room-chat.js
// and test/room-join.js) -- no socket, no server.js, no DB.
//
// Run: node test/map-list-single.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');

const {
    sendRoomMapPackets,
    _setMapAllSingleEntryModeForTests,
} = require('../dispatch/room/room-map.sender.js');

const SN_MAP_CHANGE_ALL = 0x00220226;
const MAP_ALL_ENTRY_OFFSET = 0x02; // MAP_ALL_HEADER_MODE = 'compact'

function getExactMessageBuffer(type, bodySize) {
    const msg = Buffer.alloc(0x10 + bodySize);
    msg.writeUint16BE(msg.length, 0x6);
    msg.writeUint32BE(type, 0xC);
    return [msg, msg.subarray(0x10)];
}

function makeFakeCampaignClient() {
    const sent = [];
    return {
        isTrueCampaign_: true,
        send(msg) {
            sent.push({
                op: msg.readUInt32BE(0xC),
                body: msg.subarray(0x10),
            });
        },
        _sent: sent,
    };
}

/** Pulls every SN_MAP_CHANGE_ALL 0x00220226 body out of a fake client's sent list. */
function allChangeAllBodies(client) {
    return client._sent.filter((p) => p.op === SN_MAP_CHANGE_ALL).map((p) => p.body);
}

function parseEntries(body) {
    const count = body.readUInt8(0x01);
    const entries = [];
    for (let i = 0; i < count; i++) {
        const off = MAP_ALL_ENTRY_OFFSET + i * 9;
        entries.push({
            mapId: body.readUInt16LE(off + 0x00),
            selected: body.readUInt8(off + 0x04),
        });
    }
    return { count, entries };
}

const MAP_IDS_PVE = [9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009, 9010, 9011, 9012];
const SELECTED_MAP_ID = 9005;

function makeCtx() {
    return {
        // D1-4c: sendRoomMapPackets() now gates on ctx.isTrueCampaign, not
        // client.isTrueCampaign_ (dispatch/room/room-map.sender.js) -- the
        // fake client below still carries isTrueCampaign_ for documentation/
        // parity with the real client shape, but the sender no longer reads
        // it.
        isTrueCampaign: true,
        campaignMapCacheKey: SELECTED_MAP_ID,
        campaignMapHints: MAP_IDS_PVE,
        roomDefaultEntryHints: [],
        roomSettingGoal: 0,
        roomSettingTime: 0,
        roomSettingRound: 1,
    };
}

function testDisabledMatchesFullList() {
    _setMapAllSingleEntryModeForTests('disabled');
    const client = makeFakeCampaignClient();
    sendRoomMapPackets(client, makeCtx(), getExactMessageBuffer);

    const bodies = allChangeAllBodies(client);
    assert.strictEqual(bodies.length, 2, 'disabled: expected the existing ALL x2 send');
    for (const body of bodies) {
        const { count, entries } = parseEntries(body);
        assert.strictEqual(count, MAP_IDS_PVE.length, 'disabled: count must stay the full hint list');
        const selectedEntries = entries.filter((e) => e.selected === 1);
        assert.strictEqual(selectedEntries.length, 1, 'disabled: exactly one entry flagged selected');
        assert.strictEqual(selectedEntries[0].mapId, SELECTED_MAP_ID, 'disabled: selected entry must be the chosen map');
    }
    console.log('[map-list-single] disabled path unchanged (count=%d, matches pre-existing full-list behaviour) OK', MAP_IDS_PVE.length);
}

function testEnabledSendsSingleEntry() {
    _setMapAllSingleEntryModeForTests('enabled');
    try {
        const client = makeFakeCampaignClient();
        sendRoomMapPackets(client, makeCtx(), getExactMessageBuffer);

        const bodies = allChangeAllBodies(client);
        assert.strictEqual(bodies.length, 2, 'enabled: ALL x2 send count unaffected (only content narrows)');
        for (const body of bodies) {
            const { count, entries } = parseEntries(body);
            assert.strictEqual(count, 1, 'enabled: SN_MAP_CHANGE_ALL must carry exactly 1 record');
            assert.strictEqual(entries[0].mapId, SELECTED_MAP_ID, 'enabled: the single record must be the currently selected map');
            assert.strictEqual(entries[0].selected, 1, 'enabled: the single record keeps the original selected=1 write');
        }
        console.log('[map-list-single] enabled path sends count=1, mapId=%d OK', SELECTED_MAP_ID);
    } finally {
        _setMapAllSingleEntryModeForTests('disabled');
    }
}

testDisabledMatchesFullList();
testEnabledSendsSingleEntry();
console.log('[map-list-single] ALL CASES PASS');
