# WearInfo 修正後進圖：仍為觀察者；新增 Respawn_SN 單變數實驗

> 從 docs/opcode-ledger.md 第 1623–1632 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

- ✅ 已確認 [OBS] `session-20260916-201428.jsonl` 第二次開局的 `Game_User_SN` 已使用使用者最後點選的第 8 槽：selectedMech=8、body=18200101、main=28300101。travel 仍為 team=0 / TimeLimit=10。
- ✅ 已確認 [OBS] 截圖 `shots/wearinfo-fixed-ingame.png` 仍只有 MISSION BRIEFING 與自由視角，沒有選機體 UI；本輪沒有 `ChangeSlot_CN 0x00230101`。因此 WearInfo 修正已恢復機庫，但沒有自行觸發戰鬥選槽流程。
- ✅ 已確認 [DLL] `Respawn_SN` 本體 `0x107d5b60` 讀 body+0x00 u16、body+0x02 u32 作成功條件，body+0x0A u16 作 user index；成功時使用 `Game_User_SN` 已設的 selected slot，增加 Sally、state 設 2，呼叫 `Game_Action_Revive("SUCCESS")` → `AGameInfo::eventSelectUnitSlot_BD`。
- ❌ 已排除 [TEST] 第一輪 Respawn 實驗誤送 `0x00230103`。重新執行 `tools/dispatch-map.py 0x1070139d ZNetwork.dll` 確認它不是任何 server→client handler；客戶端因此完全忽略，不能用來判斷 Respawn body 或出擊鏈失敗。
- 🟡 實驗 [DLL] 正確配對是 `Respawn_CN 0x00230103` / `Respawn_SN 0x00230104`。已將同一個 12-byte body 改送 `0x00230104`；其 handler 本體仍是已核對的 `0x107d5b60`。待重啟實測。

⚠️ 更正前文完整映射中一組系統性錯位：最新工具輸出確認 `Respawn_SN=0x230104`、`InstantRespawn_SN=0x230106`、`Timeout_SN=0x230112`、`Assist_SN=0x230122`、`Death_SN=0x230124`；舊表把多個 CN 奇數 opcode 誤標成 SN。後續以 `tools/dispatch-map.py 0x1070139d ZNetwork.dll` 的實際輸出為準。

