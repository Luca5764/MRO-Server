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

## 測試 E 結果與 E2（14:20）

- [OBS] 按 End 沒反應。
- [DLL] `UInput::StaticConfigName` `0x10321fa0` 回傳 `"User"`；`StaticInitInput` `0x10467570` 用 `EInputKey` 名稱去掉 `IK_` 當 config 鍵名（`End`）。`setinput_BD`（`UInput::Exec` `0x104683c0`）只清掉「同一個指令綁在別的鍵」的重複綁定，不會清掉整張表。decompile：`docs/research/2026-09-17-fire-gate/UInput_Init.c`、`UInput_Exec.c`。
- [SRC] ZPveHud.PostRender 有呼叫 `super.PostRender`，理論上會走到 `DefaultHud.uc:1377` 的 debug 繪製。
- 所以要先分清楚：是「User.ini 的綁定沒讀進來」，還是「ShowDebug 有執行但沒畫出來」。

**E2**：User.ini 改成
```
[Engine.Input]
End=ShowScores
Insert=ShowDebug
PageDown=ShowDebug
```
1. 完全重開客戶端，進 PvE。
2. 按住 End：**有沒有出現計分板**（跟 Tab 一樣）。
3. 按 Insert，再試 PageDown：有沒有除錯文字。

判讀：End 沒有計分板 → User.ini 綁定根本沒讀，要換方法；End 有計分板但 Insert／PageDown 沒有除錯文字 → 綁定有效，問題在 debug 繪製。
