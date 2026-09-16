# ★★★ 崩潰真正的原因：`Game_Info_SN` 送得太晚（不是欄位錯，是時機錯）

> 從 docs/opcode-ledger.md 第 901–949 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-16。**先前對「fallback URL」的判讀是錯的。**

我們一直把這行當成「查表失敗後的 fallback」：

```
start Store_01?Listen?LPort=30907?Name=1?Game=ZModeHangar.HangarGameInfo
  ?MaxPlayers=1?GoalScore=0?TimeLimit=0?BalanceTeams=0?numbots=0?team=255
```

但它**不是 fallback，是一次成功的查表——查到了錯的地圖**。Cache.Bin 表中 Map ID **`0`** 正是：

| Map ID | 地圖 | GameInfo | Goal | Time |
|---|---|---|---|---|
| `0` | `Store_01` | `ZModeHangar.HangarGameInfo` | 0 | 0 |

`GoalScore=0`、`TimeLimit=0` 與該筆完全吻合。決定性證據是 **客戶端 log 裡從未出現 `Failed - MapIndex`**——查表根本沒失敗過。`[this+0xfc8]` 的值一直是預設的 `0`。

### 時序

```
60.276s  C-->S 0x00220201   建房
90.346s  C-->S 0x00222103   按下開始 ← 客戶端在此刻就組好 URL
90.346s  S-->C 0x00420113   Ready_Host_SQ
90.697s  S-->C 0x00222111   Game_Info_SN ← 晚了 350ms，地圖 ID 這時才寫入 0xfc8
```

`Game_Info_SN` 由 `scheduleGameInfoSnExperiment()` 在收到開始請求**之後**才排程送出，而客戶端按下開始的當下就已經用 `[0xfc8]`（此時為 0）組完 URL。

**已修**：`Game_Info_SN` 改為**隨房間狀態區塊送出**（建房後 350ms／1200ms），遠早於玩家按下開始。戰役房未指定地圖時預設 `MAP_ID_DEFAULT_CAMPAIGN = 9001`。

### 先前修正的定位

昨日至今的修正**都是真實的 bug**，但都不是這次崩潰的原因：

| 修正 | 是真 bug | 是本次崩潰主因 |
|---|---|---|
| 真實 Map ID（`9001` 取代自創索引） | ✅ | ❌ |
| `User_Default_SN` 欄位錯位 | ✅ | ❌ |
| `User_Master_SN` 需隨每個區塊重送 | ✅ | ❌ |
| `Map_Change_All_SN` header 4 bytes | ✅ | ❌ |
| `0x00420115` URL 截斷 | ✅ | ❌ |
| **`Game_Info_SN` 送出時機** | ✅ | ★ **是** |

> **方法上的教訓：** 「fallback」這個詞是我自己加上去的解讀，然後所有後續推論都建立在它上面。真正該問的是「為什麼 `Failed - MapIndex` 沒出現」——那行的**缺席**才是關鍵證據，而我盯著出現的東西看了太久。

---

