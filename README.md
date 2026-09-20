# MRO Server — Taiwanese-client fork

A server emulator for **Metal Rage Online** (2009 mech TPS by GameHi; Taiwanese release 鐵影特攻 Online, published by Wasabii/Cayenne), written in Node.js.

This is a fork of [shanzenos/MRO-Server](https://github.com/shanzenos/MRO-Server), which was created from Ennuo's original MRO Server prototype ([ennuo/eks](https://github.com/ennuo/eks/tree/main/servers/metalrage)). Huge thanks to **Ennuo**, **Zephos** and **shanzenos** — their work laid the groundwork for all of this.

The official servers shut down in 2011 and no server code or packet captures survive, so everything here is reverse engineered from the client (`ZNetwork.dll`, the UnrealScript packages and `Cache.Bin`). This fork works against the **Taiwanese** client; opcodes and structures may differ from other regions.

## Working now

Verified with a real client, not just implemented. Evidence (session logs, screenshots, DLL addresses) is linked from `docs/state.md` and the journal entries it references.

| Area | State |
|---|---|
| Login, account creation, character record | Works |
| Hangar: mech selection, equipping, loadout persistence | Works |
| Basic shop: item lists, duration menus, purchase, money persistence | Works |
| Lobby: room list, room creation, options (map, difficulty, player count, room name incl. Big5) | Works |
| PvE (Campaign) match: start, round advance, death/respawn, end-of-match results, return to room | Works |
| Two clients in one room over LAN, playing a full PvE match together | Works |
| Escort PvE map (9007) | Starts and completes; not fully exercised |
| Battle networking | Peer-to-peer: the host client runs the listen server, joiners connect to it on UDP 30907 |

## Not yet

Taken from `docs/reference/system-coverage.md`, which tracks per-system opcode coverage:

| Area | State |
|---|---|
| PvP (Team Deathmatch, Bomb, Capture, Conquest) | Not implemented; design draft only |
| Progression economy (exp/money awards, rank formula, level thresholds) | Placeholder values; match results are not written back to the database yet |
| Boss / TwoBoss / Tutorial PvE modes | Not implemented (TwoBoss does not exist in the Taiwanese build) |
| Friends, whispers, guilds, mail, gifts | Not implemented |
| Card system | Not implemented |
| Cash shop | Not implemented |
| Password authentication | None — unknown usernames are auto-created, so do not expose this server to an untrusted network |

## Requirements

Same as upstream:

* [MySQL](https://www.mysql.com/)
* [Node.js](https://nodejs.org/en)
* [Game client](https://archive.org/download/metal-rage-online-client/MetalRage%20Online/MetalRage%20Online.rar)
* On Windows 11, the client needs [shanzenos' compatibility fix](https://github.com/shanzenos/Metal-Rage-Online-Win11-Fix)

Ports: **9211** auth/dispatch, **30907** game server (TCP), plus **UDP 30907** to the host client during a battle.

Setup, database import and client configuration: `docs/reference/setup.md`.

## Where to start reading

* `docs/PROTOCOL-SUMMARY.en.md` — one-page English summary of the most useful confirmed findings, for other implementers
* `docs/state.md` — current state of protocol knowledge, with confidence markers
* `docs/reference/system-coverage.md` — per-system opcode coverage and what is missing
* `docs/client-dispatch-map.md` — server→client opcode names, extracted from the client's dispatcher
* `docs/reference/protocol.md` — framing, dispatch order, string encodings, size limits
* `docs/journal/INDEX.md` — one entry per investigation or experiment

Most findings are documented with DLL addresses and the test evidence they came from. **The documentation is mostly in Traditional Chinese**, but opcodes, DLL addresses, struct offsets and code references are language independent, and file names are in English.

## Codes used throughout the docs

| Code | Meaning |
|---|---|
| M0–M4 | Milestones: basics, two clients in one room, a two-player LAN match, a remote friend over VPN, 4-player TDM |
| D1 | The multiplayer room model (rooms as server-side objects rather than per-connection state) |
| R-ROUND | PvE round advance: the server counts rounds and decides `EndRound_SN` vs `EndGame_SN` |
| P0–P7 | Pre-launch phases in `docs/roadmap.md` (PvP, progression, PvE completion, social, cards, launch prep) |
| ✅ / 🟡 / ⬜ / ❌ | Confirmed / hypothesis / unknown / ruled out |

## Scope

This fork is aimed at a small private group and is developed independently of upstream; it is not a drop-in replacement for it. Protocol findings here may still be useful to anyone working on the same client.
