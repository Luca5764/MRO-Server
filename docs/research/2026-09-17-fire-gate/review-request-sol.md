# 審查請求：PvE 按鍵失效（給 Codex reviewer，GPT-5.6 Sol，高階）

你是本專案的**高階 reviewer**（跨公司審查 Claude 的工作）。先讀 `AGENTS.md`（工作原則、證據標籤、陷阱表）。**唯讀**：不改任何檔案、不 commit、不啟動或停止伺服器、不碰客戶端或反作弊。

## 目標
用新的眼光審查 Claude 目前對「PvE 裡開火等按鍵沒反應」的推論：找出錯誤的推論、漏看的路徑，並提出最可能的根因與下一個單變數實驗。

## 範圍
- 日誌（依序讀）：`docs/journal/2026-09-17-05-test-a-no-effect.md`、`-06-fire-gate-weapon-state.md`、`-07-tzp-script-source-decrypted.md`、`-08-account-level-gm-keybinds.md`（重點是最後幾節）、`-09-uelib-class-deserialization-fixed.md`；另外 `docs/next-test.md`。
- 原始 decompile：`docs/research/2026-09-17-fire-gate/`。
- 解密後的客戶端 UnrealScript 原始碼（不在 repo 內）：`~/mro-decrypted/src/<Package>/<Class>.uc`。重點 class：`ZModePve/ZPvePlayercontroller.uc`、`ZModePve/ZModePve.uc`、`ZBase/DefaultPlayerController.uc`、`ZBase/W_DPCForWeapon.uc`、`ZBase/DefaultGameInfo.uc`、`ZBase/DefaultMech.uc`、`ZBase/W_DefaultMechForWeapon.uc`、`ZBase/W_DefaultWeapon.uc`、`ZBase/W_DefaultWeaponAttachment.uc`、`ZBaseWeapon/BaseGun_Attachment.uc`、`ZBase/PawnSecond.uc`、`Engine/PlayerController.uc`、`Engine/OptionAll.uc`、`Engine/LevelInfo.uc`、`ZNetwork/ZNetwork_DJ.uc`。
- class 預設值工具：`"Metal Rage Online Server/tools/uetool/bin/Release/net8.0/uetool" ~/mro-decrypted/<Pkg>.u decompile <Class>`（或 `get <Class> <Prop>`）。
- DLL 工具（在 `Metal Rage Online Server/` 底下執行）：`python3 tools/disasm.py ...`、`tools/ghidra/decompile.sh`（換 DLL 用 `DLL=Engine.dll`）。客戶端檔案在 `/mnt/c/Games/MetalRage Online/data/`。
- 伺服器程式：`Metal Rage Online Server/`；封包紀錄：`Metal Rage Online Server/logs/session-20260917-131036.jsonl`（測試 C，帳號權限 0）。
- 不要讀 `Metal Rage Online Server/static/`。

## 背景（操作者實測，視為事實）
- PvE（`Map_PC01?Listen?LPort=30907?...Game=ZModePve.ZModePve`，客戶端是 listen host），Pawn `SA01m`。
- **能用**：WASD（機體真的會走）、Ctrl 蹲、滑鼠視角、Q／E 側看（`SideSearchL_JW`／`R_JW`，PC exec）、G 後視、Tab 計分板、F1 按鍵教學、聊天。
- **不能用**：左鍵 Fire、右鍵 AltFire、R `ChangeKit`、1～4 `SwitchWeapon`、Space `Jump`、Shift `EventButtonDown_MH`、F `CaptureButtonClick`。完全沒有 log、沒有 Accessed None，也沒有送出封包。
- 訓練場（`Store_01?Game=ZModeHangar.HangarGameInfo`，沒有 `?Listen`）裡同一個帳號開火、裝備都正常。
- 帳號權限 4 時會套用 `ApplyGMControl`；改成 0 之後按鍵綁定有變（log 從 9 行 `RadioChat_Sel 0` 變成 3 行，並多出 `RadioChat can not found`），但症狀相同。
- HUD 顯示主武器「輕型來福機槍」、彈藥 `080 /0720`，畫面上方的任務橫幅一直在。
- User.ini 的 `[Engine.Input]` 綁定不會被讀；console 快捷鍵是 F24，按不到。所以拿不到執行期數值。

## 要你特別挑戰的推論
1. 「Space／Shift 失效」跟「Fire／R 失效」是不是同一個根因？還是兩個獨立問題？
2. 武器卡在 `Ws_Select` 的推論（`IsLocallyControlled()`／AnimEnd）站不站得住？
3. `DefaultPlayerController.PlayerTick`／`PlayerMove`／`ProcessMove` 裡有沒有 Claude 漏看、會在 PvE（listen host、ZNetwork 資料不完整）下把這些按鍵擋掉的條件（例如 `bNoInputKey_JW` 以外的旗標、`MechSituation`、`Level.Pauser`、`bPauseGame_BD`、`bPressedJump` 被清掉、round／mission 狀態）？
4. 伺服器送的資料（`Game_User_SN`、`Game_Info_SN 0x00222111`、`BeginRound_SN 0x00230152`、`Respawn_SN 0x00230104`、ItemInfo 等）裡，有沒有哪個欄位會直接影響上面這些條件？

## 交付
在終端直接輸出一份中文審查報告（不要寫檔），1500 字以內：
- (a) 對日誌中已標 ✅／🟡 的推論，逐條列出同意、不同意、證據不足，附 `檔案:行號` 或 DLL 位址；
- (b) 你認為最可能的根因（可以有兩個），附證據；
- (c) 最多兩個建議的單變數實驗（伺服器改哪個 opcode 的哪個欄位，或請操作者觀察什麼），寫清楚預期結果怎麼判讀。
所有結論都要附證據標籤；推測標 🟡 [GUESS]。

## 完成條件
(a)(b)(c) 都有。遇到需要改檔或跑遊戲才能確認的地方，寫成建議，不要自己做。
