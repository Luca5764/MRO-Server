#!/usr/bin/env python3
"""Read-only Cache.Bin item-name lookup: ItemIndex/RepresentIndex -> 客戶端顯示名稱.

Cache.Bin holds a sequence of fixed-purpose tables, each a 1-byte
FCompactIndex element count followed by that many variable-length records
(int32 fields plus FCompactIndex-length-prefixed FString fields: positive
length = ANSI bytes incl. null terminator, negative length = UTF-16LE code
units incl. null terminator). This matches CacheManager.uc's declaration
order (Engine/CacheManager.uc:672-696) for the "Cache*List" arrays and the
struct layouts at Engine/CacheManager.uc:198-333 (SpecMechRecord,
SpecWeaponMainRecord, SpecWeaponSubRecord, SpecBoosterRecord, SpecSkinRecord,
SpecPilotRecord, SpecEtcRecord).

Which Spec*List holds an ItemIndex's name is selected by GetItemHighGroup()
(via the GameItemRecord table) exactly like the client's
CacheManager.GetSpecItemName() switch (CacheManager.uc:1289-1309):
  HighGroup 1 -> SpecMechRecord (機體)
  HighGroup 2 -> SpecWeaponMainRecord (主武器)
  HighGroup 3 -> SpecWeaponSubRecord (副武器)
  HighGroup 4 -> SpecBoosterRecord (推進器)
  HighGroup 5 -> SpecPilotRecord (駕駛員)
  HighGroup 6 -> SpecSkinRecord (塗裝)
  other       -> SpecEtcRecord (消耗品/雜項；client's HighGroup 8 Card case is
                  commented out in GetSpecItemName, so cards fall here too)

The GameItemRecord table location/stride/count (offset 0x2294, stride 0x67,
count 2112) is the same constant already used in production by
dispatch/room.dispatch.js's loadCacheIndexByItemId(); this script reuses it
rather than re-deriving it. The Spec*List tables are NOT at fixed offsets
(they are variable-length and packed back-to-back) so this script locates
SpecMechRecord's first entry by searching for its known ClassName string
"ZMechanic.SA01m", then walks every later table sequentially, count byte by
count byte. This was cross-checked byte-for-byte during development: mech
(16) -> weapon-main (55) -> weapon-sub (23) -> booster (7) -> skin (95) ->
pilot (25) -> etc (181) parse with zero gap/overlap between tables and the
pilot section matches docs/research/2026-09-18-room-pilot-avatar/
pilot-records-dump.txt exactly. The pilot count/count-of-16-mechs/etc match
the "Table N" counts already recorded in docs/journal/2026-09-16-33 and
-34 (55 main weapons, 23 sub weapons, 7 boosters, 16 mechs), though this
script does not rely on those journal entries' table *numbering* (see
docs/reference/item-names.md for a note on a numbering discrepancy found
between that journal and this script).

Usage:
  tools/item-names.py                  dump full representative-item table
  tools/item-names.py <id>             look up one ItemIndex/RepresentIndex
  tools/item-names.py <text>           substring search over names (any language)
  tools/item-names.py --regen-doc      rewrite docs/reference/item-names.md
"""
import os
import sys
import struct

CANDIDATE_CACHE_PATHS = [
    "/mnt/c/Games/MetalRage Online/data/System/Cache.Bin",
    os.path.expanduser("~/Desktop/MetalRage/Data/System/Cache.Bin"),
]

GAME_ITEM_RECORD_TABLE_START = 0x2294
GAME_ITEM_RECORD_ENTRY_SIZE = 0x67
GAME_ITEM_RECORD_COUNT = 2112

MECH_ANCHOR = b"ZMechanic.SA01m"

HIGH_GROUP_NAMES = {
    1: "機體",
    2: "主武器",
    3: "副武器",
    4: "推進器",
    5: "駕駛員",
    6: "塗裝",
}


