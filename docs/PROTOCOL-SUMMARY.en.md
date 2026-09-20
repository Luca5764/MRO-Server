# Protocol summary: confirmed findings

Our most-confident protocol facts, for anyone else implementing a server for this client
(Taiwanese *Metal Rage Online*, `ZNetwork.dll`). Backed by DLL disassembly and/or a real client
reacting to a packet — see `docs/state.md` and the linked journals for full evidence. Addresses
are `ZNetwork.dll` file offsets (ImageBase `0x10700000`, RVA == file offset). Anything not
listed here should be treated as unknown, not assumed.

Confidence: every item below has either DLL evidence or a live client test (usually both). Most have not yet been reviewed by a second team, so treat them as "we tested this and it works for us", not as a specification. Corrections are welcome — one of the entries below exists because an outside reader caught a mislabelled address.

## Wire format

- **Header is big-endian, body is little-endian.** Fixed 16-byte header: `u32 BE` CRC32,
  `u16 BE` sequence, `u16 BE` total length, 6 bytes pad, `u32 BE` opcode; body fields are almost
  always LE. Easiest thing to get backwards. (`docs/reference/protocol.md`)
- **Frames over 0x400 bytes (incl. header) are silently rejected, and the connection stalls
  forever after that** — no disconnect, no error, it just stops acking. Paginate any list packet
  under this limit. (`ZNetwork.dll 0x107f8fad`; `journal/2026-09-17-01-review-iteminfo-stall-root-cause.md`)
- **Dispatch is first-match-wins** (server services checked in order, first `true` return
  consumes the packet), **and each client dispatcher only fires in its own scene**
  (`ZDispatchGame` = scene 6 only) — wrong scene means silent drop, no error.
  (`docs/reference/protocol.md`; `journal/2026-09-16-13-battle-start-is-scene-driven.md`)
- **String encoding is per-packet — always check the DLL, never assume.** `Room_Name_SN
  0x0022021A` and `User_Name_SN 0x00220421` (body+0x1B) are ANSI (client calls `winToUNICODE`);
  UTF-16LE there only shows the first character. `User_Default_SN 0x00220233` and `Game_User_SN
  0x00222112` are ASCII. Wrong guess = garbled/truncated text, not a crash.
  (`ZNetwork.dll 0x107ea7d0`, `0x107eb0ce`; `journal/2026-09-18-09`, `-17-user-name-ansi.md`)

## Room, join, login

- **Login identity is an opaque token, not source IP or "most recent login."** 9211
  `Gate::Leave_SA 0x00220132` body+0x06/+0x0A (two u32) get stored by `Certify_Away_Set`
  (`0x10715f70`, sole caller `0x107dc846` in `Leave_SA` `0x107dc7d3`) and echoed verbatim in
  `Login_Again_CQ 0x00110124` body+0x00/+0x04 on 30907, including after a map-change reconnect.
  Put a real per-login random value there instead of 0; IP is useless behind NAT. Get this wrong
  and concurrent logins can swap accounts. (`ZNetwork.dll 0x107dc7d3`–`0x107dc846`, `0x10715f70`;
  `journal/2026-09-18-2350-game-login-token-chain.md`)
- **`Enter_SA 0x00220232`** (thunk `0x107e5e61` → body `0x107e4080`) **is the only path into the
  room scene from a fresh login, and carries no room data** — just a 6-byte status header (0/0 =
  success). Real room content must follow as separate SN broadcasts. We found no client-sent
  "give me the room list" opcode, so we push a full `Room_List_SN 0x00220204` on lobby entry and
  again after `Leave_CQ 0x00220234`; without that the lobby just stays empty.
  (`ZNetwork.dll 0x107e4080`; `research/2026-09-18-d1-room-formats/enter-sa.md`)
- **`Room_Boundary_SN 0x00220213`: body+0x00 = CurrentUser, body+0x01 = MaxUser** — the client
  then halves MaxUser itself (`ZPage_Room.uc:768`). Swap the fields and every slot past the
  first draws closed (no avatar/level/READY) even for players who really are in the room.
  (`ZNetwork.dll 0x107ea95d`/`0x107ea964`; `journal/2026-09-19-0330-d1-step4-room-join.md`)

## Battle start and in-match

- **`Game_User_SN 0x00222112` is an upsert by UserIndex, not a replace** — safe to send one
  packet per player instead of one combined packet (which can blow the 0x400 limit at 3+
  players). The array it upserts into is built by `Game_User_Add` (thunk `0x10703850` → body
  `0x10734140`, +0x1034, stride 0x80) — **not** `0x107343e0`, which is `Game_Item_Add` (thunk
  `0x107029ff`, +0x1040, stride 0xEC); several of our own docs had these swapped until an
  upstream reviewer (Moon) caught it. (`ZNetwork.dll 0x10703850`, `0x107029ff`;
  `research/2026-09-20-moon-verify/notes.md`)
