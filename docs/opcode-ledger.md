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

## 🟡 `0x00220233` User_Default_SN — body 結構（反組譯，欄位錯位已修）

來源：Gemini 對 `ZNetwork.dll` `0x107EE2D0` 的反組譯。**符號存在性已由我方確認**（7/7）：
`?User_Default_SN@ZDispatchRoom@@...`、`?Room_User_Add@UZNetwork_DJ@@QAEXHHHHHPBGHHH0@Z`（完整 10 參數修飾名逐字命中）、`Room_Master_Set`、`Room_Master_Check`、`Game_User_Team_Get`、`Game_Info_SN@ZDispatchWaiting`、`Core.dll!winToUNICODE`。

body = 2 bytes 標頭 + `count` 筆 **0x34（52 bytes）** 的使用者記錄，整筆 `memcpy` 後逐欄讀取。

| body | 記錄內 | 型別 | 欄位 | → `Room_User_Add` |
|---|---|---|---|---|
| `0x00` | — | uint8 | status，須為 0 | — |
| `0x01` | — | uint8 | 使用者筆數 | 迴圈上限 |
| `0x02` | `+0x00` | uint16 LE | UserIndex | Arg 1 |
| `0x04` | `+0x02` | uint32 LE | PilotID | Arg 8 |
| `0x08` | `+0x06` | ASCII | 等級文字，以 `atoi()` 解析 | Arg 2 |
| `0x0A` | `+0x08` | uint32 LE | Hidden / Score | Arg 3 |
| `0x0E` | `+0x0C` | uint8 | LevelType | Arg 4 |
| `0x0F` | `+0x0D` | uint32 LE | StateRaw | Arg 5 |
| `0x13` | `+0x11` | uint16 LE | **TeamIndex**（0=紅 1=藍） | Arg 7 → `[user+0x34]` |
| `0x15` | `+0x13` | uint32 LE | Rank / SubState | Arg 9 |
| `0x19` | `+0x17` | uint32 LE | ClanID / packed IP | 解析 Arg 10 |
| `0x1D` | `+0x1B` | ASCII，25 bytes | 暱稱 | Arg 6 |

> **暱稱是 ASCII，不是 UTF-16LE。** 客戶端在 `0x107EE48F` 呼叫 `Core.dll!winToUNICODE` 自行轉成寬字串再傳給 `Room_User_Add`。先前由 `PBG`（`const wchar_t*`）推測封包欄位為寬字串是**錯的**——寬字串是轉換後的結果，不是線上格式。

### 我方原本的錯誤

`userLevelText` 寫在 `0x08` 只佔 2 bytes，下一個欄位卻跳到 `0x0E`，**`0x0A`~`0x0D` 整片留白**（而 `0x0A` 正是 Hidden/Score 的位置），其後欄位全部錯位：`0x0E` 被當成 4-byte 寫入，但它其實是 1-byte 的 LevelType，且 StateRaw 應在 `0x0F`。客戶端組出來的記錄是垃圾。

**已修**（`room-user.sender.js`）。`[TEST]` 逐欄驗證輸出，12 個欄位全部落點正確，body 仍為 0x36。

### 連帶修正：`Game_Info_SN` 的紅藍隊索引

`Game_User_Team_Get` 拿使用者的 team 值去比對 `Game_Info_SN`（`0x00222111`）body `0x04`（紅）與 `0x06`（藍），都不中就回 `255`。我方原本送 紅=1 / 藍=0，使 `teamIndex=0` 的玩家被判為藍隊。已改為 紅=0 / 藍=1。

### 房主判定

`Room_Master_Check`（`0x10718D10`）比較本地使用者索引 `[ecx+0x44c]` 與房主索引 `[ecx+0xf74]`，相等即為房主。`[ecx+0xf74]` 全 DLL 僅由 `Room_Master_Set` 寫入，而後者只被 **`User_Master_SN`（`0x00220319`）** 呼叫，body 為 uint16 userIndex + uint32 state。**我方目前的送法與此一致，無須修改**——先前房主判定失敗是因為玩家根本沒被加進使用者陣列。

> 狀態維持 🟡：結構來自反組譯且符號已驗證，但**尚未經客戶端行為驗證**。下一次實測若玩家出現在房間格子、按鈕變回「遊戲開始」、URL 出現 `team=0`，即可升為 ✅。

---

## ✅ 房主狀態被自己的重送打掉 — `roomMasterSent_` 只送一次

`[TEST]` 2026-09-15。操作者在遊戲內聊天框留下的即時敘述直接指出成因：

> 「我進來的瞬間有看到開始遊戲，但馬上就變成準備了，我也有看到我是房主的提示」

也就是說 `User_Default_SN` 的欄位修正**確實生效**，玩家一度是房主——然後被覆蓋。

