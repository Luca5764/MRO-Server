# G1 分析：Assist_CN 與 Assist_SN 的完整格式與語意（待審）

原始組語與 decompile：`docs/research/2026-09-17-backlog/G1/`（`Assist_CN_asm.txt`、`Assist_SN_asm.txt`、`callers_decompiled.c`）。

## 1. Assist_CN `0x00230121`（C→S，長度 0x17 = 23 bytes，body 7 bytes）

由 `0x107d87d0` 配置（長度 `0x17`、opcode `0x00230121`），由 `0x107d9c60`（`ZDispatchGame::Assist_CN`）填入。僅在 `Game_Host_Check`（`0x10707630`）且 `Game_Play_Check`（`0x10703832`）為真時送出。
log 字串 `0x1082c268`：`UserIndex : %d, Action : %d, HP : %d, AssistUserIndex : %d, AssistType : %d`。

| body offset | 型別 | 來源參數（組語位址） | 語意與說明 |
|---|---|---|---|
| `+0x00..+0x01` | u16 LE | `di`（`0x107d9d9e`，來自 stack `[esp+0x18]` = `param_4`） | **AssistUserIndex**：攻擊者／助攻者。PvE 自傷／環境傷害或攻擊者為 AI 時為 0 |
| `+0x02..+0x03` | u16 LE | `bx`（`0x107d9da2`，來自 stack `[esp+8]` = `param_2`） | **UserIndex**：受害者／受傷玩家。PvE 攻擊 Boss／物件時傳 0 |
| `+0x04` | u8 | `cl`（`0x107d9da6`–`0x107d9e68`，由 `param_6` 經 switch 映射） | **AssistType**（wire 型別）：1=玩家攻擊、2=Boss、4=自傷／環境、0x16 映射為 `0x3d`（Campaign 目標）等 |
| `+0x05` | u8 | `0x107d9e75`（2）／`0x107d9e7b`（1），由 `param_3` 判斷 | **Action**：1 = 攻擊（Damage），2 = 修復／治療（Repair/Heal） |
| `+0x06` | u8 | `al`（`0x107d9d95`，來自 stack `[esp+0x20]` = `param_5`） | **HP**：受害者剩餘 HP 百分比（0..100）。例如測試 N 實測依序為 0x50(80)→0x14(20)→0x00(0) |

腳本呼叫源（`DefaultMech.uc:3639-3659`）：
- `HPPercent = HPPercent * 20`
- `class'ZNetwork.ZNetwork_DJ'.static.Game_Assist(UserIndex, AssistIndex, HPPercent, 1)`
- 原生層 `0x1071bc30`：當 `UserIndex == AssistIndex || AssistIndex == 0` 時將 `AssistType` 設為 4。測試 N 實測的 `0000 0100 04 01 50` 完全吻合。

## 2. Assist_SN `0x00230122`（S→C，body 至少 0x19 = 25 bytes）

客戶端 handler 為 `0x107d5fa0`（`ZDispatchGame::Assist_SN`），檢查場景 6（`0x107d5fa1`）。
log 字串 `0x1082c358`：`Result : 0x%08X, UserIndex : %d, Action : %d, HP : %d, AssistUserIndex : %d, AssistType : %d`。

