# ✅ `0x00222112` Game_User_SN — 記錄大小確認為 `0x1E5`

> 從 docs/opcode-ledger.md 第 805–812 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-15。反組譯 `ZDispatchGame::Game_User_SN`（`0x107d8ae0`）可見 `push 0x1e5` 與 `add esi, 0x1e5`：記錄長度 **485 bytes**，與 `room-game-user.sender.js` 既有的 `GAME_USER_RECORD_SIZE = 0x01E5` 一致；body 起點同樣是 `lea eax, [edx + 0x10]`，標頭 2 bytes。

**原作者的結構猜對了，錯的只有 opcode**（`0x00230111` → `0x00222112`，已修）。欄位細節尚未逐一比對。

---

