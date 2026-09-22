# D2 PvP 團隊死鬥（TDM）設計稿：計分、回合、勝負

> **狀態：v3，2026-09-23。Sol 跨公司審查把 v2 整體降為 🟡**，指出 §7 有四處矛盾，
> 已於 v3 逐條收斂（見 §10）。T1 已實作並實跑過；**T2 之後照 v3 開工**。
> 審查結論：`research/2026-09-22-sol-review/verdict.md` §5。
> **審過才實作**（PM 2026-09-22 裁決：PvP 動工照關卡走）。
> v1 原文在 git（`6504ed5`）。v1 → v2 改了什麼見 §9。

## 0. 目前進度

✅ **D2-1「PvP 房開戰進場」**（PM 2026-09-22 判定，[SHOT][LOG]）——單人、未分隊、未計分、未打完。
開關 `PVP_START_FLOW_MODE`，證據 `journal/2026-09-22-2055-pvp-start-works.md`。

**本稿要設計的是下一段**：分隊 → 擊殺計分 → 比賽結束（時間到或達到擊殺目標）→ 結算頁 → 回房。

**P1 擋路項**：`PVP-HUD-MARKER`（自動化認不出 TDM 畫面，會誤判失敗）必須先修好，
否則下面任何一步都沒辦法自動驗收。已派出。

## 1. 範圍

- **只做 TDM 一個模式**。Blow／Capture／Conquest 是 P2，有任務狀態、有 GPF 風險（premises P2），不在本稿。
- **先做 2 人（一紅一藍）**。4 人以上的驗收要等朋友或四開（roadmap P3 之前）。
- **比賽制，不是回合制**：TDM 在 Moon 的規則表裡是「match」（打一場就結束），不分回合。
  → 本稿**不用** `EndRound_SN`，只用 `EndGame_SN`。

## 2. 誰決定勝負：伺服器

**結論：伺服器決定，客戶端只負責回報事件。**

（PM 2026-09-22 審查更正：v2 初稿第一列引用 Moon 的「called from Network on round end」，那句實際在 `ZModePve.uc:716`、不在 `ZTeamDM`，Moon 已認錯；改用我們自己讀源碼的結論。）

依據（證據等級各不同，照實標）：

| 依據 | 等級 |
|---|---|
| **`DefaultGameInfo.uc:395-405` 把 `EndGame()` 覆寫成空殼**：`Reason` 不是 `"TimeLimit"` 就什麼都不做 → `ZTeamDM.CheckScore` 送進來的 `"teamscorelimit"`（擊殺達標）**被整個吃掉**，不 `GotoState`、不通知任何人。**客戶端永遠不會因擊殺達標而結束比賽** | ✅ 我方讀源碼，`research/2026-09-21-d2-pvp/verify-p1p2.md` |
| 時間到 00:00 時，**房主**呼叫 `Game_Timeout()` 送 `Timeout_CN 0x00230111`（空 body），伺服器收到後決定勝方 | 🟡 Moon，同檔 `:199-215` |
| **我方 log 裡實際有 12,472 筆 `Timeout_CN` recv**（body 全空）——房主確實會送這包 | ✅ [LOG]，`research/2026-09-22-d2-tdm/timeout-opcode-conflict.md` |
| `0x00230111` ＝ `Timeout_CN` | ✅ [DLL]，`state.md` |

v1 §3 說「不確定房主會不會送 CN 通知伺服器」——**有 12,472 筆實際封包，這個疑慮解除**。

**勝負規則（我們的規則，原廠值查不到時以此為準）**：

| 情況 | 勝方 |
|---|---|
| 某隊擊殺數達到 `GoalScore` | 該隊，立即結束 |
| 時間到（收到 `Timeout_CN`） | 擊殺數較多的隊；**相同時死亡數少的隊勝，仍相同則紅隊（0）勝**（PM 裁決，見 U2） |
| 房主離線（`state==='playing'`） | 沿用現行 `room-leave.js:203-212` 的處理 |

## 3. 封包序列

開戰到進場（D2-1，已通）略。以下是進場之後：

