# Metal Rage Online - Battle Map, GameInfo, and Travel URL Investigation Findings

**Date:** 2026-09-15  
**Target Client:** `/mnt/c/Games/MetalRage Online/`  
**Server Emulator:** `/home/lucas/mro-reverse/`  

---

## 1. GameInfo Class Names Found

All GameInfo classes are stored in the client database `/mnt/c/Games/MetalRage Online/data/System/Cache.Bin`, loaded into memory via `Engine.dll!UCacheManager::LoadAnotherFile_BD` (offset `0x1051AC`, VA `0x104051AC`).

Each map definition in `Cache.Bin` (Table 1, starting at offset `0x000001` with compact index count = 42) is serialized using `Engine.dll!0x1032CA40` (`FArchive& operator<<(FArchive&, FMapEntry&)`). The struct size in memory is `0xBC` (188 bytes), storing 33 fields.

### Complete List of `<Package>.<Class>` GameInfo Classes

| Mode Type | UnrealScript Class (`<Package>.<Class>`) | Evidence Source | Example Maps |
| :--- | :--- | :--- | :--- |
| **訓練模式 (Training/Hangar)** | `ZModeHangar.HangarGameInfo` | [CACHE.BIN] Offset `0x000049`, [CLIENTLOG] | `Store_01` (ID: 0) |
| **死鬥模式 (Team Deathmatch)** | `Zgame.ZTeamDM` | [CACHE.BIN] Offset `0x000185`, [INI] `Default.ini` | `Map_C08`, `Map_C06`, `Map_C01`, `Map_N05_de`, `Desert`, `Map_N01`, `Map_C20`, `Map_N17` |
| **占領任務 (Occupation)** | `ZmodeOccupation.OccupationMission` | [CACHE.BIN] Offset `0x00088A`, [INI] `GameMode.ini` | `Map_N03`, `Map_N07`, `Map_C21` |
| **BOSS任務 (Boss Mode)** | `ZmodeBot.BossMission` | [CACHE.BIN] Offset `0x000B29`, [INI] `GameMode.ini` | `Map_C09` (D-Day) |
| **奪取任務 (Capture)** | `ZmodeCapture.CaptureMission` | [CACHE.BIN] Offset `0x000BFB`, [INI] `GameMode.ini` | `Map_N05`, `Map_C03` |
| **爆破任務 (Demolition/Blow)** | `ZmodeBlow.BlowMission` | [CACHE.BIN] Offset `0x000CCD`, [INI] `GameMode.ini` | `Map_N13`, `Map_C04`, `Map_C02`, `Map_C18`, `Map_RC02` |
| **殊死戰 (Sudden Death)** | `ZmodeSuddenDeath.SuddenDeathMission` | [CACHE.BIN] Offset `0x0010E8` | `Map_C05`, `Map_C19`, `Map_C22`, `Map_C25`, `Map_C30` |
| **憤怒模式 (Rage Mode)** | `ZModeRage.RageMission` | [CACHE.BIN] Offset `0x0014D8`, [INI] `GameMode.ini` | `Map_N11`, `Map_N01_R`, `Map_C08_R` |
| **協力模式 - 奪取 (PvE Standard)** | `ZModePve.ZModePve` | [CACHE.BIN] Offset `0x00179E` | `Map_PC01` (ID: 9001-9003), `Map_PC03` (ID: 9004-9006) |
| **協力模式 - 防衛 (PvE Escort)** | `ZModeEscortPve.ZModeEscortPve` | [CACHE.BIN] Offset `0x001C6A`, [INI] `ZController.ini` | `Map_PC02` (ID: 9007-9009) |
| **協力模式 - 潛入 (PvE Core)** | `ZModePve.ZSetCoreModePve` | [CACHE.BIN] Offset `0x001ED2`, [INI] `ZController.ini` | `Map_PC04` (ID: 9010-9012) |

---

## 2. Complete Map -> Game Mode -> Class Table

All 42 records directly parsed from Table 1 of `Cache.Bin`:

