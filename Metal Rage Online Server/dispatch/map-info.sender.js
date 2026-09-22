'use strict';

// H7-MAPINFO-30907 (docs/backlog.md): shared MapInfo_SN (0x00210115) body
// builder. Previously this byte layout was duplicated three times inside
// dispatch/account.dispatch.js (9211 login: DB-missing-account path,
// DB-error fallback path, and the real sendAccountData() path). Extracted
// here, unchanged, so gamelogin.dispatch.js's 30907 resend (MAP_INFO_ON_
// GAME_LOGIN_MODE) can reuse the exact same bytes instead of drifting.
//
// R9 alone (this switch on its own) did not fill the room-settings list --
// needs mapInfoOnGameLoginMode (gamelogin.dispatch.js) on too, since the
// 9211 MapInfo_SN is lost after the scene change and 30907 has to resend
// it. Verified ✅ with both switches on: the map-select popup lists all 4
// PvE maps (docs/state.md H7 row, docs/journal/2026-09-19-1000-maplist-
// single-entry.md, 未經跨公司審查). SWITCH-CONVERGE: default flipped to
// 'enabled'. `let` + accessor (same pattern as room-map.sender.js's
// mapAllSingleEntryMode) so tests can flip it without touching the shipped
// default.
let mapInfoRealIdMode = 'enabled'; // 'disabled' | 'enabled'
const MAP_INFO_REAL_IDS = [9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009, 9010, 9011, 9012];

// PVP-START (2026-09-22 contract, docs/journal/2026-09-22-*-pvp-start-flow.md):
// layer 1 of the three-layer PvP-start gap (docs/research/2026-09-22-d2-tdm/
// pvp-start-gap.md Q2) -- MapInfo_SN never sent any PvP map id, so the
// client's Account_MapList_Check always rejects the 8 TDM maps even when the
// room-scene MapType filter would otherwise let a PvP room through. Same 8
// ids as room.dispatch.js's MAP_IDS_PVP (dispatch/room.dispatch.js:180,
// sourced from Cache.Bin Table 1, see source-tables.md table A footnote) --
// kept as its own copy here rather than a cross-file require, same
// precedent as CAMPAIGN_MAP_ALL_HINTS/ROOM_DEFAULT_ENTRY_HINTS being
// duplicated between room.dispatch.js and gate.game.dispatch.js.
// Default 'disabled': resolveRealMapIds() below returns exactly
// MAP_INFO_REAL_IDS, byte-identical to before this switch existed.
const PVP_START_FLOW_MODE = 'disabled'; // 'disabled' | 'enabled'
const MAP_IDS_PVP = [1011, 1021, 1031, 1041, 1051, 1061, 1071, 1081];

// PVP-TEAM T1 (contract 2026-09-22, docs/design/d2-pvp-tdm.md §7 step T1):
// gates whether Game_User_SN's per-member TeamIndex (rec+0x02) is assigned
// by room join order (0/1/0/1...) for PvP rooms, instead of the current
// PvE-and-PvP-alike hardcoded 0 (docs/research/2026-09-22-d2-tdm/
// pvp-start-gap.md Q5). Single source of truth for this switch, same
// precedent as PVP_START_FLOW_MODE above. Default 'disabled': every
// Game_User_SN TeamIndex write stays byte-identical to before this switch
// existed (golden replay verified).
const PVP_TEAM_ASSIGN_MODE = 'disabled'; // 'disabled' | 'enabled'

const SN_MAP_INFO = 0x210115;

function _setMapInfoRealIdModeForTests(mode) {
    mapInfoRealIdMode = mode;
}

/** Real PvE ids when mapInfoRealIdMode is 'enabled', else null (caller supplies its own legacy list).
 *  PVP_START_FLOW_MODE 'enabled' additionally appends the 8 TDM map ids. */
function resolveRealMapIds() {
    if (mapInfoRealIdMode !== 'enabled') return null;
    return PVP_START_FLOW_MODE === 'enabled'
        ? MAP_INFO_REAL_IDS.concat(MAP_IDS_PVP)
        : MAP_INFO_REAL_IDS;
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

module.exports = { SN_MAP_INFO, MAP_INFO_REAL_IDS, PVP_START_FLOW_MODE, PVP_TEAM_ASSIGN_MODE, MAP_IDS_PVP, resolveRealMapIds, sendMapInfoSN, _setMapInfoRealIdModeForTests };
