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

## 測試 R 初步（20:31）

- [LOG] 建房 `Create_CQ` MapIndex=9010 → 伺服器 `Game_Info_SN` 送 map=9010、round=5（`session-20260917-202852.jsonl` 12:31:26）。
- [LOG] 12:31:32 客戶端送 `Map_Change_One_CQ w1=9001 b5=5` → 之後 `Game_Info_SN` 都是 9001，載入的是防禦（動力奪取戰）。
- [OBS] 操作者澄清：那次是自己在房間裡改了選擇；**什麼都不動直接開始，載入的就是潛入作戰（9010）**。所以建房與改圖兩條路徑都照客戶端的選擇生效。
- 🟡 仍待注意：`room.dispatch.js` `sendRoomState`（約 1198–1222 行）的房間資訊裡，地圖仍用 `MAP_ID_DEFAULT_PVE`（9001）與舊的 `CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID[mapId]`（58）選 `SN_MAP_CHANGE_ONE`；目前沒看到影響，暫不改（一次一個變數）。

## 測試 R 後續（20:32–20:38 以後）

- ✅ [LOG] 第二局照預設建房（9010 潛入作戰，`ZSetCoreModePve`）：可以正常玩約 5.5 分鐘，大量 Death_CN 類型 `0x15`、兩次 `0x51`；玩家陣亡 3 次（前兩次正常重生），12:38:13 最後一次陣亡後立刻 `Campaign_CN 01 00 02` → `EndGame_SN`。[OBS] 回到房間，再打了第二場。
- 小問題：12:38:18 遊戲結束後仍然送了 `Respawn_SN`（5 秒倒數沒取消）；客戶端已離開場景 6，應該會被丟棄。之後在 Campaign_CN 時取消。
- [OBS] **機庫看不到機體**。🟡 推測跟 ItemInfo 目前沒有送機體本體（part_slot=0）以及 slot 3／5 有關（0x400 大小限制、測試 B 未做，見 state.md 第 2 節），所以「選機體」要跟 ItemInfo 分包一起處理；也不能排除 Grade 改成 0 之後的影響（未驗證）。
- [OBS] 卡頓看起來是隨機的，跟擊殺或生怪沒有明顯關係。
