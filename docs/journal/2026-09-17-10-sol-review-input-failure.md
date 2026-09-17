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
