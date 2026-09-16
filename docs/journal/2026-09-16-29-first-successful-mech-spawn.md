# ✅ 首次成功生成並持有機體（2026-09-16）

> 從 docs/opcode-ledger.md 第 1633–1647 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

- ✅ 已確認 [TEST] 記錄 `session-20260916-202706.jsonl`：客戶端送 `BeginRound_CN 0x230151` 後，伺服器回 `BeginRound_SN 0x230152`，再於 250ms 後送正確的 `Respawn_SN 0x230104`，body success=0/error=0/userIndex=2。
- ✅ 已確認 [OBS] 使用者回報「有機體了」；截圖 `shots/first-mech-spawn.png` 明確顯示第三人稱機體、準星、小地圖、280 DEFENS 與彈藥 HUD。這確認 `Respawn_SN` handler 成功走到 `Game_Action_Revive("SUCCESS")` / `SelectUnitSlot_BD`，主要 spawn 阻塞已解除。
- ⬜ 待確認 [OBS] WASD、瞄準、射擊等操控是否正常，以及死亡後重生流程。
- ✅ 清理 [DLL/TEST] 移除 `0x420114` handler 原本排程的 6 秒延遲 `BeginRound_SN`。客戶端已會自行送 `BeginRound_CN`，新的明確 handler 當場回覆；舊延遲包在 Respawn 成功後再次呼叫 `Game_Play_Start`，會把 user state 從 2 重設為 1，且攜帶無用的 map-name body，屬重複且可能破壞狀態的通知。

### 其他已確認與更正

- ❌ 更正 [DLL] `[0x1040]`、stride 0xEC 是 `Game_Item_Add` 建立的表；`Game_UserSocket_Add` 實際建立 `[0x104c]`、stride 0x68。前文將兩者混為一談不正確；開局封包確實皆有呼叫。
- ✅ 已確認 [DLL] `Respawn_SN` 本體 `0x107d5b60`：成功且玩家 state !=2 才增加 Sally、設 state=2，再呼叫 `Game_Action_Revive("SUCCESS", user, selectedSlot)`。後者在 host 旗標有效時呼叫 `AGameInfo::eventSelectUnitSlot_BD`。這是伺服器回應接到腳本出擊的明確入口，不等於初次顯示選機體 UI。
- ✅ 已確認 [DLL/OBS] `execGame_Load_Complete` → `Battle_Success_CN`，`execGame_Play_Start` → `BeginRound_CN`；本輪皆已收到，並非完全沒有載入完成通知。
- ✅ 已確認 [DLL] `Game_Play_Start` 設 `[0xfe8]` bit0、重置多項回合狀態並呼叫 `Game_User_State_All_Set(1, mode==9)`，沒有直接發送 UI 事件。
- 分析輸出與 WearInfo 組語保存在 `docs/research/2026-09-16-slots/`。Ghidra 多處 stack 變數名與實際參數錯位，欄位以組語核對結果為準。

