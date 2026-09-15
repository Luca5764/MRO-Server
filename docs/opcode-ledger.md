# Opcode 台帳

跨 session 的協定知識累積處。**每一列都必須標明狀態與依據。**

## 狀態定義

| 狀態 | 意義 |
|---|---|
| ✅ 已確認 | 實際觀察到客戶端對此回應產生預期行為 |
| 🟡 假設 | 有依據（DLL 字串／位置推論）但未經行為驗證 |
| ⬜ 未知 | 只觀察到封包存在，用途不明 |
| ❌ 已排除 | 曾假設但經驗證錯誤（保留以避免重複嘗試） |

## 依據來源標記

- `[DLL]` 來自客戶端 `ZNetwork.dll` 字串
- `[OBS]` 實際封包觀察
- `[TEST]` 主動試打並驗證客戶端反應
- `[GUESS]` 純推測，尚無任何佐證

---

## 系統層（client.js 直接處理）

| Opcode | 名稱 | 狀態 | 依據 | 備註 |
|---|---|---|---|---|
| `0x00020080` | Handshake | ✅ | `[TEST]` | 客戶端發起 |
| `0x00020081` | Handshake Response | ✅ | `[TEST]` | body: secret(4) + elapsed(4) + saltBE(4) + saltLE(4) |
| `0x00020082` | Time Sync | ✅ | `[TEST]` | body 8 bytes，需驗證 secret 相符 |
| `0x00020083` | Keep Alive | ✅ | `[TEST]` | 約每 30 秒，body 4 bytes |
| `0x00020084` | Acknowledge | ✅ | `[TEST]` | 回 elapsed time |

---

## 0x11xxxx — Login

| Opcode | 名稱 | 狀態 | 依據 | 備註 |
|---|---|---|---|---|
| `0x00110151` | CQ_LOGIN_WASABII | ✅ | `[TEST]` | |
| `0x00110152` | SA_LOGIN_WASABII | ✅ | `[TEST]` | |
| `0x00110124` | CQ_LOGIN_AGAIN | ✅ | `[TEST]` | 遊戲伺服器重新驗證 |
| `0x00110125` | SA_LOGIN_AGAIN | ✅ | `[TEST]` | |
| `0x00110131` | SN_WAIT | 🟡 | `[OBS]` | |

---

## 0x21xxxx — Account

| Opcode | 名稱 | 狀態 | 依據 | 備註 |
|---|---|---|---|---|
| `0x00210101` | SN_DEFAULT_INFO | ✅ | `[TEST]` | |
| `0x00210102` | SN_PLAY_INFO | ✅ | `[TEST]` | |
| `0x00210103` | SN_RECORD_INFO | ✅ | `[TEST]` | |
| `0x00210104` | SN_MECH_LEVEL | ✅ | `[TEST]` | |
| `0x00210105` | SN_RANK | 🟡 | `[DLL]` | 舊 prototype 有，現版本未使用 |
| `0x00210111` | SN_ITEM_INFO | ✅ | `[TEST]` | |
| `0x00210112` | SN_EXPIRATION_ITEM | ✅ | `[DLL]` | |
| `0x00210113` | SN_WEAR_INFO | ✅ | `[DLL]` | |
| `0x00210115` | SN_MAP_INFO | ✅ | `[TEST]` | |
| `0x00210121` | SN_COMPLETE | ✅ | `[TEST]` | |
| `0x00210122` | CQ_COMPLETE（候選 A） | ⬜ | `[GUESS]` | 教學完成，四個候選待釐清 |
| `0x00210131` | CQ_COMPLETE（候選 B） | ⬜ | `[GUESS]` | 同上 |
| `0x00210132` | CQ_COMPLETE（候選 C） | ⬜ | `[GUESS]` | 同上 |
| `0x00210141` | CQ_COMPLETE（候選 D） | ⬜ | `[GUESS]` | 同上 |
| `0x00210201` | CQ_CREATE | ✅ | `[TEST]` | |
| `0x00210202` | SA_CREATE | ✅ | `[TEST]` | |

> **待辦：** `CQ_COMPLETE` 目前四個 opcode 全部接上同一個 handler，實際只會有一個會觸發。下次進教學時看 log 確認是哪一個，其餘移除。

---

## 0x22xxxx — Gate / Room SN

