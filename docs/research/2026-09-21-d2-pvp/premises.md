# D2（PvP TDM）設計稿的前提（2026-09-21 建立）

**這份只放前提，不是設計稿本身。** PvP 開工時以這份為起點。
前提全部來自 2026-09-21 的 MOON-2 核對（`../2026-09-21-moon-objective-protocol/`）與我們自己的實測。
**每一條都標了證據等級**，🟡／⬜ 的不要當成可以直接蓋房子的地基。

## 來自 Moon、我們核對過的

| # | 前提 | 狀態 | 依據 |
|---|---|---|---|
| P1 | **回合／勝負由伺服器決定。** 但機制分兩層：(a) Blow／SuddenDeath／Occupation 連**偵測本身**都被物理註解掉；(b) Rage／plain TDM 的偵測**還活著**，但終點 `EndGame()` 被覆寫成空殼（`DefaultGameInfo.uc:395-405`，只有 `Reason=="TimeLimit"` 會動，而且做的是送 `Timeout_CN` 把決定權交回伺服器）。**兩者效果相同，但將來要恢復本地判定的成本差很多。** `ZModePve` 也沒覆寫 `EndGame()`→**PvE 與 PvP 走同一套機制** | ✅ [SRC] 自己從解密源碼核對，逐條有行號（**未經跨公司審查**） | `verify-p1p2.md` |
| P2 | ~~勝方與客戶端的任務狀態矛盾會 GPF~~ **→ Moon 2026-09-21 自己收回這個說法**（原依據只是兩次實跑、兩次只差 winner byte，是相關性不是因果）。**改寫成**：`BlowMission` 回合重啟時的**垃圾回收**，在某種選機頁狀態下會 GPF | ⬜ **觸發條件未知**。他手記的堆疊（原始 log 已被覆蓋）：`BlowMission.RoundEnd.Timer ← AActor::execConsoleCommand ← UGameEngine::Exec ← UObject::CollectGarbage ← ...(Class ZGameMidMenu.ZSlotSelectPage Info[0])... GPF`——**崩潰在垃圾回收裡，不在任何勝負校驗**。與我們先前找到的候選 `ZSlotSelectPage.uc:46` 同方向 | `verify-p1p2.md`；PM 轉述 |
| P2b | **推測的路徑（🟡 中段未驗）**：`BeginRound()` → 重置所有 actor → `LevelInfo.Reset()` → 垃圾回收 → 撞上選機頁物件。`Engine/LevelInfo.uc:469-476` 的 `Reset()` 裡有 `ConsoleCommand("OBJ GARBAGE")`，而**全部源碼裡由腳本主動觸發 GC 的只有這一處**（另一處在 GameSpy 查詢）。`BlowMission.uc:217-223` 的 `RoundEnd.Timer()`（`BeginState` 用 `SetTimer(10,false)` 設的）呼叫 `Global.Timer()` 然後 `BeginRound()` | 🟡 `BeginRound` 到 `LevelInfo.Reset()` 這一段**沒有追過** | 同上 |
| P3 | **team 欄跟隨我們送的 `Game_Info_SN`**，不是固定 1／2。我們送 0／1 是對的 | ✅ [DLL]（未經跨公司審查） | `state.md` 第 4c 節；`verify-c-items.md` 第 2 項 |
| P4 | **`User_Score_SN` 可以在 `EndGame_SN` 之前送**：場景閘門是 `IsClient && (scene==5 \|\| scene==6)`，戰鬥中的場景 6 本來就啟用 | ✅ [DLL]（未經跨公司審查） | `verify-c-items.md` 第 5 項 |
| P5 | **加入者可以收 `Death_SN`／`EndRound_SN`**，不會出事（兩者機制不同：前者靠 `Game_Host_Check`，後者靠 GameInfo 的 null 檢查） | ✅ [DLL]＋[LOG]（未經跨公司審查） | `state.md` 第 4c 節 |
| P6 | `User_Score_SN`／`EndGame_SN` 對加入者安不安全 | ⬜ **未窮盡**，四個 callee 沒展開。**PvP 用到之前要補查** | `verify-b2-endround-vtable.md` |
| P7 | `Game_Score_Get`：`Mode` 2／3 回 goal，其餘回 score | ✅ [DLL]（未經跨公司審查） | `verify-c-items.md` 第 4 項 |

## 我們自己已經確立的（PvP 會直接踩到）

