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
// P3 step 3 (docs/design/p3-step1-writeback.md, MATCH_WRITEBACK_MODE):
// only ever touched from scheduleMatchWriteback() below, and only when
// that switch is enabled -- required unconditionally at module load (same
// precedent as every other dispatch/*.js file that requires database/db.js
// at the top) rather than lazily inside the writeback function, so
// test/match-stats.js's existing installFakeModule(DB_PATH, ...) swap
// (done before any dispatch module is required) is guaranteed to already
// be in place by the time this module's own require() runs.
const db = require('../../database/db');

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
// Operator decided 2026-09-20 (relayed by PM): aborted matches are NOT
// recorded, failed matches (EndGame with result=2) are. This module never writes
// to a DB itself (memory + log only), so this constant currently has no
// runtime effect; it exists so that decision is recorded in one place
// instead of being re-guessed by whichever step adds the DB write.
const ABORTED_MATCHES_ARE_NOT_PERSISTED = true;

// P3 step 3 (docs/design/p3-step1-writeback.md §2.3, high-tier review point
// 7 step 3): gates the actual DB write. Independent of MATCH_STATS_MODE on
// purpose -- MATCH_STATS_MODE alone (step 2) must stay memory+log only
// forever if this switch is never turned on, so a deployment can run step 2
// (round timing, MATCH-SUMMARY markers) without ever touching the DB.
// isMatchWritebackEnabled() is only ever consulted from emitMatchSummary()
// below, and only after isMatchStatsEnabled() has already been checked
// there -- so in practice this can only have an effect while
// MATCH_STATS_MODE is also 'enabled' (there is no room.matchStats to write
// back otherwise).
let MATCH_WRITEBACK_MODE = 'disabled'; // 'disabled' | 'enabled'

function isMatchWritebackEnabled()
{
    return MATCH_WRITEBACK_MODE === 'enabled';
}

// Test-only hook, same pattern as _setMatchStatsModeForTest above.
function _setMatchWritebackModeForTest(mode)
{
    MATCH_WRITEBACK_MODE = mode;
}