- **`Grade_Info_SN 0x00510101` must be 0 for a normal player.** Handler `0x107cf3b0` jumps
  through a table at `0x107cf45c` that only remaps values 11–14 (GM tiers) and stores the result
  in `this+0x448` via `0x10729b00`. Any GM value forces `Spectating` state — no HUD, no F1–F5
  bar, no Tab scoreboard row. (`ZNetwork.dll 0x107cf3b0`/`0x107cf45c`/`0x10729b00`;
  `journal/2026-09-17-11-grade-info-sn-root-cause.md`)
- **`Respawn_SN 0x00230104` must echo the UserIndex from the `Respawn_CN 0x00230103` body**
  (confirmed field: body+0x0A), not the sending connection's own index. In multiplayer the host
  sends `Respawn_CN` on behalf of a joining player; using "whoever sent this" instead spawns the
  joiner into pure spectator mode. (`journal/2026-09-19-0330-d1-step4-room-join.md`, "RESPAWN-IDX")
- **`Ready_Host_SN 0x00420115` must carry the bare host IP only — the client builds the join URL
  itself** as `<ip> + ":" + port + "/" + <its own map name>`, and truncates the IP field to 15
  characters. Sending an `"IP/MapName"` string (works by luck on localhost) gets cut mid-string
  on a real two-machine join and `LoadMap` fails. (client `MetalRage.log` trace;
  `journal/2026-09-19-0330-d1-step4-room-join.md`, "RHSN-IP")

## PvE round/result flow

- **`EndRound_SN 0x00222211` on every round but the last, `EndGame_SN 0x00222213` only on the
  last**, both in reply to `Campaign_CN 0x00230139` (success). `EndGame_SN` body is 0x1E bytes:
  WinTeamIndex@0x00, Team A record@0x02, Team B record@0x10, each record
  `u16,u16,u8,u8,u16,u16,u32`. Reversed logic either ends the match after round 1 or hangs the
  client after the real last round. (`ZNetwork.dll` handlers field-checked in
  `research/2026-09-20-moon-verify/notes.md`; `journal/2026-09-19-0900-r-round-impl.md`)
- **`User_Score_SN 0x00222221` drives the result-screen rank and must be sent before
  `EndGame_SN`.** Handler `0x107ece60`–`0x107ed15d`: body+0x02 is u16 WinTeamRank (1=F..11=SS);
  the per-player-record loop at body+0x24 is safely skipped when that count byte is 0 (min body
  0x25 bytes). Verified live: WinTeamRank=10 → "S" on the result screen.
  (`ZNetwork.dll 0x107ece60`; `journal/2026-09-19-1013-rank-fixed-experiment.md`)
- **`MapInfo_SN 0x00210115` must be re-sent on the 30907 login**, not just once at 9211 — the
  client's allowed-map list built from the 9211-time copy doesn't survive the scene change into
  the room, so the PvE map dropdown stays empty without a second send.
  (`ZNetwork.dll 0x107c4c00`; `journal/2026-09-19-1000-maplist-single-entry.md`)

## Anti-cheat / operational

- **The client console (hotkey `IK_F24`, no ordinary key reaches it) exposes real gameplay
  `exec` functions with no permission check** — `GameCampaign(1)` sends the same
  `Campaign_CN 0x00230139` a genuine round win would, and we confirmed a fully automated win
  this way. Such a round has no preceding `Death_CN 0x00230123` traffic, so a per-round
  Death_CN count of 0 is a usable (if spoofable) server-side tell that a round wasn't actually
  played — not a defense we have yet, just a signal worth building. GM "grade" does not gate
  this console at all. (`ZModePve/ZPvePlayercontroller.uc:904`;
  `journal/2026-09-19-2230-unattended-trial-01.md`)
- **On Windows 11, periodic multi-hundred-ms full-process freezes are Windows writing a crash
  dump, not a network issue.** The packer throws benign self-handled `0xc0000005` exceptions at
  a steady interval unrelated to traffic; if Windows Error Reporting's local-dump collection is
  on for the process (any third-party program's crash-dump registration can enable this
  globally, via `LocalDumps` under `...\Windows Error Reporting`), every exception makes
  `WerFault.exe` freeze all client threads for 140–270ms to write a ~29MB dump. Fix: add a
  `LocalDumps\MetalRage.exe` subkey with `DumpCount=0`. Confirmed by CPU trace before/after.
  (`journal/2026-09-20-1240-stutter-root-cause.md`)

---

Anything not covered here is unverified. `docs/state.md` is the living source of truth (updated
far more often); this file is a snapshot meant to save you the disassembly work we've already
done, not a replacement for it.