| # | 前提 | 狀態 | 依據 |
|---|---|---|---|
| P8b | **Moon 的 GM／觀察者觀察不能直接套到我們身上**：他的客戶端 `m_MyAccountLevel` 預設被改成 1（`0x107398d0`），我們的是原廠 | 🟡 [外部] Moon 2026-09-21 自述 | PM 轉述 |
| P8 | **`Grade_Info_SN 0x00510101` 必須送 0**，否則 `IsMeGM_BD()` 為真 → `PlayerSelectMech.BeginState` 直接 `GotoState('Spectating')`，F1–F5 技能 HUD 不畫、Tab 計分板沒有玩家列。**PvE 看不出來，PvP 會整個卡住** | ✅ | `state.md` 第 4 節 |
| P9 | 戰鬥是 P2P，房主監聽 UDP 30907；每台可能當房主的機器都要開防火牆、網路設 Private | ✅ | `AGENTS.md`、`reference/setup.md` |
| P10 | **投射物會掉**：引擎的送出預算（`CurrentNetSpeed` 實測 10000 B/s）讓 `ToAll` 廣播在 `IsNetReady` 回 false 時**直接跳過、不排隊不重傳**。同機零掉包環境缺口反而更大（32–35%） | ✅ [DLL][LOG]（未經跨公司審查） | `state.md` 第 4c 節；`journal/2026-09-20-1945-toall-send-path.md` |
| P11 | 房間內閒置約 80 秒會被**客戶端自己**踢出（原版防掛機，`ZGUIController.uc:945-948`） | ✅ [SRC][OBS] | `journal/2026-09-19-0330-d1-step4-room-join.md` |
| P12 | 客戶端拒收整包超過 `0x400` bytes 的 frame，且之後的封包全部卡住、不報錯。**PvP 的計分類清單封包要算大小** | ✅ [DLL][LOG] | `state.md` 第 2 節 |

## 客戶端版本比對（Moon 2026-09-21，🟡 外部來源）

他比對過雙方的客戶端二進位：**`Engine.dll`／`IpDrv.dll`／`Core.dll`／exe 完全相同**，
只有 **`ZNetwork.dll` 差 34 bytes、共 7 處**（GM 預設值、商城、信箱的場景檢查），
**沒有碰戰鬥路徑**。

→ **戰鬥相關的位址兩邊可以互相引用**，這對交流很有價值。
→ 但 **GM／觀察者相關的觀察不能互通**（見 P8b）。
🟡 這是他自述，我們沒有自己比對過他的檔案。

另外他提到：他遇到的 `EndRound_SN` 問題其實是 **`IsPlay` 被清掉**，補送 `BeginRound_SN` 就能解。
我們在 `lobby.dispatch.js:264-347` 本來就會廣播 `BeginRound_SN`，所以沒遇到這個問題。

## PvP 模式的上線順序（PM 2026-09-21 裁決）

**第一個做 plain TDM／Rage**，理由兩條：
1. 偵測鏈**還活著**（`ZTeamDM.uc:935-960` → `ZDeathMatch.uc:285` → `ZTeamDM.uc:880-895`），
   房主會自己算分、時間到送 `Timeout_CN`——我們只要負責送 `EndRound_SN`／`EndGame_SN`。
2. **沒有「任務狀態」可以跟伺服器判的勝方互相矛盾**——也就是說 P2（GPF）那個風險
   在這兩個模式上**結構上不存在**。

**Blow／SuddenDeath／Occupation 排後面**，等拿到 Moon 的崩潰堆疊再做：
它們有任務狀態（炸彈、佔領區），正是 P2 描述的矛盾條件成立的地方，
而 P2 目前是 ⬜、純源碼查不出來。

## 第一個 PvP 模式動工前要派的核對（PM 2026-09-21）

**P2 的那條 GC 路徑是任何回合制模式都可能走到的，包括多回合的 TDM。** 所以即使先做 TDM，
也不能當它不存在。動工前開一個 explorer 任務，回答兩個問題：

1. **哪些模式的回合重啟會走到 `LevelInfo.Reset()`？**
2. **我們 PvE 的回合推進有沒有走到？**

如果 PvE 有走到而且**從沒崩潰過**，它就是一個對照組——差別會落在**選機頁當時的狀態**
（是否開著、是否正在倒數）。唯讀任務，只要列出路徑與檔名行號，**不要猜機制**。

## 開工前要先補的

1. ~~**P1／P2 自己核對**~~ **→ P1 已完成（`verify-p1p2.md`，PM 機械核對通過）。
   P2 維持 ⬜，PM 裁決不再花源碼工**——改用「第一個模式選沒有任務狀態的 TDM／Rage」
   從設計上繞開，見上一節。
2. **P6 補完**——`Dedi_End`／`Community_Chat_Clear`／`Event_Call`／`Scene_Change` 四個 callee。
3. **P10 的影響評估**——PvE 靠 AI 不在乎掉幾發，PvP 直接影響公平性。要先決定
   「接受並寫進已知限制」還是「改客戶端二進位提高預算」（後者是另一個層級的決定）。
4. PvP 房的開戰流程本身還沒打通（`journal/2026-09-15-03-campaign-only-start-flow-pvp-blocked.md`）。

## 不要在 PvP 重蹈的覆轍

- **一次只改一個變數。** PvE 那邊好幾次同時改兩個，結果無法歸因。
- **不要把推測寫成事實。** 這份裡 🟡 的五條，用之前要先驗。
- **未知封包一定要留完整 hex dump。**
