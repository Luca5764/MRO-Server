# PvP 房開戰缺口：六題現況（中階 explorer，唯讀，🟡 未經跨公司審查）

任務來源：主力交辦，查「PvP 房開戰流程要補什麼才會通」。只回答六題，不提實作方案，不標 ✅／❌。
所有封包偏移凡是本檔引用者，均以 `tools/disasm.py at`／直接讀 DLL section 重新核對過（見各題內文標註），
未特別標「未重新核對」的既有引用一律沿用原始日誌的核對狀態。

---

## Q1. `Game_Info_SN 0x00222111` body 每個欄位是什麼

**送出端**：`dispatch/gate.game.dispatch.js:607-702`（`sendGameInfoSn`，單播）與 `:735-785`
（房間廣播版本，欄位寫法逐位元組相同）。

**客戶端解析端（本次重新用 `tools/disasm.py at 0x107d4f50 60` 核對，逐指令對齊）**：
`ZDispatchGame::Game_Info_SN`（thunk `0x107079af` → `0x107d4f50`）。反組譯裡所有欄位讀取都是
`[eax + (body_offset+0x10)]`（`eax`＝含 16 bytes header 的整包指標，`+0x10`＝body 起點），完全對上
`sendGameInfoSn` 註解列出的十個參數：

| body offset | 型別 | 用途 | 本次 disasm 核對 |
|---|---|---|---|
| `+0x00` | u32 | battle index → `[this+0xfc0]` | ✅ 對上（`eax+0x10`, mov esi） |
| `+0x04` | u16 | RedTeamIndex → `Game_Info_Team_Set` p1 → `[0xffc]`→`[0xff0]` | ✅ 對上（`eax+0x14`） |
| `+0x06` | u16 | BlueTeamIndex → `Game_Info_Team_Set` p2 → `[0x1000]`→`[0xff4]` | ✅ 對上（`eax+0x16`） |
| `+0x0A` | u16 | 未知，寫入 `[0xfe0]` | ✅ 對上（`eax+0x1a`），語意仍 ⬜ |
| `+0x0C` | u16 | 未知，寫入 `[0xfe4]` | ✅ 對上（`eax+0x1c`），語意仍 ⬜ |
| `+0x0E` | u8 | clanFlag → `[0xfc4]` bit0 | ✅ 對上（`eax+0x1e`） |
| `+0x0F` | u16（==2 才算數） | → `[0xfc4]` bit1 | ✅ 對上（`eax+0x1f`，`cmp word,2`） |
| `+0x11` | u16 | **MAP ID**（Cache.Bin 索引，不是 body+其他任何欄位）→ `[0xfc8]` | ✅ 對上（`eax+0x21`） |
| `+0x13` | u16 | TimeLimit（分鐘）→ `[0xfd4]` | ✅ 對上（`eax+0x23`） |
| `+0x15` | u8 | MapInfo.Round → `[0xfd0]` | ✅ 對上（`eax+0x25`） |
| `+0x16` | u16 | GoalScore（mode 0/1）→ `[0xfd8]` | ✅ 對上（`eax+0x26`） |
| `+0x18` | u16 | GoalScore（mode 5）→ `[0xfdc]` | ✅ 對上（`eax+0x28`） |

`[0xfd0]`/`[0xfd8]`/`[0xfdc]` 三選一由 `Game_Info_URL_Get` 依 `[0xfcc]`（mode，來自 Cache.Bin 的地圖項，**不是這個封包填的**）挑選，所以現行程式碼刻意三個都寫同一個值（`goalScore=0`）繞過去。

**結論**：`+0x11` 是唯一的 mapId 欄位，`+0x04`/`+0x06` 是 gameMode／隊伍相關（Red/Blue 隊伍索引，決定 `Game_User_Team_Get` 怎麼比對）。此欄位表本身跟 PvP／PvE 無關——它是通用結構，PvP 要用一樣可以送，缺的不是欄位本身，是 `campaignStarted_` 這一層閘門（見 Q4）與正確的 mapId 來源（見 Q2/Q3）。

---

## Q2. PvP 房的 mapId 從哪來？為什麼地圖清單是空的

