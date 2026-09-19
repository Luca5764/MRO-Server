const NetworkClient = require("../client");
const packetlog = require("../packetlog.js");
const { sendGameUserBootstrap } = require('./room/room-game-user.sender');
// D1 step 1 (docs/design/d1-multiplayer-room.md §6 step 1): write-only Room
// registry, dual-written alongside the existing client.xxx_ fields below.
// Lives outside dispatch/ on purpose — see rooms.js header comment.
const rooms = require('../rooms.js');
// D1-4 (docs/backlog.md): joining an existing room reuses the same
// room-state/room-user sender chain the room creator already gets below,
// plus the lobby room list broadcast that makes a room visible to join.
const { sendRoomStatePackets, sendRoomNameOnly } = require('./room/room-state.sender');
// D1-4c: sendRoomMapPackets top-level import (unlike sendCampaignBootstrap
// below, still lazily required at its one call site) -- room-map.sender.js
// has no requires of its own, so no cycle risk, same as sendRoomStatePackets
// above.
const { sendRoomMapPackets } = require('./room/room-map.sender');
const { sendRoomUserPackets, buildMemberUserCtx, scheduleSelfRecordResend } = require('./room/room-user.sender');
const { broadcastRoomListChange } = require('./room/room-list.sender');
// ROOMNAME-BIG5 (docs/journal/2026-09-19-*-room-name-big5.md, 🟡): shared
// switch (default disabled) for round-tripping Create_CQ's ANSI room
// name/password bytes exactly instead of mangling non-ASCII (e.g. Big5)
// bytes to '?'. See dispatch/room/room-string.js header comment.
const { decodeAnsiBytes, decodeBig5ForLog, isRoomNameRawBytesEnabled, writeAnsiStringField } = require('./room/room-string');
// D1-4 correction (design §4 "斷線即離開"): Leave_CQ and server.js's socket
// close hook now share the same remove-member/Leave_SN/host-reassign path.
const { leaveRoomAndNotify } = require('./room/room-leave');
// D1-6-IMPL (docs/design/d1-step6-battle-broadcast.md §5 step 5): the
// HOST_ADDRESS_REQUIRE_MODE check at the top of case 0x00222103 below needs
// getHostAddress() to decide whether a would-be host of a 2+ member room is
// allowed to start a battle at all.
const whitelist = require('../config/whitelist.js');

// ZGateGameDispatch - Handles Gate-range (0x22XXXX) messages on the GAME server
//
// Key messages:
//   0x00220201 (CQ_CREATE)  - Room creation from lobby
//   0x00220121              - Player name/presence lookup
//   0x00220141              - Gate social request
//   0x00221221              - Hardware/config report (CN - no response needed)
// Room creation uses Lobby Create_SA; ZDispatchRoom 0x22XXXX room state follows after scene change.
//
// via room messages so the client can populate the room UI.

const CQ_CREATE = 0x00220201;
const SA_LOBBY_CREATE = 0x00220202;
// ROOMNAME-BIG5 scope addition [LOG] logs/session-20260919-*.jsonl ms
// 2365887 conn6: host's 房間設定變更 dialog "OK" button sends this CQ with
// a 25-byte ANSI name body, no other fields observed. Its SA is
// 0x00220219, NOT CQ+1 -- breaks this file's usual odd-CQ/even-SA=CQ+1
// pairing, which is why the generic fallback (default case below, keyed on
// type%2) never answered it and the client hung on a loading screen.
// [DLL] confirmed via tools/disasm.py: the client-side sender
// (0x107ee99a-0x107ee9e9, reached through
// execRoom_Name_Change@UZNetwork_DJ 0x1070960b) truncates the name to 0x19
// (25) chars before `Send(buffer, 0x220219)` -- Send()'s 2nd arg is the
// *expected reply opcode*, same convention already noted for Create_CQ's
// Send(...,0x220202) in the CQ_CREATE handler below, not a size.
const CQ_ROOM_NAME_CHANGE = 0x00220218;
const SA_ROOM_NAME_CHANGE = 0x00220219;
const MAP_CHANGE_ONE_RESEND_MODE = 'map_only'; // 'full_room' | 'map_only' | 'none'
// ROOM-OPT-BC (docs/backlog.md): the above resend only ever reaches the
// host's own connection (getExactMessageBuffer/client.send are unicast) --
// [LOG] session-20260919-111258.jsonl ms 2067166: host conn6 sent
// Room_Map_Change_One_CQ 0x00220221, server replied Map_Change_One_SA
// 0x00220222 + Map_Change_One_SN 0x00220223 + Map_Change_All_SN 0x00220226
// x2, all only to conn6; joiner conn8 got nothing, so its difficulty
// display never follows the host's pick. 'enabled' additionally relays the
// same Map_Change_One_SN 0x00220223 payload (unchanged bytes, see the case
// 0x00220221 handler) to the room's other members via rooms.sendOthers.
// SWITCH-CONVERGE: verified live against a real second client
// (docs/journal/2026-09-19-0330-d1-step4-room-join.md), default flipped to
// 'enabled'. `let` + test-only setter below, same pattern as
// ROOM_TEAM_CHAT_MODE further down.
let ROOM_MAP_BROADCAST_MODE = 'enabled'; // 'disabled' | 'enabled'
const GAME_START_HANDSHAKE_MODE = 'ready_then_start'; // 'start_only' | 'ready_then_start'
const READY_HOST_GATE_PRIME_MODE = 'enabled'; // 'disabled' | 'enabled'
const GAME_WAIT_SN_EXPERIMENT_MODE = 'enabled'; // 'disabled' | 'enabled'
const POST_GAME_WAIT_READY_HOST_MODE = 'enabled'; // 'disabled' | 'enabled'
const GAME_INFO_SN_EXPERIMENT_MODE = 'enabled'; // 'disabled' | 'enabled'
const BACK_FROM_ROOM_SA_EXPERIMENT_MODE = 'enabled'; // 'disabled' | 'enabled'
// L1 verified [DLL][LOG][OBS]: 0x00220234 is Leave_CQ (reply 0x00220235 =
// ZDispatchRoom::Leave_SA per dispatch map). Without clearing room state,
// campaignRoom_ survives the return to lobby and the hangar bootstrap
// (ShopList etc.) stays suppressed. See
// docs/journal/2026-09-18-20-room-leave-reset.md.
const READY_HOST_SN_URL_MODE = 'fit'; // 'fit' | 'fixed_0x13'
const GAME_CHAT_ECHO_MODE = 'enabled'; // 'disabled' | 'enabled'
// D1-4: mirrors room.dispatch.js's own ROOM_DEFAULT_ENTRY_HINTS (same
// array). Already-existing duplication precedent in this file --
// CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID above is duplicated the same way
// between the two files, with its own comment explaining why.
const ROOM_DEFAULT_ENTRY_HINTS = [8, 37, 30, 34, 6, 2];

// D1-4c: pulled out of resendRoomMapOnly() so the Enter_CQ joiner send below
// can build the identical Map_Change_ALL hint list without a third copy of
// this array (mirrors room.dispatch.js's own CAMPAIGN_MAP_ALL_HINTS, whose
// selection depends on room-map.sender.js's ROOM_MAP_SYNC_MODE -- lazy
// require, same reasoning as elsewhere in this file: room-map.sender.js is
// only ever require()'d lazily here to avoid a require cycle with
// room.dispatch.js).
function computeCampaignMapAllHints() {
    const { ROOM_MAP_SYNC_MODE } = require('./room/room-map.sender');
    return ROOM_MAP_SYNC_MODE === 'enabled'
        ? [9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009, 9010, 9011, 9012]
        : [8, 37, 30, 34, 43, 6, 2, 26, 36, 43, 16, 24, 45, 47, 49, 14, 10, 22, 52, 30, 18];
}
// D1 step 2 (docs/design/d1-multiplayer-room.md §5/§6 step 2, backlog
// D1-2): client sends the SAME opcode for room chat CQ and SN (observed
// [LOG] session-20260918-225741.jsonl, 258-byte 0x00220505 body; mirrors
// the already-verified 0x00220507/0x00220509 in-game chat echo above).
// 'enabled' relays it to the whole room (0x00220505) or same-team members
// (0x00220503) via rooms.sendAll instead of the old ACK-only fallback; the
// task contract for D1-2 explicitly calls this an intended behaviour
// change (single-player golden sample gets its own chat echoed back) and
// directs re-recording the affected baseline, so this defaults on like
// GAME_CHAT_ECHO_MODE above -- flagging for high-tier review since the
// general backlog rule wants new mid-tier behaviour default OFF.
const ROOM_CHAT_BROADCAST_MODE = 'enabled'; // 'disabled' | 'enabled'
// PM-F1 fix 1 (docs/backlog.md PM-F1, PM ruling): ROOM_CHAT_BROADCAST_MODE
// above was doing double duty for both 0x00220505 (room all-chat, has the
// [LOG] session-20260918-225741.jsonl evidence cited above) and 0x00220503
// (team chat) -- but there is no [LOG]/[DLL] evidence the client actually
// sends 0x00220503 for room team chat; the CN/SN-share-opcode assumption
// for it was only ever an analogy to 0x00220507/0x00220509. Split it into
// its own switch, defaulted OFF, so 0x00220503 keeps the pre-D1-2 fallback
// ACK behaviour until a real 0x00220503 capture justifies turning it on.
let ROOM_TEAM_CHAT_MODE = 'disabled'; // 'disabled' | 'enabled' ('let' only so test/room-chat.js's test-only setter below can flip it; nothing else reassigns it)
// READY-IMPL (docs/backlog.md, analysis docs/research/2026-09-19-ready/notes.md
// READY-FMT/READY-FMT-2, 🟡 未經跨公司審查): a non-host room member pressing
// 準備完畢(F5) sends Game_Ready_CN 0x00222101 [DLL 0x107ef8f0] -- the case
// 0x00222101 handler below. rooms.isRoomReadyStateEnabled() ('disabled' by
// default, see rooms.js) additionally has that handler mark the member ready
// in rooms.js and broadcast User_State_SN 0x00220401 [DLL 0x107eaf30] raw
// state 2 (normalized READY, ZPage_Room.uc:2450) to every room member
// including the presser, so the READY label actually shows up on everyone's
// screen. The switch lives in rooms.js, not here, because room-user.sender.js
// (buildMemberUserCtx, used for the room-state-resend path below too) also
// needs to read it, same reasoning as roomJoinMode/lobbyRoomListMode living
// there instead of in a single dispatch file.
// T1 [DLL] 0x107d4fa7 movzx ebp, word ptr [eax+0x23] (handler body 0x107d4f50):
// Game_Info_SN body+0x13 is TimeLimit in minutes. 'room' makes it follow the
// room's PlayTime (Map_Change_One_CQ 0x00220221 w2, client.mapChangeOneTime_,
// set at the case 0x00220221 handler below) instead of the hardcoded 10.
// See docs/journal/2026-09-18-2334-t1-time-limit.md.
const GAME_INFO_TIME_LIMIT_MODE = 'disabled'; // 'disabled' | 'room'
// When the room state block is re-sent after Create_SA, and why each entry
// costs a room-master dialog. See the comment at the call site.
// Send Game_Info_SN with the room state, so [this+0xfc8] holds the map before
// the player presses start. That is the only way it can be set in time:
// ZPage_Room composes its travel URL the instant the start request goes out,
// a millisecond before anything we send back can arrive.
//
// This was switched off once on the strength of a "blank white window" that
// turned out to be a screenshot cropped to the title bar. There was never a
// blank window; nothing was ever observed to break here.
//
// What the handler does do, per the disassembly, is call Game_Play_Start and
// Scene_Change(6) after setting the map. Whether that is visible or a problem
// in the room is not yet known — nobody has actually watched it happen.
const GAME_INFO_SN_WITH_ROOM_STATE = 'enabled'; // 'disabled' | 'enabled'

// EXPERIMENT — off by default. Server-driven combat entry.
//
// Decompilation (see docs/opcode-ledger.md) shows the host's F5 travel reads
// [0xfc8] in the room scene (5), where nothing can set it, so it always
// travels to map 0 = Store_01 and crashes. Game_Info_SN only sets [0xfc8] in
// scene 1 or 6. Game_Wait_SN (0x420111) is what moves the client from the
// room to scene 6.
//
// So this mode, on the start request, sends Game_Wait_SN FIRST (push to scene
// 6) and then Game_Info_SN (now handled by ZDispatchGame in scene 6, which
// sets the map and calls Game_Play_Start to travel) — giving up the host's
// own F5 travel in favour of a server-driven one.
//
// Untestable statically: whether this beats the client's synchronous
// ZPage_Room.GameStart. Flip to 'enabled' and watch the travel URL in the
// client log — success is "start Map_PC01?...ZModePve...", not Store_01.
const SERVER_DRIVEN_START_MODE = 'enabled'; // 'disabled' | 'enabled'

// D1-6-IMPL (docs/backlog.md, docs/design/d1-step6-battle-broadcast.md §5
// step 1): the host's F5 (Game_Start_CN 0x00222103, case below) currently
// sends Game_User_SN 0x00222112 only to the triggering connection with that
// connection's own data -- in a 2+ member room every other member's client
// never receives ANY player's Game_User_SN, so their in-game player table
// (Game_User_Team_Get's array) stays empty. 'enabled' (additionally requires
// rooms.isRoomJoinEnabled(), same as every other D1-6 switch) sends one
// count=1 packet per room member to EVERY room member's connection instead
// (sendGameUserSnRoomBroadcast() below), each packet's DB loadout/nickname/
// pilot/selectedMech sourced from the packet's *subject* member, not the
// triggering client -- see design doc §2's send-order loop. A 1-person room
// still loops exactly once with target===source===the host's own
// connection, so this is byte-identical to the old single-send path in that
// case (docs/design/d1-step6-battle-broadcast.md §5 step 1's regression
// method). SWITCH-CONVERGE: verified live
// (docs/journal/2026-09-19-0330-d1-step4-room-join.md), default flipped to
// 'enabled'.
let GAME_USER_SN_BROADCAST_MODE = 'enabled'; // 'disabled' | 'enabled'

// D1-6-IMPL (design doc §5 step 2): same F5 sequence's Game_Wait_SN
// 0x00420111, both Game_Info_SN 0x00222111 sends (150ms initial + 600ms
// resend), Game_Ready_SN 0x00222102 and Game_Start_SN 0x00222104 -- all four
// currently reach only the triggering (host) connection. rooms.js's
// isRoomBattleStartBroadcastEnabled() (additionally requires
// rooms.isRoomJoinEnabled()) broadcasts all of them to every room member via
// rooms.sendAll, with Game_Info_SN's body sourced from the Room object
// (design §1 "狀態從 client 搬到 Room") instead of the triggering client --
// see sendGameInfoSnRoomBroadcast() below. Lives on rooms.js, not a local
// `let` here, because lobby.dispatch.js's BeginRound_SN 0x00230152 (case
// 0x00230151, design §1 row 10) shares the same switch. A 1-person room's
// rooms.sendAll iterates one member, byte-identical to the old single-send
// path (same design doc §5 step 2 regression method). Default 'disabled'.

// D1-6-IMPL (design doc §5 step 4, §1 rows 6-9): Ready_Host_SQ 0x00420113
// only ever goes to whichever connection triggered 0x00222103 -- correct
// today because that connection is always the room's only member, but not
// necessarily the host once a 2+ member room exists. 'enabled' (additionally
// requires rooms.isRoomJoinEnabled()) sends Ready_Host_SQ to the room's
// tracked host connection specifically (room.hostAccountId), and has the
// community.dispatch.js 0x00420114 (Ready_Host_CA) handler additionally send
// Ready_Host_SN 0x00420115 + Ready_Success_SN 0x00420116 to every non-host
// member once the host's CA reports its listen port -- see
// sendReadyHostSnToRoomMember() below and community.dispatch.js. Read by
// both this file and community.dispatch.js, so it lives on rooms.js (same
// reasoning as roomReadyStateMode there). Default 'disabled'.

// D1-6-IMPL (design doc §5 step 5, §3.2): the host's account needs a
// configured hostAddress (config/allowed-users.json, config/whitelist.js
// getHostAddress()) before a 2+ member room can battle-start at all, and a
// non-host connection must never be able to trigger the start sequence in
// the first place. 'enabled' (additionally requires rooms.isRoomJoinEnabled())
// adds both checks to the very top of the case 0x00222103 handler below,
// before anything is sent. SWITCH-CONVERGE: verified live
// (docs/journal/2026-09-19-0330-d1-step4-room-join.md), default flipped to
// 'enabled'.
let HOST_ADDRESS_REQUIRE_MODE = 'enabled'; // 'disabled' | 'enabled'

// Map_PC01 easy — the campaign room's default until the client picks another.
const MAP_ID_DEFAULT_CAMPAIGN = 9001;

const ROOM_STATE_RETRY_SCHEDULE = [
    [350, 'delayed'],
    [1200, 'retry after scene change'],
];

