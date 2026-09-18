# R4 SN_ROOM_DEFAULT 首筆 MapInfo entry（待審）

狀態：🟡 待審；本次只加預設關閉的單欄位修正，未啟動伺服器、未要求操作者實測。

## 目標與根因鏈

- [OBS][SHOT] `shots/room-settings.png` 顯示人數仍是 PvP 的「4 VS 4」，地圖清單空，按確認不送封包。
- [SRC] `ZPopup_RoomSet.uc:296-318` 的 `InternalOnOpen()` 只在 Cache `MapIndex >= 1000` 且等於 `MyRoomInfo.MapInfo[0].Index` 時設定 `g_SelectMapInfo`。
- [SRC] `ZPopup_RoomSet.uc:848-877` 只有 `g_SelectMapInfo.MapType == 9` 才切換到 PvE 人數下拉；清單未命中時維持 `co_UserCount`。
- [DLL] `Room_Default_SN 0x00220203` thunk `0x10706d7f` → 本體 `0x107ea3e0`；`0x107ea601-0x107ea653` 將 body+`0x20` 起每筆 9 bytes 複製到 `RoomInfo+0x30`。
- [DLL] 因此首筆 body+`0x20` 的 u16 會成為 `MapInfo[0].Index`；這是房間設定比對的值。
- [CODE] `room-state.sender.js:70-75` 原本將首筆寫成 `primaryBodyCacheIndex`，來源是 Cache.Bin 列索引，例如 58。
- [CODE] `room-state.sender.js:51` 的 `mapIndex` 另在 SN_ROOM_DEFAULT body+`0x05` 寫入；R1 的 enabled 路徑由 `room.dispatch.js:1425` 傳入，可為 9010，與 entry 表不是同一欄位。

## 兩個地圖欄位的界線

| 位置 | 現行用途 | R4 enabled | 證據 |
|---|---|---|---|
| `0x00220203` body+`0x05` | `mapIndex`，R1 的房間目前地圖欄位 | 不改 | [CODE] `room-state.sender.js:35` |
| 首筆 entry body+`0x20+0x00` | `bodyCache`，被 DLL 複製成 `MapInfo[0].Index` | 改為 9001–9012 map ID | [DLL] `0x107ea601-0x107ea653` |

R1 的 log 曾同時出現 `mapIndex=9010` 與 `bodyCache=58`；本次只改後者，避免把已正確的 body+`0x05` 再改一次。

## 程式變更

- 新增 `ROOM_DEFAULT_MAP_ENTRY_MODE = 'disabled'`（`room-state.sender.js:9`）。
- enabled 時取 `client.campaignMapCacheKey_`；只有整數 9001–9012 才採用，否則回退 `MAP_ID_DEFAULT_PVE=9001`。
- 只替換首筆 entry 的 `entryOffset+0x00`：disabled 保留 `primaryBodyCacheIndex`（例如 58），enabled 寫實際 map ID（例如 9010）。
- entry 筆數、每筆 9 bytes、entry+0x02/+0x04/+0x05/+0x07、body 長度 `0x021A`、送出順序完全不動。
- 後續五筆仍使用 `roomDefaultEntryHints`；未把同一個 map ID 填滿整張表。
- R1 `ROOM_MAP_SYNC_MODE`、R2 `ROOM_STRING_ANSI_MODE`、R3 `MAP_CHANGE_SA_ECHO_MODE` 及商店／G6／G7 路徑均未修改。

## 預期封包與待審

- [GUESS] 若目前 map 為 9010，R4 enabled 的首筆 `body+0x20` 應由 `3a00`（58）變為 `3a23`（9010，u16LE）；body+`0x05` 仍是 R1 的 9010。
- [GUESS] 這會使 DLL 產生的 `MapInfo[0].Index` 命中 Cache 的 9010，讓 `g_SelectMapInfo` 與 PvE 人數分支有機會建立；是否解除 UI 空白仍待實測。
- [TEST] 已對修改檔執行 `node --check`，並以 `git diff --check` 驗證；未啟動伺服器。
- ⬜ 尚未確認所有其他 entry 欄位的完整語意；本任務只處理首筆 index 欄位。

## Entry layout 與單欄位界線

- [DLL][CODE] `body+0x1F` 是 entry count；目前 campaign 路徑由 `room.dispatch.js:1414-1416` 送 6 筆。
- [DLL][CODE] 每筆 9 bytes：entry+`0x00` u16 index、+`0x02` u16 zero、+`0x04` u8 flag、+`0x05` u16 mech、+`0x07` u16 zero。
- [CODE] `room-state.sender.js:71` 仍以 `0x20 + i*9` 計算起點；`room-state.sender.js:75-79` 的其他欄位沒有改動。
- [CODE] R4 只讓 `i===0` 使用 `firstEntryMapIndex`；`i=1..5` 仍取 `roomDefaultEntryHints[i]` 的原值。
- [CODE] `body+0x2F` 的 slot-count 寫入仍在 loop 後執行，沒有被移動或改值。

## 改前／改後例子

| 情境 | body+0x05 mapIndex | 首筆 body+0x20+0x00 | 後五筆 index |
|---|---:|---:|---|
| disabled、既有 9010 場景 | 9010 | 58 (`3a00`) | 37, 30, 34, 6, 2 |
| enabled、`campaignMapCacheKey_=9010` | 9010 | 9010 (`3a23`) | 37, 30, 34, 6, 2 |
| enabled、值不存在或不在 9001–9012 | 既有值 | 9001 (`2923`) | 37, 30, 34, 6, 2 |

- 🟡 上表是靜態封包預期，不是實測結果；R4 仍需操作者單變數開關實測後由高階審查。
- [TEST] `node --check room-state.sender.js` 與 `git diff --check` 已通過；未變更工作樹中 R1/R2/R3 的開關值。
