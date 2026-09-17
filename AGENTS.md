# MRO-Server — Metal Rage Online 伺服器模擬器

**本檔是唯一的規則檔，所有 AI 共用。** Codex 與 Antigravity 直接讀它，Claude Code 透過 `CLAUDE.md` 引入。不要另外建 `GEMINI.md`。細節放在 `docs/reference/`，需要時才讀（索引在最後一節）。

## 這個專案是什麼

2009 年 GameHi 的機甲 TPS《Metal Rage Online》（台版《鐵影特攻 Online》）的伺服器模擬器，Node.js 撰寫，程式在 `Metal Rage Online Server/`。原廠伺服器 2011 年停運，**沒有任何原始伺服器程式碼或封包紀錄**。

這是**逆向工程專案**。唯一的事實來源是客戶端的行為與客戶端檔案（`ZNetwork.dll` 等）。協定知識全部是從 DLL 與實際封包反推的。

## 工作原則

1. **不要把推測寫成事實。** 錯的「已確認」比「未知」傷害更大，會讓後面的推論整串歪掉。
2. **客戶端行為 > 我們的假設。** 衝突時一律以客戶端實際反應為準。
3. **先讀 DLL，再改程式。** 猜一次封包格式的代價是一整個測試場次，讀一次組語只要幾分鐘。
4. **未知封包一定要留下完整 hex dump，不要靜默吞掉。** 那是主要的資料來源。
5. **不要做大範圍重構。** log 格式與封包流程的穩定性比程式碼美觀重要。要重構先問。
6. **改 handler 時，註解寫明是客戶端的什麼動作觸發的。**
7. **一次只改一個變數。** 同時改兩個就無法歸因。

## 硬性約束（與操作者談定，不要重新提議）

1. **不繞過反作弊。** 不 patch 或 NOP XIGNCODE、不注入行程、不附加除錯器、不偽造輸入來源。純分析可以，修改不行。操作者自己的真實硬體輸入裝置（例如滑鼠硬體巨集、Pi Pico HID）不在此限。客戶端另有 y0da、Themida 與 anti-attach，細節見 `docs/reference/client.md`。
2. **不要把伺服器暴露到不信任的網路。** 沒有密碼驗證，未知使用者名稱會自動建帳號。
3. **遊戲操作由操作者手動執行。** WSL 注入的鍵盤滑鼠對客戶端無效，AI 只能看截圖（`tools/win/shot.sh`）與 log。

操作者講中文，會自己裝套件、開伺服器、操作客戶端。被糾正時通常是對的，直接改，不用反覆道歉。

## 一定要知道的陷阱

| 陷阱 | 細節 |
|---|---|
| `server.js` 必須 `listen(port, '0.0.0.0')`，不要改回 `listen(port)`，否則 Windows 端的客戶端連不到 WSL2 | `reference/setup.md` |
| 用 `metalrageserver.sql` 建資料庫，不要用 `database/schema.sql`（少兩張表） | `reference/setup.md` |
| `Metal Rage Online Server/static/` 約 1.2GB，不要掃描或整包讀取 | `reference/setup.md` |
| **客戶端拒收整包超過 0x400 bytes 的 frame**，而且之後的封包全部卡住，不報錯。清單類封包要算大小 | `docs/state.md` 第 2 節 |
| header 是 BE，body 幾乎都是 LE；字串編碼因封包而異（房間名稱是 UTF-16LE，`User_Default_SN`／`Game_User_SN` 的暱稱是 ASCII），照 DLL 確認 | `reference/protocol.md` |
| `client.getMessageBuffer` 會補齊到 16 bytes，`getExactMessageBuffer` 不會。客戶端會嚴格檢查某些封包的長度，不要隨手替換 | `reference/protocol.md` |
| dispatch 順序有意義：第一個回傳 true 的服務就結束處理 | `reference/protocol.md` |
| `ZDispatchGame` 的 handler 只在場景 6 生效，送錯場景會被靜默丟棄 | `docs/state.md` 第 2 節 |
| 伺服器送出客戶端 dispatcher 裡沒有的 opcode，會被直接忽略。查名稱用 `tools/dispatch-map.py`，**不要引用舊台帳的 opcode 表** | `docs/state.md` 第 1 節 |
| 程式檔名與 opcode 範圍不符：`lobby.dispatch.js` 處理的 `0x0023xxxx` 其實是對戰，`game.dispatch.js` 的 `0x0025xxxx` 其實是 Card | `docs/state.md` 第 5 節 |
| 客戶端換地圖會斷線重連，連線上的狀態靠 `session.js` 延續；「這條連線送過了」這類旗標不能延續 | `reference/protocol.md` |
| Ghidra 的參數順序與 stack 偏移常出錯，封包偏移一律回頭看組語確認；匯出表位址是 thunk | `reference/tools.md` |
| `send` 方向紀錄的長度含補齊的 0，不要誤判成 body 結構 | `reference/tools.md` |
| 客戶端 log `MetalRage/data/Log/MetalRage.log` 會寫出客戶端怎麼理解目前狀態，以及崩潰堆疊，不要忽略 | `reference/tools.md` |
| 截圖要看完整遊戲畫面。曾把只框到標題列的截圖誤判為「白畫面」，推出一整串錯誤理論 | `reference/tools.md` |

## 協作與紀錄規則

這個專案由好幾個 AI 輪流推進（Claude、Codex、Gemini），同一時間只有一個在動。

### 等級與權限

- **高階：** Claude 主力、Codex 主力（GPT-6 Astra）、Codex reviewer（Astra）
- **中階：** Gemini（Antigravity）、Codex 的 Luna 子 agent、Claude 的 Sonnet 子 agent