| Opcode | 名稱 | 狀態 | 依據 | 備註 |
|---|---|---|---|---|
| `0x00220101` | SN_SERVER_ADD | ✅ | `[TEST]` | |
| `0x00220102` | SN_CHANNEL_ADD | ✅ | `[TEST]` | |
| `0x00220111` | 頻道進入 | ✅ | `[TEST]` | 由 ZGameLoginDispatch 攔截 |
| `0x00220131` | CQ_LEAVE | ✅ | `[TEST]` | |
| `0x00220132` | SA_LEAVE | ✅ | `[TEST]` | |
| `0x00220203` | Room_Default_SN | ✅ | `[TEST]` | body 0x021A bytes，結構見 room-state.sender.js |
| `0x00220213` | Room_Boundary_SN | ✅ | `[TEST]` | max(1) + current(1) |
| `0x00220214` | Room_State_SN | ✅ | `[TEST]` | 2 bytes |
| `0x00220217` | Room_Option_SN | 🟡 | `[DLL]` | 4 個 flag，bit 對應為靜態分析推得 |
| `0x0022021A` | Room_Name_SN | ✅ | `[TEST]` | UTF-16LE 字串，0x32 bytes |
| `0x00220233` | User_Default_SN | 🟡 | `[DLL]` | |
| `0x00220319` | User_Master_SN | 🟡 | `[DLL]` | |
| `0x00220401` | User_State_SN | 🟡 | `[DLL]` | |
| `0x00220402` | User_Pilot_SN | 🟡 | `[DLL]` | |
| `0x00220421` | User_Name_SN | 🟡 | `[DLL]` | |

---

## 0x23xxxx — Lobby

見 `lobby.dispatch.js`。已確認範圍待補。

---

## 0x24xxxx — Room / Hangar

確認 ID 範圍：`0x00240101` ~ `0x00240711`（約 70 個）。

| Opcode | 名稱 | 狀態 | 依據 | 備註 |
|---|---|---|---|---|
| `0x00240131` | Packege_Item_SN | 🟡 | `[DLL]` | 原文拼字即為 Packege |
| `0x00240132` | Packege_Point_SN | 🟡 | `[DLL]` | |
| `0x00240133` | Packege_Coupon_SN | 🟡 | `[DLL]` | |

> `0x2405xx` 系列的 descriptor 存在，但客戶端的 SN dispatcher 不會把 `0x240521` 導向 `Packege_Item_SN`。已排除該路徑。

---

## 0x25xxxx — Game（對戰中）⚠️ 主要缺口

確認 ID 範圍：`0x00250101` ~ `0x00250512`（約 28 個）。

| Opcode | 名稱 | 狀態 | 依據 | 備註 |
|---|---|---|---|---|
| `0x00250102` | 遊戲場景進入通知 | ✅ | `[TEST]` | 未開打時回 `0x250103`，開打後送 Ready_Host_SQ |
| `0x00250103` | 場景進入 ACK | ✅ | `[TEST]` | |
| `0x00250201` | Ready_Success_SN | ✅ | `[TEST]` | |
| `0x00250202` | Ready_Host_SN | 🟡 | `[OBS]` | 多人用，目前忽略 |
| `0x00250203` | Ready_Host_SQ | ✅ | `[TEST]` | |
| `0x00250204` | Ready_Host_CA | ✅ | `[TEST]` | |
| `0x00250301` | BeginRound_SN | ✅ | `[TEST]` | 延遲 500ms 送出 |

**以下皆為 `[DLL]` 已知名稱但 opcode 未定位、body 結構完全未知：**

`Ready_Failed_SN`、`Leave_CQ/SA/SN`、`BeginRound_CN`、`EndRound_SN`、`EndQuater_SN`、`EndGame_SN`、`Death_CN/SN`、`Respawn_CN/SN`、`Assist_CN/SN`、`Bomb_CN/SN`、`Capture_CN/SN`、`Conquest_CN/SN`、`Boss_CN/SN`、`TwoBoss_CN/SN`、`Campaign_CN/SN`、`Special_CN/SN`、`ChangeSlot_CN/SN`、`InstantRespawn_CN/SN`、`TriggerTouch_CN/SN`、`Timeout_CN/SN`、`HostChange_SN`、`Game_Info_SN`、`Game_Score_SN`、`Game_User_SN`

---

## 已排除的假設

| 內容 | 排除原因 | 日期 |
|---|---|---|
| `0x31xxxx` 為 Hangar | 實際為 Postbox，Hangar 在 `0x24xxxx` | — |
| `0x240521` → Packege_Item_SN | 客戶端 SN dispatcher 不走這條路徑 | — |

---

## 登入 bootstrap 序列

`[TEST]` 2026-09-15，真伺服器 + MySQL，合成客戶端以 `CQ_LOGIN_WASABII` 登入既有帳號，完整觀察到伺服器的回應順序（body 長度為上線位元組，含對齊填充）：

