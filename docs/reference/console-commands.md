# 客戶端主控台指令（原廠留下的開發用指令）

來源：已解密的原廠 UnrealScript（`~/mro-decrypted/src`，不在 repo 內）。原始分析見 `docs/research/2026-09-19-dev-grade-cheats/notes.md`，實測紀錄見 `docs/journal/2026-09-19-2230-unattended-trial-01.md`。

## 怎麼打開主控台

- 熱鍵是 **F24**（`Engine.Console.ConsoleHotKey=135`＝`IK_F24`）。一般鍵盤沒有 F24。
- 我們用 Pico 送 F24（`pico_ctl.py key F24`）。✅ 大廳和戰場都能打開，畫面左側會出現 `(> _`。按 ESC 關閉。
- **不需要任何帳號等級。** 伺服器給所有帳號的 Grade_Info_SN 都是 0（`dispatch/account.dispatch.js:283,399`），Grade 0 的 Lucas 帳號就能用。
- 開發者等級（Grade 11）**不會**開放這些指令，只會改觀戰鏡頭按鍵，而且會讓 PvE 直接進觀戰。

## 指令一覽

狀態：✅＝實測過　🟡＝只讀過原始碼　❌＝用不了

### PvE（房主才有效）

| 指令 | 效果 | 位置 | 狀態 | 測試用途 |
|---|---|---|---|---|
| `GameCampaign 1` | 送出「任務達成」（`Campaign_CN 0x00230139` `010001`）。伺服器推進一回合，最後一回合送 EndGame | `ZModePve/ZPvePlayercontroller.uc:904` | ✅ 2026-09-19，5 回合打到結算 | **主力**：整場流程回歸 |
| `GameCampaign 2` | 送出「任務失敗」 | 同上 | 🟡 | 失敗路徑回歸 |
| `PveNextRound_BD` | 直接跳下一回合（原始碼註解：作弊鍵，正式服不該放） | `ZPvePlayercontroller.uc:1140` | 🟡 | **不用**：可能只在客戶端跳，會跟伺服器的回合計數不一致 |
| `CoreHpMax` | PvE 防禦核心補滿血 | `ZPvePlayercontroller.uc:1151` | 🟡 | 撐長時間的場 |
| `SPMaxUP_BD` | SP 設成 9999。加入者（NM_CLIENT）會改呼叫 RPC `ServerSPMaxUP()` 請房主執行（`ZPvePlayercontroller.uc:1157-1165`、`:1185`），**所以加入者可能也能用**（本表原本寫「房主才有效」，未實測） | `ZPvePlayercontroller.uc:1157` | 🟡 | 撐長時間的場；dusk 想要的「無限 SP」 |
| `delTest` | 場上所有機體（包括自己）`KilledBy(none)` | ZModePve | 🟡 | 死亡／重生封包 |
| `AddMRBots <n>` | 生出測試用機體，是敵是友不確定 | ZModePve | 🟡 | 未定 |

### 一般（武器／控制器）

| 指令 | 效果 | 位置 | 狀態 |
|---|---|---|---|
| `GiveMeAmmo` | 子彈補滿（註解：只有房主能用） | `ZBase/W_DPCForWeapon.uc:916` | 🟡 |
| `Cash_UJ` | 呼叫 `ServerSetAmmoByCash_UJ(1, 1.5)`，意思不明 | `ZBase/W_DPCForWeapon.uc:934` | 🟡 |

### 用不了的

| 指令 | 原因 |
|---|---|
| `FlyNWalkMode`、`FreeCameraMode`、`CreateDoll`、`AllAmmo`、`God`、`Fly`、`Ghost`… | 屬於 CheatManager，只有單機模式（`NM_Standalone`）才會建立（`Engine/PlayerController.uc:823`）；PvE 是房主開主機的連線模式 ❌ |
| `OnGod` | 函式本體整段被註解掉（`ZBase/DefaultMech.uc:4552`）❌ |
| `Admin`、`Kick`、`KillAll` 等引擎管理員指令 | 要先 AdminLogin，沒查 ⬜ |

## 規則

- 只用於**專用測試帳號**的單人自動化測試。作弊打完的場次，數值不是真的（擊殺 0、沒有傷害）。
- **安全風險**：任何玩家只要能送 F24（例如硬體巨集），就能用 `GameCampaign 1` 秒過關。客戶端關不掉主控台，伺服器是唯一防線。處理排在 roadmap P7：Campaign_CN 合理性檢查，只標記、不踢人。
- 原始碼裡共有 444 個 `exec function`，這裡只列跟測試有關的。

## 綁鍵的限制（2026-09-20）

- `User.ini` 的 `[Engine.PlayerInput]`／`[Engine.Input]` 自訂綁定**沒有作用**：按鍵是遊戲執行時由腳本 `setinput_BD`（`Engine/OptionAll.uc`）設定的，連 `End=ShowScores` 都沒反應（`journal/2026-09-17-08-account-level-gm-keybinds.md:60,103`）。所以「在 ini 綁 F9=SPMaxUP_BD」這條路預期行不通 🟡。
- 玩家要用主控台，只能靠能送出 F24 的硬體（Pico、鍵盤滑鼠的硬體巨集）。軟體改鍵工具送出的按鍵屬於注入輸入，預期會跟 drive.sh 一樣被擋 🟡。
- P7 作弊清單：`SPMaxUP_BD` **伺服器端看不到任何訊號**（不像 GameCampaign 還有 Death_CN 數可以查），用了它的場次目前無法辨識。只影響 PvE。
