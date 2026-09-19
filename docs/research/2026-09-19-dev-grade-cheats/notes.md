# Dev-grade / PvE cheat exec functions — read-only survey (2026-09-19)

任務：查 `Grade_Info_SN 0x00510101` 送高權限（11=開發者）解鎖什麼，能不能讓測試帳號不用技術就通關 PvE。
來源：`~/mro-decrypted/src`（解密後 UnrealScript，見 `docs/journal/2026-09-17-07-tzp-script-source-decrypted.md`）。全部只讀，沒有改任何檔案（含遊戲本體）。

## 結論先講

1. **`Grade_Info_SN`=11（開發者權限）本身不會解鎖任何「一鍵過關」指令。** 它只換 `OptionAll.ApplyGMControl` 的按鍵表（觀戰鏡頭控制），而且會讓 `ZPvePlayercontroller` 在 `state PlayerSelectMech.BeginState` 直接 `GotoState('Spectating')`（`IsMeGM_BD()==true` 分支），也就是**權限≥1 在 PvE 裡直接變觀戰者，連正常出戰都做不到**，跟「解鎖開發者功能」的直覺相反。這點是既有 ✅ 的延伸，沒有矛盾。
2. **真正能一鍵結束/跳關的指令跟 grade 完全無關**，是 `ZPvePlayercontroller`（`ZModePve/ZPvePlayercontroller.uc`）上幾個沒有任何權限檢查的 `exec function`：
   - `GameCampaign(int Action)`：直接呼叫 native `ZNetwork_DJ.Game_Campaign(Action)`。Action=1（목표달성/目標達成）→ DLL 端 `ZDispatchGame::Campaign_CN`（`0x107dab70`）在 **host 且 `Game_Play_Check()`（IsPlay）為真**時送 `Campaign_CN 0x00230139`，body[2]=1。我們的伺服器（`dispatch/lobby.dispatch.js` case `0x00230139`，見 `docs/journal/2026-09-17-14-campaign-result.md`）收到就直接回 `EndGame_SN`，客戶端進結算頁、判定獲勝——**不檢查任何目標有沒有真的達成**。Action=2 一樣送 body[2]=2（失敗），伺服器一樣直接結算。
   - `PveNextRound_BD()`：`Level.NetMode!=NM_CLIENT`（也就是身為 host）時，直接 `ZModePve(Level.Game).bOnlyRoundStart=true` 再呼叫 `Game_Campaign(1)`，效果是跳過當前回合（韓文註解明講：`ZModePve.uc:213` 「아래 if문은 치트키 사용때문에 추가한코드」「본섭에는 안올려두 됨」＝「這段是因為用了治具/cheat key才加的碼，正式服不該上」；`:220` 「치트로인한 다음라운드 넘김」＝「因作弊跳到下一回合」）。
   - `CoreHpMax()`：把 PvE 防禦核心（`MRPorterMech`）HP 重設成 `default.Health`（滿血），`ZModePve/ZPvePlayercontroller.uc:1151-1183`。是「核心不會死」型的無敵，不是玩家角色無敵。
   - `SPMaxUP_BD()`：`SPPoint=9999`（`ZModePve/ZPvePlayercontroller.uc:1157-1166`），5 個 SP 技能（攻擊力/防禦力/子彈裝填/核心EMP/憤怒模式）可以無限用。
   - `delTest()`：對場上所有 `MRMech` 呼叫 `KilledBy(none)`（`ZPvePlayercontroller.uc:895-902`），沒分敵我，可能連自己的機體也殺掉，對「不用技術過關」沒有直接幫助。
   - `AddMRBots(int num)`：在 `ZModePve.uc:748` 生成最多到 32 人上限的 `SpawnPawn_BD(N,1003,'TESTPAWN')` 測試 pawn，用途不明確（像是原廠拿來測地圖/人數用的假人，不是幫玩家打怪的友軍），沒有深入查。