| # | Opcode | 長度 | 備註 |
|---|---|---|---|
| 1 | `0x00110152` | 16 | SA_LOGIN_WASABII，無驗證一律成功 |
| 2 | `0x00210101` | 32 | SN_DEFAULT_INFO |
| 3 | `0x00210102` | 32 | SN_PLAY_INFO |
| 4 | `0x00210103` | 96 | SN_RECORD_INFO |
| 5 | `0x00510101` | 16 | Community 命名空間，用途未確認 |
| 6 | `0x00210104` | 240 | SN_MECH_LEVEL（8 個機體） |
| 7 | `0x00210115` | 32 | SN_MAP_INFO |
| 8 | `0x00260101` | 80 | Quest/License 命名空間，用途未確認 |
| 9 | `0x00210111` | 848 | SN_ITEM_INFO |
| 10 | `0x00210113` | 432 | SN_WEAR_INFO |
| 11 | `0x00210121` | 256 | SN_COMPLETE |
| 12 | `0x00220101` | 224 | SN_SERVER_ADD |
| 13 | `0x00220102` | 64 | SN_CHANNEL_ADD |

登入請求本身：body 必須**剛好** `0x381` bytes，否則 `handleLogin()` 直接斷線；username 是前 `0x19` bytes 的 ASCII，以 `\0` 截斷。

⬜ `0x00510101` 與 `0x00260101` 在這條路徑上確定會送，但 body 結構與用途都還沒查。

> **注意：查不到的 username 會被自動建帳號**（`account.dispatch.js` `handleLogin()`，nickname = username、pilot 101）。做登入相關實驗時，打錯字不會得到「登入失敗」，而是安靜地多一個帳號。

---

## 2026-09-15 真實客戶端 session 的新觀察

第一次用真正的台版客戶端跑完登入→機庫→商店→建房，共 406 個封包。以下 opcode 台帳先前沒有記載。**全部標 `[OBS]`：只知道它在什麼情境下出現，不知道 body 結構。**

### ✅ 聊天：每個頻道有自己的 opcode

| Opcode | 頻道 | 方向 | 長度 | 狀態 | 依據 |
|---|---|---|---|---|---|
| `0x00220501` → `0x00220502` | 大廳 | C→S 258 (`0x102`) / S→C 16 | | ✅ | `[TEST]` |
| `0x00220505` → `0x00220506` | 房間內 | C→S 258 (`0x102`) / S→C 16 | | ✅ | `[TEST]` |

兩者 body 結構完全相同，只有 opcode 不同。⬜ 其他頻道（密語、戰隊、隊伍）推測在同一個 `0x002205xx` 家族裡，但**尚未觀察到，不要先寫進程式**——`0x00220505` 就是因為操作者在房間內打字卻沒產生 marker 才被發現的，這個「沒反應」本身是有效的偵測手段。

body 前 2 bytes 用途未明，偏移 `0x2` 起是 **Big5／cp950** 字串，以 `\0` 填充補滿。解出來的內容與操作者當下在遊戲聊天框輸入的文字完全一致，因此判定為已確認。

> **⚠️ 編碼不一致：房間名稱是 UTF-16LE，聊天是 Big5。** 不要假設全專案統一。

觀察到的格式是 `Lucas  準備進訓練場`——暱稱與訊息之間夾兩個空白。暱稱是否為固定寬度欄位、還是就是同一個字串，**尚未確認**（只有一個樣本，且暱稱剛好 5 字元）。

### ⬜ 其他新觀察到的 opcode

| Opcode | 方向 | 長度 | 出現情境 |
|---|---|---|---|
| `0x00220201` → `0x00220202` | C→S 51 / S→C 40 | | 之後緊接 `Room_Default_SN` 等整組房間 SN，推測為建房或進房請求 |
| `0x00220234` | C→S | 0 | 離開房間後、連線關閉前 30 秒 |
| `0x00222103` → `0x00222102` + `0x00222104` | C→S 5 / S→C 6 + 6 | | 房間內開始遊戲請求；body `270a000000` |
| `0x00240101` → `0x00240102` | C→S / S→C 14 | | 房間 |
| `0x00240107` | C→S | 28 | **商店**。每次出現後伺服器立刻回一整批 `0x00240241`/`0x00240242`。body 前 8 bytes 為兩個 uint32 LE（觀察值皆為 `1, 1`），推測是分類／分頁請求 |
| `0x00240108` | S→C | 34 | 商店清單送完後 |
| `0x00240113` | S→C | 10 | 房間 |
| `0x00240241` / `0x00240242` | S→C | 43/143/203/263/503 | 商店清單，成對出現，一次 session 送了 85 對 |
| `0x00230111` | S→C | 487 | 大廳 |
| `0x0023013A` | S→C | 41 | 進房後 |
| `0x00320104` → `0x00320105` | C→S 0 / S→C 16 | | Card，頻道進入後立刻送 |
| `0x00220112` / `0x00230112` / `0x00220502` | S→C | 16 | 各自的 SA |

