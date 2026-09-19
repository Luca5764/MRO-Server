const SN_ROOM_DEFAULT = 0x00220203;
const SN_ROOM_BOUNDARY = 0x00220213;
const SN_ROOM_STATE = 0x00220214;
const SN_ROOM_OPTION = 0x00220217;
const SN_ROOM_NAME = 0x0022021A;
const { ROOM_STRING_ANSI_MODE, writeAnsiStringField, decodeBig5ForLog } = require('./room-string');
const rooms = require('../../rooms.js');

// R11 verified [LOG][OBS]: body+0x10/+0x12 are Red/Blue TeamIndex, not the
// CQ_CREATE opt1/opt2 echo. See docs/journal/2026-09-18-15-room-team-index.md.
const ROOM_RED_TEAM_INDEX = 0;
const ROOM_BLUE_TEAM_INDEX = 1;

// R4 implemented but failed: using the real map id here had no observable
// effect; the room-settings list remained empty and showed 4 VS 4.
// See docs/journal/2026-09-18-11-room-default-map-entry.md.
const ROOM_DEFAULT_MAP_ENTRY_MODE = 'disabled'; // 'disabled' | 'enabled'
const MAP_ID_DEFAULT_PVE = 9001;
const MAP_ID_PVE_MIN = 9001;
const MAP_ID_PVE_MAX = 9012;

function resolveRoomDefaultMapEntry(client, fallback) {
    if (ROOM_DEFAULT_MAP_ENTRY_MODE !== 'enabled') return fallback;
    const selectedMapId = Number(client.campaignMapCacheKey_);
    return Number.isInteger(selectedMapId) &&
        selectedMapId >= MAP_ID_PVE_MIN && selectedMapId <= MAP_ID_PVE_MAX
        ? selectedMapId
        : MAP_ID_DEFAULT_PVE;
}

// ROOMSET-MAXUSER (backlog.md, docs/journal/2026-09-19-1000-maplist-single-entry.md
// H7 section): triggered by the same room-state send that runs on room
// create/enter/resend. ZPopup_RoomSet.Update_MapList() (~ZPopup_RoomSet.uc:575)
// only keeps a Cache map row when
// `MapInfoList[n].UserMin <= nUserMax && nUserMax <= MapInfoList[n].UserMax`,
// where nUserMax comes straight from MyRoomInfo.MaxUser via
// SetMaxUserInfo(MyRoomInfo.MaxUser) (ZPopup_RoomSet.uc:363,1068-1104) with no
// scaling/encoding applied before the comparison. [CACHE] (🟡, not
// independently re-verified against Cache.Bin here) 9001-9012 have
// UserMin=UserMax=16, so nUserMax must be exactly 16 for the "房間設定變更"
// dialog's map list to keep any row. Room_Boundary_SN body+1 is the wire
// value ZPage_Room.uc:768 reads as `MyRoomInfo.MaxUser`
// (`m_MaxUser = MaxUser/2`); 16/2=8 matches the known 8-slot PvE room
// screenshot, so this does not change the open-slot count. Only this one
// byte changes -- Room_Default_SN body+7 (join-capacity maxPlayers),
// Room_List_SN, rooms.js's room.maxPlayers, and Game_Info_SN are untouched,
// so join capacity stays 8. Verified ✅: the "房間設定變更" (room settings)
// dialog only lists maps with this on (docs/state.md H7 row,
// docs/journal/2026-09-19-1000-maplist-single-entry.md, 未經跨公司審查).
// SWITCH-CONVERGE: default flipped to 'enabled'.
let PVE_MAXUSER_WIRE_MODE = 'enabled'; // 'disabled' | 'enabled'
const PVE_MAXUSER_WIRE_VALUE = 16;

function isPveMaxUserWireEnabled() {
    return PVE_MAXUSER_WIRE_MODE === 'enabled';
}