3. **這些 exec 函式完全沒有 grade／`IsMeGM_BD`／`bAdmin` 檢查**（我在 `ZPvePlayercontroller.uc`、`ZModePve.uc` 全文 grep 過，這幾個函式定義處沒有任何權限判斷，見下方逐行引用）。真正擋住它們的不是權限，是**怎麼把指令送出去**：
   - MRO 的 console 熱鍵是 `Engine.Console` defaultproperties `ConsoleHotKey=135`（`0x87`＝UE2 `EInputKey.IK_F24`），一般鍵盤按不到。這是用修好的 UELib 直接對 `Engine.u` decompile／`get` 出來的，見 `docs/journal/2026-09-17-09-uelib-class-deserialization-fixed.md:46-56`（[SRC]，已核對過，非猜測）。
   - `docs/journal/2026-09-17-08-account-level-gm-keybinds.md:103` 記錄過：在 `System/User.ini` 的 `[Engine.Input]` 加自訂鍵位（`ShowScores`／`ShowDebug`）**完全沒有作用**，連本來就有效的 `ShowScores` 都失效；結論是引擎只認執行期用 `setinput_BD`（`Engine/OptionAll.uc`）動態設的鍵，不讀 ini 裡的靜態綁定。所以「幫這幾個 cheat exec 加個 ini 快捷鍵」這條路，依現有測試結果大概率不通，還沒有其他驗證過的替代路徑。
   - `OptionAll.ApplyGMControl`／`ApplyPveController`（不論 grade 高低）都**沒有**把這幾個 exec 函式綁在任何鍵上（已逐行核對 `Engine/OptionAll.uc:911-1013`），所以就算開了開發者權限，正常按鍵操作也碰不到它們。
4. **標準 UE2 `CheatManager`（God／Fly／Ghost／Teleport／KillPawns／Summon，`Engine/CheatManager.uc`，以及 MRO 自己的 `ZBase/DefaultCheet.uc`：`SetHealth`／`AllAmmo`／`FlyNWalkMode` 等）在目前的 PvE 拓樸下完全不會被實例化**，跟 grade 無關：`Engine/PlayerController.uc:823` `if ( CheatManager == None && (Level.NetMode == NM_Standalone) ) CheatManager = new(self) CheatClass;`——只有 `NM_Standalone` 才會建立 `CheatManager`。我們的 PvE 是 listen server（`Browse: Map_PC01?Listen?...`，見 `docs/journal/2026-09-17-08-account-level-gm-keybinds.md:104`），不是 Standalone，所以 `CheatManager` 是 `None`，`God`／`Fly`／`SetHealth` 這類指令即使打進 console 也不會執行（找不到 `CheatManager` 這個 exec 目標）。**沒有找到覆寫這個 NM_Standalone 限制的程式碼。**

## 逐項引用

- `ZModePve/ZModePve.uc:213-221`（韓文原始註解，逐字抄錄見上）——StartNextRound 治具碼。
- `ZModePve/ZModePve.uc:40`：`var bool bOnlyRoundStart;//테스트로 넘길때 그냥 넘김`（測試用跳過旗標）。
- `ZModePve/ZPvePlayercontroller.uc:1140-1149`：`exec function PveNextRound_BD()`。
- `ZModePve/ZPvePlayercontroller.uc:1151-1154`：`exec function CoreHpMax()` → `ServerCoreHpMax()`（`:1168-1183`）。
- `ZModePve/ZPvePlayercontroller.uc:1157-1166`：`exec function SPMaxUP_BD()` → `SPPoint=9999`。
- `ZModePve/ZPvePlayercontroller.uc:64-83`：`replication` 區塊——`ServerCoreHpMax`／`ServerSPMaxUP` 有列在 `reliable if (Role < ROLE_Authority)`（可從一般 client 複製到 authority），但 `ServerPveNextRound`（`:1190-1193`）**沒有**列在任何 replication 區塊，所以非 host 的一般 client 呼叫它不會真的傳到伺服器端——這條 cheat 只對「本身就是 host」的那個連線有效，跟我們目前 PvE host＝操作者客戶端的架構相符。
- `ZModePve/ZPvePlayercontroller.uc:895-907`：`delTest()`、`GameCampaign(int Action)`。
- `ZModePve/ZModePve.uc:748-758`：`AddMRBots(int num)`。
- `ZNetwork/ZNetwork_DJ.uc:1901-1903`：`native static function Game_Campaign( int ActionType ); // 1:목표달성, 2:실패(게임종료)`。
- `docs/research/2026-09-17-fire-gate/Campaign_CN_SN.c`（既有 decompile，本次沒有重新反組譯，直接引用）：`ZDispatchGame::Campaign_CN`（`0x107dab70`）＝`Game_Host_Check()` 且 `Game_Play_Check()` 兩者皆真才送封包；body[2] 依 `param_2==1` 決定 1 或 2。
- `docs/journal/2026-09-17-14-campaign-result.md`：我們自己的伺服器對 `Campaign_CN 0x00230139` 的處理（不驗證目標是否真的達成，直接送 `EndGame_SN`）。
- `Engine/PlayerController.uc:823-824`：`CheatManager` 只在 `NM_Standalone` 建立。
- `Engine/OptionAll.uc:911-1013`：`ApplyGMControl`／`ApplyPveController` 完整鍵位表，沒有這幾個 cheat exec。
- `docs/journal/2026-09-17-08-account-level-gm-keybinds.md:49`：`ZPvePlayercontroller.uc` 約 1440 行，`state PlayerSelectMech.BeginState`，`IsMeGM_BD()==true` → `GotoState('Spectating')`（本次沒有重新開檔核對行號，引用既有 ✅ 記錄）。
- `docs/journal/2026-09-17-09-uelib-class-deserialization-fixed.md:46-56`：`Engine.Console` `ConsoleHotKey=135`＝`IK_F24`。
- `docs/journal/2026-09-17-08-account-level-gm-keybinds.md:103`：User.ini 自訂鍵位無效的既有測試。