---

## ⚠️ 阻塞 `0x25xxxx` 的真正原因：狀態活不過重連

`[TEST]` 2026-09-15。這是為什麼對戰封包一直挖不出來——**對戰從來沒有被觸發過**，不是封包難解。

`gameStarted_` 由 `0x00240301`（`room.dispatch.js`）或 `0x00222103`（`gate.game.dispatch.js`）設定，而它掛在 `NetworkClient` 實例上，也就是綁在單一 TCP 連線上。但客戶端切換到遊戲地圖時會**整個斷線重連**（原廠是 `ClientTravel` 到 `IP:Port/MapName`）。

實際觀察到的序列：

```
166.742s  conn 2  CONNECT 30907
276.703s  conn 2  C-->S 0x00222103   gameStarted_ = true（在 conn 2 上）
330.084s  conn 2  CLOSE              狀態隨連線消滅
386.842s  conn 3  CONNECT 9211       客戶端重新登入
386.941s  conn 4  CONNECT 30907
387.585s  conn 4  C-->S 0x00250102   新物件，gameStarted_ === undefined
387.585s  conn 4  S-->C 0x00250103   → 回大廳 ACK，而非 Ready_Host_SQ
```

`game.dispatch.js` 的 `0x00250102` 分支只在 `client.gameStarted_` 為真時送 `Ready_Host_SQ` 開始對戰流程。重連後該旗標必為 falsy，所以永遠走大廳分支。

操作者在此期間於遊戲內死亡，**伺服器收到 0 個封包**——客戶端不認為自己在一場伺服器管理的對戰裡。

**待決定：** 要讓對戰能開始，per-connection 狀態必須改為以帳號為鍵、能跨重連存活。這是架構性改動，依 CLAUDE.md 原則 #4 需先討論。

---

## 開戰流程目前只支援戰役房（PVP 走不通）

`[TEST]` 2026-09-15。session 狀態修好之後的第一次實測。

操作：建立 **PVP 房** → 按開始。觀察到：

```
122.992s  C-->S 0x00222103 (5b)  270a000000     按下開始
122.993s  [auto] gameStarted_ false -> true     狀態正確設定
123.393s  S-->C 0x00222102 (6b)                 Game_Ready_SN
123.495s  S-->C 0x00222104 (6b)                 Game_Start_SN
          （之後伺服器與客戶端皆無任何動作）
```

當下的 client 狀態：`gameMode=0`、`roomType=2`、`isTrueCampaign=False`、**`campaignStarted=False`**。

`campaignStarted_` 的判定是 `rawRoomType_ === 1 || gameMode_ === 4 || gameMode_ === 5`，PVP 房三個條件都不成立。而 `gate.game.dispatch.js` 裡開戰後的**每一個**步驟都以它為前提：

| 函式 | `campaignStarted_ === false` 時 |
|---|---|
| `scheduleGameInfoSnExperiment` | 直接 return |
| `primeReadyHostHandshake` | 直接 return |
| `scheduleGameWaitSnExperiment` | 直接 return |
| `schedulePostGameWaitReadyHost` | 直接 return |

其中 `Game_Info_SN` 最關鍵——程式碼註解明載客戶端要從它讀 mapId 才能決定 `ClientTravel` 的目標地圖。沒有它，客戶端收到 `Game_Start_SN` 也不知道要去哪裡，所以停在原地。

**結論：要取得戰鬥封包，必須開戰役房，不是 PVP。** PVP 的開戰路徑尚未實作，不是壞掉。

⬜ 另外觀察到：PVP 房內按「選擇地圖」**不產生任何封包**，地圖清單是空的。地圖清單從何而來、是否與房型有關，未查。

⬜ 建房請求 `0x00220201` body 開頭：`02 10 63 1b 03 00 02 00 00 00 00 01 05 00 00 00`（PVP、roomType=2）。與戰役房的對應 body 比對後應可定出房型欄位的位置。

---

## ⬜ `0x00220234` — 客戶端卡死在 Loading（實驗進行中）

`[OBS]` 2026-09-15。房間內按「上一頁」送出，body 長度 0。

```
215.787s  C-->S 0x00220234 (0b)   按下上一頁
294.380s  C-->S 0x00220234 (0b)   79 秒後又送一次
          （伺服器兩次都沒有回應，客戶端卡在 Loading 畫面）
```

沒有任何 case 處理它。它是**偶數**，所以連 default 分支的「奇數就回 type+1」都不觸發——`ZGateGameDispatch` 宣告處理了，然後什麼都沒送。

