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