**結論先講：地圖清單完全是客戶端資料（Cache.Bin ＋ 登入時快取），伺服器只送 Map ID，不送清單本身**——這點對 PvE／PvP 一樣。空清單不是「伺服器該送清單而沒送」，是另一條獨立的**帳號快取**沒被灌對資料。

### 房內有兩個獨立地圖 UI（H7 系列調查，`docs/journal/2026-09-19-1000-maplist-single-entry.md`）
1. `lb_MapList`（中間清單）：由 `Room_Map_Change_All_SN 0x00220226` 灌，只影響本地顯示，不影響能不能選圖。
2. `co_Map`／`ZPopup_MapSelect`（「選擇地圖」下拉與彈窗）：**這才是問題所在**。它的資料來源是
   `CacheManager.GetSortMapInfoList()`，過濾條件三個都要過：
   - `MapIndex >= 1000`；
   - **`Account_MapList_Check`**（`ZNetwork_DJ.uc:1093`）比對 `default.m_MapList[n].Index`——這份表**只**由登入時
     的 `MapInfo_SN 0x00210115` 填入；
   - `m_RoomType==PVE_GAME` 時要求 `MapType==9`；**`NORMAL_GAME`／`ATTACK_GAME` 時走另一組 MapType**
     （`ZPopup_MapSelect.uc:216-224`，Boss 用 `case 4: nMapType=4`）。

### 為什麼 PvE 現在能看到清單，PvP 還是空的
H7 系列已經把 PvE 這條路徑修通（`MAP_INFO_REAL_ID_MODE` 送真的 9001-9012 id ＋ `MAP_INFO_ON_GAME_LOGIN_MODE`
在 30907 登入時補送一次，`shots/mapselect-after-30907.png` ✅ [SHOT]）。**但 `MapInfo_SN` 至今只送過
`MAP_INFO_REAL_IDS = [9001..9012]` 這 12 筆**（`dispatch/map-info.sender.js:20`，全 repo grep 沒有第二個
清單），`m_MapList` 從來沒有任何一筆 TDM／Deathmatch 等 PvP map id（1011..1081）。也就是說：即使
`ZPopup_MapSelect` 對 PvP 房走的過濾分支條件成立，`Account_MapList_Check` 這一關永遠過不了，因為快取裡
根本沒有這些 id。**這是本次找到的、直接可解釋「PvP 選地圖沒有清單」的具體缺口，之前的日誌只停在「未查」。**

### 房型判定本身：重新用 disasm 核對，發現既有程式碼註解有誤（見 Q6 附帶說明）
`room.dispatch.js:1422-1434` 送 `Room_Default_SN body+4` 時附註解「raw 1 -> internal 2、raw 2 -> internal 1」，
本次用 `tools/disasm.py at 0x107ea4b5 40` 直接讀跳表（`0x107ea6d8`，6 個 dword）重新核對，結果跟註解**不一致**：

跳表輸入 `V = body+0x04`（`movzx eax,[ebx+0x14]; dec eax; cmp eax,5; ja default; jmp [eax*4+0x107ea6d8]`），
6 個 slot 依序指向 `{0x107ea4c6→2, 0x107ea4ea→0(default), 0x107ea4cf→1, 0x107ea4ea→0, 0x107ea4d8→3, 0x107ea4e1→4}`：

| 送出的 raw V | 客戶端 internal RoomType |
|---|---|
| 0 或 ≥7 | 0（NORMAL_GAME，fallback） |
| 1 | 2（PVE_GAME）—— 與既有日誌「raw1→2」一致 ✅ |
| 2 | **0（NORMAL_GAME）**——**跟 `room.dispatch.js:1429` 註解寫的「raw2→1」不同** |
| 3 | 1（CLAN_GAME） |
| 4 | 0（NORMAL_GAME） |
| 5 | 3（未知標籤） |
| 6 | 4（未知標籤） |

