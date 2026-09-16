# 新版開局實測：team 已修正，仍無選機體畫面（2026-09-16）

> 從 docs/opcode-ledger.md 第 1592–1599 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

- ✅ 已確認 [TEST] 重啟 tmux `server` 後，記錄 `session-20260916-200401.jsonl` 在 70.370s 送出 487-byte `Game_User_SN`，userIndex=1、team=0、selected slot raw=1、slotCount=1、body item=11200101、main item=21100101。
- ✅ 已確認 [OBS] 客戶端 travel URL 為 `Map_PC01?...?TimeLimit=10?...?team=0`，並記錄 `Login Info InName=Lucas,InTeam=0,InBrowseTeam=0,InServerIndex=1`。兩項修改的觀察特徵皆已通過。
- ✅ 已確認 [OBS] 使用者回報仍無選機體畫面；截圖 `shots/team0-first-test.png` 顯示 MISSION BRIEFING / CAMPAIGN MODE、地圖與 DEFENSE 標記，未見選機體 UI 或玩家機體。本次檢查時未收到 `ChangeSlot_CN`。
- ❌ 已排除 [TEST] 「只要 team 從 255 修成 0 就會出現選機體／機體」並不成立；先前把 spectator 全部歸因於 team 的敘述過強。隊伍表修正成功，不代表出擊條件已滿足。
- ⬜ 未知 [OBS] log 同時有 `Class''ZMechanicA 'call failed` 與 `PreLoadallPveAI_BD` 的 `DefaultPawnClass` null 錯誤；尚未判定與缺少選機體畫面是否相關，不据此修改資產或封包。

