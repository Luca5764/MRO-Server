# 開火的前置條件：AWeapon+0x41c 狀態位元組（2026-09-17）

子 agent（explorer，中階）先做調查，Claude 抽查組語後寫成本篇。原始 decompile：`docs/research/2026-09-17-fire-gate/`。

## 腳本讀不到

- ✅ [DLL/檔案] 子 agent 回報：`data/MUD`、`data/MUZ` 的 `.tzp`／`.mra` 沒有 Unreal package magic `9E2A83C1`；`System/*.twt` 只是 UTF-16LE 字串表。UnrealScript bytecode 讀不到，開火狀態機的腳本部分看不到。（Claude 未重驗這點。）

## 原生端的開火閘門

- ✅ [DLL] `0x10485470` 是 `AWeapon::TickAuthoritative`（匯出表）。Claude 已核對組語 `0x10485563`–`0x10485589`：
  - 讀 `byte [esi+0x41c]`；等於 `4` 或 `0x11` 時呼叫 `0x103135c0 AWeapon::eventStartFire`。
  - 等於 `9` 時呼叫 `0x10313550`（子 agent 回報是空槍音效，Claude 未核對名稱）。
  - 其他值：兩個分支都不進。
- 🟡 [GUESS] 這跟 UE2 的 `Weapon.ClientState`（`WS_ReadyToFire=4`）結構很像。如果 `+0x41c` 一直停在 bring-up 之類的值，按左鍵就會完全沒反應，跟測試 A 的現象（沒聲音、沒扣彈、沒封包）一致。還沒有執行期證據。
- ✅ [DLL] 掃描 Engine.dll 程式段，寫入 `+0x41c` 的只有 `AWeapon::execSetAmmo`（`0x10511b80`，`0x10511c73` 寫 9、`0x10511c99` 寫 4）等彈藥函式，只在 9↔4 之間切換（彈藥歸零改成 9，補彈後從 9 改回 4）。**沒有原生碼把初始值設成 4**，所以初始進入 ready 是腳本做的，讀不到。
  - 其餘寫入點 `0x10511e2e`、`0x10511f8b`、`0x10511fb1` 在同一區，函式邊界沒有逐一確認。

## 推進器

- ⬜ [DLL] 子 agent 回報 `0x10310860 eventDoBooster_sh@AWeaponAttachment` 在 Engine.dll 內沒有靜態呼叫，是腳本觸發，原生端找不到閘門。

## 按鍵（更正測試 A2 的設計）

- ✅ [檔案] `System/OptionAll_Default.ini` 的 `dp_Keyboard_R`：`Key_Fire=1`（左鍵）、`Key_Zoom=2`（**右鍵是瞄準，不是副武器**）、`Key_MainWeapon=49`（1）、`Key_SubWeapon1/2/3=50/51/52`（2／3／4）、`Key_Reload=82`（R）、`Key_Booster=16`（Shift）、`Key_Action=70`（F）、`Key_Jump=32`（Space）。
- 所以 A2 按右鍵沒有反應，不能代表副武器壞掉。

## 下一步

不改程式，請操作者觀察武器狀態機有沒有在動：按 R 重新裝填、按 1 重選主武器後再按左鍵、按右鍵看有沒有瞄準、按 2 看能不能換到副武器。

## 測試 A4 結果（12:51–12:53，同一個 session 紀錄）

- ✅ [LOG] 操作者用隊伍聊天 `0x00220507` 當 marker（Big5）：「接下來我會按下R」→「我剛剛按了10次R」→「接下來我會按下1」→「不能開火」→「右鍵沒反應」→「234都沒反應」→「space沒反應」→「F沒反應 接下來關掉遊戲」。（原文「又見」是「右鍵」的選字錯誤。）
- ✅ [LOG] 這段時間 client→server 除了聊天和 `0x00020083`，沒有任何其他封包。
- ✅ [LOG] `MetalRage.log` 在第二個 `START MATCH` 之後只多了 9 行 `ScriptLog: RadioChat_Sel 0`，沒有 weapon、reload、booster 相關訊息。9 行對應哪幾個按鍵不明（log 沒有時間戳）。
- [OBS] 所以：R、1、左鍵、右鍵、2／3／4、Space、F **全部沒反應**；只有 WASD、準心、聊天可以用。
- 🟡 [GUESS] Space（跳）不是武器動作，也沒反應，所以問題比「武器狀態 +0x41c」更上層，比較像 controller 或 Pawn 還沒進入可以行動的狀態。聊天是 HUD 或 console 層的輸入，不能拿來排除這一點。先前 05 篇的「不是整個輸入被擋住」要改成「只有移動、視角、聊天能用」。

## Game_Play 旗標（排除一個嫌疑）

- ✅ [DLL] `UZNetwork_DJ::Game_Play_Check`（thunk `0x10703832` → `0x1071a730`）回傳 `[this+0xfe8] & 1`；`Game_Play_Start`（thunk `0x10704700` → `0x10734050`）在 `0x1073406c` 把這個位元設成 1。
- ✅ [DLL] `Game_Play_Start` 有三個呼叫點：`0x107d50ac`（在 `ZDispatchGame::Game_Info_SN` 內）、`0x107d5b32`（在 `ZDispatchGame::BeginRound_SN` `0x107d5ad0` 內）、`0x107f0a87`（在 `ZDispatchWaiting::Game_Info_SN` 內）。decompile 存在 `docs/research/2026-09-17-fire-gate/BeginRound_SN.c`。
- ✅ [DLL] `BeginRound_SN`（`0x107d5ad0`）只檢查 `[this+4]`，也就是 `ZDispatchGame::Check`（`0x107d4bf0`）在場景 6 設成 1 的旗標，不讀 body，接著就呼叫 `Game_Play_Start`。
- 🟡 [LOG] 伺服器在 04:51:46 回應客戶端的 `0x00230151`，送出了 `BeginRound_SN 0x00230152`；當時客戶端已在戰鬥中，所以 `Game_Play_Start` 應該有執行。腳本有沒有用 `Game_Play_Check` 決定能不能行動，讀不到。