def find_cache_path():
    for repo_dir in [os.path.dirname(os.path.abspath(__file__))]:
        d = repo_dir
        for _ in range(10):
            cand = os.path.join(d, "MetalRage", "Data", "System", "Cache.Bin")
            if os.path.exists(cand):
                return cand
            parent = os.path.dirname(d)
            if parent == d:
                break
            d = parent
    for p in CANDIDATE_CACHE_PATHS:
        if os.path.exists(p):
            return p
    sys.exit("Cache.Bin not found (checked repo parents + " + ", ".join(CANDIDATE_CACHE_PATHS) + ")")


def read_compact_index(data, pos):
    b0 = data[pos]
    pos += 1
    sign = b0 & 0x80
    val = b0 & 0x3F
    shift = 6
    if b0 & 0x40:
        n = 1
        more = True
        while more and n <= 4:
            b = data[pos]
            pos += 1
            if n == 4:
                val |= b << shift
                more = False
            else:
                val |= (b & 0x7F) << shift
                more = bool(b & 0x80)
                shift += 7
            n += 1
    if sign:
        val = -val
    return val, pos


def read_fstring(data, pos):
    n, pos = read_compact_index(data, pos)
    if n == 0:
        return "", pos
    if n < 0:
        n = -n
        raw = data[pos:pos + n * 2]
        pos += n * 2
        s = raw.decode("utf-16-le", errors="replace")
    else:
        raw = data[pos:pos + n]
        pos += n
        s = raw.decode("cp950", errors="replace")  # ANSI strings here are ASCII-only in practice
    if s.endswith("\x00"):
        s = s[:-1]
    return s, pos


def read_i32(data, pos):
    return int.from_bytes(data[pos:pos + 4], "little", signed=True), pos + 4


def skip_i32(data, pos, count):
    return pos + 4 * count


def parse_game_item_records(data):
    """Table 2 CacheGameItemList: ItemIndex -> (RepresentIndex, HighGroup)."""
    first = int.from_bytes(data[GAME_ITEM_RECORD_TABLE_START:GAME_ITEM_RECORD_TABLE_START + 4], "little")
    if first != 11100101:
        sys.exit(f"GameItemRecord table sanity failed: first={first} expected=11100101")
    out = {}
    for i in range(GAME_ITEM_RECORD_COUNT):
        off = GAME_ITEM_RECORD_TABLE_START + i * GAME_ITEM_RECORD_ENTRY_SIZE
        item_id = int.from_bytes(data[off:off + 4], "little")
        represent = int.from_bytes(data[off + 4:off + 8], "little")
        high_group = int.from_bytes(data[off + 8:off + 12], "little")
        if item_id > 0:
            out[item_id] = (represent, high_group)
    return out


def parse_mech_table(data, pos):
    count, pos = read_compact_index(data, pos)
    out = {}
    for _ in range(count):
        rep, pos = read_i32(data, pos)
        classname, pos = read_fstring(data, pos)
        _default_mech, pos = read_i32(data, pos)
        _default_name, pos = read_fstring(data, pos)
        _mech_type, pos = read_i32(data, pos)
        _mesh, pos = read_fstring(data, pos)
        pos = skip_i32(data, pos, 6)  # HP,PW,SP,BS,DF,WE
        _image_index, pos = read_i32(data, pos)
        name, pos = read_fstring(data, pos)
        _desc, pos = read_fstring(data, pos)
        _detail, pos = read_fstring(data, pos)
        out[rep] = (name, classname)
    return out, pos


def parse_weapon_table(data, pos):
    """Shared layout for SpecWeaponMainRecord and SpecWeaponSubRecord."""
    count, pos = read_compact_index(data, pos)
    out = {}
    for _ in range(count):
        rep, pos = read_i32(data, pos)
        classname, pos = read_fstring(data, pos)
        _mesh, pos = read_fstring(data, pos)
        pos = skip_i32(data, pos, 20)  # HP..AMMOMAX
        name, pos = read_fstring(data, pos)
        _desc, pos = read_fstring(data, pos)
        _detail, pos = read_fstring(data, pos)
        out[rep] = (name, classname)
    return out, pos