```
房主 ──Death_CN 0x00230123──▶ 伺服器   （有人被擊殺）
伺服器：記入攻擊者那一隊的擊殺數
伺服器 ──Death_SN 0x00230124──▶ 全房    （廣播，現行已實作）
伺服器：若該隊擊殺數 ≥ GoalScore → 跳到「結束」
        ⋮（重複）
房主 ──Timeout_CN 0x00230111──▶ 伺服器  （00:00，空 body）
伺服器：比擊殺數決定勝方 → 跳到「結束」

結束：
伺服器 ──User_Score_SN 0x00222221──▶ 全房（結算頁資料，**先送**）
伺服器 ──EndGame_SN 0x00222213──▶ 全房  （WinTeamIndex ＋ 兩隊 14-byte 分數紀錄，**後送**）
        房間狀態 → ended（見 §3.1）
        → 回房（沿用 PvE 現行流程）
```

### 3.1 結束必須冪等（PM 2026-09-22 審查追加）

送出 `EndGame_SN` 之後房間進入 **`ended`** 狀態，**之後收到的 `Death_CN`／`Timeout_CN` 一律忽略並記 log**。
理由（v3 更正，依 Sol 跨公司審查）：~~加入者的計時器也會送 `Timeout_CN`~~ **這點沒有證據**——
客戶端 `Timeout_CN 0x00230111` 在 `0x107db0c0` 有 `Game_Host_Check` ＋ `Game_Play_Check` 兩道閘門，
現有 12,472 筆也全部來自 playing 狀態的房主（`research/2026-09-22-d2-tdm/timeout-opcode-conflict.md:27-34,65-87`）。
冪等仍然要做，理由換成：**防重送、防延遲的 `Death_CN`、防「擊殺達標與時間到同時成立」**。
沒有這個狀態，同一場比賽會被結束兩次。

## 4. 每一包送給誰、填什麼

| 包 | 方向 | 送給 | 欄位 | 狀態 |
|---|---|---|---|---|
| `Game_Info_SN 0x00222111` | S→C | 全房 | `+0x04`／`+0x06` 紅藍 index ＝ **0／1**；`+0x11` mapId（1011..1081）；`+0x13` 時限（分鐘，建房設定）；**`+0x16` GoalScore（modes 0、1）現在寫死 0，TDM 要填目標擊殺數** | 欄位 ✅ [DLL]（`gate.game.dispatch.js:607-702` 註解逐欄核對）；**TDM 是 mode 0 還是 1 ⬜** |
| `Game_User_SN 0x00222112` | S→C | 全房，每成員一包 | `rec+0x02` TeamIndex：**現在全部寫死 0，TDM 要依分隊填 0／1** | 欄位 ✅ [DLL] |
| `Death_SN 0x00230124` | S→C | **全房（含加入者）** | 現行格式不變 | 現行已實作；加入者安全性見 §5 |
| `Timeout_CN 0x00230111` | C→S | — | 空 body | 目前落進 `unhandled` fallback（只記 log、無回應），**要新開 handler** |
| `EndGame_SN 0x00222213` | S→C | 全房 | `+0x10` WinTeamIndex，接兩個 14-byte 隊伍區塊，共 0x1E | 格式與 PvE 相同 ✅（PvE 已在送）；**要填真正的勝方與分數** |
| `User_Score_SN 0x00222221` | S→C | 全房 | **在 `EndGame_SN` 之前送**（PvE 現行順序） | ✅ 我方 PvE 現行就是先 `User_Score_SN` 再 `EndGame_SN` 且結算頁正確（`source-tables.md` 表 A #14）；`ZDispatchRoom::Check`（`0x107e9eb0`）接受 scene 5 **或 6**。Moon「只能在 Scene_Change(5) 之後」是舊猜測，**不採用**。TDM 的逐人欄位要確認 |

### 14-byte 隊伍分數紀錄（`EndGame_SN` 與 `Timeout_SN` 共用）

`+0x00 team, +0x02 score, +0x04 round, +0x05 alive, +0x06 try, +0x08 goal, +0x0A exp`
——🟡 Moon（`:58-70`），**他自己說 2026-09-13 之前欄位順序寫錯過**。
我方在 `Timeout_SN` 上手動追過，雙紀錄起點 `+0x0A`／`+0x18`、總長 0x26 都對上，
**但 7 個欄位誰是誰沒把握**（`TDM-TIMEOUT-FIELDS`，backlog 低優先）。
→ **`EndGame_SN` 只填 `team` 與 `score` 兩欄**（PvE 已驗證這兩欄的位置），其餘填 0；
  要動其他欄位前先用 Ghidra 釘死。