**假設：** 它是需要回應的請求，卡死就是客戶端在等那個回應。
**未排除的替代解釋：** 它是不需回應的通知，卡死另有原因。

**實驗（已上線）：** 回一個標準的空 `EVENT_INFO`、opcode 用 `0x00220235`。這**不是知識，是試打**。開關在 `gate.game.dispatch.js` 的 `BACK_FROM_ROOM_SA_EXPERIMENT_MODE`，設成 `'disabled'` 即可撤回。

- 若客戶端恢復 → 假設成立，可升級為 🟡
- 若仍卡死 → 假設錯誤，**立刻關掉**並在此記錄，避免下次再試同一條死路

> 注意：`0x00220233` 是 `User_Default_SN`，`0x00220234` 與它相鄰。也有可能屬於 `User_*` 家族而非離開房間。目前的命名純屬情境推測。

---

## ⚠️ 六個 dispatch 都會靜默吞掉偶數 opcode

每個 dispatch 都宣告整個命名空間並以 default 收尾，只對**奇數** opcode 回 `type+1` + 空 `EVENT_INFO`，偶數則什麼都不回。兩種情況都 `return true`，所以 `server.js` 永遠不會記為 unhandled。

奇數那種只是「回了一個沒有意義的答案」，偶數那種**會讓客戶端無限等待**——`0x00220234` 的卡死就是這樣來的，而當時 log 看起來完全正常。

**已修**：六個 dispatch（`ZGateGameDispatch`、`ZRoomDispatch`、`ZLobbyDispatch`、`ZGameDispatch`、`ZDispatch*` community、`ZGate*` social）的 default 都會寫 `fallback` 記錄，標明 opcode、body、以及回了什麼或沒回。沒回應的情況會在 console 直接警告。

`[TEST]` 5 項驗證通過，涵蓋奇數會回應、偶數不回應且觸發警告。

用 `node tools/slice.js <檔名> --unhandled` 一次列出所有「沒人真正理解」的封包。

---

## ✅ `0x00420115` Ready_Host_SN — ClientTravel URL 被截斷導致客戶端崩潰

`[TEST]` 2026-09-15。**第一次讓客戶端真正執行 `ClientTravel`。**

戰役房按下「遊戲開始」後的完整序列：

```
371.557s  C-->S 0x00222103 (5b)   270a000000
371.558s  S-->C 0x00420113 (6b)   Ready_Host_SQ
371.909s  S-->C 0x00222111 (26b)
371.959s  S-->C 0x00222102 (6b)   Game_Ready_SN
372.060s  S-->C 0x00222104 (6b)   Game_Start_SN
372.060s  S-->C 0x00420111 (0b)   Game_Wait_SN
372.160s  S-->C 0x00420115 (19b)  ← ClientTravel 目標
372.222s  C-->S 0x00420114 (8b)   000000000000bb78
372.222s  S-->C 0x00420116 (16b)
378.225s  S-->C 0x00230152 (16b)  00000000 + "Map_PC01"
```

### body 結構

| Offset | 型別 | 內容 |
|---|---|---|
| 0x00 | uint16 **LE** | port（觀察值 `bb78` = 30907） |
| 0x02 | uint8 | 0 |
| 0x03 | ASCII | `IP/MapName`，以 `\0` 結尾 |

### 崩潰原因

body 寫死 `0x13`（19 bytes），扣掉前 3 bytes 只剩 16 給字串，而寫入又被 `Math.min(..., 0x10)` 再壓一次。`127.0.0.1/Map_PC01` 需要 19 bytes（含結尾），實際送出的是：

```
bb78003132372e302e302e312f4d61705f5043
          1 2 7 . 0 . 0 . 1 / M a p _ P C     ← 少了 "01"，且無結尾
```

客戶端拿著不存在的地圖名 `Map_PC` 執行 `ClientTravel`，`LoadMap` 失敗，崩在拆除機庫關卡時：

```
Actor not found: HangarPlayerController Store_01.HangarPlayerController
ULevel::DestroyActor <- DissociateViewports_BD <- UGameEngine::LoadMap
  <- LocalMapURL <- UGameEngine::Browse <- ClientTravel
```

**已修**：`READY_HOST_SN_URL_MODE = 'fit'` 依字串長度決定 body 大小（此例為 `0x16`）。`'fixed_0x13'` 可回退。

`[TEST]` 以 `fixed_0x13` 重建出的 hex 與上線觀察到的完全一致，確認重建忠實；`fit` 產生 `bb78003132372e302e302e312f4d61705f5043303100`，字串完整且有結尾。

