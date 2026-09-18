# Premium/reinforced mech investigation — raw notes (中階, 待審, not committed)

Cache.Bin: /mnt/c/Games/MetalRage Online/data/System/Cache.Bin (same file used in 2026-09-18-subordination)

## Body GameItemRecord pairs per mech (offset, ItemIndex=RepresentIndex, HighGroup, MiddleGroup, LowGroup, DetailGroup)
11100101: off=0x2294 HighGroup=1 MiddleGroup=1 LowGroup=1 DetailGroup=1
11200101: off=0x2565 HighGroup=1 MiddleGroup=1 LowGroup=2 DetailGroup=0
12100101: off=0x27cf HighGroup=1 MiddleGroup=2 LowGroup=1 DetailGroup=0
12200101: off=0x2aa0 HighGroup=1 MiddleGroup=2 LowGroup=2 DetailGroup=0
13100101: off=0x2d0a HighGroup=1 MiddleGroup=3 LowGroup=1 DetailGroup=0
13200101: off=0x2fdb HighGroup=1 MiddleGroup=3 LowGroup=2 DetailGroup=0
14200101: off=0x3245 HighGroup=1 MiddleGroup=4 LowGroup=2 DetailGroup=0
14300101: off=0x3516 HighGroup=1 MiddleGroup=4 LowGroup=2 DetailGroup=0
15200101: off=0x3780 HighGroup=1 MiddleGroup=5 LowGroup=2 DetailGroup=0
15300101: off=0x3a51 HighGroup=1 MiddleGroup=5 LowGroup=3 DetailGroup=0
16200101: off=0x3cbb HighGroup=1 MiddleGroup=6 LowGroup=2 DetailGroup=0
16300101: off=0x3f8c HighGroup=1 MiddleGroup=6 LowGroup=3 DetailGroup=0
17100101: off=0x41f6 HighGroup=1 MiddleGroup=7 LowGroup=1 DetailGroup=0
17200101: off=0x44c7 HighGroup=1 MiddleGroup=7 LowGroup=2 DetailGroup=0
18100101: off=0x4731 HighGroup=1 MiddleGroup=8 LowGroup=1 DetailGroup=0
18200101: off=0x4a02 HighGroup=1 MiddleGroup=8 LowGroup=2 DetailGroup=0

Found via: search for int32 LE item_id, took the offset where the same value repeats
4 bytes later (RepresentIndex==ItemIndex self-reference, matches known pattern for
mech 1 at 0x2294 from prior subordination README), then read struct per confirmed
FGameItemRecord layout (Engine.dll 0x1032d090, see 2026-09-18-subordination/README.md).

## DefaultSetList rows (Cache offset, Mech, Level, WeaponMain, SubL, SubR, Booster, Skin)
0x37456: 11100101, 1, 22100101, 32100101, 31100101, 41100101, 61101001
0x3748e: 11200101, 1, 22100101, 32100101, 31100101, 41100101, 61100201
0x374aa: 11200101, 2, 22100101, 32100101, 31100101, 41100101, 61100201

## FSubordinationRecord rows with SubordinationSort==1 (special/exact-mech-only), full list
0x38d10 61100101 sort=1 SubordinationIndex=12100101
0x38d2c 61100201 sort=1 SubordinationIndex=11200101
0x38d48 61100301 sort=1 SubordinationIndex=12200101
0x38d64 61100401 sort=1 SubordinationIndex=13200101
0x38d80 61100501 sort=1 SubordinationIndex=14300101
0x38d9c 61100601 sort=1 SubordinationIndex=15300101
0x38db8 61100701 sort=1 SubordinationIndex=16300101
0x38dd4 61100801 sort=1 SubordinationIndex=17200101
0x38df0 61100901 sort=1 SubordinationIndex=18200101
0x38e0c 61101001 sort=1 SubordinationIndex=11100101
(these are the only 10 SubordinationSort==1 rows in the 204-row table; all HighGroup 6 = skin items)

## ZPage_Hangar.uc:1544-1552 ShopBuy() license gate (exact source)
    // 기간제 레전드 기체일 경우 라이센스가 있는지 여부를 체크한다.
    if( m_Item.HighGroup == 1 )
    {
        if( class'ZNetwork.ZNetwork_DJ'.static.Mech_License_Check( m_Item.MiddleGroup ) == 0 )
        {
            ZGUIController( Controller ).NotifyPageOpen( "CANNOT_BUY_MECH_LICENSE" );
            return;
        }
    }

## ZNetwork_DJ.uc SLOT_DETAIL_INFO.IsLicense (line 234)
    var int IsLicense; // 라이센스가 있는지 ( 0: 없음, 1:튜토리얼획득, 2:Item구매)

Mech_License_Check(MechType) at ZNetwork_DJ.uc:1286 returns
default.m_MySlot[MechType-1].IsLicense. Population opcode not identified (native field,
no dispatch-map.py hit for "licen*" — not resolved in this pass).