// D1 step 1: room id generation moved into rooms.js (rooms.allocateRoomId,
// below at CQ_CREATE) so the counter survives a dispatch/ /reload the same
// way the Room object it now tags does. Same rule as before: increments
// from 1, never reused.

// 0x220221 carries a 10-byte payload. For 0x220222, the enabled path adds
// the 6-byte zero success header required by ZDispatchRoom::Map_Change_One_SA
// at 0x107eb510, then places the same payload at body+0x06. The disabled path
// preserves the old 10-byte body with the payload at body+0x00.
//
// R3b verified: the 6-byte zero success header prevents the client error.
// Evidence: docs/journal/2026-09-18-10-map-change-one-sa.md.
const MAP_CHANGE_SA_ECHO_MODE = 'enabled'; // 'disabled' | 'enabled'
const MAP_CHANGE_ONE_SA_EXPERIMENT = {
    mode: 'manual',  // SA에 현재 선택된 맵 캐시키를 반환 (returns the currently selected map cache key in the SA)
    manual: {
        b0: 0,
        w1: 'current_cache',  // CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID[mapId]로 resolve됨 (resolved via CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID[mapId])
        w2: 0,
        b5: 0,
        w6: 0,
        w8: 0,
    },
};
// Cache.Bin에서 추출한 맵 인덱스 매핑 (map index mapping extracted from Cache.Bin)
// map_id(DB) → cacheIndex(Cache.Bin)
const CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID = {
    0: 1,   // Map_Ptuto  (튜토리얼 / tutorial)
    1: 8,   // Map_C01
    2: 34,  // Map_C02
    3: 83,  // Map_C03
    4: 32,  // Map_C04
    5: 58, // Map_PC01 (캠페인 기본 - Map_C05는 클라이언트에 없음) (campaign default - Map_C05 does not exist in the client)
    6: 6,   // Map_C06
    7: 2,   // Map_C08
    8: 26,  // Map_C09
    9: 36,  // Map_C18
    10: 43, // Map_C19
    11: 16, // Map_C20
    12: 24, // Map_C21
    13: 45, // Map_C22
    14: 47, // Map_C25
    15: 49, // Map_C30
    16: 14, // Map_N01
    17: 10, // Map_N05
    18: 22, // Map_N07
    19: 52, // Map_N11
    20: 30, // Map_N13
    21: 18, // Map_N17
    22: 58, // Map_PC01
    23: 70, // Map_PC02
    24: 64, // Map_PC03
    25: 77, // Map_PC04
};

function getExactMessageBuffer(type, bodySize)
{
    const msg = Buffer.alloc(0x10 + bodySize);
    msg.writeUint16BE(msg.length, 0x6);
    msg.writeUint32BE(type, 0xC);
    return [msg, msg.subarray(0x10)];
}

function normalizeIpv4(address)
{
    const raw = String(address || '').trim();
    if (!raw) return '127.0.0.1';
    if (raw === '::1') return '127.0.0.1';
    if (raw.startsWith('::ffff:')) return raw.slice(7);
    return raw;
}

function sendOkSa(client, type, tag)
{
    const [msg, respBody] = getExactMessageBuffer(type, 0x06);
    respBody.writeUint16LE(0, 0x00);
    respBody.writeUint32LE(0, 0x02);
    client.send(msg);
    console.log(`[ZGateGameDispatch] >> Sent ${tag} 0x${type.toString(16).padStart(8, '0')} (status=0, result=0)`);
}

function sendReadyHostSq(client)
{
    const [msg, respBody] = getExactMessageBuffer(0x00420113, 0x06);
    respBody.writeUint16LE(0, 0x00);
    respBody.writeUint32LE(0, 0x02);
    client.send(msg);
    console.log(`[ZGateGameDispatch] >> Sent Ready_Host_SQ 0x00420113 (status=0, result=0)`);
}

const CACHE_INDEX_TO_MAP_NAME_GG = {
    58: 'Map_PC01', 70: 'Map_PC02', 64: 'Map_PC03', 77: 'Map_PC04',
    8: 'Map_C01', 34: 'Map_C02', 83: 'Map_C03', 32: 'Map_C04',
    6: 'Map_C06', 2: 'Map_C08', 26: 'Map_C09', 36: 'Map_C18',
    43: 'Map_C19', 16: 'Map_C20', 24: 'Map_C21',
    14: 'Map_N01', 10: 'Map_N05', 22: 'Map_N07', 30: 'Map_N13', 18: 'Map_N17',
    1: 'Map_Ptuto',
};

// RHSN-MAP: real Cache.Bin map id -> map name, keyed by the ids
// room.dispatch.js's MAP_IDS_PVE/MAP_IDS_PVP actually send (9001..9012,
// 1011..1081) -- NOT the invented cache indexes CACHE_INDEX_TO_MAP_NAME_GG
// above uses. Every entry independently re-derived and verified two ways:
//   1. [CACHE] Direct read of
//      /mnt/c/Games/MetalRage Online/data/System/Cache.Bin: for each id,
//      located its 4-byte LE id, then the length-prefixed ASCII name string
//      (1 length byte incl. terminator + name + '\0') sitting ~32-34 bytes
//      after it -- same "name near the id's bytes" record layout
//      room.dispatch.js's own comment (~line 174) describes. 9001-9003 and
//      9010 match the two anchors this task was given (9001-3 = Map_PC01
//      per room.dispatch.js's comment; 9010 = Map_PC04 per the host's own
//      MetalRage.log ClientTravel URL, [LOG] session-20260919-150041.jsonl).
//   2. Cross-checked against the pre-existing, independently-sourced
//      docs/gemini-gameinfo-findings.md table (ZNetwork.dll disassembly +
//      Cache.Bin, journal docs/journal/2026-09-15-10-map-id-always-wrong-root-cause.md's
//      "14/14 verified" set) -- identical names for every id below,
//      including the two odd PvP ones (1041/1051, see note).
// PvE ids come in groups of 3 (easy/mid/hard), matching
// ZPanel_PVE.uc:328's `(MapIndex-9001)/3` grouping.
// 1041 and 1051's own Cache.Bin name fields genuinely are 'Map_N05_de' and
// 'Desert' (not 'Map_N05'/'Map_DesertStorm') -- length-prefixed string
// bytes checked exactly, not a truncation artifact. Both flagged 🟡 in
// docs/journal/2026-09-19-0330-d1-step4-room-join.md pending review, since
// no real second client has confirmed the client accepts these two names.
const MAP_ID_TO_MAP_NAME_GG = {
    9001: 'Map_PC01', 9002: 'Map_PC01', 9003: 'Map_PC01',
    9004: 'Map_PC03', 9005: 'Map_PC03', 9006: 'Map_PC03',
    9007: 'Map_PC02', 9008: 'Map_PC02', 9009: 'Map_PC02',
    9010: 'Map_PC04', 9011: 'Map_PC04', 9012: 'Map_PC04',
    1011: 'Map_C08', 1021: 'Map_C06', 1031: 'Map_C01',
    1041: 'Map_N05_de', 1051: 'Desert', 1061: 'Map_N01',
    1071: 'Map_C20', 1081: 'Map_N17',
};

// D1-6-IMPL (design doc §5 step 4): body-building shared by sendReadyHostSn()
// (below, unchanged single-target behaviour) and
// sendReadyHostSnToRoomMember() (community.dispatch.js's non-host send).
// Pulled out verbatim from the old sendReadyHostSn() body -- same
// truncation-warning comment/logic, just parameterized instead of reading
// straight off a `client`.
function buildReadyHostSnMsg(ip, port, mapCacheKey, ipOnly = false)
{
    // RHSN-MAP: mapCacheKey is a real Cache.Bin map id (9001..9012,
    // 1011..1081, from room.mapId -- community.dispatch.js's
    // sendReadyHostSnToRoomMember caller) for every id range
    // MAP_ID_TO_MAP_NAME_GG covers, so try that table first. Only fall back
    // to the legacy invented-cache-index table (CACHE_INDEX_TO_MAP_NAME_GG)
    // when the key isn't one of those real ids -- the two tables' key
    // ranges never overlap (real ids are all >= 1011, legacy indexes are
    // all <= 83), so this can't misfire on either caller.
    const mapName = MAP_ID_TO_MAP_NAME_GG[mapCacheKey]
        || CACHE_INDEX_TO_MAP_NAME_GG[mapCacheKey]
        || 'Map_PC01';
    // 실제 서버: IP:Port/MapName?team=0 형식으로 ClientTravel (real server: ClientTravel in IP:Port/MapName?team=0 format)
    // ip 필드에 "IP/MapName" 형식으로 전달 시도 (attempt to pass in "IP/MapName" format in the ip field)
    // RHSN-IP: the client itself builds "%s:%d/%s" from this field, the
    // port and its own map, and keeps only the first 15 chars of the field.
    // [LOG] laptop MetalRage.log 2026-09-19 15:20:49 (joiner): we sent
    // "192.168.1.105/Map_PC04" and the client did
    //   [ ZPage_Room ][ GameStart ]  start 192.168.1.105/M:30907/Map_PC04?team=0
    //   Browse: 192.168.1.105/M:30907?team=0?Name=4#Map_PC04 -> Attemp LoadMap Failed
    // So the multi-member path (ipOnly) sends the bare IP. The legacy
    // single-connection path keeps the old "IP/Map" string unchanged.
    const ipWithMap = ipOnly ? ip : ip + '/' + mapName;

    // The body was a fixed 0x13, leaving 16 bytes for the string after the
    // port and the zero byte, and the write was additionally capped at 0x10.
    // "127.0.0.1/Map_PC01" is 18 characters, so what actually went out was
    // "127.0.0.1/Map_PC" with no terminator: a map name that does not exist.
    //
    // Observed 2026-09-15: the client took that URL, began ClientTravel, and
    // crashed tearing down the hangar level —
    //   Actor not found: HangarPlayerController Store_01.HangarPlayerController
    //   ULevel::DestroyActor <- DissociateViewports_BD <- UGameEngine::LoadMap
    //     <- LocalMapURL <- UGameEngine::Browse <- ClientTravel
    // which is LoadMap failing on a map that is not there.
    //
    // 'fit' sizes the body to hold the whole string. Whether the real packet
    // was variable-length or a larger fixed field is not known; this is a
    // probe. 'fixed_0x13' restores the old size if the client rejects it.
    const urlBytes = Buffer.byteLength(ipWithMap, 'ascii');
    const bodySize = READY_HOST_SN_URL_MODE === 'fit'
        ? 0x03 + urlBytes + 1
        : 0x13;

    const [msg, respBody] = getExactMessageBuffer(0x00420115, bodySize);
    respBody.writeUInt16LE(port, 0x00);
    respBody.writeUInt8(0, 0x02);

    const roomForBytes = respBody.length - 0x03;
    const written = respBody.write(ipWithMap + '\0', 0x03, Math.min(urlBytes + 1, roomForBytes), 'ascii');

    return { msg, ipWithMap, bodySize, written, urlBytes };
}

function sendReadyHostSn(client)
{
    const ip = normalizeIpv4(client.socket_ && client.socket_.localAddress);
    const port = 30907;
    const mapCacheKey = Number(client.campaignMapCacheKey_) || 58;
    const { msg, ipWithMap, bodySize, written, urlBytes } = buildReadyHostSnMsg(ip, port, mapCacheKey);

    if (written < urlBytes + 1)
        console.log(`[ZGateGameDispatch] !! Ready_Host_SN URL TRUNCATED: wrote ${written} of ${urlBytes + 1} bytes — client will travel to a map that does not exist`);

    client.send(msg);
    console.log(`[ZGateGameDispatch] >> Sent Ready_Host_SN 0x00420115 ip=${ipWithMap} port=${port} (mode=${READY_HOST_SN_URL_MODE}, body=0x${bodySize.toString(16)})`);
}

// D1-6-IMPL (design doc §5 step 4, §1 row 8): community.dispatch.js's
// 0x00420114 (Ready_Host_CA) handler calls this for each non-host room
// member once READY_HOST_SPLIT_MODE is on -- `ip` is the host's configured
// hostAddress (config/whitelist.js getHostAddress(), design §3.1), `port` is
// the u16 LE the host's own Ready_Host_CA body+0x06 reported (its real
// listen port -- see battle-host.md's DLL note, not hardcoded 30907 the way
// sendReadyHostSn() above still is for the single-connection path).
function sendReadyHostSnToRoomMember(targetClient, ip, port, mapCacheKey)
{
    const { msg, ipWithMap, bodySize, written, urlBytes } = buildReadyHostSnMsg(ip, port, mapCacheKey, true);

    if (written < urlBytes + 1)
        console.log(`[ZGateGameDispatch] !! Ready_Host_SN URL TRUNCATED (room member): wrote ${written} of ${urlBytes + 1} bytes — client will travel to a map that does not exist`);

    targetClient.send(msg);
    console.log(`[ZGateGameDispatch] >> Sent Ready_Host_SN 0x00420115 (room member) ip=${ipWithMap} port=${port} (mode=${READY_HOST_SN_URL_MODE}, body=0x${bodySize.toString(16)})`);
}

function sendRoomGameWaitSn(client, tag)
{
    const [msg] = getExactMessageBuffer(0x00420111, 0x00);
    client.send(msg);
    console.log(`[ZGateGameDispatch] >> Sent Game_Wait_SN 0x00420111 [${tag}]`);
}

// Game_User_SN, sent from here rather than from room state because the handler
// is ZDispatchGame's and only runs in scene 6. The context the room build needs
// is small enough to assemble from the client; the sender reads the equipped
// loadout out of the database itself.
function sendGameUserSn(client, tag)
{
    const ctx = {
        accountIndex: Number(client.accountIndex_ || client.accountId_ || 1),
        nickname: client.nickname_ || 'Player',
        userLevelText: '1',
        // Must match one of the two values Game_Info_SN puts in [0xffc] and
        // [0x1000], which Game_Play_Start copies to [0xff0] and [0xff4]. We
        // send red=0 there, so team 0 resolves to red instead of 255.
        teamIndex: 0,
        selectedMech: Number(client.currentHangarSlot_) || 1,
        pilotId: Number(client.pilot_) || 101,
    };
    console.log(`[ZGateGameDispatch] >> Game_User_SN [${tag}]`);
    return Promise.resolve(sendGameUserBootstrap(client, ctx, getExactMessageBuffer))
        .catch(err => console.error(`[ZGateGameDispatch] >> Game_User_SN failed: ${err.message}`));
}

// D1-6-IMPL (design doc §5 step 1, §2): GAME_USER_SN_BROADCAST_MODE's
// enabled path. Per design §2's send-order loop, every room member's
// connection (`target`) gets one count=1 Game_User_SN per room member
// (`source`), each packet's DB loadout/nickname/pilot/selectedMech read off
// that `source` member -- never the triggering client -- so a joiner's own
// mech shows up on the host's screen and vice versa. Deliberately never
// batches more than one record per packet (game-user-sn-multi.md: N>=3
// records already exceeds the client's 0x400 frame cap).
//
// SOL-REVIEW-2 point 2 (docs/research/2026-09-19-sol-review/batch2.md)
// asked to also move this whole batch to *after* the target's own
// Game_Info_SN (150ms) instead of staying in the existing 60ms-after-Wait
// slot. Deliberately NOT done: the same review's point 1 confirms the
// single-player path -- this exact 60ms slot, unchanged since before D1-6
// -- already works byte-identically today, and moving it risks exactly the
// "changed two variables at once" failure mode AGENTS.md warns against, for
// a slot that is not what the review actually flagged as broken. What the
// review's point 2 actually objected to (see below) is fixed without
// touching timing: every packet in a target's N-packet sequence is now
// awaited in strict order (no more fire-and-forget `Promise.resolve().catch()`
// letting DB completions interleave arbitrarily), and room/target/source
// membership is re-read from the live registry immediately before each
// send, so a member who leaves mid-loop (their own multi-await DB lookup
// included) cannot still receive a packet or be sent as a stale record.
//
// SOL-REVIEW-2 point 7: `expectedGen`, when passed, is the room's
// battleStartGen captured by the case 0x00222103 handler at accept time
// (see battleStartStillValid() there) -- checked fresh alongside the room
// lookup on every packet, so a newer Game_Start_CN superseding this one
// mid-loop stops this batch too, not just the setTimeout callback that
// kicked it off. Optional (undefined skips the check) so the existing
// test/extra-lives.js-style direct callers of the underlying
// sendGameUserBootstrap() are unaffected -- this function has no other
// caller today besides the one guarded setTimeout callback, but the
// parameter is optional on principle (no implicit dependency on the caller
// always having a generation to pass).
async function sendGameUserSnRoomBroadcast(room, tag, expectedGen)
{
    const targetAccountIds = Array.from(room.members.keys());
    const sourceAccountIdsSnapshot = Array.from(room.members.keys());

    for (const targetAccountId of targetAccountIds) {
        for (const sourceAccountId of sourceAccountIdsSnapshot) {
            // Re-read the room fresh before every single packet -- not just
            // once per target -- because each await below is a point where
            // a leave/disconnect can land.
            const currentRoom = rooms.getRoom(room.id);
            if (!currentRoom) {
                console.log(`[ZGateGameDispatch] >> Game_User_SN room broadcast aborted: room #${room.id} no longer tracked [${tag}]`);
                return;
            }
            if (expectedGen !== undefined && currentRoom.battleStartGen !== expectedGen) {
                console.log(`[ZGateGameDispatch] >> Game_User_SN room broadcast aborted: room #${room.id}'s battleStartGen changed (${expectedGen} -> ${currentRoom.battleStartGen}) mid-batch [${tag}]`);
                return;
            }
            const currentTarget = currentRoom.members.get(targetAccountId);
            if (!currentTarget || !currentTarget.client) {
                // Target is gone/disconnected -- nothing left to send it for
                // any source, skip straight to the next target.
                break;
            }
            const currentSource = currentRoom.members.get(sourceAccountId);
            if (!currentSource) continue;

            const sourceClient = currentSource.client;
            const ctx = {
                accountIndex: Number(currentSource.accountId),
                nickname: currentSource.nickname || 'Player',
                teamIndex: 0,
                userLevelText: '1',
                selectedMech: Number(sourceClient && sourceClient.currentHangarSlot_) || 1,
                pilotId: Number(sourceClient && sourceClient.pilot_) || 101,
            };
            console.log(`[ZGateGameDispatch] >> Game_User_SN [room #${currentRoom.id} broadcast, target=${currentTarget.accountId}, source=${currentSource.accountId}, ${tag}]`);
            try {
                // Awaited in order -- see the function comment above for why
                // this replaced the old fire-and-forget send.
                await sendGameUserBootstrap(currentTarget.client, ctx, getExactMessageBuffer, {
                    sendTo: currentTarget.client,
                    itemsAccountId: currentSource.accountId,
                });
            } catch (err) {
                console.error(`[ZGateGameDispatch] >> Game_User_SN (room broadcast) failed: ${err.message}`);
            }
        }
    }
}

