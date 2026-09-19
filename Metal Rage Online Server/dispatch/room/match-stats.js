'use strict';

// P3 step 2 (docs/design/p3-step1-writeback.md §2.2, high-tier review
// 2026-09-20 point 1): room-level match/round stats, memory + log only --
// no DB writes here (that is a later P3 step, gated by Sol's review per the
// design doc). Attached to the Room object (rooms.js), not to a client
// connection: Death_CN is only ever sent by the room's P2P host
// (dispatch/lobby.dispatch.js's own Death_CN comment, "only the P2P host
// ever sends Death_CN"), so per-connection storage would only ever
// accumulate stats on the host's own connection instead of the whole room.
//
// Switch: MATCH_STATS_MODE, default 'disabled' -- same pattern as
// lobby.dispatch.js's PVE_ROUND_ADVANCE_MODE / rooms.js's battleLeaveMode
// ('let' + isXEnabled() + _setXModeForTest()). Disabled: every exported
// function below is a no-op (no room.matchStats is ever created, no log
// lines, no packets -- none of these functions send packets at all, so the
// switch cannot affect wire bytes either way).
let MATCH_STATS_MODE = 'disabled'; // 'disabled' | 'enabled'

function isMatchStatsEnabled()
{
    return MATCH_STATS_MODE === 'enabled';
}

// Test-only hook (same pattern as lobby.dispatch.js's
// _setPveRoundAdvanceModeForTest). Not called anywhere outside test/.
function _setMatchStatsModeForTest(mode)
{
    MATCH_STATS_MODE = mode;
}

const packetlog = require('../../packetlog.js');

// docs/design/p3-step1-writeback.md §6 (high-tier review point 4): PvE map
// ids run 9001+, grouped in 3s per difficulty tier -- [SRC] ZPanel_PVE.uc:328
// computes the map GROUP as (MapIndex-9001)/3, so the difficulty WITHIN a
// group is (MapIndex-9001)%3 (0 low/1 mid/2 high). Re-cited from the design
// doc rather than re-derived; also confirmed to apply to the 9007-9009
// escort maps (docs/journal/2026-09-20-0110-escort-smoke.md).
function difficultyFromMapId(mapId)
{
    const id = Number(mapId) || 0;
    return ((id - 9001) % 3 + 3) % 3;
}

// docs/design/p3-step1-writeback.md §6 review point 2 ("缺「沒打完的場」"):
// single constant for the "aborted matches are not persisted" policy, so
// the eventual DB-writeback step has exactly one place to read this from.
// 🟡 the operator has not confirmed this policy yet (design doc explicitly
// flags it as an open decision, "這要操作者決定"). This module never writes
// to a DB itself (memory + log only), so this constant currently has no
// runtime effect; it exists so that decision is recorded in one place
// instead of being re-guessed by whichever step adds the DB write.
const ABORTED_MATCHES_ARE_NOT_PERSISTED = true;

/**
 * Starts a fresh room.matchStats. Call on an *accepted* Room Game Start CQ
 * (0x00222103) -- gate.game.dispatch.js already host-gates and resets
 * room.pveRoundsCleared_ at that same point; this is called from the same
 * guarded block. A rematch in the same room (a second accepted 0x00222103)
 * discards whatever the previous matchStats had -- same "reset on restart"
 * precedent as pveRoundsCleared_ itself.
 *
 * No-op (room.matchStats left untouched) when the switch is off.
 *
 * @param {import('../../rooms.js').Room} room
 * @param {{hostAccountId: number, mapId: number, roundTarget: number}} info
 */
function startMatch(room, { hostAccountId, mapId, roundTarget })
{
    if (!isMatchStatsEnabled() || !room) return;
    room.matchStats = {
        hostAccountId,
        mapId,
        roundTarget,
        startedAt: Date.now(),
        rounds: [],
        currentRound: null,
        participants: new Map(), // accountId -> { kills, deaths }
        finalized: false,
    };
}

function participantStats(matchStats, accountId)
{
    let st = matchStats.participants.get(accountId);
    if (!st) {
        st = { kills: 0, deaths: 0 };
        matchStats.participants.set(accountId, st);
    }
    return st;
}

/**
 * Starts timing a round. Call on an *accepted* BeginRound_CN 0x00230151 --
 * lobby.dispatch.js's own handler already host+dedup-gates that opcode and
 * resets room.battleStats at the same point; this is called from that same
 * guarded block, right after the room.battleStats reset (a separate
 * structure, own lifetime -- this does not touch or replace it).
 *
 * No-op if matchStats was never started (e.g. this room's 0x00222103 never
 * ran while the switch was on) -- there is nothing to attach a round to.
 *
 * @param {import('../../rooms.js').Room} room
 */
function beginRound(room)
{
    if (!isMatchStatsEnabled() || !room || !room.matchStats) return;
    const roundNumber = room.matchStats.rounds.length + 1;
    room.matchStats.currentRound = {
        number: roundNumber,
        startedAt: Date.now(),
        deathCnCount: 0,
    };
}