| 動作 | 高階 | 中階 |
|---|---|---|
| 提假設、設計實驗、解讀組語 | 可以 | 可以提，但要標「待審」 |
| 標 ✅ 已確認／❌ 已排除、改 `docs/state.md` | 可以 | **不可以** |
| 寫日誌、存原始資料到 `docs/research/` | 可以 | 可以，結論一律標 🟡 或「待審」 |
| 改 handler 的預設行為 | 可以 | **不可以**，只能加預設關閉的開關 |
| 推翻已標 ✅ 的結論 | 用追加更正的方式 | 只能寫疑點，等審查 |

**審查要跨公司：** Codex 做的由 Claude 審，Claude 做的由 Codex reviewer 審，Gemini 做的由下一個接手的高階審。審查要核對結論跟證據對不對得上：DLL 位址是否真的在做描述的事、引用的 log／封包／截圖是否存在、是否同時改了兩個變數。

### 紀錄檔

| 檔案 | 用途 | 規則 |
|---|---|---|
| `docs/HANDOFF.md` | 交接快照與下一步 | 每次交接更新 |
| `docs/state.md` | 現況 | 上限約 300 行，錯了直接改，只有高階能改 |
| `docs/journal/INDEX.md` | 日誌索引，一件事一行 | 只追加 |
| `docs/journal/<日期>-<序號>-<主題>.md` | 一個調查或實驗一篇，50–100 行 | 只追加；發現錯誤就寫更正，並在原條目加「已被 <檔名> 更正」 |
| `docs/research/<日期>-<主題>/` | decompile、hex dump 等大段原始資料 | 日誌只放連結 |
| `docs/backlog.md` | 寫成契約、可以交給中階的任務 | — |
| `docs/opcode-ledger.md` | 舊台帳，**已凍結**，內容已搬進 journal | 不新增，不引用其中的 opcode 表 |

- opcode 一律寫完整 8 位 hex（`0x00230121`），DLL 位址一律寫完整（`0x107f8fad`），讓 `grep -rl` 找得到。
- git 已經記下的（改了哪幾行、什麼時候改）不要重複寫。日誌只記為什麼、依據是什麼、失敗過什麼。

### 證據標籤

狀態：`✅ 已確認`／`🟡 假設`／`⬜ 未知`／`❌ 已排除`。來源：`[DLL]` 附位址、`[CACHE]` 附 offset、`[LOG]` 附檔名、`[SHOT]` 附路徑、`[OBS]` 操作者回報、`[TEST]` 改了什麼與結果、`[GUESS]` 推測。

**沒有證據標籤就不准標 ✅。** commit 訊息只寫改了什麼；日誌沒有證據，就不寫「因為什麼」。

### 接手時

依序讀，讀完就停：`docs/HANDOFF.md` 快照 → `docs/state.md` → `docs/journal/INDEX.md` 最後 20 行 → grep 要處理的 opcode。
然後**先驗證上一位最後標的一兩個 ✅**，再開始新工作。

### 交接時（額度隨時可能用完）

- 每完成一個小段落就 commit。沒做完就 commit 成 `wip: ...` 並寫明做到哪。**不留沒 commit 的半成品。**
- 更新 `HANDOFF.md` 快照，下一步寫成契約。
- commit 訊息最後一行加 `Agent: <工具> (<等級>)`，例如 `Agent: codex (高階)`。
- 高階週額度剩約 15% 時（操作者會提醒），在 `docs/backlog.md` 留 3–5 個契約任務給中階。
- 資料庫變更要寫成 commit 進去的腳本，不直接下 SQL。

### 任務契約

交給任何人（子 agent、下一個 AI、backlog）的任務都寫六項：**目標、範圍、背景、限制、交付、完成條件**。
執行方遇到架構決策、範圍外改動、跟既有 ✅ 矛盾、需要更深推理時，**停下來回報，不要自己擴大範圍**。回報只給結論、路徑、位址，不貼大段原始輸出。

### 只剩中階可用時

- **只做 `docs/backlog.md` 裡的任務，做完就停，不要自己找事做。**
- 程式改動放 `flash-wip` 分支，等高階審過再合併。
- 不改資料庫、不改預設行為、不標 ✅。寫的東西在 `INDEX.md` 標「待審」，高階回來第一件事就是清掉待審。

### 測試與分工機制

- 沒有自動化測試。真正的測試是操作者開遊戲；AI 的驗證是切 session 紀錄、對照客戶端 log、看截圖、讀組語、用舊封包離線比對。
- 客戶端與伺服器只有一套，**實驗不能平行**，只有分析可以平行。
- 分派子 agent 的機制各自實作：Codex 用 `.codex/agents/` 與 `.agents/skills/astra-orchestrator`；Claude Code 用 `.claude/agents/`（explorer、worker、verifier）；Antigravity 只擔任中階。

## 參考文件

| 檔案 | 什麼時候讀 |
|---|---|
| `docs/reference/setup.md` | 啟動伺服器、資料庫、建帳號、Cache.Bin、本機安裝狀況 |
| `docs/reference/protocol.md` | 動到封包格式、dispatch、session、系統層訊息、命名慣例 |
| `docs/reference/tools.md` | 用 `slice.js`、marker、截圖、反編譯工具；調查新 opcode 的標準流程 |
| `docs/reference/client.md` | 客戶端啟動參數、保護機制、原廠網域 |
| `docs/client-dispatch-map.md` | 查 server→client 的 opcode 名稱 |
| `docs/next-test.md` | 下一輪要請操作者測的內容 |
