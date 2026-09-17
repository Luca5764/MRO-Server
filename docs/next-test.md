# 下一輪要測的（2026-09-17 14:30）

背景：`journal/2026-09-17-08-account-level-gm-keybinds.md` 最後一節。靜態讀程式碼卡住了，需要執行期的數值。

## 測試 E：開遊戲內建除錯畫面（ShowDebug）

- 經操作者同意，`C:\Games\MetalRage Online\data\System\User.ini` 最後加了：
  ```
  [Engine.Input]
  End=ShowDebug
  ```
  原檔備份為 `User.ini.bak-20260917`。伺服器、DB 都沒動。
- 還原方式：把 `User.ini.bak-20260917` 複製回 `User.ini`。

步驟：
1. 完全關掉客戶端再開（設定檔在啟動時才讀）。
2. 進 PvE，機體出來後按一下 **End**。畫面左上應該會出現很多行除錯文字。
3. 截圖：`tools/win/shot.sh`（或告訴 Claude，由 Claude 截）。
4. 站著不動截一張；按住左鍵時再截一張；按 Space 之後再截一張。
5. 再按一次 End 可以關掉。

要看的：`bJumppreparation_JW`、`MechSituation`、`BoosterPower`、`bBooster_JW`，以及畫面上有沒有 controller／state／weapon 相關的行。

如果按 End 沒反應：可能這個客戶端不讀 `[Engine.Input]`，Claude 再找別的方法。
