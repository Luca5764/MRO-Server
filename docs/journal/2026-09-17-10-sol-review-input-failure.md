# Codex Sol 審查：PvE 按鍵失效推論（2026-09-17）

審查者：Codex reviewer（GPT-5.6 Sol，高階，唯讀沙箱，跨公司審查 Claude 的 05～09 篇）。請求契約：`docs/research/2026-09-17-fire-gate/review-request-sol.md`。耗時約 13 分鐘，完成後 Claude 已關閉 session。以下是報告重點，另附 Claude 的抽查結果。

## Sol 的主要意見

- ❌ 「R、1、F 失效，所以跟 Fire 有共同上游」**不成立**：
  - R：彈匣滿（`080/0720`）時，`ChangeKit` 本來就不做事（`ZBase/W_DPCForWeapon.uc:894-908`）。
  - 1：選目前這把武器時，`AllowChangeWeapon` 會回傳 false（`W_DefaultMechForWeapon.uc:124-176`）。
  - F：只有在可互動的情境下才有效果（`ZPvePlayercontroller.uc:638-653`）。
  - 所以 R、1、F **不能拿來當探針**。
- ❌ 排除「卡在 `PlayerSelectMech`／`RoundEnded`／`GameEnded`」：這些 state 沒有能推動 Pawn 的 `PlayerMove`，或只送零加速度（`DefaultPlayerController.uc:3620-3647, 3929-3958`），跟 WASD 能走矛盾。
- ✅ 排除 `bNoInputKey_JW`：它會同時把 `aBaseY/aStrafe` 清零（`DefaultPlayerController.uc:1316-1331`），跟能走矛盾。`MechSituation`、`Level.Pauser`、`bPauseGame_BD` 也都排除了。
- ❌ 「`InitializeMech` 沒有跑完」證據偏向反面。
- **關鍵盲點**：「權限 0 已經套上一般按鍵表」**沒有被證明**。目前確認能用的鍵（WASD、蹲、Q／E、G、Tab、F1、聊天）**在 GM 表和一般表裡都一樣**；真正能區分兩張表的鍵（左右鍵、Space、Shift、1～4）剛好全部失效。
- 最可能根因：
  1. 🟡 PvE 的 UInput 仍然是 GM 按鍵表，或 `ApplyControl` 沒有在正確時機生效。這一條就能解釋滑鼠左右鍵、Space、Shift、1～4 全部失效。
  2. 🟡 另一個獨立的 Fire 問題（武器停在 `WS_Select`），證據偏弱。
- 封包面：`Game_Info_SN` 只有地圖、隊伍、時間等欄位；`Respawn_SN` 只用 user index 觸發生成；只有 `Game_User_SN` 的武器／booster ID 會影響 `Weapons_UJ`，而測試 C 送的是非零的標準配裝。

## Claude 抽查

- ✅ [SRC] 核對 `Engine/OptionAll.uc`：Q／E（`SideSearch*`）、G、Tab、F1、聊天在 `ApplyGMControl`／`ApplyControl` 兩張表裡**都有綁**；GM 表把左鍵、右鍵、Space、LShift、1～0 改成觀戰指令。Sol 的盲點成立。
- ✅ [SRC] `ZGameMainMenu/ZPanel_Option_KeySetting.uc:576-588`：按鍵設定頁套用時會呼叫 `OptionAll.ApplyControl(PC)`，PvE 再加 `ApplyPveController(PC)`；同時還會呼叫 `Option_Game_Set`（會送一個選項儲存封包到伺服器）。
- ✅ [DLL] `UZNetwork_DJ::Account_UserType_Set`（thunk `0x10702324` → `0x10717240`）把值寫進 `[ecx+0x4d0]` 和 `[ecx+0x514]`；哪一個是腳本的 `m_MyAccountLevel` 還沒核對。
- 下一步照 Sol 的實驗 1 做（見 `docs/next-test.md` 測試 F）。

## 測試 F 結果（15:35，`session-20260917-131036.jsonl` 最後一段）