因為我方目前對 PvP 房送的正是 `rawRoomType_`（觀察到的值＝2，見 Q6），照這張重新核對過的表，
它其實會落在 `NORMAL_GAME(0)`——剛好是 `ZPopup_MapSelect.uc:216-224` 描述的「`NORMAL_GAME||ATTACK_GAME`」
分支需要的那個值之一，不是註解原本說的 `CLAN_GAME(1)`。**這代表房型轉換這一步本身大機率沒問題**，
真正的缺口收斂回上面那條「`MapInfo_SN` 從未送過 PvP map id」。`room.dispatch.js:1429` 那行舊註解建議請
高階核對後更正（不確定當時「送 2 看到 PvP 房殼」的觀察是否誤把 NORMAL_GAME 標記成了數字 1，或者觀察本身
沒問題只是隨手寫錯內部數值）。

---

## Q3. 合法的 PvP 地圖 id

來源：`docs/gemini-gameinfo-findings.md` 第 2 節（42 筆 Cache.Bin Table 1 全表，已被多篇後續日誌交叉引用，
未見矛盾）＋ `docs/research/2026-09-20-pve-modes-ui/notes.md`（MapType 列舉表）。

`ZPopup_RoomSet.uc:467` 的完整 MapType 列舉（0-9）：
`0:팀데스매치(TDM) 1:데스매치(Deathmatch) 2:점령1(Occupation1) 3:점령2(Occupation2) 4:보스(Boss) 5:탈취(Capture) 6:폭파(Blow) 7:서든데스(SuddenDeath) 8:레이지(Rage) 9:캠페인(Campaign/PvE)`

| Map ID 範圍 | 中文名稱 | GameInfo class | MapType | 屬於 |
|---|---|---|---|---|
| 1011,1021,1031,1041,1051,1061,1071,1081 | 十字路口／太空基地／失落城市／D黃金艙門／沙漠風暴／沙丘魔堡／落日大道／GLEN | `Zgame.ZTeamDM` | 0 TDM | **PvP（P1 TDM 需要的正是這 8 張）** |
| 2001,2011,2031 | 月六區／廢武處理場／邊境之都 | `ZmodeOccupation.OccupationMission` | 2/3 | PvP（占領） |
| 4011 | D-Day | `ZmodeBot.BossMission` | 4 | PvP（Boss，非本次範圍） |
| 5011,5012 | 黃金艙門／掠奪戰場 | `ZmodeCapture.CaptureMission` | 5 | PvP（奪取） |
| 6001,6011,6021,6031,6041 | 北極地帶／幻像基地／海艦基地／廢棄城市／鐵都要塞 | `ZmodeBlow.BlowMission` | 6 | PvP（爆破） |
| 7011-7015 | 衛星基地／秘密基地／神聖之鎮／塞外基地／海港城 | `ZmodeSuddenDeath.SuddenDeathMission` | 7 | PvP（殊死戰）——**Q6 觀察到的兩個房間預設地圖（7011）就是這一組** |
| 8001,8002,8003 | 沙坑碉堡／R沙丘魔堡／R十字路口 | `ZModeRage.RageMission` | 8 | PvP（憤怒） |
| 9001-9012 | 4 張 PvE 地圖各 3 難度 | `ZModePve.*`／`ZModeEscortPve.*` | 9 | PvE（已可玩） |

**TDM 專用的合法 id 就是 1011/1021/1031/1041/1051/1061/1071/1081** —— `room.dispatch.js:180` 已經定義
`MAP_IDS_PVP = [1011, 1021, 1031, 1041, 1051, 1061, 1071, 1081]`，但 **grep 全 repo 只有定義這一行，沒有任何
呼叫點使用它**（跟 `source-tables.md` 提到的 `SN_CAMPAIGN` 死常數是同一種「定義了但沒接上」狀態）。

---

## Q4. 開戰後四個步驟除了 `campaignStarted_` 還有沒有別的戰役專屬假設

逐一讀 `dispatch/gate.game.dispatch.js:787-871` 四個函式本體：

- **`scheduleGameWaitSnExperiment`**（:787-806）：閘門後只送 0-byte 的 `Game_Wait_SN`，沒有其他欄位依賴。**沒有額外假設**。
- **`schedulePostGameWaitReadyHost`**（:808-829）：閘門後呼叫 `sendReadyHostSq`（固定 6-byte 0/0 ACK，無額外假設）與
  `sendReadyHostSn`（見下）。
