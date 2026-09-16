# ✅ `Game_Info_URL_Get` 完整邏輯（Ghidra）

> 從 docs/opcode-ledger.md 第 1091–1115 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-16，`0x10733cf0` 反編譯：

```c
cache = UCacheManager::GetCache();
for (i = 0; i < cache[0x84]; i++) {
    if (entry[0] == *(this + 0xfc8)) {                 // 以 [0xfc8] 查 Map ID
        mapName  = FString(cache[0x80] + 0x20 + i*0xBC);   // FMapEntry+0x20
        gameInfo = FString(cache[0x80] + 0x54 + i*0xBC);   // FMapEntry+0x54
        goto build;
    }
}
Log("UZNetwork_DJ::Game_Info_URL_Get: Failed - MapIndex");   // 失敗僅記錄
build:
    team = Game_User_Team_Get(this, *(this + 0x44c));   // Name=%d 也取自 0x44c
    switch (*(this + 0xfcc)) { ... }                    // 選 host / guest 格式字串
```

**查表失敗時地圖名與 GameInfo 字串維持空白**，URL 會長成 `start ?Listen?...`。我方觀察到的是 `Store_01` + `ZModeHangar.HangarGameInfo`——**查表成功，`[0xfc8]` 就是 0**。

⬜ `[0xfcc]` 決定用 host 還是 guest 格式，`Game_Info_Set` **不寫入它**，來源未知。

---

