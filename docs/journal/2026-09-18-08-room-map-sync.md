# R1 房間面板同步實際 PvE 地圖（待審）

狀態：🟡 待審；本次只做預設關閉的程式路徑與靜態檢查，尚未啟動伺服器或實測。

## 目標與根因

- [LOG] `docs/research/2026-09-18-room-ui/notes.md:32-38` 記錄進房序列包含 `0x00220203`、`0x00220226`、`0x00220223`，之後才送 `0x00222111`。
- [LOG] R1 指派的同場 log：`Game_Info_SN 0x00222111 map=9010`，但房間狀態為 `SN_ROOM_DEFAULT mapIndex=9001, map=5, bodyCache=58`。
- [LOG] 同一筆房間狀態的 `SN_MAP_CHANGE_ALL` 是 `count=12, selectedIdx=0, mapId=58`，`SN_MAP_CHANGE_ONE` 是 `cacheKey=9001`。
- [SRC] `ZPanel_PVE.uc:216-309` 由 `RoomInfo.MapInfo[0].Index` 查 Cache；`ZPage_Room.uc:680` 由同一列的 `PlayPve` 設難度。
- [SRC] `ZPanel_PVE.uc:328-329` 以 `(MapIndex - 9001) / 3` 分組難度；因此房間面板需要收到實際的 9001–9012 map ID。
- [SRC] `gate.game.dispatch.js` 的 `Create_CQ` body[2..3] 與 `Map_Change_One_CQ` w1 寫入 `client.campaignMapCacheKey_`。
- [SRC] `gate.game.dispatch.js:240-265` 的 `sendGameInfoSn()` 使用 `campaignMapCacheKey_` 寫入 `Game_Info_SN` 的 map 欄位；本次沒有修改它。

## 編號核對

| 位置 | 現行內容 | 編號種類 | enabled 內容 |
|---|---:|---|---:|
| `SN_ROOM_DEFAULT` body+0x05 `mapIndex` | 9001 | map ID | `campaignMapCacheKey_`，例如 9010 |
| `SN_ROOM_DEFAULT` 首筆 entry body+0x20+0x00 `bodyCache` | 58 | Cache entry index | 保留 58 |
| `SN_ROOM_DEFAULT` log 的 `map` | 5 | 現行 `client.mapId_`／舊房間來源 | 保留 5，不把 Cache index 寫進 map ID 欄位 |
| `SN_MAP_CHANGE_ALL` entry +0x00 | 9001..9012 | map ID 清單 | 保留同一清單 |
| `SN_MAP_CHANGE_ALL` `selectedIdx` | `indexOf(58)` 失敗後 0 | 清單中的 ordinal | `indexOf(9010)` 為 9 |
| `SN_MAP_CHANGE_ONE` body+0x01 `cacheKey` | 9001 | 現行 map ID 清單值 | 9010 |

- [CODE] `CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID[5]` 仍只負責現行首筆 `bodyCache=58`；沒有把 58 當成 9001–9012 清單值。
- [CODE] `room-map.sender.js:34-35` 原本已用 `campaignMapCacheKey` 尋找 `selectedIdx`；根因是呼叫端把 Cache entry index 58 傳給它。
- [CODE] `room-map.sender.js:76-85` 原本已把清單選中值寫入 `SN_MAP_CHANGE_ONE`；enabled 只改它收到的來源 key。

## 程式修正

- 新增 `ROOM_MAP_SYNC_MODE = 'disabled'`，集中由 `room-map.sender.js` 匯出，供初始房間狀態與 map-only resend 共用。
- [CODE] `room.dispatch.js:1402-1409` 僅在開關 enabled 且為 9001–9012 時取 `campaignMapCacheKey_`。
- [CODE] `room.dispatch.js:1425` 把該 map ID 傳給 `SN_ROOM_DEFAULT` 的 `mapIndex`；disabled 仍使用原本 `MAP_ID_DEFAULT_PVE`／`MAP_ID_DEFAULT_PVP` 表達式。
- [CODE] 同一段的 `campaignMapCacheKey` enabled 值供 `SN_MAP_CHANGE_ALL` 的既有 `indexOf()` 選擇與 `SN_MAP_CHANGE_ONE` 的既有寫入使用。
- [CODE] `gate.game.dispatch.js:500-502` 的 map-only resend 在 enabled 時改用相同 12 個 map ID；disabled 保留原本 21 個 legacy 值。
- 取不到或超出 9001–9012 的 `campaignMapCacheKey_` 時，enabled 退回現行 `mapIndex`、`bodyCache` 與 `primaryMapCacheIndex`，不送 0 或 undefined。
- disabled 條件下，舊的 `primaryMapCacheIndex`、舊 `campaignMapCacheKey`、舊清單、封包大小與送出順序均未改變。

## 封包欄位邊界

- `SN_ROOM_DEFAULT 0x00220203` 的 `mapIndex` 由 `room-state.sender.js:34` 以 u16LE 寫入；本次只替換 ctx 的來源。
- 同封包首筆 entry 的 `body+0x20+0x00` 仍由 `primaryBodyCacheIndex` 寫入 u16LE，故 58 不會被誤寫成 9010。
- `SN_MAP_CHANGE_ALL 0x00220226` 的 entry 值仍逐筆來自 map list；只改 enabled 時傳入的選中 key 與 map-only list。
- `SN_MAP_CHANGE_ONE 0x00220223` 的 body+0x01 仍取 `mapList[effectiveSelectedIdx]`，不新增欄位或改長度。
- 三個封包的 opcode、body size、header mode、送兩次的行為與送出順序都沒有改動。
- `Game_Info_SN 0x00222111`、`Map_Change_One_SA 0x00220222` 與資料庫均不在本次 diff。

## 驗證與待審

- [TEST] `node --check` 已通過 `room-map.sender.js`、`room.dispatch.js`、`gate.game.dispatch.js`。
- [TEST] `git diff --check` 已通過。
- 🟡 靜態預期：9010 房間在 enabled 初始送出 `mapIndex=9010`、`selectedIdx=9`、`cacheKey=9010`，首筆 `bodyCache` 仍為 58。
- 🟡 尚未由操作者確認房間簡報、難度與下拉選單是否都跟隨 9010；本分支不啟動伺服器、不要求測試。
- ⬜ 尚未裁決 `SN_ROOM_DEFAULT` entry table 的其他 9-byte 欄位是否另有地圖語義；本任務不擴大修改。
