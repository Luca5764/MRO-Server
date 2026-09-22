'use strict';

// T2.5a (docs/backlog.md; docs/research/2026-09-23-team-scoreboard/
// candidates.md §2, PM-ordered DLL research before touching the wire):
// manual server-console command `/pvpscore <roomId> <redScore> <blueScore>
// [joiner|host|all]` for DYNAMIC VALIDATION of the leading candidate for
// "which packet drives the in-battle team scoreboard" -- send one
// Timeout_SN 0x00230112 with known scores mid-match, screenshot, see
// whether the on-screen team total changes to that number.
//
// This is a debug tool triggered only by an operator typing at the console
// (see server.js's packetlog.listenForMarkers() wiring), NOT a client
// packet handler: no client input reaches this file, it changes no
// existing packet, and it never fires on its own. It also does not touch
// T2's own scoring logic (pvp-kill-tracking.js) at all.
//
// Body field table is candidates.md §2 -- read that before touching any
// offset here. Summary (body offset counted from frame+0x10, per project
// convention):
//   +0x00 u16 LE, +0x02 u32 LE  -- MUST be 0. [DLL] 0x107d7884/0x107d7889/
//     0x107d788f/0x107d7894: the client's Game_Score_Set gate skips the
//     whole packet otherwise.
//   +0x0a u16 LE  -- Block A id key. 🟡 candidates.md only confirms this is
//     read as a key into the per-team score table, not that it must be a
//     team index. Filled with 0 here on the same convention already used
//     for Game_Info_SN's redTeamIndex/blueTeamIndex (gate.game.dispatch.js
//     sendGameInfoSn(): red=0, blue=1) -- if dynamic validation shows no
//     effect, try swapping this pair of id-key constants before anything
//     else; the full body hex is always logged below so a failed attempt
//     can be replayed by hand with different values.
//   +0x0c u16 LE  -- Block A score (this command's redScore).
//   +0x18 u16 LE  -- Block B id key, mirrors +0x0a (block size 0xE). Filled
//     with 1 (🟡 same caveat as +0x0a).
//   +0x1a u16 LE  -- Block B score (this command's blueScore), mirrors +0x0c.
//   everything else in 0x06..0x25 -- not read by any confirmed path in
//   candidates.md §2 (mostly ⬜); left at 0, per AGENTS.md "未列出的欄位一律填 0".
// Body min length is 0x26 (38 bytes); frame is 0x36 (54 bytes), both far
// under the client's 0x400 hard frame-size cap (client.js's
// CLIENT_MAX_FRAME / ZNetwork.dll 0x107f8fad).
//
// Switch: PVP_TEAM_SCORE_SYNC_MODE, default 'disabled'. Unlike a normal
// *_MODE gate (which no-ops a function body), server.js checks
// isPvpTeamScoreSyncEnabled() BEFORE deciding whether to register the
// '/pvpscore' console command at all -- disabled means the command simply
// does not exist (same as typing any other unrecognized text: it becomes a
// plain packetlog marker), not "registered but refuses to run".
let PVP_TEAM_SCORE_SYNC_MODE = 'disabled'; // 'disabled' | 'enabled'

function isPvpTeamScoreSyncEnabled()
{
    return PVP_TEAM_SCORE_SYNC_MODE === 'enabled';
}

// Test-only hook, same pattern as every other *_MODE in this codebase
// (e.g. pvp-kill-tracking.js's _setPvpKillTrackingModeForTest). Not called
// anywhere outside test/.
function _setPvpTeamScoreSyncModeForTest(mode)
{
    PVP_TEAM_SCORE_SYNC_MODE = mode;
}

const rooms = require('../../rooms.js');

const OPCODE_TIMEOUT_SN = 0x00230112;
const BODY_SIZE = 0x26; // candidates.md §2: confirmed minimum body length

// Same local helper room.dispatch.js and community.dispatch.js each already
// define -- deliberately NOT client.getMessageBuffer(): this exact opcode
// already has a precedent in this codebase (room.dispatch.js's two
// 0x00230112 sends, the SA_LOBBY_ENTER use) and both use
// getExactMessageBuffer, not the client's pad-to-16-bytes
// getMessageBuffer. Padding this packet to 0x40 would tack 10 zero bytes
// onto the end past the last field candidates.md confirms the handler
// reads (+0x25); there is no evidence the handler wants or tolerates that,
// so this follows the existing convention for the same opcode instead of
// guessing a new one.
function getExactMessageBuffer(type, bodySize)
{
    const msg = Buffer.alloc(0x10 + bodySize);
    msg.writeUint16BE(msg.length, 0x6);
    msg.writeUint32BE(type, 0xC);
    return [msg, msg.subarray(0x10)];
}

/**
 * Builds one fresh Timeout_SN 0x00230112 frame with the given team scores.
 * Returns a brand-new Buffer every call (Buffer.alloc, not a shared
 * scratch region), so it is safe to call once per recipient the way
 * rooms.js's sendAll() comment requires for client.getMessageBuffer.
 * @param {number} redScore  - Block A score, +0x0c
 * @param {number} blueScore - Block B score, +0x1a
 * @returns {Buffer} full frame, header + body
 */
