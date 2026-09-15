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

---

## 4. Reverse Engineering `User_Default_SN` (0x00220233) and `Room_User_Add`

### 4.1 Handler Function and Entry Point

- **Export Name:** `?User_Default_SN@ZDispatchRoom@@QAEXPAUFormat@System@Share@@PAD@Z`
- **Export Thunk:** `0x1070979B` -> Target Function: `0x107EE2D0`
- **Target Function invoked:** `?Room_User_Add@UZNetwork_DJ@@QAEXHHHHHPBGHHH0@Z` (VA `0x107339E0`)

### 4.2 Packet Body Structure of SN_USER_DEFAULT (0x220233)

Disassembly of `0x107EE360` to `0x107EE4F6`:
- `body[0x00]`: `uint8` (1 byte, Status, must be 0)
- `body[0x01]`: `uint8` (1 byte, `userCount`, loop limit)

Followed by `userCount` records of **52 bytes (0x34)** each:

```x86
0x107EE3B8: push 0x34                    ; Record size = 52 bytes
0x107EE3BA: lea  eax, [esp + 0x5c]       ; Stack destination buffer
0x107EE3BE: push esi                     ; Current entry pointer in body
0x107EE3BF: push eax
0x107EE3C0: call memcpy                  ; Copy 52 bytes
0x107EE3C8: add  esi, 0x34               ; Advance pointer to next user entry
```

#### Detailed Field Map of the 52-byte (0x34) User Entry:

| Entry Offset | Body Offset (1st user) | Type | Size | Read Instruction | Description & Conversion | Parameter in `Room_User_Add` |
| :---: | :---: | :---: | :---: | :--- | :--- | :--- |
| `0x00` | `0x02` | `uint16 LE` | 2 bytes | `movzx ecx, word ptr [esp+0x58]` | **UserIndex** (Account / Slot Index) | **Arg 1** (`[user + 0x00]`) |
| `0x02` | `0x04` | `uint32 LE` | 4 bytes | `mov ebx, dword ptr [esp+0x5a]` | **PilotID** (Character Pilot ID, e.g. 101) | **Arg 8** (`[user + 0x38]`) |
| `0x06` | `0x08` | `ASCII string` | 2 bytes | `lea edx, [esp+0x5e]; call atoi` | **UserLevelText** (ASCII numeric e.g. `"1\0"`), parsed by `atoi()` | **Arg 2** (`[user + 0x10]`) |
| `0x08` | `0x0A` | `uint32 LE` | 4 bytes | `mov eax, dword ptr [esp+0x64]` | **UserHidden / Score** (Score or rating) | **Arg 3** (`[user + 0x14]`) |
| `0x0C` | `0x0E` | `uint8` | 1 byte | `movzx eax, byte ptr [esp+0x68]` | **UserLevelType** (Mapped: 2..8 -> 2..8, else 1) | **Arg 4** (`[user + 0x18]`) |
| `0x0D` | `0x0F` | `uint32 LE` | 4 bytes | `mov ecx, dword ptr [esp+0x65]` | **UserStateRaw** (User status flags) | **Arg 5** (`[user + 0x1C]`) |
| `0x11` | `0x13` | `uint16 LE` | 2 bytes | `movzx ebp, word ptr [esp+0x69]` | **TeamIndex** (**0 = Red, 1 = Blue**) | **Arg 7 (`[user + 0x34]`)** |
| `0x13` | `0x15` | `uint32 LE` | 4 bytes | `mov eax, dword ptr [esp+0x6b]` | **UserRank / SubState** (Mapped: 2..8 -> 1..5, else 0) | **Arg 9** (`[user + 0x3C]`) |
| `0x17` | `0x19` | `uint32 LE` | 4 bytes | `mov eax, dword ptr [esp+0x6f]` | **ClanID / PackedIP** (Passed to clan badge lookup `0x107ea2d0`) | Resolves **Arg 10** Clan string |
| `0x1B` | `0x1D` | `ASCII string` | 25 bytes| `lea edx, [esp+0x73]; call winToUNICODE` | **Nickname** (ASCII null-terminated, max 25 chars) | **Arg 6** (`[user + 0x04]`, `wchar_t*`) |

> [!IMPORTANT]
> **Nickname Encoding Confirmation:**  
> The nickname field in `SN_USER_DEFAULT` is **ASCII / MBCS**, NOT UTF-16LE.  
> At `0x107EE48F`, the client calls `Core.dll!?winToUNICODE@@YAPAGPAGPBDH@Z`, which takes the ASCII string from `entry + 0x1B` (`body + 0x1D`) and converts it into a UTF-16 (`wchar_t*`) string on the stack before passing it as Arg 6 to `Room_User_Add`.

### 4.3 10 Parameters of `Room_User_Add` (VA `0x107339E0`)

