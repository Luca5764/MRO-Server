# D2 PvP 團隊死鬥（TDM）設計稿：計分、回合、勝負

> **狀態：v2，PM 2026-09-22 審查通過（附 4 處必改，已改），可開工 T1。** 高階 2026-09-22 在 v1（explorer 撰、全篇 🟡）上改版。
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
理由：**加入者的計時器也會走到 00:00**，不能假設只有房主會送 `Timeout_CN`——兩人房就可能在同一秒收到兩包 `Timeout_CN`，擊殺達標與時間到也可能撞在一起。沒有這個狀態，同一場比賽會被結束兩次。

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

## 7. 實作步驟（每步一個開關，預設關；開關關閉時 golden replay 四樣本逐 byte 不變）

| 步 | 開關 | 做什麼 | 怎麼驗 |
|---|---|---|---|
| **T1** | `PVP_TEAM_ASSIGN_MODE` | `Game_User_SN` TeamIndex 依加入順序輪流填 0／1 | 2 人實跑：兩人是否被分到不同顏色、互相是敵人 |
| **T2** | `PVP_KILL_TRACKING_MODE` | 房間層級記錄兩隊擊殺數（從 `Death_CN` 的 attacker 歸隊）。**歸隊規則**：attacker 與 victim **同隊（含自殺）→ 不計分**（不採 −1，理由：沒有原廠依據，而 −1 會讓分數可能變負、計分板顯示未驗證）；**attacker 解析不到 → 記 WARN、不計分**。⚠️ **開工前提：`Death_CN` 的 attacker 欄位 offset 要先 ✅ [DLL]** | log 印每隊擊殺數；比對實際擊殺 |
| **T3** | `PVP_TIMEOUT_MODE` | 新開 `Timeout_CN` handler：比擊殺數 → 送 `EndGame_SN`＋`User_Score_SN` | 把時限設成 1 分鐘，等它時間到 |
| **T4** | `GAME_INFO_TDM_GOAL_MODE` | `Game_Info_SN +0x16` 填目標擊殺數；擊殺達標就結束 | 目標設小（例如 3），打到 3 殺 |
| **T5** | — | 結算頁 → 回房 | 沿用 PvE 流程，確認兩人都回到房間 |

**開關收斂**：每一步的開關驗證 ✅ 後 **7 天內收斂**（刪開關、保留驗證過的路徑），照 `AGENTS.md`。

**第一次 2 人實跑唯一要盯的：加入者有沒有崩潰**（PM 2026-09-22）。其他都其次。§5 的 `Death_SN` 處置、T1 的分隊，都是在這一輪第一次被真正考驗。

**順序理由**：T1 沒做，擊殺就無法歸隊；T3 比 T4 先，因為 `Timeout_CN` 是**已確認房主會送**的訊號，
而「達到目標就結束」是**伺服器自己判斷**的規則，風險較高。

## 8. 未知（實作前或實作中要解）

| # | 未知 | 影響 | 怎麼解 |
|---|---|---|---|
| U1 | TDM 是 mode 0 還是 1（決定 GoalScore 寫 `+0x16` 還是別處） | T4 | **PM 裁決：照 v1，三個 GoalScore 欄位（`+0x15`／`+0x16`／`+0x18`）都填同一值** |
| U2 | ~~平手的 `WinTeamIndex` 填什麼~~ **PM 裁決：不擋 T3** | — | **訂我們的規則：擊殺數相同時，死亡數少的隊勝；仍相同則紅隊（0）勝。`WinTeamIndex` 永遠是 0／1，不需要平手值。** 反編譯 `EndGame_SN` 找真正的平手值改列低優先，找到再換 |
| U3 | **加入者的計分板會不會跟著 `Death_SN` 更新**，還是要靠 `Timeout_SN` 同步 | 顯示正確性 | T2 實跑時直接看加入者畫面；Moon 說 `Timeout_SN` 對加入者安全、可用來推分數（🟡） |
| U4 | 房間裡換隊（`Team_Change_All_SN 0x00222121`）格式 | 讓玩家自己選隊 | **本稿不做**，T1 先用輪流分配 |
| U5 | `Game_Score_SN 0x00222114` 格式 | 逐人計分板 | 本稿不做，Moon 自己也標未確認 |
| U6 | 原廠 TDM 預設 **20 分鐘／150 殺**（韓版 2009-02-24，與 Cache 地圖 1011 一致） | 預設值 | **v1 已查到，沿用**；實測時用小值 |

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
