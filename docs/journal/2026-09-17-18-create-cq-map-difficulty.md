# 建房 Create_CQ 組語核對與地圖／難度傳遞機制（2026-09-17）

> 任務 G4 成果報告。依 `AGENTS.md` 規則，中階分析結論一律標 🟡 並註記「待審」，不標 ✅。
> 原始資料：`docs/research/2026-09-17-backlog/G4/Create_CQ_asm.txt`、`Map_Change_One_CQ_asm.txt`。

## 1. Create_CQ `0x00220201` 組語逐欄位核對

- 呼叫端：`UZNetwork_DJ::execLobby_Room_Create`（`0x10718740`），依序自 script stack 取出參數後 push（`0x107188fc..0x1071891e`）。
- 建構端：`ZDispatchLobby::Create_CQ`（`0x107e5b60`），總長 0x43（67 bytes），Header 16 bytes，Body 51 bytes（`0x1090f2e0`）。
- 逐欄位組語位址與型別核對：

| Body 偏移 | 欄位名稱 | 型別 | 組語寫入位址 | 來源與說明 |
|---|---|---|---|---|
| `+0x00` | RoomType | u8 | `0x107e5c32..0x107e5c56` | 由傳入之 RoomType 轉換（case 1→3, 2→1, 3→5, 4→6, default→2） |
| `+0x01` | MaxUser | u8 | `0x107e5cb6` | `[esp + 0x24]` 人數上限 |
| `+0x02..0x03` | MapIndex | u16 LE | `0x107e5cc0` | `[esp + 0x28]` 地圖編號（如 9010） |
| `+0x04..0x05` | PlayTime | u16 LE | `0x107e5cd7` | `[esp + 0x30]` 時間限制（如 60 分鐘） |
| `+0x06` | PlayRound | u8 | `0x107e5ccc` | `[esp + 0x2c]` 回合數（如 5 回合） |
| `+0x07..0x08` | PlayKill | u16 LE | `0x107e5ce7` | `[esp + 0x34]` 殺敵數限制 |
| `+0x09..0x0A` | PlayGoal | u16 LE | `0x107e5cee` | `[esp + 0x38]` 目標分數／奪取數 |
| `+0x0B` | IsQuickTitle | u8 | `0x107e5c65` | 1（若有選快速房名） |
| `+0x0C..0x0D` | QuickTitleIndex | u16 LE | `0x107e5c6c` | `[esp + 0x14]` 快速標題索引 |
| `+0x0E..0x26` | RoomName | ANSI[25] | `0x107e5c82` | 房名（最長 24 字元 ＋ \0） |
| `+0x27` | HasPassword | u8 | `0x107e5c9d` | 密碼旗標（密碼長度 > 0 則為 1） |
| `+0x28..0x32` | Password | ANSI[11] | `0x107e5ca4` | 密碼（最長 10 字元 ＋ \0） |

- 🟡 [DLL] 結論：`body[0..13]` 與 `docs/journal/2026-09-17-12-pve-round-zero.md` 之推測完全吻合。

## 2. 房間內變更地圖／難度封包：Map_Change_One_CQ `0x00220221`

- 呼叫端：`UZNetwork_DJ::execRoom_Map_Change_One`（`0x107195a0`），對應 script `Room_Map_Change_One`（`ZPanel_PVE.uc:349`、`ZPanel_RoomInfo.uc:1054`）。
- 建構端：`ZDispatchRoom::Map_Change_One_CQ`（`0x107eec30`），總長 0x1A（26 bytes），Header 16 bytes，Body 10 bytes（`0x10915320`）。
- 逐欄位組語位址與型別核對：

| Body 偏移 | 欄位名稱 | 型別 | 組語寫入位址 | 來源參數與說明 |
|---|---|---|---|---|
| `+0x00` | MapNumber | u8 | `0x107eec80` | Arg 1: MapNumber（通常固定為 0） |
| `+0x01..0x02` | MapIndex | u16 LE | `0x107eec8a` | Arg 2: MapIndex（地圖 Cache.Bin ID，如 9001/9010） |
| `+0x03..0x04` | MapTime | u16 LE | `0x107eec96` | Arg 3: MapTime（時間限制） |
| `+0x05` | MapRound | u8 | `0x107eeccb` | Arg 6: MapRound（回合數，由 GoalDefault 填入） |
| `+0x06..0x07` | MapKill | u16 LE | `0x107eeca1` | Arg 4: MapKill（殺敵限制） |
| `+0x08..0x09` | MapGoal | u16 LE | `0x107eecc4` | Arg 5: MapCapture / PlayGoal（目標分數） |

- 🟡 [DLL] 欄位順序特徵：除了開頭是 `MapNumber`（1 byte）取代了 `RoomType`+`MaxUser`（2 bytes），其餘欄位順序 `(MapIndex, MapTime, MapRound, MapKill, MapGoal)` 與 `Create_CQ` 欄位型別及順序完全一致。

## 3. PvE 地圖與難度機制分析

- [SRC] `ZPopup_CreateRoom.uc:463-494`：
  - 首次建房時強制限制 `MapList[n].PlayPve == 1`（難度 1：초급 初級／Easy）。
  - 預設地圖匹配 `DefaultMap == 3`，符合此條件者為 `Map_PC04` 潛入作戰（MapIndex = 9010，GoalDefault = 5）。
  - 因此客戶端初次送出之 `Create_CQ` 必定帶有 `MapIndex = 9010`、`PlayRound = 5`。
- [SRC] `ZPanel_PVE.uc:327-339`（房間內切換難度）：
  - 難度切換邏輯公式：`nTemp = (MapIndex - 9001) / 3`。
  - Group 0：9001（Easy）、9002（Normal）、9003（Hard）→ `Map_PC01` 動力奪取戰。
  - Group 2：9007（Easy）、9008（Normal）、9009（Hard）→ `Map_PC02` 防衛作戰。
  - Group 3：9010（Easy）、9011（Normal）、9012（Hard）→ `Map_PC04` 潛入作戰。
  - 點選難度按鈕後，客戶端計算新難度對應的 `MapIndex` 與預設 `GoalDefault`（即 Round），並送出 `Map_Change_One_CQ 0x00220221`。

## 4. 伺服器現況與建議修改（待審）

- [程式碼現況]：
  1. `gate.game.dispatch.js:613` 在建房時寫死 `client.campaignMapCacheKey_ = 9001`，無視客戶端在 `Create_CQ` 選送的 9010。
  2. `gate.game.dispatch.js:830` 在收到 `Map_Change_One_CQ 0x00220221` 時，雖拆解了 `w1`（MapIndex）與 `b5`（MapRound），但未更新 `client.campaignMapCacheKey_` 或 `client.playRound_`。
  3. `sendGameInfoSn` 讀取 `campaignMapCacheKey_` 作為地圖 ID 寫入 `Game_Info_SN body+0x11`，導致永遠載入 9001（Map_PC01 易）。
- 🟡 [待審建議]：
  1. 建房處理（`0x00220201`）：取 `client.mapIndex_ = body.readUInt16LE(0x02)`、`client.playRound_ = body[6]`；PvE 房設 `client.campaignMapCacheKey_ = client.mapIndex_`。
  2. 改圖處理（`0x00220221`）：更新 `client.mapIndex_ = incomingFields.w1`、`client.playRound_ = incomingFields.b5`、`client.campaignMapCacheKey_ = incomingFields.w1`。
  3. 兩項變數透過 `session.js` 跨重連延續，`sendGameInfoSn` 即可將正確的選定地圖與回合數送進 `Game_Info_SN`。
