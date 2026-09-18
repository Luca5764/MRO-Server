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
(e.g. before hangar/shop, which needs `getItemCatalog` and transactional
`pool.getConnection()` support `test/fixtures/fake-db.js` does not have
yet -- it throws a clearly-labelled error instead of guessing).

Then `--record` once, read the console log to sanity-check the handlers
did what you expected (nothing here proves the fixture data itself is
realistic, only that replay is deterministic), and commit `recv.jsonl`,
`meta.json`, `expected.jsonl` and `expected.meta.json`.

## What is and is not covered right now

Covered (see `test/golden/`): dispatch-server login (`0x00110151`),
game-server login + channel enter + card ack (`0x00110124`/`0x00220111`/
`0x00250102`/`0x00320104`), PvE room create with both scheduled room-state
resends (`0x00220201`, exercises `test/fixtures/fake-timers.js`), two
lobby-chat fallback acks, and leaving the room back to the lobby
(`0x00220234`).

Not covered yet, and why:
- **Shop / hangar / buy** (`0x0024xxxx` past `Leave_CQ`): needs
  `db.getItemCatalog()` and `db.pool.getConnection()` (transactional),
  neither mocked. `fake-db.js` throws a labelled error if a sample reaches
  them instead of guessing a shape.
- **PvE match to completion** (`BeginRound_SN` / score / end-game): no
  session log in `logs/` at the time this was written reached that far
  (see A6 handback report); needs its own golden sample once one exists.
- **Cache.Bin-dependent fields** (item image indices, `represent` lookups
  in `dispatch/room.dispatch.js`'s `loadCacheIndexByItemId()`): this
  sandbox has no `MetalRage/Data/System/Cache.Bin`, so that loader always
  falls back to its empty-map catch path here. Replay is still
  deterministic (same empty result every run), but it cannot catch a
  regression in the Cache.Bin-derived values themselves.
