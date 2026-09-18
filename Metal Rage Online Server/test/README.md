# Golden replay regression harness (A6)

`node test/replay-golden.js` feeds real client packets through the actual
`dispatch/*.js` handler chain -- no TCP socket, no live server, no MySQL --
and checks the bytes the handlers send back against a saved baseline.

Read the header comment in `replay-golden.js` first. Short version: the
`recv.jsonl` in each `test/golden/<name>/` sample is real client traffic
sliced out of a session log. The `expected.jsonl` it is compared against is
**not** what the server actually sent in that historical session -- this
harness has no access to the real `mro` database, so it cannot reproduce
that. `expected.jsonl` is a snapshot captured once against the fixture
account in `test/fixtures/fake-db.js`, and from then on this only proves
"the same input still produces the same output byte-for-byte". That is
enough to catch an accidental change to packet layout/order/opcode from a
refactor or a switch-default change; it is not a claim that the original
session replays byte-identical.

## Cache.Bin

`dispatch/room.dispatch.js` reads the client's `MetalRage/Data/System/Cache.Bin`
at module load (`loadCacheIndexByItemId()`) for item image indices and
`represent`/period lookups. It is gitignored and not part of this repo. To
get the real data instead of that loader's empty-map fallback, symlink it
into the worktree the same way the test-server worktree does:

```
ln -s /home/lucas/mro-reverse/MetalRage <worktree>/MetalRage
```