| Index | Map ID | Map Package (`MapExt=tzp`) | Localized Title | Game Mode Name | GameInfo Class | Default Goal | Default Time |
| :---: | :---: | :--- | :--- | :--- | :--- | :---: | :---: |
| 0 | 0 | `Store_01` | 訓練基地 | 訓練模式 | `ZModeHangar.HangarGameInfo` | 0 | 0 |
| 1 | 101 | `Map_Ptuto` | Ptuto | (Tutorial) | *(None)* | 0 | 0 |
| 2 | 1011 | `Map_C08` | 十字路口 | 死鬥模式 | `Zgame.ZTeamDM` | 150 | 20 |
| 3 | 102 | `Map_Ptuto2` | Ptuto2 | (Tutorial 2) | *(None)* | 0 | 0 |
| 4 | 1021 | `Map_C06` | 太空基地 | 死鬥模式 | `Zgame.ZTeamDM` | 150 | 20 |
| 5 | 1031 | `Map_C01` | 失落城市 | 死鬥模式 | `Zgame.ZTeamDM` | 150 | 20 |
| 6 | 1041 | `Map_N05_de` | D黃金艙門 | 死鬥模式 | `Zgame.ZTeamDM` | 150 | 20 |
| 7 | 1051 | `Desert` | 沙漠風暴 | 死鬥模式 | `Zgame.ZTeamDM` | 150 | 20 |
| 8 | 1061 | `Map_N01` | 沙丘魔堡 | 死鬥模式 | `Zgame.ZTeamDM` | 150 | 20 |
| 9 | 1071 | `Map_C20` | 落日大道 | 死鬥模式 | `Zgame.ZTeamDM` | 150 | 20 |
| 10 | 1081 | `Map_N17` | GLEN | 死鬥模式 | `Zgame.ZTeamDM` | 150 | 20 |
| 11 | 2001 | `Map_N03` | 月六區 | 占領任務 | `ZmodeOccupation.OccupationMission` | 0 | 4 |
| 12 | 2011 | `Map_N07` | 廢武處理場 | 占領任務 | `ZmodeOccupation.OccupationMission` | 0 | 4 |
| 13 | 2031 | `Map_C21` | 邊境之都 | 占領任務 | `ZmodeOccupation.OccupationMission` | 0 | 4 |
| 14 | 4011 | `Map_C09` | D-Day | BOSS任務 | `ZmodeBot.BossMission` | 0 | 10 |
| 15 | 5011 | `Map_N05` | 黃金艙門 | 奪取任務 | `ZmodeCapture.CaptureMission` | 10 | 15 |
| 16 | 6001 | `Map_N13` | 北極地帶 | 爆破任務 | `ZmodeBlow.BlowMission` | 2 | 4 |
| 17 | 6011 | `Map_C04` | 幻像基地 | 爆破任務 | `ZmodeBlow.BlowMission` | 2 | 4 |
| 18 | 6021 | `Map_C02` | 海艦基地 | 爆破任務 | `ZmodeBlow.BlowMission` | 2 | 4 |
| 19 | 6031 | `Map_C18` | 廢棄城市 | 爆破任務 | `ZmodeBlow.BlowMission` | 2 | 4 |
| 20 | 6041 | `Map_RC02` | 鐵都要塞 | 爆破任務 | `ZmodeBlow.BlowMission` | 2 | 4 |
| 21 | 7011 | `Map_C05` | 衛星基地 | 殊死戰 | `ZmodeSuddenDeath.SuddenDeathMission` | 2 | 3 |
| 22 | 7012 | `Map_C19` | 秘密基地 | 殊死戰 | `ZmodeSuddenDeath.SuddenDeathMission` | 2 | 3 |
| 23 | 7013 | `Map_C22` | 神聖之鎮 | 殊死戰 | `ZmodeSuddenDeath.SuddenDeathMission` | 2 | 3 |
| 24 | 7014 | `Map_C25` | 塞外基地 | 殊死戰 | `ZmodeSuddenDeath.SuddenDeathMission` | 2 | 3 |
| 25 | 7015 | `Map_C30` | 海港城 | 殊死戰 | `ZmodeSuddenDeath.SuddenDeathMission` | 2 | 3 |
| 26 | 8001 | `Map_N11` | 沙坑碉堡 | 憤怒模式 | `ZModeRage.RageMission` | 0 | 30 |
| 27 | 8002 | `Map_N01_R` | R沙丘魔堡 | 憤怒模式 | `ZModeRage.RageMission` | 0 | 30 |
| 28 | 8003 | `Map_C08_R` | R十字路口 | 憤怒模式 | `ZModeRage.RageMission` | 0 | 30 |
| 29 | 9001 | `Map_PC01` | 動力奪取戰(易) | 協力模式 | `ZModePve.ZModePve` | 5 | 60 |
| 30 | 9002 | `Map_PC01` | 動力奪取戰(中) | 協力模式 | `ZModePve.ZModePve` | 8 | 60 |
| 31 | 9003 | `Map_PC01` | 動力奪取戰(難) | 協力模式 | `ZModePve.ZModePve` | 10 | 60 |
| 32 | 9004 | `Map_PC03` | 援救基地戰(易) | 協力模式 | `ZModePve.ZModePve` | 5 | 60 |
| 33 | 9005 | `Map_PC03` | 援救基地戰(中) | 協力模式 | `ZModePve.ZModePve` | 8 | 60 |
| 34 | 9006 | `Map_PC03` | 援救基地戰(難) | 協力模式 | `ZModePve.ZModePve` | 10 | 60 |
| 35 | 9007 | `Map_PC02` | 防衛作戰(易) | 協力模式 | `ZModeEscortPve.ZModeEscortPve` | 5 | 60 |
| 36 | 9008 | `Map_PC02` | 防衛作戰(中) | 協力模式 | `ZModeEscortPve.ZModeEscortPve` | 8 | 60 |
| 37 | 9009 | `Map_PC02` | 防衛作戰(難) | 協力模式 | `ZModeEscortPve.ZModeEscortPve` | 10 | 60 |
| 38 | 9010 | `Map_PC04` | 潛入作戰(易) | 協力模式 | `ZModePve.ZSetCoreModePve` | 5 | 60 |
| 39 | 9011 | `Map_PC04` | 潛入作戰(中) | 協力模式 | `ZModePve.ZSetCoreModePve` | 8 | 60 |
| 40 | 9012 | `Map_PC04` | 潛入作戰(難) | 協力模式 | `ZModePve.ZSetCoreModePve` | 10 | 60 |
| 41 | 5012 | `Map_C03` | 掠奪戰場 | 奪取任務 | `ZmodeCapture.CaptureMission` | 10 | 15 |