## 5. 已解決的矛盾：`Death_SN` 能不能送給加入者

**兩份來源說法相反：**

- **我方 premises P5（✅ [DLL]＋[LOG]）**：加入者**可以**收 `Death_SN`，不會出事。
- **Moon B11（🟡）**：**不要**把 `Death_SN` 送給加入者，handler 結尾呼叫 GameInfo script event
  （`0x107db912 call Game_Action_Death`），加入者沒有 `Level.Game`。

**兩者可以同時為真**：handler 結尾確實有 script event，**但加入者走不到結尾**——
前面的 `Game_Host_Check` 在加入者身上就返回了（P5 依據）。
而且我方 2 人 PvE 打完整場（M2，`journal/2026-09-19-2120-m2-acceptance.md`）時就一直在對全房廣播 `Death_SN`——**[LOG] `session-20260919-200917.jsonl`：`Death_SN 0x00230124` send 在兩條連線上各 945 次**（conn 2 與 conn 4），加入者收了 945 次、整場打完到結算回房都沒崩潰（高階 2026-09-22 重新統計核對）。

→ **採我方 P5，`Death_SN` 維持全房廣播。** Moon 的規則對 `Death_SN` 過度保守。
⚠️ 但這依賴 `Game_Host_Check` 在 PvP 的行為與 PvE 相同——**PvP 2 人實跑時第一件要看的就是加入者有沒有崩潰**。

## 6. 硬規則（PM 指定）

1. **`Grade_Info_SN 0x00510101` 一律送 0。** 非 0 時 `IsMeGM_BD()` 為真，加入者的
   `PlayerSelectMech.BeginState` 會直接 `GotoState('Spectating')`（premises P8）。
   實作時要**寫成斷言**，不是註解。
2. **隊伍值必須兩處一致**：`Game_User_SN` 的 `rec+0x02` 只能是 `Game_Info_SN` 的
   `+0x04`（0）或 `+0x06`（1）。`Game_User_Team_Get` 就是拿兩者比對，對不上會回 255。
3. `EndGame_SN` 的 `WinTeamIndex` **只能是 0 或 1**（平手規則見 U2，永遠會分出勝負）。

### 4.1 TDM 的擊殺目標欄位（2026-09-22 實測補，PM 指定寫入）

**TDM 的擊殺目標在 `Map_Change_One_SN` 的 `MapKill`（`+0x06`），不是 `Goal`（`+0x08`）。**
[LOG] 操作者選 TDM 地圖時客戶端送出 `w6=150`（MapKill）、`w8=0`（Goal）；欄位對應 [DLL] `0x107eb771-0x107eb7a0`（`research/2026-09-22-d2-tdm/room-settings-blank.md` Q1）。客戶端自帶 **20 分／150 殺**，即韓版原廠 TDM 預設（U6）。→ **T4 的目標擊殺數以 `MapKill` 為準。**

## 7. 實作步驟（每步一個開關，預設關；開關關閉時 golden replay 四樣本逐 byte 不變）

| 步 | 開關 | 做什麼 | 怎麼驗 |
|---|---|---|---|
| **T1** | `PVP_TEAM_ASSIGN_MODE` | `Game_User_SN` TeamIndex 依加入順序輪流填 0／1 | 2 人實跑：兩人是否被分到不同顏色、互相是敵人 |
| **T2** | `PVP_KILL_TRACKING_MODE` | 房間層級記錄兩隊擊殺數（從 `Death_CN` 的 attacker 歸隊）。**歸隊規則照客戶端原始碼**，見下方 §7.1。**attacker 解析不到 → 記 WARN、不計分**。✅ **開工前提已解除（2026-09-23）**：attacker＝body `+0x00` u16 LE、victim＝`+0x02` u16 LE，DLL 與實測封包兩邊對上（`research/2026-09-23-death-cn-fields/attacker-offset.md`） | log 印每隊擊殺數；比對實際擊殺 |
| **T2.5** | `PVP_TEAM_SCORE_SYNC_MODE` | **比賽中把隊伍分數同步給兩端**。⚠️ **開工前提：先查出客戶端是哪一包更新隊伍計分板，要 ✅ [DLL]**（PvP 首輪實測：`Death_SN` 只讓個人分數變成 `P 0010`，隊伍總分停在 `000`，見 `journal/2026-09-22-2230-pvp-2p-first.md:14-34`）。Moon 已被問，他若有答案就省一步 | 2 人實跑：擊殺後**兩邊**計分板的隊伍分數都跟著動 |
| **T3** | `PVP_TIMEOUT_MODE` | 新開 `Timeout_CN` handler：比擊殺數決定勝方 → **先送 `User_Score_SN 0x00222221`、後送 `EndGame_SN 0x00222213`**（順序照 §3，與現行 PvE log 一致，不可對調） | 把時限設成 1 分鐘，等它時間到；log 逐筆核對送出順序 |
| **T4** | `GAME_INFO_TDM_GOAL_MODE` | **單一資料流**（見 §7.2）：房間的 `MapKill` 是唯一真值 → `Game_Info_SN` 的 `+0x15`／`+0x16`／`+0x18` 三欄都填它 → 結束判斷也讀同一個房間欄位，**不讀封包回填值**。達標就走 T3 的同一條結束路徑 | 目標設小（例如 3），打到 3 殺 |
| **T5** | — | 結算頁 → 回房 | 沿用 PvE 流程，確認兩人都回到房間 |