- **`scheduleGameInfoSnExperiment`**（:831-851）：閘門後呼叫 `sendGameInfoSn`（見下）。
- **`primeReadyHostHandshake`**（:853-871）：閘門後呼叫 `sendReadyHostSn`（見下）。

**`sendGameInfoSn`（:607-702）本身還有一個戰役限定假設，比 `campaignStarted_` 更隱蔽**：
mapId 這行——

```js
const mapId = Number(client.campaignMapCacheKey_ || CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID[client.mapId_] || client.mapId_ || 58) & 0xFFFF;
```

依賴 `client.campaignMapCacheKey_`，而這個欄位**只在 Create_CQ handler 裡被設過一次**（`gate.game.dispatch.js:1263-1267`）：

```js
const pickedMap = body.length >= 4 ? body.readUInt16LE(2) : 0;
client.campaignMapCacheKey_ = (pickedMap >= 9001 && pickedMap <= 9012)
    ? pickedMap : MAP_ID_DEFAULT_CAMPAIGN;   // 9001
```

**不論房型，只要 Create_CQ 帶的 MapIndex 不落在 9001-9012，一律退回 9001（PvE 地圖）**。也就是說：就算
`campaignStarted_` 的閘門被打開讓 PvP 房也能跑到 `sendGameInfoSn`，目前送出的 mapId **仍然會是 9001**（PvE
動力奪取戰），不是玩家實際建房時選的 TDM 地圖（例如觀察到的 7011）。這是一個**獨立於 `campaignStarted_`
的第二個 campaign-only 假設**，任務清單原本沒有提到。

**`sendReadyHostSn`（:446-458）同樣依賴 `client.campaignMapCacheKey_`**（`Number(client.campaignMapCacheKey_) || 58`），
所以同一個缺口會連帶影響 Ready_Host_SN 裡組出的 travel URL 地圖名（雖然 `MAP_ID_TO_MAP_NAME_GG` 表本身已經
包含 8 個 PvP 地圖名稱，`gate.game.dispatch.js:380-382`，但永遠拿不到對的 key）。

另外，`dispatch/room.dispatch.js:180` 定義的 `MAP_IDS_PVP` 從未被任何 mapId 決策路徑讀取（同 Q3），
所以「PvP 地圖清單」在程式碼裡其實**只存在常數定義，沒有接進 `campaignMapCacheKey_` 這條決策鏈**。

**`gameMode_` 的來源本身可疑，值得一併回報**：`campaignStarted_` 的第二、三個 OR 條件是
`gameMode_===4 || gameMode_===5`，而 `gameMode_` 的計算是
`gameMode = createWord4 & 0xFF`，`createWord4 = body.readUInt16LE(9)`（`gate.game.dispatch.js:1179-1185`）。
但 `docs/journal/2026-09-17-18-create-cq-map-difficulty.md`（已被高階 ✅ 核對）明確給出 Create_CQ body 的
逐欄位表：`+0x07..0x08 PlayKill`、`+0x09..0x0A PlayGoal`——**offset 9-10 是 PlayGoal，不是任何「GameMode」欄位**。
`gate.game.dispatch.js` 裡找不到任何 DLL 依據支持把這個位置當成 gameMode 讀。用真實封包核對
（見 Q6 的 hex dump）：所有已錄到的 Create_CQ 範例（PvE 與兩種 PvP）這個欄位全部是 `00 00`，
所以 `gameMode_===4||5` 這條路徑至今從未在真實資料裡觸發過——**`campaignStarted_` 事實上只由
`rawRoomType_===1` 決定，`gameMode_` 那兩個 OR 條件目前形同虛設，且其欄位語意本身也有疑點**。

---

## Q5. `Game_User_SN 0x00222112` 的 team 欄位

**位置**：`rec+0x02`（u16 LE），已由 `dispatch/room/room-game-user.sender.js:5-18,141-142` 的組語註解
（讀自真實 handler `0x107d8ae0`，非 Ghidra 推論）與 `docs/journal/2026-09-16-21-game-user-sn-record-layout-confirmed.md`
確認：`rec+0x02 u16 → Game_User_Add p7 → entry+0x34 ★ TEAM`。