// P3 step 3 (docs/design/p3-step1-writeback.md §2.2 point 3, journal/
// 2026-09-17-21-battle-score-totals.md): the same per-kill exp/point
// placeholder Death_SN's builder has used since S1 -- moved here (lobby.
// dispatch.js's Death_CN handler now reads matchStats.EXP_PER_KILL/
// POINT_PER_KILL instead of declaring its own copy) so there is exactly one
// place this number lives, instead of two copies that could silently drift
// apart. Still an unconfirmed placeholder, not a verified original-game
// value (docs/design/p3-step1-writeback.md §4 "沒找到台版數字").
const EXP_PER_KILL = 10;
const POINT_PER_KILL = 10;

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
    // P3 step 3 (docs/design/p3-step3-writeback-impl.md): DB-only payload,
    // built in the same loop but deliberately kept out of `participants`/
    // `summary` above -- that JSON shape is the MATCH-SUMMARY marker's log
    // format, already relied on by test/match-stats.js and any log tooling
    // that greps it. Team/mech/economy fields are new to this step and are
    // only ever read by scheduleMatchWriteback() below.
    const participantsForDb = [];
    for (const member of (room.members ? room.members.values() : [])) {
        const st = ms.participants.get(member.accountId) || { kills: 0, deaths: 0 };
        // is_test: ISTEST-WIRE (docs/backlog.md; design doc §5 step 3) --
        // config/allowed-users.json entries may carry an `isTest` field,
        // read into client.isTestAccount_ at login
        // (account.dispatch.js's CQ_LOGIN_WASABII and
        // gamelogin.dispatch.js's Login_Again_CQ, both via
        // config/whitelist.js's isTestAccount()). Still read defensively
        // (`member.client &&`) since not every member.client is guaranteed
        // to have gone through either of those handlers in every test/edge
        // case.
        const isTest = !!(member.client && member.client.isTestAccount_);
        participants.push({
            account_id: member.accountId,
            kills: st.kills,
            deaths: st.deaths,
            is_test: isTest,
        });
        // mechType: client.currentHangarSlot_ (1..8), the same field
        // gate.game.dispatch.js already reads as "selectedMech" -- undefined
        // (not 0/1-guessed) when the client never went through a handler
        // that sets it, so applyMatchAccumulation() knows to skip the
        // mech_levels update rather than crediting the wrong mech.
        const mechType = member.client && Number(member.client.currentHangarSlot_) > 0
            ? Number(member.client.currentHangarSlot_)
            : undefined;
        // result: PvE is co-op, so every participant shares the room's
        // result (win/fail) -- there is no opposing-team concept yet for
        // "result" to disagree with `result` on a per-participant basis.
        const participantResult = result === 1 ? 1 : (result === 2 ? 2 : 0);
        participantsForDb.push({
            accountId: member.accountId,
            team: member.team || 0,
            kills: st.kills,
            deaths: st.deaths,
            expGained: st.kills * EXP_PER_KILL,
            pointGained: st.kills * POINT_PER_KILL,
            result: participantResult,
            mechType,
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

    // P3 step 3 (docs/design/p3-step1-writeback.md, MATCH_WRITEBACK_MODE):
    // fire-and-forget, never awaited here -- see scheduleMatchWriteback's
    // own header comment for why this cannot block or throw into the
    // dispatch path that called emitMatchSummary(). No-op unless
    // MATCH_WRITEBACK_MODE is enabled; ABORTED_MATCHES_ARE_NOT_PERSISTED
    // is upheld simply by this call only existing in emitMatchSummary(),
    // never in emitMatchAborted() below.
    if (isMatchWritebackEnabled())
        scheduleMatchWriteback(room, ms, result, participantsForDb, isTest);
}

/**
 * P3 step 3 (docs/design/p3-step1-writeback.md, docs/design/
 * p3-step3-writeback-impl.md): persists one finished match to the DB.
 * Fire-and-forget -- returns immediately (does not return a Promise the
 * caller could accidentally await), so it can never block the EndGame_SN
 * packet path emitMatchSummary() is called from. Its own async IIFE catches
 * everything: a DB failure only logs (console.error + a
 * MATCH-WRITEBACK-FAILED marker), it never throws back into
 * emitMatchSummary()/dispatch() because there is no synchronous call for it
 * to throw into.
 *
 * Only ever called from emitMatchSummary() above, so a match reaches this
 * function if and only if it reached EndGame_SN (ABORTED_MATCHES_ARE_NOT_PERSISTED).
 *
 * @param {import('../../rooms.js').Room} room
 * @param {object} ms - room.matchStats, already finalized by the caller
 * @param {number} result - Campaign_CN action byte, 1 win / 2 fail
 * @param {Array<object>} participantsForDb - see emitMatchSummary's own loop
 * @param {boolean} isTest
 */
function scheduleMatchWriteback(room, ms, result, participantsForDb, isTest)
{
    const matchPayload = {
        roomId: room.id,
        mapId: ms.mapId,
        difficulty: difficultyFromMapId(ms.mapId),
        roundTarget: ms.roundTarget,
        hostAccountId: ms.hostAccountId,
        startedAtMs: ms.startedAt,
        endedAtMs: Date.now(),
        result,
        // win_team_rank: not yet threaded through from lobby.dispatch.js's
        // pveFixedRank -- see docs/design/p3-step3-writeback-impl.md open
        // questions. Always 0 (schema default) for now.
        winTeamRank: 0,
        isTest,
        // suspicious: P7's threshold is not implemented yet (docs/backlog.md
        // AUTO section "先留欄位") -- always false from this step.
        suspicious: false,
    };
    const roundsPayload = ms.rounds.map((r) => ({
        roundNumber: r.round_number,
        startedAtMs: r.started_at,
        durationSeconds: r.duration_seconds,
        deathCnCount: r.death_cn_count,
        suspicious: false,
    }));

    (async () => {
        try {
            const matchId = await db.recordMatch(matchPayload, roundsPayload, participantsForDb);
            for (const participant of participantsForDb) {
                await db.applyMatchAccumulation(participant.accountId, {
                    exp: participant.expGained,
                    wins: participant.result === 1 ? 1 : 0,
                    losses: participant.result === 2 ? 1 : 0,
                    kills: participant.kills,
                    deaths: participant.deaths,
                    mechType: participant.mechType,
                    mechExp: participant.expGained,
                    mechKills: participant.kills,
                    mechDeaths: participant.deaths,
                    mechSorties: 1,
                });
            }
            packetlog.marker(`MATCH-WRITEBACK-OK matchId=${matchId} room=${room.id}`, 'auto');
        } catch (err) {
            console.error(`[match-stats] MATCH_WRITEBACK_MODE: failed to persist room #${room.id}'s match: ${err.message}`);
            packetlog.marker(`MATCH-WRITEBACK-FAILED room=${room.id} error=${err.message}`, 'auto');
        }
    })();
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
    isMatchWritebackEnabled,
    _setMatchWritebackModeForTest,
    startMatch,
    beginRound,
    recordDeathCn,
    closeRound,
    emitMatchSummary,
    emitMatchAborted,
    difficultyFromMapId,
    ABORTED_MATCHES_ARE_NOT_PERSISTED,
    EXP_PER_KILL,
    POINT_PER_KILL,
};
