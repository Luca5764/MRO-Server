# 接手驗證準備（2026-09-16）

> 從 docs/opcode-ledger.md 第 1585–1591 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

- ✅ 已確認 [OBS] 客戶端 log 實際位於 `/mnt/c/Games/MetalRage Online/data/Log/MetalRage.log`，已更正 HANDOFF 路徑。
- ✅ 已確認 [OBS] 接手時既有 log 最後一次 `Map_PC01` travel 仍為 `team=255`、`TimeLimit=1`；tmux `server` 留存輸出也為舊版 `quarter=1`。這是舊流程基準，不能當作新修改的測試結果。
- ✅ 已確認 [TEST] `gate.game.dispatch.js` 與 `room-game-user.sender.js` 通過 `node --check`。磁碟程式包含啟用 Game_User_SN、場景 6 排程及 TimeLimit=10；執行效果仍待重啟伺服器後手動開局驗證。
- ✅ 已確認 [DLL] 匯出表中 `ChangeSlot_CN` thunk 為 `0x10702d51`，`ChangeSlot_SN` thunk 為 `0x107044c6`；僅定位符號，尚未解析回應布局。