**PvE 現在填什麼**：**固定 0**。三處都寫死：`gate.game.dispatch.js:498`、`:575`、
`:2044`（後者有明確註解 `// PvE all-red (design §2, R11); PvP team assignment is M4, out of scope here`）、
`room.dispatch.js:1456`。也就是每個成員都被標成隊伍 0（"全紅"），PvP 兩隊分派**尚未實作**，程式碼自己承認是
"M4，超出目前範圍"。

**核對 premises P3 的說法**（`docs/research/2026-09-21-d2-pvp/premises.md:14`：「team 欄跟隨我們送的
`Game_Info_SN`，不是固定 1／2，我們送 0／1 是對的」）：這句話講的是**另一件事**——它指的是
`docs/research/2026-09-21-moon-objective-protocol/verify-c-items.md` 第 2 項核對的「14-byte 目標分數記錄」
的 team 欄，跟 `Game_Score_Get`／`Game_Info_Team_Set` 這條鏈路比對，結論是**我們在 `Game_Info_SN` 送的
RedTeamIndex=0／BlueTeamIndex=1 是對的**（不是 Moon 說的 1/2，那是教學模式限定值），這條鏈的完整反組譯核對
（`Game_Score_Update→Game_Score_Get→[+0xff0]/[+0xff4]←Game_Play_Start←[+0xffc]/[+0x1000]←Game_Info_Team_Set←
Game_Info_SN body+0x04/+0x06`）**本次沒有重新驗證，沿用既有 [DLL] 結論**。

**但這跟 `Game_User_SN` 的 per-player teamIndex 是兩個獨立欄位**：`Game_User_SN rec+0x02` 填進的是
`[this+0x1034]`（stride 0x80）陣列，被 `Game_User_Team_Get` 拿來跟 `Game_Info_SN` 的 Red/Blue 索引比對，
決定**這個玩家自己**算紅隊還是藍隊（`Game_User_Team_Get` 邏輯：`docs/journal/2026-09-16-19-team-255-root-cause-chain.md`
✅、`docs/state.md:93` ✅）。**P3 沒有回答「兩個玩家的 `Game_User_SN` teamIndex 該不該不一樣」這件事**——
目前程式碼的答案是「兩個都填 0」，TDM 要分兩隊必然要讓部分玩家改填 1（跟 `redTeamIndex=0/blueTeamIndex=1`
配對），這件事**沒有被 P3 涵蓋，也還沒做**。

**附帶發現**：`docs/gemini-gameinfo-findings.md` 第 5.2 節把「`Game_User_Team_Get` 搜尋的陣列」歸給
`Room_User_Add`（`SN_USER_DEFAULT 0x00220233`）填的 `entry+0x34`——**這跟 `docs/state.md:93`（已 ✅）以及
`room-game-user.sender.js` 自己的組語註解矛盾**：真正被 `Game_User_Team_Get` 搜尋的陣列是
`[this+0x1034]`（stride 0x80），只由 `Game_User_SN 0x00222112`／`Game_User_Add` 填，`SN_USER_DEFAULT` 填的是
另一個陣列 `[this+0xf88]`（stride 0x50，房間 UI 用）。這是既有 ✅ 結論之間的落差，gemini 那份文件第 5 節在
這點上已經過期/被更正過，本檔僅提醒——不是本次新發現的矛盾，只是 Q1-Q3 引用同一份文件時要注意跳過這段。

---

## Q6. 建房請求 `0x00220201` 的房型欄位在哪一個 byte？`rawRoomType_` 從哪個 byte 來？

**位置**：`body[0]`，u8。**已由 `docs/journal/2026-09-17-18-create-cq-map-difficulty.md` 逐欄位核對 DLL
組語（`ZDispatchLobby::Create_CQ 0x107e5b60`，寫入位址 `0x107e5c32..0x107e5c56`）並經 Claude 高階審查標 ✅**
（同檔案末段「Create_CQ 欄位順序由 🟡 升為 ✅」）。DLL 端在寫入 body[0] 之前，會先對客戶端本地選的 RoomType
做一次 case 轉換：`case 1→3, 2→1, 3→5, 4→6, default→2`（同一份日誌 Table，第 14 列）。