function buildTimeoutScoreFrame(redScore, blueScore)
{
    const [msg, body] = getExactMessageBuffer(OPCODE_TIMEOUT_SN, BODY_SIZE);
    // +0x00 (u16) and +0x02 (u32) stay at Buffer.alloc's default 0 -- the gate.
    body.writeUInt16LE(0, 0x0a); // Block A id key -- team 0 (red), 🟡 see header
    body.writeUInt16LE(redScore, 0x0c);
    body.writeUInt16LE(1, 0x18); // Block B id key -- team 1 (blue), 🟡 see header
    body.writeUInt16LE(blueScore, 0x1a);
    return msg;
}

function isU16(n)
{
    return Number.isInteger(n) && n >= 0 && n <= 0xFFFF;
}

/**
 * Picks which room members this command should send to.
 * @param {object} room - rooms.js Room
 * @param {'joiner'|'host'|'all'} target
 * @returns {{member: object, isHost: boolean}[]} live-connection members only
 */
function resolveTargets(room, target)
{
    const out = [];
    for (const member of room.members.values())
    {
        const isHost = member.accountId === room.hostAccountId;
        if (target === 'host' && !isHost) continue;
        if (target === 'joiner' && isHost) continue;
        if (!member.client) continue; // disconnected/reconnecting -- nothing to send to
        out.push({ member, isHost });
    }
    return out;
}

/**
 * Console command handler for `/pvpscore <roomId> <redScore> <blueScore>
 * [joiner|host|all]`. Registered by server.js only while
 * isPvpTeamScoreSyncEnabled() is true. Triggered purely by an operator
 * typing at the server console -- never by any client packet.
 * @param {string} argsText - everything after the `/pvpscore` token
 */
function handlePvpScoreCommand(argsText)
{
    const parts = argsText.split(/\s+/).filter(Boolean);
    if (parts.length < 3 || parts.length > 4)
    {
        console.log('[pvpscore] Usage: /pvpscore <roomId> <redScore> <blueScore> [joiner|host|all] (default joiner)');
        return;
    }

    const [roomIdText, redText, blueText, targetText] = parts;
    const target = (targetText || 'joiner').toLowerCase();
    if (target !== 'joiner' && target !== 'host' && target !== 'all')
    {
        console.log(`[pvpscore] Unknown target '${targetText}' -- expected joiner, host, or all.`);
        return;
    }

    const roomId = Number.parseInt(roomIdText, 10);
    if (!Number.isInteger(roomId))
    {
        console.log(`[pvpscore] roomId must be an integer, got '${roomIdText}'`);
        return;
    }

    const redScore = Number.parseInt(redText, 10);
    const blueScore = Number.parseInt(blueText, 10);
    if (!isU16(redScore) || !isU16(blueScore))
    {
        console.log(`[pvpscore] redScore/blueScore must be integers in 0..65535, got '${redText}' '${blueText}'`);
        return;
    }

    const room = rooms.getRoom(roomId);
    if (!room)
    {
        console.log(`[pvpscore] No room ${roomId}`);
        return;
    }
    if (room.members.size === 0)
    {
        console.log(`[pvpscore] Room ${roomId} has no members`);
        return;
    }

    const targets = resolveTargets(room, target);
    if (targets.length === 0)
    {
        console.log(`[pvpscore] Room ${roomId}: no live connection matches target='${target}' `
            + `(hostAccountId=${room.hostAccountId}, members=[${[...room.members.keys()].join(',')}])`);
        return;
    }

    // Logged once up front -- this is the only thing to check by hand if
    // the on-screen scoreboard does not move (AGENTS.md: hex dump is the
    // primary evidence, print it in full).
    const previewBody = buildTimeoutScoreFrame(redScore, blueScore).subarray(0x10);
    console.log(`[pvpscore] Timeout_SN 0x00230112 body (idKeyRed=0, idKeyBlue=1, both 🟡 candidates -- `
        + `see dispatch/room/pvp-score-debug.js header): ${previewBody.toString('hex')}`);

    for (const { member, isHost } of targets)
    {
        const msg = buildTimeoutScoreFrame(redScore, blueScore);
        member.client.send(msg);
        console.log(`[pvpscore] >> Sent to room ${roomId} ${isHost ? 'host' : 'joiner'} `
            + `accountId=${member.accountId} nickname=${member.nickname} `
            + `connId=${member.client.connId_} redScore=${redScore} blueScore=${blueScore} `
            + `frame=${msg.toString('hex')}`);
    }
}

module.exports = {
    isPvpTeamScoreSyncEnabled,
    _setPvpTeamScoreSyncModeForTest,
    handlePvpScoreCommand,
    buildTimeoutScoreFrame,
    resolveTargets,
};