| body offset | 型別 | 讀取組語位址 | 去向與客戶端效果 |
|---|---|---|---|
| `+0x00..+0x01` | u16 LE | `0x107d6134 cmp word ptr [esi+0x10], 0` | **Status**：必須為 0，非 0 則不更新分數直接返回 |
| `+0x02..+0x05` | u32 LE | `0x107d6112 mov edx, [esi+0x12]`；`0x107d613b` 判零 | **Result**：必須為 0，非 0 則不更新分數直接返回 |
| `+0x06..+0x09` | 4 bytes | 無讀取 | 保持 0（與 `ChangeSlot_SN`、`Campaign_SN` 相同的前綴結構） |
| `+0x0A..+0x0B` | u16 LE | `0x107d5fe3 movzx ebp, word ptr [esi+0x1a]` | **AssistUserIndex**：第 1 次呼叫 `Game_User_Assist_Set` 的對象 |
| `+0x0C..+0x0D` | u16 LE | `0x107d5fdb movzx eax, word ptr [esi+0x1c]` | **UserIndex**：第 2 次呼叫 `Game_User_Assist_Set` 的對象 |
| `+0x0E` | u8 | `0x107d5feb movzx eax, byte ptr [esi+0x1e]` | **AssistType**：wire 型別經反向 switch 表還原成內部編號 1..0x1c |
| `+0x0F` | u8 | `0x107d60e9 movzx eax, byte ptr [esi+0x1f]` | **Action**：1=攻擊、2=修復（僅用於 log） |
| `+0x10` | u8 | `0x107d5fdf movzx ecx, byte ptr [esi+0x20]` | **HP**：剩餘 HP 百分比（僅用於 log） |
| `+0x11..+0x12` | u16 LE | `0x107d6146 movzx eax, word ptr [esi+0x21]` | **AssistUser_Exp**：傳入 `Game_User_Assist_Set`，累加至 AssistUser 的 Exp 與 Assist 分數 |
| `+0x13..+0x14` | i16 LE | `0x107d6142 movsx ecx, word ptr [esi+0x23]` | **AssistUser_Point**：傳入 `Game_User_Assist_Set`，累加至 AssistUser 的 Point 分數 |
| `+0x15..+0x16` | u16 LE | `0x107d614a movzx edi, word ptr [esi+0x25]` | **User_Exp**：傳入 `Game_User_Assist_Set`，累加至 User 的 Exp 與 Assist 分數 |
| `+0x17..+0x18` | i16 LE | `0x107d614e movsx esi, word ptr [esi+0x27]` | **User_Point**：傳入 `Game_User_Assist_Set`，累加至 User 的 Point 分數 |

`UZNetwork_DJ::Game_User_Assist_Set`（`0x1072d860`）效果：
- 在玩家表 `[esi+0x1034]`（stride 0x80）依 `UserIndex` 尋找記錄。若找不到（如 AI 或 0）則不動作。
- 若模式為 9（`0x1072d89b`），`Assist` 欄位（`+0x4c`）累加 `Exp * 5`；其他模式累加 `Exp`。
- `Exp` 欄位（`+0x54`）累加 `Exp`；`Point` 欄位（`+0x5c`）累加 `Point`。
- 最後將 `[esi+0x1030]` 或上 1（標記分數更新）。

## 3. 伺服器處理建議（待審）

1. 🟡 **客戶端不等待 Assist_SN**：UnrealScript 的 `Game_Assist` 是 `void` native 呼叫，客戶端不會阻塞等待回應。
2. 🟡 **PvE 中的 Assist_CN**：由於是單人或 AI 戰鬥，大量傷害來自環境或非玩家目標（`AssistUserIndex=0`），客戶端收到全 0 的 `Assist_SN` 只會對 user 0 累加 0 分。
3. 🟡 **建議行為**：
   - 目前伺服器回 16 bytes 空包（實為長度不足、全 0 的包），客戶端雖未崩潰但無實質作用。
   - 正確的 `Assist_SN` 應至少為 25 bytes（建議 0x1A 或補齊 0x20），包含正確的雙方 UserIndex 與得分。
   - 亦可評估在 PvE 中不回送 `Assist_SN`（或僅在玩家造成助攻時廣播），待高階裁決。


## 審查（Claude 高階，2026-09-17）

- ✅ [DLL] 抽查：log 字串 `0x1082c268`、`0x1082c358` 內容相符；`0x107d6142`–`0x107d614e` 確實讀 `[esi+0x23]`（movsx）、`+0x21`、`+0x25`、`+0x27`（movsx）。結論採納；「客戶端不等待 Assist_SN」維持 🟡。
