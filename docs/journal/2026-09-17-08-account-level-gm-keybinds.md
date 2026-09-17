# 按鍵沒反應的根因候選：帳號權限 4 讓客戶端套用 GM／觀戰按鍵（2026-09-17）

原始碼來自 `~/mro-decrypted/src`（見 07 篇，不 commit）。以下 [SRC] 都是解密後的腳本原始碼。

## 證據鏈

1. ✅ [SRC] `Engine/LevelInfo.uc` 約第 517 行，`GetLocalPlayerController()` 第一次取得本地 controller 時：`PC.IsMeGM_BD()` 為真就呼叫 `OptionAll.ApplyGMControl(PC)`；否則呼叫 `ApplyControl(PC)`，PvE 再加 `ApplyPveController(PC)`。
2. ✅ [SRC] `ZBase/DefaultPlayerController.uc:9101` `IsMeGM_BD()` 回傳 `ZNetwork_DJ.My_Account_Spectator_Check()`；`ZNetwork/ZNetwork_DJ.uc:1306` 判斷的是 `m_MyAccountLevel >= 1`。第 823 行的註解：`0:일반(一般), 1:관전자(觀戰), 2:사회자(主持), 3:운영자(營運), 4:개발자(開發)`。
3. ✅ [SRC] `Engine/OptionAll.uc:911` `ApplyGMControl`：**Fire／AltFire 的綁定被註解掉**；左鍵改成 `ViewPrevPlayer_BD`、右鍵 `ViewNextPlayer_BD`、Space `ViewModeChange_BD`、LShift `button MaxGmMoveCamera_BD`、1～0 `SetViewPlayer_BD n`。一般的 `ApplyControl`（第 760 行）才是 Fire、AltFire、`SwitchWeapon 1-4`、`ChangeKit`（R）、`EventButtonClick`（Shift）。
4. ✅ [DLL] `ZNetwork.dll` `ZDispatchAccount::DefaultInfo_SN`（thunk `0x1070a1a0` → `0x107c0d40`）：`atoi(body+0)` 後呼叫 `UZNetwork_DJ::Account_UserType_Set`。decompile：`docs/research/2026-09-17-fire-gate/DefaultInfo_SN.c`。
   - 🟡 `Account_UserType_Set` 寫的就是 `m_MyAccountLevel`，這點是從名稱推的，還沒核對欄位偏移。
5. ✅ [LOG] 伺服器送的 `DefaultInfo_SN 0x00210101` body 開頭是 `34 00`（字串 `"4"`）；DB 的 `lucas` 是 `account_level=4`，`db.js` 建帳號時固定給 4。`ACCOUNT_LEVEL_STR` 沒有 0，所以查不到時會退回 `"1"`，一樣是觀戰權限。

## 跟觀察對得上的地方

- 左鍵、右鍵、Space、1～4、Shift 在 GM 綁定下都是切換觀戰視角或攝影機的指令，所以一般玩家的動作全部沒反應。WASD 和視角兩種綁定都有，所以可以動。
- 🟡 R（`ChangeKit`）和 F（`CaptureButtonClick`）兩種綁定都有，但也沒反應，還沒解釋。可能是 PvE 或當下狀態擋掉了，要看測試結果。
- ⬜ 9 行 `RadioChat_Sel 0`（`ZBase/DefaultHud.uc:4238`）是哪個鍵觸發的，還不知道。

## 改動（單一變數：帳號權限）

- `tools/set-account-level.js`：用 committed 腳本改 DB，已執行 `lucas: 4 -> 0`。
- `dispatch/account.dispatch.js`、`gamelogin.dispatch.js` 的 `ACCOUNT_LEVEL_STR` 補上 `0: '0\0'`，否則 0 會被送成 `"1"`。其他等級的輸出不變。
- `db.js` 新帳號預設的 4 **先不改**，等測試確認後再說。
- 伺服器已經在 13:10 重啟（`session-20260917-131036.jsonl`）。

## 待測

見 `docs/next-test.md` 的測試 C。

## 補充：為什麼訓練場可以開火

- [OBS] 操作者回報：同一個帳號（權限 4）進訓練場時，開火和裝備都正常。
- ✅ [SRC] `ZModeHangar/HangarPlayerController.uc:309`：`TrainingMenuOpen(IsStart=true)` 會**直接**呼叫 `OptionAll.ApplyControl(self)`，不檢查 `IsMeGM_BD()`，所以一般按鍵會蓋掉 `LevelInfo` 之前套的 GM 按鍵。
- 🟡 PvE（`ZPvePlayercontroller`）沒有這種強制重綁，只靠 `LevelInfo.GetLocalPlayerController()` 的判斷，所以 PvE 會停在 GM 按鍵。這樣訓練場正常、PvE 不正常就說得通，也支持 08 篇的根因候選。

## 測試 C 結果（13:13–13:15，`session-20260917-131036.jsonl`）

- ✅ [LOG] `DefaultInfo_SN 0x00210101` body 開頭已經是 `30 00`（`"0"`）。
- [OBS] 操作者用隊伍聊天回報：「剛剛全部重新嘗試過了還是沒效果」。
- ✅ [LOG] 開局後 client→server 只有 `0x00420114`、`0x00420117`、`0x00230151`、兩句聊天、`0x00230123`，按鍵動作仍然沒有送出封包。
- [LOG] `MetalRage.log` 跟權限 4 時不同：多了 `#### RadioChat can not found.!!!!! PilotCode : [ 101 ] Select_Num : [ 1 ] ####`，`RadioChat_Sel 0` 從 9 行變 3 行。可見按鍵綁定或狀態確實有變，但光改這個不夠。
- ❌ **只改權限不能解決按鍵沒反應。** 權限 ≥1 會套用 GM 按鍵這件事仍然成立（[SRC]），但不是唯一的原因。