⬜ **真實封包是否為變動長度仍屬未知。** 也可能原廠的字串欄位更大且固定，或 IP 與地圖名分屬不同封包——`0x00230152` 在 6 秒後才送出完整的 `Map_PC01`，順序上很可疑。若客戶端拒收變動長度，改回 `'fixed_0x13'` 並改試放大固定值。

---

## 🟡 `0x00220234` — 試打成功，客戶端不再卡死

`[TEST]` 2026-09-15。前一趟伺服器不回應此封包時，客戶端卡死在 Loading 且 79 秒後重送。加上「回一個空 `EVENT_INFO` 於 `0x00220235`」之後，同一操作連續兩次都正常返回，並可繼續建立新房間。

狀態升為 🟡：**已知回應能讓客戶端前進，但語意仍未確認**。它是不是「離開房間」、body 該帶什麼、`0x00220235` 是不是正確的回應 opcode，都還沒驗證。`BACK_FROM_ROOM_SA_EXPERIMENT_MODE` 可關閉。

---

## ⬜ `0x0042xxxx` / `0x0022211x` / `0x00230152` — 開戰路徑上的新 opcode

`[OBS]` 2026-09-15，戰役房開戰時觀察到：

| Opcode | 方向 | 長度 | 備註 |
|---|---|---|---|
| `0x00420111` | S→C | 0 | Game_Wait_SN（程式碼命名），送兩次 |
| `0x00420113` | S→C | 6 | Ready_Host_SQ（程式碼命名） |
| `0x00420114` | C→S | 8 | `000000000000bb78`，尾端是 port 30907，疑似對 `0x00420115` 的回應 |
| `0x00420115` | S→C | 19 | 見上 |
| `0x00420116` | S→C | 16 | 全 0 |
| `0x00222111` | S→C | 26 | 送三次，body 固定 `010000000100000000003a00000000020001000100000000 0000` |
| `0x00230152` | S→C | 16 | `00000000` + ASCII `Map_PC01` |

---

## ★ 客戶端如何開始一場遊戲（從客戶端 log 直接讀到）

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

## ★★ 地圖識別碼一直是錯的 —— `0x25xxxx` 挖不動的根本原因

`[TEST]` 2026-09-15。來源：Gemini 對 `ZNetwork.dll` 的反組譯（見 `docs/gemini-gameinfo-findings.md`），**以下每一項都經我方獨立驗證**。

### 已驗證的事實

**1. travel URL 的格式字串就寫在 `ZNetwork.dll` 裡**（UTF-16LE，逐字核對）：

| 檔案偏移 | 用途 | 內容 |
|---|---|---|
| `0x114a50` | 主機 | `start %s?Listen?LPort=%d?Name=%d?Game=%s?MaxPlayers=%d?GoalScore=%d?TimeLimit=%d?BalanceTeams=0?numbots=0?team=%d` |
| `0x114b34` | 訪客 | `start %s:%d/%s?team=%d` |
| `0x11497c` | 查表失敗 | `Failed - MapIndex : %d` |

> `BalanceTeams=0` 與 `numbots=0` 是**字串常數的一部分**，不是格式參數。
>
> 訪客那條 `%s:%d/%s` 證實 `0x00420115` 帶的 IP:port 是**給其他玩家連上主機用的**，不是給主機自己 travel。

**2. 客戶端是拿 Map ID 查 Cache.Bin，不是任何我們自訂的索引。** `Game_Info_URL_Get` 走訪 table 1（42 筆），以 `cmp [eax], edx` 比對 `entry[0]`。查不到就記錄 `Failed - MapIndex` 並留下空 URL，`ZPage_Room` 隨即退回「目前關卡 + HangarGameInfo + team 255」——也就是我們觀察到的崩潰。

**3. Map ID 表為真。** 14/14 抽驗通過：每個 Map ID 的位元組附近 220 bytes 內都能找到對應地圖名。

| Map ID | 地圖 | GameInfo 類別 | Goal | Time |
|---|---|---|---|---|
| 0 | `Store_01` 訓練基地 | `ZModeHangar.HangarGameInfo` | 0 | 0 |
| 1011 | `Map_C08` 十字路口 | `Zgame.ZTeamDM` | 150 | 20 |
| 2001 | `Map_N03` 月六區 | `ZmodeOccupation.OccupationMission` | 0 | 4 |
| 4011 | `Map_C09` D-Day | `ZmodeBot.BossMission` | 0 | 10 |
| 5011 | `Map_N05` 黃金艙門 | `ZmodeCapture.CaptureMission` | 10 | 15 |
| 6001 | `Map_N13` 北極地帶 | `ZmodeBlow.BlowMission` | 2 | 4 |
| 7011 | `Map_C05` 衛星基地 | `ZmodeSuddenDeath.SuddenDeathMission` | 2 | 3 |
| 8001 | `Map_N11` 沙坑碉堡 | `ZModeRage.RageMission` | 0 | 30 |
| **9001/9002/9003** | `Map_PC01` 動力奪取戰 易/中/難 | `ZModePve.ZModePve` | 5/8/10 | 60 |
| 9007–9009 | `Map_PC02` 防衛作戰 | `ZModeEscortPve.ZModeEscortPve` | 5/8/10 | 60 |
| 9010–9012 | `Map_PC04` 潛入作戰 | `ZModePve.ZSetCoreModePve` | 5/8/10 | 60 |