## 沒查完 / 不確定

- `AddMRBots` 生的 `SpawnPawn_BD(N,1003,'TESTPAWN')` 到底是敵人、假人還是可能的友軍，沒有深入看 `SpawnPawn_BD` 實作，標 🟡 未知。
- `GameCampaign(2)`（失敗）送出後我們伺服器的既有處理只是「結束並回房間」，沒有查是否也會給獎勵／經驗值，如果自動化帳號的目標包含「刷經驗」而非「破關」，這條路可能還要再查 `EndGame_SN` 分數欄位（`docs/journal/2026-09-17-16-death-sn-format-verification.md` 一類，本次沒有讀）。
- 沒有找到任何「不開 console 也能觸發這些 exec」的路徑；User.ini 綁定失敗是既有測試結果，但**這次沒有重新驗證**，只是引用。如果之後想走這條，`setinput_BD` 呼叫鏈（`Engine/OptionAll.uc`）本身理論上是可以被伺服器送的某個封包觸發的 script 函式呼叫，但沒有查過是否有伺服器可控的鍵位設定管道——純粹讀碼沒有進一步證據。
- `Game_Host_Check()`／`Game_Play_Check()` 的細節（是不是只看本地旗標、有沒有可能繞過「回合進行中」限制讓 `GameCampaign` 在還沒開始或已結束時也能送出）沒有重新反組譯，直接引用既有 decompile 檔案的結論。
- 完全沒有碰、沒有測試任何實際指令；這份筆記全部基於靜態程式碼與既有 [DLL]/[LOG] 記錄的交叉比對，沒有新的 [TEST]/[OBS]。

## 補充盤點（高階，2026-09-19，只讀原始碼，全部未實測 🟡）
- 解密的 `.uc` 裡共有 444 個 `exec function`。
- 可能能用（PlayerController／武器端，不在 CheatManager 裡）：
  - `GiveMeAmmo`（`ZBase/W_DPCForWeapon.uc:916`，韓文註解：子彈補滿，只有 host 能用）；
  - `Cash_UJ`（`:934`，呼叫 `ServerSetAmmoByCash_UJ`，意思不明）。
- 在 `DefaultCheet`／CheatManager 裡，listen server 下不會被建立，所以用不了：`FlyNWalkMode`、`FreeCameraMode`（`ZBase/DefaultCheet.uc:70,81`）、`CreateDoll`（`:119`）、`AllAmmo`（`:14`，只回報 cheat）。
- `OnGod`（`ZBase/DefaultMech.uc:4552`）函式本體被註解掉，沒有作用。
- Engine 的標準 Admin 指令（`Admin`、`AdminLogin`、`Kick`、`KillAll`…）要先登入管理員，沒查。
- 遊戲模式目錄（原始碼裡有，是否上線過另查 `research/2026-09-19-original-features/pvp-modes.md`）：ZModeBlow、ZModeCapture、ZModeEscortPve、ZModeOccupation、ZModeRage、ZModeSuddenDeath、ZModeTutorial、ZModeBot、ZModeHangar。