### 7.1 計分規則（v3：改成跟隨客戶端原始碼）

v2 寫「同隊含自殺一律不計分」，**與原廠 `ZTeamDM.ScoreKill` 相反**（Sol 跨公司審查指出）。
伺服器如果不照做，房主本機的 `Team.Score` 會跟伺服器判的勝負分歧。查證後原廠規則是
**隊伍分與個人分兩套、規則不一樣**：

| 情況 | 隊伍分 `Teams[].Score` | 個人分 `PRI.Score`／`Kills` |
|---|---|---|
| 擊殺敵隊 | 擊殺者那隊 **+1** | 擊殺者 **+1** |
| 自殺、或無擊殺者（墜落等） | **對面那隊 +1**（`Teams[(victim.TeamNum+1)%2]`） | 不動 |
| 同隊誤殺（擊殺者≠被殺者） | **兩隊都不動** | 擊殺者 **+1** |

依據 [DLL 無關，SRC] `ZGame/ZTeamDM.uc:934-957`（隊伍分，`Super.ScoreKill` 之後的三個分支）
＋ `ZGame/ZDeathMatch.uc:267-287`（個人分，只排除 `killer==Other||killer==None`，**不看隊伍**）。
註：`ZTeamDM.uc:942` 的韓文註解「자살시 스코어 삭감 삭제」＝「移除自殺扣分」，所以原廠確實刻意不扣分，
改成加給對面隊。

**T2 照這張表實作**，並在 log 逐筆印出歸到哪一隊與哪一種情況，方便和房主畫面對帳。

### 7.3 T2.5：比賽中的隊伍分數同步（2026-09-23 補，PM 指定先查 DLL 再設計）

前置調查：`research/2026-09-23-team-scoreboard/candidates.md`。

**先釐清症狀的成因（✅ [LOG]）**：隊伍總分卡在 `000` **不是欄位填錯，是我們根本沒送過**。
2026-09-22 那場 PvP 全程 0 筆 `Game_Score_SN`；唯四的 `0x00230112` 都在進大廳階段、
body 全 0，是**同一個 opcode 數字在不同場景被複用成不同訊息**（又一個已知陷阱實例）。

**兩個候選不是二選一**：`Timeout_SN 0x00230112`（`0x107d7820`）與
`Game_Score_SN 0x00222114`（`0x107d5130`）都匯流到同一個 `Game_Score_Update`
（`0x1072d1b0`），它取兩個 team id 各查一次分數，把兩個 int 丟給 `vtable+0xc4` 的 UI callback。
🟡 這是 29 個 handler 裡唯一一處「兩個 team-keyed int → UI」的形狀，**但那個 UI 類別沒解出來**，
所以「它就是畫面讀的那個」目前是結構推論，不是證實。

#### T2.5 的步驟（先驗證、再實作，順序不能反）