- ✅ [OBS] 操作者：在 PvE 裡開按鍵設定頁、按儲存之後，**全部都可以控制了**（開火、跳、推進器等）。
- ✅ [LOG] 儲存時客戶端送出 `0x00221221`（501 bytes，ASCII，`\x05` 分隔：`false|1.40|（8 個空的 chat macro）|87|83|65|68|32|17|81|69|84|89|85|221|219|66|49|50|51|52|82|70|16|1|2|90|88|67|86|44|77|71|`）。伺服器目前走 fallback，回 16 bytes 空包。
- ✅ **結論：PvE 開局時沒有套上一般按鍵表；重新執行 `OptionAll.ApplyControl` 就能恢復。** Sol 的根因 1 成立。Fire 不是另一個獨立問題（Sol 的根因 2、Claude 的 `WS_Select` 推論都不需要）。06 篇的武器 `+0x41c` 閘門描述仍然正確，只是跟這次症狀無關。
- 本地 `System/OptionAll.ini` 在 15:35:58 被改寫，`op_Keyboard` 是標準值（`Key_Fire=1`、`Key_Jump=32`…），`FirstRunOption=1`。

## 選項封包（DLL，Claude）

decompile：`docs/research/2026-09-17-fire-gate/Option_Game.c`。
- ✅ [DLL] `ZDispatchCommunity::Option_Game_CQ`（`0x107d2e90`）：送 `0x00221221`，body 是最長 501 bytes 的 ANSI 選項字串（header 內 `0x205` 就是 body 長度）。
- ✅ [DLL] `Option_Game_SA 0x00221222`（`0x107d10a0`）：**不檢查 body**，只把 header 的 status／result 丟給事件 `NETWORK_OPTION_GAME`；腳本端 `ZGameMainMenu/ZGUIController.uc:384` 對這個事件什麼都不做。
- ✅ [DLL] `Option_Game_SN 0x00221211`（`0x107d1120`）：body+0 是 ANSI 字串（≤501）→ `Option_Server_Game_Set`（`0x10714f70`）：開頭不是 `\x05` 就改用 DLL 內建的預設字串（`0x108139e0`；`0x10813740`／`0x10813890` 也是同一份預設，滑鼠靈敏度 `2.50`），寫進 `+0x1674`，再複製到 `+0x1654`（`Option_Info_Get().GameOption`）。
- ⬜ 伺服器從沒送過 `Option_Game_SN`。這跟「開局沒套上一般按鍵表」有沒有關係**還沒證實**：本地 ini 的按鍵值是正常的。為什麼開局會是 GM／錯誤的按鍵表，仍然待查。

## 測試 G（15:50 左右）

- [OBS] 測試 F 儲存過按鍵之後，完全重開客戶端再進 PvE，**不開**設定頁：左鍵、Space 還是不能用。
- ✅ 所以每次 PvE 開局都會出現錯誤的按鍵表，儲存的效果不會延續到下一次啟動（即使本地 `OptionAll.ini` 已經是標準值）。
- 🟡 [SRC] 可能的機制（未證實）：UInput 物件跨關卡沿用，綁定只在 `LevelInfo.GetLocalPlayerController()` 第一次找到 PC 時套用（`Engine/LevelInfo.uc:502-533`）；如果 `LocalPlayerController` 已經先被設定，或套用時機不對，PvE 就會沿用前一個關卡（Hangar／大廳）留下的綁定。
- 下一個觀察（測試 H）：在 Hangar 開始 PvE **之前**先到按鍵設定按儲存，再進 PvE，看按鍵能不能用，藉此分辨「PvE 開局主動覆寫了綁定」還是「沿用了進 PvE 前的綁定」。

## 測試 H 與權限寫入點（16:10 左右）

- [OBS] 在 Hangar 先到按鍵設定按儲存，再開始 PvE：**還是不能用**。✅ 所以 PvE 載入時（或載入之後）按鍵綁定被弄壞了，不是沿用進場前的綁定。
- ✅ [DLL] `Account_UserType_Set`（`0x10717240`，寫 `+0x4d0`／`+0x514`）只有一個呼叫點：`0x107c0e3c`，位於 `DefaultInfo_SN` 內。另一個存取點 `0x107f6b60` 在 `FUN_107f6700`，是整個物件的複製（operator=）。所以**只有 `DefaultInfo_SN` 會改變帳號權限**；測試 C 以後送的都是 `"0"`。
- ✅ [LOG]／[SRC] 測試 C 的 `RadioChat_Sel 0` 只有在 `!PC.IsSpectating()` 時才會印（`DefaultHud.uc:4230`），而且 PvE 的 `PlayerSelectMech.BeginState` 遇到 GM 會轉 Spectating（`ZPvePlayercontroller.uc` 約 1447 行）；兩者都表示 PvE 執行時 `IsMeGM_BD()` 為 false。
- 🟡 所以 Sol 說的「PvE 仍是 GM 按鍵表」要修正成「**開局套用的一般按鍵表沒有生效，或之後被弄壞**」。`LevelInfo.GetLocalPlayerController` 的 GM 分支（權限 0 時）應該不會走到。
- ⬜ 還要分辨：到底是「重新執行 `ApplyControl`」修好的，還是「打開再關閉選項頁（GUI）」修好的。測試 I 用來分辨這兩者。

