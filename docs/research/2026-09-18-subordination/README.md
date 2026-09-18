# Mech 1 (11100101 / SA01m) subordination — Cache.Bin parse notes

中階調查，🟡 待審。所有結論來自 Cache.Bin 靜態解析 + Engine.dll 組語比對，未跑遊戲、未跑伺服器。

File: `/mnt/c/Games/MetalRage Online/data/System/Cache.Bin` (484086 bytes, 2010-12-27).
Tool: ad-hoc python one-liners (documented below), cross-checked with
`Metal Rage Online Server/tools/disasm.py at/exports` against `Engine.dll`
(ImageBase 0x10300000; NOT ZNetwork.dll — `UCacheManager` lives in Engine.dll).

## 1. Struct layouts (from UnrealScript source + confirmed by disasm)

Source: `~/mro-decrypted/src/Engine/CacheManager.uc` lines 131-195.

### FGameItemRecord (0x70 = 112 bytes fixed prefix, then compact-index string, then more ints)
Confirmed via `operator<<(FArchive&,FGameItemRecord&)` at `[DLL] Engine.dll 0x1032d090`
(`tools/disasm.py at 0x1032d090 90 Engine.dll`): sequential `push [eax+N]; call esi`
for N = 0,4,8,0xc,0x10,0x14, then a different callee at N=0x18 (FString serializer,
`[0x1067916c]`), then N = 0x24,0x28,0x2c,0x30,0x34,0x38,0x3c,0x40,0x44,0x48,0x4c,0x50,
0x54,0x58,0x5c,0x60,0x64,0x68,0x6c. Field order/offsets:

| offset | field |
|---|---|
| 0x00 | ItemIndex |
| 0x04 | RepresentIndex |
| 0x08 | HighGroup |
| 0x0c | MiddleGroup |
| 0x10 | LowGroup |
| 0x14 | DetailGroup |
| 0x18 | SellType (string, **FCompactIndex-length-prefixed**, not int32) |
| 0x24..0x6c | DisplayPoint, SellPoint, DisplayCash, SellCash, DisplayCoupon, SellCoupon, BonusPoint, Grade, UseType, UseCount, UseTime, RequestLevel, FunctionIndex, ShareType, MergeType, CanGift, HaveSocket, DefaultSocketCount, MaxSocketCount (all int32, 4 bytes each) |

The SellType string at offset 0x18 is NOT a plain int32 length + bytes. Example at
cache offset 0x22AC: byte `0x02` (FCompactIndex, high bits clear ⇒ length 2) then
`50 00` = `"P\0"` (ASCII "P" = point-type sell). This means GameItemRecord entries in
Cache.Bin are **variable length** — cannot blindly stride by 0x70 through the whole
catalog. Fields at offset ≤0x14 (ItemIndex..DetailGroup) are safe to read directly
for any record whose start you already know, since they precede the string.

### FSubordinationRecord (0x1c = 28 bytes fixed, all ints — confirmed the "SubOrdinationList")
Confirmed via `operator<<(FArchive&,FSubordinationRecord&)` at `[DLL] Engine.dll 0x1032d430`:
`push [eax+0/4/8/0xc/0x10/0x14/0x18]` then 7x `call esi` (plain int32 serializer).

| offset | field |
|---|---|
| 0x00 | RepresentIndex |
| 0x04 | SubordinationSort |
| 0x08 | SubordinationIndex |
| 0x0c | HighGroup |
| 0x10 | MiddleGroup |
| 0x14 | LowGroup |
| 0x18 | DetailGroup |

This is a flat array, no length-prefixed strings, so it's trivial to bulk-parse.

### FDefaultSetRecord (0x1c = 28 bytes, all ints — the DefaultSetList, already known from prior journal)
Mech, Level, WeaponMain, WeaponSubLeft, WeaponSubRight, Booster, Skin. Confirmed by exact
byte match at `[CACHE] offset 0x37456` for row `11100101,1,22100101,32100101,31100101,41100101,61101001`.

## 2. ItemSubordinateCheck logic (client, UC source)

`~/mro-decrypted/src/ZGameMainMenu/ZPanel_ShopItems.uc:690-746`. For a candidate shop
`ItemIndex`, client looks up `ItemInfo = GetGameItemRecord(ItemIndex)`. If
`ItemInfo.HighGroup` is 1 (mech) and it's a sale-type mech, always allowed. Otherwise
(weapon/booster/etc, HighGroup 2/3/4/6) it walks `GetSubOrdinationList()` (the
FSubordinationRecord array) looking for a row whose `RepresentIndex == ItemInfo.RepresentIndex`
and whose `HighGroup`/`MiddleGroup` match the **equipped mech's own** HighGroup/MiddleGroup
(from the mech's own GameItemRecord, not from the weapon's own HighGroup/MiddleGroup —
those are two different meanings of the same field names, do not conflate them).

