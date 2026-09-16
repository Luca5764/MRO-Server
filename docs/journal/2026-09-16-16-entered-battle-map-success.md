# ✅✅✅ 進入戰鬥地圖成功（2026-09-16 18:14）

> 從 docs/opcode-ledger.md 第 1289–1329 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 伺服器驅動開戰流程 + `Ready_Host_SQ`,**客戶端成功 travel 到 `Map_PC01` 並載入 3D 戰鬥場景**（畫面：MISSION BRIEFING / Protect the strategy fusion / CAMPAIGN MODE，沙漠戰場實景）。

travel URL：
```
start Map_PC01?Listen?LPort=30907?Name=1?Game=ZModePve.ZModePve
  ?MaxPlayers=1?GoalScore=0?TimeLimit=1?BalanceTeams=0?numbots=0?team=255
```

`Map_PC01` + `ZModePve.ZModePve` = 地圖與遊戲類別皆正確。**這是整個專案第一次真正進入對戰。**

### 有效的流程（`SERVER_DRIVEN_START_MODE = 'enabled'`）

收到 `0x00222103`（F5）後,伺服器主動:
```
Game_Wait_SN 0x420111    → 阻止房主 F5 的即時 travel,推客戶端進等待狀態
Game_Info_SN 0x222111    → 場景 6 handler 設地圖 [0xfc8]=9001 + Game_Play_Start
Game_Ready_SN 0x222102   ┐
Game_Start_SN 0x222104   � 放行 Loading
Ready_Host_SQ 0x420113   ┘
Game_Info_SN 0x222111    → retry
```
之後房主的 `ZPage_Room.GameStart` 讀到已設好的 `[0xfc8]`=9001,travel 到 `Map_PC01`。

### 更正先前的錯誤結論

前文曾斷言「房主在房間按 F5,`[0xfc8]` 結構上不可能非 0」——**錯誤**。伺服器驅動的 `Game_Wait_SN` 先把客戶端推進場景 6,`Game_Info_SN` 遂由場景 6 的 handler 處理並設好 `[0xfc8]`,F5 的 travel 便讀到正確地圖。靜態分析看似的死局,實測即通。

### 仍待處理（次要）

⬜ `team=255`（未阻止進地圖,但玩家隊伍未定）
⬜ `TimeLimit=1`（應為 60；可能是 Game_Info_SN body 某欄位）
⬜ `MaxPlayers=1`

### 下一步:真實對戰封包

玩家已在地圖內。客戶端此後送出的 `0x0023xxxx` / `0x0025xxxx` 即真實對戰封包,可用於驗證今日反編譯得出的映射（`Death_SN 0x230107`、`Respawn_SN 0x230103`、`Assist_SN 0x230106` 等）。

---

