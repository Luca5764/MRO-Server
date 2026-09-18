# R3 Map_Change_One_SA 回值修正（已確認）

狀態：✅ Claude 高階審查＋實測；R3b 更正成立。

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
- [OBS] R3 enabled 實測 SA 原樣回送 CQ 的 10 bytes，客戶端仍顯示「無法變更設定」；這推翻 R3 原先「SA 與 CQ 同格式」的結論。
- [DLL] `0x107eb56d-0x107eb57d` 檢查 SA body `+0x00` 的 u16 與 `+0x02` 的 u32；任一非零就跳到 `0x107eb683` 返回。
- [DLL] 因此 SA body 前 6 bytes 是成功標頭：`u16 result=0`、`u32 result=0`；R3 省略了這 6 bytes，payload 被放到了錯的位置。
- [DLL] 通過標頭後，`0x107eb5d8-0x107eb606` 從第二個參數（指向 SA body+`0x06`）逐一讀取 10-byte payload。

## SA body 欄位語意

| SA body offset | 欄位 | `0x107eb510` 本體讀取位址 | 靜態語意與依據 |
|---|---|---|---|
| `+0x00..01` | result u16 | `0x107eb56d` | 必須為 0；非零跳 `0x107eb683` |
| `+0x02..05` | result u32 | `0x107eb578` | 必須為 0；非零跳 `0x107eb683` |
| `+0x06` | payload b0 | `0x107eb5d8` | MapNumber／房間 map slot；作為陣列索引 |
| `+0x07..08` | payload w1 | `0x107eb5dc` | MapIndex；拿來找客戶端 MapInfoList 的 map ID |
| `+0x09..0A` | payload w2 | `0x107eb5e7` | MapTime，寫入 MapInfo record `+0x3C` |
| `+0x0B` | payload b5 | `0x107eb5f4` | MapRound，寫入 MapInfo record `+0x38` |
| `+0x0C..0D` | payload w6 | `0x107eb5fb` | MapKill，寫入 MapInfo record `+0x40` |
| `+0x0E..0F` | payload w8 | `0x107eb602` | MapCapture／MapGoal，寫入 MapInfo record `+0x44` |

- [DLL] `0x107eb5e0` 以 b0 計算 `6 + b0*3` 的 MapInfo 位置，再把 w1 寫入該列 index。
- [DLL] `0x107eb654-0x107eb672` 以 w1 與每列 `[edx]` 比對；找不到時直接返回，不更新 MapInfo。
- [DLL] 因此 w1 必須是 MapInfoList 中的 map ID（9001–9012），不是 Cache entry index 58。
- [DLL] `0x107eb771-0x107eb7a0` 的相鄰 Map_Change_One_SN 路徑重複相同 10-byte payload 欄位寫入；它不推翻 SA 的前置 6-byte header。

## 程式修正

- 新增 `MAP_CHANGE_SA_ECHO_MODE = 'disabled'`，位置 `gate.game.dispatch.js:81`；R1/R2 開關完全未修改。
- enabled 時 `buildMapChangeOneSaFields()` 使用已接受的 `client.campaignMapCacheKey_` 作 w1，使用已接受的 `client.playRound_` 作 b5。
- w2、w6、w8 目前伺服器沒有另存狀態，enabled 原樣回送 CQ 收到的值；b0 原樣回送 CQ 的 MapNumber/slot。
- R3b 改為 enabled 時 `getExactMessageBuffer(0x00220222, 0x10)`，body+`0x00..05` 明寫全零，再把 payload 寫到 body+`0x06`。
- 以 9011 請求為例，enabled 預期 SA body 為 `0000000000000033233c000800000000`；前 6 bytes 是成功標頭，後 10 bytes 才是 CQ 欄位順序。
- disabled 仍是 body size `0x0A`、payload 從 body+`0x00` 開始，保留原本 `MAP_CHANGE_ONE_SA_EXPERIMENT.mode='manual'` 的 w1=58／其餘 0 路徑。
- 沒有修改 `campaignMapCacheKey_` 更新、`SN_MAP_CHANGE_ALL`、`SN_MAP_CHANGE_ONE` 或 R1/R2 任何開關。

## 驗證與待審

- [TEST] R3b 實作後將對 `gate.game.dispatch.js` 執行 `node --check` 與 `git diff --check`。
- 🟡 靜態預期：9010／9011 的 SA w1 分別為 9010／9011，b5 分別為 5／8，客戶端能在自己的 MapInfoList 找到對應 index。
- ⬜ 前置 status gate 的兩個欄位尚未能從組語命名；它們不在本次 payload 改動範圍。
- ⬜ UI 提示是否消失留待操作者實測，本分支不自行測試。

## R3b 更正摘要

- R3 的 10-byte SA body 結論已被 [OBS] 實測失敗與 [DLL] 前置檢查共同推翻，不再把 SA 封包格式寫成 CQ 同格式。
- R3b 只修正 `0x00220222` 的組裝長度與 payload 起點；地圖狀態更新、`0x00220226`、`0x00220223` 與既有開關值均不動。

## 收尾實測

- [LOG] 實測送出 `Map_Change_One_SA` bodySize=16，hex=`0000000000000033233c000800000000`。
- [OBS] 6-byte 全零成功標頭後接 10-byte payload 的格式下，客戶端不再跳「無法變更設定」。
- [TEST] Claude 高階已完成伺服器與客戶端驗證；R3 原本的 10-byte SA 假設維持被推翻，R3b 開關固定為 enabled。
