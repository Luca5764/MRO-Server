# ★★ 地圖識別碼一直是錯的 —— `0x25xxxx` 挖不動的根本原因

> 從 docs/opcode-ledger.md 第 446–503 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-15。來源：Gemini 對 `ZNetwork.dll` 的反組譯（見 `docs/gemini-gameinfo-findings.md`），**以下每一項都經我方獨立驗證**。

### 已驗證的事實

**1. travel URL 的格式字串就寫在 `ZNetwork.dll` 裡**（UTF-16LE，逐字核對）：

| 檔案偏移 | 用途 | 內容 |
|---|---|---|
| `0x114a50` | 主機 | `start %s?Listen?LPort=%d?Name=%d?Game=%s?MaxPlayers=%d?GoalScore=%d?TimeLimit=%d?BalanceTeams=0?numbots=0?team=%d` |
| `0x114b34` | 訪客 | `start %s:%d/%s?team=%d` |
| `0x11497c` | 查表失敗 | `Failed - MapIndex : %d` |

> `BalanceTeams=0` 與 `numbots=0` 是**字串常數的一部分**，不是格式參數。
>
> 訪客那條 `%s:%d/%s` 證實 `0x00420115` 帶的 IP:port 是**給其他玩家連上主機用的**，不是給主機自己 travel。

**2. 客戶端是拿 Map ID 查 Cache.Bin，不是任何我們自訂的索引。** `Game_Info_URL_Get` 走訪 table 1（42 筆），以 `cmp [eax], edx` 比對 `entry[0]`。查不到就記錄 `Failed - MapIndex` 並留下空 URL，`ZPage_Room` 隨即退回「目前關卡 + HangarGameInfo + team 255」——也就是我們觀察到的崩潰。

**3. Map ID 表為真。** 14/14 抽驗通過：每個 Map ID 的位元組附近 220 bytes 內都能找到對應地圖名。

| Map ID | 地圖 | GameInfo 類別 | Goal | Time |
|---|---|---|---|---|
| 0 | `Store_01` 訓練基地 | `ZModeHangar.HangarGameInfo` | 0 | 0 |
| 1011 | `Map_C08` 十字路口 | `Zgame.ZTeamDM` | 150 | 20 |
| 2001 | `Map_N03` 月六區 | `ZmodeOccupation.OccupationMission` | 0 | 4 |
| 4011 | `Map_C09` D-Day | `ZmodeBot.BossMission` | 0 | 10 |
| 5011 | `Map_N05` 黃金艙門 | `ZmodeCapture.CaptureMission` | 10 | 15 |
| 6001 | `Map_N13` 北極地帶 | `ZmodeBlow.BlowMission` | 2 | 4 |
| 7011 | `Map_C05` 衛星基地 | `ZmodeSuddenDeath.SuddenDeathMission` | 2 | 3 |
| 8001 | `Map_N11` 沙坑碉堡 | `ZModeRage.RageMission` | 0 | 30 |
| **9001/9002/9003** | `Map_PC01` 動力奪取戰 易/中/難 | `ZModePve.ZModePve` | 5/8/10 | 60 |
| 9007–9009 | `Map_PC02` 防衛作戰 | `ZModeEscortPve.ZModeEscortPve` | 5/8/10 | 60 |
| 9010–9012 | `Map_PC04` 潛入作戰 | `ZModePve.ZSetCoreModePve` | 5/8/10 | 60 |

完整 42 筆見 `docs/gemini-gameinfo-findings.md`。13 個 GameInfo 類別字串也已確認存在於 Cache.Bin。

### 我們送錯了什麼

| 位置 | 原本 | 問題 |
|---|---|---|
| `room.dispatch.js` `mapIndex` | 戰役房固定 `1`，其餘 clamp 在 `1..6` | **沒有一個是合法 Map ID** |
| `CAMPAIGN_MAP_ALL_HINTS` | `[8, 37, 30, 34, ...]` | 自創的 cache 索引，全部查無此表 |
| `campaignMapCacheKey_` | `CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID[mapId] \|\| 8` | 同上 |

**已改**：以上三處改送真實 Map ID（戰役 `9001`、PVP `1011`，清單為 `9001..9012`）。`MAP_ID_MODE = 'legacy'` 可整組回退。

這同時解釋了**地圖下拉選單空白**——送過去的 id 全部查無對應，客戶端當然列不出東西。

### ⬜ 仍待處理：`team=255`

`Game_User_Team_Get`（`ZNetwork.dll` 匯出符號已確認存在）在房間使用者陣列裡找不到本地玩家、或其隊伍未指派時回傳 `255`。Gemini 指出應由 `User_Default_SN`（`0x00220233`）建立關聯。**此項尚未驗證，也尚未修改。**

> 反組譯中引用的其他偏移（`SN_ROOM_DEFAULT` 的 `0x07` MaxPlayers、`0x1C` GoalScore、`0x1D` TimeLimit、結構體 `[esi+0xfc8]` 等）**我方未逐一驗證**，僅格式字串、Map ID 表與 `Game_User_Team_Get` 符號存在性經過確認。

---

