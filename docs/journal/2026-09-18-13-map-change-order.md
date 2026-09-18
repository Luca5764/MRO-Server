# R7/R7b Map_Change_One 回應順序（待審）

狀態：🟡 待審；R7 原始順序假設已被實測推翻，R7b 改為 ONE 後補送一次 ALL；未啟動伺服器、未要求操作者實測。

## 實測與根因假設

- [OBS] R6 開啟後，操作者按初級／中級／高級時「目標回合」正確顯示 5／8／10，表示 R6 的設定回送生效。
- [OBS] 同場難度燈慢一拍：第一次點某難度先亮前一個狀態，再點一次才亮正確狀態。
- [LOG] 現行 `Map_Change_One_CQ 0x00220221` 回應順序是 `0x00220222` SA、`0x00220226` ALL、`0x00220226` ALL、`0x00220223` ONE。
- [DLL] `Map_Change_One_SN 0x00220223` handler 本體 `0x107eb6f0` 在 `0x107eb771-0x107eb7a0` 將 body 欄位寫入 `pRoom+0x30 + 24*b0`。
- [SRC] `ZPage_Room.uc:680` 由 `MapInfoList[j].PlayPve` 設難度燈；`ZPanel_PVE.uc:216-309` 由目前地圖更新任務簡報。
- 🟡 [GUESS] 先到的 ALL 觸發重繪時，ONE 尚未把新 MapInfo 寫入，因此讀到舊值；下一次事件才顯示前一次選擇。
- 既有程式註解也記錄 ALL 的 `NETWORK_ROOM_INFO` 事件早於其自身寫入，並用第二次 ALL 補送；這支持事件／寫入先後會影響畫面。

## 兩條 sender 路徑的區分

- [CODE] 初始進房／建房在 `room.dispatch.js:1447` 直接呼叫 `sendRoomMapPackets(client, ctx, getExactMessageBuffer)`，不傳選項。
- [CODE] 換圖回應在 `gate.game.dispatch.js:525` 的 `resendRoomMapOnly()` 呼叫 sender；R7 只在此傳 `{ mapChangeOneResponse: true }`。
- [CODE] sender 以 `options.mapChangeOneResponse === true` 判斷是否為換圖回應，避免依 client 狀態猜測場景。
- [CODE] 因此初始進房永遠保留原本 ALL×2 → ONE；只有換圖回應在 enabled 時改為 ONE → ALL×2。

## R7 原始程式修正（已被推翻）

- 新增 `MAP_CHANGE_ORDER_MODE = 'disabled'`（`room-map.sender.js` 頂端；預設不改現行順序）。
- 把既有 `SN_MAP_CHANGE_ONE 0x00220223` 組包抽成 `sendMapChangeOnePacket()`；欄位、10-byte body、R6 設定來源與 log 保持原樣。
- R7 原始 enabled 且 `mapChangeOneResponse=true` 時先呼叫 ONE，再執行既有 ALL 區塊；這就是已被實測推翻的 ONE→ALL×2 路徑。
- R7 disabled 或初始路徑仍由同一 helper 在 ALL×2 之後送 ONE；R7b 保留這個可工作的基線。
- 沒有修改 `SN_MAP_CHANGE_ALL` 的 body、筆數、selectedIdx、重複送出、R1/R2/R3/R4/R6 開關值。

## 送出序列與待審

| 路徑 | disabled／基線 | R7 原始 enabled（已推翻） | R7b enabled |
|---|---|---|---|
| 初始進房／建房 | ALL×2 → ONE | ALL×2 → ONE | ALL×2 → ONE |
| Map_Change_One_CQ 回應 | SA → ALL×2 → ONE | SA → ONE → ALL×2 | SA → ALL×2 → ONE → ALL |

- [❌] R7 的 enabled 預期「ONE 先寫入新 MapInfo，再由 ALL 重繪」已被實測否定。
- [TEST] 待執行 `node --check` 與 `git diff --check`；本分支不啟動伺服器。
- ⬜ 尚未證明 ALL 事件一定在 ONE 寫入後讀到新值；這是本次單一順序實驗的待審點。
- R6 的 5／8／10 目標回合結果保留為 [OBS] 背景，不把 R7 效果標成已確認。

## 欄位與 disabled 等價性

- [CODE] `sendMapChangeOnePacket()` 仍建立 `SN_MAP_CHANGE_ONE 0x00220223` 的 `0x0A` body。
- [CODE] b0 仍為 0，w1 仍為 `effectiveCacheKey`，R6 的 w2／b5／w6／w8 來源與欄位偏移均未改。
- [CODE] ALL 仍使用相同的 `mapList`、`effectiveSelectedIdx`、9-byte entry 與 `MAP_ALL_ENTRY_OFFSET`。
- [CODE] `MAP_ALL_SEND_TWICE === 'enabled'` 時仍對同一個 ALL frame 呼叫 `client.send()` 兩次。
- [CODE] disabled 時 `sendSupplementalAll` 必為 false，執行順序仍是 ALL、ALL（若開啟補送）、ONE。
- [CODE] 初始 `room.dispatch.js` 呼叫沒有第四個 options 參數，因此不會誤套用換圖回應順序。
- [CODE] R7b 新開關仍位於 `room-map.sender.js:18`，以 enabled 才會在換圖回應的 ONE 後補送一次 ALL。
- 🟡 若實測仍慢一拍，下一步應保存 ONE／ALL 的完整 frame 與客戶端事件 log，再判斷是否還有其他重繪觸發點。

## R7 更正：實測已推翻原假設

- [OBS] R7 將順序改為 ONE→ALL 後，第一次按初級時任務從潛入作戰變成 5 回合動力奪取戰，但難度燈仍停在高級。
- [OBS] 同次畫面中間 6 個地圖名稱裡「潛入作戰」消失；之後按鈕都沒有反應。
- [LOG] 後續客戶端固定送 `Map_Change_One_CQ`，w1=9002、w2=60、b5=8；伺服器也固定回 9002，狀態卡死。
- ❌ R7 原本「ALL 只負責觸發重繪、ONE 才負責寫選中狀態」的假設已被上述 [OBS][LOG] 推翻。
- [OBS][LOG] 實測反而表示 ALL 會寫入客戶端選中狀態／清單；原本 ALL→ONE 由 ONE 收尾才是可工作的狀態，不能反轉。

## R7b 修正

- 沿用 `MAP_CHANGE_ORDER_MODE`，enabled 行為改為保留 `ALL(selectedIdx=新)×2 → ONE(地圖=新)`，再補一次 `ALL(selectedIdx=新)`。
- 補送 ALL 使用同一張 map list、筆數、selectedIdx、entry 欄位與 body 長度，只將 `sendTwice` 設為 false，因此是一次額外 ALL，不會變成額外 ALL×2。
- `mapChangeOneResponse=true` 仍只由 `gate.game.dispatch.js:525` 的 map-only 換圖回應路徑傳入；`room.dispatch.js:1447` 初始進房不傳 options，不會補送。
- disabled 時 `sendSupplementalAll` 為 false，完整維持原本 ALL×2→ONE。
- 🟡 新做法的目標是讓 ONE 寫入後再觸發一次 ALL 重繪，但是否能解除燈號／清單問題仍待單變數實測。