## 為什麼權限先維持 0，不照原計畫改回 4

- ✅ [SRC] `ZModePve/ZPvePlayercontroller.uc` 約第 1440 行，`state PlayerSelectMech` 的 `BeginState`：`IsMeGM_BD()==true` 會直接 `GotoState('Spectating')`。所以權限 ≥1 時，PvE 無論如何都進不了一般玩家流程，一般帳號本來就該是 0。這跟 `next-test.md` 寫的「沒效就改回 4」不同，理由就是這一段原始碼。

## 下一條線（待查）

- [SRC] 同一個 state 顯示 PvE 的正常流程是：`PlayerSelectMech` → `Game_Play_Check()` 為真時 `OpenSlotSelectPage()`（`ZGameMidMenu.ZSlotSelectPage`，選機體）→ `LoadPlayers()` → 片頭影片結束（`bIsSendEndMovie`，約第 1035 行）→ 有 Pawn 就 `GotoState('PlayerWalking')`。這個 state 裡的 `exec function Fire` 是空的。
- 🟡 [GUESS] 我們用 `Respawn_SN` 直接生出 Pawn，可能跳過了這個流程，controller 停在不能開火的 state。要查出實際停在哪個 state，以及哪個伺服器封包會推進它。

## 狀態追查（子 agent 報告 + Claude 抽查，同日）

- 🟡 [SRC] 子 agent（中階，待審）：`ZBase/DefaultHud.uc:4221` `RadioChat_Sel` 在 `PC==none || PC.IsSpectating() || PC.Pawn==None` 時會直接 return，不會印 `RadioChat_Sel 0`。所以測試 C 時本地 PC **有 Pawn、也不在 Spectating**。這跟「卡在 `PlayerSelectMech`」的猜測衝突（那個 state 通常沒有 Pawn）。它推論 PC 應該已經在 `PlayerWalking`（由 `Engine/PlayerController.uc` `Restart()`→`EnterStartState()` 進入），但在 `PlayerWalking` 的 Fire 流程裡**沒找到**會靜默擋掉輸入的程式碼。
- ✅ [DLL] `RadioChat_Sel N` 是 `WinDrv.dll` 原生程式送出的：視窗程序 `0x11114bdf` 附近的 `WM_KEYDOWN`（case 0x100／0x104），先對所有 `< 0xff` 的鍵呼叫 `CauseInputEvent`，接著對數字鍵 `0x30–0x39`／`0x60–0x69` 額外執行 `RadioChat_Sel n`。decompile：`docs/research/2026-09-17-fire-gate/WinDrv_WndProc_keydown.c`。所以鍵盤事件確實有進到引擎的輸入系統，數字鍵觸發的 `RadioChat_Sel` 跟開火無關。
- ✅ [檔案] `System/User.ini`、`DefUser.ini` 的 `[Engine.PlayerInput]` 是空的，**所有按鍵綁定都來自腳本執行時的 `setinput_BD`**（`Engine/OptionAll.uc`）。
- ⬜ 仍然不知道：開火按鍵事件在哪裡被吃掉（綁定沒生效、GUI 攔截、還是 state）。

## 關鍵分界：只有「會呼叫 exec 函式」的綁定失效（同日）

- [OBS] 操作者：按 W 時機體真的會走（不是只有鏡頭動），也可以蹲下（Ctrl）；畫面上方的 "Protect the strategy fusion" 橫幅一直都在。
- ✅ [DLL] `Engine.dll` 內建的 alias 表（UTF-16 字串，`UInput::Exec` 附近）：
  - 可用：`MoveForward`=`Axis aBaseY ...`、滑鼠 `Axis aBaseX/aLookUp`、`Duck`=`Button bDuck | Axis aUp Speed=-300.0`，**只有 Axis／Button**。
  - 失效：`Fire`=`Button bFire | Fire`、`AltFire`=`Button bAltFire | AltFire`、`Jump`=`Jump | Axis aUp Speed=+300.0`、`EventButtonClick`=`Button bEventButtonClick_MH | EventButtonDown_MH`，以及 `SwitchWeapon n`、`ChangeKit`，**都有 exec 函式呼叫**。
  - `CaptureButtonClick`=`Button bCaptureButton`（F）只有 Button 也失效，⬜ 可能是腳本端另有條件。
- ✅ [LOG] 走 Console／HUD 的 exec 可用：`TeamTalk`（`Engine/Console.uc:147`）、`RadioChat_Sel`（`ZBase/DefaultHud.uc:4221`，由 WinDrv 直接送出）。
- 🟡 [GUESS] 所以問題縮小成：「送到 PlayerController（或 Pawn）的 exec 呼叫沒有生效」。可能是呼叫被 exec 鏈中更前面的物件吃掉，或是 PlayerController 所在的 state 把這些函式覆寫成空的。
- ✅ [DLL] exec 鏈在 `UPlayer::Exec` `0x104d8120`（decompile：`docs/research/2026-09-17-fire-gate/UPlayer_Exec.c`）：依序問 Actor+0xa0 物件、Level 的 +0x630、Actor+0x740／+0x8dc／+0x8ec、PlayerController 本身、+0x8e4、Pawn（+0x3c0）、Pawn+0x494／+0x49c，任何一個回傳非 0 就停止。各偏移分別是什麼物件還沒對應。
- [SRC] 腳本裡在 controller 之外定義 `exec SwitchWeapon` 的只有 `ZBase/DefaultHud.uc:4259`（`state RadioMsgShow_Pressed`，無線電選單開著時擋住換武器），沒有找到其他物件定義 `exec Fire`／`Jump`。
