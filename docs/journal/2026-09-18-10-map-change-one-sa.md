# R3 Map_Change_One_SA 回值修正（待審）

狀態：🟡 待審；已完成 DLL 靜態確認與預設關閉修正，未啟動伺服器、未要求實測。

## 實測證據與重現

- [LOG] R3 指派記錄：`ROOM_MAP_SYNC_MODE`、`ROOM_STRING_ANSI_MODE` enabled 的場次收到 `0x00220221`。
- [LOG] 9010 請求 body：`0032233c000500000000`，解析為 `b0=0,w1=9010,w2=60,b5=5,w6=0,w8=0`。
- [LOG] 伺服器回 `0x00220222`：`003a0000000000000000`，即 `w1=58`、其餘欄位 0。
- [LOG] 同場 `SN_MAP_CHANGE_ALL 0x00220226` 已是 `selectedIdx=9,mapId=9010`，`SN_MAP_CHANGE_ONE 0x00220223` 已是 `cacheKey=9010`。
- [LOG] 9011 請求 body：`0033233c000800000000`，SA 仍回 `w1=58`。
- [OBS][SHOT] `/home/lucas/mro-reverse/shots/r2-difficulty.png` 顯示客戶端「無法變更成設定，請重試」。
- [SRC] 難度按鈕路徑是 `ZPanel_PVE.uc` 的 `Room_Map_Change_One`；9001–9003 等同一任務的三個 map ID。

## Dispatcher 與本體

- [DLL] `tools/dispatch-map.py 0x10709507` 將 `0x00220222` 對到 `ZDispatchRoom::Map_Change_One_SA`。
- [DLL] export thunk：`0x107068e3`；第一條跳轉到本體 `0x107eb510`。
- [DLL] `0x107eb510` 先做 scene check；正常場景進入 `0x107eb543`，用第二個封包參數讀取 map-change payload。
- [DLL] `0x107eb56d-0x107eb57d` 先檢查第一個 Format 參數的 `+0x10` u16 與 `+0x12` dword；任一非零就跳到 `0x107eb683` 返回。
- 🟡 這兩個是 SA handler 的前置 status gate，但目前組語沒有符號把它們命名成 result／success code；不能把 payload 的 b0 誤標成 result。
- [DLL] payload 欄位在 `0x107eb5d8-0x107eb606` 逐一讀取，與 CQ 的十 bytes 順序相同。

## SA body 欄位語意

| body offset | 欄位 | SA 本體位址 | 靜態語意與依據 |
|---|---|---|---|
| `+0x00` | b0 | `0x107eb5d8` | MapNumber／房間 map slot；作為陣列索引，不是結果碼 |
| `+0x01..02` | w1 | `0x107eb5dc` | MapIndex；拿來找客戶端 MapInfoList 的 map ID |
| `+0x03..04` | w2 | `0x107eb5e7` | MapTime，寫入 MapInfo record `+0x3C` |
| `+0x05` | b5 | `0x107eb5f4` | MapRound，寫入 MapInfo record `+0x38` |
| `+0x06..07` | w6 | `0x107eb5fb` | MapKill，寫入 MapInfo record `+0x40` |
| `+0x08..09` | w8 | `0x107eb602` | MapCapture／MapGoal，寫入 MapInfo record `+0x44` |

- [DLL] `0x107eb5e0` 以 b0 計算 `6 + b0*3` 的 MapInfo 位置，再把 w1 寫入該列 index。
- [DLL] `0x107eb654-0x107eb672` 以 w1 與每列 `[edx]` 比對；找不到時直接返回，不更新 MapInfo。
- [DLL] 因此 w1 必須是 MapInfoList 中的 map ID（9001–9012），不是 Cache entry index 58。
- [DLL] `0x107eb771-0x107eb7a0` 的相鄰 Map_Change_One_SN 路徑重複相同欄位寫入，支持這份十 bytes layout。

## 程式修正

- 新增 `MAP_CHANGE_SA_ECHO_MODE = 'disabled'`，位置 `gate.game.dispatch.js:81`；R1/R2 開關完全未修改。
- enabled 時 `buildMapChangeOneSaFields()` 使用已接受的 `client.campaignMapCacheKey_` 作 w1，使用已接受的 `client.playRound_` 作 b5。
- w2、w6、w8 目前伺服器沒有另存狀態，enabled 原樣回送 CQ 收到的值；b0 原樣回送 CQ 的 MapNumber/slot。
- 以 R3 的 9010 請求為例，enabled 預期 SA body 為 `0032233c000500000000`，不再是 `003a0000000000000000`。
- disabled 仍走原本 `MAP_CHANGE_ONE_SA_EXPERIMENT.mode='manual'`、w1=58／其餘 0 的逐欄位路徑。
- 沒有修改 `campaignMapCacheKey_` 更新、`SN_MAP_CHANGE_ALL`、`SN_MAP_CHANGE_ONE` 或 R1/R2 任何開關。

## 驗證與待審

- [TEST] 將對 `gate.game.dispatch.js` 執行 `node --check` 與 `git diff --check`。
- 🟡 靜態預期：9010／9011 的 SA w1 分別為 9010／9011，b5 分別為 5／8，客戶端能在自己的 MapInfoList 找到對應 index。
- ⬜ 前置 status gate 的兩個欄位尚未能從組語命名；它們不在本次 payload 改動範圍。
- ⬜ UI 提示是否消失留待操作者實測，本分支不自行測試。
