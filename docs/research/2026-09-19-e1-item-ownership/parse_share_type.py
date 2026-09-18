#!/usr/bin/env python3
"""Read-only Cache.Bin GameItemRecord.ShareType dump for E1 design task.

Reuses the fixed-stride GameItemRecord table location/stride/count already
used in production by dispatch/room.dispatch.js (GAME_ITEM_RECORD_TABLE_START
0x2294, GAME_ITEM_RECORD_ENTRY_SIZE 0x67, GAME_ITEM_RECORD_COUNT 2112) and
the per-field offsets already established in
docs/research/2026-09-18-shop-item-period/parse_22100101_family.txt (which
walked the struct field-by-field for two families and recorded absolute
byte positions). Field layout, in declaration order, from
~/mro-decrypted/src/Engine/CacheManager.uc:131-159 (GameItemRecord struct):

  +0x00 ItemIndex (i32)
  +0x04 RepresentIndex (i32)
  +0x08 HighGroup (i32)
  +0x0C MiddleGroup (i32)
  +0x10 LowGroup (i32)
  +0x14 DetailGroup (i32)
  +0x18 SellType (FString: 1 compact-index length byte + N ANSI bytes incl
        null; observed len byte 0x02 -> "P\0" for every sampled record, so
        this field is 3 bytes -> next field starts at +0x1B)
  +0x1B DisplayPoint (i32)
  +0x1F SellPoint (i32)
  +0x23 DisplayCash (i32)
  +0x27 SellCash (i32)
  +0x2B DisplayCoupon (i32)
  +0x2F SellCoupon (i32)
  +0x33 BonusPoint (i32)
  +0x37 Grade (i32)
  +0x3B UseType (i32)
  +0x3F UseCount (i32)
  +0x43 UseTime (i32)          <- this is room.dispatch.js's "periodSeconds"
  +0x47 RequestLevel (i32)
  +0x4B FunctionIndex (i32)
  +0x4F ShareType (i32)        <- what this script is after
  +0x53 MergeType (i32)
  +0x57 CanGift (i32)
  +0x5B HaveSocket (i32)
  +0x5F DefaultSocketCount (i32)
  +0x63 MaxSocketCount (i32)   <- ends at +0x67, matches the known stride

This offset chain is only valid if SellType is always a 1-char ANSI string
(len byte 0x02) for every one of the 2112 records; the script checks that
assumption explicitly and reports any record where it does not hold,
instead of silently misaligning the rest of that record's fields.

Names are resolved the same way tools/item-names.py does: HighGroup selects
which Spec*List table to look up RepresentIndex in (CacheManager.uc
GetSpecItemName switch, HighGroup 1=mech 2=weapon-main 3=weapon-sub
4=booster 5=pilot 6=skin, other=etc).
"""
import struct
import sys

CACHE_PATH = "/home/lucas/mro-reverse/MetalRage/Data/System/Cache.Bin"

TABLE_START = 0x2294
ENTRY_SIZE = 0x67
COUNT = 2112

SHARE_TYPE_OFF = 0x4F
SELLTYPE_LEN_OFF = 0x18
HIGH_GROUP_OFF = 0x08
REPRESENT_OFF = 0x04

MECH_ANCHOR = b"ZMechanic.SA01m"

HIGH_GROUP_NAMES = {1: "機體", 2: "主武器", 3: "副武器", 4: "推進器", 5: "駕駛員", 6: "塗裝"}


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
        s = raw.decode("cp950", errors="replace")
    if s.endswith("\x00"):
        s = s[:-1]
    return s, pos


def read_i32(data, pos):
    return int.from_bytes(data[pos:pos + 4], "little", signed=True), pos + 4


def skip_i32(data, pos, count):
    return pos + 4 * count


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
        pos = skip_i32(data, pos, 6)
        _image_index, pos = read_i32(data, pos)
        name, pos = read_fstring(data, pos)
        _desc, pos = read_fstring(data, pos)
        _detail, pos = read_fstring(data, pos)
        out[rep] = name
    return out, pos


def parse_weapon_table(data, pos):
    count, pos = read_compact_index(data, pos)
    out = {}
    for _ in range(count):
        rep, pos = read_i32(data, pos)
        classname, pos = read_fstring(data, pos)
        _mesh, pos = read_fstring(data, pos)
        pos = skip_i32(data, pos, 20)
        name, pos = read_fstring(data, pos)
        _desc, pos = read_fstring(data, pos)
        _detail, pos = read_fstring(data, pos)
        out[rep] = name
    return out, pos