def parse_booster_table(data, pos):
    count, pos = read_compact_index(data, pos)
    out = {}
    for _ in range(count):
        rep, pos = read_i32(data, pos)
        classname, pos = read_fstring(data, pos)
        _mesh, pos = read_fstring(data, pos)
        pos = skip_i32(data, pos, 13)  # HP..ImageIndex
        name, pos = read_fstring(data, pos)
        _desc, pos = read_fstring(data, pos)
        _detail, pos = read_fstring(data, pos)
        out[rep] = (name, classname)
    return out, pos


def parse_skin_table(data, pos):
    count, pos = read_compact_index(data, pos)
    out = {}
    for _ in range(count):
        rep, pos = read_i32(data, pos)
        classname, pos = read_fstring(data, pos)
        _image_index, pos = read_i32(data, pos)
        name, pos = read_fstring(data, pos)
        _desc, pos = read_fstring(data, pos)
        _detail, pos = read_fstring(data, pos)
        out[rep] = (name, classname)
    return out, pos


def parse_pilot_or_etc_table(data, pos):
    """Shared layout for SpecPilotRecord and SpecEtcRecord."""
    count, pos = read_compact_index(data, pos)
    out = {}
    for _ in range(count):
        rep, pos = read_i32(data, pos)
        _image_index, pos = read_i32(data, pos)
        name, pos = read_fstring(data, pos)
        _desc, pos = read_fstring(data, pos)
        _detail, pos = read_fstring(data, pos)
        out[rep] = (name, "")
    return out, pos


def load():
    cache_path = find_cache_path()
    data = open(cache_path, "rb").read()

    game_items = parse_game_item_records(data)

    anchor = data.find(MECH_ANCHOR)
    if anchor == -1:
        sys.exit("could not find SpecMechRecord anchor 'ZMechanic.SA01m' in Cache.Bin")
    mech_start = anchor - 5  # back up: 1 compact-index length byte + 4-byte RepresentIndex
    header_start = mech_start - 1  # the table's element-count byte

    pos = header_start
    mech, pos = parse_mech_table(data, pos)
    weapon_main, pos = parse_weapon_table(data, pos)
    weapon_sub, pos = parse_weapon_table(data, pos)
    booster, pos = parse_booster_table(data, pos)
    skin, pos = parse_skin_table(data, pos)
    pilot, pos = parse_pilot_or_etc_table(data, pos)
    etc, pos = parse_pilot_or_etc_table(data, pos)

    tables = {1: mech, 2: weapon_main, 3: weapon_sub, 4: booster, 6: skin, 5: pilot}

    return cache_path, game_items, tables, etc


def lookup_name(represent_index, high_group, tables, etc):
    table = tables.get(high_group)
    if table and represent_index in table:
        return table[represent_index][0], table[represent_index][1]
    if represent_index in etc:
        return etc[represent_index][0], ""
    return None, None


def build_rows(game_items, tables, etc):
    rows = []
    for item_id, (represent, high_group) in game_items.items():
        if represent != item_id:
            continue  # skip period/limited-time variants; keep only the representative row
        name, classname = lookup_name(represent, high_group, tables, etc)
        rows.append((item_id, high_group, name, classname))
    rows.sort(key=lambda r: (r[1], r[0]))
    return rows


