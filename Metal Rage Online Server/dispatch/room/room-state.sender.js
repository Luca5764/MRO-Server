const SN_ROOM_DEFAULT = 0x00220203;
const SN_ROOM_BOUNDARY = 0x00220213;
const SN_ROOM_STATE = 0x00220214;
const SN_ROOM_OPTION = 0x00220217;
const SN_ROOM_NAME = 0x0022021A;
const { ROOM_STRING_ANSI_MODE, writeAnsiStringField, decodeBig5ForLog } = require('./room-string');

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
    } = ctx;

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
        respBody.writeUint8(0, 0x0B);
        respBody.writeUint8(0, 0x0C);
        respBody.writeUint8(0, 0x0D);
        respBody.writeUint8(0, 0x0E);
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
        respBody.writeUint8(currentUsers, 0x00);
        respBody.writeUint8(maxPlayers, 0x01);
        client.send(msg);
        console.log(`[ZRoomDispatch] >> Sent SN_ROOM_BOUNDARY 0x220213 (current=${currentUsers}, max=${maxPlayers})`);
    }

    {
        const [msg, respBody] = getExactMessageBuffer(SN_ROOM_OPTION, 0x04);
        const optionMask = (ctxOptionMask || 0) >>> 0;
        // Static analysis:
        // body+0x10 -> bit 0x01
        // body+0x11 -> bit 0x02
        // body+0x12 -> bit 0x04
        // body+0x13 -> bit 0x20
        respBody.writeUint8(optionMask & 0x01 ? 1 : 0, 0x00);
        respBody.writeUint8(optionMask & 0x02 ? 1 : 0, 0x01);
        respBody.writeUint8(optionMask & 0x04 ? 1 : 0, 0x02);
        respBody.writeUint8(optionMask & 0x20 ? 1 : 0, 0x03);
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
    sendRoomNameOnly,
};
