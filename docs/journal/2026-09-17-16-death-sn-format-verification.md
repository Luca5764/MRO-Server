# G2 分析：Death_SN 0x00230124 完整欄位與伺服器送法比對（待審）

原始組語與 decompile：`docs/research/2026-09-17-backlog/G2/`（`Death_SN_asm.txt`、`Game_Action_Death_asm.txt`）。

## 1. Death_SN `0x00230124` body 完整結構（長度 0x51 = 81 bytes）

客戶端 handler 為 `0x107db4d0`（`ZDispatchGame::Death_SN`），檢查場景 6（`0x107db4d6`）。
log 字串 `0x1082be78`：`Result : 0x%08X, Death User : %d, Death Type : %d, Kill User : %d, Kill Weapon : %d, Kill Type : %d, Critical : %d`。

| body offset | 型別 | 讀取組語位址 | 去向與作用 | 伺服器現況（`lobby.dispatch.js:213-221`） |
|---|---|---|---|---|
| `+0x00..+0x01` | u16 LE | `0x107db6c6` | **Status**：必須為 0 | ✅ 寫 0 |
| `+0x02..+0x05` | u32 LE | `0x107db6d1` | **Result**：必須為 0；非 0 且非 0xa40281 會觸發 `SYNC_FAILED` 斷線 | ✅ 寫 0 |
| `+0x06..+0x09` | 4 bytes | 無讀取 | 未讀取（保留 0） | ✅ 寫 0 |
| `+0x0A..+0x0B` | u16 LE | `0x107db516` | **Kill User**：擊殺者 UserIndex（傳入 `Game_User_Battle_Set` 與 `Game_Action_Death`） | ✅ 寫 `attackerIndex` |
| `+0x0C..+0x0D` | u16 LE | `0x107db535` | **Death User**：被擊殺者 UserIndex（傳入 `Game_User_State_Set` 等） | ✅ 寫 `victimIndex` |
| `+0x0E` | u8 | `0x107db529` | **Death Type**：wire 型別經 switch 還原為內部 1..0x1a | ✅ 寫 `deathType` |
| `+0x0F` | u8 | `0x107db522` | **Critical**：爆頭／爆擊標記（`test al, al` -> 0 或 1） | ✅ 寫 `specialFlag` |
| `+0x10` | u8 | `0x107db51a` | **Kill Type**：武器部件／槽位 | ✅ 寫 `weaponPart` |
| `+0x11..+0x14` | u32 LE | `0x107db513` | **Kill Weapon**：武器 ID | ✅ 寫 `auxiliaryValue` |
| `+0x15..+0x22` | 14 bytes | `0x107db6dc-fb` | **Team A 分數塊**：Team(u16), Score(u16), Round(u8), Alive(u8), Try(u16), Goal(u16), Exp(u32)；傳入 `Game_Score_Set` | ❌ 全 0（全被清 0） |
| `+0x23..+0x30` | 14 bytes | `0x107db77d-9c` | **Team B 分數塊**：同上；傳入 `Game_Score_Set` 後呼叫 `Game_Score_Update` | ❌ 全 0（全被清 0） |
| `+0x31..+0x40` | 16 bytes | `0x107db8a5-af` | **Killer 戰鬥數據**：Kills(u16 at +0x31), Deaths(u16 at +0x33), Exp(u32 at +0x39), Point(u32 at +0x3d)；傳入 `Game_User_Battle_Set` | ❌ 全 0（覆蓋為 0） |
| `+0x41..+0x50` | 16 bytes | `0x107db8ca-d5` | **Victim 戰鬥數據**：Kills(u16 at +0x41), Deaths(u16 at +0x43), Exp(u32 at +0x49), Point(u32 at +0x4d)；傳入 `Game_User_Battle_Set` | ❌ 全 0（覆蓋為 0） |

## 2. 客戶端後續處理與伺服器註解查核

1. 🟡 **狀態切換註解正確**：`0x107db8a0` 確實呼叫 `UZNetwork_DJ::Game_User_State_Set(DeathUser, state)`。若非 mode 6/7，`state = 1`（`respawnable`）。伺服器註解屬實。
2. 🟡 **HUD 擊殺廣播**：`0x107db912` 呼叫 `UZNetwork_DJ::Game_Action_Death`，其內部呼叫 `APlayerController::eventTreatKillMSG_UJ`（`W_DPCForWeapon.uc:313`），在畫面上彈出擊殺提示，並更新連殺計數（`record+0x3c`）。
3. 🟡 **分數覆蓋副作用**：因為伺服器在 `+0x31..+0x50` 全填 0，每次有人死亡，客戶端本地記錄的該玩家與被擊殺者的 Kills、Deaths、Exp、Point 都會被直接重設為 0（`Game_User_Battle_Set` 內部是無條件賦值 `record+0x38 = kills`, `record+0x40 = deaths` 等）。

## 3. AI 被擊殺時伺服器該不該送 Death_SN？（待審）

1. 🟡 **應該送**：
   - 客戶端在收到 `Death_SN` 時才會觸發 `TreatKillMSG_UJ` 顯示擊殺 HUD 與提示音，並且在 `0x1072e185` 呼叫 `AGameInfo::eventMissionActionSuccess_BD` 前進任務目標。
   - 被殺的若是 AI，`DeathUserIndex` 在玩家表 `[esi+0x1034]` 查不到記錄，`Game_User_State_Set` 與 `Game_User_Battle_Set` 都會安全跳過（`jl` 或 `cmp` 檢查後直接 return），**不會崩潰**。
2. 🟡 **不應送的是 Respawn_SN**：
   - 伺服器在 commit 92c5937 之前對所有 Death_CN（含 AI）都排程送 `Respawn_SN(0)`，這會干擾玩家自己的重生計時並引發客戶端異常。只對類型 1～4（玩家）排程重生是正確的。
3. 🟡 **後續改進建議**：
   - 目前伺服器送出 `0x31..0x50` 全 0 的 `Death_SN` 是無害的，但如果希望戰鬥中 TAB 計分板正常累積擊殺數，伺服器應記錄玩家累計殺敵數，並在 `+0x31` 填入正確的 `Kills`。
