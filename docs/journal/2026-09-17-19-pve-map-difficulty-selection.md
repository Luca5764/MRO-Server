# 照客戶端選的 PvE 地圖／難度開房（2026-09-17）

依據：`2026-09-17-18-create-cq-map-difficulty.md`（G4，Gemini 分析，Claude 已核對）。

## 改動（單一變數：Game_Info_SN 的地圖改用客戶端選的 MapIndex）

- `dispatch/gate.game.dispatch.js` 建房（`0x00220201`）：`campaignMapCacheKey_` 原本寫死 9001，改成 `body[2..3]`（MapIndex，`ZDispatchLobby::Create_CQ` `0x107e5cc0`）；只接受 9001～9012，否則仍用 9001。
- 同檔 `Map_Change_One_CQ`（`0x00220221`）：`w1`（MapIndex，`0x107eec8a`）在 9001～9012 時更新 `campaignMapCacheKey_`，並把 `b5`（MapRound，`0x107eeccb`）寫進 `playRound_`。原本這兩個值只寫進 log。
- `sendGameInfoSn`（body+0x11 地圖、+0x15 回合）、`Map_Change_One_SA` 的 `current_cache`、房間地圖重送都讀 `campaignMapCacheKey_`，所以不用改。`session.js` 已經跨重連保存這兩個欄位。
- 伺服器 20:3x 重啟。

## 注意

- [SRC] 客戶端建 PvE 房的預設地圖是 `DefaultMap == 3` 且 `PlayPve == 1`（易），也就是 **9010 `Map_PC04` 潛入作戰**，腳本是 `ZModePve.ZSetCoreModePve`（不是 PC01 的 `ZModePve.ZModePve`）。這個模式我們還沒跑過，可能有新的問題。
- 🟡 `Ready_Host_SN` 裡的地圖名稱用 `CACHE_INDEX_TO_MAP_NAME_GG[campaignMapCacheKey_]`，查不到時用 `Map_PC01`；host 自己的 travel URL 由客戶端用 Game_Info 的地圖組，不受影響，但之後多人加入時要處理。

## 待測

見 `docs/next-test.md` 測試 R。
