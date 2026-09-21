# 客戶端 UI 陷阱表

**這份專門記「操作者或實跑才知道、任何 log／DLL／截圖都看不出來」的 UI 行為。**
寫 Pico 劇本的人必讀；不寫劇本的可以不看（所以它不在 `AGENTS.md` 的陷阱表裡）。

**最右欄是重點**：欄位空著就代表**沒有任何動作在處理它**——
不用等實跑撞上才發現。今天的 `dismiss_notice` 缺口在這張表上就是一個空格。

**工作習慣（PM 2026-09-21 定）**：操作者口頭講了檔案裡沒有的事，**當輪就寫進這裡**，
不要留在對話裡——換一個 session 就沒了。

---

## 大廳

| 現象 | 證據 | 由誰處理 |
|---|---|---|
| 房間列要**雙擊**才能加入，單擊只是選取 | [SRC] `gate.game.dispatch.js` 對 `Enter_CQ` 的註解「double-click a room row」 | `join_room()`（`double_click_at`，兩次 CLICK_AT 擠進同一次 batch） |
| 房間列第一列在 client `(855, 275)`；原本猜的 `(920, 310)` 落在該列下緣之外 | [TEST] 2026-09-21 像素掃描 `shots/dual-netspeed-b-15-join_room-precondition.png` | `ROOM_LIST_FIRST_ROW_CLICK` |

## 登入畫面

| 現象 | 證據 | 由誰處理 |
|---|---|---|
| 帳號欄位**會殘留上一個帳號**，不能假設是空的 | [OBS] PM 2026-09-20；[TEST] 2026-09-21 實跑兩次都判定 `has_text` | `login_as()`（先判斷、非空才清，`HOME`＋`DELETE` 塞進一次 batch） |

## 房間

| 現象 | 證據 | 由誰處理 |
|---|---|---|
| **房主建房後會跳「您接受了房主的委任」，不點掉就無法開戰** | [OBS] 操作者 2026-09-21 | ⚠️ **2026-09-21 之前沒有任何動作處理**——三個劇本都缺 `dismiss_notice`，修正實作中 |
| 房間內閒置約 **60 秒**，客戶端會**自己**送 `Leave_CQ` 離開（原版防掛機） | [TEST] 2026-09-21 伺服器 log 量到 **60,022 ms**（建房 ms 39285630 → Leave ms 39345652）。既有 journal 記的是「約 80 秒」 | `idle_nudge()`（建房後與加入後各一次） |
| 房主與加入者的房間畫面**不同**（按鈕文字會變），畫面判定不能挑會變的區域 | [TEST] 2026-09-21 `room` marker 對兩者都失效 | `room` marker（2026-09-21 重新校準中） |

## 開戰流程

| 現象 | 證據 | 由誰處理 |
|---|---|---|
| 開場動畫約 **5 秒**，**ESC 可跳過** | [OBS] 操作者 2026-09-21（秒數是他的估計） | `enter_battle()` 第一步送 ESC |
| 機體選擇頁用 **F1–F8** 選，不是滑鼠點 | [OBS] 操作者 2026-09-21，`shots/mech-select-page.png` | `enter_battle(mech_key=...)` |
| 選機頁**有倒數（RESPAWN 進度條），時間到自動出機體**。舊實作「不送輸入也會成功」是**等超時**，不是「自動選完」 | [OBS] 操作者 2026-09-21；[LOG] 舊紀錄的 18 秒 gap | `enter_battle()` 改成主動按鍵，不再等超時 |
| 選機頁**每次重生都會再出現** | [OBS] 操作者 2026-09-21 | 尚無動作處理（戰鬥中重生的情境還沒自動化） |
| 八個槽位：F1 RAVEN 輕量型／F2 MASSACRE 強襲型／F3 PHANTOM 狙擊型／F4 FENRIS 裝備型／F5 ROXANNE 工兵型／F6 VALKYRIE 重裝型／F7 ZODIAC 火力型／F8 SPECTER | [OBS][SHOT] 同上。**來源是實機截圖，不是 DLL 或 Cache.Bin** | `MECH_SELECT_SLOTS` |