觀察到的送出順序（房間狀態由 `roomStateRetryTimers_` 重送 4 次）：

```
793.718s  ... 0x00220233 → 0x00220319   第 1 次，含房主
794.567s  ... 0x00220233                第 2 次，無房主
795.869s  ... 0x00220233                第 3 次
798.371s  ... 0x00220233                第 4 次
```

`room-user.sender.js` 原本以 `if (!client.roomMasterSent_)` 保護，房主封包**一個連線只送一次**。而每次 `User_Default_SN` 都會讓客戶端重建房間使用者陣列；`Room_Master_Set` 全 DLL 僅由 `User_Master_SN` 呼叫，因此不含房主封包的重送 = 重建後的陣列沒有房主。

**已修**：每次 `sendRoomUserPackets()` 都送 `0x00220319`。`[TEST]` 連續三次呼叫皆包含該封包。

> 這是「已送出」旗標的同一個坑——`session.js` 裡特別列為不可跨連線攜帶的那類，這次是在單一連線**內部**咬人。凡是「客戶端會重建狀態」的封包，其伴隨的設定封包都必須一起重送。

---

## ⬜ 機庫沒有任何機體與裝備可選

`[OBS]` 2026-09-15，同一次 session 的操作者敘述：「我發現這邊沒有任何機體還有裝備可以選擇」。

帳號 DB 內有 8 張機體授權、8 個機體等級、32 件初始裝備（`tools/create-account.js` 建立時已確認寫入），登入時也送出了 `SN_ITEM_INFO 0x00210111`（848 bytes）與 `SN_WEAR_INFO 0x00210113`（432 bytes）。客戶端卻顯示空的。

尚未調查。考量 `User_Default_SN` 的欄位錯位前例，**優先懷疑同類的 body 結構偏移錯誤**。

> 另記：按 Chat 按鈕跳出「不是公會成員」為正常行為，該按鈕是公會頻道。

---

## ⬜ `0x00220226` Map_Change_All_SN — 客戶端解析出 0 筆（實驗進行中）

`[TEST]` 2026-09-15。房主修正生效後首次成功按下「遊戲開始」，客戶端仍以預設值組 URL 並崩潰。客戶端 log 指出原因：

```
Error: ZPopup_MapSelect Package.ZPopup_MapSelect
  (Function ZGameMainMenu.ZPopup_MapSelect.OnDraw_Preview:07DD)
  Accessed array 'm_MapInfoList' out of bounds (0/0)     ← 出現 10 次
ScriptLog: MyRoomInfo.MapInfo[0].Round=1
ScriptLog: [ ZPage_Room ][ GameStart ]  start Store_01?...?team=255
```

`m_MapInfoList` **0 筆**：我方送出的 12 筆地圖清單被解析成空的。房間「目前地圖」有設定（畫面正確顯示動力奪取戰、`MyRoomInfo.MapInfo[0]` 存在），但「可選清單」是空的——兩者來源不同。

### 假設：header 多了 4 bytes

我方原本的 body 為 `flag(1) + count(1) + uint32(4)` 再接 9-byte 記錄（記錄起點 `0x06`）。兩個獨立證據指向記錄應從 `0x02` 開始：

1. **`User_Default_SN`（已由反組譯驗證）**：`flag(1) + count(1)` 之後記錄**緊接**在 `0x02`，無空隙。
2. **`Map_Change_One_SN`（`0x00220223`）**：body 恰為 10 bytes = `flag(1)` + 一筆 9-byte 記錄，同樣無空隙。

若慣例一致，多出的 4 bytes 會讓整批記錄偏移，客戶端解析出垃圾。

**實驗（已上線）**：`MAP_ALL_HEADER_MODE = 'compact'`，記錄改從 `0x02` 開始，body 由 `6+N*9` 變為 `2+N*9`（12 筆時 114 → 110）。`'padded'` 可回退。

> 原程式碼註解宣稱 `0x06` 是「客戶端解析器期待的格式」，但同一作者在 `User_Default_SN` 的欄位排列是錯的，該註解不足採信。

### ⬜ 仍未解決：`team=255`

`User_Default_SN` 欄位修正後玩家仍不在使用者陣列中（URL 仍為 `team=255`）。房主判定已通過（`Room_Master_Check` 只比對兩個整數，不需要陣列），但 `Game_User_Team_Get` 仍找不到本地玩家。原因未明。

---

## 客戶端 log 會直接指名出錯的 UnrealScript 函式與變數

`[TEST]` 2026-09-15。先前只知道客戶端 log 有 `ScriptLog` 與引擎的 `Browse`／`LoadMap`。這次發現它也會記錄 **UnrealScript 執行期錯誤**，且指名到函式與變數層級：

