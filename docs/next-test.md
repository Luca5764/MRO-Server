# 下一輪要測的（2026-09-17 16:00）

背景：`journal/2026-09-17-10-sol-review-input-failure.md`（測試 F、G）。

## 測試 H：進 PvE **之前**先儲存按鍵設定

不改程式、不改設定檔。

1. 完全重開客戶端，登入。
2. 在 Hangar／大廳（**還沒開始 PvE**）打開選項 → 按鍵設定 → 什麼都不改，按儲存。
3. 照常開始 PvE。
4. 進場後**不要**再開設定頁，直接試左鍵、Space、Shift。
5. 用隊伍聊天打 marker 回報結果。

判讀：
- 能用 → 綁定會跨關卡沿用，只是進 PvE 前一直沒被正確套用過（問題在 Hangar／大廳階段）。
- 不能用 → PvE 開局會主動把綁定改掉（問題在 PvE 載入時，例如 `LevelInfo.GetLocalPlayerController` 的 GM 分支，或其他重設）。