// R-ROUND (docs/backlog.md): the "target round for this map" value. Shared
// by sendGameInfoSn's body+0x15 below (Game_Info_SN's MapInfo.Round) and
// lobby.dispatch.js's Campaign_CN handler, which needs the same number to
// know whether a Campaign_CN success is the last round -- extracted rather
// than recomputed independently in both files, so PVE_ROUND_ADVANCE_MODE
// cannot see a different round count than what Game_Info_SN already told
// the client.
function getGameInfoRound(client)
{
    return Number(client.playRound_) || 0;
}

function sendGameInfoSn(client, tag)
{
    const BODY_SIZE = 0x1A;
    const [msg, body] = getExactMessageBuffer(0x00222111, BODY_SIZE);

    const mapId = Number(client.campaignMapCacheKey_ || CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID[client.mapId_] || client.mapId_ || 58) & 0xFFFF;  // Cache.Bin 인덱스로 전송 (sent as Cache.Bin index)
    const userIndex = Number(client.accountIndex_ || client.accountId_ || 1) & 0xFFFF;
    const battleIndex = 1;
    // Game_User_Team_Get compares the user's team value against these two and
    // answers 0, 1, or 255 when it matches neither. Sending red=1/blue=0 made
    // a player on team 0 resolve as blue; red=0/blue=1 makes team 0 mean red.
    const redTeamIndex = 0;
    const blueTeamIndex = 1;
    const clanFlag = 0;

    // Every offset below is now read out of the real handler rather than
    // guessed. ZDispatchGame::Game_Info_SN (thunk 0x107079af -> 0x107d4f50)
    // pulls ten values out of the body and hands them to Game_Info_Set and
    // Game_Info_Team_Set; the argument order came from the assembly, because
    // the decompiler transposes p2/p3 and p8/p9 on that call.
    //
    //   Game_Info_Set(p1..p10):
    //     p1  body+0x00 u32   -> [0xfc0]  battle index
    //     p2  body+0x0E u8    -> [0xfc4] bit0   (bool)
    //     p3  body+0x0F u16==2-> [0xfc4] bit1   (bool)
    //     p4  body+0x0A u16   -> [0xfe0]
    //     p5  body+0x0C u16   -> [0xfe4]
    //     p6  body+0x11 u16   -> [0xfc8]  MAP ID
    //     p7  body+0x13 u16   -> [0xfd4]  TIME LIMIT, in minutes
    //     p8  body+0x16 u16   -> [0xfd8]  goal score, modes 0 and 1
    //     p9  body+0x18 u16   -> [0xfdc]  goal score, mode 5
    //     p10 body+0x15 u8    -> [0xfd0]  goal score, modes 4, 6 and 7
    //   Game_Info_Team_Set(body+0x04 u16, body+0x06 u16) -> [0xffc], [0x1000]
    //
    // Game_Info_URL_Get then reads [0xfc8] for the map, [0xfd4] for
    // TimeLimit, and one of [0xfd0]/[0xfd8]/[0xfdc] for GoalScore, choosing by
    // [0xfcc] — the mode, which Game_Info_Set copies out of the Cache.Bin
    // entry for the map, not out of this packet. Cache.Bin on disk is
    // variable-length, so rather than work out which of the three fields this
    // map's mode will read, all three carry the same value.
    //
    // Game_Play_Start runs at the end of the handler and copies [0xffc] and
    // [0x1000] into [0xff0] and [0xff4], which is what Game_User_Team_Get
    // compares a player's team against.
    // Triggered by the client pressing F5 to start the match (this handler
    // fires from the game-start sequence above and from the scene-6 map
    // resend timers). Default stays hardcoded 10; GAME_INFO_TIME_LIMIT_MODE
    // 'room' switches it to the room's PlayTime, preferring
    // client.mapChangeOneTime_ (set if the player actually changed the map
    // in-room via Map_Change_One_CQ 0x00220221, see the case below), then
    // falling back to client.createPlayTime_ (the room's PlayTime as sent
    // at Create_CQ 0x00220201, for the case where the room starts without
    // ever touching the map/difficulty setting -- PM-F1 fix 2, same field
    // and unit as mapChangeOneTime_, see the comment at CQ_CREATE), and only
    // then the hardcoded 10. See "trap" comment on the switch decl.
    let timeLimitMinutes = 10;
    let timeLimitSource = 'hardcoded';
    if (GAME_INFO_TIME_LIMIT_MODE === 'room') {
        if (client.mapChangeOneTime_) {
            timeLimitMinutes = client.mapChangeOneTime_;
            timeLimitSource = 'mapChangeOne';
        } else if (client.createPlayTime_) {
            timeLimitMinutes = client.createPlayTime_;
            timeLimitSource = 'create';
        }
    }
    const goalScore = 0;

    body.writeUInt32LE(battleIndex, 0x00);      // -> [0xfc0]  battle index
    body.writeUInt16LE(redTeamIndex, 0x04);     // -> [0xffc]  -> [0xff0], team 0
    body.writeUInt16LE(blueTeamIndex, 0x06);    // -> [0x1000] -> [0xff4], team 1
    body.writeUInt16LE(0, 0x0A);                // -> [0xfe0], purpose unknown
    body.writeUInt16LE(0, 0x0C);                // -> [0xfe4], purpose unknown
    body.writeUInt8(clanFlag, 0x0E);            // -> [0xfc4] bit0
    body.writeUInt16LE(2, 0x0F);                // == 2 -> [0xfc4] bit1
    body.writeUInt16LE(mapId, 0x11);            // -> [0xfc8], MAP ID
    body.writeUInt16LE(timeLimitMinutes, 0x13); // -> [0xfd4], TimeLimit=%d
    // [0xfd0] is GAME_INFO.MapInfo.Round (handler log string 0x1083a240 names body+0x15 "Round").
    // ZModePve.ModeReset_BD returns without starting any round while CurrentRound >= Round,
    // so 0 here meant the PvE round system (AI, objectives) never started.
    const playRound = getGameInfoRound(client);
    body.writeUInt8(playRound & 0xFF, 0x15);    // -> [0xfd0], MapInfo.Round
    body.writeUInt16LE(goalScore, 0x16);        // -> [0xfd8], goal score 0/1
    body.writeUInt16LE(goalScore, 0x18);        // -> [0xfdc], goal score 5

    client.send(msg);
    console.log(
        `[ZGateGameDispatch] >> Sent Game_Info_SN 0x00222111 [${tag}] ` +
        `(battle=${battleIndex}, red=${redTeamIndex}, blue=${blueTeamIndex}, map=${mapId}, ` +
        `clan=${clanFlag}, user=${userIndex}, timeLimit=${timeLimitMinutes} (${timeLimitSource}), round=${playRound}, goal=${goalScore}, ` +
        `body=${body.toString('hex')})`
    );
}

// D1-6-IMPL (design doc §5 step 2): ROOM_BATTLE_START_BROADCAST_MODE's
// enabled path for Game_Wait_SN 0x00420111 -- a fresh 0-byte-body buffer per
// call (rooms.sendAll's build() contract), sent to every room member.
function sendRoomGameWaitSnBroadcast(room, tag)
{
    rooms.sendAll(room.id, () => {
        const [msg] = getExactMessageBuffer(0x00420111, 0x00);
        return msg;
    });
    console.log(`[ZGateGameDispatch] >> Broadcast Game_Wait_SN 0x00420111 to room #${room.id} (${room.members.size} member(s)) [${tag}]`);
}

// D1-6-IMPL (design doc §5 step 2): ROOM_BATTLE_START_BROADCAST_MODE's
// enabled path for Game_Ready_SN 0x00222102 / Game_Start_SN 0x00222104 --
// both consume the same trivial "status=0,result=0" ACK body as sendOkSa()
// above; kept as a separate small builder (not a refactor of sendOkSa, which
// is still used unicast elsewhere) so rooms.sendAll's build() contract (a
// fresh Buffer per member) is satisfied.
function sendAckBroadcast(room, type, tag)
{
    rooms.sendAll(room.id, () => {
        const [msg, respBody] = getExactMessageBuffer(type, 0x06);
        respBody.writeUint16LE(0, 0x00);
        respBody.writeUint32LE(0, 0x02);
        return msg;
    });
    console.log(`[ZGateGameDispatch] >> Broadcast 0x${type.toString(16).padStart(8, '0')} to room #${room.id} (${room.members.size} member(s), status=0, result=0) [${tag}]`);
}

// D1-6-IMPL (design doc §5 step 2, §1 row 4): ROOM_BATTLE_START_BROADCAST_MODE's
// enabled path for Game_Info_SN 0x00222111. Unlike Game_User_SN (per-member
// data), Game_Info_SN's body carries no per-user field at all (see the field
// table in sendGameInfoSn() above) -- it is room-level state (map/time
// limit/round), so the identical body goes to every member. Sourced from the
// Room object (room.mapId/room.playTime/room.playRound), which
// CQ_CREATE/Map_Change_One_CQ (case 0x00220221 below) already dual-write
// alongside the equivalent client.xxx_ fields sendGameInfoSn() reads, so for
// a 1-person room this produces the identical bytes sendGameInfoSn(client,
// tag) would (see that dual-write's own comments for why they always agree
// for a room's own host).
function sendGameInfoSnRoomBroadcast(room, tag)
{
    const BODY_SIZE = 0x1A;
    const mapId = Number(room.mapId || MAP_ID_DEFAULT_CAMPAIGN) & 0xFFFF;
    const battleIndex = 1;
    const redTeamIndex = 0;
    const blueTeamIndex = 1;
    const clanFlag = 0;
    // GAME_INFO_TIME_LIMIT_MODE is 'disabled' by default (out of D1-6-IMPL's
    // scope) -- when it stays 'disabled' this is hardcoded 10, exactly like
    // sendGameInfoSn() above. 'room' mirrors that function's
    // client.mapChangeOneTime_ fallback with room.playTime, the room-level
    // field Map_Change_One_CQ dual-writes it from (see rooms.js's Room
    // typedef and the case 0x00220221 handler below).
    let timeLimitMinutes = 10;
    let timeLimitSource = 'hardcoded';
    if (GAME_INFO_TIME_LIMIT_MODE === 'room' && room.playTime) {
        timeLimitMinutes = room.playTime;
        timeLimitSource = 'room';
    }
    const playRound = Number(room.playRound) || 0;
    const goalScore = 0;

    rooms.sendAll(room.id, () => {
        const [msg, body] = getExactMessageBuffer(0x00222111, BODY_SIZE);
        body.writeUInt32LE(battleIndex, 0x00);
        body.writeUInt16LE(redTeamIndex, 0x04);
        body.writeUInt16LE(blueTeamIndex, 0x06);
        body.writeUInt16LE(0, 0x0A);
        body.writeUInt16LE(0, 0x0C);
        body.writeUInt8(clanFlag, 0x0E);
        body.writeUInt16LE(2, 0x0F);
        body.writeUInt16LE(mapId, 0x11);
        body.writeUInt16LE(timeLimitMinutes, 0x13);
        body.writeUInt8(playRound & 0xFF, 0x15);
        body.writeUInt16LE(goalScore, 0x16);
        body.writeUInt16LE(goalScore, 0x18);
        return msg;
    });
    console.log(
        `[ZGateGameDispatch] >> Broadcast Game_Info_SN 0x00222111 to room #${room.id} (${room.members.size} member(s)) [${tag}] ` +
        `(battle=${battleIndex}, red=${redTeamIndex}, blue=${blueTeamIndex}, map=${mapId}, ` +
        `clan=${clanFlag}, timeLimit=${timeLimitMinutes} (${timeLimitSource}), round=${playRound}, goal=${goalScore})`
    );
}

function scheduleGameWaitSnExperiment(client)
{
    if (GAME_WAIT_SN_EXPERIMENT_MODE !== 'enabled') {
        return;
    }
    if (!client.campaignStarted_) {
        console.log(`[ZGateGameDispatch] >> Skipped Game_Wait_SN experiment (campaignStarted_=false)`);
        return;
    }
    if (client.gameWaitExperimentSent_) {
        console.log(`[ZGateGameDispatch] >> Skipped Game_Wait_SN experiment (already scheduled for this start)`);
        return;
    }

    client.gameWaitExperimentSent_ = true;
    sendRoomGameWaitSn(client, 'experiment immediate after Game_Start_SN');
    setTimeout(() => {
        sendRoomGameWaitSn(client, 'experiment retry @75ms before Game_Info_SN');
    }, 75);
}

function schedulePostGameWaitReadyHost(client)
{
    if (POST_GAME_WAIT_READY_HOST_MODE !== 'enabled') {
        return;
    }
    if (!client.campaignStarted_) {
        console.log(`[ZGateGameDispatch] >> Skipped post-Game_Wait Ready_Host (campaignStarted_=false)`);
        return;
    }
    if (client.postGameWaitReadyHostSent_) {
        console.log(`[ZGateGameDispatch] >> Skipped post-Game_Wait Ready_Host (already scheduled)`);
        return;
    }

    client.postGameWaitReadyHostSent_ = true;
    setTimeout(() => {
        sendReadyHostSq(client);
    }, 160);
    setTimeout(() => {
        sendReadyHostSn(client);
    }, 260);
}

function scheduleGameInfoSnExperiment(client)
{
    if (GAME_INFO_SN_EXPERIMENT_MODE !== 'enabled') {
        return;
    }
    if (!client.campaignStarted_) {
        console.log(`[ZGateGameDispatch] >> Skipped Game_Info_SN experiment (campaignStarted_=false)`);
        return;
    }
    if (client.waitingGameInfoExperimentSent_) {
        console.log(`[ZGateGameDispatch] >> Skipped Game_Info_SN experiment (already scheduled for this start)`);
        return;
    }

    client.waitingGameInfoExperimentSent_ = true;
    [350, 700, 1200].forEach((delay, index) => {
        setTimeout(() => {
            sendGameInfoSn(client, `experiment #${index + 1} @${delay}ms`);
        }, delay);
    });
}

function primeReadyHostHandshake(client)
{
    if (READY_HOST_GATE_PRIME_MODE !== 'enabled') {
        return;
    }
    if (!client.campaignStarted_) {
        console.log(`[ZGateGameDispatch] >> Skipped Ready_Host prime (campaignStarted_=false)`);
        return;
    }
    if (client.readyHostHandshakeSent_) {
        console.log(`[ZGateGameDispatch] >> Skipped Ready_Host prime (already sent for this room/start)`); 
        return;
    }

    client.readyHostHandshakeSent_ = true;
    setTimeout(() => {
        sendReadyHostSn(client);
    }, 100);
}

function parseMapChangeOneBody(body)
{
    const safe = Buffer.alloc(10, 0x00);
    body.copy(safe, 0, 0, Math.min(body.length, safe.length));
    return {
        rawHex: safe.toString('hex'),
        b0: safe.readUInt8(0),
        w1: safe.readUInt16LE(1),
        w2: safe.readUInt16LE(3),
        b5: safe.readUInt8(5),
        w6: safe.readUInt16LE(6),
        w8: safe.readUInt16LE(8),
    };
}

function getCurrentCampaignMapCacheIndex(client)
{
    return CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID[client.mapId_] || 8;
}

function resolveExperimentValue(value, client)
{
    if (value === 'current_cache') {
        return getCurrentCampaignMapCacheIndex(client);
    }
    return value;
}