| 步 | 做什麼 | 怎麼驗 |
|---|---|---|
| **T2.5a**（先做這個） | **動態驗證**：比賽中送一包 `Timeout_SN`，body 依 candidates.md 的欄位表，`+0x00`／`+0x02` 兩個 gate 欄位填 0，兩個 block 的分數欄（`+0x0c`／`+0x1a`）**填不同的好認數值**（例如 7 和 3） | 截圖看畫面上方隊伍總分是不是變成 7 : 3。**這一包同時回答三件事**：是哪一包、是不是畫面讀的那個欄位、加入者收了會不會崩 |
| **T2.5b** | T2.5a 成立才做：開關 `PVP_TEAM_SCORE_SYNC_MODE`，擊殺計分變動時把 T2 的 `room.pvpTeamKills` 用同一格式送給全房 | 2 人實跑：擊殺後**兩邊**的隊伍總分都跟著動 |

**為什麼先動態驗證**：靜態再讀下去要解 `0x108e550c` 一百多處 xref 才能確認那個 UI 類別。
送一包截圖一次就能定案，而且順便驗完安全性。這是操作者定的原則——**不為了 p 值燒機器時間，
先問「這會改變什麼決定」**。

#### 開工前要知道的風險

- ⚠️ **加入者安全只有消極證據**：兩個 handler 都**沒有** `Game_Host_Check`（已全函式掃過
  `0x1071a560` 與 thunk `0x10707630`，皆無），也沒看到 `Level->`／`GameInfo->` 解參考
  （走的是 class default object）。但這是「沒找到閘門」，**不等於安全**——與 §5 那四包不同，
  那幾包有實跑佐證。T2.5a 的截圖驗證同時就是安全性驗證，**先對加入者送**。
- ⚠️ **`+0xff0`／`+0xff4` 這兩個 team id 沒查**（`Game_Score_Update` 拿它們查表）。
  **加入者端若與房主不一致，送對包也會拿到錯的隊伍分。** T2.5a 若分數出現在錯的一邊，
  第一個要查的就是這裡。
- ⬜ `EndRound_SN`／`EndQuater_SN`／`EndGame_SN`（`0x107d7a50`／`0x107d7c90`／`0x107d7ed0`）
  **沒有被排除**，它們跟 `Timeout_SN` 緊挨著排、掃描視窗溢出無法歸屬。若 T2.5a 失敗，
  下一個就查它們，**要用 function-boundary-aware 的方式**（`tools/ghidra/decompile.sh`），
  不要用固定指令數的 `disasm.py at`。

### 7.2 目標擊殺數的單一資料流（v3 收斂 U1／§4.1／T4 三處說法）

```
Map_Change_One_SN +0x06 (MapKill)  ──玩家在房間選的值
        ↓ 存進房間物件（room.mapKill，唯一真值）
Game_Info_SN +0x15 / +0x16 / +0x18 ──開戰時三欄都填 room.mapKill（U1 裁決：不確定哪一欄生效就全填）
        ↓
結束判斷 if (teamKills >= room.mapKill) ──讀的是同一個 room.mapKill，**不是**從封包讀回來的值
```

這三句在 v2 分散在 §4.1、§7 T4、§8 U1，看起來像三個不同來源；v3 明定它們是**同一個值的三個位置**。

**開關收斂**：每一步的開關驗證 ✅ 後 **7 天內收斂**（刪開關、保留驗證過的路徑），照 `AGENTS.md`。

**第一次 2 人實跑唯一要盯的：加入者有沒有崩潰**（PM 2026-09-22）。其他都其次。§5 的 `Death_SN` 處置、T1 的分隊，都是在這一輪第一次被真正考驗。

**順序理由**：T1 沒做，擊殺就無法歸隊；T3 比 T4 先，因為 `Timeout_CN` 是**已確認房主會送**的訊號，
而「達到目標就結束」是**伺服器自己判斷**的規則，風險較高。

## 8. 未知（實作前或實作中要解）