```
Error: ZPopup_MapSelect Package.ZPopup_MapSelect
  (Function ZGameMainMenu.ZPopup_MapSelect.OnDraw_Preview:07DD)
  Accessed array 'm_MapInfoList' out of bounds (0/0)
```

包含**套件名、類別名、函式名、bytecode 偏移、變數名、實際的索引/長度**。`ZGameMainMenu.tzp` 是 SEED 加密的、拿不到 bytecode，但客戶端執行時會自己把出錯位置講出來。

**每次卡關都應該 grep 這個檔案的 `Error:` 與 `ScriptLog:`**，它往往比封包更直接。

---

## ★★★ 對戰 opcode 全部定位完成 —— 而且不在 `0x25xxxx`

`[TEST]` 2026-09-15。**方法：直接反組譯客戶端的 dispatcher，不是試打。**

`ZNetwork.dll` 的每個 `ZDispatch*` 類別都有一個 `Dispatch` 方法，從 header offset `0xC` 取出 message type，然後用一連串 `cmp`/`sub`/`dec` + 條件跳躍（以及跳躍表）選出 handler。這條鏈只操作單一暫存器，**可以直接模擬**：把候選 opcode 餵進去，看它落到哪個 handler，映射就精確還原了。

工具：`tools/dispatch-map.py`（`--list` 列出 14 個 dispatcher）。

### ⚠️ 推翻先前的前提

**`ZDispatchGame` 處理的不是 `0x25xxxx`。** 全部 29 個 handler 落在 `0x2221xx`／`0x2222xx`／`0x2301xx`／`0x2302xx`／`0x0042xxxx`。

`game.dispatch.js` 以 `(type & 0x00FF0000) === 0x00250000` 攔截並宣稱處理整個 `0x25xxxx` 範圍，這個假設從一開始就是錯的。台帳先前記載的 `0x00250203 Ready_Host_SQ`、`0x00250301 BeginRound_SN` 等亦同——那些是實測「客戶端沒有斷線」而非「客戶端正確處理」。

### 完整映射（29/29）

| Opcode | Handler | 備註 |
|---|---|---|
| `0x00222111` | `Game_Info_SN` | **我方已送對** |
| `0x00222112` | `Game_User_SN` | ★ 我方誤送為 `0x00230111` |
| `0x00222114` | `Game_Score_SN` | |
| `0x00222121` | `Team_Change_All_SN` | |
| `0x00222132` | `Leave_SA` | |
| `0x00222211` | `EndRound_SN` | |
| `0x00222212` | `EndQuater_SN` | |
| `0x00222213` | `EndGame_SN` | |
| `0x00230102` | `ChangeSlot_SN` | |
| `0x00230103` | `Respawn_SN` | |
| `0x00230104` | `InstantRespawn_SN` | |
| `0x00230105` | `Timeout_SN` | |
| `0x00230106` | `Assist_SN` | |
| **`0x00230107`** | **`Death_SN`** | ★★ 專案主要目標 |
| `0x00230112` / `0x00230132` | `Capture_SN` | |
| `0x00230114` / `0x00230134` | `Conquest_SN` | |
| `0x00230116` / `0x00230136` | `Bomb_SN` | |
| `0x00230118` / `0x00230138` | `Boss_SN` | |
| `0x0023011A` / `0x0023013A` | `Campaign_SN` | **我方已送對**（`room-map.sender.js`） |
| `0x0023011C` / `0x0023013C` | `TwoBoss_SN` | |
| `0x0023011E` / `0x0023013E` | `TriggerTouch_SN` | |
| `0x0023011F` / `0x00420112` | `Ready_Failed_SN` | |
| `0x00230120` / `0x00420113` | `Ready_Host_SQ` | **我方已送對**（`0x00420113`） |
| `0x00230121` / `0x00420114` | `Ready_Host_SN` | 觀察到客戶端送出 `0x00420114` |
| `0x00230122` / `0x00420115` | `Ready_Success_SN` | ⚠️ 我方把 `0x00420115` 當成 Ready_Host_SN 在送 |
| `0x00230123` / `0x00420116` | `HostChange_SN` | ⚠️ 我方當成「Ready 成功」在送 |
| `0x00230124` / `0x00420117` | `Leave_SN` | |
| `0x00230126` | `Special_SN` | |
| **`0x00230152`** | **`BeginRound_SN`** | ★ 我方誤送為 `0x00250301`；`0x00230152` 我方確實有送但用途標錯 |

> 多個 handler 有**兩個** opcode（如 `0x0023011A` 與 `0x0023013A` 同為 `Campaign_SN`）。原因未明，可能對應不同情境或版本相容，**未驗證**。

### 這對專案的意義

