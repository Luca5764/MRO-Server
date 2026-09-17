# 下一輪要測的（2026-09-17 14:00）

背景：`journal/2026-09-17-08-account-level-gm-keybinds.md` 最後一節。只有會呼叫 exec 函式的按鍵失效。這一輪要分辨：「所有送到 PlayerController 的 exec 都失效」，還是「只有 Fire／Jump／SwitchWeapon 這幾個被擋」。

**不改任何程式或設定**，伺服器照舊（`lucas` 權限 0）。

## 測試 D：exec 探針

進 PvE 後，**站著不動**，用隊伍聊天打 marker，一次做一件事：

1. `D1 Q`：按住 Q 約 2 秒，再按住 E 約 2 秒。
   - 綁定：`Button bSideSearchLButtonClick_JW | SideSearchL_JW`，exec 在 PlayerController（`ZBase/DefaultPlayerController.uc:7815`）。
   - 預期：站著不動時，鏡頭會往左／右側移，而且有音效。
2. `D2 Tab`：按住 Tab。
   - 綁定：`Button bTabKeyPressed_YC | ShowScores`，exec 在 HUD（`Engine/Hud.uc:230`）。
   - 預期：出現計分板。
3. `D3 G`：按 G。
   - 綁定：`Button bBackViewBtnClick_YC | BackViewBtnClick_YC`，PlayerController。
   - 預期：後視鏡頭。

判讀：
- Q／E 有效 → PlayerController 的 exec 路徑正常，問題在 Fire／Jump 這幾個函式本身或所在的 state。
- Q／E 沒效、Tab 有效 → 送到 PlayerController 的 exec 全部被擋，要查 `UPlayer::Exec` `0x104d8120` 那條鏈。
- 全部沒效 → 範圍更大，連 HUD 的 exec 都失效。
