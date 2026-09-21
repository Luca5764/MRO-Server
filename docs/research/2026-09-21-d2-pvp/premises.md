# D2（PvP TDM）設計稿的前提（2026-09-21 建立）

**這份只放前提，不是設計稿本身。** PvP 開工時以這份為起點。
前提全部來自 2026-09-21 的 MOON-2 核對（`../2026-09-21-moon-objective-protocol/`）與我們自己的實測。
**每一條都標了證據等級**，🟡／⬜ 的不要當成可以直接蓋房子的地基。

## 來自 Moon、我們核對過的

| # | 前提 | 狀態 | 依據 |
|---|---|---|---|
| P1 | **回合／勝負由伺服器決定**，客戶端自己的判定被註解掉了 | 🟡 [外部] Moon 說法，**我們尚未自己核對** | Moon `protocol_objective.en.md` |
| P2 | **勝方與客戶端的任務狀態矛盾會 GPF**（直接崩潰，不是靜默失敗） | 🟡 [外部] 同上，**尚未自己核對**。這條若成立，PvP 的結算封包一錯就是崩潰，不是畫面怪 | 同上 |
| P3 | **team 欄跟隨我們送的 `Game_Info_SN`**，不是固定 1／2。我們送 0／1 是對的 | ✅ [DLL]（未經跨公司審查） | `state.md` 第 4c 節；`verify-c-items.md` 第 2 項 |
| P4 | **`User_Score_SN` 可以在 `EndGame_SN` 之前送**：場景閘門是 `IsClient && (scene==5 \|\| scene==6)`，戰鬥中的場景 6 本來就啟用 | ✅ [DLL]（未經跨公司審查） | `verify-c-items.md` 第 5 項 |
| P5 | **加入者可以收 `Death_SN`／`EndRound_SN`**，不會出事（兩者機制不同：前者靠 `Game_Host_Check`，後者靠 GameInfo 的 null 檢查） | ✅ [DLL]＋[LOG]（未經跨公司審查） | `state.md` 第 4c 節 |
| P6 | `User_Score_SN`／`EndGame_SN` 對加入者安不安全 | ⬜ **未窮盡**，四個 callee 沒展開。**PvP 用到之前要補查** | `verify-b2-endround-vtable.md` |
| P7 | `Game_Score_Get`：`Mode` 2／3 回 goal，其餘回 score | ✅ [DLL]（未經跨公司審查） | `verify-c-items.md` 第 4 項 |

## 我們自己已經確立的（PvP 會直接踩到）

| # | 前提 | 狀態 | 依據 |
|---|---|---|---|
| P8 | **`Grade_Info_SN 0x00510101` 必須送 0**，否則 `IsMeGM_BD()` 為真 → `PlayerSelectMech.BeginState` 直接 `GotoState('Spectating')`，F1–F5 技能 HUD 不畫、Tab 計分板沒有玩家列。**PvE 看不出來，PvP 會整個卡住** | ✅ | `state.md` 第 4 節 |
| P9 | 戰鬥是 P2P，房主監聽 UDP 30907；每台可能當房主的機器都要開防火牆、網路設 Private | ✅ | `AGENTS.md`、`reference/setup.md` |
| P10 | **投射物會掉**：引擎的送出預算（`CurrentNetSpeed` 實測 10000 B/s）讓 `ToAll` 廣播在 `IsNetReady` 回 false 時**直接跳過、不排隊不重傳**。同機零掉包環境缺口反而更大（32–35%） | ✅ [DLL][LOG]（未經跨公司審查） | `state.md` 第 4c 節；`journal/2026-09-20-1945-toall-send-path.md` |
| P11 | 房間內閒置約 80 秒會被**客戶端自己**踢出（原版防掛機，`ZGUIController.uc:945-948`） | ✅ [SRC][OBS] | `journal/2026-09-19-0330-d1-step4-room-join.md` |
| P12 | 客戶端拒收整包超過 `0x400` bytes 的 frame，且之後的封包全部卡住、不報錯。**PvP 的計分類清單封包要算大小** | ✅ [DLL][LOG] | `state.md` 第 2 節 |

## 開工前要先補的

1. **P1／P2 自己核對**——這兩條是 Moon 的說法，我們還沒驗。P2 尤其重要：
   「矛盾會 GPF」意味著結算封包一錯就是崩潰，錯誤成本比 PvE 高一個量級。
2. **P6 補完**——`Dedi_End`／`Community_Chat_Clear`／`Event_Call`／`Scene_Change` 四個 callee。
3. **P10 的影響評估**——PvE 靠 AI 不在乎掉幾發，PvP 直接影響公平性。要先決定
   「接受並寫進已知限制」還是「改客戶端二進位提高預算」（後者是另一個層級的決定）。
4. PvP 房的開戰流程本身還沒打通（`journal/2026-09-15-03-campaign-only-start-flow-pvp-blocked.md`）。

## 不要在 PvP 重蹈的覆轍

- **一次只改一個變數。** PvE 那邊好幾次同時改兩個，結果無法歸因。
- **不要把推測寫成事實。** 這份裡 🟡 的五條，用之前要先驗。
- **未知封包一定要留完整 hex dump。**