`game.dispatch.js` 那個「奇數就回 `type+1`」的矇混分支，處理的是一個**客戶端根本不用的命名空間**。真正的對戰封包一直被 `ZGateGameDispatch`／`ZLobbyDispatch` 這些 `0x22`／`0x23` 的 dispatcher 接走，然後靜默落入它們各自的 default。

**`Death_SN` 不需要再「逼客戶端送出來」——它是伺服器要送給客戶端的。** 主機端的戰鬥由客戶端自己以 listen server 跑，伺服器的角色是廣播事件。

---

## ★★★ 完整的 server→client opcode 地圖：`docs/client-dispatch-map.md`

`[TEST]` 2026-09-15。14 個 dispatcher、**273 筆映射**，由 `tools/dispatch-map.py` 模擬客戶端自己的分派邏輯得出。

| Dispatcher | handler 數 | | Dispatcher | handler 數 |
|---|---|---|---|---|
| `ZDispatchRoom` | 50 | | `ZDispatchCard` | 15 |
| `ZDispatchClan` | 49 | | `ZDispatchFriend` | 13 |
| `ZDispatchHangar` | 40 | | `ZDispatchLobby` | 12 |
| `ZDispatchGame` | 29 | | `ZDispatchWaiting` | 3 |
| `ZDispatchCommunity` | 25 | | `ZDispatchGate` / `Quest` / `Base` | 0 ⬜ |
| `ZDispatchAccount` | 21 | | | |
| `ZDispatchPostbox` | 16 | | | |

⬜ `Gate`／`Quest`／`Base` 解出 0 筆，其分派形式與其他不同，模擬器尚未支援。**不代表它們沒有 handler。**

### 經此確認為正確的既有實作

我方送出的 opcode 中，以下**全部與客戶端一致**（先前多為 🟡 `[DLL]` 推測，現可升 ✅）：

- **Account**：`0x00110152` Login_Wasabii_SA、`0x00110125` Login_Again_SA、`0x00110131` Wait_SN、`0x00210101`~`0x00210105`、`0x00210111` ItemInfo_SN、`0x00210112` ExpirationItem_SN、`0x00210113` WearInfo_SN、`0x00210115` MapInfo_SN、`0x00210121` Complete_SN、`0x00210202` Create_SA、`0x00260101` LicenseInfo_SN
- **Room**：`0x00220203` Room_Default_SN、`0x00220213` Room_Boundary_SN、`0x00220214` Room_State_SN、`0x00220217` Room_Option_SN、`0x0022021A` Room_Name_SN、`0x00220223` Map_Change_One_SN、`0x00220226` Map_Change_All_SN、`0x00220233` User_Default_SN、`0x00220319` User_Master_SN、`0x00220401` User_State_SN、`0x00220402` User_Pilot_SN、`0x00220421` User_Name_SN、`0x00222102` Game_Ready_SN、`0x00222104` Game_Start_SN、`0x00420111` Game_Wait_SN
- **Hangar**：`0x00240131`~`0x00240133` Packege_*_SN、`0x00240241` ShopList_SN、`0x00240242` CashShopList_SN、`0x00240102` Open_SA、`0x00240108` Slot_Change_SA、`0x00240113` DefaultSlot_Change_SN
- **Lobby**：`0x00220101` Server_Add_SN、`0x00220102` Channel_Add_SN
- **Game**：`0x00222111` Game_Info_SN、`0x00420113` Ready_Host_SQ、`0x0023013A` Campaign_SN

> **意義：** 機庫顯示不出機體與裝備、地圖清單為空，**都不是 opcode 錯**——那些封包客戶端確實在聽。問題出在 body 結構，與 `User_Default_SN` 的欄位錯位同一類。

### 順帶澄清

- 台帳原記「`0x240521` → Packege_Item_SN 已排除」：正確。`0x00240522` 實為 `Send_UserItem_SA`。
- 台帳原記四個 `CQ_COMPLETE` 候選查不到：正常。dispatcher 只處理客戶端**收到**的封包。

---

## ✅ `0x00220226` Map_Change_All_SN — body 結構已由反組譯確認

`[TEST]` 2026-09-15。先前依「與 `User_Default_SN` 慣例一致」的推論把記錄起點從 `0x06` 改到 `0x02`，現已反組譯 `ZDispatchRoom::Map_Change_All_SN`（`0x107ebab0`）確認**推論正確**：

```x86
movzx ecx, byte ptr [eax + 0x10]   ; body+0x00  旗標 → [edi+0x24]
movzx edx, byte ptr [eax + 0x11]   ; body+0x01  筆數 → [edi+0x2c]
lea   esi, [eax + 0x16]            ; 記錄游標 = body+0x06
...
movzx ecx, word  ptr [esi - 4]     ; 記錄+0x00 (uint16) → mapId
movzx edx, word  ptr [esi - 2]     ; 記錄+0x02 (uint16)
movzx eax, byte  ptr [esi]         ; 記錄+0x04 (uint8)   ← 選中旗標
movzx ecx, word  ptr [esi + 1]     ; 記錄+0x05 (uint16)
movzx edx, word  ptr [esi + 3]     ; 記錄+0x07 (uint16)
```