| # | 未知 | 影響 | 怎麼解 |
|---|---|---|---|
| U1 | TDM 是 mode 0 還是 1（決定 GoalScore 寫 `+0x16` 還是別處） | T4 | **PM 裁決：三個 GoalScore 欄位（`+0x15`／`+0x16`／`+0x18`）都填同一值**；v3 把它併進 §7.2 的單一資料流，填的值一律是 `room.mapKill` |
| U2 | ~~平手的 `WinTeamIndex` 填什麼~~ **PM 裁決：不擋 T3** | — | **訂我們的規則：擊殺數相同時，死亡數少的隊勝；仍相同則紅隊（0）勝。`WinTeamIndex` 永遠是 0／1，不需要平手值。** 反編譯 `EndGame_SN` 找真正的平手值改列低優先，找到再換 |
| U3 | **比賽中隊伍分數要用哪一包同步**（`Death_SN` 只更新個人分，PvP 首輪實測隊伍總分停在 `000`） | T2.5 | **已升級成實作步驟 T2.5**，不再只是未知：先 DLL 查出更新隊伍計分板的 SN，再加驗收。Moon 說 `Timeout_SN` 對加入者安全、可用來推分數（🟡，待核對） |
| U4 | 房間裡換隊（`Team_Change_All_SN 0x00222121`）格式 | 讓玩家自己選隊 | **本稿不做**，T1 先用輪流分配 |
| U5 | `Game_Score_SN 0x00222114` 格式 | 逐人計分板 | 本稿不做，Moon 自己也標未確認 |
| U6 | 原廠 TDM 預設 **20 分鐘／150 殺**（韓版 2009-02-24，與 Cache 地圖 1011 一致） | 預設值 | **v1 已查到，沿用**；實測時用小值 |

## 10. v2 → v3 改了什麼（2026-09-23，依 Sol 跨公司審查）

審查結論把 v2 整體降為 🟡，列出 §7 四處必須先收斂的矛盾。v3 逐條處理：

| # | Sol 指出的問題 | v3 的處置 |
|---|---|---|
| 1 | §7 T2「同隊含自殺不計分」與原廠 `ZTeamDM.uc:943-950` 相反（原廠把自殺記給對面隊） | **跟隨客戶端**。新增 §7.1 的兩套計分表，順便查清楚同隊誤殺的原廠規則（隊伍分不動、個人分仍 +1） |
| 2 | §7 T3 寫「送 `EndGame_SN`＋`User_Score_SN`」，與 §3 的「先 `User_Score_SN`」矛盾 | T3 逐字改成先 `User_Score_SN`、後 `EndGame_SN`，並加上 log 核對順序的驗收 |
| 3 | §4.1／§7 T4／§8 U1 三處講目標擊殺數，沒有一條可執行的資料流 | 新增 §7.2，明定 `room.mapKill` 是唯一真值，`Game_Info_SN` 三欄都填它，結束判斷讀同一來源 |
| 4 | 比賽中的隊伍分數同步沒有步驟，只寫在 U3 | 升成實作步驟 **T2.5**，前提是先 DLL 查出更新隊伍計分板的 SN |
| 5 | §3.1 冪等 guard 的理由「加入者也會送 `Timeout_CN`」沒有證據（客戶端有 `Game_Host_Check`＋`Game_Play_Check` 兩道閘門） | guard 保留，理由改成防重送、防延遲 `Death_CN`、防 timeout 與達標同時成立 |

§5（`Death_SN` 對加入者的處置）Sol 同意，維持原狀。

## 9. v1 → v2 改了什麼

- **§0 改寫**：v1 列的第一個原因（`campaignStarted_` 閘門）**在現行組態下是死碼**——
  `SERVER_DRIVEN_START_MODE` 更早就 return 了。真正的兩個原因是地圖 id 沒送、地圖預設值寫死 PvE。
  已修好，D2-1 ✅。
  **v1 當時就是看錯了**：它寫「在目前的程式碼上重新核對過，仍然成立」，但 v1（`6504ed5`，09-19 18:52）寫的時候 `SERVER_DRIVEN_START_MODE` **早在 09-16 18:07（`650401e`）就已經是 `'enabled'`**，那四個閘門當時就已經是死碼。它核對的是「閘門的程式碼還在」，沒有核對「那段程式碼還走不走得到」。
  （高階初稿曾寫「v1 寫於這個機制加入前，不是 v1 看錯」——**沒查證就下的判斷，是錯的**，已依 git 紀錄更正。）
- **v1 §5 步驟 1、2 已完成**，合併成 `PVP_START_FLOW_MODE`。
- **v1 §3「誰決定結束：還不知道」→ 已回答**：房主送 `Timeout_CN`，我方 log 有 12,472 筆實證。
- **新增 §5**：`Death_SN` 對加入者的矛盾與處置。
- **新增 §6**：PM 指定的硬規則。
- **確定比賽制**，不用 `EndRound_SN`。
- **保留 v1 的**：原廠 20 分鐘／150 殺、`Team_Change_All_SN`／`Game_Score_SN` 另開任務、不猜沒解完的 offset。
