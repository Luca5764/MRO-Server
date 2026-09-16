# ★★★ 突破:伺服器驅動開戰 = 第一次沒有崩潰

> 從 docs/opcode-ledger.md 第 1262–1288 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-16 18:01。啟用 `SERVER_DRIVEN_START_MODE`,收到 F5(`0x222103`)後改送 `Game_Wait_SN` → `Game_Info_SN`(不再讓房主 F5 直接 travel)。

**結果:客戶端沒有崩潰。** 房間畫面保留,中央彈出「提示 / Loading」對話框,客戶端進入等待狀態。之前每次都是即時 travel 回 `Store_01` 並崩潰——這是質變。

觀察到的封包:
```
100.152  C→S 0x222103   F5
100.152  S→C 0x420111   Game_Wait_SN → 客戶端進入 Loading 等待
100.303  S→C 0x222111   Game_Info_SN(場景 6，設地圖）
100.653  S→C 0x222111   retry
         （客戶端停在 Loading，不再送封包）
```

### 卡在 Loading 的原因(已定位)

`Game_Play_Start`（`0x10704700`，由場景 6 的 `Game_Info_SN` 呼叫）反編譯確認:**只設定內部狀態(隊伍索引 `[0xff0/0xff4]`、分數 `[0x1004/0x1008]`、模式旗標 `[0x1010]`），不 travel、不 Scene_Change**。

而伺服器驅動分支送完 `Game_Wait_SN` + `Game_Info_SN` 就 `return` 了,**沒送 ready/start 握手**。客戶端進了場景 6、地圖設好了,但在等 `Game_Ready_SN`/`Game_Start_SN` 放行。

**已補**(同一開關內):`Game_Wait_SN` → `Game_Info_SN` → `Game_Ready_SN 0x222102` + `Game_Start_SN 0x222104`。待測是否放行 Loading 並 travel 到 `Map_PC01`。

> 這是整個專案首次讓客戶端在開戰時**不崩潰**。地圖此時已正確設進 `[0xfc8]`(場景 6 的 handler 生效),若握手放行 travel,目標應為 `Map_PC01` 而非 `Store_01`。

---