`esi` 指向記錄的第 4 個 byte，故**第一筆記錄始於 `body+0x02`**，每筆 **9 bytes**。

| body | 型別 | 欄位 |
|---|---|---|
| `0x00` | uint8 | 旗標 |
| `0x01` | uint8 | 筆數 |
| `0x02 + i*9` | uint16 LE | **Map ID** |
| `+0x02` | uint16 LE | 未知 |
| `+0x04` | uint8 | 選中 |
| `+0x05` | uint16 LE | 未知 |
| `+0x07` | uint16 LE | 未知 |

緊接其後的 `cmp [ecx], ebx` / `add ecx, 0xbc` 是 Cache.Bin table 1 的查表（stride `0xBC`），比對記錄中的值與 `entry[0]`——**再次確認該欄位是 Map ID，不是任何自訂索引**。

---

## ✅ `0x00222112` Game_User_SN — 記錄大小確認為 `0x1E5`

`[TEST]` 2026-09-15。反組譯 `ZDispatchGame::Game_User_SN`（`0x107d8ae0`）可見 `push 0x1e5` 與 `add esi, 0x1e5`：記錄長度 **485 bytes**，與 `room-game-user.sender.js` 既有的 `GAME_USER_RECORD_SIZE = 0x01E5` 一致；body 起點同樣是 `lea eax, [edx + 0x10]`，標頭 2 bytes。

**原作者的結構猜對了，錯的只有 opcode**（`0x00230111` → `0x00222112`，已修）。欄位細節尚未逐一比對。

---

## ★★★ 崩潰的真正原因：`Game_Info_SN` 的地圖 ID 寫錯欄位

`[TEST]` 2026-09-16。**從頭到尾都是同一個欄位錯位。**

### 因果鏈（全部反組譯確認）

1. `Game_Info_URL_Get`（`0x10733cf0`）以 `[esi+0xfc8]` 的值走訪 Cache.Bin table 1（stride `0xBC`）比對 `entry[0]`。查不到就記錄 `Failed - MapIndex : %d` 並留下空 URL。
2. 全 DLL **只有一處**寫入 `[esi+0xfc8]`：`Game_Info_Set`（`?Game_Info_Set@UZNetwork_DJ@@QAEXH_N0HHHHHHH@Z`，`0x1072cca0`）的 **第 6 個參數**。
3. `Game_Info_Set` 只有兩個呼叫點，其一在 `ZDispatchWaiting::Game_Info_SN`（`0x107f0949`，opcode **`0x00222111`**）。
4. 該 handler 的第 6 個參數來自 `ebx`，而 `ebx` 來自 `movzx ebx, word ptr [eax + 0x21]` —— 即 **body+0x11**。

### `0x00222111` Game_Info_SN body 結構

| body | 型別 | 用途 |
|---|---|---|
| `0x00` | uint32 LE | → `[this+0xfc0]` |
| `0x04` | uint16 LE | 未知（推測紅隊索引） |
| `0x06` | uint16 LE | 未知（推測藍隊索引） |
| `0x0A` | uint16 LE | 未知 |
| `0x0C` | uint16 LE | 未知 |
| `0x0E` | uint8 | 未知（clan flag？） |
| `0x0F` | uint16 LE | **必須等於 2**（`cmp word ptr [eax+0x1f], 2` + `sete`） |
| **`0x11`** | **uint16 LE** | **地圖 ID** → `[this+0xfc8]` |
| `0x13` | uint16 LE | 未知 |
| `0x15` | uint8 | 未知 |
| `0x16` | uint16 LE | 未知 |
| `0x18` | uint16 LE | 未知 |

body 總長 `0x1A`，與我方既有實作一致。

### 我方的錯誤

```js
body.writeUInt16LE(mapId,     0x0A);   // 地圖 ID 寫在無關欄位
body.writeUInt16LE(userIndex, 0x11);   // 地圖 ID 的欄位被塞進 userIndex (=1)
```

客戶端於是拿 **1** 去查 Cache.Bin。合法 Map ID 是 `0, 101, 102, 1011, ... 9012`，沒有 1。查表失敗 → `ZPage_Room` 退回目前關卡 `Store_01` + `ZModeHangar.HangarGameInfo` + `team=255` → `ClientTravel` 到已載入的關卡 → `DestroyActor(HangarPlayerController)` 崩潰。

**已修**：地圖 ID 改寫於 `0x11`。`[TEST]` 逐欄驗證輸出，`body+0x11` 讀回 9001、`body+0x0F` 讀回 2。