## 戰鬥中

| 現象 | 證據 | 由誰處理 |
|---|---|---|
| ESC 叫出的 `GAME MENU` **只能用滑鼠點，方向鍵＋Enter 無效**——沒有鍵盤 fallback | **[TEST] 操作者 2026-09-21 實機驗證** | `leave_battle()`（滑鼠點擊，座標 client `(867, 651)`） |
| ⚠️ **按下 `離開` 之後還有第二個確認對話框**：「您要結束遊戲嗎？（結束將會有懲罰。）」，兩個並排的按鈕 `離開`（左）／`取消`（右）。**不處理它就離不開戰場** | **[OBS][SHOT] 操作者 2026-09-21**，C 段第三次實跑當場抓到並手動介入 | ⚠️ **尚無動作處理**——`leave_battle()` 只點了第一層，第二層沒點，所以等不到 `Leave_SA` |
| **中途離開戰場「會有懲罰」**（對話框自己寫的） | [OBS] 同上 | 尚無處理。**測試帳號的戰績會被這個影響**，之後分析 P3 戰績寫回時要記得 |
| `GAME MENU` 四項列距僅 60–65 px：`選項`／`封鎖聊天`(client y≈586)／**`離開`(651)**／`取消`(712)。**點偏一列往上會改變客戶端狀態、往下靜默逾時** | [TEST] 2026-09-21 像素掃描 `shots/battle-esc-menu-std.png` | 同上 |
| 主控台用 **ScrollLock**（Pico 韌體轉成真實 F24）開啟 | [TEST] 2026-09-20 | `console_cmd_on()` |
| **主控台指令確實會被遊戲接收**：`stat net` 打完疊層就出現，`netspeed 100000` 打完 `Speed` 從預設變成 **15000**（被 `MaxClientRate` 夾住）| **[TEST][SHOT] 2026-09-21 C 段第三次** | `console_cmd_on()`（打字後會存一張證據截圖） |
| ⚠️ **但 `netspeed` 不會在對戰中跟房主重新協商**：加入者改成 15000 之後，房主 log 仍然只有加入時那兩行 `Client netspeed is 10000`，**沒有第三行** | **[TEST][LOG] 2026-09-21 C 段第三次**（三個環節都有獨立驗證） | — |
| `stat net` **可用**，欄位含 `Ping`／`Channels`／`In,Out`／**`Speed`**／`Reps`／`RPC`／`PV`／`VoiceBandwidth`／`VoiceTime`／`ControlTime`。**`Speed` 就是 netspeed 的值** | [SHOT] 2026-09-21 `shots/battle-statnet.png` | 尚無動作會讀這個數字（netspeed 實驗要用） |

## 結算

| 現象 | 證據 | 由誰處理 |
|---|---|---|
| 結算畫面約 **5 秒後自動消失**（也有 `離開` 按鈕可手動離開） | [OBS] 操作者 2026-09-21 | **尚無動作處理**——任何在結算頁上的操作只有 5 秒窗口 |
| 協力房預設 **5 回合**，`GameCampaign 1` 一次只過一回合，**第五次才跳結算** | [OBS][SHOT] 2026-09-21 | `campaign_win_all()` |
| RANK 由 `User_Score_SN` 的 `WinTeamRank` 決定；目前靠 `pveFixedRank` 送固定值 | [SHOT] `shots/campaign-result-screen.png` 顯示 S | 見 backlog `RANK-FORMULA` |

## 一閃而過的畫面（連續取樣的唯一正當理由）

1. 開場動畫（~5 秒、ESC 可跳）
2. 選機頁（倒數後自動出場）
3. 結算頁（~5 秒自動消失）

before/after 兩張截圖抓不到這三個。事件觸發的連拍（例如伺服器送出 `EndGame_SN` 時連拍 5 張）
比連續取樣便宜，優先考慮。
