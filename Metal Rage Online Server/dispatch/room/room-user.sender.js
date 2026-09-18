const SN_USER_DEFAULT = 0x00220233;
const SN_USER_STATE = 0x00220401;
const SN_USER_MASTER = 0x00220319;
const SN_USER_NAME = 0x00220421;
const SN_USER_PILOT = 0x00220402;
const { ROOM_STRING_ANSI_MODE, writeAnsiStringField } = require('./room-string');

// R12 verified [DLL][OBS]: User_Name_SN body+0x1B is ANSI, converted to
// UTF-16LE client-side by winToUNICODE (0x107eb0ce). Sending UTF-16LE here
// only displayed the first letter.
// See docs/journal/2026-09-18-17-user-name-ansi.md.

function sendRoomUserPackets(client, ctx, getExactMessageBuffer, options = {}) {
    // D1-4 (docs/backlog.md): sending one room member's User_Default/Name/
    // Pilot/State to a *different* client (a joiner learning about the
    // room's existing members, or existing members learning about a new
    // joiner) must not also claim that member is the room master --
    // otherwise looping this per member would send one User_Master_SN per
    // member, the last of which would "win" and misname the master.
    // Defaults to true so every call site that pre-dates this option (the
    // single-occupant room-creator path) keeps sending User_Master_SN
    // exactly as before.
    const includeMaster = options.includeMaster !== false;
    const {
        accountIndex,
        pilotId,
        userLevelText,
        userLevelType,
        teamIndex,
        userHiddenRaw,
        userStateRaw,
        packedIp,
        nickname,
    } = ctx;

    {
        // Header is 2 bytes, then `count` user records of 0x34 bytes each,
        // memcpy'd whole and read field by field. Entry offsets in comments.
        //
        // The old layout wrote the level text at 0x08 (2 bytes) and then
        // jumped to 0x0E, leaving 0x0A-0x0D as zeros — and 0x0A is where the
        // hidden/score dword is read from. Everything after it was shifted
        // too: 0x0E is a one-byte level type, not the start of a dword, and
        // the state dword belongs at 0x0F. The record the client assembled
        // was therefore junk, and the player never appeared in a room slot,
        // was never the master, and had no team.
        const [msg, respBody] = getExactMessageBuffer(SN_USER_DEFAULT, 0x36);
        respBody.writeUint8(0, 0x00);                        //       status, must be 0
        respBody.writeUint8(1, 0x01);                        //       user count
        respBody.writeUint16LE(accountIndex, 0x02);          // +0x00 user index
        respBody.writeUint32LE(pilotId, 0x04);               // +0x02 pilot id
        respBody.write(userLevelText + '\0', 0x08, 'ascii'); // +0x06 level, ASCII, atoi'd
        respBody.writeUint32LE(userHiddenRaw >>> 0, 0x0A);   // +0x08 hidden / score
        respBody.writeUint8(userLevelType, 0x0E);            // +0x0C level type
        respBody.writeUint32LE(userStateRaw, 0x0F);          // +0x0D state flags
        respBody.writeUint16LE(teamIndex, 0x13);             // +0x11 team: 0 red, 1 blue
        respBody.writeUint32LE(0, 0x15);                     // +0x13 rank / substate
        respBody.writeUint32LE(packedIp, 0x19);              // +0x17 clan id / packed ip
        if (ROOM_STRING_ANSI_MODE === 'enabled') {
            writeAnsiStringField(respBody, nickname, 0x1D, 0x19);
        } else {
            respBody.write(nickname + '\0', 0x1D, 'ascii'); // +0x1B nickname, ASCII,
        }                                                        // widened by client
        client.send(msg);
        console.log(`[ZRoomDispatch] >> Sent SN_USER_DEFAULT 0x220233 (54 bytes, count=1, userIndex=${accountIndex}, pilot=${pilotId}, nickname="${nickname}", team=${teamIndex}, hiddenRaw=${userHiddenRaw}, stateRaw=${userStateRaw}, levelType=${userLevelType}, roomStateRaw=${userStateRaw})`);
    }

    {
        const [msg, respBody] = getExactMessageBuffer(SN_USER_NAME, 0x4E);
        respBody.writeUint16LE(accountIndex, 0x00);
        writeAnsiStringField(respBody, nickname, 0x1B, 0x4E - 0x1B);
        client.send(msg);
        console.log(`[ZRoomDispatch] >> Sent SN_USER_NAME 0x220421 ("${nickname}")`);
    }

    {
        const [msg, respBody] = getExactMessageBuffer(SN_USER_PILOT, 0x06);
        respBody.writeUint16LE(accountIndex, 0x00);
        respBody.writeUint32LE(pilotId, 0x02);
        client.send(msg);
        console.log(`[ZRoomDispatch] >> Sent SN_USER_PILOT 0x220402 (pilot=${pilotId})`);
    }

    {
        const [msg, respBody] = getExactMessageBuffer(SN_USER_STATE, 0x08);
        respBody.writeUint8(0, 0x00);
        respBody.writeUint8(1, 0x01);
        respBody.writeUint16LE(accountIndex, 0x02);
        respBody.writeUint32LE(userStateRaw, 0x04);
        client.send(msg);
        console.log(`[ZRoomDispatch] >> Sent SN_USER_STATE 0x220401 (count=1, userIndex=${accountIndex}, state=${userStateRaw})`);
    }

    // Always, not once per connection.
    //
    // The room state block is re-sent several times by the retry timer, and
    // every one of those re-sends carries User_Default_SN, which rebuilds the
    // client's room user array. Room_Master_Set is only called by this packet,
    // so a block without it leaves the rebuilt array with no master.
    //
    // Observed exactly that: "I saw 'start game' the instant I entered, and a
    // prompt saying I was the room master, and then it immediately turned into
    // 'ready'." The first block made them master; the next three took it away.
    if (includeMaster) {
        const [msg, respBody] = getExactMessageBuffer(SN_USER_MASTER, 0x06);
        respBody.writeUint16LE(accountIndex, 0x00);
        respBody.writeUint32LE(userStateRaw, 0x02);
        client.send(msg);
        client.roomMasterSent_ = true;
        console.log(`[ZRoomDispatch] >> Sent SN_USER_MASTER 0x220319 (userIndex=${accountIndex}, state=${userStateRaw})`);
    }
}

module.exports = {
    sendRoomUserPackets,
};
