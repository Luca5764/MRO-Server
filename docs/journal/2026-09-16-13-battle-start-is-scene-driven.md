# ★★★ 開戰是場景驅動的：`Game_Info_SN` 一直送錯場景

> 從 docs/opcode-ledger.md 第 1187–1226 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-16。Ghidra 反編譯各 dispatcher 的 `Check(SCENE_TYPE)` 方法（它設定 `*(this+4)` 啟用旗標，每個 handler 開頭都檢查它）：

| Dispatcher | `Check` 條件 | 啟用場景 |
|---|---|---|
| `ZDispatchRoom` | `IsClient && (scene==5 \|\| scene==6)` | 房間 = **5 或 6** |
| `ZDispatchWaiting` | `scene == 1` | **1（Waiting）** |
| `ZDispatchGame` | `scene == 6` | 對戰 = **6** |

**關鍵：** `Game_Info_SN`（`0x00222111`）唯一會設 `[0xfc8]`（地圖）並呼叫 `Scene_Change(6)` 的 handler 在 **`ZDispatchWaiting`，只在場景 1 啟用**。

我方一直在**房間場景（5）**送 `0x00222111`。那裡 `ZDispatchWaiting` 沒啟用，該封包**沒有任何 handler 接**（`ZDispatchGame` 也要場景 6）——所以 `[0xfc8]` 從未被寫入，恆為 0。

### 這解釋了全部

- 崩潰 URL 走 `Store_01` 且**無 `Failed - MapIndex`** → 查表成功查到 Map ID **0** = `Store_01`/`HangarGameInfo`/goal 0/time 0，與 URL 每個欄位吻合
- `[0xfc8]` = 0 是因為設它的封包送到了沒有 handler 的場景
- 之前「時機太晚 / 太早」「隨房間狀態送」全部是錯的方向——**不是時機，是場景**

### 場景 1（Waiting）的握手，我方從未實作

`ZDispatchWaiting` 在場景 1 的三個 handler：

| Opcode | Handler |
|---|---|
| `0x00410102` | `Regist_SA`（回應客戶端的 `Regist_CQ 0x00410101`） |
| `0x00410103` | `Clear_SQ` |
| `0x00222111` | `Game_Info_SN`（設地圖 + `Scene_Change(6)`） |

正確流程推定：房間按開始 → 客戶端進場景 1（Waiting）→ 送 `Regist_CQ 0x00410101` → 伺服器回 `Regist_SA 0x00410102` → 伺服器送 `Game_Info_SN`（此時場景 1，handler 生效，設地圖並切場景 6）→ travel 進地圖。

崩潰那輪：**整個 session 沒有任何 `0x0041xxxx` 封包**。客戶端從未進場景 1，按 F5 只是原地 ClientTravel 回 `Store_01`。

### ⬜ 下一個未知：什麼讓客戶端從房間進入場景 1？

客戶端不會自己從房間跳到 Waiting——必有伺服器封包觸發。候選（房間 dispatcher 內、我方部分有送）：`Game_Ready_SN 0x222102`、`Game_Start_SN 0x222104`、`Game_Wait_SN 0x420111`。需反編譯這些 handler，找出哪個呼叫 `Scene_Change(1)` 或觸發客戶端送 `Regist_CQ`。**這是目前進戰鬥的唯一阻塞點。**

---