`dispatch/gate.game.dispatch.js:1176,1217`：`const roomType = body.length > 0 ? body[0] : 0;` ... `client.rawRoomType_ = roomType;`——直接讀 `body[0]`，跟 DLL 核對過的欄位對上，不需要再驗證。

**本次額外從 24 份 session log 撈出的真實 body[0] 分布**（`grep '"op":"0x00220201"' logs/*.jsonl`），
比原本日誌裡唯一一筆 PvP 範例更完整：

| body[0] 觀察值 | 出現情境 | MapIndex(body+2..3) | PlayTime | PlayRound | MaxUser(body+1) |
|---|---|---|---|---|---|
| `01` | 戰役房（已知會走通） | `32 23`=0x2332=**9010**（Map_PC04 易，PvE 預設圖） | 60 | 5 | 16 |
| `02` | 舊日誌記錄的「PVP」；本次多筆 log 重現 | `63 1b`=0x1b63=**7011**（Map_C05 衛星基地，殊死戰／SuddenDeath） | 3 | 2 | 8 |
| `06` | 另一種房型，同批 log 也有多筆 | 同樣 `63 1b`=**7011** | 3 | 2 | 16 |

**三個觀察都能對上 Q3 的 Cache.Bin 表**（7011 的 Default Goal=2／Time=3 跟這裡的 PlayRound/PlayTime 欄位吻合，
9010 的 Goal=5／Time=60 也吻合)——這代表 body 的欄位順序本身是可信的，不是巧合。

**新發現，值得高階留意**：舊日誌只記錄過 `roomType=2` 一種 PvP，但本次撈到 log 裡實際出現過 `body[0]=6`
這個第三種值，且兩者選的預設地圖相同（7011）、只有 MaxUser 不同（8 vs 16）。依 DLL 轉換表反推，`body[0]=1`
對應本地選擇值 2、`body[0]=6` 對應本地選擇值 4，`body[0]=2` 對應「default」分支（本地選擇值不是 1/2/3/4 中
任何一個）——**這代表建房 UI 至少有兩種不同的「非戰役」分頁／選項會產生不同的 body[0]**，目前程式碼
`isCampaignLike = (roomType===1)||(roomType===2)||(gameMode===4||gameMode===5)`（`gate.game.dispatch.js:1200`）
只把 `roomType===2` 當非戰役特例處理（8 人上限走 campaign-like 分支），`roomType===6` 完全沒有對應處理，
會落到 `maxPlayers = Math.min(Math.max(roomNumberValue||1,1),8)` 這條路——而 `roomNumberValue` 讀的是
`body.readUInt16LE(12)`，依同一份已核對的 DLL 表，那其實是 **`QuickTitleIndex`（快速房名索引）**，不是任何
「人數上限」欄位。撈到的 `06` 範例 `roomNumberValue` 是 1 或 4，會讓 `maxPlayers` 被錯誤算成 1 或 4——這是
額外發現的潛在 bug，跟 PvP 開戰本身無直接關係，但如果 `body[0]=6` 這種房型也是某種 PvP 分頁，目前的人數上限
計算是錯的。**這件事本次只發現、沒有查它對應到 UI 上哪個按鈕／分頁**，留給下一步。

---

## 給主力的摘要（六題以外的整體觀察）

`campaignStarted_` 只是第一層閘門；就算把它打開，`sendGameInfoSn`／`sendReadyHostSn` 依賴的
`client.campaignMapCacheKey_` 目前無條件退回 9001（PvE 地圖），這是**第二個、獨立的、目前沒人提過的
campaign-only 假設**，兩個都要修才會送出正確 mapId。另外 `MAP_IDS_PVP` 常數定義了卻沒接上任何邏輯、
`MapInfo_SN` 從未送過任何 PvP map id（Account_MapList_Check 因此永遠擋掉 PvP 地圖選單）、
以及 `gameMode_` 的計算依據（body offset 9-10）跟已核對的 DLL 欄位表（PlayGoal）對不上——這三點都需要
高階決定怎麼處理，本檔不提實作建議。
