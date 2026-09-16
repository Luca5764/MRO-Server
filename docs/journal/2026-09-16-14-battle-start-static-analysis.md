# ★ 開戰機制的完整靜態分析（進展到加密邊界）

> 從 docs/opcode-ledger.md 第 1227–1261 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-16。承上「場景驅動」，反編譯把機制挖到原生程式碼的盡頭。

### 各 handler 的場景與行為

| 封包 | Handler / 場景 | 行為 |
|---|---|---|
| `0x00420111` Game_Wait_SN | `ZDispatchRoom`（場景 5/6） | `Game_Data_Clear` + `Scene_Change(6)` |
| `0x00222111` Game_Info_SN | `ZDispatchWaiting`（場景 1） | `Game_Info_Set`（設 `[0xfc8]`）+ `Game_Play_Start` + `Scene_Change(6)` |
| `0x00222111` Game_Info_SN | `ZDispatchGame`（場景 6） | `Game_Info_Set`（設 `[0xfc8]`）+ `Game_Play_Start`，**無** `Scene_Change` |
| travel URL | `Game_Info_URL_Get`（`0x10733cf0`） | 讀 `[0xfc8]` 查 Cache.Bin 組 URL |

### 矛盾點（房主路徑）

崩潰 log 那行是 `[ ZPage_Room ][ GameStart ]`——**房間 UI 腳本**發起的 travel，發生在按 F5 當下、**場景 5**，讀 `[0xfc8]` 組 URL。

但 `[0xfc8]` 只由 `Game_Info_SN` 設定，而該封包在**場景 5 沒有任何 handler**（Waiting 要場景 1、Game 要場景 6、`ZDispatchRoom` 不處理 `0x222111`）。

→ **房主在房間按 F5 時，`[0xfc8]` 結構上不可能非 0。** 查表得 Map ID 0 = `Store_01`，於是 travel 回機庫、崩潰。

### 已排除

- 難度鈕（初級/中級/高級）**不送封包**，純客戶端選擇（整場僅一個 `0x222103`，零 unhandled）
- 封包順序：我方在 F5 後才送 `Game_Info_SN`，但客戶端的 `ZPage_Room.GameStart` 在 F5 當下就同步 travel，任何伺服器回應都來不及
- 「時機」「隨房間狀態送」「連送兩次」皆非解——**根因是房間場景無 `0x222111` handler**

### ⬜ 剩餘未知落在加密邊界

`ZPage_Room.GameStart` 究竟如何決定 travel 目標（讀 `[0xfc8]`？讀房間本地的 `MyRoomInfo`？還是有 fallback 到當前關卡？）——答案在 `ZPage_Room` 的 UnrealScript bytecode，位於 **`data/MUD/ZGameMainMenu.tzp`，SEED 加密，無法取得**。原生 DLL 這側的靜態分析已到盡頭。

**可行的下一步（推測，需實測）：** 伺服器在收到 `0x222103` 後，改為**優先送 `Game_Wait_SN` 把客戶端推進場景 6**，讓場景 6 的 `ZDispatchGame::Game_Info_SN` 有機會設 `[0xfc8]` 並由 `Game_Play_Start` 驅動 travel——即**放棄房主的 F5 直接 travel，改為伺服器驅動**。但這能否搶在客戶端 `ZPage_Room.GameStart` 之前，無法從靜態分析確定，只能試打。

---