---

## 3. Disassembly Analysis: URL Assembly in ZNetwork.dll

Through static disassembly of `ZNetwork.dll`, the native function assembling the ClientTravel URL was identified as `UZNetwork_DJ::Game_Info_URL_Get` at VA `0x10733cf0` (invoked by UnrealScript native `execGame_URL_Get` at VA `0x10734610`).

### 3.1 Exact Format Strings Extracted from Binary

Directly dumped from `ZNetwork.dll` data section:

1. **Host / Room Master URL** (VA `0x10814A50`, UTF-16LE):
   ```text
   start %s?Listen?LPort=%d?Name=%d?Game=%s?MaxPlayers=%d?GoalScore=%d?TimeLimit=%d?BalanceTeams=0?numbots=0?team=%d
   ```
   > **Note:** `BalanceTeams=0` and `numbots=0` are **hardcoded literal substrings** in the format string itself. They are not dynamic format specifiers!

2. **Client / Guest Connect URL** (VA `0x10814B28`, UTF-16LE):
   ```text
   start %s:%d/%s?team=%d
   ```

### 3.2 Root Cause of the Map & GameInfo Fallback Crash

Disassembly of `UZNetwork_DJ::Game_Info_URL_Get` (VA `0x10733cf0`):
```x86
0x10733d20: call dword ptr [0x1091ba60]  ; UCacheManager::GetCache()
0x10733d26: mov  ebx, eax                ; ebx = UCacheManager instance
0x10733d30: mov  ecx, [ebx + 0x84]       ; Table 1 entry count (42)
0x10733d3c: mov  eax, [ebx + 0x80]       ; Table 1 array pointer (stride = 0xBC)
0x10733d42: mov  edx, [esi + 0xfc8]      ; edx = [UZNetwork_DJ + 0xfc8] (Target Map)
0x10733d48: cmp  [eax], edx              ; Compare: entry->MapID == [esi + 0xfc8]
0x10733d4a: je   0x10733d88              ; Match found!
0x10733d4d: add  eax, 0xbc               ; Advance to next FMapEntry
0x10733d52: cmp  edi, ecx
0x10733d54: jl   0x10733d48
; --- MATCH FAILED ---
0x10733d56: push 0x108149dc              ; "Failed - MapIndex : %d"
0x10733d64: call LogWarning
```

**Why it failed:**
- The engine developer named the debug format string `"Failed - MapIndex : %d"`, but the assembly instruction `cmp [eax], edx` compares directly against `entry[0]`, which is the **Map ID** (e.g. `1011`, `1031`, `9001`).
- The server emulator in `room.dispatch.js:1167` was sending:
  `mapIndex = Math.min(Math.max(Number(mapId) || 1, 1), 6);` (sent as `5`).
- In Table 1 of `Cache.Bin`, there is **no map with Map ID = 5** (valid IDs are `0, 101, 102, 1011, 1021, ...`).
- When the lookup fails, `Game_Info_URL_Get` leaves the URL empty. The GUI script (`ZPage_Room.uc`) then activates its safety fallback: it queries the currently loaded Level (`Store_01`), its GameInfo (`ZModeHangar.HangarGameInfo`), and neutral team (`255`).
- Loading `Store_01` while already inside `Store_01` triggers `Actor not found: HangarPlayerController` and crashes the Unreal engine.

### 3.3 Successful Lookup Behavior
When `[esi + 0xfc8]` matches a valid Map ID:
- `eax + 0x20` (`FMapEntry.str_mapname`) is loaded into `%s` (e.g. `Map_C08`, `Map_PC01`).
- `eax + 0x54` (`FMapEntry.str_gameinfo`) is loaded into `Game=%s` (e.g. `Zgame.ZTeamDM`, `ZModePve.ZModePve`).