function writeMapChangeOneBody(body, fields, offset = 0)
{
    body.writeUInt8(fields.b0 & 0xFF, offset + 0);
    body.writeUInt16LE(fields.w1 & 0xFFFF, offset + 1);
    body.writeUInt16LE(fields.w2 & 0xFFFF, offset + 3);
    body.writeUInt8(fields.b5 & 0xFF, offset + 5);
    body.writeUInt16LE(fields.w6 & 0xFFFF, offset + 6);
    body.writeUInt16LE(fields.w8 & 0xFFFF, offset + 8);
}

function buildMapChangeOneSaFields(body, client)
{
    const incoming = parseMapChangeOneBody(body);
    if (MAP_CHANGE_SA_ECHO_MODE === 'enabled') {
        const adoptedMapId = Number(client.campaignMapCacheKey_);
        const adoptedRound = Number(client.playRound_);
        return {
            rawHex: null,
            // b0 is MapNumber/room-map slot, not a result code; echo the CQ
            // value while w1/b5 follow the state accepted above.
            b0: incoming.b0,
            w1: adoptedMapId >= 9001 && adoptedMapId <= 9012
                ? adoptedMapId : incoming.w1,
            w2: incoming.w2,
            b5: Number.isInteger(adoptedRound) && adoptedRound >= 0 && adoptedRound <= 0xFF
                ? adoptedRound : incoming.b5,
            w6: incoming.w6,
            w8: incoming.w8,
        };
    }
    if (MAP_CHANGE_ONE_SA_EXPERIMENT.mode === 'echo') {
        return incoming;
    }
    if (MAP_CHANGE_ONE_SA_EXPERIMENT.mode === 'manual') {
        return {
            rawHex: null,
            b0: resolveExperimentValue(MAP_CHANGE_ONE_SA_EXPERIMENT.manual.b0, client),
            w1: resolveExperimentValue(MAP_CHANGE_ONE_SA_EXPERIMENT.manual.w1, client),
            w2: resolveExperimentValue(MAP_CHANGE_ONE_SA_EXPERIMENT.manual.w2, client),
            b5: resolveExperimentValue(MAP_CHANGE_ONE_SA_EXPERIMENT.manual.b5, client),
            w6: resolveExperimentValue(MAP_CHANGE_ONE_SA_EXPERIMENT.manual.w6, client),
            w8: resolveExperimentValue(MAP_CHANGE_ONE_SA_EXPERIMENT.manual.w8, client),
        };
    }
    return {
        rawHex: null,
        b0: 0,
        w1: 0,
        w2: 0,
        b5: 0,
        w6: 0,
        w8: 0,
    };
}

// J1b (docs/backlog.md, docs/journal/2026-09-19-0330-d1-step4-room-join.md
// "J1 重測"): a non-host room member pressing "Ready" (0x00222101, see the
// case handler below) triggered a full room-state resend built from this
// connection's own client.xxx_ fields -- those are only ever populated for
// the room's *creator* (CQ_CREATE) plus the handful of fields Enter_CQ
// mirrors onto a joiner's connection (see that handler's own comment), so a
// joiner's client.rawRoomType_/gameMode_/createWord2_/campaignMapCacheKey_/
// playRound_/mapChangeOne*_ stay unset or stale. [LOG]
// session-20260919-111258.jsonl:231-246: joiner (conn4, accountId 4) sent
// 0x00222101 at ms 706969, and the resend that followed sent Room_Default_SN
// with the joiner's own accountId in the room-link field and User_Master_SN
// naming the joiner as host, with the room's actual PvE map (9010) replaced
// by whatever the joiner's own unset fields defaulted to (9001). Pulled the
// Enter_CQ joiner ctx (D1-4c) out into buildRoomCtxFromRoom()/
// sendFullRoomStateToClient() below so any resend path can reuse it for a
// non-host connection.
function buildRoomCtxFromRoom(room, accountId) {
    return {
        roomIndex: room.id,
        accountIndex: accountId,
        roomType: room.rawRoomType,
        mapId: room.mapId,
        maxPlayers: room.maxPlayers,
        currentUsers: room.members.size,
        gameMode: room.gameMode,
        mapIndex: room.mapId,
        roomName: room.name,
        roomSettingGoal: room.campaign ? 0 : room.members.size,
        roomSettingTime: room.campaign ? 0 : room.maxPlayers,
        roomSettingRound: room.campaign ? 1 : 0,
        roomDefaultEntryCount: room.campaign
            ? ROOM_DEFAULT_ENTRY_HINTS.length
            : Math.min(Math.max(room.maxPlayers, 1), ROOM_DEFAULT_ENTRY_HINTS.length),
        roomDefaultEntryHints: ROOM_DEFAULT_ENTRY_HINTS,
        primaryBodyCacheIndex: CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID[room.createMapId || 1] || ROOM_DEFAULT_ENTRY_HINTS[0] || 8,
        selectedMech: 1,
        isCampaignRoom: room.campaign,
        optionMask: room.optionMask || 0,
        isTrueCampaign: room.isTrueCampaign,
        campaignMapCacheKey: room.mapId,
        campaignMapHints: computeCampaignMapAllHints(),
        // No per-room override history yet for these four (same fallback
        // chain sendMapChangeOnePacket already uses, see the Enter_CQ
        // handler's own comment below).
        mapChangeOneTime: room.playTime,
        mapChangeOneRound: room.playRound,
        playRound: room.playRound,
        mapChangeOneKill: undefined,
        mapChangeOneGoal: undefined,
    };
}

// J1b: room-state + map + per-member user packets, all built from the
// shared Room object rather than any single connection's client.xxx_
// fields. Used by Enter_CQ's own joiner send (moved here verbatim from its
// former inline setTimeout body) and by resendRoomState()'s non-host branch
// below.
function sendFullRoomStateToClient(client, room, accountId, tag) {
    const roomStateCtx = buildRoomCtxFromRoom(room, accountId);
    sendRoomStatePackets(client, roomStateCtx, getExactMessageBuffer);
    sendRoomMapPackets(client, roomStateCtx, getExactMessageBuffer, { mapChangeOneResponse: true });
    if (room.campaign) {
        const { sendCampaignBootstrap } = require('./room/room-map.sender');
        sendCampaignBootstrap(client, getExactMessageBuffer);
    }
    const allMembers = Array.from(room.members.values());
    for (const member of allMembers) {
        const memberCtx = buildMemberUserCtx(member);
        const includeMaster = member.accountId === room.hostAccountId;
        sendRoomUserPackets(client, memberCtx, getExactMessageBuffer, { includeMaster });
        // SELF-AVATAR-EXP (docs/backlog.md): triggered by this same full
        // room-state send on room ENTER (joiner path) -- only for the
        // record that is the receiving client's own (self), not the other
        // members' records also sent in this loop. Default off; see
        // room-user.sender.js for the switch and hypothesis.
        if (member.accountId === accountId) {
            scheduleSelfRecordResend(client, memberCtx, getExactMessageBuffer, includeMaster, 'room enter (joiner)');
        }
    }
    console.log(`[ZGateGameDispatch] >> Sent full room state from Room #${room.id} to account ${accountId} (members=${allMembers.length})${tag ? ` [${tag}]` : ''}`);
}

function resendRoomState(client, tag)
{
    try {
        const accountId = Number(client.accountIndex_ || client.accountId_ || 1);
        // J1b: only take the Room-sourced path for a non-host member --
        // the room creator's own client.xxx_ fields are still the correct
        // (and byte-identical to before) source for their own resends.
        const room = rooms.isRoomJoinEnabled() ? rooms.getRoomByAccount(accountId) : undefined;
        if (room && accountId !== room.hostAccountId) {
            sendFullRoomStateToClient(client, room, accountId, tag);
            return;
        }
        const ZRoomDispatch = require('./room.dispatch');
        const roomDispatch = new ZRoomDispatch();
        roomDispatch.sendRoomState(client);
        console.log(`[ZGateGameDispatch] >> Re-sent room state [${tag}]`);
    } catch (err) {
        console.error(`[ZGateGameDispatch] >> Error re-sending room state [${tag}]:`, err.message);
    }
}

function clearPendingRoomStateRetries(client, reason)
{
    const retries = Array.isArray(client.roomStateRetryTimers_) ? client.roomStateRetryTimers_ : [];
    if (retries.length === 0) {
        return;
    }
    for (const timer of retries) {
        clearTimeout(timer);
    }
    client.roomStateRetryTimers_ = [];
    console.log(`[ZGateGameDispatch] >> Cleared pending room state retries (${reason})`);
}

function resendRoomMapOnly(client, tag)
{
    try {
        // J1b: same non-host-member branch as resendRoomState() above --
        // this connection's own client.isTrueCampaign_/campaignMapCacheKey_/
        // mapChangeOne*_ are unset or stale for a joiner, so read the shared
        // Room instead. The room creator's own resends are unaffected
        // (falls through to the client.xxx_-based path below, byte-
        // identical to before).
        const accountIdForRoom = Number(client.accountIndex_ || client.accountId_ || 1);
        const roomForResend = rooms.isRoomJoinEnabled() ? rooms.getRoomByAccount(accountIdForRoom) : undefined;
        if (roomForResend && accountIdForRoom !== roomForResend.hostAccountId) {
            const roomCtx = buildRoomCtxFromRoom(roomForResend, accountIdForRoom);
            if (!roomCtx.isTrueCampaign) {
                console.log(`[ZGateGameDispatch] >> Skipped map-only resend [${tag}] (not true campaign room)`);
                return;
            }
            const { sendRoomMapPackets, sendCampaignBootstrap } = require('./room/room-map.sender');
            sendRoomMapPackets(client, roomCtx, getExactMessageBuffer, { mapChangeOneResponse: true });
            sendCampaignBootstrap(client, getExactMessageBuffer);
            console.log(`[ZGateGameDispatch] >> Re-sent map packets only from Room #${roomForResend.id} [${tag}] (mapId=${roomCtx.mapId}, cacheKey=${roomCtx.campaignMapCacheKey})`);
            return;
        }

        if (!client.isTrueCampaign_) {
            console.log(`[ZGateGameDispatch] >> Skipped map-only resend [${tag}] (not true campaign room)`);
            return;
        }

        const { sendRoomMapPackets, sendCampaignBootstrap } = require('./room/room-map.sender');
        // sendRoomState와 동일한 맵 목록 사용 — same map list as sendRoomState (CAMPAIGN_MAP_ALL_HINTS)
        const campaignMapAllHints = computeCampaignMapAllHints();
        const roomDefaultEntryHints = ROOM_DEFAULT_ENTRY_HINTS;
        const mapId = client.createdMapId_ || client.mapId_ || 1;
        const campaignMapCacheKey = client.campaignMapCacheKey_ || CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID[mapId] || 8;
        const ctx = {
            campaignMapCacheKey,
            roomDefaultEntryHints,
            campaignMapHints: campaignMapAllHints,
            // D1-4c: sendRoomMapPackets/sendMapChangeOnePacket now read these
            // off ctx (see room-map.sender.js) -- this caller already checked
            // client.isTrueCampaign_ above, and the four mapChangeOne*
            // candidates below are this same client's own fields, so this is
            // a relay, not a behaviour change.
            isTrueCampaign: client.isTrueCampaign_,
            mapChangeOneTime: client.mapChangeOneTime_,
            mapChangeOneRound: client.mapChangeOneRound_,
            playRound: client.playRound_,
            mapChangeOneKill: client.mapChangeOneKill_,
            mapChangeOneGoal: client.mapChangeOneGoal_,
        };
        sendRoomMapPackets(client, ctx, getExactMessageBuffer, { mapChangeOneResponse: true });
        sendCampaignBootstrap(client, getExactMessageBuffer);
        console.log(`[ZGateGameDispatch] >> Re-sent map packets only [${tag}] (mapId=${mapId}, cacheKey=${campaignMapCacheKey})`);
    } catch (err) {
        console.error(`[ZGateGameDispatch] >> Error re-sending map packets [${tag}]:`, err.message);
    }
}