Signature: `void Room_User_Add(int userIndex, int level, int hiddenScore, int levelType, int stateRaw, const wchar_t* nickname, int teamIndex, int pilotId, int rank, const wchar_t* clanName)`

Assembly destination inside user record (stride = `0x50` / `0x80`):
- `[user + 0x00] = userIndex` (Arg 1)
- `[user + 0x04] = FString(nickname)` (Arg 6)
- `[user + 0x10] = level` (Arg 2)
- `[user + 0x14] = hiddenScore` (Arg 3)
- `[user + 0x18] = levelType` (Arg 4)
- `[user + 0x1C] = stateRaw` (Arg 5)
- `[user + 0x34] = teamIndex` (**Arg 7** — Used by `Game_User_Team_Get`)
- `[user + 0x38] = pilotId` (Arg 8)
- `[user + 0x3C] = rank` (Arg 9)
- `[user + 0x40] = FString(clanName)` (Arg 10)

---

## 5. How "Room Master" and "Team Assignment" are Decided

### 5.1 Room Master (房主) Determination

In `UZNetwork_DJ`, whether the player is the Room Master is evaluated by `Room_Master_Check` (VA `0x10718D10`):
```x86
0x10718D10: mov edx, [ecx + 0x44c]  ; edx = Local User Index (Account ID / Slot)
0x10718D17: mov esi, [ecx + 0xf74]  ; esi = Room Master Index
0x10718D1F: cmp edx, esi
0x10718D24: sete al                 ; Returns true (1) if Local User == Master Index
0x10718D26: ret
```

