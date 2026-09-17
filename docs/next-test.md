# 下一輪要測的（2026-09-17 16:30）

背景：`journal/2026-09-17-10-sol-review-input-failure.md`（測試 F～I）。測試 I：打開選項再取消就能修好。

## 測試 J：只開關 Esc 選單

不改程式、不改設定檔。

1. 進 PvE，確認左鍵不能用。
2. 按 Esc 叫出 GAME MENU → 按「取消」（或再按一次 Esc）關掉，**不要進選項**。
3. 試左鍵、Space。
4. 如果不能用，再做：Esc →「選項」→ 取消，確認這樣能用。
5. 隊伍聊天回報。

判讀：
- 只開關 Esc 選單就能用 → 任何 GUI 開關（`PushMenu`／`CloseMenu` 內的 `ResetInput`）都能清掉這個狀態，問題是開局時 GUI／輸入狀態殘留。
- Esc 選單不行、選項才行 → 跟選項頁特有的動作有關（`OnNeedRawKeyPress`／`bRequireRawJoystick` 重設，或選項頁初始化）。