> 這也解釋了為什麼先前所有修正都沒能阻止崩潰：真實 Map ID、房主、使用者陣列、地圖清單 header——那些都是真實且必要的修正，但**這一個欄位一直是錯的**，而它單獨就足以觸發整條 fallback。

⬜ `m_MapInfoList` 為 0 是另一個獨立問題（地圖選單清單），與崩潰無關。

---

## ❌ `0x00222112` Game_User_SN 在房間內送出會讓客戶端卡死（已停用）

`[TEST]` 2026-09-16。修正 opcode 後的第一次實測：建房完成、跳出房主提示後，客戶端立即變成全白視窗並停止回應。

```
70.030s  S-->C 0x00222112 (487b)   ← 隨房間狀態送出
72.531s  S-->C 0x00222112 (487b)
         （之後客戶端無回應；175s 送出一個 0x00220234，非操作者所按）
```

**成因是「改對 opcode」本身。** 先前送的是 `0x00230111`，客戶端**沒有任何 handler 對應，直接忽略**，所以那 487 bytes 的內容從來不重要。改成 `0x00222112` 後客戶端第一次真的交給 `ZDispatchGame::Game_User_SN` 解析，而該 body 的欄位排列是原作者的猜測，從未驗證。

記錄大小 `0x1E5` 已確認正確（反組譯可見 `push 0x1e5`／`add esi, 0x1e5`），**但欄位內容未知**。

**已停用**：`GAME_USER_BOOTSTRAP_MODE = 'disabled'`（`room-game-user.sender.js`）。

要重新啟用的前提：
1. 反組譯 `ZDispatchGame::Game_User_SN`（`0x107d8ae0`）讀出欄位排列，不要用猜的
2. 改在**真正開戰時**送出，而非在房間內

> **方法上的教訓：** 這次同時改了 `Game_Info_SN` 的地圖 ID 偏移與 `Game_User_SN` 的 opcode，導致無法分辨是哪一個造成新症狀。一次只改一個變數——這正是台帳存在的理由。

---

## 房主提示重複跳出 —— 重送房間狀態的代價

`[OBS]` 2026-09-16。操作者回報「我變成房主的提示跳了 2 次還 3 次」。

成因是兩個修正的交互作用，兩者本身都是對的：

1. `User_Master_SN` 必須**隨每個房間狀態區塊送出**——因為 `User_Default_SN` 會讓客戶端重建房間使用者陣列，不補送房主就會被清掉（見前述「房主狀態被自己的重送打掉」）。
2. 房間狀態在 Create_SA 之後被**重送 4 次**（350 / 1200 / 2500 / 5000 ms），是當初不確定房間場景何時開始接收封包的散彈作法。

4 次區塊 = 4 次房主封包 = 4 次對話框。

**已調整**：重送次數降為 2 次（350 / 1200 ms），排程抽成 `ROOM_STATE_RETRY_SCHEDULE` 常數。房間現在已能在第一個區塊就完整顯示，保留一次重試是為了場景切換的時序競爭。

> 這是同一類問題的第三個面向：**任何會讓客戶端重建狀態的封包，其伴隨的設定封包都必須跟著送；而重送本身是有代價的。** 理想解法是知道客戶端何時準備好、只送一次——目前沒有可用的確認訊號。

---

## ★★★ 崩潰真正的原因：`Game_Info_SN` 送得太晚（不是欄位錯，是時機錯）

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

## ✅ `0x00222111` Game_Info_SN body 結構（Ghidra 反編譯確認）

`[TEST]` 2026-09-16。已安裝 Ghidra 12.1.3，`ZDispatchWaiting::Game_Info_SN`（`0x107f0910`）反編譯結果：

```c
iVar9  = *(int    *)(pkt + 0x10);   // body+0x00
uVar7  = *(ushort *)(pkt + 0x14);   // body+0x04
uVar8  = *(ushort *)(pkt + 0x16);   // body+0x06
uVar2  = *(ushort *)(pkt + 0x1a);   // body+0x0A
uVar3  = *(ushort *)(pkt + 0x1c);   // body+0x0C
uVar10 = *(byte   *)(pkt + 0x1e);   // body+0x0E
local_10 = (*(short *)(pkt + 0x1f) == 2);   // body+0x0F，與 2 比較後的布林
uVar6  = *(ushort *)(pkt + 0x21);   // body+0x11
uVar4  = *(ushort *)(pkt + 0x23);   // body+0x13
uVar5  = *(ushort *)(pkt + 0x26);   // body+0x16

Game_Info_Set(this, iVar9, uVar3, uVar10, ?, uVar2, uVar6, local_10, uVar4, uVar5, arg3);
Game_Info_Team_Set(this, uVar7, uVar8);
```

而 `Game_Info_Set`（`0x1072cca0`）的寫入：

