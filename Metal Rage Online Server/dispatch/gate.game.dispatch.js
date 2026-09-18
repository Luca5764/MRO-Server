const NetworkClient = require("../client");
const packetlog = require("../packetlog.js");
const { sendGameUserBootstrap } = require('./room/room-game-user.sender');

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
const MAP_CHANGE_ONE_RESEND_MODE = 'map_only'; // 'full_room' | 'map_only' | 'none'
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

// Map_PC01 easy — the campaign room's default until the client picks another.
const MAP_ID_DEFAULT_CAMPAIGN = 9001;

const ROOM_STATE_RETRY_SCHEDULE = [
    [350, 'delayed'],
    [1200, 'retry after scene change'],
];

let nextRoomIndex = 1;

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

function sendReadyHostSn(client)
{
    const ip = normalizeIpv4(client.socket_ && client.socket_.localAddress);
    const port = 30907;
    const mapCacheKey = Number(client.campaignMapCacheKey_) || 58;
    const mapName = CACHE_INDEX_TO_MAP_NAME_GG[mapCacheKey] || 'Map_PC01';
    // 실제 서버: IP:Port/MapName?team=0 형식으로 ClientTravel (real server: ClientTravel in IP:Port/MapName?team=0 format)
    // ip 필드에 "IP/MapName" 형식으로 전달 시도 (attempt to pass in "IP/MapName" format in the ip field)
    const ipWithMap = ip + '/' + mapName;

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

    const room = respBody.length - 0x03;
    const written = respBody.write(ipWithMap + '\0', 0x03, Math.min(urlBytes + 1, room), 'ascii');

    if (written < urlBytes + 1)
        console.log(`[ZGateGameDispatch] !! Ready_Host_SN URL TRUNCATED: wrote ${written} of ${urlBytes + 1} bytes — client will travel to a map that does not exist`);

    client.send(msg);
    console.log(`[ZGateGameDispatch] >> Sent Ready_Host_SN 0x00420115 ip=${ipWithMap} port=${port} (mode=${READY_HOST_SN_URL_MODE}, body=0x${bodySize.toString(16)})`);
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
    const timeLimitMinutes = 10;
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
    const playRound = Number(client.playRound_) || 0;
    body.writeUInt8(playRound & 0xFF, 0x15);    // -> [0xfd0], MapInfo.Round
    body.writeUInt16LE(goalScore, 0x16);        // -> [0xfd8], goal score 0/1
    body.writeUInt16LE(goalScore, 0x18);        // -> [0xfdc], goal score 5

    client.send(msg);
    console.log(
        `[ZGateGameDispatch] >> Sent Game_Info_SN 0x00222111 [${tag}] ` +
        `(battle=${battleIndex}, red=${redTeamIndex}, blue=${blueTeamIndex}, map=${mapId}, ` +
        `clan=${clanFlag}, user=${userIndex}, timeLimit=${timeLimitMinutes}, round=${playRound}, goal=${goalScore}, ` +
        `body=${body.toString('hex')})`
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

function resendRoomState(client, tag)
{
    try {
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
        if (!client.isTrueCampaign_) {
            console.log(`[ZGateGameDispatch] >> Skipped map-only resend [${tag}] (not true campaign room)`);
            return;
        }

        const { sendRoomMapPackets, sendCampaignBootstrap, ROOM_MAP_SYNC_MODE } = require('./room/room-map.sender');
        // sendRoomState와 동일한 맵 목록 사용 — same map list as sendRoomState (CAMPAIGN_MAP_ALL_HINTS)
        const campaignMapAllHints = ROOM_MAP_SYNC_MODE === 'enabled'
            ? [9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009, 9010, 9011, 9012]
            : [8, 37, 30, 34, 43, 6, 2, 26, 36, 43, 16, 24, 45, 47, 49, 14, 10, 22, 52, 30, 18];
        const roomDefaultEntryHints = [8, 37, 30, 34, 6, 2];
        const mapId = client.createdMapId_ || client.mapId_ || 1;
        const campaignMapCacheKey = client.campaignMapCacheKey_ || CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID[mapId] || 8;
        const ctx = {
            campaignMapCacheKey,
            roomDefaultEntryHints,
            campaignMapHints: campaignMapAllHints,
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

                const roomIndex = nextRoomIndex++;
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
                const rawName = body.length > 14
                    ? body.subarray(14, Math.min(body.length, 39)).toString('ascii').split('\0').shift()
                    : '';
                const roomName = rawName || `${nickname}`;
                const hasPassword = body.length > 39 ? body[39] : 0;
                const roomPassword = hasPassword
                    ? body.subarray(40, Math.min(body.length, 51)).toString('ascii').split('\0').shift()
                    : '';
                // isCampaignLike: roomType 1(캠페인)과 2(PvP) 모두 최대 8명 슬롯 유지용 (keeps max 8-player slots for both roomType 1 (campaign) and 2 (PvP))
                const isCampaignLike = (roomType === 1) || (roomType === 2) || (gameMode === 4 || gameMode === 5);
                const effectiveRoomType = isCampaignLike ? 2 : roomType;
                const maxPlayers = isCampaignLike
                    ? 8
                    : Math.min(Math.max(roomNumberValue || 1, 1), 8);
                // isTrueCampaign: 실제 캠페인 방 여부 (PvP는 false) (whether it is an actual campaign room, PvP=false)
                const isTrueCampaign = (roomType === 1) || (gameMode === 4 || gameMode === 5);

                console.log(`[ZGateGameDispatch] >> Creating room #${roomIndex} (type=${roomType}->${effectiveRoomType}, map=${mapId}, opt1=0x${createWord1.toString(16)}, opt2=0x${createWord2.toString(16)}, max=${maxPlayers}, mode=${gameMode}, valueFlag=${roomNumberFlag}, value=${roomNumberValue}) for "${nickname}"`);

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
                    respBody.write(roomName + '\0', 0x0E, Math.min(Buffer.byteLength(roomName) + 1, 0x19), 'ascii');
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
                return true;
            }

            // ==========================================
            // Room Game Start CQ
            // ==========================================
            case 0x00222103:
            {
                // Static analysis confirms both Game_Ready_SN (0x222102) and
                // Game_Start_SN (0x222104) consume the same simple SA body and
                // emit NETWORK_ROOM_GAME_READY. Current runtime only sending
                // 0x222104 did not progress beyond that point, so keep a narrow
                // experiment that can also send 0x222102 first.
                console.log(`[ZGateGameDispatch] >> Room Game_Start_CQ`);
                clearPendingRoomStateRetries(client, 'game-start cq');

                if (SERVER_DRIVEN_START_MODE === 'enabled') {
                    // Push to scene 6 first, then set the map there.
                    if (client.isTrueCampaign_ && !client.campaignMapCacheKey_)
                        client.campaignMapCacheKey_ = MAP_ID_DEFAULT_CAMPAIGN;
                    client.gameStarted_ = true;
                    client.campaignStarted_ = (Number(client.rawRoomType_) === 1) ||
                        (Number(client.gameMode_) === 4 || Number(client.gameMode_) === 5);
                    sendRoomGameWaitSn(client, 'server-driven: to scene 6');
                    // The in-game player table, which has to exist before the
                    // client builds its travel URL: Game_Info_URL_Get asks
                    // Game_User_Team_Get for team=%d, that searches the array
                    // Game_User_SN fills, and an empty array answers 255 —
                    // which is how the map came up with a free camera and no
                    // mech. Scene 6 first, or ZDispatchGame drops it.
                    setTimeout(() => sendGameUserSn(client, 'server-driven: in-game user table'), 60);
                    // Give the client a beat to enter scene 6 before the map,
                    // so the scene-6 Game_Info_SN handler is the one that runs.
                    setTimeout(() => sendGameInfoSn(client, 'server-driven: scene-6 map'), 150);
                    // Then complete the ready/start handshake to release the
                    // client's "Loading" wait. Game_Info_SN sets the map and
                    // preps state (Game_Play_Start) but does not itself travel;
                    // observed the client sitting at a Loading popup with no
                    // crash, waiting for this sequence we previously skipped.
                    setTimeout(() => {
                        sendOkSa(client, 0x00222102, 'server-driven: Game_Ready_SN');
                        sendOkSa(client, 0x00222104, 'server-driven: Game_Start_SN');
                    }, 300);
                    // The client sits at Loading, silent, after the above — the
                    // one thing the old (crashing) flow sent that this lacked is
                    // Ready_Host_SQ, which the client answered with 0x420114.
                    // The Game_Wait state is likely waiting on that host-ready
                    // handshake. Send it; if the client answers 0x420114, the
                    // 0x420114 handler (below) carries it forward.
                    setTimeout(() => sendReadyHostSq(client), 450);
                    setTimeout(() => sendGameInfoSn(client, 'server-driven: scene-6 map retry'), 600);
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
                return true;
            }

            // ==========================================
            // 0x00220234 — EXPERIMENT, purpose unconfirmed
            //
            // Observed 2026-09-15: pressing "back" inside a room sends this
            // with an empty body. It is even, so the default branch answers
            // nothing, and the client froze on a loading screen — it sent the
            // message again 79 seconds later and kept waiting.
            //
            // Hypothesis: it is a request that expects an answer, and the hang
            // is the client waiting for one. Untested alternative: it is a
            // notification needing no reply and the freeze has another cause.
            //
            // So this replies with the project's standard empty EVENT_INFO at
            // type+1 purely to see what the client does with it. It is not
            // knowledge. If the client still hangs, the hypothesis is wrong and
            // this should come straight back out — set the mode to 'disabled'.
            // Either way the result belongs in docs/opcode-ledger.md.
            // ==========================================
            case 0x00220234:
            {
                if (BACK_FROM_ROOM_SA_EXPERIMENT_MODE !== 'enabled') {
                    packetlog.fallback(client, 'ZGateGameDispatch', type, body, null);
                    return true;
                }

                console.log(`[ZGateGameDispatch] >> 0x220234 (back-from-room?) — EXPERIMENT: replying 0x220235`);
                const [msg, respBody] = client.getMessageBuffer(0x00220235, 0x6);
                respBody.writeUint16LE(0x0000, 0);
                respBody.writeUint32LE(0x0000, 2);
                client.send(msg);
                packetlog.marker('EXPERIMENT: answered 0x00220234 with 0x00220235 (empty EVENT_INFO)', 'auto');
                // Client pressed "back" in a room: drop room flags so the lobby
                // hangar is no longer treated as in-campaign-room.
                require('./room.dispatch').resetRoomSessionState(client);
                console.log(`[ZGateGameDispatch] >> Room state reset on Leave_CQ 0x220234`);
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
