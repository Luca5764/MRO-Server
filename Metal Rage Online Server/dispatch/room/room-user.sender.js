const SN_USER_DEFAULT = 0x00220233;
const SN_USER_STATE = 0x00220401;
const SN_USER_MASTER = 0x00220319;
const SN_USER_NAME = 0x00220421;
const SN_USER_PILOT = 0x00220402;
const { ROOM_STRING_ANSI_MODE, writeAnsiStringField } = require('./room-string');
// READY-IMPL (docs/backlog.md): buildMemberUserCtx below reads the switch
// and each Member's `ready` flag from here. rooms.js does not require
// anything under dispatch/, so this has no cycle risk.
const rooms = require('../../rooms.js');

// R12 verified [DLL][OBS]: User_Name_SN body+0x1B is ANSI, converted to
// UTF-16LE client-side by winToUNICODE (0x107eb0ce). Sending UTF-16LE here
// only displayed the first letter.
// See docs/journal/2026-09-18-17-user-name-ansi.md.

// SELF-AVATAR-EXP (docs/backlog.md, 中階 experiment, 未經跨公司審查): R14/R15
// (journal/2026-09-18-2305-room-avatar-experiments.md) tried changing the
// PilotCode value itself and still never saw a self avatar; neither
// experiment ever resent the record after the room page was already open,
// so timing was never excluded as a variable. [LOG]
// session-20260919-111258.jsonl: host Lucas got her own record in the room-
// create burst at ms 617230/618080 and never saw her own avatar even after
// a later member-list redraw (test joining); test only saw her own avatar
// after becoming host at ms 2291017, when her own record set was resent
// while the room page was already open (via the pre-existing host-handoff
// path, not this switch). This experiment tests that timing hypothesis
// directly: resend the same client's own record set, byte-identical, a
// fixed delay after it was first sent.
// SWITCH-CONVERGE: judged useless -- BOUNDARY-SWAP was the real cause of
// the missing avatars, not timing. Kept 'disabled', slated for deletion (C
// task), not removed in this pass.
let ROOM_SELF_RECORD_RESEND_MODE = 'disabled'; // 'disabled' | 'enabled'
const ROOM_SELF_RECORD_RESEND_DELAY_MS = 1500;

// Triggered by room CREATE (room.dispatch.js sendRoomState(), host path) and
// room ENTER (gate.game.dispatch.js Enter_CQ's sendFullRoomStateToClient(),
// joiner path) -- both call this right after they send that client's own
// User_Default/Name/Pilot/State/Master burst. Debounced per connection:
// each call clears any still-pending timer for that client first, so the
// two-step ROOM_STATE_RETRY_SCHEDULE burst (350ms/1200ms) collapses into
// exactly one resend, timed off the last send in the burst.
function scheduleSelfRecordResend(client, ctx, getExactMessageBuffer, includeMaster, tag) {
    if (ROOM_SELF_RECORD_RESEND_MODE !== 'enabled') return;
    if (client.selfRecordResendTimer_) {
        clearTimeout(client.selfRecordResendTimer_);
    }
    const accountIndex = ctx.accountIndex;
    client.selfRecordResendTimer_ = setTimeout(() => {
        client.selfRecordResendTimer_ = null;
        // Guard: connection closed.
        if (!client.socket_ || client.socket_.destroyed) {
            console.log(`[ZRoomDispatch] >> SELF-AVATAR-EXP: skipped self-record resend for account ${accountIndex}, connection closed [${tag}]`);
            return;
        }
        // Guard: client no longer a live member of that room (left, kicked,
        // or a different connection now holds the membership).
        const room = rooms.getRoomByAccount(accountIndex);
        const member = room && room.members.get(accountIndex);
        if (!room || !member || member.client !== client) {
            console.log(`[ZRoomDispatch] >> SELF-AVATAR-EXP: skipped self-record resend for account ${accountIndex}, no longer in room [${tag}]`);
            return;
        }
        // READY-IMPL interaction: ctx was captured before the delay, and a
        // ready press in between (which itself triggers a room-state resend
        // and so re-arms this timer) would otherwise be overwritten by a
        // stale raw 1 in User_State_SN 0x00220401. Read the current flag.
        const resendCtx = { ...ctx, readyStateRaw: member.ready ? 2 : 1 };
        sendRoomUserPackets(client, resendCtx, getExactMessageBuffer, { includeMaster });
        console.log(`[ZRoomDispatch] >> SELF-AVATAR-EXP: resent own record set to account ${accountIndex} [${tag}]`);
    }, ROOM_SELF_RECORD_RESEND_DELAY_MS);
}

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
        // READY-IMPL (docs/backlog.md): separate from userStateRaw above --
        // that one still feeds User_Default_SN 0x00220233's body+0x0F field
        // (semantics unverified, room.dispatch.js:1478's comment) and
        // User_Master_SN 0x00220319, unchanged. This one only feeds
        // User_State_SN 0x00220401 below. Defaults to userStateRaw so any
        // caller that does not set it (room.dispatch.js's own sendRoomState())
        // stays byte-identical.
        readyStateRaw = userStateRaw,
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
        respBody.writeUint32LE(readyStateRaw, 0x04);
        client.send(msg);
        console.log(`[ZRoomDispatch] >> Sent SN_USER_STATE 0x220401 (count=1, userIndex=${accountIndex}, state=${readyStateRaw})`);
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

// D1-4 (docs/backlog.md): builds the ctx sendRoomUserPackets() needs for one
// rooms.js Member. Used both for "tell the joiner about this existing
// member" and "tell existing members about the joiner" -- same shape either
// way, since rooms.js's Member already carries everything sendRoomState()
// used to read straight off the single occupant's client fields (nickname,
// team). Pilot id still comes from the member's own connection
// (client.pilot_) when it has one connected, same default (101)
// sendRoomState() already uses. Colocated with sendRoomUserPackets (not
// gate.game.dispatch.js, its original home) because dispatch/room/room-leave.js
// (the disconnect/Leave_CQ shared path) needs it too and importing a plain
// function from a dispatch class module would be unusual for this codebase.
function buildMemberUserCtx(member) {
    return {
        accountIndex: member.accountId,
        pilotId: Number(member.client && member.client.pilot_) || 101,
        userLevelText: '1',
        userLevelType: 2,
        teamIndex: member.team || 0,
        userHiddenRaw: 0,
        userStateRaw: 1,
        // READY-IMPL (docs/backlog.md): raw 2 = READY once client-normalized
        // (ZPage_Room.uc:2450, see the READY-IMPL comment in
        // gate.game.dispatch.js) if this member has pressed Ready; otherwise
        // the same constant 1 as userStateRaw above.
        readyStateRaw: member.ready ? 2 : 1,
        packedIp: 0x0100007F,
        nickname: member.nickname || 'Player',
    };
}

module.exports = {
    sendRoomUserPackets,
    buildMemberUserCtx,
    scheduleSelfRecordResend,
};

// SELF-AVATAR-EXP: test-only setter, same pattern as gate.game.dispatch.js's
// _setRoomMapBroadcastModeForTest -- lets test/self-avatar-resend.js flip
// the switch on for its own scope without changing the shipped default.
module.exports._setSelfRecordResendModeForTest = function setSelfRecordResendModeForTest(mode)
{
    ROOM_SELF_RECORD_RESEND_MODE = mode;
};
