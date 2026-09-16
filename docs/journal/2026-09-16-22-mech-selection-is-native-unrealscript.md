# 選機體是 UnrealScript native ✅ 已確認 [DLL]

> 從 docs/opcode-ledger.md 第 1551–1565 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`UZNetwork_DJ::execGame_Slot`(`0x10704278`)是 UnrealScript native:取兩個 int 參數,
直接呼叫 `ZDispatchGame::ChangeSlot_CN(a, b)`。也就是玩家在選機體畫面按下去,
腳本呼叫 `Game_Slot(x, y)`,客戶端就送 `0x00230101`,伺服器應以 `ChangeSlot_SN 0x00230102` 回應。

玩家回憶的進圖流程(有影片佐證):任務簡報動畫 → 選機體 → 畫面右側 F1~F5 技能列
(消耗 SP 30/30/50/200/300:攻擊力、防禦力、裝填、核心 EMP、憤怒模式),
標籤 `RESPAWN 0 / KILL 0`;進入後 RESPAWN 變成 4,才能操控機體。
DLL 側對應的候選:`Game_User_Sally_Add`(出撃)、`Game_Item_InstantRespawn_Get/Set`、
`Item_InstantRespawnCount_Get`(`Game_Info_SN` 最後一行就呼叫它)、
`Game_User_State_All_Set`(`Game_Play_Start` 以 `(1, false)` 呼叫)。⬜ 尚未驗證。

---