```c
*(this + 0xfc0) = param_2;   // ← body+0x00
*(this + 0xfc8) = param_7;   // ← body+0x11  地圖 ID
*(this + 0xfc4) = 由 param_3/param_4 組成的旗標位元
*(this + 0xfe0) = param_5;
*(this + 0xfe4) = param_6;   // ← body+0x0A
*(this + 0xfd4) = param_8;   // ← (body+0x0F == 2) 的布林值
*(this + 0xfd8) = param_9;   // ← body+0x13
*(this + 0xfdc) = param_10;  // ← body+0x16
*(this + 0xfd0) = param_11;
```

| body | 型別 | 去向 |
|---|---|---|
| `0x00` | uint32 | `[0xfc0]` |
| `0x04` | uint16 | `Game_Info_Team_Set` 第 1 參數（**紅隊**） |
| `0x06` | uint16 | `Game_Info_Team_Set` 第 2 參數（**藍隊**） |
| `0x0A` | uint16 | `[0xfe4]` |
| `0x0C` | uint16→byte | `[0xfc4]` 旗標 bit 0 |
| `0x0E` | uint8 | `[0xfc4]` 旗標 bit 1 |
| `0x0F` | uint16 | **與 2 比較**，結果的布林寫進 `[0xfd4]` |
| **`0x11`** | **uint16** | **`[0xfc8]` 地圖 ID** ✅ |
| `0x13` | uint16 | `[0xfd8]` |
| `0x16` | uint16 | `[0xfdc]` |

**確認我方 2026-09-16 的修正正確**：地圖 ID 改寫於 `0x11`、紅藍隊在 `0x04`／`0x06`。

⚠️ **更正先前引用的說法**：`[0xfd4]` / `[0xfd8]` / `[0xfdc]` 對應 MaxPlayers / GoalScore / TimeLimit 是 Gemini 的推測，反編譯**不支持**——`[0xfd4]` 收到的是一個布林值。URL 裡的 `MaxPlayers=1` 很可能就是我方送 `body+0x0F = 2` 造成布林為真。

---

## ✅ `0x00222112` Game_User_SN 記錄結構（Ghidra 反編譯）

`[TEST]` 2026-09-16。`ZDispatchGame::Game_User_SN`（`0x107d8ae0`）：body 為 2 bytes 標頭（`0x00` 旗標、`0x01` 筆數），記錄自 `body+0x02` 起、每筆 `0x1E5`，整筆 `memcpy` 後逐欄使用。

由堆疊變數佈局還原的記錄欄位：

| 記錄 | 型別 | 備註 |
|---|---|---|
| `0x00` | uint16 | |
| `0x02` | uint16 | |
| `0x04` | uint32 | |
| `0x0C` | int | |
| `0x10` | int | |
| `0x14` | int | |
| `0x18` | int | |
| `0x1C` | char[2] | 等級文字，以 `atoi()` 解析 |
| `0x1E` | char[25] | **暱稱**，ASCII，經 `winToUNICODE` 轉寬字串 |
| `0x37` | char[29] | 第二個字串（公會名？），同樣經 `winToUNICODE` |
| `0x54`~ | int ×7 | |
| `0x70` | byte | |
| `0x75` | int[92] | 368 bytes，至 `0x1E5` 結束 |

我方既有實作前半段（至 `0x37`）大致吻合，差異：

- 我方在 `0x08` 寫 pilotId，反編譯**看不到該欄位**（`0x04` 與 `0x0C` 之間為空）
- 我方 `0x37` 視為 25 bytes，反編譯為 **29 bytes**
- 我方尾段為 `0x6C` byte + `0x6D` 起的陣列；反編譯為 **`0x70` byte + `0x75` 起的 int[92]**，差 4 bytes

> 堆疊變數佈局是 Ghidra 的推論，仍有對齊造成偏差的可能。**在有真正的對戰可送之前，此封包維持停用**（`GAME_USER_BOOTSTRAP_MODE = 'disabled'`）。

---

## ★ `m_MapInfoList` 為空：事件在寫入之前就觸發

`[TEST]` 2026-09-16，Ghidra 反編譯 `ZDispatchRoom::Map_Change_All_SN`（`0x107ebab0`）：

```c
Event_Call(this, L"NETWORK_ROOM_INFO", 0);      // ← 先通知腳本
pRoom = Room_Info_Get(this);
if (pRoom == NULL) { log; return; }             // 無房間資訊則丟棄

pRoom[0x24] = body[0x00];
count       = body[0x01];
pRoom[0x20] = 0;  pRoom[0x28] = 0;
pRoom[0x2c] = count;
p = body + 0x06;  dst = pRoom + 0x30;
do {
    dst[0x00] = *(ushort*)(p - 4);   // body+0x02  地圖 ID
    dst[0x0c] = *(ushort*)(p - 2);   // body+0x04
    dst[0x08] = *(byte  *) p;        // body+0x06
    dst[0x10] = *(ushort*)(p + 1);   // body+0x07
    dst[0x14] = *(ushort*)(p + 3);   // body+0x09
    ...
```