**Where `[ecx + 0xf74]` is set:**
- There is only one place in `ZNetwork.dll` that writes to `[ecx + 0xf74]`: `UZNetwork_DJ::Room_Master_Set` (VA `0x10718E70`).
- `Room_Master_Set` is called by **`User_Master_SN` (opcode `0x00220319`)** at VA `0x107EADD7`:
  - `User_Master_SN` body layout:
    - Offset `0x00`: `uint16 LE` `userIndex` (The master's user index)
    - Offset `0x02`: `uint32 LE` `state`
- Therefore, to designate the local player as the room master, the server must send `SN_USER_MASTER` (`0x00220319`) with `userIndex = accountIndex`.

### 5.2 Team Assignment & Why `team=255` Occurred

In `UZNetwork_DJ::Game_User_Team_Get` (VA `0x1072d3a0`):
```x86
0x1072d3ab: mov eax, 0xff                      ; Default return = 255 (Unassigned)
0x1072d3c1: cmp [edi], ebp                     ; Find local user by UserIndex
0x1072d3c3: je  found_user
; --- User Found ---
0x1072d3d7: mov eax, dword ptr [ecx + 0xff0]   ; eax = Red Team reference index
0x1072d3e0: mov edx, dword ptr [user + 0x34]   ; edx = User's TeamIndex (from SN_USER_DEFAULT Arg 7)
0x1072d3e4: cmp eax, edx
0x1072d3eb: je  return_0                       ; MATCH! Return 0 (RED TEAM)
0x1072d3f1: mov edi, dword ptr [ecx + 0xff4]   ; edi = Blue Team reference index
0x1072d3f9: cmp edi, edx
0x1072d3fb: je  return_1                       ; MATCH! Return 1 (BLUE TEAM)
; If neither matches, returns 255!
```

**Where `[ecx + 0xff0]` and `[ecx + 0xff4]` are initialized:**
- They are populated when the client receives **`Game_Info_SN` (opcode `0x00222111`)**:
  - In `ZDispatchWaiting::Game_Info_SN` (VA `0x107F0949`):
    - `[packet + 0x14]` (body `0x04`, `uint16 LE`): `RedTeamIndex` -> stored in `[ecx + 0xffc]` -> copied to `[ecx + 0xff0]`
    - `[packet + 0x16]` (body `0x06`, `uint16 LE`): `BlueTeamIndex` -> stored in `[ecx + 0x1000]` -> copied to `[ecx + 0xff4]`
- If `Game_Info_SN` is not received before game start, or if `SN_USER_DEFAULT`'s `teamIndex` does not match `RedTeamIndex`, `Game_User_Team_Get` returns `255`!

---

## 6. Discrepancy Analysis with `room-user.sender.js`

Comparing `room-user.sender.js` with the binary disassembly of `0x107EE2D0`:

### Current Code in `room-user.sender.js`:
```javascript
const [msg, respBody] = getExactMessageBuffer(SN_USER_DEFAULT, 0x36);
respBody.writeUint8(0, 0x00);
respBody.writeUint8(1, 0x01);
respBody.writeUint16LE(accountIndex, 0x02);
respBody.writeUint32LE(pilotId, 0x04);
respBody.write(userLevelText + '\0', 0x08, 'ascii');
respBody.writeUint32LE(userHiddenRaw >>> 0, 0x0E); // <-- BUG 1: WROTE AT 0x0E
respBody.writeUint8(userLevelType, 0x12);          // <-- BUG 2: WROTE AT 0x12
respBody.writeUint16LE(teamIndex, 0x13);           // <-- BUG 3: WROTE AT 0x13
respBody.writeUint32LE(userStateRaw, 0x15);        // <-- BUG 4: WROTE AT 0x15
respBody.writeUint32LE(packedIp, 0x19);            // <-- BUG 5: WROTE AT 0x19
respBody.write(nickname + '\0', 0x1D, 'ascii');
```

### Exact Defects Identified:

1. **Gap Bug at `0x0A` (`Entry + 0x08`)**:
   - `userLevelText + '\0'` was written at `0x08` (2 bytes, occupying `0x08` and `0x09`).
   - The next write jumped directly to `0x0E`!
   - Bytes `0x0A`, `0x0B`, `0x0C`, `0x0D` were left unwritten (zeros).
   - In `ZNetwork.dll`, offset `0x0A` (`Entry + 0x08`) is read as **Arg 3 (`uint32 LE`)**. It was reading 0!
2. **Field Misalignment from `0x0E` to `0x13`**:
   - `userHiddenRaw` was written at `0x0E` as a 4-byte `uint32 LE` (`0x0E..0x11`).
   - In `ZNetwork.dll`, offset `0x0E` (`Entry + 0x0C`) is `userLevelType` (`uint8`, 1 byte)!
   - And offset `0x0F` (`Entry + 0x0D`) is `userStateRaw` (`uint32 LE`, 4 bytes)!
   - Writing `userHiddenRaw` at `0x0E` corrupted both `userLevelType` and `userStateRaw`.
3. **`teamIndex` Offset Mismatch**:
   - In `ZNetwork.dll`, `TeamIndex` is read at `Entry + 0x11` = **`body + 0x13` (`uint16 LE`)**.
   - Because `userHiddenRaw` (4 bytes) was at `0x0E` and `userLevelType` was written at `0x12`, writing `teamIndex` at `0x13` actually placed it at the correct body offset `0x13`, but because the preceding fields were shifted, the entire struct was inconsistently populated.

### Correct Implementation for `room-user.sender.js`:

```javascript
const [msg, respBody] = getExactMessageBuffer(SN_USER_DEFAULT, 0x36);
// Header (2 bytes)
respBody.writeUint8(0, 0x00);
respBody.writeUint8(1, 0x01);

// User Entry 1 (52 bytes = 0x34)
respBody.writeUint16LE(accountIndex, 0x02);          // 0x00: UserIndex (uint16 LE)
respBody.writeUint32LE(pilotId, 0x04);               // 0x02: PilotID (uint32 LE)
respBody.write(userLevelText + '\0', 0x08, 'ascii'); // 0x06: UserLevel ASCII string (null-terminated)
respBody.writeUint32LE(userHiddenRaw >>> 0, 0x0A);   // 0x08: UserHidden/Score (uint32 LE) - WAS WRITTEN AT 0x0E!
respBody.writeUint8(userLevelType, 0x0E);            // 0x0C: UserLevelType (uint8) - WAS WRITTEN AT 0x12!
respBody.writeUint32LE(userStateRaw, 0x0F);          // 0x0D: UserStateRaw (uint32 LE) - WAS WRITTEN AT 0x15!
respBody.writeUint16LE(teamIndex, 0x13);             // 0x11: TeamIndex (uint16 LE, 0=Red, 1=Blue)
respBody.writeUint32LE(0, 0x15);                     // 0x13: UserRank/SubState (uint32 LE)
respBody.writeUint32LE(packedIp, 0x19);              // 0x17: ClanID / IP (uint32 LE)
respBody.write(nickname + '\0', 0x1D, 'ascii');      // 0x1B: Nickname ASCII string (max 25 bytes)
```

---

## 7. Summary of Changes Needed to Fix Battle Travel URL

1. **`SN_ROOM_DEFAULT` (`0x220203`) in `room-state.sender.js` / `room.dispatch.js`**:
   - Write real **Map ID** (e.g. `1011` for Map_C08, `9001` for Map_PC01) into offset `0x05` (`mapIndex`).
2. **`SN_USER_DEFAULT` (`0x220233`) in `room-user.sender.js`**:
   - Align offsets according to Section 6 table:
     - `userHiddenRaw` at `0x0A`
     - `userLevelType` at `0x0E`
     - `userStateRaw` at `0x0F`
     - `teamIndex` at `0x13`
3. **`Game_Info_SN` (`0x00222111`)**:
   - Ensure `RedTeamIndex = 0` (body `0x04`) and `BlueTeamIndex = 1` (body `0x06`) are sent prior to game start so `Game_User_Team_Get` evaluates `team = 0`.
4. **`SN_USER_MASTER` (`0x00220319`) in `room-user.sender.js`**:
   - Keep sending with `userIndex = accountIndex` so `Room_Master_Check` evaluates the player as Host.