module.exports =
class ZGateGameDispatch
{
    dispatch(client, type, body)
    {
        const prefix = (type >> 16) & 0xFF;

        // Only handle 0x22XXXX messages
        if (prefix !== 0x22)
            return false;

        if (type === 0x00220111 || type === 0x00220101 || type === 0x00220102)
            return false;

        const subRange = (type >> 8) & 0xFF;
        console.log(`[ZGateGameDispatch] Message 0x${type.toString(16).padStart(8, '0')} sub=0x${subRange.toString(16)} (${body.length} bytes)`);
        if (body.length > 0) {
            console.log(`[ZGateGameDispatch] Body:`, body.toString('hex'));
            const ascii = body.toString('ascii').replace(/[^\x20-\x7e]/g, '.');
            if (ascii.replace(/\./g, '').length > 2) {
                console.log(`[ZGateGameDispatch] ASCII:`, ascii);
            }
        }

        switch (type)
        {
            // ==========================================
            // Room Creation from Lobby
            // ==========================================
            case CQ_CREATE:
            {
                console.log(`[ZGateGameDispatch] >> Room Create request (${body.length} bytes)`);

                const roomIndex = rooms.allocateRoomId();
                const enterRoomIndex = 0;
                const nickname = client.nickname_ || 'Player';

                // Parse CQ_CREATE body and echo settings back in Room_Default_SN.
                // ZDispatchLobby::Create_CQ writes body[11] as a value flag and
                // body[12..13] as the associated room/max value. The selected map
                // is the byte at body[6].
                const roomType = body.length > 0 ? body[0] : 0;
                const createByte1 = body.length > 1 ? body[1] : 0;
                const createWord1 = body.length >= 4 ? body.readUInt16LE(2) : 0;
                const createWord2 = body.length >= 6 ? body.readUInt16LE(4) : 0;
                const mapId = body.length > 6 ? body[6] : 1;
                const createWord3 = body.length >= 9 ? body.readUInt16LE(7) : 0;
                const createWord4 = body.length >= 11 ? body.readUInt16LE(9) : 0;
                const roomNumberFlag = body.length > 11 ? body[11] : 0;
                const roomNumberValue = body.length >= 14 ? body.readUInt16LE(12) : 1;
                const gameMode = createWord4 & 0xFF;
                // ROOMNAME-BIG5: decodeAnsiBytes() is 'ascii' (unchanged)
                // unless ROOM_NAME_RAW_BYTES_MODE is on, in which case it's
                // 'latin1' so Big5 (or any other ANSI codepage) bytes the
                // client packed here survive byte-for-byte instead of being
                // masked to 7-bit ASCII.
                const rawName = body.length > 14
                    ? decodeAnsiBytes(body.subarray(14, Math.min(body.length, 39)))
                    : '';
                const roomName = rawName || `${nickname}`;
                const hasPassword = body.length > 39 ? body[39] : 0;
                const roomPassword = hasPassword
                    ? decodeAnsiBytes(body.subarray(40, Math.min(body.length, 51)))
                    : '';
                // isCampaignLike: roomType 1(캠페인)과 2(PvP) 모두 최대 8명 슬롯 유지용 (keeps max 8-player slots for both roomType 1 (campaign) and 2 (PvP))
                const isCampaignLike = (roomType === 1) || (roomType === 2) || (gameMode === 4 || gameMode === 5);
                const effectiveRoomType = isCampaignLike ? 2 : roomType;
                const maxPlayers = isCampaignLike
                    ? 8
                    : Math.min(Math.max(roomNumberValue || 1, 1), 8);
                // isTrueCampaign: 실제 캠페인 방 여부 (PvP는 false) (whether it is an actual campaign room, PvP=false)
                const isTrueCampaign = (roomType === 1) || (gameMode === 4 || gameMode === 5);

                // ROOMNAME-BIG5: decodeBig5ForLog() is a no-op (returns
                // null) unless ROOM_NAME_RAW_BYTES_MODE is on.
                const roomNameBig5Readable = decodeBig5ForLog(roomName);
                console.log(`[ZGateGameDispatch] >> Creating room #${roomIndex} (type=${roomType}->${effectiveRoomType}, map=${mapId}, opt1=0x${createWord1.toString(16)}, opt2=0x${createWord2.toString(16)}, max=${maxPlayers}, mode=${gameMode}, valueFlag=${roomNumberFlag}, value=${roomNumberValue}) for "${nickname}"${roomNameBig5Readable ? ` name_big5="${roomNameBig5Readable}"` : ''}`);

                // Store room info on client for other dispatchers to reference
                client.createdRoomIndex_ = roomIndex;
                client.roomIndex_ = enterRoomIndex;
                client.roomType_ = effectiveRoomType;
                client.rawRoomType_ = roomType;
                client.mapId_ = mapId;
                // Lobby_Room_Create(..., MaxUser, MapIndex, PlayRound, PlayTime, PlayKill, PlayGoal)
                // -> ZDispatchLobby::Create_CQ (0x107e5b60) puts PlayRound in body[6] (u8);
                // the room UI fills it from MapInfoRecord.GoalDefault for campaign (ZPanel_RoomInfo.uc:984).
                client.playRound_ = body.length > 6 ? body[6] : 0;
                client.createByte1_ = createByte1;
                client.createWord1_ = createWord1;
                client.createWord2_ = createWord2;
                // PM-F1 fix 2: body[4..5] is PlayTime in minutes, same field
                // semantics/type/position as Map_Change_One_CQ 0x00220221's
                // MapTime (w2) -- see docs/journal/2026-09-17-18-create-cq-map-difficulty.md
                // §1 (write [esp+0x30] -> 0x107e5cd7) and §2 (identical field
                // order to Map_Change_One_CQ, [esp+0xc] -> 0x107eec96); neither
                // write applies a *60/÷60 scale, and Game_Info_SN's TimeLimit
                // (body+0x13, 0x107d4fa7) is minutes per
                // docs/journal/2026-09-18-2334-t1-time-limit.md (DefaultGameInfo.uc
                // RemainingTime = 60*TimeLimit) -- same unit, kept as its own
                // named field distinct from the generic createWord2_ optionMask
                // read by room-state.sender.js, which is a different consumer.
                // Not added to session.js's CARRIED list: create and game-start
                // happen on the same GameServer (30907) connection, no
                // reconnect between them observed in any session log, so this
                // does not need to survive a reconnect (per PM ruling; keep
                // the CARRIED list from growing without a reconnect case that
                // needs it).
                client.createPlayTime_ = createWord2;
                client.createWord3_ = createWord3;
                client.createWord4_ = createWord4;
                client.roomNumberFlag_ = roomNumberFlag;
                client.roomNumberValue_ = roomNumberValue;
                client.roomName_ = roomName;
                client.roomPassword_ = roomPassword;
                client.maxPlayers_ = maxPlayers;
                client.gameMode_ = gameMode;
                client.mapSeed_ = (createWord2 << 16) | createWord1;
                client.campaignRoom_ = isCampaignLike;
                client.isTrueCampaign_ = isTrueCampaign;  // 실제 캠페인 여부 (PvP=false) (whether it is an actual campaign room, PvP=false)
                client.createdMapId_ = mapId;
                // Real Cache.Bin map id, not an invented cache index — this
                // value is what Game_Info_URL_Get matches entry[0] against.
                // Create_CQ body[2..3] is the MapIndex the room UI picked
                // (ZDispatchLobby::Create_CQ 0x107e5cc0; campaign rooms default to
                // DefaultMap==3, i.e. 9010 Map_PC04 easy). PvE map ids are
                // 9001..9012, three difficulties per map ((index-9001)/3,
                // ZPanel_PVE.uc:328). Anything else falls back to 9001.
                {
                    const pickedMap = body.length >= 4 ? body.readUInt16LE(2) : 0;
                    client.campaignMapCacheKey_ = (pickedMap >= 9001 && pickedMap <= 9012)
                        ? pickedMap : MAP_ID_DEFAULT_CAMPAIGN;
                }
                client.readyHostHandshakeSent_ = false;
                client.gameUserBootstrapSent_ = false;
                client.waitingGameInfoExperimentSent_ = false;
                client.gameWaitExperimentSent_ = false;
                client.postGameWaitReadyHostSent_ = false;

                // D1 step 1 [design docs/design/d1-multiplayer-room.md §2, §6
                // step 1]: dual-write into the shared Room registry alongside
                // the client.xxx_ fields above. Triggered by the same
                // Create_CQ 0x00220201 that built those fields (client
                // pressed "Create Room" in the lobby). While ROOM_JOIN_MODE
                // (rooms.js, default disabled) is off, nothing reads from
                // `rooms` either, so this cannot change any byte sent below;
                // enabled, it also broadcasts the new room to the lobby
                // (D1-4, see below).
                {
                    const hostAccountId = Number(client.accountIndex_ || client.accountId_ || 1);
                    const room = rooms.createRoom({
                        id: roomIndex,
                        name: roomName,
                        mapId: client.campaignMapCacheKey_ || mapId,
                        // Create_CQ's body does not carry a play-time field
                        // (see body parsing above) — it only arrives later
                        // via Map_Change_One_CQ (client.mapChangeOneTime_).
                        // Mirrors client.mapChangeOneTime_'s own pre-set
                        // value: undefined until that CQ arrives.
                        playTime: client.mapChangeOneTime_ || 0,
                        playRound: client.playRound_,
                        maxPlayers,
                        campaign: isCampaignLike,
                        hostAccountId,
                        // D1-4: needed for Room_List_SN's RoomType/password
                        // fields (dispatch/room/room-list.sender.js).
                        roomType: effectiveRoomType,
                        hasPassword: !!roomPassword,
                        password: roomPassword,
                        // D1-4c: needed for Room_Default_SN/Room_Option_SN/
                        // Map_Change_ALL/ONE/Campaign_SN when a *joiner*
                        // reads room state straight from this Room object
                        // (see rooms.js Room typedef comment and the Enter_CQ
                        // handler below) -- distinct from `roomType` above,
                        // which room-list.sender.js needs normalized.
                        rawRoomType: roomType,
                        isTrueCampaign,
                        gameMode,
                        optionMask: createWord2,
                        // D1-4c: the raw CQ_CREATE mapId byte (client.mapId_/
                        // client.createdMapId_), NOT the same thing as
                        // `mapId` above (that one prioritizes
                        // campaignMapCacheKey_, the Cache.Bin 9001..9012
                        // index). room.dispatch.js sendRoomState()'s own
                        // primaryMapCacheIndex looks this raw value up in
                        // CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID for
                        // Room_Default_SN's mech-slot entry table (offset
                        // 0x20) -- a joiner's ctx needs the same lookup input
                        // to land on the same entry-table byte a host would.
                        createMapId: mapId,
                    });
                    rooms.addMember(room.id, {
                        accountId: hostAccountId,
                        nickname,
                        team: 0,
                        slot: 0,
                        ready: false,
                        client,
                    });

                    // D1-4 (docs/backlog.md, design §5/§6 step 4): tell
                    // everyone else in the lobby a new room exists to join.
                    // rooms.getLobbyClients() naturally excludes the creator
                    // (they are now tracked as a room member, via addMember
                    // above). Gated by LOBBY_ROOM_LIST_MODE, not
                    // ROOM_JOIN_MODE -- this is a Room_List_SN send, and the
                    // PM contract requires that opcode to have its own
                    // switch (rooms.js: it changes single-player-visible
                    // lobby behaviour independent of whether joining works).
                    if (rooms.isLobbyRoomListEnabled()) {
                        broadcastRoomListChange(rooms.getLobbyClients(), room, 1, getExactMessageBuffer);
                        console.log(`[ZGateGameDispatch] >> Broadcast new room #${room.id} to the lobby`);
                    }
                }

                // ZDispatchLobby::Create_CQ sends 0x220201 with Send(..., 0x220202),
                // so the matching success response is Create_SA 0x220202. The
                // handler requires body+0x00 word == 0 and body+0x02 dword == 0
                // before it clears lobby/room data and switches to the room scene.
                {
                    const bodySize = 0x28;
                    const [msg, respBody] = getExactMessageBuffer(SA_LOBBY_CREATE, bodySize);
                    respBody.writeUint16LE(enterRoomIndex, 0x00);
                    respBody.writeUint32LE(0, 0x02);
                    respBody.writeUint16LE(enterRoomIndex, 0x06);
                    respBody.writeUint8(0, 0x0B);
                    // ROOMNAME-BIG5: Create_SA also echoes the room name
                    // back to the creator; 'latin1' round-trips the exact
                    // bytes decodeAnsiBytes() decoded above when the switch
                    // is on. Disabled path unchanged ('ascii' + the pre-
                    // existing utf8 Buffer.byteLength() call, kept as-is for
                    // byte-identical default behaviour).
                    const createSaNameEncoding = isRoomNameRawBytesEnabled() ? 'latin1' : 'ascii';
                    const createSaNameLengthBasis = isRoomNameRawBytesEnabled()
                        ? Buffer.byteLength(roomName, 'latin1')
                        : Buffer.byteLength(roomName);
                    respBody.write(roomName + '\0', 0x0E, Math.min(createSaNameLengthBasis + 1, 0x19), createSaNameEncoding);
                    respBody.writeUint8(roomPassword ? 1 : 0, 0x27);
                    client.send(msg);
                    console.log(`[ZGateGameDispatch] >> Sent Create_SA 0x220202 (Lobby_Room_Create trigger, roomIndex=${enterRoomIndex}, body=${bodySize}, directName=1)`);
                }

                console.log(`[ZGateGameDispatch] >> Room creation response sent via Create_SA path (created=${roomIndex}, enter=${enterRoomIndex})`);

                // Send room state after Create_SA scene transition, then retry while
                // the room scene activates its ZDispatchRoom handlers.
                client.roomStateRetryTimers_ = [];
                const sendRoomStateDelayed = (delay, tag) => {
                    const timer = setTimeout(() => {
                        try {
                            const ZRoomDispatch = require('./room.dispatch');
                            const roomDispatch = new ZRoomDispatch();
                            roomDispatch.sendRoomState(client);
                            console.log(`[ZGateGameDispatch] >> Sent room state notifications (0x22 room SN) [${tag}]`);

                            // Game_Info_SN belongs here, not after the start
                            // request. Pressing start makes the client build
                            // its travel URL immediately, out of [this+0xfc8],
                            // and this packet is the only thing that sets it.
                            // Sent afterwards — 350ms afterwards, as it was —
                            // it arrives to find the URL already built from a
                            // map id of 0, and map id 0 in Cache.Bin is
                            // Store_01 with ZModeHangar.HangarGameInfo, goal 0,
                            // time 0. Which is exactly the "fallback" URL we
                            // have been staring at: not a fallback at all, but
                            // a correct lookup of the wrong map.
                            if (GAME_INFO_SN_WITH_ROOM_STATE === 'enabled') {
                                if (client.isTrueCampaign_ && !client.campaignMapCacheKey_)
                                    client.campaignMapCacheKey_ = MAP_ID_DEFAULT_CAMPAIGN;
                                sendGameInfoSn(client, `room state [${tag}]`);
                            }
                        } catch (err) {
                            console.error(`[ZGateGameDispatch] >> Error sending room state:`, err.message);
                        }
                    }, delay);
                    client.roomStateRetryTimers_.push(timer);
                };
                // Was 350/1200/2500/5000 — a shotgun from when it was unclear
                // when the room scene starts listening. It is clear now: the
                // room comes up fully on the first block.
                //
                // Each repeat is not free. User_Default_SN makes the client
                // rebuild its room user array, so User_Master_SN has to follow
                // every block or the player stops being master — and the client
                // pops a "you are the room master" dialog each time it arrives.
                // Four blocks meant four dialogs. Two keeps a retry for the
                // scene-change race without burying the player in prompts.
                for (const [delay, tag] of ROOM_STATE_RETRY_SCHEDULE)
                    sendRoomStateDelayed(delay, tag);

                return true;
            }

            // ==========================================
            // Hardware/Config Reports (CN - client notification, no response needed)
            // ==========================================
            case 0x00221221:
            {
                // Client sends hardware/graphics config as 0x05-delimited strings
                // First field is "true"/"false", second is version like "2.50"
                // Followed by numeric capability codes
                console.log(`[ZGateGameDispatch] >> Hardware config report (${body.length} bytes) - acknowledged`);
                return true;
            }

            // ==========================================
            // Player name/presence lookup
            // ==========================================
            case 0x00220121:
            {
                const name = body.subarray(0, 25).toString('ascii').split('\0').shift();
                console.log(`[ZGateGameDispatch] >> Player lookup: "${name}"`);

                const [msg, respBody] = client.getMessageBuffer(0x00220122, 0x6);
                respBody.writeUint16LE(0x0000, 0);
                respBody.writeUint32LE(0x0000, 2);
                client.send(msg);
                return true;
            }

            // ==========================================
            // Room Enter CN (씬 로드 완료 알림 / scene load complete notification)
            // 클라이언트가 방 씬 로드 후 반복 전송 — 방 상태 재전송으로 응답 (client sends this repeatedly after loading the room scene — respond by re-sending room state)
            // ==========================================
            case 0x00222101:
            {
                console.log(`[ZGateGameDispatch] >> Room Enter CN (0x00222101) — ACK only`);
                sendOkSa(client, 0x00222102, 'Room_Enter_SN');
                // 최초 1회만 방 상태 재전송, 이후는 ACK만 (re-send room state only on the first occurrence; ACK only thereafter)
                if (!client.roomEnterAcked_) {
                    client.roomEnterAcked_ = true;
                    resendRoomState(client, 'room-enter cn (first)');
                }

                // READY-IMPL (docs/backlog.md, docs/research/2026-09-19-ready/
                // notes.md READY-FMT/READY-FMT-2, 🟡 未經跨公司審查): per
                // that analysis, 0x00222101 is ZDispatchRoom::Game_Ready_CN
                // [DLL 0x107ef8f0] -- its sole client call site (0x1072cb13)
                // fires when a *non-host* room member presses 準備完畢(F5);
                // the host's F5 takes the Game_Start_CN (0x00222103) branch
                // instead. Body+0x04 (u8) is the ready flag (the call site
                // hardcodes 1, no cancel-ready call site was found, but 0 is
                // still honoured here in case one exists). Broadcasts
                // User_State_SN 0x00220401 [DLL 0x107eaf30] raw state 2
                // (READY once client-normalized, ZPage_Room.uc:2450
                // `bReady = State==1`) so the label shows on every room
                // member's screen, including the presser's own. Deliberately
                // placed AFTER the resend above: resendRoomState() (when it
                // fires, first occurrence only) still sends this member's own
                // per-member User_State_SN through room-user.sender.js's
                // buildMemberUserCtx, which carries the old constant (raw 1)
                // since member.ready has not been updated yet at that point
                // -- this broadcast corrects it right after instead of racing it.
                if (rooms.isRoomReadyStateEnabled() && rooms.isRoomJoinEnabled()) {
                    const accountIdForReady = Number(client.accountIndex_ || client.accountId_ || 1);
                    const roomForReady = rooms.getRoomByAccount(accountIdForReady);
                    if (roomForReady && accountIdForReady !== roomForReady.hostAccountId) {
                        const readyFlag = body.length >= 5 ? body.readUInt8(4) !== 0 : false;
                        const member = roomForReady.members.get(accountIdForReady);
                        if (member) member.ready = readyFlag;
                        const rawState = readyFlag ? 2 : 1;
                        rooms.sendAll(roomForReady.id, () => {
                            const [msg, respBody] = getExactMessageBuffer(0x00220401, 0x08);
                            respBody.writeUint8(0, 0x00);
                            respBody.writeUint8(1, 0x01);
                            respBody.writeUint16LE(accountIdForReady, 0x02);
                            respBody.writeUint32LE(rawState, 0x04);
                            return msg;
                        });
                        console.log(`[ZGateGameDispatch] >> Broadcast User_State_SN 0x220401 (account=${accountIdForReady}, ready=${readyFlag}, raw=${rawState})`);
                    }
                }
                return true;
            }

            // ==========================================
            // Room Game Start CQ
            // ==========================================
            case 0x00222103:
            {
                // D1-6-IMPL (design doc §5 step 5, §3.2; PM correction: check
                // moved to the top of this handler, before anything is sent
                // -- see the design doc's "檢查時機提前" note). Client action:
                // this whole case only ever fires from the host's F5 press
                // (case 0x00222101's own comment explains why a non-host's F5
                // lands there instead) -- but nothing here actually checked
                // that until now, so a stray/forged 0x00222103 from a
                // non-host connection would have started the battle sequence
                // for the whole room anyway.
                if (HOST_ADDRESS_REQUIRE_MODE === 'enabled' && rooms.isRoomJoinEnabled()) {
                    const accountIdForGate = Number(client.accountIndex_ || client.accountId_ || 1);
                    const roomForGate = rooms.getRoomByAccount(accountIdForGate);
                    if (roomForGate) {
                        if (accountIdForGate !== roomForGate.hostAccountId) {
                            console.log(`[ZGateGameDispatch] >> Ignored Game_Start_CN 0x00222103 from non-host account=${accountIdForGate} (host=${roomForGate.hostAccountId}, room #${roomForGate.id})`);
                            return true;
                        }
                        if (roomForGate.members.size > 1) {
                            // design §3.2: hostAddress is looked up from
                            // client.username_ (set at account login,
                            // account.dispatch.js's CQ_LOGIN_WASABII), the
                            // same identity whitelist.isAllowed() already
                            // gates on. ⬜ not yet wired: gamelogin.dispatch.js
                            // (this connection's own 30907 login) never sets
                            // client.username_ itself -- see this worktree's
                            // handback report for why that file was left
                            // untouched.
                            const hostAddress = client.username_ ? whitelist.getHostAddress(client.username_) : null;
                            if (!hostAddress) {
                                console.error(`[ZGateGameDispatch] !! Refusing battle start: no hostAddress configured for host account=${accountIdForGate} (username=${client.username_}, nickname=${client.nickname_}), room #${roomForGate.id} has ${roomForGate.members.size} members`);
                                return true;
                            }
                        }
                    }
                }

                // Static analysis confirms both Game_Ready_SN (0x222102) and
                // Game_Start_SN (0x222104) consume the same simple SA body and
                // emit NETWORK_ROOM_GAME_READY. Current runtime only sending
                // 0x222104 did not progress beyond that point, so keep a narrow
                // experiment that can also send 0x222102 first.
                console.log(`[ZGateGameDispatch] >> Room Game_Start_CQ`);
                clearPendingRoomStateRetries(client, 'game-start cq');

                // R-ROUND (docs/backlog.md): client pressing F5 to start the
                // match is the confirmed PvE battle-start path ([LOG]
                // session-20260919-012749.jsonl -- 0x00222103 fires, the
                // room.dispatch.js 0x00240301 path never does). Reset the
                // per-connection round counter here so PVE_ROUND_ADVANCE_MODE
                // starts each match at round 1, regardless of which branch
                // below (SERVER_DRIVEN_START_MODE or not) actually sends
                // Game_Start_SN.
                client.pveRoundsCleared_ = 0;
                // D1-6-STEP3: with BATTLE_END_BROADCAST_MODE the round counter lives
                // on the Room; reset it here too, or a rematch in the same room
                // would start from the previous match's cleared count.
                //
                // Sol batch3 review (docs/research/2026-09-19-sol-review/
                // batch3.md Part B "需修改 -- round/reset ownership"): this
                // reset originally ran for ANY tracked room member pressing
                // F5, not just the host -- guard it the same way
                // lobby.dispatch.js's Campaign_CN/Death_CN/BeginRound_CN
                // handlers gate their own room-state writes, so a non-host
                // client cannot clear the shared round counter.
                if (rooms.isBattleEndBroadcastEnabled() && rooms.isRoomJoinEnabled()) {
                    const accountIdForRoundReset = Number(client.accountIndex_ || client.accountId_ || 1);
                    const roomForRoundReset = rooms.getRoomByAccount(accountIdForRoundReset);
                    if (roomForRoundReset && accountIdForRoundReset === roomForRoundReset.hostAccountId) {
                        roomForRoundReset.pveRoundsCleared_ = 0;
                    }
                }

                // READY-IMPL (docs/backlog.md): the host pressing F5 (this
                // opcode, see the case 0x00222101 comment above for why the
                // host's F5 lands here instead) starts the match, so every
                // member's Ready state from the lobby is stale afterward --
                // clear it so a later return to this same room (e.g. after a
                // Campaign clear) does not show a leftover READY label. Only
                // resets the shared Room registry's `ready` flags, not
                // anything already-sent to a client; the next broadcast (a
                // future non-host Ready press, or a state resend once one
                // exists) is what would need to reflect this.
                if (rooms.isRoomReadyStateEnabled() && rooms.isRoomJoinEnabled()) {
                    const accountIdForStart = Number(client.accountIndex_ || client.accountId_ || 1);
                    const roomForStart = rooms.getRoomByAccount(accountIdForStart);
                    if (roomForStart) {
                        for (const member of roomForStart.members.values()) {
                            member.ready = false;
                        }
                    }
                }

                // D1-6-IMPL: shared Room lookup for the broadcast switches
                // below (GAME_USER_SN_BROADCAST_MODE etc.) -- computed once,
                // undefined when rooms.isRoomJoinEnabled() is off (matches
                // the resendRoomState()/resendRoomMapOnly() pattern above).
                // A 1-person room resolves to a Room with exactly one member
                // (the host, who is also `client` here), which is what keeps
                // every broadcast switch byte-identical to the old
                // single-target sends in that case (design doc §5).
                const accountIdForBattleBroadcast = Number(client.accountIndex_ || client.accountId_ || 1);
                const roomForBattleBroadcast = rooms.isRoomJoinEnabled()
                    ? rooms.getRoomByAccount(accountIdForBattleBroadcast)
                    : undefined;

                // SOL-REVIEW-2 point 7 (docs/research/2026-09-19-sol-review/
                // batch2.md): the 60/150/300/450/600ms callbacks below (and
                // Game_User_SN's per-packet DB completions inside them)
                // capture `room`/`client` by closure with no way to notice a
                // member leaving, the room disappearing, or the host
                // changing partway through -- so a stale send could still go
                // out, or Ready_Host_SQ could go to a host that is no longer
                // the room's host by the time 450ms elapses. `battleStartGen`
                // is an ad-hoc counter on the Room object (no new typed
                // field, same pattern as case 0x00230151's beginRoundGen)
                // bumped once here, per *accepted* 0x00222103 (this line only
                // runs once the HOST_ADDRESS_REQUIRE_MODE gate above already
                // let this request through). Every callback below re-reads
                // the room from the live registry and calls
                // battleStartStillValid() before doing anything; a mismatch
                // (room gone / a newer 0x00222103 bumped the generation
                // further / the host account changed) aborts that whole step,
                // logged, no packets sent. No-op (`battleStartStillValid`
                // always true) when there is no tracked room at all --
                // rooms.isRoomJoinEnabled() off, or this connection not
                // tracked as a room member -- so the legacy single-connection
                // path is completely unaffected by any of this.
                let startedBattleGen;
                let startedHostAccountId;
                if (roomForBattleBroadcast) {
                    roomForBattleBroadcast.battleStartGen = (roomForBattleBroadcast.battleStartGen || 0) + 1;
                    startedBattleGen = roomForBattleBroadcast.battleStartGen;
                    startedHostAccountId = roomForBattleBroadcast.hostAccountId;
                }

                function battleStartStillValid(tag)
                {
                    if (!roomForBattleBroadcast) return true;
                    const currentRoom = rooms.getRoom(roomForBattleBroadcast.id);
                    if (!currentRoom) {
                        console.log(`[ZGateGameDispatch] >> Battle-start aborted: room #${roomForBattleBroadcast.id} no longer tracked [${tag}]`);
                        return false;
                    }
                    if (currentRoom.battleStartGen !== startedBattleGen) {
                        console.log(`[ZGateGameDispatch] >> Battle-start aborted: room #${roomForBattleBroadcast.id}'s battleStartGen changed (${startedBattleGen} -> ${currentRoom.battleStartGen}, a newer Game_Start_CN superseded this one) [${tag}]`);
                        return false;
                    }
                    if (currentRoom.hostAccountId !== startedHostAccountId) {
                        console.log(`[ZGateGameDispatch] >> Battle-start aborted: room #${roomForBattleBroadcast.id}'s host changed (${startedHostAccountId} -> ${currentRoom.hostAccountId}) mid-sequence [${tag}]`);
                        return false;
                    }
                    return true;
                }

                if (SERVER_DRIVEN_START_MODE === 'enabled') {
                    // D1-6-IMPL (design doc §5 step 2): broadcast Game_Wait_SN
                    // to every room member instead of just the trigger
                    // connection -- pushing the trigger into scene 6 is not
                    // the only thing this packet does; every member's own
                    // ZDispatchGame handlers (Game_User_SN etc.) only run in
                    // scene 6 too, so a non-host that never receives this
                    // never leaves the room scene at all.
                    const useRoomBattleBroadcast = rooms.isRoomBattleStartBroadcastEnabled() && !!roomForBattleBroadcast;

                    // SOL-REVIEW-2 must-fix list (docs/research/
                    // 2026-09-19-sol-review/batch2.md): this PvE-map default
                    // fallback plus gameStarted_/campaignStarted_ used to
                    // only ever be set on the triggering connection's own
                    // client -- a non-host member's own gameStarted_/
                    // campaignStarted_ stayed false forever, so its later
                    // 0x00230111 (lobby poll) got treated as a genuine
                    // return to the lobby (lobby.dispatch.js's channel-enter
                    // handler) instead of "already in a started battle".
                    // With useRoomBattleBroadcast, every live room member's
                    // OWN client gets these set: campaignMapCacheKey_'s
                    // fallback still gates on that same member's own
                    // isTrueCampaign_ (Enter_CQ already mirrors
                    // room.isTrueCampaign onto a joiner's connection, so this
                    // reads the same value the host's own field would);
                    // campaignStarted_ reads room.isTrueCampaign directly
                    // (CQ_CREATE computed both isTrueCampaign_ and
                    // rawRoomType_ === 1 / gameMode_ === 4|5 from the exact
                    // same CQ_CREATE fields, so this is the identical value
                    // for the host too, not a behaviour change for them).
                    // Switch off (or no tracked room) falls straight back to
                    // the original single-client-only assignment below,
                    // byte-for-byte unchanged.
                    if (useRoomBattleBroadcast) {
                        for (const member of roomForBattleBroadcast.members.values()) {
                            if (!member.client) continue;
                            if (member.client.isTrueCampaign_ && !member.client.campaignMapCacheKey_)
                                member.client.campaignMapCacheKey_ = MAP_ID_DEFAULT_CAMPAIGN;
                            member.client.gameStarted_ = true;
                            member.client.campaignStarted_ = !!roomForBattleBroadcast.isTrueCampaign;
                        }
                    } else {
                        // Push to scene 6 first, then set the map there.
                        if (client.isTrueCampaign_ && !client.campaignMapCacheKey_)
                            client.campaignMapCacheKey_ = MAP_ID_DEFAULT_CAMPAIGN;
                        client.gameStarted_ = true;
                        client.campaignStarted_ = (Number(client.rawRoomType_) === 1) ||
                            (Number(client.gameMode_) === 4 || Number(client.gameMode_) === 5);
                    }

                    if (useRoomBattleBroadcast) {
                        sendRoomGameWaitSnBroadcast(roomForBattleBroadcast, 'server-driven: to scene 6');
                    } else {
                        sendRoomGameWaitSn(client, 'server-driven: to scene 6');
                    }
                    // The in-game player table, which has to exist before the
                    // client builds its travel URL: Game_Info_URL_Get asks
                    // Game_User_Team_Get for team=%d, that searches the array
                    // Game_User_SN fills, and an empty array answers 255 —
                    // which is how the map came up with a free camera and no
                    // mech. Scene 6 first, or ZDispatchGame drops it.
                    setTimeout(() => {
                        if (!battleStartStillValid('game-user-sn @60ms')) return;
                        // D1-6-IMPL (design doc §5 step 1): broadcast one
                        // Game_User_SN per room member to every room member's
                        // connection instead of just this trigger connection.
                        if (GAME_USER_SN_BROADCAST_MODE === 'enabled' && roomForBattleBroadcast) {
                            sendGameUserSnRoomBroadcast(roomForBattleBroadcast, 'server-driven: in-game user table', startedBattleGen);
                        } else {
                            sendGameUserSn(client, 'server-driven: in-game user table');
                        }
                    }, 60);
                    // Give the client a beat to enter scene 6 before the map,
                    // so the scene-6 Game_Info_SN handler is the one that runs.
                    setTimeout(() => {
                        if (!battleStartStillValid('game-info-sn @150ms')) return;
                        if (useRoomBattleBroadcast) {
                            sendGameInfoSnRoomBroadcast(roomForBattleBroadcast, 'server-driven: scene-6 map');
                        } else {
                            sendGameInfoSn(client, 'server-driven: scene-6 map');
                        }
                    }, 150);
                    // Then complete the ready/start handshake to release the
                    // client's "Loading" wait. Game_Info_SN sets the map and
                    // preps state (Game_Play_Start) but does not itself travel;
                    // observed the client sitting at a Loading popup with no
                    // crash, waiting for this sequence we previously skipped.
                    setTimeout(() => {
                        if (!battleStartStillValid('ready-start-sn @300ms')) return;
                        if (useRoomBattleBroadcast) {
                            sendAckBroadcast(roomForBattleBroadcast, 0x00222102, 'server-driven: Game_Ready_SN');
                            sendAckBroadcast(roomForBattleBroadcast, 0x00222104, 'server-driven: Game_Start_SN');
                        } else {
                            sendOkSa(client, 0x00222102, 'server-driven: Game_Ready_SN');
                            sendOkSa(client, 0x00222104, 'server-driven: Game_Start_SN');
                        }
                    }, 300);
                    // The client sits at Loading, silent, after the above — the
                    // one thing the old (crashing) flow sent that this lacked is
                    // Ready_Host_SQ, which the client answered with 0x420114.
                    // The Game_Wait state is likely waiting on that host-ready
                    // handshake. Send it; if the client answers 0x420114, the
                    // 0x420114 handler (below) carries it forward.
                    // D1-6-IMPL (design doc §5 step 4, §1 row 6): with
                    // rooms.isReadyHostSplitEnabled(), send Ready_Host_SQ to
                    // the room's tracked host connection specifically
                    // (room.hostAccountId), not whichever connection
                    // triggered 0x00222103 -- today those are always the same
                    // connection, but this stops being guaranteed once a
                    // non-host member exists (HOST_ADDRESS_REQUIRE_MODE,
                    // step 5, is what actually blocks a non-host from
                    // reaching this far; this switch is independent of that
                    // one per the task contract, so it defends on its own).
                    setTimeout(() => {
                        if (!battleStartStillValid('ready-host-sq @450ms')) return;
                        if (rooms.isReadyHostSplitEnabled() && roomForBattleBroadcast) {
                            // battleStartStillValid() above already confirmed
                            // roomForBattleBroadcast.hostAccountId (read live,
                            // this line) still equals startedHostAccountId --
                            // SOL-REVIEW-2 point 7's "host identity for SQ
                            // ... must equal the host captured at start" is
                            // enforced there, not re-derived here.
                            const hostMember = roomForBattleBroadcast.members.get(roomForBattleBroadcast.hostAccountId);
                            if (hostMember && hostMember.client) {
                                sendReadyHostSq(hostMember.client);
                            } else {
                                console.error(`[ZGateGameDispatch] !! READY_HOST_SPLIT_MODE: room #${roomForBattleBroadcast.id}'s host (account=${roomForBattleBroadcast.hostAccountId}) has no live connection -- not sending Ready_Host_SQ`);
                            }
                        } else {
                            sendReadyHostSq(client);
                        }
                    }, 450);
                    setTimeout(() => {
                        if (!battleStartStillValid('game-info-sn retry @600ms')) return;
                        if (useRoomBattleBroadcast) {
                            sendGameInfoSnRoomBroadcast(roomForBattleBroadcast, 'server-driven: scene-6 map retry');
                        } else {
                            sendGameInfoSn(client, 'server-driven: scene-6 map retry');
                        }
                    }, 600);
                    console.log(`[ZGateGameDispatch] >> SERVER_DRIVEN_START: Wait -> Info -> Ready/Start`);
                    return true;
                }

                // First thing out, synchronously, before Ready_Host_SQ and
                // before anything is scheduled.
                //
                // Game_Info_URL_Get builds the travel URL from [this+0xfc8],
                // and Game_Info_SN is the only packet that sets it. It cannot
                // go earlier — sent while the room scene is live it blanks the
                // client — so the start request is the first safe moment, and
                // it has to be the very first reply rather than 350ms behind
                // one. If ZPage_Room composes its URL before any reply arrives,
                // nothing sent from here can win and the map has to reach the
                // client some other way entirely.
                if (client.isTrueCampaign_ && !client.campaignMapCacheKey_)
                    client.campaignMapCacheKey_ = MAP_ID_DEFAULT_CAMPAIGN;
                sendGameInfoSn(client, 'immediate, on game-start cq');

                client.gameStarted_ = true;
                client.campaignStarted_ = (Number(client.rawRoomType_) === 1) ||
                    (Number(client.gameMode_) === 4 || Number(client.gameMode_) === 5);
                console.log(`[ZGateGameDispatch] >> Armed gameStarted_=${client.gameStarted_} campaignStarted_=${client.campaignStarted_}`);
                if (READY_HOST_GATE_PRIME_MODE === 'enabled' && client.campaignStarted_) {
                    sendReadyHostSq(client);
                }
                // Game_Info_SN을 먼저 보내고, 그 다음 Game_Ready_SN + Game_Start_SN (send Game_Info_SN first, then Game_Ready_SN + Game_Start_SN)
                // 클라이언트가 Game_Info_SN의 mapId를 읽어서 ClientTravel 대상 맵을 결정하기 때문 (because the client reads the mapId from Game_Info_SN to determine the ClientTravel target map)
                scheduleGameInfoSnExperiment(client);
                setTimeout(() => {
                    if (GAME_START_HANDSHAKE_MODE === 'ready_then_start') {
                        sendOkSa(client, 0x00222102, 'Game_Ready_SN');
                        setTimeout(() => {
                            sendOkSa(client, 0x00222104, 'Game_Start_SN');
                            primeReadyHostHandshake(client);
                            scheduleGameWaitSnExperiment(client);
                            schedulePostGameWaitReadyHost(client);
                        }, 100);
                    } else {
                        sendOkSa(client, 0x00222104, 'Game_Start_SN');
                        primeReadyHostHandshake(client);
                        scheduleGameWaitSnExperiment(client);
                        schedulePostGameWaitReadyHost(client);
                    }
                }, 400); // Game_Info_SN 전송 후 400ms 대기 (wait 400ms after sending Game_Info_SN)
                return true;
            }

            // ==========================================
            // Room Enter CQ. Client action: double-click a room row in the
            // lobby room list (fed by Room_List_SN, see the CQ_CREATE
            // broadcast above), or "join" from a Play Together invite.
            // Body: u16 RoomIndex + UTF-16LE password, fixed 0x1D bytes
            // (docs/research/2026-09-18-d1-room-formats/notes.md, [DLL]
            // write site 0x107e5e61). D1-4 (docs/backlog.md).
            // ==========================================
            case 0x00220231:
            {
                if (!rooms.isRoomJoinEnabled()) {
                    // Unchanged from before this case existed: the generic
                    // odd-opcode fallback this used to fall through to
                    // (packetlog.fallback + 6-byte 0/0 auto-ACK as type+1).
                    // Keeping this byte-identical matters for
                    // test/replay-golden.js's baselines.
                    packetlog.fallback(client, 'ZGateGameDispatch', type, body, type + 1);
                    const [msg, respBody] = client.getMessageBuffer(type + 1, 0x6);
                    respBody.writeUint16LE(0x0000, 0);
                    respBody.writeUint32LE(0x0000, 2);
                    client.send(msg);
                    return true;
                }

                const roomIndexReq = body.length >= 2 ? body.readUInt16LE(0) : 0;
                let password = '';
                for (let i = 2; i + 1 < body.length; i += 2) {
                    const code = body.readUInt16LE(i);
                    if (code === 0) break;
                    password += String.fromCharCode(code);
                }

                const accountId = Number(client.accountIndex_ || client.accountId_ || 1);
                const room = rooms.getRoom(roomIndexReq);

                // Enter_SA 0x00220232 [DLL 0x107e4080]:
                // docs/research/2026-09-18-d1-room-formats/enter-sa.md found
                // it carries no room data of its own -- both the success and
                // failure branches only need the standard 0/0 (success) or
                // non-zero (failure) status/result header. The client pulls
                // the actual room content from the SN broadcasts sent below.
                // Failure result code is a guess (1, matching this
                // repo's generic-failure convention elsewhere, e.g.
                // room.dispatch.js's Shop Buy SA) -- the numeric->error
                // string table Event_Call feeds ZPage_Lobby.RecvRoomEnter
                // was not traced, so which popup text this produces is
                // unconfirmed. Any non-zero result reaches some non-empty
                // ErrorMessage there, so the client will not hang either way.
                const sendEnterSa = (ok) => {
                    const [msg, respBody] = getExactMessageBuffer(0x00220232, 0x06);
                    respBody.writeUInt16LE(ok ? 0 : 1, 0x00);
                    respBody.writeUInt32LE(ok ? 0 : 1, 0x02);
                    client.send(msg);
                    console.log(`[ZGateGameDispatch] >> Sent Enter_SA 0x220232 (${ok ? 'success' : 'failure'}, room=${roomIndexReq})`);
                };

                if (!room) {
                    console.log(`[ZGateGameDispatch] >> Enter_CQ: room #${roomIndexReq} not found`);
                    sendEnterSa(false);
                    return true;
                }
                if (room.hasPassword && room.password !== password) {
                    console.log(`[ZGateGameDispatch] >> Enter_CQ: wrong password for room #${roomIndexReq}`);
                    sendEnterSa(false);
                    return true;
                }
                if (room.members.size >= room.maxPlayers) {
                    console.log(`[ZGateGameDispatch] >> Enter_CQ: room #${roomIndexReq} full (${room.members.size}/${room.maxPlayers})`);
                    sendEnterSa(false);
                    return true;
                }

                const nickname = client.nickname_ || 'Player';
                rooms.addMember(room.id, {
                    accountId,
                    nickname,
                    team: 0, // PvE all-red (design §2, R11); PvP team assignment is M4, out of scope here
                    slot: 0,
                    ready: false,
                    client,
                });

                // Minimal client-side mirror: only the fields existing
                // unrelated handlers already key off client.xxx_ for
                // (Hangar Open_CQ 0x00240101's campaign-room suppression,
                // Leave_CQ 0x00220234's resetRoomSessionState). This is
                // deliberately not a full mirror of everything CQ_CREATE
                // sets above -- starting a match as the joiner (map
                // selection, Game_Info_SN, etc: M2) is out of scope for
                // D1-4, which only covers seeing and being seen in the room.
                client.campaignRoom_ = room.campaign;
                client.isTrueCampaign_ = room.isTrueCampaign;
                client.createdRoomIndex_ = room.id;
                client.roomIndex_ = 0;
                client.maxPlayers_ = room.maxPlayers;
                client.mapId_ = room.mapId;
                client.roomName_ = room.name;

                sendEnterSa(true);

                const allMembers = Array.from(room.members.values());
                const otherMembers = allMembers.filter((m) => m.accountId !== accountId);

                // Same scene-change race as CQ_CREATE's
                // ROOM_STATE_RETRY_SCHEDULE above: Enter_SA also drives
                // Scene_Change(5) client-side (enter-sa.md), and the room
                // scene needs a moment to start listening for ZDispatchRoom
                // SNs. One retry (not the creator's two) -- see journal.
                setTimeout(() => {
                    // D1-4c fix (docs/backlog.md, PM contract): every field
                    // sent below comes from the shared Room object, not any
                    // client.xxx_ field -- a joiner's own connection never
                    // went through CQ_CREATE, so those fields are either
                    // unset or (worse) stale from whatever this connection
                    // did before (e.g. Lucas re-entering someone else's room
                    // after having created her own earlier in the same
                    // session). [LOG] session-20260919-104728.jsonl:118 (host
                    // Room_Default_SN, roomType byte=1, PvE) vs :164 (joiner,
                    // same field=2, PvP room shell) traced to the old
                    // `roomType: room.roomType` line -- `room.roomType` is
                    // the Room_List_SN-*normalized* value
                    // (room-list.sender.js's ROOM_TYPE_NORM_TO_RAW), not the
                    // raw CQ_CREATE type Room_Default_SN's own roomType byte
                    // needs (room.dispatch.js sendRoomState()'s `rawRoomType`
                    // local) -- room.rawRoomType (dual-written at CQ_CREATE)
                    // is that raw value. Also [LOG] :158-174 vs :115-146:
                    // this block used to never call sendRoomMapPackets() or
                    // sendCampaignBootstrap() at all, so a joiner never got
                    // Map_Change_ALL/ONE (0x00220226/0x00220223) or
                    // Campaign_SN (0x0023013a) -- matching [OBS] marker at
                    // line 295, "中間地圖設定還有房間設定都為空". J1b
                    // (docs/backlog.md) pulled the ctx-building and send
                    // calls out into buildRoomCtxFromRoom()/
                    // sendFullRoomStateToClient() above so resendRoomState()
                    // can reuse the same Room-sourced path for a later
                    // resend on this same joiner connection (e.g. pressing
                    // "Ready", 0x00222101 below).
                    sendFullRoomStateToClient(client, room, accountId);
                }, 350);

                // Tell whoever was already in the room about the new
                // arrival. No scene-change race for them -- they are
                // already sitting in the room scene.
                for (const member of otherMembers) {
                    if (!member.client) continue;
                    sendRoomUserPackets(member.client, buildMemberUserCtx({ accountId, nickname, team: 0, client }), getExactMessageBuffer, { includeMaster: false });
                }
                console.log(`[ZGateGameDispatch] >> Notified ${otherMembers.length} existing room member(s) of new arrival (account=${accountId})`);

                // Member count changed -- tell the lobby too. Gated by
                // LOBBY_ROOM_LIST_MODE separately from ROOM_JOIN_MODE (this
                // whole case is already behind ROOM_JOIN_MODE above), same
                // reasoning as the CQ_CREATE broadcast above.
                if (rooms.isLobbyRoomListEnabled()) {
                    broadcastRoomListChange(rooms.getLobbyClients(), room, 2, getExactMessageBuffer);
                }

                return true;
            }

            // ==========================================
            // Room Map Change One CQ
            // ==========================================
            case 0x00220221:
            {
                clearPendingRoomStateRetries(client, 'map-change-one cq');
                // Static analysis for ZDispatchRoom::Map_Change_One_SA shows the
                // enabled SA body is 6 zero status bytes followed by the 10-byte
                // map payload. Keep the old 10-byte body only while disabled.
                const incomingFields = parseMapChangeOneBody(body);
                // Map_Change_One_CQ (ZDispatchRoom 0x107eec30): w1 = MapIndex,
                // b5 = MapRound. Take the difficulty/map the player switched to,
                // before the SA and the room map resend read campaignMapCacheKey_.
                if (incomingFields.w1 >= 9001 && incomingFields.w1 <= 9012) {
                    client.campaignMapCacheKey_ = incomingFields.w1;
                    client.playRound_ = incomingFields.b5;
                    // Preserve the settings accepted with Map_Change_One_CQ
                    // for the following SN_MAP_CHANGE_ONE resend.
                    client.mapChangeOneTime_ = incomingFields.w2;
                    client.mapChangeOneRound_ = incomingFields.b5;
                    client.mapChangeOneKill_ = incomingFields.w6;
                    client.mapChangeOneGoal_ = incomingFields.w8;
                    // D1-4c: mirror the same update into the shared Room, so
                    // a joiner who arrives *after* this map/round change
                    // sees it too (gate.game.dispatch.js's Enter_CQ handler
                    // now reads room.mapId/playTime/playRound, not this
                    // connection's client.xxx_ fields). Unconditional, same
                    // "always write, read is gated" pattern CQ_CREATE's own
                    // dual-write already uses -- addMember always registers
                    // the sender as a room member regardless of ROOM_JOIN_MODE.
                    const roomForMapUpdate = rooms.getRoomByAccount(Number(client.accountIndex_ || client.accountId_ || 1));
                    if (roomForMapUpdate) {
                        rooms.updateRoomMapSelection(roomForMapUpdate.id, {
                            mapId: incomingFields.w1,
                            playTime: incomingFields.w2,
                            playRound: incomingFields.b5,
                        });
                    }
                }
                const outgoingFields = buildMapChangeOneSaFields(body, client);
                console.log(
                    `[ZGateGameDispatch] >> Room Map_Change_One_CQ ` +
                    `(b0=${incomingFields.b0}, w1=${incomingFields.w1}, w2=${incomingFields.w2}, ` +
                    `b5=${incomingFields.b5}, w6=${incomingFields.w6}, w8=${incomingFields.w8})`
                );
                const saHasSuccessHeader = MAP_CHANGE_SA_ECHO_MODE === 'enabled';
                const saBodySize = saHasSuccessHeader ? 0x10 : 0x0A;
                const saPayloadOffset = saHasSuccessHeader ? 0x06 : 0x00;
                const [msg, respBody] = getExactMessageBuffer(0x00220222, saBodySize);
                if (saHasSuccessHeader) {
                    respBody.writeUInt16LE(0, 0x00);
                    respBody.writeUInt32LE(0, 0x02);
                }
                writeMapChangeOneBody(respBody, outgoingFields, saPayloadOffset);
                client.send(msg);
                console.log(
                    `[ZGateGameDispatch] >> Sent Map_Change_One_SA 0x220222 ` +
                    `(mode=${MAP_CHANGE_ONE_SA_EXPERIMENT.mode}, bodySize=${saBodySize}, ` +
                    `b0=${outgoingFields.b0}, w1=${outgoingFields.w1}, w2=${outgoingFields.w2}, ` +
                    `b5=${outgoingFields.b5}, w6=${outgoingFields.w6}, w8=${outgoingFields.w8}, ` +
                    `hex=${respBody.toString('hex')})`
                );
                if (MAP_CHANGE_ONE_RESEND_MODE === 'full_room') {
                    resendRoomState(client, 'after map-change-one cq');
                } else if (MAP_CHANGE_ONE_RESEND_MODE === 'map_only') {
                    resendRoomMapOnly(client, 'after map-change-one cq');
                } else {
                    console.log(`[ZGateGameDispatch] >> Skipped resend after map-change-one cq (mode=${MAP_CHANGE_ONE_RESEND_MODE})`);
                }

                // ROOM-OPT-BC: relay the difficulty/map pick to the rest of
                // the room. Triggered by the host clicking a difficulty tile
                // in ZPanel_PVE inside the room screen, which sends this same
                // Room_Map_Change_One_CQ 0x00220221 (DLL 0x107eb6f0 is
                // Map_Change_One_SN's body layout, reused verbatim here --
                // see the 10-byte outgoingFields above). Only the host's pick
                // counts, and only when there is someone else to tell.
                if (ROOM_MAP_BROADCAST_MODE === 'enabled' && rooms.isRoomJoinEnabled()) {
                    const accountIdForBroadcast = Number(client.accountIndex_ || client.accountId_ || 1);
                    const roomForBroadcast = rooms.getRoomByAccount(accountIdForBroadcast);
                    if (roomForBroadcast && roomForBroadcast.hostAccountId === accountIdForBroadcast
                        && roomForBroadcast.members.size > 1) {
                        rooms.sendOthers(roomForBroadcast.id, accountIdForBroadcast, () => {
                            const [snMsg, snBody] = getExactMessageBuffer(0x00220223, 0x0A);
                            writeMapChangeOneBody(snBody, outgoingFields, 0);
                            return snMsg;
                        });
                        console.log(
                            `[ZGateGameDispatch] >> Broadcast Map_Change_One_SN 0x220223 to ` +
                            `${roomForBroadcast.members.size - 1} other room member(s) of Room #${roomForBroadcast.id} ` +
                            `(host=${accountIdForBroadcast})`
                        );
                    } else {
                        console.log(
                            `[ZGateGameDispatch] >> Skipped map-change broadcast (not host, no room, or no other members)`
                        );
                    }
                }
                return true;
            }

            // ==========================================
            // L1 verified [DLL][LOG][OBS]: 0x00220234 is Leave_CQ, sent by the
            // client when the player presses "back" inside a room. It expects
            // a reply: without one the client froze on a loading screen and
            // resent it 79 seconds later. Reply is Leave_SA 0x00220235 (empty
            // EVENT_INFO body). See docs/journal/2026-09-18-20-room-leave-reset.md,
            // docs/state.md 4b.
            // ==========================================
            case 0x00220234:
            {
                if (BACK_FROM_ROOM_SA_EXPERIMENT_MODE !== 'enabled') {
                    packetlog.fallback(client, 'ZGateGameDispatch', type, body, null);
                    return true;
                }

                console.log(`[ZGateGameDispatch] >> 0x220234 (Leave_CQ): replying Leave_SA 0x220235`);
                const [msg, respBody] = client.getMessageBuffer(0x00220235, 0x6);
                respBody.writeUint16LE(0x0000, 0);
                respBody.writeUint32LE(0x0000, 2);
                client.send(msg);
                packetlog.marker('Leave_CQ 0x00220234 answered with Leave_SA 0x00220235', 'auto');
                // Client pressed "back" in a room: drop room flags so the lobby
                // hangar is no longer treated as in-campaign-room.
                require('./room.dispatch').resetRoomSessionState(client);
                console.log(`[ZGateGameDispatch] >> Room state reset on Leave_CQ 0x220234`);
                // D1-4 correction (design §4 "斷線即離開"): mirror the leave
                // into the Room registry too — same shared helper
                // server.js's socket close hook now uses for any disconnect
                // (Leave_CQ used to duplicate this logic inline; the two
                // paths need to stay in sync, so they now share one
                // function). No-op only when the account is not tracked as
                // a member of any room (D1-4b, docs/backlog.md: this used
                // to also no-op whenever ROOM_JOIN_MODE was disabled --
                // see room-leave.js's doc comment).
                leaveRoomAndNotify(Number(client.accountIndex_ || client.accountId_ || 1));

                return true;
            }

            // ==========================================
            // KICK task (docs/backlog.md, 2026-09-19): 0x00220337 is
            // Kickout_CQ, sent by the room host pressing "kick" on another
            // member. [DLL 0x10705d7b] ZDispatchRoom::Kickout_CQ: body is a
            // bare u16 UserIndex (the target's accountId, per rooms.js's
            // "user index == accountId" convention), total frame length
            // 0x12 (0x10 header + 2-byte body) -- matches the observed body
            // `0400` for target account 4
            // ([LOG] session-20260919-111258.jsonl ms 2121418). No other
            // fields. Reply is Kickout_SA 0x00220338 [DLL 0x1070135c]
            // ZDispatchRoom::Kickout_SA: same standard EVENT_INFO header
            // (u16 result + u32 code, both 0 = success; client only removes
            // the target / fires NETWORK_ROOM_USER_KICKOUT on the 0/0 case)
            // as every other _SA in this file -- exact non-zero failure code
            // unconfirmed, reusing this file's existing generic-failure
            // convention of 1/1 (see Enter_CQ's sendEnterSa above).
            //
            // Before this handler existed, 0x00220337 fell through to the
            // generic odd-opcode default case below, which echoed back a
            // *success* Kickout_SA without touching the room at all: the
            // host's own client-side list removed the kicked player (off
            // that success header alone -- Kickout_SA's DLL handler reads a
            // UserIndex from its own state, not from anything the server
            // has to send), but the server never removed them from `rooms`
            // and the kicked player was never told, so they stayed fully in
            // the room and could keep chatting ([OBS] session above).
            //
            // Only the room's host may kick, and only an actual member who
            // is not the host -- the DLL does not re-validate this
            // server-side (ZPage_RoomMember's kick button UI presumably
            // only renders for the host, but the server must not trust
            // that). Gated by ROOM_JOIN_MODE like the rest of the
            // room-membership handlers: with the switch off, rooms.js has
            // no real membership to check against, so this keeps the
            // previous fallback behaviour unchanged (same pattern as
            // Enter_CQ 0x00220231 above).
            // ==========================================
            case 0x00220337:
            {
                if (!rooms.isRoomJoinEnabled()) {
                    // Unchanged from before this case existed: the generic
                    // odd-opcode fallback this used to fall through to
                    // (packetlog.fallback + 6-byte 0/0 auto-ACK as type+1).
                    // Keeping this byte-identical matters for
                    // test/replay-golden.js's baselines.
                    packetlog.fallback(client, 'ZGateGameDispatch', type, body, type + 1);
                    const [msg, respBody] = client.getMessageBuffer(type + 1, 0x6);
                    respBody.writeUint16LE(0x0000, 0);
                    respBody.writeUint32LE(0x0000, 2);
                    client.send(msg);
                    return true;
                }

                const targetAccountId = body.length >= 2 ? body.readUInt16LE(0) : 0;
                const kickerAccountId = Number(client.accountIndex_ || client.accountId_ || 1);

                const sendKickoutSa = (ok) => {
                    const [msg, respBody] = getExactMessageBuffer(0x00220338, 0x06);
                    respBody.writeUInt16LE(ok ? 0 : 1, 0x00);
                    respBody.writeUInt32LE(ok ? 0 : 1, 0x02);
                    client.send(msg);
                    console.log(`[ZGateGameDispatch] >> Sent Kickout_SA 0x220338 (${ok ? 'success' : 'failure'}, kicker=${kickerAccountId}, target=${targetAccountId})`);
                };

                const room = rooms.getRoomByAccount(kickerAccountId);
                if (!room || room.hostAccountId !== kickerAccountId) {
                    console.log(`[ZGateGameDispatch] >> Kickout_CQ: account ${kickerAccountId} is not the host of any room, refusing`);
                    sendKickoutSa(false);
                    return true;
                }
                if (targetAccountId === kickerAccountId || !room.members.has(targetAccountId)) {
                    console.log(`[ZGateGameDispatch] >> Kickout_CQ: target ${targetAccountId} is not a kickable member of room #${room.id}`);
                    sendKickoutSa(false);
                    return true;
                }

                const targetClient = room.members.get(targetAccountId).client;

                sendKickoutSa(true);

                // Tell the kicked client directly: Leave_SN with UserIndex
                // == itself and Kickout=1 -- per the DLL (0x107edb70,
                // decompiled for this task) this is the "self" branch,
                // which fires NETWORK_GOTO_LOBBY *and* (because Kickout!=0)
                // NETWORK_ROOM_KICKOUT_ME. leaveRoomAndNotify() below only
                // messages the *remaining* members (it filters the target
                // out of that list by construction), so this has to happen
                // separately -- same reasoning as Leave_CQ 0x00220234
                // sending its own Leave_SA directly before calling
                // leaveRoomAndNotify() for the room-registry side.
                if (targetClient) {
                    const [leaveMsg, leaveBody] = getExactMessageBuffer(0x00220236, 0x03);
                    leaveBody.writeUInt16LE(targetAccountId, 0x00);
                    leaveBody.writeUInt8(1, 0x02); // Kickout=1
                    targetClient.send(leaveMsg);
                    // Same room-flag reset Leave_CQ 0x00220234 does for a
                    // voluntary leave (room.dispatch.js's
                    // resetRoomSessionState) -- the kicked client never sent
                    // a CQ of its own, so nothing else clears these.
                    require('./room.dispatch').resetRoomSessionState(targetClient);
                }
                console.log(`[ZGateGameDispatch] >> Kickout_CQ: host ${kickerAccountId} kicked account ${targetAccountId} from room #${room.id}`);

                // Mirror the removal into the Room registry and notify
                // whoever is left in the room (host included) -- reuses the
                // same remove-member/Leave_SN path Leave_CQ and disconnect
                // already share (room-leave.js), per this task's contract.
                leaveRoomAndNotify(targetAccountId, { kickout: true });

                return true;
            }

            // ==========================================
            // Room Name Change CQ. Client action: host opens the 房間設定
            // 變更 (Room Settings) dialog, edits the room name field, and
            // presses OK (see CQ_ROOM_NAME_CHANGE's constant comment above
            // for the [LOG]/[DLL] evidence this case exists at all).
            // ==========================================
            case CQ_ROOM_NAME_CHANGE:
            {
                if (!rooms.isRoomJoinEnabled()) {
                    // Unchanged from before this case existed: 0x00220218 is
                    // even, so the generic fallback's "type%2===1" odd-opcode
                    // auto-ACK never applied to it -- packetlog.fallback with
                    // no reply, same as falling through to the switch's
                    // default case (see that case's own comment). This is
                    // the exact behaviour the coordinator's live test
                    // observed as "client stuck on the loading screen".
                    packetlog.fallback(client, 'ZGateGameDispatch', type, body, null);
                    return true;
                }

                const accountId = Number(client.accountIndex_ || client.accountId_ || 1);

                // ROOMNAME-BIG5: decodeAnsiBytes() is 'ascii' (unchanged)
                // unless ROOM_NAME_RAW_BYTES_MODE is on, in which case it's
                // 'latin1' -- same switch/reasoning as CQ_CREATE's name
                // field above.
                const requestedName = decodeAnsiBytes(body.subarray(0, Math.min(body.length, 25)));

                // Name_Change_SA body [DLL 0x10708a6c -> 0x107eb160]: the client
                // checks the standard u16 Result/u32 ErrorCode header at
                // frame+0x10/+0x12 (esi = this SA). On success it copies the name
                // from `lea edi,[ebx+0x10]` (0x107eb2a8), where ebx is the
                // handler's SECOND argument ([esp+0x48] at 0x107eb22d) -- the
                // client's own pending Name_Change_CQ frame, same convention as
                // Kickout_SA (PM check 2026-09-19). So the name comes from the
                // client's own CQ, not from this SA: a 6-byte header is enough.
                // (High-tier correction of the worker's 0x29-byte guess.)
                const sendNameChangeSa = (ok, name) => {
                    const [msg, respBody] = getExactMessageBuffer(SA_ROOM_NAME_CHANGE, 0x06);
                    respBody.writeUInt16LE(ok ? 0 : 1, 0x00);
                    respBody.writeUInt32LE(ok ? 0 : 1, 0x02);
                    client.send(msg);
                    console.log(`[ZGateGameDispatch] >> Sent Name_Change_SA 0x220219 (${ok ? 'success' : 'failure'}, account=${accountId}${ok ? `, name="${name}"` : ''})`);
                };

                const room = rooms.getRoomByAccount(accountId);
                if (!room || room.hostAccountId !== accountId) {
                    console.log(`[ZGateGameDispatch] >> Name_Change_CQ: account ${accountId} is not the host of any room, refusing`);
                    sendNameChangeSa(false);
                    return true;
                }
                if (!requestedName) {
                    console.log(`[ZGateGameDispatch] >> Name_Change_CQ: empty name from account ${accountId}, refusing`);
                    sendNameChangeSa(false);
                    return true;
                }

                room.name = requestedName;
                client.roomName_ = requestedName;
                sendNameChangeSa(true, requestedName);

                // Broadcast the new name to every room member (host
                // included -- rooms.sendAll iterates the whole membership).
                // sendRoomNameOnly() already does its own client.send();
                // rooms.sendAll's build() contract wants a msg it sends
                // itself, so this dips into member.client directly instead
                // of using sendAll -- same reasoning sendRoomNameOnly's own
                // header comment gives for factoring it out of
                // sendRoomStatePackets in the first place.
                for (const member of room.members.values()) {
                    if (!member.client) continue;
                    sendRoomNameOnly(member.client, requestedName, getExactMessageBuffer);
                }
                console.log(`[ZGateGameDispatch] >> Broadcast Room_Name_SN 0x22021A to room #${room.id} (${room.members.size} member(s)) [rename]`);

                if (rooms.isLobbyRoomListEnabled()) {
                    broadcastRoomListChange(rooms.getLobbyClients(), room, 2, getExactMessageBuffer);
                    console.log(`[ZGateGameDispatch] >> Broadcast room #${room.id} name change to the lobby`);
                }

                return true;
            }

            // ==========================================
            // Room Option Change CQ
            // ==========================================
            case 0x00220215:
            {
                console.log(`[ZGateGameDispatch] >> Room Option_Change_CQ`);
                const [msg, respBody] = getExactMessageBuffer(0x00220216, 0x06);
                respBody.writeUint16LE(0, 0x00);
                respBody.writeUint32LE(0, 0x02);
                client.send(msg);
                console.log(`[ZGateGameDispatch] >> Sent Option_Change_SA 0x220216 (status=0, result=0)`);
                resendRoomState(client, 'after option-change cq');
                return true;
            }

            // ==========================================
            // Room Chat (0x00220505 All / 0x00220503 Team). Triggered by the
            // client typing in the room chat box (not the game/battle chat
            // box below, and not the lobby chat channel 0x00220501). Same
            // opcode is reused for CQ and the SN broadcast, per
            // docs/client-dispatch-map.md listing 0x00220505/0x00220503 as
            // Chat_Room_All_SN/Chat_Room_Team_SN and the identical CN/SN
            // echo pattern already verified for in-game chat just below.
            // ==========================================
            case 0x00220505: // Chat_Room_All_CN/SN
            case 0x00220503: // Chat_Room_Team_CN/SN
            {
                const accountId = Number(client.accountIndex_ || client.accountId_ || 1);
                // PM-F1 fix 1: 0x00220505 (All) still follows
                // ROOM_CHAT_BROADCAST_MODE; 0x00220503 (Team) follows its
                // own ROOM_TEAM_CHAT_MODE switch (defaults disabled, see
                // comment at the const declaration above).
                const chatModeForType = (type === 0x00220505) ? ROOM_CHAT_BROADCAST_MODE : ROOM_TEAM_CHAT_MODE;
                const room = (chatModeForType === 'enabled') ? rooms.getRoomByAccount(accountId) : undefined;

                if (!room) {
                    // Not in a tracked room (or switch off): unchanged
                    // behaviour -- ACK with type+1 (0x00220506/0x00220504),
                    // neither of which appears in docs/client-dispatch-map.md,
                    // so the client's dispatcher has no handler for it and
                    // silently ignores it either way.
                    packetlog.fallback(client, 'ZGateGameDispatch', type, body, type + 1);
                    const [msg, respBody] = client.getMessageBuffer(type + 1, 0x6);
                    respBody.writeUint16LE(0x0000, 0);
                    respBody.writeUint32LE(0x0000, 2);
                    client.send(msg);
                    return true;
                }

                const channelName = (type === 0x00220505) ? 'All' : 'Team';
                const textPreview = body.length > 2 ? body.subarray(2).toString('latin1').split('\0')[0] : '';
                console.log(`[ZGateGameDispatch] >> Room chat ${channelName} (0x${type.toString(16).padStart(8, '0')}): "${textPreview}" (${body.length} bytes)`);

                if (type === 0x00220505) {
                    // All channel: relay to the whole room, including the
                    // sender (design §5/§6 step 2).
                    rooms.sendAll(room.id, () => {
                        const [msg, respBody] = getExactMessageBuffer(type, body.length);
                        body.copy(respBody);
                        return msg;
                    });
                } else {
                    // Team channel: only same-team members (design §5).
                    // rooms.js only exports sendAll/sendOthers (neither
                    // filters by team), so this loops the room directly.
                    const sender = room.members.get(accountId);
                    const senderTeam = sender ? sender.team : 0;
                    for (const member of room.members.values()) {
                        if (member.team !== senderTeam) continue;
                        if (!member.client) continue;
                        const [msg, respBody] = getExactMessageBuffer(type, body.length);
                        body.copy(respBody);
                        member.client.send(msg);
                    }
                }
                return true;
            }

            // ==========================================
            // In-game Chat (0x00220507 Team / 0x00220509 All)
            // ==========================================
            case 0x00220507: // Chat_Game_Team_CN
            case 0x00220509: // Chat_Game_All_CN
            {
                if (GAME_CHAT_ECHO_MODE !== 'enabled') {
                    packetlog.fallback(client, 'ZGateGameDispatch', type, body, type + 1);
                    const [msg, respBody] = client.getMessageBuffer(type + 1, 0x6);
                    respBody.writeUint16LE(0x0000, 0);
                    respBody.writeUint32LE(0x0000, 2);
                    client.send(msg);
                    return true;
                }

                const channelName = (type === 0x00220507) ? 'Team' : 'All';
                const textPreview = body.length > 2 ? body.subarray(2).toString('latin1').split('\0')[0] : '';
                console.log(`[ZGateGameDispatch] >> In-game chat ${channelName} (0x${type.toString(16).padStart(8, '0')}): "${textPreview}" (${body.length} bytes)`);

                const [msg, respBody] = getExactMessageBuffer(type, body.length);
                body.copy(respBody);
                client.send(msg);
                return true;
            }

            default:
            {
                // Nothing here understands this message. Record that before
                // replying (or not replying), because an even opcode gets no
                // answer at all and the client will wait for one forever.
                packetlog.fallback(client, 'ZGateGameDispatch', type, body,
                    (type % 2 === 1) ? type + 1 : null);

                //Respond to unhandled CQ messages
                if (type % 2 === 1) {
                    const responseType = type + 1;
                    console.log(`[ZGateGameDispatch] >> Auto-responding with 0x${responseType.toString(16).padStart(8, '0')}`);
                    const [msg, respBody] = client.getMessageBuffer(responseType, 0x6);
                    respBody.writeUint16LE(0x0000, 0);
                    respBody.writeUint32LE(0x0000, 2);
                    client.send(msg);
                }
                return true;
            }
        }
    }
};

