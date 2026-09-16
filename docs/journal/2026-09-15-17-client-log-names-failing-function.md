# 客戶端 log 會直接指名出錯的 UnrealScript 函式與變數

> 從 docs/opcode-ledger.md 第 664–679 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-15。先前只知道客戶端 log 有 `ScriptLog` 與引擎的 `Browse`／`LoadMap`。這次發現它也會記錄 **UnrealScript 執行期錯誤**，且指名到函式與變數層級：

```
Error: ZPopup_MapSelect Package.ZPopup_MapSelect
  (Function ZGameMainMenu.ZPopup_MapSelect.OnDraw_Preview:07DD)
  Accessed array 'm_MapInfoList' out of bounds (0/0)
```

包含**套件名、類別名、函式名、bytecode 偏移、變數名、實際的索引/長度**。`ZGameMainMenu.tzp` 是 SEED 加密的、拿不到 bytecode，但客戶端執行時會自己把出錯位置講出來。

**每次卡關都應該 grep 這個檔案的 `Error:` 與 `ScriptLog:`**，它往往比封包更直接。

---

