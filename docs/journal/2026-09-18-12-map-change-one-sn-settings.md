# R6 Map_Change_One_SN 房間設定回送（待審）

狀態：🟡 待審；新增預設關閉的設定回送路徑，未啟動伺服器、未要求操作者實測。

## 目標與證據

- [DLL] `Map_Change_One_SN 0x00220223` thunk `0x10708ae4` → 本體 `0x107eb6f0`。
- [DLL] 主流程 `0x107eb771-0x107eb7a0` 把 body 欄位寫入 `pRoom+0x30 + 24*b0` 的 `MapInfo[b0]`。
- [DLL] `body+0x00` 是 b0 槽位；`body+0x01` u16 是 w1／MapIndex。
- [DLL] `body+0x03` u16 是 w2／MapTime，寫入 record+`0x0c`（SA 交叉驗證的 +`0x3C`）。
- [DLL] `body+0x05` u8 是 b5／MapRound，寫入 record+`0x08`（SA 交叉驗證的 +`0x38`）。
- [DLL] `body+0x06` u16 是 w6／MapKill，寫入 record+`0x10`。
- [DLL] `body+0x08` u16 是 w8／Goal/Capture，寫入 record+`0x14`。
- [DLL] 這個 SN 沒有 R3b 的 6-byte SA 成功標頭；body 仍是 10 bytes，payload 從 body+`0x00` 開始。
- [LOG] CQ `0033233c000800000000` 解析為 w1=9011、w2=60、b5=8、w6=0、w8=0；現行 SN 卻送 w2=0、b5=1、w6=0、w8=0。
- [OBS][SHOT] `shots/r5-state.png`：按難度鈕後畫面完全不動；本次只處理已明確可見的設定值覆寫，不宣稱這是唯一根因。

## 目前伺服器值的來源

- [CODE] `room.dispatch.js:1411` 的 `roomSettingGoal`：campaign 目前是 0，非 campaign 是 `currentUsers`。
- [CODE] `room.dispatch.js:1412` 的 `roomSettingTime`：campaign 目前是 0，非 campaign 是 `maxPlayers`。
- [CODE] `room.dispatch.js:1413` 的 `roomSettingRound`：campaign 目前是 1，非 campaign 是 0。
- [CODE] 這三個值在 `room.dispatch.js:1438-1440` 放入 ctx，供 `room-state.sender.js:63-65` 寫入 SN_ROOM_DEFAULT body+`0x1C/+0x1D/+0x1E`。
- [CODE] `gate.game.dispatch.js:296-297` 的 Game_Info_SN 回合來源是 `client.playRound_`，寫入 Game_Info body+`0x15`。
- [CODE] 建房時 `gate.game.dispatch.js:612` 將 CQ_CREATE body[6] 存進 `client.playRound_`；之後 Map_Change_One_CQ 的 b5 也更新它。
- [CODE] R6 在 `gate.game.dispatch.js:866-873` 確認有效 map ID 後，額外保存 CQ 採納的 w2/b5/w6/w8 到四個 `client.mapChangeOne*` 欄位。
- [CODE] `room-map.sender.js:96-117` 仍以 `getExactMessageBuffer(SN_MAP_CHANGE_ONE, 0x0A)` 建立同一個 10-byte 封包，沒有改 header 或 payload 起點。

## R6 程式修正

- 新增 `MAP_CHANGE_ONE_SETTINGS_MODE = 'disabled'`，位於 `room-map.sender.js:16`。
- `room-map.sender.js:89-101` enabled 時依序取：w2=`mapChangeOneTime_`→`roomSettingTime`；b5=`mapChangeOneRound_`→`playRound_`→`roomSettingRound`；w6=`mapChangeOneKill_`→`roomSettingGoal`；w8=`mapChangeOneGoal_`→`roomSettingGoal`。
- 每個候選值都通過整數與欄位寬度檢查；取不到時回到既有值 w2=0、b5=1、w6=0、w8=0，不送 undefined／NaN。
- disabled 時 helper 直接回傳既有 fallback，所以原本四個寫入值與 10-byte body 逐欄位等價。
- enabled 時只有 w2/b5/w6/w8 的來源變更；w1 仍是 `effectiveCacheKey`，b0、body 長度、欄位偏移與送出順序不變。
- CQ 採納的四個值會在後續 `SN_MAP_CHANGE_ONE` resend 使用；不修改 R3b 的 `Map_Change_One_SA 0x00220222`。

## 改前／改後與待審

| 欄位 | disabled／改前 | enabled 優先來源 | CQ=9011 範例 |
|---|---:|---|---:|
| w2 body+0x03 | 0 | `mapChangeOneTime_`／ctx time | 60 |
| b5 body+0x05 | 1 | `mapChangeOneRound_`／`playRound_`／ctx round | 8 |
| w6 body+0x06 | 0 | `mapChangeOneKill_`／ctx goal | 0 |
| w8 body+0x08 | 0 | `mapChangeOneGoal_`／ctx goal | 0 |

- [GUESS] 上表描述 enabled 的靜態選值；若沒有 CQ 保存值，campaign 初始 ctx 仍提供 time=0、round=1、goal=0。
- [TEST] 待執行 `node --check` 與 `git diff --check`；本分支不啟動伺服器。
- ⬜ 是否足以解除 `shots/r5-state.png` 的畫面不動，留待高階實測；本日誌不標示為已確認。
- R1/R2/R3/R4 開關、`SN_MAP_CHANGE_ALL`、`SN_ROOM_DEFAULT` 與資料庫均未改動。