def parse_booster_table(data, pos):
    count, pos = read_compact_index(data, pos)
    out = {}
    for _ in range(count):
        rep, pos = read_i32(data, pos)
        classname, pos = read_fstring(data, pos)
        _mesh, pos = read_fstring(data, pos)
        pos = skip_i32(data, pos, 13)
        name, pos = read_fstring(data, pos)
        _desc, pos = read_fstring(data, pos)
        _detail, pos = read_fstring(data, pos)
        out[rep] = name
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
        out[rep] = name
    return out, pos


def parse_pilot_or_etc_table(data, pos):
    count, pos = read_compact_index(data, pos)
    out = {}
    for _ in range(count):
        rep, pos = read_i32(data, pos)
        _image_index, pos = read_i32(data, pos)
        name, pos = read_fstring(data, pos)
        _desc, pos = read_fstring(data, pos)
        _detail, pos = read_fstring(data, pos)
        out[rep] = name
    return out, pos


def main():
    data = open(CACHE_PATH, "rb").read()

    first = int.from_bytes(data[TABLE_START:TABLE_START + 4], "little")
    if first != 11100101:
        sys.exit(f"sanity failed: first={first} expected=11100101")

    anchor = data.find(MECH_ANCHOR)
    mech_start = anchor - 5
    header_start = mech_start - 1
    pos = header_start
    mech, pos = parse_mech_table(data, pos)
    weapon_main, pos = parse_weapon_table(data, pos)
    weapon_sub, pos = parse_weapon_table(data, pos)
    booster, pos = parse_booster_table(data, pos)
    skin, pos = parse_skin_table(data, pos)
    pilot, pos = parse_pilot_or_etc_table(data, pos)
    etc, pos = parse_pilot_or_etc_table(data, pos)
    name_tables = {1: mech, 2: weapon_main, 3: weapon_sub, 4: booster, 5: pilot, 6: skin}

    records = []
    bad_selltype = []
    for i in range(COUNT):
        off = TABLE_START + i * ENTRY_SIZE
        item_id = int.from_bytes(data[off:off + 4], "little", signed=True)
        if item_id <= 0:
            continue
        represent = int.from_bytes(data[off + REPRESENT_OFF:off + REPRESENT_OFF + 4], "little", signed=True)
        high_group = int.from_bytes(data[off + HIGH_GROUP_OFF:off + HIGH_GROUP_OFF + 4], "little", signed=True)
        selltype_lenbyte = data[off + SELLTYPE_LEN_OFF]
        if selltype_lenbyte != 0x02:
            bad_selltype.append((item_id, hex(off), selltype_lenbyte))
            continue
        share_type = int.from_bytes(data[off + SHARE_TYPE_OFF:off + SHARE_TYPE_OFF + 4], "little", signed=True)
        name = name_tables.get(high_group, {}).get(represent, "?")
        records.append((item_id, represent, high_group, share_type, name))

    print(f"total records with item_id>0: {sum(1 for i in range(COUNT) if int.from_bytes(data[TABLE_START+i*ENTRY_SIZE:TABLE_START+i*ENTRY_SIZE+4],'little',signed=True) > 0)}")
    print(f"parsed with SellType lenbyte==0x02: {len(records)}")
    print(f"records with unexpected SellType lenbyte (skipped): {len(bad_selltype)}")
    for r in bad_selltype[:20]:
        print("  BAD", r)

    from collections import Counter, defaultdict
    by_group_share = Counter((hg, st) for (_, _, hg, st, _) in records)
    print("\n(HighGroup, ShareType) -> count:")
    for (hg, st), c in sorted(by_group_share.items()):
        print(f"  {HIGH_GROUP_NAMES.get(hg, hg)} ShareType={st}: {c}")

    examples = defaultdict(list)
    for (item_id, represent, hg, st, name) in records:
        if st == 1:
            examples[hg].append((item_id, represent, name))

    print("\nShareType=1 examples per group (up to 5 each):")
    for hg in (2, 3, 4, 6):
        exs = examples.get(hg, [])
        print(f"  {HIGH_GROUP_NAMES.get(hg, hg)} ({len(exs)} total):")
        for item_id, represent, name in exs[:5]:
            print(f"    {item_id} (rep {represent}) {name}")


if __name__ == "__main__":
    main()