// Test-only hook (PM-F1 fix 1): lets test/room-chat.js exercise the
// ROOM_TEAM_CHAT_MODE='enabled' branch without changing the shipped
// default. Not called anywhere outside test/.
module.exports._setRoomTeamChatModeForTest = function setRoomTeamChatModeForTest(mode)
{
    ROOM_TEAM_CHAT_MODE = mode;
};

// Test-only hook (ROOM-OPT-BC): lets test/room-join.js exercise the
// ROOM_MAP_BROADCAST_MODE='enabled' branch without changing the shipped
// default. Not called anywhere outside test/.
module.exports._setRoomMapBroadcastModeForTest = function setRoomMapBroadcastModeForTest(mode)
{
    ROOM_MAP_BROADCAST_MODE = mode;
};

// D1-6-IMPL test-only hooks (docs/design/d1-step6-battle-broadcast.md §5):
// let test/*.js exercise each new switch's 'enabled' branch without
// changing its shipped 'disabled' default. Not called anywhere outside
// test/.
module.exports._setGameUserSnBroadcastModeForTest = function setGameUserSnBroadcastModeForTest(mode)
{
    GAME_USER_SN_BROADCAST_MODE = mode;
};

// ROOM_BATTLE_START_BROADCAST_MODE's own test-only setter lives on rooms.js
// (rooms._setRoomBattleStartBroadcastModeForTests) -- the switch itself
// lives there too (see rooms.js's isRoomBattleStartBroadcastEnabled()
// comment for why: lobby.dispatch.js needs to read it too).

