# Objective-mode protocol (ZDispatchGame, 0x2301xx / 0x2222xx)

2026-09-12 .. 2026-09-21. Recovered from the shipped `MetalRage/Data/System/ZNetwork.dll`
(disassembled with pefile + capstone) and the decrypted UnrealScript packages (`ZBase.u`, `ZGame.u`,
`ZModeBlow.u`, `ZModeCapture.u`, `ZModeOccupation.u`, `ZModeSuddenDeath.u`, ...).

Conventions:
- **confirmed** = read from disassembly / original source, or observed live
- **live-confirmed** = verified with two real clients
- **guess / unconfirmed** = only where it says so
- **our rule** = the retail server's formula is gone, so this server chose the value

All offsets are **body-relative** (after the 16-byte header). Handler addresses assume ImageBase 0x10700000.

---

## 1. Who sends what

- Matches are P2P: the room master's client is a listen server (host); everyone else joins it as NM_Client.
- **Every in-game CN arrives on the HOST's socket.** A joiner's actions are relayed by the host's ZNetwork,
  identified by the UserIndex inside the body. The joiner's own server connection carries only keep-alives
  while in a match.
- So **SN replies go to the host connection only.** The joiner's `UZNetwork_DJ` never sees score SNs,
  which needs a separate joiner sync (section 7).
- Every objective CN builder is gated by `Game_Host_Check` / `Game_Play_Check`: **host only, match running only.**

## 2. Opcode table and how it was recovered (confirmed)

| mode | CN | SN | SN body | SN handler |
|---|---|---|---|---|
| Special | 0x230125 | 0x230126 | 0x1D | 0x107d6300 |
| Capture | 0x230131 | 0x230132 | 0x3B | 0x107d6490 |
| Conquest (Occupation) | 0x230133 | 0x230134 | 0x39 | 0x107d6ab0 |
| Bomb (Blow) | 0x230135 | 0x230136 | 0x3A | 0x107d67a0 |
| Boss | 0x230137 | 0x230138 | 0x29 | 0x107d6d90 |
| Campaign | 0x230139 | 0x23013A | 0x29 | 0x107d7040 |
| TwoBoss | 0x23013B | 0x23013C | 0x29 | 0x107d7290 |
| TriggerTouch | 0x23013D | 0x23013E | 0x39 | 0x107d7540 |

**SN = CN + 1 for every pair.** Two independent scans agree:
1. Sweep the executable sections for `C7 05 <addr32> <imm32>` (`mov dword ptr [disp32], imm32`) with
   imm32 in 0x220000..0x240000. ZDispatchGame's init block stamps one packet buffer per CN opcode,
   which yields the full CN list.
2. The dispatch jump table at **0x107dbf48** (`sub edx, 0x230132` / `cmp edx, 0xc` /
   `jmp [edx*4+table]`) yields the SN side, and matches the already-known Bomb_SN 0x230136,
   Boss_SN 0x230138, Campaign_SN 0x23013A and TwoBoss_SN 0x23013C.
- Special_SN 0x230126 alone comes from the top of `ZDispatchGame::Dispatch`
  (`cmp edx, 0x230126 / je 0x107dbdbe`), not the table.

## 3. Shared structures

### 3.1 SN header
```
body+0x00 u16 status   non-zero -> FAILED path
body+0x02 u32 result   non-zero -> FAILED path
```

### 3.2 The 14-byte score record -> `Game_Score_Set` (confirmed)
Cross-checked in the EndRound_SN handler (0x107D7A50) and the Conquest_SN handler (0x107D6AB0):
```
+0x00 u16 team      (ClientRedIndex 1 / ClientBlueIndex 2)
+0x02 u16 score
+0x04 u8  round
+0x05 u8  alive
+0x06 u16 try
+0x08 u16 goal
+0x0A u32 exp
```
We had the field order right but wrote round@6 / alive@7 / goal@0x0A until 2026-09-13, so **every score
record sent before that was garbage.**

The HUD's RED/BLUE numbers are `GAME_INFO.RedScore/BlueScore`, filled only by `Game_Score_Set` +
`Game_Score_Update`. `Game_Score_Update` (0x1072d1b0) does `RedScore = Game_Score_Get(ClientRedIndex)`, and
**`Game_Score_Get` (0x1072d120) returns the entry's GOAL (+0x18), not SCORE, when `MapInfo.Mode`
(GAME_INFO+0xfcc) is 2 or 3 (Occupation)**. That is why the goal field matters in 4.3.