### 3.4 Root Cause of `team=255`

In `UZNetwork_DJ::Game_Info_URL_Get`:
```x86
0x10733e05: mov  edi, [esi + 0x44c]      ; Local player user/slot index
0x10733e11: push edi
0x10733e12: mov  ecx, esi                ; this = UZNetwork_DJ
0x10733e14: call 0x107024d7              ; Game_User_Team_Get(slot)
```

Disassembly of `?Game_User_Team_Get@UZNetwork_DJ@@QAEHH@Z` (VA `0x1072d3a0`):
```x86
0x1072d3a1: mov  esi, [ecx + 0x1038]     ; Room user count
0x1072d3ab: mov  eax, 0xff               ; Default return value = 0xFF (255)
0x1072d3b0: jle  return_255              ; If count <= 0, return 255
0x1072d3b3: mov  ebx, [ecx + 0x1034]     ; User array pointer (stride = 0x80)
0x1072d3c1: cmp  [edi], ebp              ; Find user by account/slot ID
0x1072d3c3: je   found_user
; --- User Found ---
0x1072d3d7: mov  eax, [ecx + 0xff0]      ; Red Team ID reference
0x1072d3e0: mov  edx, [user + 0x34]      ; User assigned team/clan
0x1072d3e4: cmp  eax, edx
0x1072d3e6: jne  check_blue
0x1072d3eb: xor  eax, eax                ; Team 0 (RED)
0x1072d3ee: ret  4
check_blue:
0x1072d3f1: mov  edi, [ecx + 0xff4]      ; Blue Team ID reference
0x1072d3f9: cmp  edi, edx
0x1072d3fb: setne al
0x1072d407: add  eax, 0xff               ; Returns 1 (BLUE) if matched, else 255
0x1072d40d: ret  4
```
- If the local user is not found in the room user array or their team is unassigned, `Game_User_Team_Get` returns `255`.
- Once `SN_USER_DEFAULT` (`0x220233`) correctly associates the local user with the matching team reference, `Game_User_Team_Get` returns `0` (Red Team).

---

## 4. Parameter Origin Table (Final)

| URL Parameter | DLL Assembly Source | Actual Value Provenance |
| :--- | :--- | :--- |
| `start %s` | `FMapEntry + 0x20` | Looked up in `Cache.Bin` by Map ID (`[esi + 0xfc8]`) |
| `?Listen` | Literal substring | Hardcoded in host format string at VA `0x10814A50` |
| `?LPort=%d` | `[esi + 0x388]` | Port from network configuration (30907) |
| `?Name=%d` | `[esi + 0x44c]` | Local user Account / Slot Index |
| `?Game=%s` | `FMapEntry + 0x54` | Looked up in `Cache.Bin` by Map ID (`[esi + 0xfc8]`) |
| `?MaxPlayers=%d`| `[esi + 0xfd4]` | Max players from `SN_ROOM_DEFAULT` offset `0x07` |
| `?GoalScore=%d` | `[esi + 0xfd8]` | Target score from `SN_ROOM_DEFAULT` offset `0x1C` |
| `?TimeLimit=%d` | `[esi + 0xfdc]` | Time limit from `SN_ROOM_DEFAULT` offset `0x1D` |
| `?BalanceTeams=0`| Literal substring | Hardcoded in host format string at VA `0x10814A50` |
| `?numbots=0` | Literal substring | Hardcoded in host format string at VA `0x10814A50` |
| `?team=%d` | `Game_User_Team_Get`| Returns `0` (Red) or `1` (Blue); `255` if unassigned |

---

## 5. Direct Action Items for Server Emulator

To fix the crash and have the client load into battle maps:

1. **Fix `SN_ROOM_DEFAULT` (0x220203) in `room-state.sender.js` and `room.dispatch.js`**:
   - Change `mapIndex` (offset `0x05`, uint16 LE) from 1~6 arbitrary clamp to the **real Map ID**:
     - PvP Deathmatch (十字路口): `1011` (`Map_C08`)
     - PvE Mission (動力奪取戰): `9001` (`Map_PC01`)
2. **Align `SN_USER_DEFAULT` (0x220233) in `room-user.sender.js`**:
   - Ensure the user record properly registers the local player with `team = 0` (Red Team), so `Game_User_Team_Get` returns `team=0`.
3. **Expected Result**:
   The client will assemble and execute the valid battle travel URL:
   ```text
   start Map_C08?Listen?LPort=30907?Name=1?Game=Zgame.ZTeamDM?MaxPlayers=8?GoalScore=150?TimeLimit=20?BalanceTeams=0?numbots=0?team=0
   ```
   and successfully load the battle map.
