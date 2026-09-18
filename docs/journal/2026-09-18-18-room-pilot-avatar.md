# R13 房間頭像需要的 PilotCode 分析

> 已被 `2026-09-18-2305-room-avatar-experiments.md` 更正：改送 51500101（R14）與 51100801（R15）實測都仍無頭像，本篇「預期」欄不成立。

狀態：🟡 待審；純分析與證據保存，未修改伺服器程式碼或資料庫。

## 依據與目標

- [OBS] 房間紅隊第一格已正確顯示玩家位置、完整 ID「Lucas」與房主標記，但頭像框未顯示任何駕駛員頭像。
- [SRC] `ZPage_Room.uc:2455` 將 `PlayerList[Count].PilotCode` 作為 `nAvatar` 傳入 `RefreshData`；`ZPanel_TeamMember.uc:276` 呼叫 `CacheManager.GetImageIndex(m_Avatar)` 計算 atlas UV 座標。
- 本任務分析 `PilotCode=101` 無法顯示頭像的完整呼叫鏈、核對 Cache.Bin 資料庫，並提出最小單變數實驗建議。
- 原始反組譯與 Cache 轉存記錄於 `docs/research/2026-09-18-room-pilot-avatar/`。

## 完整呼叫鏈與 101 失敗原因

1. **封包寫入路徑 [DLL]**：
   - `User_Default_SN 0x00220233`（`0x107ee2d0`）：從 entry+0x02 讀出 PilotCode（`0x107ee4be`），傳入 `UZNetwork_DJ::Room_User_Default_Add`（`0x107339e0`），於 `0x10733a89` 寫入 `ROOM_USER_INFO.PilotCode`（record+0x38）。
   - `User_Pilot_SN 0x00220402`（`0x1072c810`）：比對 UserIndex 後，於 `0x1072c84c` 將參數寫入同一欄位（record+0x38）。該函式為純記憶體賦值，無 UnrealScript 回呼。
   - 結論：兩封包均正確寫入同一個 `PilotCode` 欄位；UI 重繪由 `User_Default_SN` 結尾或後續 `User_State_SN`/`User_Master_SN` 觸發，時序非頭像空白原因。

2. **Cache 查表失敗 [DLL][CACHE]**：
   - `CacheManager.uc:1267`：`GetImageIndex(ItemIndex)` 呼叫原生函式 `GetItemHighGroup(ItemIndex)`。
   - `Engine.dll:0x10412bc0`（`execGetItemHighGroup`）呼叫 `0x10412690`，在 Cache.Bin Table 2（`GameItemRecord`）二元搜尋 `ItemIndex`。
   - 現行伺服器送出之 `101` 並非 8 位數物品編號，在 `GameItemRecord` 中不存在，搜尋失敗返回全 0 記錄，`HighGroup` 返回 0。
   - `GetImageIndex` 進入 `default: Result = GetSpecEtcRecord(101).ImageIndex;`，查無資料返回 `0`。

3. **Atlas UV 座標越界 [SRC]**：
   - `ZPanel_TeamMember.uc:278-292` 使用材質 `Room_04`（每欄 11 列，尺寸 103×93）：
     `X1 = 206 * ((ImageIndex - 1) / 11)`（紅隊）；`Y1 = 93 * ((ImageIndex - 1) % 11)`。
   - 當 `ImageIndex = 0` 時，`ImageIndex - 1 = -1`。
   - 負數運算使 `Y1 = 93 * (-1) = -93`、`Y2 = 0`，UV 座標完全落在貼圖外（`[-93, 0]`），導致頭像無法顯示。

| 項目 | 現況（PilotCode=101） | 預期（PilotCode=51500101） |
|---|---|---|
| `GetItemHighGroup` | 0（未命中） | 5（Pilot 類別） |
| `GetSpecPilotRecord` | 未呼叫（走 default Etc 分支） | 命中 Table 10 第 7 筆 |
| `ImageIndex` | 0 | 9（基本駕駛員 Dragonfly） |
| Atlas X 範圍 | `[0, 103]` | `[0, 103]`（紅隊第 0 欄） |
| Atlas Y 範圍 | `[-93, 0]`（貼圖外，空白） | `[744, 837]`（第 8 列，正常顯示） |

## Cache.Bin 真實駕駛員編號與 101/102 根因

- **Cache.Bin Table 10（`SpecPilotRecord`，偏移 `0x44405`）[CACHE]**：
  - 共 25 筆記錄，其中男生預設駕駛員為 `RepresentIndex = 51500101`，`ImageIndex = 9`（「基本駕駛員」，即 Dragonfly 標誌頭像）。
  - 女生預設駕駛員為 `RepresentIndex = 51600101`，`ImageIndex = 10`（「基本駕駛員」）。
  - 對照 `CacheManager.uc:956` 註解：`if (List[n].ImageIndex == 9) //없는 인덱스일경우 기본(잠자리아바타)로 보냄`，證實 `51500101`（ImageIndex 9）即官方預設駕駛員。
- **101 / 102 的真正來源 [SRC]**：
  - `ZPage_Account.uc:239-247` 創角介面：
    `switch(m_PilotNumber) { case 1: BeginNumber = 102; break; default: BeginNumber = 101; }`，隨後呼叫 `Account_Create(BeginNumber, NickName)`。
  - `101` 與 `102` 是 `[BeginSet]` 初學者套裝編號（`BeginSetIndex`，男性/女性預設裝備包），而非駕駛員物品編號 `ItemIndex`。
  - 模擬器過去將創角傳入的 `BeginNumber`（101/102）直接存入 `accounts.pilot` 並沿用為 `PilotCode`，導致所有依賴 `ItemIndex` 的系統（頭像、RadioChat 語音，見 `2026-09-17-08`）無法辨識。
  - 歷史日誌 `2026-09-17-08-account-level-gm-keybinds.md:44` 記錄之客戶端崩潰/警告：
    `#### RadioChat can not found.!!!!! PilotCode : [ 101 ] Select_Num : [ 1 ] ####`，進一步印證 `101` 在客戶端所有駕駛員查表處均被視為無效值。

## 單變數實驗建議（供下一輪高階決策）

- 在 `Metal Rage Online Server/dispatch/room/room-user.sender.js` 建立受控開關：
  `ROOM_USER_PILOT_CODE_MODE = 'disabled'; // 'disabled' | 'item_index'`。
- 當 `ROOM_USER_PILOT_CODE_MODE === 'item_index'` 時，若 `pilotId === 101` 則映射為 `51500101`（`102` 映射為 `51600101`），於 `User_Default_SN` 與 `User_Pilot_SN` 中送出。
- 預期效果：`GetImageIndex(51500101)` 返回 9，紅隊槽計算出 `Y1 = 744, Y2 = 837`（貼圖第 9 列），正確顯示 Dragonfly 基本駕駛員頭像。