完整 42 筆見 `docs/gemini-gameinfo-findings.md`。13 個 GameInfo 類別字串也已確認存在於 Cache.Bin。

### 我們送錯了什麼

| 位置 | 原本 | 問題 |
|---|---|---|
| `room.dispatch.js` `mapIndex` | 戰役房固定 `1`，其餘 clamp 在 `1..6` | **沒有一個是合法 Map ID** |
| `CAMPAIGN_MAP_ALL_HINTS` | `[8, 37, 30, 34, ...]` | 自創的 cache 索引，全部查無此表 |
| `campaignMapCacheKey_` | `CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID[mapId] \|\| 8` | 同上 |

**已改**：以上三處改送真實 Map ID（戰役 `9001`、PVP `1011`，清單為 `9001..9012`）。`MAP_ID_MODE = 'legacy'` 可整組回退。

這同時解釋了**地圖下拉選單空白**——送過去的 id 全部查無對應，客戶端當然列不出東西。

### ⬜ 仍待處理：`team=255`

`Game_User_Team_Get`（`ZNetwork.dll` 匯出符號已確認存在）在房間使用者陣列裡找不到本地玩家、或其隊伍未指派時回傳 `255`。Gemini 指出應由 `User_Default_SN`（`0x00220233`）建立關聯。**此項尚未驗證，也尚未修改。**

> 反組譯中引用的其他偏移（`SN_ROOM_DEFAULT` 的 `0x07` MaxPlayers、`0x1C` GoalScore、`0x1D` TimeLimit、結構體 `[esi+0xfc8]` 等）**我方未逐一驗證**，僅格式字串、Map ID 表與 `Game_User_Team_Get` 符號存在性經過確認。

---

## ✅ Map ID 修正確認有效 — 房間面板整個活過來了

`[TEST]` 2026-09-15，改送真實 Map ID 後的第一次實測。客戶端畫面對照：

| 欄位 | 修正前 | 修正後 |
|---|---|---|
| 地圖 | 空白 | **動力奪取戰** + 縮圖 |
| 遊戲類型 | 空白 | **Cooperation** |
| 人數 | 空白 | **Up to 8** |
| 目標分數 | 空白 | Do not use |
| 目標回合 | 空白 | **5 Rounds** |

全部由客戶端以 Map ID `9001` 查 Cache.Bin 自行填入。「5 Rounds」對應表中 Map_PC01(易) 的 Goal=5。**不再崩潰。**

線上封包：`0x00220203` mapIndex=`9001`、`0x00220226` count=12 內容 `9001..9012`、`0x00220223` 選中 `9001`。

---

## ⬜ 目前阻塞點：玩家沒有被放進房間格子

`[OBS]` 2026-09-15。三個症狀經判定為**同一個根因**：

1. 房間畫面 RED TEAM 的格子**全部是空的**，玩家只出現在左下角個人資訊欄
2. 按鈕是「準備」而非「遊戲開始」——客戶端不認為本地玩家是房主
3. travel URL 的 `team=255`——`Game_User_Team_Get` 在房間使用者陣列裡找不到本地玩家就回傳 255

按「準備」送出 `0x00222101`（body `270a000001`，與按開始的 `0x00222103` body `270a000000` 僅末位元組不同），伺服器回 `0x00222102` 後無下文。按 F5 送出的也是 `0x00222101`，客戶端**完全沒有提供「開始」這個動作**。

> 已排除：與我方封包變更無關。有「遊戲開始」與只有「準備」的兩個 session，房間封包 diff 後**只有 `0x00220203` 的 mapIndex 不同**，`User_Master_SN`、`User_Default_SN`、`Room_State_SN` 全部 byte 相同。行為改變是客戶端對「合法地圖」的反應。

### 線索：`Room_User_Add` 的函式簽名

`ZNetwork.dll` 匯出符號（已確認存在）：

```
?Room_User_Add@UZNetwork_DJ@@QAEXHHHHHPBGHHH
```

解讀為 `void Room_User_Add(int,int,int,int,int, const wchar_t*, int,int,int)`——5 個 int、**一個寬字串**、再 3 個 int。