/**
 * Records one accepted Death_CN 0x00230123 into the current round's
 * death_cn_count and attributes kills/deaths to room members.
 *
 * attackerIndex/victimIndex are Death_CN body+0x00/+0x02 (u16) -- confirmed
 * to be accountId, not a separate 1..N room-local index: rooms.js's own
 * header comment ("user index: ... this module always uses accountId ...
 * not a separate 1..N room-local index"), the same convention cited for
 * Kickout_CQ's UserIndex field at dispatch/gate.game.dispatch.js:2235, and
 * lobby.dispatch.js's own Death_CN handler already keys room.battleStats
 * directly by these two indexes with no translation. Index 0 is AI (not a
 * room member) per lobby.dispatch.js's Death_CN comment ("all AI are index
 * 0 in Death_CN, merged in battleStats_[0] ... harmless") -- skipped here
 * the same way.
 *
 * No-op if matchStats was never started for this room.
 *
 * @param {import('../../rooms.js').Room} room
 * @param {number} attackerIndex
 * @param {number} victimIndex
 */
function recordDeathCn(room, attackerIndex, victimIndex)
{
    if (!isMatchStatsEnabled() || !room || !room.matchStats) return;
    if (room.matchStats.currentRound)
        room.matchStats.currentRound.deathCnCount++;
    if (attackerIndex && attackerIndex !== victimIndex)
        participantStats(room.matchStats, attackerIndex).kills++;
    if (victimIndex)
        participantStats(room.matchStats, victimIndex).deaths++;
}

/**
 * Finalizes room.matchStats.currentRound into the rounds[] array (duration
 * = now - that round's startedAt). Called both from Campaign_CN's R-ROUND
 * round-end branch (lobby.dispatch.js, right before it sends EndRound_SN)
 * and from emitMatchSummary below (which finalizes whatever round was
 * still open, including the case where PVE_ROUND_ADVANCE_MODE is disabled
 * and the whole match is a single implicit round).
 *
 * No-op if there is no round in progress (already closed, switch off, or
 * matchStats/room missing).
 *
 * @param {import('../../rooms.js').Room} room
 */
function closeRound(room)
{
    if (!isMatchStatsEnabled() || !room || !room.matchStats || !room.matchStats.currentRound) return;
    const cur = room.matchStats.currentRound;
    room.matchStats.rounds.push({
        round_number: cur.number,
        started_at: cur.startedAt,
        duration_seconds: Math.max(0, (Date.now() - cur.startedAt) / 1000),
        death_cn_count: cur.deathCnCount,
    });
    room.matchStats.currentRound = null;
}

/**
 * Emits one MATCH-SUMMARY marker (packetlog.marker, src='auto' -- same
 * channel R-ROUND's own markers use) and marks matchStats finalized, so a
 * leave/disconnect shortly after EndGame_SN does not also emit
 * MATCH-ABORTED for the same match (see emitMatchAborted's own finalized
 * check). No-op (and does not touch `finalized`) if matchStats was never
 * started or was already finalized.
 *
 * @param {import('../../rooms.js').Room} room
 * @param {{result: number}} opts - result: 1 win (Campaign_CN action==1), 2
 *   fail (action==2) -- passed straight through from the caller, this
 *   module does not interpret it further.
 */
function emitMatchSummary(room, { result })
{
    if (!isMatchStatsEnabled() || !room || !room.matchStats || room.matchStats.finalized) return;
    closeRound(room); // finalize whatever round was still open
    const ms = room.matchStats;
    ms.finalized = true;

    const participants = [];
    for (const member of (room.members ? room.members.values() : [])) {
        const st = ms.participants.get(member.accountId) || { kills: 0, deaths: 0 };
        // is_test: design doc §5 step 3 proposes an `isTest` field on
        // config/allowed-users.json entries, read at login into a
        // connection-local flag. That wiring touches config/, which is out
        // of this task's scope -- read defensively (a flag nothing
        // currently sets, so this is always false today) so the eventual
        // wiring has exactly one place to look, per the contract's "read
        // it defensively, default false" instruction.
        const isTest = !!(member.client && member.client.isTestAccount_);
        participants.push({
            account_id: member.accountId,
            kills: st.kills,
            deaths: st.deaths,
            is_test: isTest,
        });
    }
    const isTest = participants.some((p) => p.is_test);

    const summary = {
        room_id: room.id,
        map_id: ms.mapId,
        difficulty: difficultyFromMapId(ms.mapId),
        round_target: ms.roundTarget,
        rounds: ms.rounds,
        participants,
        result,
        is_test: isTest,
        host_account_id: ms.hostAccountId,
    };
    packetlog.marker(`MATCH-SUMMARY ${JSON.stringify(summary)}`, 'auto');
}

/**
 * Emits one MATCH-ABORTED marker for a match that never reached EndGame_SN
 * (docs/design/p3-step1-writeback.md §6 review point 2: host leaves / room
 * empties). No summary is built -- see ABORTED_MATCHES_ARE_NOT_PERSISTED.
 * No-op if matchStats was never started or was already finalized (a real
 * EndGame_SN already went out, or this match was already marked aborted).
 *
 * @param {import('../../rooms.js').Room} room
 * @param {string} reason - free-text, for the log line only
 */
function emitMatchAborted(room, reason)
{
    if (!isMatchStatsEnabled() || !room || !room.matchStats || room.matchStats.finalized) return;
    const ms = room.matchStats;
    ms.finalized = true;
    packetlog.marker(`MATCH-ABORTED ${JSON.stringify({
        room_id: room.id,
        map_id: ms.mapId,
        host_account_id: ms.hostAccountId,
        rounds_completed: ms.rounds.length,
        reason,
    })}`, 'auto');
}

module.exports = {
    isMatchStatsEnabled,
    _setMatchStatsModeForTest,
    startMatch,
    beginRound,
    recordDeathCn,
    closeRound,
    emitMatchSummary,
    emitMatchAborted,
    difficultyFromMapId,
    ABORTED_MATCHES_ARE_NOT_PERSISTED,
};