// OPTIONMASK-FIX (docs/backlog.md, docs/research/2026-09-19-intrude/notes.md,
// 🟡 待審): returns the real per-flag bits from `room.options` when
// isRoomOptionSourceEnabled() is true and a roomOptions object was passed,
// else null so each call site falls back to its own pre-existing (legacy)
// behaviour byte-for-byte.
function resolveRoomOptionBitsFromRoomSource(roomOptions) {
    if (!rooms.isRoomOptionSourceEnabled() || !roomOptions) return null;
    return {
        password: roomOptions.password ? 1 : 0,
        balance: roomOptions.balance ? 1 : 0,
        intrude: roomOptions.intrude ? 1 : 0,
        training: roomOptions.training ? 1 : 0,
    };
}

// OPTIONMASK-FIX: standalone Room_Option_SN send, for Room_Option_Change_CQ
// (client action: host confirms team-balance/battle-intrude in the "房間設定
// 變更" dialog, gate.game.dispatch.js case 0x00220215) to broadcast to every
// room member without re-sending the whole room-state burst. Only used when
// isRoomOptionSourceEnabled() is true (see that handler) -- roomOptions is
// always defined by that caller, so the legacy fallback path never runs
// here.
function sendRoomOptionOnly(client, roomOptions, getExactMessageBuffer) {
    const [msg, respBody] = getExactMessageBuffer(SN_ROOM_OPTION, 0x04);
    const bits = resolveRoomOptionBitsFromRoomSource(roomOptions) ||
        { password: 0, balance: 0, intrude: 0, training: 0 };
    respBody.writeUint8(bits.password, 0x00);
    respBody.writeUint8(bits.balance, 0x01);
    respBody.writeUint8(bits.intrude, 0x02);
    respBody.writeUint8(bits.training, 0x03);
    client.send(msg);
    console.log(
        `[ZRoomDispatch] >> Sent SN_ROOM_OPTION 0x220217 [option-change broadcast] ` +
        `(flags=${bits.password},${bits.balance},${bits.intrude},${bits.training})`
    );
}

function _setPveMaxUserWireModeForTests(mode) {
    PVE_MAXUSER_WIRE_MODE = mode;
}

function resolveBoundaryMaxUser(maxPlayers, isTrueCampaign) {
    if (isPveMaxUserWireEnabled() && isTrueCampaign) {
        return PVE_MAXUSER_WIRE_VALUE;
    }
    return maxPlayers;
}

// ROOMNAME-BIG5 (docs/journal/2026-09-19-*-room-name-big5.md): factored out
// of sendRoomStatePackets() so the NAME-CHANGE handler in
// gate.game.dispatch.js (client action: pressing OK in the room-settings
// dialog with a new room name, Name_Change_CQ 0x00220218) can resend just
// this one SN to every room member after a rename, without re-sending the
// whole room-state burst. Byte-identical to the inline block this replaced.
function sendRoomNameOnly(client, roomName, getExactMessageBuffer) {
    const [msg, respBody] = getExactMessageBuffer(SN_ROOM_NAME, 0x32);
    if (ROOM_STRING_ANSI_MODE === 'enabled') {
        writeAnsiStringField(respBody, roomName, 0x00, 0x32);
    } else {
        respBody.write(roomName + '\0', 0x00, 'utf16le');
    }
    client.send(msg);
    // ROOMNAME-BIG5: decodeBig5ForLog() returns null (nothing appended)
    // unless ROOM_NAME_RAW_BYTES_MODE is on, so this stays byte/log
    // identical while the switch is off.
    const big5Readable = decodeBig5ForLog(roomName);
    console.log(`[ZRoomDispatch] >> Sent SN_ROOM_NAME 0x22021A ("${roomName}"${big5Readable ? ` big5="${big5Readable}"` : ''})`);
}

