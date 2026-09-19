'use strict';

// H7-MAPINFO-30907 (docs/backlog.md): shared MapInfo_SN (0x00210115) body
// builder. Previously this byte layout was duplicated three times inside
// dispatch/account.dispatch.js (9211 login: DB-missing-account path,
// DB-error fallback path, and the real sendAccountData() path). Extracted
// here, unchanged, so gamelogin.dispatch.js's 30907 resend (MAP_INFO_ON_
// GAME_LOGIN_MODE) can reuse the exact same bytes instead of drifting.
//
// R9 implemented but failed: real PvE ids did not fill the room-settings
// list; another filter, including the PvE user-count range, remains
// unresolved. See docs/journal/2026-09-18-14-map-info-sn-real-ids.md.
// `let` + accessor (same pattern as room-map.sender.js's mapAllSingleEntryMode)
// so tests can flip it without touching the shipped default.
let mapInfoRealIdMode = 'disabled'; // 'disabled' | 'enabled'
const MAP_INFO_REAL_IDS = [9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009, 9010, 9011, 9012];

const SN_MAP_INFO = 0x210115;

function _setMapInfoRealIdModeForTests(mode) {
    mapInfoRealIdMode = mode;
}

/** Real PvE ids when mapInfoRealIdMode is 'enabled', else null (caller supplies its own legacy list). */
function resolveRealMapIds() {
    return mapInfoRealIdMode === 'enabled' ? MAP_INFO_REAL_IDS : null;
}

// Writes and sends SN_MAP_INFO 0x00210115: [u8 0][u8 count][u32 mapId]*count.
function sendMapInfoSN(client, mapIds) {
    const mapCount = mapIds.length;
    const [msg, body] = client.getMessageBuffer(SN_MAP_INFO, 0x2 + (4 * mapCount));
    let offset = 0;
    body[offset++] = 0x00;
    body[offset++] = mapCount;
    for (const mapId of mapIds) {
        body.writeUint32LE(mapId, offset);
        offset += 4;
    }
    client.send(msg);
}

module.exports = { SN_MAP_INFO, MAP_INFO_REAL_IDS, resolveRealMapIds, sendMapInfoSN, _setMapInfoRealIdModeForTests };
