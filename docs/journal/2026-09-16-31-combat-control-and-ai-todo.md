# 戰鬥操控與 AI 待查（2026-09-16）

> 從 docs/opcode-ledger.md 第 1656–1662 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

- ✅ 已確認 [OBS] 使用者在機體生成後 WASD 與準心可動，死亡後可重生。
- ✅ 已確認 [TEST] 使用者連續按滑鼠左鍵期間，`session-20260916-203513.jsonl` 沒有新增任何疑似開火／攻擊的 client→server opcode；只有週期性內部 `0x00020083`。所以目前優先級是「客戶端武器 actor／裝備資料沒有使輸入事件成立」，不是先在伺服器盲回一個未知攻擊 opcode。
- 🟡 假設 [OBS] `Game_User_SN` 的 selected mech 1 欄位目前是 body=11200101、main=21100101、left=31100101、right=0、equipment/booster=41100101、skin=0，三個 `Game_UserSocket_Set` 值為 0。這些 socket 參數的語意和是否需要 serial key 尚未由 DLL 讀取端確認；不要把其他 mech 的物品直接填入。
- ⬜ 未知 [OBS] Map_PC01 沒有敵人；客戶端 log 有 `Class''ZMechanicA 'call failed` 和 `PreLoadallPveAI_BD ... DefaultPawnClass` null，尚未判定為地圖資產缺失、AI 設定缺失或戰鬥狀態封包不完整。下一步應先反編譯／檢查相關讀取端，再做單變數測試。