function sendRoomStatePackets(client, ctx, getExactMessageBuffer) {
    const {
        roomIndex,
        accountIndex,
        roomType,
        mapId,
        maxPlayers,
        currentUsers,
        gameMode,
        mapIndex,
        roomName,
        selectedMech,
        primaryBodyCacheIndex,
        roomSettingGoal,
        roomSettingTime,
        roomSettingRound,
        roomDefaultEntryCount,
        roomDefaultEntryHints,
        // D1-4c: read from ctx, not client.campaignRoom_/client.createWord2_
        // directly -- a joiner's full room-state send (gate.game.dispatch.js
        // Enter_CQ) builds ctx straight from the shared Room object, and
        // never has these set on its own connection. Both callers of this
        // function now populate them the same way: room.dispatch.js
        // sendRoomState() from the creator's own client.xxx_ fields (byte-
        // identical to before), Enter_CQ's joiner ctx from the Room.
        isCampaignRoom,
        optionMask: ctxOptionMask,
        // OPTIONMASK-FIX: room.options (rooms.js), when
        // isRoomOptionSourceEnabled() -- undefined/ignored otherwise, so
        // callers that never set it (test/rooms.js, test/room-chat.js) keep
        // the legacy ctxOptionMask decoding untouched.
        roomOptions,
        isTrueCampaign,
    } = ctx;

    // OPTIONMASK-FIX: null while the switch is off (or the caller passed no
    // roomOptions), so each write site below falls back to its own
    // pre-existing legacy behaviour, byte-for-byte.
    const roomSourceOptionBits = resolveRoomOptionBitsFromRoomSource(roomOptions);

    {
        const bodySize = 0x021A;
        const [msg, respBody] = getExactMessageBuffer(SN_ROOM_DEFAULT, bodySize);
        const roomLinkIndex = isCampaignRoom ? accountIndex : roomIndex;
        respBody.writeUint16LE(accountIndex, 0x00);
        respBody.writeUint16LE(roomLinkIndex, 0x02);
        respBody.writeUint8(roomType, 0x04);
        respBody.writeUint16LE(mapIndex & 0xFFFF, 0x05);
        respBody.writeUint8(maxPlayers, 0x07);
        respBody.writeUint8(gameMode, 0x08);
        respBody.writeUint8(3, 0x09);
        respBody.writeUint8(0, 0x0A);
        // OPTIONMASK-FIX (docs/research/2026-09-19-intrude/notes.md, 🟡
        // 待審): body+0x0B..0x0E mirror the same 4 option bits as
        // Room_Option_SN (RoomInfo+0xcc client-side), in the same order.
        // Legacy behaviour (ROOM_OPTION_SOURCE_MODE off) always wrote 0
        // here -- unlike Room_Option_SN below, this block never decoded the
        // buggy optionMask, so the byte-identical fallback is 0, not a mask
        // decode.
        const defaultEntryOptionBits = roomSourceOptionBits ||
            { password: 0, balance: 0, intrude: 0, training: 0 };
        respBody.writeUint8(defaultEntryOptionBits.password, 0x0B);
        respBody.writeUint8(defaultEntryOptionBits.balance, 0x0C);
        respBody.writeUint8(defaultEntryOptionBits.intrude, 0x0D);
        respBody.writeUint8(defaultEntryOptionBits.training, 0x0E);
        const redTeamIndex = ROOM_RED_TEAM_INDEX;
        const blueTeamIndex = ROOM_BLUE_TEAM_INDEX;
        respBody.writeUint16LE(redTeamIndex, 0x10);
        respBody.writeUint16LE(blueTeamIndex, 0x12);
        respBody.writeUint8(0, 0x1B);
        respBody.writeUint8(roomSettingGoal, 0x1C);
        respBody.writeUint8(roomSettingTime, 0x1D);
        respBody.writeUint8(roomSettingRound, 0x1E);
        respBody.writeUint8(roomDefaultEntryCount, 0x1F);

        const firstEntryMapIndex = resolveRoomDefaultMapEntry(client, primaryBodyCacheIndex);

        for (let i = 0; i < roomDefaultEntryCount; i++) {
            const entryOffset = 0x20 + (i * 9);
            const cacheIndex = (i === 0)
                ? firstEntryMapIndex
                : roomDefaultEntryHints[i];
            respBody.writeUint16LE(cacheIndex, entryOffset + 0x00);
            respBody.writeUint16LE(0, entryOffset + 0x02);
            respBody.writeUint8(1, entryOffset + 0x04);
            respBody.writeUint16LE(selectedMech + i, entryOffset + 0x05);
            respBody.writeUint16LE(0, entryOffset + 0x07);
        }

        // Write slot-count AFTER the entry loop so it is not overwritten.
        // body+0x2F feeds FROOM_INFO slot-count state in the client.
        respBody.writeUint8(roomDefaultEntryCount, 0x2F);

        client.send(msg);
        console.log(`[ZRoomDispatch] >> Sent SN_ROOM_DEFAULT (${bodySize} bytes, account=${accountIndex}, room=${roomIndex}, link=${roomLinkIndex}, type=${roomType}, mapIndex=${mapIndex}, map=${mapId}, opt2=0x${((ctxOptionMask || 0) >>> 0).toString(16)}, redTeam=${redTeamIndex}, blueTeam=${blueTeamIndex}, max=${maxPlayers}, mode=${gameMode}, goal=${roomSettingGoal}, time=${roomSettingTime}, round=${roomSettingRound}, entryCount=${roomDefaultEntryCount}, bodyCache=${primaryBodyCacheIndex})`);
    }

    sendRoomNameOnly(client, roomName, getExactMessageBuffer);

    {
        // BOUNDARY-SWAP [DLL 0x107ea8e0] Room_Boundary_SN real body: 0x107ea95d
        // `movzx ecx,[eax+0x10]` -> [esi+0x1c] = ROOM_INFO.CurrentUser (body+0),
        // 0x107ea964 `movzx edx,[eax+0x11]` -> [esi+0x18] = ROOM_INFO.MaxUser
        // (body+1). Previous order (max at +0, current at +1) made the client
        // read MaxUser into CurrentUser's slot and vice versa; ZPage_Room.uc:768
        // `m_MaxUser = MaxUser/2` then divided garbage, and [SHOT]
        // shots/room-ready-host.png showed all 16 room slots drawn closed.
        // Room_Default_SN (0x00220203) +7/+8 are a separate, still-wrong pair
        // -- not touched here, left as a follow-up.
        const [msg, respBody] = getExactMessageBuffer(SN_ROOM_BOUNDARY, 0x02);
        const boundaryMaxUser = resolveBoundaryMaxUser(maxPlayers, isTrueCampaign);
        respBody.writeUint8(currentUsers, 0x00);
        respBody.writeUint8(boundaryMaxUser, 0x01);
        client.send(msg);
        console.log(`[ZRoomDispatch] >> Sent SN_ROOM_BOUNDARY 0x220213 (current=${currentUsers}, max=${boundaryMaxUser})`);
    }

    {
        const [msg, respBody] = getExactMessageBuffer(SN_ROOM_OPTION, 0x04);
        const optionMask = (ctxOptionMask || 0) >>> 0;
        // Static analysis:
        // body+0x10 -> bit 0x01
        // body+0x11 -> bit 0x02
        // body+0x12 -> bit 0x04
        // body+0x13 -> bit 0x20
        // OPTIONMASK-FIX: legacy behaviour (switch off) decodes the buggy
        // optionMask bitmask, byte-identical to before. Enabled, uses the
        // real room.options bits instead.
        const optionSnBits = roomSourceOptionBits || {
            password: optionMask & 0x01 ? 1 : 0,
            balance: optionMask & 0x02 ? 1 : 0,
            intrude: optionMask & 0x04 ? 1 : 0,
            training: optionMask & 0x20 ? 1 : 0,
        };
        respBody.writeUint8(optionSnBits.password, 0x00);
        respBody.writeUint8(optionSnBits.balance, 0x01);
        respBody.writeUint8(optionSnBits.intrude, 0x02);
        respBody.writeUint8(optionSnBits.training, 0x03);
        client.send(msg);
        console.log(
            `[ZRoomDispatch] >> Sent SN_ROOM_OPTION 0x220217 ` +
            `(flags=${respBody.readUint8(0x00)},${respBody.readUint8(0x01)},${respBody.readUint8(0x02)},${respBody.readUint8(0x03)} mask=0x${optionMask.toString(16)})`
        );
    }

    {
        const [msg, respBody] = getExactMessageBuffer(SN_ROOM_STATE, 0x02);
        respBody.writeUint8(3, 0x00);
        respBody.writeUint8(0, 0x01);
        client.send(msg);
        console.log(`[ZRoomDispatch] >> Sent SN_ROOM_STATE 0x220214 (2 bytes)`);
    }
}

module.exports = {
    sendRoomStatePackets,
    _setPveMaxUserWireModeForTests,
    sendRoomNameOnly,
    sendRoomOptionOnly,
};