(`/home/lucas/mro-reverse/MetalRage` is itself a symlink to the actual
client install, e.g. `/mnt/c/Games/MetalRage Online`.) This symlink is not
committed (`MetalRage` is gitignored at the repo root) -- recreate it in any
new worktree before running `--record`. Without it, replay is still
deterministic (the loader's try/catch falls back to empty maps every time),
it just cannot catch a regression in the Cache.Bin-derived values
themselves; run `node test/replay-golden.js --record-all` once after adding
the symlink so the baselines reflect the real data.

## Usage

```
node test/replay-golden.js                 # run every sample, compare, exit 1 on any FAIL
node test/replay-golden.js <name>           # run one sample
node test/replay-golden.js --record <name>  # (re)capture the baseline after an intentional change
node test/replay-golden.js --record-all     # (re)capture every sample
```

A FAIL prints the first differing send packet: index, opcode, and (for a
body mismatch) the byte offset with a short hex window on each side.

## Adding a golden sample

```
node test/extract-golden.js <source-session.jsonl> <connId> <name> [--until <op>]
node test/replay-golden.js --record <name>
```

`extract-golden.js` only keeps `recv` packets tagged `route:"dispatch"`
(system-layer handshake/time-sync/keep-alive messages are handled inside
`client.js`, which this harness intentionally does not replay -- there is
nothing to regression-test there and it would need a real socket).
`--until <op>` stops the slice after the first recv packet matching that
opcode, for trimming a sample to a point before something not yet mocked
(`fake-db.js` throws a clearly-labelled error instead of guessing a shape
when it hits a call site it does not cover, e.g. `saveEquippedLoadout`).

Then `--record` once, read the console log to sanity-check the handlers
did what you expected (nothing here proves the fixture data itself is
realistic, only that replay is deterministic), and commit `recv.jsonl`,
`meta.json`, `expected.jsonl` and `expected.meta.json`.

## What is and is not covered right now

Covered (see `test/golden/`):
- `login-dispatch`: dispatch-server login (`0x00110151`) through gate leave.
- `login-room-game`: game-server login + channel enter + card ack
  (`0x00110124`/`0x00220111`/`0x00250102`/`0x00320104`), PvE room create with
  both scheduled room-state resends (`0x00220201`, exercises
  `test/fixtures/fake-timers.js`), a lobby chat (`0x00220501`, still a
  fallback ack -- the client has no dispatcher handler for the reply opcode
  either way) and a room chat (`0x00220505`, now `rooms.sendAll`-broadcast
  back to the room per D1-2 instead of a fallback ack -- see
  `test/room-chat.js` for the room-membership broadcast cases), and leaving
  the room back to the lobby (`0x00220234`).
- `login-room-shop-buy`: the same prefix as `login-room-game` (client state
  has to build up naturally -- a fixture client that jumps straight to
  Hangar Open would never have `campaignRoom_`/`accountId_` set, and
  wouldn't exercise the real code path), then Hangar Open_CQ (`0x00240101`,
  full shop bootstrap incl. `db.getItemCatalog()`), a lobby chat, and
  Buy_PointItem_CQ (`0x00240201`) buying a real catalog item on credit
  through the transactional `db.pool.getConnection()` path
  (`MONEY_PERSIST_MODE`), including the post-purchase ItemInfo refresh, the
  M3a `POST_BUY_SLOT_REFRESH_MODE` Slot_Change_SA resend, and the post-
  purchase ShopList repaint (fires through `fake-timers.js` again).

- `pve-full-match`: a PvE mission from room create through three full
  Campaign clears back to back on one connection (`session-20260918-205012.jsonl`
  conn 2 -- see extraction notes below), covering `Game_User_SN`
  (`0x00222112`), `Game_Info_SN`, `BeginRound_CN`/`BeginRound_SN`
  (`0x00230151`/`0x00230152`), the client-driven `ChangeSlot_CN`/`_SN`
  (`0x00230101`/`0x00230102`) mech-select path, many `Death_CN`/`Death_SN`
  (`0x00230123`/`0x00230124`) exchanges, `Campaign_CN`/`EndGame_SN`
  (`0x00230139`/`0x00222213`) three times, the post-match `Hangar Open_CQ`
  return to the campaign room each time, and finally `Leave_CQ`
  (`0x00220234`). This is the only session log under `logs/` that reaches
  a completed Campaign_CN (`grep -c '"op":"0x00230139"'` is 0 in every other
  log at the time this was extracted), and in it the player never leaves the
  room between rounds -- Leave_CQ is sent only once, after the third clear --
  so a single-round contiguous slice of this log cannot end in Leave_CQ; the
  sample covers all three rounds rather than trim to one, per AGENTS.md's
  "client behaviour over our assumptions" rule. That makes `expected.jsonl`
  ~13MB (8383 send packets vs. dozens-to-hundreds in the other samples,
  mostly from the ~350 `0x00230123` recv packets the client sends during
  battle, each answered with a `Death_SN`) -- flagged here for a size-vs-
  fidelity call the next reviewer may want to revisit; see the A6b handback
  report for the alternatives considered (a shorter single-round slice would
  not reach Leave_CQ; splicing two non-contiguous slices from the same log
  was rejected as not "one segment" per the task contract).

Switch coverage spot-checked for this pass (flip to `disabled`, confirm a
FAIL with the right op/offset, flip back): `ROOM_TEAM_INDEX_MODE` (room
default 0x00220203 +0x10 team indices), `ROOM_USER_NAME_ANSI_MODE`
(0x00220421 name encoding), `ROOM_LEAVE_RESET_MODE` (no packet of its own --
leaves `campaignRoom_` true after Leave_CQ, which then changes which branch
Hangar Open_CQ takes; only `login-room-shop-buy` covers it, at send #51),
`MONEY_PERSIST_MODE` (0x00210103 record-info layout), `POST_BUY_SLOT_REFRESH_MODE`
(drops the post-buy 0x00240108 resend). This is not exhaustive -- see
`docs/reference/switch-audit.md`'s full switch list for what else exists.

Not covered yet, and why:
- **`saveEquippedLoadout`, `createAccount`, cash-currency purchases**: no
  golden sample exercises these DB entry points yet; `fake-db.js` throws a
  labelled "not mocked" error rather than guess a shape if one ever does.