## 測試 I：打開選項再取消也能修好（16:25 左右）

- ✅ [OBS] PvE 內 Esc →「選項」→ **取消**（不儲存），回到遊戲後按鍵就能用。所以修好的不是 `ApplyControl` 重新綁定，而是**開關選項 GUI 的某個副作用**。前面「按鍵表沒套上」的結論要改成「輸入被某個 GUI／輸入狀態擋住，開關選項頁會把它清掉」。
- [SRC] 選項頁（`ZGameMainMenu/ZPopup_OptionInGame.uc`，extract 時漏掉，已手動補抽到 `~/mro-decrypted/src`）的 `InternalOnClose`（第 255 行）會清 `Controller.OnNeedRawKeyPress = none` 和 `Controller.Master.bRequireRawJoystick = false`。另外 `XInterface/GUIController.uc` 的 `PushMenu`／`CloseMenu`／`RemoveMenu` 都會呼叫 native `ResetInput()`。
- ✅ [DLL] `UGUIController::ResetInput`（XInterface.dll `0x100359c0`）：清掉 GUI 自己的按鍵表（`+0x25c`，255 bytes）、`+0x248`、`+0x144/+0x148`，再改 `+0x24c` 的旗標位元，並通知 active／focused 元件 `MenuStateChange`。decompile：`docs/research/2026-09-17-fire-gate/GUIController_ResetInput.c`。
- ✅ [DLL] `UInput::PreProcess`（Engine.dll `0x10466fe0`）：按下時若 `KeyDown[key]`（`+0xf6c`）已經是 1 就丟掉這次按下，放開時才清掉。decompile：`UInput_PreProcess.c`、`UInput_Process.c`。
- [SRC] `OnNeedRawKeyPress`／`bRequireRawJoystick` 只有在按鍵設定頁點按鈕時才會被設定（`ZPanel_Option_KeySetting.uc:735`、`PadSetting.uc:485`、`GUI2K4/KeyBindMenu.uc:185`），開局不會自動設。
- 下一步：測試 J，分辨是「任何 GUI 開關（Esc 選單）」就能修，還是只有選項頁才行。

## 測試 J 與重新解讀測試 I（16:40 左右）

- [OBS] 只開關 Esc 選單（GAME MENU）：**沒用**。
- [OBS] 再做一次 Esc →「選項」→ **取消**：**有用**（跟測試 I 相同）。
- ✅ [SRC] 測試 I 的解讀要更正：選項頁的「取消」**也會重新綁定**。`ZGameMainMenu/ZPopup_OptionInGame.uc` `OnClick_Main` 的 `b_Cancel` 分支會呼叫 `ApplyOption(false)`（第 221 行）→ `OptionAll.ApplyOption(Level)` → 結尾無條件呼叫 `ApplyControl(PC)`（`Engine/OptionAll.uc:756`），PvE 再加 `ApplyPveController`。
- ✅ 所以 F、I、J 三個測試一致：**修好的是重新執行 `ApplyControl`**；單純開關 GUI（J）不會修好。「開局時 GUI／輸入狀態殘留」這個方向排除。測試 I 那段「不是 ApplyControl」的說法作廢。
- ⬜ 仍然不知道：PvE 開局時為什麼綁定是錯的。權限寫入點只有 `DefaultInfo_SN`（`"0"`），照理 `LevelInfo.GetLocalPlayerController` 會走一般的 `ApplyControl`。
- 下一個分辨實驗（測試 K）：`ApplyGMControl` 會把 ScrollLock 綁成 `ViewModeUIGM_BD`（`OptionAll.uc` GM 表），連按 4 次會依序設定 `bHideName_BD`、`DrawGmList_BD=false`、`bDrawTeamScore=false`、`hideBottomBar_Bd=true`（`DefaultPlayerController.uc:9569-9595`）；一般表**沒有**綁 ScrollLock。開局壞掉的狀態下，連按 ScrollLock，如果畫面底部 HUD 列消失，就證明開局套用的是 GM 表。