`GetGameItemRecord` binary-searches a runtime array `*(pCache+0x98)` of count `*(pCache+0x9c)`,
stride `0x70` `[DLL] Engine.dll 0x10412690` (visible in prior journal decompile
`docs/research/2026-09-16-slots/mro-cache-item.txt`). That's the in-memory parsed array,
consistent with — but not byte-identical in stride to — the on-disk variable-length records
described above.

## 3. Mech 11100101 own HighGroup/MiddleGroup 🟡

Found its own GameItemRecord at **`[CACHE] offset 0x2294`**:
`ItemIndex=11100101, RepresentIndex=11100101, HighGroup=1, MiddleGroup=1, LowGroup=1, DetailGroup=1`,
then SellType compact-string `"P"` at 0x22AC. (Located by searching the file for the
int32 LE encoding of 11100101 and inspecting neighbouring int32s against the confirmed
struct field offsets above — not disassembly-confirmed at the instruction level for this
specific value, but the struct layout itself is disasm-confirmed per §1.)

**Mech 1: HighGroup = 1, MiddleGroup = 1.**

## 4. SubOrdinationList table location and mech-1-compatible rows 🟡

Bulk-parsed as 0x1c-byte FSubordinationRecord rows from **`[CACHE] 0x377d8`** to
**`[CACHE] 0x38e28`** (204 rows; table boundary found by scanning until fields stop
looking like plausible item IDs / small group numbers — not an explicit header/count
field, so the exact start/end boundary is a 🟡 heuristic, see caveats). Rows with
`HighGroup==1 && MiddleGroup==1` (i.e. compatible with mech 1's own group) and their
own category (leading digit of RepresentIndex, cross-checked against each item's own
GameItemRecord.HighGroup — see §5):

**主武器 (own HighGroup 2, from GameItemRecord, spot-checked at [CACHE] 0x7c4d for 22100101):**
22100101, 22100201, 22100301, 22200101, 22200301, 22300201, 22500101, 22600101

**副武器 (own HighGroup 3, spot-checked [CACHE] 0x11395 for 31100101 and 0x11a05 for 32100101):**
31100101, 31100201, 32100101, 32100201, 33100101, 33300101, 33300201, 33300401,
33500101, 33800101, 33800201, 35100101, 35100201, 39400101, 39500101

**推進器 (own HighGroup 4, spot-checked [CACHE] 0x160d5 for 41100101):**
41100101, 41200101, 41200201, 41300101

Raw dump script + full 204-row table: see `subord-dump.txt` in this folder.

## 5. Cross-check against `item_catalog` (58 rows, metalrageserver.sql:132-189)

Present in `item_catalog`: 22100101, 22100201, 22200101, 22300201, 22500101, 22600101
(main); 31100101, 31100201, 32100101, 32100201, 33100101, 33300101, 33500101,
35100101, 35100201, 39400101, 39500101 (sub); 41100101, 41200101, 41200201, 41300101
(booster) — **booster category: 4/4 present, complete.**

**Missing from `item_catalog` but compatible per Cache.Bin subordination data:**
- 主武器: `22100301`, `22200301`
- 副武器: `33300201`, `33300401`, `33800101`, `33800201`

These 6 IDs are NOT absent from the DB entirely — they exist in the separate
`catalog` table (`metalrageserver.sql:194+`, columns `item_id, category_type,
mech_type, price`, e.g. line 229 `22100301, 2, 2, 0` and line 286
`33800101, 3, 3, 0`), which appears to be a full reinforcement-level price table
(item_id suffix 01-08 = upgrade level) distinct from the 58-row `item_catalog` used
for the shop list. So `item_catalog` looks like a hand-curated/incomplete subset of
the base items that actually exist and are wearable, not a fabricated ID problem.

## Caveats / not confirmed

- SubOrdinationList table boundary (0x377d8–0x38e28) was found by a heuristic filter
  (RepresentIndex 8-digit, SubordinationSort∈{0,1}, groups ≤10), not a header/count
  field read from disasm. Rows right at the edges deserve a second look before citing
  as ✅.
- Mech's own record at 0x2294 was located by scanning for the int32 pattern, not by
  walking `ParseGameItemList`/the runtime array from a debugger. The struct-offset
  interpretation is disasm-confirmed (§1); the specific claim "this offset IS mech
  11100101's own catalog row" is a 🟡 inference from matching field values, not a
  live-memory check.
- Did not attempt to fully parse the variable-length GameItemRecord catalog end-to-end
  (would need to walk every record via the FCompactIndex string length to find the next
  record — not done here, out of scope). Only spot-checked 5 known items' own
  HighGroup/MiddleGroup by locating their ItemIndex directly.
- Did not check `is_show`/other filtering columns on the 6 missing IDs since they
  aren't rows in `item_catalog` at all — nothing to filter.
- Have not verified this against a client log or screenshot of the actual shop; this
  is Cache.Bin + SQL only, per task scope.
