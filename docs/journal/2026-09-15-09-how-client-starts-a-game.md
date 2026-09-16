# ★ 客戶端如何開始一場遊戲（從客戶端 log 直接讀到）

> 從 docs/opcode-ledger.md 第 384–445 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-15。**這是目前對開戰流程最重要的一項認識，來自客戶端自己的 log**
（`C:\Games\MetalRage Online\data\Log\MetalRage.log`，客戶端會持續寫入，是被低估的資料來源）。

戰役房按下「遊戲開始」時，客戶端印出：

```
ScriptLog: [ ZPage_Room ][ GameStart ]  start Store_01?Listen?LPort=30907?Name=1
           ?Game=ZModeHangar.HangarGameInfo?MaxPlayers=1?GoalScore=0?TimeLimit=0
           ?BalanceTeams=0?numbots=0?team=255
Log: Browse: Store_01?Listen?...
Critical: Actor not found: HangarPlayerController Store_01.HangarPlayerController
```

### 由此確認的三件事

**1. 這是 listen server 架構。** `?Listen?LPort=30907` 表示按下開始的客戶端**自己成為主機**，其他玩家連過去。這解釋了 `Ready_Host_SQ`／`Ready_Host_CA` 裡的 "Host" 是什麼意思，也意味著 `0x00420115` 帶的 `IP/MapName` 與 port **很可能是給其他客戶端連線用的，不是給主機自己 travel 用的**。實際戰鬥的封包可能根本不經過我們的伺服器。

**2. travel 的 URL 由客戶端自行組成**，欄位為：

```
<MapName>?Listen?LPort=<port>?Name=<n>?Game=<GameInfo 類別>
  ?MaxPlayers=<n>?GoalScore=<n>?TimeLimit=<n>?BalanceTeams=<n>?numbots=<n>?team=<n>
```

觀察到的值**全部是預設或錯誤的**：地圖 = 當前關卡 `Store_01`、類別 = `ZModeHangar.HangarGameInfo`（機庫，非戰鬥）、`MaxPlayers=1`、`team=255`。

**3. 崩潰是這個 URL 造成的**，不是我們送的 `0x00420115` 造成的。客戶端在原地重載機庫關卡，於拆除自身 `HangarPlayerController` 時崩潰：

```
ULevel::GetActorIndex <- ULevel::DestroyActor
  <- (HangarPlayerController Store_01.HangarPlayerController)
  <- DissociateViewports_BD <- UGameEngine::LoadMap <- LocalMapURL
  <- UGameEngine::Browse <- ClientTravel
```

> 先前修正 `0x00420115` 的截斷是真實的 bug（`Map_PC` vs `Map_PC01`），但**不是這次崩潰的原因**——那個 URL 沒有被用在 travel 上。修正保留，因為送出截斷字串本身就是錯的。

### 真正的問題：房間狀態沒有被設定

地圖下拉選單空白與這次崩潰是**同一個問題**：房間沒有地圖，`GameStart` 只好用當前關卡。

我們確實有送 `0x00222111`（26 bytes），body offset `0x0A` 為 `3a` = 58 = `Map_PC01` 的 Cache 索引：

```
01 00 00 00 01 00 00 00 00 00 3a 00 00 00 00 02 00 01 00 01 00 00 00 00 00 00
                              ^^^^^ mapId (Cache 索引 58)
```

但客戶端沒有據此設定房間。⬜ 原因未知，可能是 opcode 不對、body 結構不對，或房間地圖來自其他封包。

### 下一步的目標明確了

要讓客戶端組出正確的 URL，必須讓它知道：**地圖名稱**、**戰鬥用的 GameInfo 類別**、`MaxPlayers`、`GoalScore`、`TimeLimit`、有效的 `team`。

⬜ 這些欄位分別由哪些封包提供，尚未確定。`MaxPlayers=1` 可能來自 `Room_Boundary_SN 0x00220213`（2 bytes：max + current）。`team=255` 表示玩家未被指派隊伍。

> **方法上的收穫：** 客戶端 log 會記錄它組出的 URL 與 ScriptLog，比封包更直接地說明「客戶端如何理解目前狀態」。往後每次卡關都應該同時看它。

---

