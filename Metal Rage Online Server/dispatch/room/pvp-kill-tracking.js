'use strict';

// T2 (docs/design/d2-pvp-tdm.md §7 step T2, §7.1): room-level TEAM kill
// tracking for PvP TDM, built from the accepted Death_CN 0x00230123 that
// dispatch/lobby.dispatch.js's own handler already parses. Memory + log
// only -- no packets are sent or changed from here, no DB writes. This is
// separate from dispatch/room/match-stats.js's MATCH_STATS_MODE (PvE
// per-player kills/deaths for the DB writeback pipeline): different switch,
// different room field, different lifetime -- do not merge them.
//
// Attribution rule follows the client source, NOT the old (wrong) v2 draft
// that said "same-team kills never score":
//   ZGame/ZTeamDM.uc:934-957 (team score, the three branches after
//     Super.ScoreKill), ZGame/ZDeathMatch.uc:267-287 (personal score, only
//     excludes killer==Other||killer==None -- does not look at team at all).
// See the design doc §7.1 table -- this module only implements the TEAM
// column (个人分 already accumulates unconditionally in lobby.dispatch.js's
// existing battleStats/matchStats bookkeeping and is not touched here):
//   敵隊擊殺           -> 擊殺者那隊 +1
//   自殺／無擊殺者      -> 對面那隊 +1 (Teams[(victim隊+1)%2])
//   同隊誤殺（≠victim） -> 兩隊都不動
//
// Switch: PVP_KILL_TRACKING_MODE, default 'disabled' -- same pattern as
// match-stats.js's MATCH_STATS_MODE ('let' + isEnabled() + _setModeForTest()).
// Disabled: recordDeathCn() below is a complete no-op -- no room.pvpTeamKills
// is ever created, no log line, nothing sent (this module never sends
// packets at all, so the switch cannot affect wire bytes either way).
let PVP_KILL_TRACKING_MODE = 'disabled'; // 'disabled' | 'enabled'

function isPvpKillTrackingEnabled()
{
    return PVP_KILL_TRACKING_MODE === 'enabled';
}

// Test-only hook (same pattern as match-stats.js's _setMatchStatsModeForTest).
// Not called anywhere outside test/.
function _setPvpKillTrackingModeForTest(mode)
{
    PVP_KILL_TRACKING_MODE = mode;
}

// T2 task contract note (2026-09-23): the eventual single source of truth
// for a member's team is meant to be room.members.get(accountId).team, but
// as of this module every addMember() call site in
// dispatch/gate.game.dispatch.js still hardcodes `team: 0` for every member
// (see rooms.js's addMember doc comment / call sites) -- that field is not
// wired to T1's actual join-order assignment yet, so reading it here would
// silently score every kill as "team 0 vs team 0" instead of reflecting
// real PvP teams. Until that lands, this module resolves team purely via
// gate.game.dispatch.js's resolvePvpTeamIndex() (T1's own join-order 0/1
// assignment, cached per room.battleStartGen) -- the same function
// Game_User_SN's TeamIndex is already built from, so a member's tracked
// team here always matches what T1 sent the client. Whoever lands
// member.team as the real source of truth should switch this module to
// read it first and only fall back to resolvePvpTeamIndex() when unset.
const { resolvePvpTeamIndex } = require('../gate.game.dispatch.js');

/**
 * Records one accepted Death_CN 0x00230123 into room.pvpTeamKills (a plain
 * [redKills, blueKills] array, index 0/1 matching Game_Info_SN's own
 * red=0/blue=1 convention). No-op when the switch is off, when there is no
 * tracked room, or when either index cannot be resolved to a current room
 * member (WARN, no score change -- never guesses).
 *
 * attackerIndex 0 is never a real accountId (accounts.id is an
 * AUTO_INCREMENT PRIMARY KEY starting at 1, metalrageserver.sql:24-25 --
 * same precedent already relied on by match-stats.js's own Death_CN comment
 * "Index 0 is AI (not a room member)" and lobby.dispatch.js's Assist_CN
 * comment "index 0 never hits a real row"), so 0 is unambiguous here: it
 * always means "no killer" (environmental death / AI kill), never "the
 * player whose UserIndex happens to be 0".
 *
 * @param {import('../../rooms.js').Room} room
 * @param {number} attackerIndex - Death_CN body+0x00 (u16)
 * @param {number} victimIndex - Death_CN body+0x02 (u16)
 */
function recordDeathCn(room, attackerIndex, victimIndex)
{
    if (!isPvpKillTrackingEnabled() || !room) return;

    const hasAttacker = attackerIndex !== 0;
    const attackerMember = hasAttacker && room.members ? room.members.get(attackerIndex) : undefined;
    const victimMember = room.members ? room.members.get(victimIndex) : undefined;

    if (hasAttacker && !attackerMember) {
        console.warn(`[pvp-kill-tracking] Death_CN attacker=${attackerIndex} is not a room #${room.id} member -- WARN, no score change`);
        return;
    }
    if (!victimMember) {
        console.warn(`[pvp-kill-tracking] Death_CN victim=${victimIndex} is not a room #${room.id} member -- WARN, no score change`);
        return;
    }

    if (!room.pvpTeamKills)
        room.pvpTeamKills = [0, 0];

    const victimTeam = resolvePvpTeamIndex(room, victimIndex);
    const attackerTeam = hasAttacker ? resolvePvpTeamIndex(room, attackerIndex) : -1;

    let situation;
    let scoredTeam = -1;
    if (!hasAttacker) {
        situation = 'no-attacker';
        scoredTeam = (victimTeam + 1) % 2;
    } else if (attackerIndex === victimIndex) {
        situation = 'suicide';
        scoredTeam = (victimTeam + 1) % 2;
    } else if (attackerTeam === victimTeam) {
        situation = 'team-kill';
        // Both teams unchanged (design doc §7.1).
    } else {
        situation = 'enemy-kill';
        scoredTeam = attackerTeam;
    }

    if (scoredTeam === 0 || scoredTeam === 1)
        room.pvpTeamKills[scoredTeam]++;

    console.log(
        `[pvp-kill-tracking] Death_CN attacker=${attackerIndex}(team=${hasAttacker ? attackerTeam : '-'}) ` +
        `victim=${victimIndex}(team=${victimTeam}) case=${situation} -> ` +
        `${scoredTeam === -1 ? 'no team scored' : `team ${scoredTeam} +1`} | ` +
        `totals red=${room.pvpTeamKills[0]} blue=${room.pvpTeamKills[1]}`
    );
}

module.exports = {
    isPvpKillTrackingEnabled,
    _setPvpKillTrackingModeForTest,
    recordDeathCn,
};