module.exports._setHostAddressRequireModeForTest = function setHostAddressRequireModeForTest(mode)
{
    HOST_ADDRESS_REQUIRE_MODE = mode;
};

// R-ROUND (docs/backlog.md): shared with lobby.dispatch.js's Campaign_CN
// handler -- see the comment on the function itself.
module.exports.getGameInfoRound = getGameInfoRound;

// D1-6-IMPL (design doc §5 step 4): community.dispatch.js's 0x00420114
// handler needs this to message non-host room members once the host's
// Ready_Host_CA reports its port -- see sendReadyHostSnToRoomMember()'s own
// comment above for why it takes ip/port/mapCacheKey instead of a `client`.
module.exports.sendReadyHostSnToRoomMember = sendReadyHostSnToRoomMember;

// Sol batch3 review (docs/research/2026-09-19-sol-review/batch3.md, 新疑點):
// after RHSN-IP, the non-host Ready_Host_SN path no longer carries the map
// name (bare IP only, community.dispatch.js's ipOnly=true call), so
// test/room-ready-host-split.js's testReadyHostSnUsesRealMapId() cases lost
// their only assertion on MAP_ID_TO_MAP_NAME_GG. Exported so a unit test can
// call the single-connection path (ipOnly=false, still embeds "IP/MapName")
// directly and keep the table covered without going through a live socket.
module.exports.buildReadyHostSnMsg = buildReadyHostSnMsg;
