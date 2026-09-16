# 進地圖之後:卡在任務簡報,等待 spawn

> 從 docs/opcode-ledger.md 第 1330–1362 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-16。成功 travel 到 `Map_PC01` 後,客戶端停在 **MISSION BRIEFING** 畫面,可 WASD 移動視角但機體未 spawn、戰鬥未開始。操作者記憶:協力模式需等玩家載入完再選機體。

### 進地圖後客戶端送出的封包

| Opcode | 次數 | 我方回應 | 判讀 |
|---|---|---|---|
| `0x00420114` Ready_Host_CA | 1 | 0x420116 | ✅ ready-host 握手接上 |
| `0x00420117` | 1 | fallback→0x420118 | ⬜ 未知,in-map 請求 |
| `0x00230151` | 1 | fallback→0x230152 | 疑似「開始回合」請求 → `BeginRound_SN` |
| `0x00230111` | 每秒 1 次 | **誤回 Lobby Enter SA + 空房間清單** | ⬜ in-map 輪詢,非 Lobby Enter |

### 關鍵反編譯

- **`BeginRound_SN`（`0x00230152`，`0x1070257c`）只呼叫 `Game_Play_Start`**——不解析 body（空 6-byte 即可）、不 spawn 機體。需場景 6（`this[4]!=0`）。
- **機體 spawn 是客戶端側的事。** travel URL 是 `Map_PC01?Listen?...`——客戶端作為 **listen server 主機**,機體生成由其自身的 `ZModePve` GameInfo 腳本負責,不由伺服器封包推動。伺服器封包只驅動客戶端的狀態/UI 前進。

### 兩個要修的猜錯 handler

1. **`0x00230111`**：`lobby.dispatch.js` 猜為「Lobby Enter CQ」,每秒誤回 `0x230112`+空房間清單。in-map 時這是輪詢封包,誤回造成噪音迴圈（觀察到連續 380+ 秒每秒一對）。**真實用途待反編譯客戶端 `execGate_Lobby_Enter` / 相關 exec 釐清。**
2. **`0x00230151` / `0x00420117`**：in-map 請求,目前只用 fallback 矇。

### 下一步方向

進到「簡報 → spawn 機體」需要:客戶端的 `ZModePve` GameInfo(listen server 側)決定開打。這可能是:
- 簡報有倒數/等待玩家機制,單人時需某個「可開始」信號
- 或某個 in-map 封包(`0x230151`?)需正確回應才放行

⬜ 待觀察:簡報畫面是否自行倒數開始。下次進到該畫面時截圖確認有無倒數/人數/等待提示。

---