### 3.3 Mission fields -> `Game_User_Mission_Set(user, total, point)` (confirmed 2026-09-21)
The two trailing u32s of the SN. Function body (0x1072d970):
```
ScoreMission = (Mode == 9 ? total*5 : total) - ScoreAssist - ScoreBattle
Exp   = total
Point = point
```
Same **running-total** convention as the Death_SN battle record (`Game_User_Battle_Set`): send the
player's whole contribution, not the increment. The scoreboard / result-page contribution column is
ScoreBattle + ScoreAssist + ScoreMission.

| SN | mission fields |
|---|---|
| Special | +0x15 / +0x19 |
| Capture | +0x33 / +0x37 |
| Conquest, TriggerTouch | +0x31 / +0x35 |
| Bomb | +0x32 / +0x36 |

### 3.4 A 6-byte generic ack is a crash
A catch-all "reply `type+1` with a 6-byte status/result body" looks harmless, but the handler takes its
success path and then reads score records and mission fields past the end of the packet. Death_SN,
Campaign_SN, Bomb_SN (planting detached both players' cameras), Timeout_SN and Assist_SN all had this bug.
**A generic ack is correct only when the real SN body is 6 bytes.**

## 4. Per-packet detail

### 4.1 Bomb (Blow) — live-confirmed
CN 0x230135 (builder 0x107da520), 4-byte body:
```
+0x00 u16 UserIndex
+0x02 u8  TargetIndex   bomb site (site A seen as 0)
+0x03 u8  Action        1 = plant, 2 = explode (fuse expired, UserIndex 0), 3 = defuse
```
SN 0x230136, 0x3A (handler 0x107d67a0, log string `"Result : 0x%08X, TargetIndex : %d, UserIndex : %d, Action : %d"`):
```
+0x0A u16 UserIndex   +0x0C u8 TargetIndex   +0x0D u8 Action (2/3 also call Game_Info_Area_Set)
+0x0E record A        +0x1C record B         +0x32 / +0x36 mission fields
```
All three action values live-confirmed (solo and two clients, map 6031).

### 4.2 Capture — live-confirmed for actions 1 and 3
CN 0x230131 (builder 0x107DA250), 5-byte body:
```
+0x00 u16 UserIndex
+0x02 u8  TargetType     1 or 2
+0x03 u8  TargetOrdinal
+0x04 u8  Action
```
The builder splits its 3rd argument: `>= 200 -> type 1, ordinal = arg-200`, `< 200 -> type 2,
ordinal = arg-100`. Action argument 1->1, 3->3, anything else->4, and **argument 2 never builds a packet.**
Live: **action 1 = pick up, 3 = return (scores)**. Red players sent type 1, blue players type 2.

SN 0x230132, 0x3B (handler 0x107D6490):
```
+0x0A u16 UserIndex  +0x0C u8 TargetType  +0x0D u8 TargetOrdinal  +0x0E u8 Action
+0x0F record A       +0x1D record B       +0x33 / +0x37 mission fields
```
The handler rebuilds TargetIndex as `type==1 ? ordinal+0xC8 : ordinal+0x64` and calls
`Game_Action_Capture("SUCCESS", UserIndex, TargetIndex, Action)`. We once left +0x0E at 0, which the
handler remaps to 4, so a return arrived as action 4: the message played but nothing scored.

### 4.3 Conquest (Occupation) — layout confirmed, not live-tested
CN 0x230133, 3-byte body `[u16 UserIndex][u8 TargetIndex]` (read off the builder's literals).
SN 0x230134, 0x39: `+0x0A u16 UserIndex, +0x0C u8 TargetIndex, +0x0D / +0x1B records,
+0x31 / +0x35 mission fields`, tail `Game_Info_Area_Set(TargetIndex + 1)`. OccupationMission never
reads AreaIndex.

**The next zone is the red score record's goal** (original source):
- `Game_Mission_Get()` = `m_GameInfo.RedScore`
- `OccupationMission.TeamScoreEvent`: `NextCoreIndex = Game_Mission_Get()` -> activates that zone
- in Occupation, RedScore comes from the **goal field** (3.2)
- `MissionActionSuccess_BD(CONQUEST_ACTION_COMPLETE)` -> `if (Game_Mission_Get() <= CoreCount-1) AddLimitTime_BD()`

So occupation records carry `goal = zones taken`. With goal = 0 (the map's GoalDefault) play stalled on zone A.
Taking the last zone (`CoreCount` = 5, or 3 for MapIndex >= 3000) -> EndGame_SN (red) after 4 s, because
the client's own end check is commented out.

### 4.4 TriggerTouch — layout only
CN 0x23013D `[u16 UserIndex][u8 TargetIndex]`; SN 0x23013E has Conquest's shape (0x39, records
+0x0D/+0x1B, mission +0x31/+0x35, `Game_Info_Area_Set`). **Which mode sends it is unknown.**

### 4.5 Boss / TwoBoss — layout only
CN 0x230137 / 0x23013B, 3-byte body `[u8 1][u8 0][u8 Action]`, Action = 1 if the argument is 1 else 2
(same shape as Campaign_CN). SN 0x29: `+0x0C u8 Action, +0x0D / +0x1B records`, `Game_Info_Area_Set`.
No UserIndex, so nobody can be credited. **Meaning of action 1 / 2 unknown.**

### 4.6 Special — layout only
CN 0x230125 `[u16 UserIndex][u8 code]`, code from an 8-way jump table in the builder.
SN 0x230126, 0x1D: `+0x0A u16 UserIndex, +0x0C u8 Action, +0x15 / +0x19 mission fields`, no score records.
**Meaning of the 8 codes and the sending mode unknown** (Rage is a candidate).

### 4.7 Campaign — live-confirmed
CN 0x230139 `[u8 1][u8 0][u8 action 1|2]`. SN 0x23013A (0x29) is **only a scoreboard update**
(Game_Score_Set x2 + Update). Rounds advance with **EndRound_SN 0x222211**; after the last round,
**EndGame_SN 0x222213** (both 0x1E: `u16 WinTeamIndex` + two score records).

## 5. Round / match decisions — the client does not make them

### 5.1 Why the server decides (original source)
- `SuddenDeathMission.NotifyKilled`: the all-kill check is commented out.
- `ZModeBlow.u`: the `TeamWinSetting(0/1)` calls in `BombStateChange` are commented out, `TeamWinSetting`
  itself is commented out, `NotifyKilled`'s body is commented out, `TeamScoreEvent` is empty.
  `AllKillCheckEnd()` exists but nothing calls it.
- `ZTeamDM.EndRound_BD` carries the comment "called from Network on round end": the retail server
  announced it with EndRound_SN.

### 5.2 All-kill only for Sudden Death and Blow
`MR_PVP_ALLKILL_MODES` defaults to `sd,blow`. It used to run in every mode, which ended a 1v1 Rage or
Blow match on the first kill. Liveness is **spawn-driven** (alive only after ChangeSlot_CN / Respawn_CN),
a round can end only after both teams have spawned, and the "already dead" check dedupes relayed deaths.

### 5.3 Blow rules (team 0 = RED = planters, team 1 = BLUE = defenders)
```
RED wins : bomb explodes | BLUE wiped
BLUE wins: bomb defused  | RED wiped (before or after the plant) | round time runs out
both wiped at once: draw (our rule)
```
Reaching the round goal (Cache.Bin GoalDefault, Blow = 2) sends EndGame_SN, otherwise EndRound_SN.
**A winner that contradicts the client's own mission state crashes it with a GPF**: sending an explosion
as a BLUE win gave `BlowMission.RoundEnd.Timer -> ... -> ZSlotSelectPage ... General protection fault`.
The two runs differed only in the winner byte.

### 5.4 Time-up — Timeout_CN 0x230111 / Timeout_SN 0x230112
- The clock direction is Game_Info_SN body+0x13 (minutes): 0 counts up, a value counts down.
- At 00:00 the host calls `Game_Timeout()` -> Timeout_CN (empty body).
- Timeout_SN (0x26: records at +0x0A / +0x18) **only updates the score and ends nothing**. The server
  picks the winner (our rules):

| mode | on time-up |
|---|---|
| Sudden Death | round: more survivors, equal = draw |
| Blow | round: BLUE (bomb never went off) |
| Occupation | match: BLUE (red failed to take every zone) |
| Capture | match: more captures, equal = draw |
| TDM, Rage | match: more kills / more contribution |
| Boss, other | match: draw |

- Round-based modes get the host timeout **only in round 1** (`GotoState('MatchInProgress')` has one
  caller, `StartMatch`). Rounds 2+ are timed by the server (map time + 10 s + 3 s).

### 5.5 Objective score and contribution (our rules)
- `goal` is real: the map's Cache.Bin GoalDefault (TDM 150, Blow 2, SD 2, Capture 10, Occupation/Boss/Rage 0).
- +1 team score and +10 contribution (`MR_CONTRIB_PER_OBJECTIVE`) per completed objective are our rules.
  Capture only on action 3; Conquest and TriggerTouch on every event; Bomb on plant and defuse.
- Capture reaching its goal does **not** end the match: ending a mode on a guess is what broke Blow and Rage.

## 6. Result page — User_Score_SN 0x222221

A ZDispatchRoom handler, so it is only accepted after EndGame_SN's `Scene_Change(5)` (we send it 500 ms later).
```
+0x00 u16 WinTeamIndex
+0x02 u16 WinTeamRank     1 = F .. 11 = SS
+0x04 u32 WinTeamScore    = TOTAL SCORE
+0x08 record A            +0x16 record B
+0x24 u8  userCount
+0x25 + i*0x3A  per user: +0x00 userIndex, +0x06 exp bonus %, +0x16 exp total, +0x1A point bonus %, +0x2A point total
```
- Team score and TOTAL = **the same mode score EndGame_SN carries**. Contribution goes only into the
  records' exp and the per-user rows. (Our first version put contribution in the team score, and the
  late-arriving packet overwrote a 1:2 result with "9".)
- One packet carries everyone and each client picks its own row, so every member gets the same packet.
- 0x400 limit: `16 + 0x25 + N*0x3A` -> at most 16 players.

## 7. Joiner sync — what is and is not safe to send a joiner

**Do not send Death_SN or the objective SNs themselves to a joiner.** Their handlers end in a GameInfo
script event (e.g. Death_SN `0x107db912 call Game_Action_Death`, EndRound's `Game_End_Round`), and a
joiner has no `Level.Game`. That is the same problem that made EndRound_SN need a BeginRound_SN to restore IsPlay.

Two packets **safe** for a joiner (no script event, confirmed):

| purpose | packet | handler |
|---|---|---|
| team score | Timeout_SN 0x230112 (0x26) | `Game_Score_Set` x2 + `Game_Score_Update` |
| per-player contribution | Assist_SN 0x230122 (0x19) | `Game_User_Assist_Set` x2: `ScoreAssist += a, Exp += a, Point += b` |

- `syncTeamScoreToPeers`: after each objective SN, Bomb_SN and TDM kill (`MR_PEER_SCORE_SYNC=0` disables).
- `syncContribToPeers`: Assist_SN **adds**, so we remember per peer what was already sent and send only
  the delta. The second user slot is 0, which matches no entry (a no-op). `MR_PEER_CONTRIB_SYNC=0` disables.
- Assist_SN layout (0x107d5fa0): `+0x0A u16 AssistUser, +0x0C u16 User, +0x0E type, +0x0F action,
  +0x10 HP, +0x11 u16 / +0x13 s16 -> AssistUser, +0x15 u16 / +0x17 s16 -> User`.

Live-confirmed 2026-09-21 (two clients, Capture): joiner team score red=1 -> blue=1 -> blue=2, result page
1:2 on both, contribution 10 / 20 on both.

**Still open**: the joiner's in-game personal kill / death numbers. We have not found a packet that
calls `Game_User_Battle_Set` without a script event (`Game_Score_SN 0x222114` is an unconfirmed candidate).

## 8. Open items

| item | status |
|---|---|
| Capture action 4 | exists in the builder (anything but 1/3), never observed; drop/reset is a guess |
| Special's 8 codes | meaning and sending mode unknown |
| Boss/TwoBoss action 1/2 | meaning unknown |
| TriggerTouch | sending mode unknown |
| Occupation A -> B progression | static analysis only, not live-tested |
| Occupation rules (+3 min per zone, 2 rounds with a team swap) | not implemented |
| Boss rules (escort / destroy win, half-time swap) | not implemented |
| Rage objectives | which packet Rage uses is unknown; whether to skip W/L/K/D recording is undecided |
| Joiner personal K/D | open |
| Taken (Map_C03) spawn | blue sometimes spawns in red's base; most likely TeamNumber=1 PlayerStarts in both bases plus `RatePlayerStart`'s per-pawn penalty; not server-fixable |

ZModeRage.u, ZModeBot.u and ZModeOccupation.u are already decrypted, so Special, Boss and Rage can be
filled in by reading the scripts.

## 9. Code map

- `dispatch/lobby.dispatch.js`: `OBJECTIVE_SN`, `handleObjectiveCq`, `noteObjectiveScore`,
  `noteObjectiveContribution`, `noteBombAction`, `maybeAdvancePvpRound`, `resolvePvpTimeout`,
  `syncTeamScoreToPeers`, `syncContribToPeers`, `sendPvpUserScoreSn`, `writeScoreRecord`
- Tests: `tools/test-blow-round.js` (10 checks), `tools/test-peer-score.js` (24 checks)
  — `MR_PVP_ROUND_TIMER=0 node tools/test-peer-score.js`
