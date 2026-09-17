# 下一輪要測的（2026-09-17 15:30）

背景：`journal/2026-09-17-10-sol-review-input-failure.md`。

## 測試 F：在 PvE 裡重新套用按鍵設定

**不改程式、不改設定檔**，伺服器照舊（`lucas` 權限 0）。

1. 照常進 PvE，確認左鍵還是不能開火。
2. 按 Esc →「選項」→ 按鍵設定頁，**什麼都不改**，直接按「套用／確定／儲存」。
   - 這會重新執行 `ApplyControl`（`ZPanel_Option_KeySetting.uc:583`）。
3. 回到遊戲，依序試：**Space、Shift、左鍵、右鍵、2**（1 和 R 不能當探針）。
4. 用隊伍聊天打 marker 說明結果，最後關掉客戶端。

判讀：
- Space／Shift／左鍵一起恢復 → 問題在按鍵表初始化（PvE 開局時沒套上一般按鍵表）。
- Space／Shift 恢復、左鍵仍然不行 → 兩個獨立問題，Fire 另外查（武器 `WS_Select`）。
- 全部不變 → 按鍵表方向排除。

另外：按套用時客戶端會送一個選項儲存封包（`Option_Game_Set`），伺服器 log 裡要留意有沒有未處理的 opcode。