**兩項確認：**

1. **記錄確實從 `body+0x02` 起、每筆 9 bytes**，欄位配置與我方實作一致——`MAP_ALL_HEADER_MODE = 'compact'` 正確。
2. **`Event_Call(NETWORK_ROOM_INFO)` 在寫入 `FROOM_INFO` 之前觸發。** 腳本在該事件裡讀房間資訊，讀到的是**上一次的內容**。第一個封包送達時那是空的——正好對應客戶端回報的 `ZPopup_MapSelect` 走訪 `m_MapInfoList` 得到 `0/0`。

**實驗（已上線）**：同一個封包**連送兩次**（`MAP_ALL_SEND_TWICE = 'enabled'`）。第二次的事件觸發時，第一次寫入的清單已經就位。

⬜ 若無效，代表腳本並非在該事件讀取，或另有前置條件。

> `Room_Info_Get()` 回傳 NULL 時整個封包被丟棄且只留一行 log——若未來地圖清單完全沒反應，這是要先排除的可能。

---

## ❌❌ 撤回：「白畫面」從未發生（我方判讀錯誤）

`2026-09-16` **更正。** 先前兩條「客戶端變成全白視窗」的記錄**全部作廢**，來源是操作者傳來的截圖，而那張截圖**只框到視窗標題列**，並非遊戲畫面。遊戲畫面自始至終正常。

受影響而被錯誤停用的：

| 原記錄 | 實際 |
|---|---|
| 「`0x00222112` Game_User_SN 改對 opcode 後使客戶端卡死」 | **無證據**，已停用是誤判 |
| 「`0x00222111` Game_Info_SN 在房間場景送出會清掉畫面」 | **無證據**，已還原是誤判 |

由此衍生的推論——「客戶端切到場景 6 在等伺服器」——同樣**沒有實證支持**。反編譯所見的 `Game_Play_Start()` 與 `Scene_Change(6)` 是真的，但**它在畫面上造成什麼，從未被觀察過**。

**已重新啟用** `GAME_INFO_SN_WITH_ROOM_STATE = 'enabled'`，並待實際觀察其畫面行為。

> **方法上的教訓（第三次）：** 我把一張裁切過的截圖當成完整畫面，據此判定兩次「回歸」，再據此建立整套場景切換理論。台帳裡連續數條記錄因此是錯的。
> **操作者的口頭描述與截圖，必須確認涵蓋範圍後才能當成觀察結果。**

---

## ✅ `Game_Info_URL_Get` 完整邏輯（Ghidra）

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

## 兩個 `Game_Info_SN` handler，差別在有沒有清資料

`[TEST]` 2026-09-16。opcode `0x00222111` 有**兩個** handler，依場景啟用（各自開頭檢查 `*(this+4)`）：

| Handler | 位址 | 是否呼叫 `Game_Data_Clear` |
|---|---|---|
| `ZDispatchWaiting::Game_Info_SN` | `0x107f0910` | **是** |
| `ZDispatchGame::Game_Info_SN` | `0x107d4f50` | 否 |

**兩者都從 `body+0x11` 取地圖 ID**（傳給 `Game_Info_Set` 的參數順序不同，但落點同為 `[0xfc8]`）——我方封包內容正確。

在房間場景送出會白畫面，推測是 `ZDispatchWaiting` 版本被啟用並清空了遊戲資料。

**目前策略**：改在收到 `0x00222103`（開始請求）時**同步、第一個**送出，不再延遲 350ms。若 `ZPage_Room` 是在送出請求的當下就組 URL、不等任何回應，則從伺服器端無法補救，地圖必須以其他途徑抵達客戶端。

---

## ✅ 房間地圖清單已可顯示（連送兩次有效）

`[TEST]` 2026-09-16。連送兩次 `Map_Change_All_SN` 後，房間畫面的地圖清單**確實列出內容**：動力奪取戰 ×3、援救基地戰 ×3（即 `9001`~`9006`，客戶端自 Cache.Bin 解出中文名）。按鈕亦維持「遊戲開始」。

⬜ 但 `ZPopup_MapSelect.m_MapInfoList` **仍為 `0/0`**（`OnDraw_Preview` 報錯 4182 次）。房間清單與該彈出視窗的清單是**不同的資料來源**，後者尚未解決。

⬜ 房間清單有內容後，`GameStart` 組出的 URL **仍為 `Store_01`**——證明 `ZPage_Room` 的地圖來源也不是房間清單。

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