def main():
    cache_path, game_items, tables, etc = load()
    args = sys.argv[1:]

    if args and args[0] == "--regen-doc":
        regen_doc(cache_path, game_items, tables, etc)
        return

    if not args:
        for item_id, high_group, name, classname in build_rows(game_items, tables, etc):
            label = HIGH_GROUP_NAMES.get(high_group, f"HighGroup{high_group}")
            print(f"{item_id}\t{label}\t{name}\t{classname}")
        return

    query = args[0]
    if query.isdigit():
        item_id = int(query)
        if item_id not in game_items:
            print(f"{item_id}: not in GameItemRecord table")
            return
        represent, high_group = game_items[item_id]
        name, classname = lookup_name(represent, high_group, tables, etc)
        label = HIGH_GROUP_NAMES.get(high_group, f"HighGroup{high_group}")
        print(f"ItemIndex={item_id} RepresentIndex={represent} HighGroup={high_group} ({label}) "
              f"ClassName={classname!r} Name={name!r}")
        return

    # substring search
    needle = query.lower()
    seen = set()
    for item_id, (represent, high_group) in sorted(game_items.items()):
        name, classname = lookup_name(represent, high_group, tables, etc)
        if not name:
            continue
        if needle in name.lower() and (represent, high_group) not in seen:
            seen.add((represent, high_group))
            label = HIGH_GROUP_NAMES.get(high_group, f"HighGroup{high_group}")
            print(f"{represent}\t{label}\t{name}\t{classname}")


def regen_doc(cache_path, game_items, tables, etc):
    doc_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "reference", "item-names.md")
    doc_path = os.path.abspath(doc_path)
    rows = build_rows(game_items, tables, etc)
    by_group = {}
    for item_id, high_group, name, classname in rows:
        by_group.setdefault(high_group, []).append((item_id, name, classname))

    lines = []
    lines.append("# Item names (Cache.Bin → 客戶端顯示名稱)")
    lines.append("")
    lines.append("由 `tools/item-names.py --regen-doc` 產生，來源與偏移見該檔案開頭的註解與")
    lines.append("`docs/journal/2026-09-18-19-item-names.md`。只列 HighGroup 1–6（機體／主武器／")
    lines.append("副武器／推進器／駕駛員／塗裝）的**代表項**（`RepresentIndex == ItemIndex`），")
    lines.append("期限變體（如 `22100102`..`22100108`）已省略；查完整清單/期限變體/其他 HighGroup")
    lines.append("（消耗品、卡片等）用 `tools/item-names.py <id>` 或 `tools/item-names.py <文字片段>`。")
    lines.append("")
    lines.append("重新產生：`cd \"Metal Rage Online Server\" && python3 tools/item-names.py --regen-doc`")
    lines.append("")
    for hg in sorted(HIGH_GROUP_NAMES):
        label = HIGH_GROUP_NAMES[hg]
        group_rows = by_group.get(hg, [])
        named = [(i, n, c) for i, n, c in group_rows if n is not None]
        unnamed = [i for i, n, c in group_rows if n is None]
        lines.append(f"## HighGroup {hg}（{label}）")
        lines.append("")
        lines.append("| ItemIndex | 名稱 | ClassName |")
        lines.append("|---|---|---|")
        for item_id, name, classname in named:
            lines.append(f"| `{item_id}` | {name} | `{classname}` |")
        lines.append("")
        if unnamed:
            lines.append(
                f"({len(unnamed)} 個 ItemIndex 在 GameItemRecord 中屬於這個 HighGroup 且是代表項，"
                f"但對應的 Spec*Record 表沒有這筆資料，猜測是未上線/保留的道具位：`"
                + "`, `".join(str(i) for i in unnamed) + "`)"
            )
            lines.append("")
    lines.append("## 其他 HighGroup")
    lines.append("")
    lines.append(
        "HighGroup 8（卡片）在 `CacheManager.GetSpecItemName`（Engine/CacheManager.uc:1289-1309）的"
        " `case 8` 是註解掉的，所以客戶端對卡片一律拿不到名稱（本表也一樣，代表項全部 unnamed，"
        "略過不列）。HighGroup 7、9（消耗品/禮包等）落在 `default` 分支，會查 SpecEtcRecord，"
        "本工具已一併解析，可用 `tools/item-names.py <id>` 或關鍵字查。"
    )
    lines.append("")

    with open(doc_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"wrote {doc_path} ({len(rows)} representative items, cache={cache_path})")


if __name__ == "__main__":
    main()