我方 `User_Default_SN`（`room-user.sender.js`）目前把暱稱寫成 **ASCII** 且放在 body **最後**（offset `0x1D`）。若 body 欄位順序對應該呼叫順序，暱稱應在第 5 個整數之後、最後 3 個整數之前，且為 UTF-16。

⬜ **未驗證**，需反組譯 `ZDispatchRoom::User_Default_SN` 的欄位擷取才能確定。目前 `0x00220233` 的 body 結構在台帳中仍為 🟡 `[DLL]`。

其他相關符號（皆存在於 DLL）：`Room_Team_Set`、`Room_User_Delete`、`Room_User_State_Set`、`Room_User_Mech_Set`、`Room_User_Team_Change`、`Master_Change_CQ/SA@ZDispatchRoom`、`Game_Info_Team_Set`。

---

## 已知陷阱（程式碼層）

### `type & 0x80` 會誤攔 dispatch opcode

`client.js` 的 `onData()` 用 `if (type & 0x80)` 決定訊息走系統層還是 dispatch chain，測的是**完整 32-bit opcode 的低位元組**。真正的系統訊息是 `0x00020080`~`0x00020084`，但**任何低位元組 bit 7 有設的 opcode 都會被一起攔走**，直接送進 `onInternalMessage()`。

原本 `onInternalMessage()` 的 switch 沒有 default 分支，這種封包會靜默掉地上。log 裡只剩 `RECV:` 那一行（有 type 跟長度，沒有 hex dump、也沒有任何「它沒進 dispatch」的訊號），很容易被誤讀成客戶端根本沒送這個封包。

**已修**（`client.js`，加 default 分支）：現在會印出完整 hex dump，且若 opcode 不在 `0x000200XX` 範圍內會額外標示是被誤攔的。**誤攔行為本身沒有改**——只是不再無聲。

`[TEST]` 用合成封包驗證過三種情況：

| 餵入 opcode | 進 dispatch chain？ | 現在的 log |
|---|---|---|
| `0x00250181` | ❌ 否（被誤攔） | dump + 誤攔警告 |
| `0x00020099` | ❌ 否（系統層未知訊息） | dump |
| `0x00250102` | ✅ 是 | 正常 |

**對逆向工作的影響：** 目前台帳裡所有已確認 opcode 的低位元組都 < 0x80，所以還沒實際咬到。但 `0x25xxxx` 有 28 個 ID、大半未定位，若其中有落在此區間者，在修正前是查不到的。之後若在 log 看到誤攔警告，該 opcode 要當成**正常 dispatch 訊息**登錄，並考慮是否要改分流條件（改動前先確認不會影響握手）。


### Keep Alive 早於 Time Sync 會打死整個 process

`client.js` 的 `getLocalTime()` 回傳 `Date.now() - this.start_`，而 `start_` 只在收到 **Time Sync（`0x00020082`）** 時才被設定，初始值是 `0`。

若客戶端在 time sync 之前送 **Keep Alive（`0x00020083`）**，`getLocalTime()` 會回傳 `Date.now()` 本身（約 1.79e12），塞不進 Acknowledge body 的 uint32。`writeUint32BE` 是**拋例外**而不是截斷，而這個例外沒有任何地方捕捉——結果是整個 process 死亡：兩個 listener 一起沒、所有連線一起掉、當下的封包紀錄就此中斷。

`[TEST]` 實際觸發過：合成客戶端在 time sync 前送 keepalive，server 立刻 `ERR_OUT_OF_RANGE` 崩潰。

**已修**（`client.js` `getLocalTime()`）：`start_` 未設定時回 `0`，並把結果夾在 `0 ~ 0xFFFFFFFF`。

| 情境 | 修正後 |
|---|---|
| keepalive 先於 time sync | ACK 回 0，不崩潰 ✅ |
| 正常流程（time sync 在前） | ACK 回真實經過毫秒 ✅ |

**對逆向工作的影響：** 正常客戶端會先 time sync，所以平常不會踩到。但逆向過程中會刻意送順序異常或畸形的封包試探，那時整個 session 連同紀錄一起消失的代價很高。

> 同類問題可能還有：dispatch handler 裡任何未捕捉的例外都會打死整個 process。目前**沒有**全域 `uncaughtException` 防護網。要不要加是獨立的決定（加了會讓錯誤更難被注意到）。

---

## 待調查佇列

- [ ] 確認四個 `CQ_COMPLETE` 候選中實際觸發的是哪一個
- [ ] 定位 `Death_CN` 的 opcode：進訓練場後讓機體被擊毀，觀察未處理封包
- [ ] 定位 `Game_Score_SN` 需要的 body 結構
- [ ] 釐清 `0x23xxxx` Lobby 已確認範圍
