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

## 從 WSL 觀察與操作客戶端

`[TEST]` 2026-09-16。

| 能力 | 結果 |
|---|---|
| **截圖** | ✅ **可用**。D3D9 視窗模式 `CopyFromScreen` 截得乾淨 |
| 滑鼠點擊 | ❌ **遊戲不接受**（可取得視窗焦點，但點不到任何 UI 元件） |
| 鍵盤輸入 | ❌ **遊戲不接受** |

### 兩個獨立的坑，依序排除

**1. `SetForegroundWindow` 對遊戲視窗無效。** 從背景行程呼叫會**回傳 `True` 但前景完全沒變**（Windows 的前景鎖）。實測：呼叫前後前景都是 `powershell`。
→ 模擬點擊**可以讓視窗取得焦點**（實測前景變為 `MetalRage`），但**點不動任何 UI 元件**——點 `Create Room` 與切換 `Friends` 分頁皆無反應。焦點變更是作業系統層級的視窗啟動，與遊戲是否處理該次點擊無關。

**2. 注音 IME 會吞掉按鍵。** `keybd_event` 送出的鍵在記事本顯示為 `_吃吃ㄉ`——按鍵有送達，被 IME 組字。
→ 送鍵前以 `WM_INPUTLANGCHANGEREQUEST` 切 en-US 即可，實測記事本正常顯示 `ENGLISH-TEST`。

### 排除以上兩者後的結論

最終對照實驗（全部在同一個隱藏視窗的行程內完成）：

```
送鍵前前景 = MetalRage      ← 焦點正確
輸入法     = en-US          ← IME 已排除
按鍵       = 真實掃描碼      ← 同方法記事本收得到
送鍵後前景 = MetalRage
結果       = 輸入欄位仍為空
```

**在焦點、輸入法、方法皆正確的前提下，客戶端收不到鍵盤輸入；滑鼠點擊同樣無效。** 客戶端執行 **XIGNCODE3**（`data/System/xigncode.log` 實測執行中、持續寫入），過濾帶注入標記的輸入事件正是其標準行為。

> **不繞過。** 本專案界線：不注入行程、不附加除錯器、不規避防作弊。截圖與滑鼠點擊是被動／一般的桌面操作，不越線。

### 實務分工

操作者負責**所有操作**（點擊與打字）；我負責截圖觀察、讀封包紀錄、讀客戶端 log、改伺服器、反編譯。

我可以**看**，不能**動**。

> 這條記錄先前被我改過兩次方向——先斷定是 XIGNCODE、再改成「成因未定」、最後才補齊對照組。**結論本身回到第一版，但直到現在才有證據支撐。**

---

## ★★★ 開戰是場景驅動的：`Game_Info_SN` 一直送錯場景

`[TEST]` 2026-09-16。Ghidra 反編譯各 dispatcher 的 `Check(SCENE_TYPE)` 方法（它設定 `*(this+4)` 啟用旗標，每個 handler 開頭都檢查它）：

| Dispatcher | `Check` 條件 | 啟用場景 |
|---|---|---|
| `ZDispatchRoom` | `IsClient && (scene==5 \|\| scene==6)` | 房間 = **5 或 6** |
| `ZDispatchWaiting` | `scene == 1` | **1（Waiting）** |
| `ZDispatchGame` | `scene == 6` | 對戰 = **6** |

**關鍵：** `Game_Info_SN`（`0x00222111`）唯一會設 `[0xfc8]`（地圖）並呼叫 `Scene_Change(6)` 的 handler 在 **`ZDispatchWaiting`，只在場景 1 啟用**。

我方一直在**房間場景（5）**送 `0x00222111`。那裡 `ZDispatchWaiting` 沒啟用，該封包**沒有任何 handler 接**（`ZDispatchGame` 也要場景 6）——所以 `[0xfc8]` 從未被寫入，恆為 0。

### 這解釋了全部

- 崩潰 URL 走 `Store_01` 且**無 `Failed - MapIndex`** → 查表成功查到 Map ID **0** = `Store_01`/`HangarGameInfo`/goal 0/time 0，與 URL 每個欄位吻合
- `[0xfc8]` = 0 是因為設它的封包送到了沒有 handler 的場景
- 之前「時機太晚 / 太早」「隨房間狀態送」全部是錯的方向——**不是時機，是場景**

### 場景 1（Waiting）的握手，我方從未實作

`ZDispatchWaiting` 在場景 1 的三個 handler：

| Opcode | Handler |
|---|---|
| `0x00410102` | `Regist_SA`（回應客戶端的 `Regist_CQ 0x00410101`） |
| `0x00410103` | `Clear_SQ` |
| `0x00222111` | `Game_Info_SN`（設地圖 + `Scene_Change(6)`） |

正確流程推定：房間按開始 → 客戶端進場景 1（Waiting）→ 送 `Regist_CQ 0x00410101` → 伺服器回 `Regist_SA 0x00410102` → 伺服器送 `Game_Info_SN`（此時場景 1，handler 生效，設地圖並切場景 6）→ travel 進地圖。

崩潰那輪：**整個 session 沒有任何 `0x0041xxxx` 封包**。客戶端從未進場景 1，按 F5 只是原地 ClientTravel 回 `Store_01`。

### ⬜ 下一個未知：什麼讓客戶端從房間進入場景 1？

客戶端不會自己從房間跳到 Waiting——必有伺服器封包觸發。候選（房間 dispatcher 內、我方部分有送）：`Game_Ready_SN 0x222102`、`Game_Start_SN 0x222104`、`Game_Wait_SN 0x420111`。需反編譯這些 handler，找出哪個呼叫 `Scene_Change(1)` 或觸發客戶端送 `Regist_CQ`。**這是目前進戰鬥的唯一阻塞點。**

---

## ★ 開戰機制的完整靜態分析（進展到加密邊界）

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

## ★★★ 突破:伺服器驅動開戰 = 第一次沒有崩潰

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

## ✅✅✅ 進入戰鬥地圖成功（2026-09-16 18:14）

`[TEST]` 伺服器驅動開戰流程 + `Ready_Host_SQ`,**客戶端成功 travel 到 `Map_PC01` 並載入 3D 戰鬥場景**（畫面：MISSION BRIEFING / Protect the strategy fusion / CAMPAIGN MODE，沙漠戰場實景）。

travel URL：
```
start Map_PC01?Listen?LPort=30907?Name=1?Game=ZModePve.ZModePve
  ?MaxPlayers=1?GoalScore=0?TimeLimit=1?BalanceTeams=0?numbots=0?team=255
```

`Map_PC01` + `ZModePve.ZModePve` = 地圖與遊戲類別皆正確。**這是整個專案第一次真正進入對戰。**

### 有效的流程（`SERVER_DRIVEN_START_MODE = 'enabled'`）

收到 `0x00222103`（F5）後,伺服器主動:
```
Game_Wait_SN 0x420111    → 阻止房主 F5 的即時 travel,推客戶端進等待狀態
Game_Info_SN 0x222111    → 場景 6 handler 設地圖 [0xfc8]=9001 + Game_Play_Start
Game_Ready_SN 0x222102   ┐
Game_Start_SN 0x222104   � 放行 Loading
Ready_Host_SQ 0x420113   ┘
Game_Info_SN 0x222111    → retry
```
之後房主的 `ZPage_Room.GameStart` 讀到已設好的 `[0xfc8]`=9001,travel 到 `Map_PC01`。

### 更正先前的錯誤結論

前文曾斷言「房主在房間按 F5,`[0xfc8]` 結構上不可能非 0」——**錯誤**。伺服器驅動的 `Game_Wait_SN` 先把客戶端推進場景 6,`Game_Info_SN` 遂由場景 6 的 handler 處理並設好 `[0xfc8]`,F5 的 travel 便讀到正確地圖。靜態分析看似的死局,實測即通。

### 仍待處理（次要）

⬜ `team=255`（未阻止進地圖,但玩家隊伍未定）
⬜ `TimeLimit=1`（應為 60；可能是 Game_Info_SN body 某欄位）
⬜ `MaxPlayers=1`

### 下一步:真實對戰封包

玩家已在地圖內。客戶端此後送出的 `0x0023xxxx` / `0x0025xxxx` 即真實對戰封包,可用於驗證今日反編譯得出的映射（`Death_SN 0x230107`、`Respawn_SN 0x230103`、`Assist_SN 0x230106` 等）。

---

## 進地圖之後:卡在任務簡報,等待 spawn

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

---

## 場景 6 的三個 CN:客戶端在地圖裡送什麼 ✅ 已確認 [DLL]

先前這三個都被當成「未知輪詢」,其中 `0x00230111` 還被 `lobby.dispatch.js` 誤判成 Lobby Enter。
在 `ZNetwork.dll` 掃描 `mov dword ptr [...], <opcode>` 即可定位送出端,三處引用的形狀完全一致
(一個 `[ecx+0xc]` 建構子 + 兩個全域 Format 的 send 站)。

| opcode | 名稱 | 封包長度 | 送出前提 |
|---|---|---|---|
| `0x00230111` | `ZDispatchGame::Timeout_CN` | 0x10(無 body) | scene 6 + `Game_Host_Check()` + **`Game_Play_Check()`** |
| `0x00230151` | `ZDispatchGame::BeginRound_CN` | 0x14(4-byte body) | scene 6 |
| `0x00420117` | `ZDispatchGame::Battle_Success_CN` | 0x10 | scene 6 + `Game_Host_Check()`,參數為 0 的分支 |

對應的 SN 在 dispatch map 裡:`Timeout_SN 0x00230112`、`BeginRound_SN 0x00230152`、`ChangeSlot_SN 0x00230102`。

**這推翻了「回合沒有開始」的假設。** `Timeout_CN` 的送出前提就包含 `Game_Play_Check()` 為真,
所以客戶端進圖後回合其實正常開始了;那 60 秒的靜默是 `TimeLimit=1`(單位:分鐘)的回合計時,
跑完之後客戶端每秒回報一次逾時。問題從頭到尾不是回合,是**玩家沒有 pawn**。

### 方法學
先前把 `0x00230111` 標成「每秒輪詢,含義未知」,是因為只從客戶端的 *dispatcher* 找它——
而 dispatcher 只列 server→client。客戶端自己送的封包要在 **send 站**找,也就是搜尋
把 opcode 寫進 Format 結構的那條 `mov`。這條路徑對任何 CQ/CN 都適用。

---

## `team=255` 的成因鏈 ✅ 已確認 [DLL]

`UZNetwork_DJ::Game_Info_URL_Get`(thunk `0x10733e71` → `0x10733cf0`)組 travel URL,
最後一個 `%d` 來自 `Game_User_Team_Get(this, [this+0x44c])`,參數是自己的 account index。

```c
// Game_User_Team_Get, 0x107024d7
iVar1 = 0xff;                       // 預設 255
// 陣列 [this+0x1034],筆數 [this+0x1038],stride 0x80
// 找 entry[0] == accountIndex
teamRaw = entry[0x34];
if (teamRaw == [this+0xff0]) return 0;   // 紅
if (teamRaw == [this+0xff4]) return 1;   // 藍
return 255;
```

`[0x1034]` 這張表**只有** `Game_User_Add`(`0x10703850`)寫,而 `Game_User_Add`
**只有** `ZDispatchGame::Game_User_SN`(`0x00222112`)呼叫。該封包先前是關閉的,
表是空的 → 查無此人 → 255 → UE2 視為未分配隊伍 → 只給 spectator 攝影機,不 spawn pawn。

這也解釋了先前修好 `User_Default_SN` 之後房間裡看得到玩家、進圖卻仍然 `team=255`:
`User_Default_SN` 填的是另一張表(`[this+0xf88]`,stride 0x50),與 `[0x1034]` 無關。

兩個 team ref 的來源:
```
Game_Info_SN → Game_Info_Team_Set(body+0x04, body+0x06) → [0xffc], [0x1000]
             → Game_Play_Start                          → [0xff0]=[0xffc], [0xff4]=[0x1000]
```
所以送 red=0 / blue=1,`Game_User_SN` 記錄的 team 欄位寫 0,就會解析成紅隊。

---

## `Game_Info_SN` (0x00222111) body ✅ 已確認 [DLL]

來源:`ZDispatchGame::Game_Info_SN` thunk `0x107079af` → `0x107d4f50`。
**參數順序取自組語,不是反編譯器**——Ghidra 在這個呼叫上把 p2/p3 與 p8/p9 對調了。

| body | 型別 | → `Game_Info_Set` | → 欄位 |
|---|---|---|---|
| +0x00 | u32 | p1 | `[0xfc0]` battle index |
| +0x04 | u16 | `Game_Info_Team_Set` p1 | `[0xffc]` → `[0xff0]` 紅隊值 |
| +0x06 | u16 | `Game_Info_Team_Set` p2 | `[0x1000]` → `[0xff4]` 藍隊值 |
| +0x0A | u16 | p4 | `[0xfe0]` |
| +0x0C | u16 | p5 | `[0xfe4]` |
| +0x0E | u8 | p2 (bool) | `[0xfc4]` bit0 |
| +0x0F | u16,取 `== 2` | p3 (bool) | `[0xfc4]` bit1 |
| +0x11 | u16 | p6 | **`[0xfc8]` MAP ID** |
| +0x13 | u16 | p7 | **`[0xfd4]` TimeLimit,單位分鐘** |
| +0x15 | u8 | p10 | `[0xfd0]` GoalScore,模式 4/6/7 |
| +0x16 | u16 | p8 | `[0xfd8]` GoalScore,模式 0/1 |
| +0x18 | u16 | p9 | `[0xfdc]` GoalScore,模式 5 |

模式 `[0xfcc]` **不是**這個封包給的,而是 `Game_Info_Set` 依 map id 去 Cache.Bin 該筆
記憶體結構的 `+0x18`(int index 6)取得。Cache.Bin 在磁碟上是變長格式(map 1011 該欄是
`"S"`、9001 是 `"S0b"`),沒辦法用固定 stride 讀出來,所以伺服器改成**三個 GoalScore 欄位
寫同一個值**,哪個模式都對。

**先前的錯誤**:`+0x13` 寫的是 `quarterIndex = 1`,那正是 TimeLimit,所以 URL 出現
`TimeLimit=1`,60 秒後回合結束並開始 `Timeout_CN` 洪水。已改為 10。

---

## `Game_User_SN` (0x00222112) 記錄布局 ✅ 已確認 [DLL]

來源:`ZDispatchGame::Game_User_SN` thunk `0x1070920a` → `0x107d8ae0`。
記錄緩衝區在該 frame 的 `esp+0xA8`;以下每個偏移都對應一條實際讀取它的指令。

```
body+0x00 u8   flag(未讀)
body+0x01 u8   記錄數
body+0x02      記錄陣列,每筆 0x1E5

rec+0x00 u16      Game_User_Add p1,其餘所有呼叫的 key
rec+0x02 u16      Game_User_Add p7 → entry+0x34  ★ TEAM
rec+0x04 u32      Game_User_Add p3 → entry+0x14
rec+0x08 u32      Game_Item_Add p2
rec+0x0C u32      此處未讀
rec+0x10 u32      Game_Slot_Selected_Set,1..7 → 0..6,其餘 7
rec+0x14 u32      Game_User_Clan_Set p3
rec+0x18 u32      Game_User_Clan_Set p2
rec+0x1C char[2]  atoi → Game_User_Add p2 → entry+0x10,等級
rec+0x1E char[25] 轉寬字元 → Game_User_Add p6 → entry+0x04,暱稱
rec+0x37 char[25] 轉寬字元 → Game_User_Clan_Set p4,戰隊名
rec+0x50..0x68    七個 u32 → Game_Item_Add p6,p5,p7,p3,p4,p8,p9
rec+0x6C u8       槽位數
rec+0x6D + n*0x2F 槽位記錄(最多 8)

slot+0x00 u32  槽位索引,1..7 → 0..6,其餘 7
slot+0x04 u32  Game_Slot_Set p3 → row+0x0C
slot+0x08 u8   此處未讀(就是這個 byte 讓後面所有 u32 都不對齊)
slot+0x09 u32  Game_UserSocket_Set p3
slot+0x0D u32  Game_UserSocket_Set p4
slot+0x11 u32  Game_UserSocket_Set p5
slot+0x15 u32  Game_Slot_Set p4 → row+0x10
slot+0x19 u32  Game_Slot_Set p5 → row+0x14
slot+0x1D u32  Game_Slot_Set p6 → row+0x18
slot+0x21 u32  Game_Slot_Set p7 → row+0x1C
slot+0x25 u32  Game_Slot_Set p8 → row+0x20
```

結構是緊密打包、沒有對齊洞——這正是驗算:`0x6D + 8 × 0x2F = 0x1E5`,分毫不差等於記錄大小。

⚠ 注意 Ghidra 對這個函式的 stack 變數命名有誤(`iStack_1dc` 實際是 `rec+0x08` 而非 `+0x0C`,
槽位陣列起點是 `rec+0x6D` 而非 `+0x71`)。**以組語為準。**

處理順序:`Game_User_Add` → `Game_User_Clan_Set` → `Game_Item_Add` → `Game_UserSocket_Add`
→(每槽:`Game_Slot_Set`、`Game_UserSocket_Set`)→ `Game_Slot_Selected_Set`
+ `Game_UserSocket_Selected_Set`。`Game_Slot_Set` 寫 `[0x1040]`(stride 0xEC,每槽 0x18,
六個 int),而那張表由同一封包裡的 `Game_UserSocket_Add` 建立——所以**選機體 UI 也依賴這個封包**。

---

## 選機體是 UnrealScript native ✅ 已確認 [DLL]

`UZNetwork_DJ::execGame_Slot`(`0x10704278`)是 UnrealScript native:取兩個 int 參數,
直接呼叫 `ZDispatchGame::ChangeSlot_CN(a, b)`。也就是玩家在選機體畫面按下去,
腳本呼叫 `Game_Slot(x, y)`,客戶端就送 `0x00230101`,伺服器應以 `ChangeSlot_SN 0x00230102` 回應。

玩家回憶的進圖流程(有影片佐證):任務簡報動畫 → 選機體 → 畫面右側 F1~F5 技能列
(消耗 SP 30/30/50/200/300:攻擊力、防禦力、裝填、核心 EMP、憤怒模式),
標籤 `RESPAWN 0 / KILL 0`;進入後 RESPAWN 變成 4,才能操控機體。
DLL 側對應的候選:`Game_User_Sally_Add`(出撃)、`Game_Item_InstantRespawn_Get/Set`、
`Item_InstantRespawnCount_Get`(`Game_Info_SN` 最後一行就呼叫它)、
`Game_User_State_All_Set`(`Game_Play_Start` 以 `(1, false)` 呼叫)。⬜ 尚未驗證。

---

## 本輪伺服器改動(一次改兩項,但可分辨)

1. `Game_Info_SN` 的 `+0x13` 由 `quarterIndex=1` 改為 `timeLimitMinutes=10`,
   GoalScore 三格同時寫 0。
2. `Game_User_SN` 由 disabled 改 enabled,並從 `room.dispatch.js` 的房間狀態
   (場景 5,handler 必定丟棄)移到 `gate.game.dispatch.js` 的 server-driven 序列,
   在 `Game_Wait_SN` 之後 60ms 送出(場景 6),早於 450ms 的 `Ready_Host_SQ`。

ledger 的「一次只改一個變數」原則在此是有意放寬的:兩項的觀察特徵互斥且各自獨立——
第 1 項只會表現在 URL 的 `TimeLimit=` 與 `Timeout_CN` 是否洪水,
第 2 項只會表現在 URL 的 `team=` 是 0 還是 255、以及是否出現選機體畫面。
任一項失敗都能單獨歸因。

### 下一次測試要看的三件事
- `MetalRage.log` 裡 travel URL 的 `team=` — 應為 `0`,不再是 `255`
- 同一行的 `TimeLimit=` — 應為 `10`
- 進圖後是否出現選機體畫面;若出現,客戶端應送 `ChangeSlot_CN 0x00230101`
  (目前無 handler,會落到 unhandled logger 並 dump body)

## 接手驗證準備（2026-09-16）

- ✅ 已確認 [OBS] 客戶端 log 實際位於 `/mnt/c/Games/MetalRage Online/data/Log/MetalRage.log`，已更正 HANDOFF 路徑。
- ✅ 已確認 [OBS] 接手時既有 log 最後一次 `Map_PC01` travel 仍為 `team=255`、`TimeLimit=1`；tmux `server` 留存輸出也為舊版 `quarter=1`。這是舊流程基準，不能當作新修改的測試結果。
- ✅ 已確認 [TEST] `gate.game.dispatch.js` 與 `room-game-user.sender.js` 通過 `node --check`。磁碟程式包含啟用 Game_User_SN、場景 6 排程及 TimeLimit=10；執行效果仍待重啟伺服器後手動開局驗證。
- ✅ 已確認 [DLL] 匯出表中 `ChangeSlot_CN` thunk 為 `0x10702d51`，`ChangeSlot_SN` thunk 為 `0x107044c6`；僅定位符號，尚未解析回應布局。

## 新版開局實測：team 已修正，仍無選機體畫面（2026-09-16）

- ✅ 已確認 [TEST] 重啟 tmux `server` 後，記錄 `session-20260916-200401.jsonl` 在 70.370s 送出 487-byte `Game_User_SN`，userIndex=1、team=0、selected slot raw=1、slotCount=1、body item=11200101、main item=21100101。
- ✅ 已確認 [OBS] 客戶端 travel URL 為 `Map_PC01?...?TimeLimit=10?...?team=0`，並記錄 `Login Info InName=Lucas,InTeam=0,InBrowseTeam=0,InServerIndex=1`。兩項修改的觀察特徵皆已通過。
- ✅ 已確認 [OBS] 使用者回報仍無選機體畫面；截圖 `shots/team0-first-test.png` 顯示 MISSION BRIEFING / CAMPAIGN MODE、地圖與 DEFENSE 標記，未見選機體 UI 或玩家機體。本次檢查時未收到 `ChangeSlot_CN`。
- ❌ 已排除 [TEST] 「只要 team 從 255 修成 0 就會出現選機體／機體」並不成立；先前把 spectator 全部歸因於 team 的敘述過強。隊伍表修正成功，不代表出擊條件已滿足。
- ⬜ 未知 [OBS] log 同時有 `Class''ZMechanicA 'call failed` 與 `PreLoadallPveAI_BD` 的 `DefaultPawnClass` null 錯誤；尚未判定與缺少選機體畫面是否相關，不据此修改資產或封包。

## 槽位／出擊函式後續分析（2026-09-16）

- ✅ 已確認 [DLL] `Game_Slot_Set`（thunk `0x10707a6d`）只將六個輸入 int 寫入 `[this+0x1040]` 使用者記錄的指定槽位；`Game_Slot_Selected_Set`（`0x10703a17`）只寫該記錄 `+0x08`。兩者本身不觸發 UI，也不轉換 item ID。尚需追查讀取端才能判定槽位要用 item code 或 Cache 索引。
- ✅ 已確認 [DLL] `ChangeSlot_SN` thunk `0x107044c6` → 本體 `0x107db2f0`，場景閘門通過後讀取 body `+0x0A` u16 user index、`+0x0C` u8 slot raw（1..7 → 0..6，其餘 → 7）。成功條件為 body `+0x00` u16 與 `+0x02` u32 均為 0。上述偏移已用組語核對；未讀欄位的用途及完整格式仍未知。
- ✅ 已確認 [DLL] 上述成功分支設定 selected slot/socket，若本機為 host，依 `Game_Item_InstantRespawn_Get(user)` 的值送 `InstantRespawn_CN`（非零）或 `Respawn_CN`（零）。因此選槽回應與後續重生存在明確呼叫鏈；尚未收到實際 ChangeSlot_CN，不提前猜造回應。
- ✅ 已確認 [DLL] `Game_User_Sally_Add`（`0x10704c28`）只在使用者表 `[0x1034]` 對應記錄的 `+0x44` 加上傳入值，本身不建立 pawn。先前「最像 spawn」僅依名稱的猜測，不能當作實際生成機體的函式。

## WearInfo 槽位關聯鍵錯位：已修，待實測（2026-09-16）

✅ 已確認 [DLL] `WearInfo_SN` 本體 `0x107c46e0`：`0x107c4877` 複製 0x34-byte 記錄到基準 `esp+0x1c`；`0x107c4a13` 讀 `esp+0x24`，即 **rec+0x08**，作為 `Slot_Info_Set(userSlot, 0, key)` 的第三參數。後續裝備取 rec+0x10、+0x18、+0x20、+0x28、+0x30。

`Slot_Info_Set`（thunk `0x10709c32`）先清空機庫槽位，再以此 key 查物品表 `[this+0x81c]` 每筆的第一個 int；找不到便返回。`ItemInfo_SN`（`0x107c4560`）組語確認將 rec+0x00 傳入 `Item_Add` p1，作為該 key。故 WearInfo 的每組第二個 u32 必須是 ItemInfo 的物品實例 ID，而非 item code。

原伺服器的 `[uniqueKey, itemIndex]` 使客戶端拿 item code 查實例表，槽位全空。已在 `account.dispatch.js` 與 `gamelogin.dispatch.js` 同步改成 `[itemIndex, uniqueKey]`，未改 Game_User_SN 或其他開局時序。

✅ 已確認 [TEST] 兩檔通過 `node --check`。取 `session-20260916-200401.jsonl` 兩條連線的真實 ItemInfo/WearInfo，執行修改後的序列化迴圈，再依 DLL 的 key 查找方式重播：每條連線成功配對由 **0 → 24**。

⬜ 未知／下一個獨立問題：兩條登入路徑都刻意過濾 `part_slot=0`，8 個機體本體不在 ItemInfo。此次只修關聯鍵，未解除過濾；因此不能宣稱已解決選機體 UI。程式註解稱本體資料曾造成斷線，需先追清 ItemInfo/Cache 資料再恢復。

✅ 已確認 [OBS] 修正後重新登入，使用者觀察到機庫初始仍未直接顯示內容，但滑鼠移到選單會出現預覽圖；點擊預覽圖後，機體與裝備均正常顯示。伺服器同時收到各槽位的 `Slot_Change_CQ 0x00240107`，並能依槽位填入 body/main/left/equipment。這證明 WearInfo 關聯鍵修正已恢復機庫的實際資料鏈；初始畫面採延遲／互動載入，不能再以「登入瞬間空白」單獨判定資料失敗。

⚠ 上一段「part_slot=0 過濾可能仍阻止 UI」的風險在機庫路徑上已被本次觀察降低：即使 ItemInfo 未列本體，點擊後機體仍能顯示。它是否影響戰鬥選機體仍需新開局單獨確認。

## WearInfo 修正後進圖：仍為觀察者；新增 Respawn_SN 單變數實驗

- ✅ 已確認 [OBS] `session-20260916-201428.jsonl` 第二次開局的 `Game_User_SN` 已使用使用者最後點選的第 8 槽：selectedMech=8、body=18200101、main=28300101。travel 仍為 team=0 / TimeLimit=10。
- ✅ 已確認 [OBS] 截圖 `shots/wearinfo-fixed-ingame.png` 仍只有 MISSION BRIEFING 與自由視角，沒有選機體 UI；本輪沒有 `ChangeSlot_CN 0x00230101`。因此 WearInfo 修正已恢復機庫，但沒有自行觸發戰鬥選槽流程。
- ✅ 已確認 [DLL] `Respawn_SN` 本體 `0x107d5b60` 讀 body+0x00 u16、body+0x02 u32 作成功條件，body+0x0A u16 作 user index；成功時使用 `Game_User_SN` 已設的 selected slot，增加 Sally、state 設 2，呼叫 `Game_Action_Revive("SUCCESS")` → `AGameInfo::eventSelectUnitSlot_BD`。
- ❌ 已排除 [TEST] 第一輪 Respawn 實驗誤送 `0x00230103`。重新執行 `tools/dispatch-map.py 0x1070139d ZNetwork.dll` 確認它不是任何 server→client handler；客戶端因此完全忽略，不能用來判斷 Respawn body 或出擊鏈失敗。
- 🟡 實驗 [DLL] 正確配對是 `Respawn_CN 0x00230103` / `Respawn_SN 0x00230104`。已將同一個 12-byte body 改送 `0x00230104`；其 handler 本體仍是已核對的 `0x107d5b60`。待重啟實測。

⚠️ 更正前文完整映射中一組系統性錯位：最新工具輸出確認 `Respawn_SN=0x230104`、`InstantRespawn_SN=0x230106`、`Timeout_SN=0x230112`、`Assist_SN=0x230122`、`Death_SN=0x230124`；舊表把多個 CN 奇數 opcode 誤標成 SN。後續以 `tools/dispatch-map.py 0x1070139d ZNetwork.dll` 的實際輸出為準。

## ✅ 首次成功生成並持有機體（2026-09-16）

- ✅ 已確認 [TEST] 記錄 `session-20260916-202706.jsonl`：客戶端送 `BeginRound_CN 0x230151` 後，伺服器回 `BeginRound_SN 0x230152`，再於 250ms 後送正確的 `Respawn_SN 0x230104`，body success=0/error=0/userIndex=2。
- ✅ 已確認 [OBS] 使用者回報「有機體了」；截圖 `shots/first-mech-spawn.png` 明確顯示第三人稱機體、準星、小地圖、280 DEFENS 與彈藥 HUD。這確認 `Respawn_SN` handler 成功走到 `Game_Action_Revive("SUCCESS")` / `SelectUnitSlot_BD`，主要 spawn 阻塞已解除。
- ⬜ 待確認 [OBS] WASD、瞄準、射擊等操控是否正常，以及死亡後重生流程。
- ✅ 清理 [DLL/TEST] 移除 `0x420114` handler 原本排程的 6 秒延遲 `BeginRound_SN`。客戶端已會自行送 `BeginRound_CN`，新的明確 handler 當場回覆；舊延遲包在 Respawn 成功後再次呼叫 `Game_Play_Start`，會把 user state 從 2 重設為 1，且攜帶無用的 map-name body，屬重複且可能破壞狀態的通知。

### 其他已確認與更正

- ❌ 更正 [DLL] `[0x1040]`、stride 0xEC 是 `Game_Item_Add` 建立的表；`Game_UserSocket_Add` 實際建立 `[0x104c]`、stride 0x68。前文將兩者混為一談不正確；開局封包確實皆有呼叫。
- ✅ 已確認 [DLL] `Respawn_SN` 本體 `0x107d5b60`：成功且玩家 state !=2 才增加 Sally、設 state=2，再呼叫 `Game_Action_Revive("SUCCESS", user, selectedSlot)`。後者在 host 旗標有效時呼叫 `AGameInfo::eventSelectUnitSlot_BD`。這是伺服器回應接到腳本出擊的明確入口，不等於初次顯示選機體 UI。
- ✅ 已確認 [DLL/OBS] `execGame_Load_Complete` → `Battle_Success_CN`，`execGame_Play_Start` → `BeginRound_CN`；本輪皆已收到，並非完全沒有載入完成通知。
- ✅ 已確認 [DLL] `Game_Play_Start` 設 `[0xfe8]` bit0、重置多項回合狀態並呼叫 `Game_User_State_All_Set(1, mode==9)`，沒有直接發送 UI 事件。
- 分析輸出與 WearInfo 組語保存在 `docs/research/2026-09-16-slots/`。Ghidra 多處 stack 變數名與實際參數錯位，欄位以組語核對結果為準。

## 死亡／重生回歸實測（2026-09-16）

- ✅ 已確認 [DLL] `Death_CN` 本體 `0x107d99f5` 將 client body 的 attacker u16、victim u16、death type u8、flag u8、part byte u8、auxiliary u32 寫入 `Death_SN` 格式；實測 body `0000020003000000000000` 即 attacker=0、victim=2、environment type=3。
- ✅ 已確認 [DLL] `Death_SN` 本體 `0x107db760` 讀 `body+0x00` status、`+0x02` error、`+0x0A` attacker、`+0x0C` victim、`+0x0E` death type，成功分支用 victim 呼叫 `Game_User_State_Set(victim, 1)` 後執行 `Game_Action_Death`。舊版全零短回覆把 victim 留為 0，故 account 2 的 state 不會變成可重生。
- ✅ 已實作 [TEST] `lobby.dispatch.js` 的 `Death_CN 0x00230123` handler：送 0x51-byte body 的 `Death_SN 0x00230124`，victim 寫在 +0x0C；並在 5 秒後送 `Respawn_SN 0x00230104` 作舊版客戶端的保底。新增 `Respawn_CN 0x00230103` handler，收到客戶端請求時立即送同一個 SN。
- ✅ 已確認 [OBS] 最新記錄 `session-20260916-203513.jsonl`：12:38:37 收到 Death_CN，12:38:37 回 Death_SN（伺服器實際封包因 16-byte 對齊記錄為 96 bytes），12:38:42 回 Respawn_SN；使用者確認「有重生了」。因此死亡讀條卡死已排除。
- ⬜ 未知 [OBS] 5 秒保底是否與所有死亡類型的客戶端讀條長度一致；目前只以環境死亡 type=3 驗證，若日後發現重生過早／過晚再調整，不能先刪除 victim 欄位修正。

## 戰鬥操控與 AI 待查（2026-09-16）

- ✅ 已確認 [OBS] 使用者在機體生成後 WASD 與準心可動，死亡後可重生。
- ✅ 已確認 [TEST] 使用者連續按滑鼠左鍵期間，`session-20260916-203513.jsonl` 沒有新增任何疑似開火／攻擊的 client→server opcode；只有週期性內部 `0x00020083`。所以目前優先級是「客戶端武器 actor／裝備資料沒有使輸入事件成立」，不是先在伺服器盲回一個未知攻擊 opcode。
- 🟡 假設 [OBS] `Game_User_SN` 的 selected mech 1 欄位目前是 body=11200101、main=21100101、left=31100101、right=0、equipment/booster=41100101、skin=0，三個 `Game_UserSocket_Set` 值為 0。這些 socket 參數的語意和是否需要 serial key 尚未由 DLL 讀取端確認；不要把其他 mech 的物品直接填入。
- ⬜ 未知 [OBS] Map_PC01 沒有敵人；客戶端 log 有 `Class''ZMechanicA 'call failed` 和 `PreLoadallPveAI_BD ... DefaultPawnClass` null，尚未判定為地圖資產缺失、AI 設定缺失或戰鬥狀態封包不完整。下一步應先反編譯／檢查相關讀取端，再做單變數測試。

## 武器無法開火／外觀像另一台機體的根因突破（2026-09-16）

- ✅ 已確認 [LOG] 客戶端 `MetalRage.log` 記錄顯示：
  - `ScriptLog: Pawn: SA02m`
  - `ScriptLog: WeaponLog=== Small Cannot use Map_PC01.MOC_a`
  - `Warning: MOC_a Map_PC01.MOC_a (Function ZBase.W_DefaultWeapon.BringUp:00A5) Accessed None 'ThirdPersonActor'`
- ✅ 已確認 [CACHE.BIN/DLL] 經由反編譯 `Engine.dll` `UCacheManager::LoadAnotherFile_BD` 與分析 `Cache.Bin` 二進制結構：
  - `FSpecMechRecord` 中：
    - `11100101`: `ZMechanic.SA01m`, `DefaultMech=0`, `MechType=0x1`（一代輕裝甲 Vanguard，預設機體）
    - `11200101`: `ZMechanic.SA02m`, `DefaultMech=1`, `MechType=0x1`（二代輕裝甲 Raven，非預設機體）
  - `FGameItemRecord` 中：
    - `11100101`: `HighGroup=1, MiddleGroup=1, LowGroup=1`
    - `11200101`: `HighGroup=1, MiddleGroup=1, LowGroup=2`
    - `21100101` (`MOC_a`): `HighGroup=2, MiddleGroup=1, LowGroup=1`
    - `31100101` (`AOC_a`): `HighGroup=3, MiddleGroup=1, LowGroup=1`
    - `41100101` (`BPE_a`): `HighGroup=4, MiddleGroup=1, LowGroup=1`
- ✅ 根因定位 [DLL/LOG]：
  - 原先 `db.js` 的 `starterLoadouts` 與資料庫中 account 2 的機體 body 誤填為 `11200101`（`SA02m` Raven），但裝備的主副武器與推進器全是一代裝備（`LowGroup=1`）。
  - 當客戶端生成 `SA02m` 時，試圖裝載 `MOC_a`，引擎判定型號不合印出 `Small Cannot use Map_PC01.MOC_a`，導致 `BringUp` 找不到 `ThirdPersonActor`，武器完全未掛載。
  - 此完全解釋了使用者回報的四項現象：(1) 機體外觀是 Raven 而非 Vanguard (2) 無法開火（無武器 Actor） (3) 無副武器 (4) 無推進器。
- ✅ 已修正 [DB/CODE]：
  - 資料庫 `items` 表已將 account 2 的 Mech 1 body 更新為 `11100101`（`SA01m` Vanguard）。
  - `database/db.js` 的 `starterLoadouts` 已將 8 台預設機體 body ID 全數更正為 `DefaultMech=0` 的一代機體（`11100101`, `12100101`, `13100101`, `14200101`, `15200101`, `16200101`, `17100101`, `18100101`）。
  - `room-game-user.sender.js` 補充 `DEFAULT_MECH_BODY` 映射作為 fallback，避免未查到裝備時回退至不合法的數字。
- 🟡 待驗證 [OBS] 使用者重測開局，觀察：
  - 機體是否變為 Vanguard (`SA01m`)
  - 畫面上是否掛載了武器與推進器
  - 左鍵是否可以正常開火、Shift 是否有推進器效果
  - client log 是否不再出現 `Cannot use Map_PC01.MOC_a`

## 實測驗證進展與武器型號真正根因（2026-09-16 21:35）

- ✅ 已確認 [SHOT] 實測截圖 `shots/shot-211936.png` 證實：
  - 機體外觀已正確恢復為 1 號機 Vanguard (`SA01m`)，防禦值為專屬的 280，機背掛載雙噴口推進器。
  - 右下角 HUD 顯示武器為「鷹式榴彈砲 / ANACONDA II (D)」，彈藥 006/0066。
  - 使用者回報：手上武器不是 1 號機武器，沒有副武器，沒有推進器，無法左鍵開火。
- ✅ 已確認 [LOG] 客戶端最新 `MetalRage.log` 仍然出現：
  - `ScriptLog: WeaponLog=== Small Cannot use Map_PC01.MOC_a`
  - `Warning: MOC_a Map_PC01.MOC_a (Function ZBase.W_DefaultWeapon.BringUp:00A5) Accessed None 'ThirdPersonActor'`
- ✅ 突破性發現 [CACHE.BIN/DLL]：
  - 反編譯 `Engine.dll` `UCacheManager::LoadAnotherFile_BD` 循序追蹤 37 個 Table 的載入：
    - Table 0: `FMapInfoRecord` (42 筆地圖)
    - Table 2: `FGameItemRecord` (2112 筆道具資訊，`ParseGameItemList`)
    - Table 4: `DefaultSetList` (32 筆官方配裝表，`ParseDefaultSetList`，stride 0x1C，7 個 int)
    - Table 6: `FSpecMechRecord` (16 筆機體規格，`ParseSpecMechList`)
    - Table 7: `FSpecWeaponMainRecord` (55 筆主武器規格，`ParseSpecWeaponMainList`)
    - Table 8: `FSpecWeaponSubRecord` (23 筆副武器規格，`ParseSpecWeaponSubList`)
    - Table 9: `FSpecBoosterRecord` (7 筆推進器規格，`ParseSpecBoosterList`)
    - Table 10: `FSpecSkinRecord` (塗裝規格，`ParseSpecSkinList`)
  - **核心根因 1：`MOC_a`（21100101）本來就不是 Small 機體的武器**：
    - `wid=21100101` 在 Table 7 名稱確實是「鷹式榴彈砲」（ANACONDA II），但它只能被 Medium/Heavy 機體裝備。
    - 輕型機體（Small / 1 號機 Vanguard `SA01m`）在執行 `W_DefaultWeapon.BringUp` 時會執行相容性檢查，判定為 Small 後印出 `Small Cannot use Map_PC01.MOC_a` 並拒絕掛載，因此手中沒有實體模型、也沒有註冊攻擊事件，**導致左鍵完全無法開火**！
  - **核心根因 2：Table 4（`DefaultSetList`）才是官方唯一指定的標準預設裝備表**：
    - 結構為：`[Mech, Level, Main, SubLeft, SubRight, Booster, Skin]`
    - **Mech 1 (11100101, SA01m Vanguard)**：
      - Main: `22100101` (`Zweapon.MOM_a` / 輕量型來福機槍) —— 這才是 1 號機真正的正版主武器！
      - SubLeft: `32100101` (`Zweapon.AOM_a` / 簡易機槍)
      - SubRight: `31100101` (`Zweapon.AOC_a` / 輕型主動式加農砲)
      - Booster: `41100101` (`Zweapon.BPE_a`)
      - Skin: `61101001`
    - **8 台一階機體官方 Table 4 權威清單**：
      1. `11100101` (Vanguard): Main `22100101`, SubLeft `32100101`, SubRight `31100101`, Booster `41100101`, Skin `61101001`
      2. `12100101` (Dual): Main `26300101`, SubLeft `32100101`, SubRight `31100101`, Booster `41100101`, Skin `61100101`
      3. `13100101` (劍虎): Main `21200101`, SubLeft `32100101`, SubRight `31100101`, Booster `41100101`, Skin `61101601`
      4. `14200101` (判官): Main `24100201`, SubLeft `32100101`, SubRight `31100101`, Booster `0`, Skin `61101201`
      5. `15200101` (聖戰士): Main `22200201`, SubLeft `32100101`, SubRight `31100101`, Booster `0`, Skin `61101301`
      6. `16200101` (雷霆): Main `25300101`, SubLeft `38500101`, SubRight `0`, Booster `43100101`, Skin `61101501`
      7. `17100101` (智多星): Main `28100101`, SubLeft `31100101`, SubRight `0`, Booster `42100101`, Skin `61101401`
      8. `18100101` (觀星者): Main `28300101`, SubLeft `39100101`, SubRight `31100101`, Booster `41100101`, Skin `61101101`
  - **核心根因 3：為什麼沒有副武器與推進器**：
    - 先前資料庫缺少 `part_slot=3`（SubRight），且把 SubRight 的 `31100101` 錯塞到 `part_slot=2`（SubLeft，應為 `32100101`），導致左右手副武器皆掛載失敗。
    - 推進器按鍵在 `OptionAll_Default.ini` 中為 `Key_Booster=16`（`Shift` 鍵），且機體若處於蹲伏/坐下狀態（`Key_SitDown=17`，`Ctrl` 鍵）時無法噴射。



## 2026-09-17 覆核：21:40–21:58 的實測結果，以及 ItemInfo 卡死的真正原因

### ✅ 武器掛載修正已生效
- ✅ 已確認 [SHOT] `shots/current-mission.png`（21:57）：Vanguard、DEFENSE 280，右下 HUD 主武器「輕型來福機槍」，彈藥 080/0720。
- ✅ 已確認 [LOG] 同一輪 `MetalRage.log` 不再出現 `Cannot use Map_PC01.MOC_a`。
- ⬜ 未確認 [OBS] 左鍵是否真的能開火、左右副武器是否掛上、Shift 推進器。截圖只證明主武器 actor 存在。

### ✅ Table 4（DefaultSetList）以獨立解析重新核對
- ✅ 已確認 [CACHE.BIN] 在 `Cache.Bin` file offset `0x37456` 起，32 筆、stride 0x1C、7 個 LE int32。前一段記錄的 8 台一代機配裝**逐筆相符**。另有 8 台二代機（`11200101`…`18200101`），主副武器與推進器和對應一代機相同，只有塗裝不同。
- ⚠️ 更正 [CACHE.BIN] 第二欄先前稱為 `Level`，實際每台機體都只有 1、2 兩筆，其餘欄位完全相同。語意未知（有可能對應 pilot 101/102，屬**猜測**）。
- ⚠️ 不一致 [DB] Table 4 中 4 號機（判官）、5 號機（聖戰士）的 Booster 是 0，6、7 號機的 SubRight 是 0；但 `db.js` 的 `starterLoadouts` 和目前 account 2 的資料都給 4、5 號機推進器（`41100101`／`41200101`）。是否會造成掛載問題**未測**。
- ⚠️ 降級 [LOG] 前文「MOC_a 是 Medium/Heavy 專用」只有 `Small Cannot use` 這行 log 支持，能確定的只有 Small 不能裝。改為 🟡 假設。
- ⚠️ 降級 前文「根因 3：缺 slot 3 導致副武器掛載失敗」未經驗證。`Game_User_SN` 在 DB 沒有 slot 3 時會用 Table 4 的 `31100101` 補上，所以 slot 3 缺不缺未必是原因。改為 🟡 假設。

### ✅ 21:46 登入卡住的原因：客戶端拒收超過 0x400 bytes 的 frame
- 背景：commit `9b1ce3c` 讓 ItemInfo 帶 slot 3／5，共 36 筆（body 1280 bytes，整個 frame 1296 bytes）。`session-20260916-214146.jsonl` 裡客戶端收到後完全不前進：沒有連 30907，只剩 keepalive，約 40 秒後斷線，重登一次結果相同。之後 commit `5627c5b` 把配裝縮回 slot 1／2／4（24 筆、frame 864 bytes）就恢復正常。該 commit 把原因寫成「只允許 24 個標準槽位」。
- ✅ 已確認 [DLL] 客戶端 frame 驗證函式 `0x107f8e00`（接收迴圈 `0x107fa57a` 呼叫）解碼 header 後：
  ```
  0x107f8f93  mov ax, word ptr [edi+6]   ; 長度欄位，byteswap 成 BE
  0x107f8f9f  cmp eax, [esp+0x28]        ; > 目前已收 bytes → 失敗
  0x107f8fad  cmp eax, 0x400             ; > 1024 → 失敗
  0x107f8fb2  ja  0x107f9085
  ```
  失敗時接收迴圈直接跳出（`0x107fa581 je 0x107fa5f6`），資料留在緩衝區、永遠不被消化。這條連線上之後的所有封包也跟著卡住，與觀察到的現象完全一致。接收緩衝本身是 0x1000（`0x107f97b2 mov edi, 0x1000`），不是限制來源。
- ✅ 已確認 [LOG] 全部 31 個 session 中，伺服器送出的最大 frame 是 848 bytes body（ItemInfo 24 筆）。唯一超過 0x400 的就是 21:46 那兩次，也就是唯一卡住的兩次。
- 🟡 結論（強假設）：卡住的原因是**封包大小**，不是 slot 3／5 的內容。兩個變數在那次是一起改的，要單變數實測才能完全排除（見 `docs/next-test.md`）。
- ⚠️ 連帶疑點：`account.dispatch.js` 與 `gamelogin.dispatch.js` 註解說「body rows (part_slot=0) 放進 ItemInfo 會斷線」，這是 upstream `e01f1bb` 留下的，沒有紀錄。24 筆裝備加 8 筆本體＝32 筆＝frame 1142 bytes，同樣超過 0x400。**這條舊結論很可能也是同一個大小限制**，未驗證。
- 推論：ItemInfo 單包最多 28 筆（16 + 6 + 35×28 = 1002，補齊到 1008）。要送更多就必須分包。`ItemInfo_SN`（`0x107095c0`）逐筆呼叫 `Item_Add`，handler 本身沒有清空清單的動作，所以分包**可能**會累加。`Item_Add` 內部是否去重或清空未查。
- 🔧 [CODE] `client.js` 的 `send()` 遇到超過 0x400 bytes 的 frame 時，會在 console 印錯誤，並寫一個 `src: auto` marker。**送出的 bytes 完全沒變**，只是讓這類問題不再無聲無息。已用假 socket 離線驗證：1296 bytes 會觸發、864 bytes 不會。

### 🟡 `Assist_CN 0x00230121` 首次出現
- ✅ 已確認 [LOG] `session-20260916-215019.jsonl` 有兩段 Assist_CN 連發，每段緊接一個 `Death_CN`（type 3，環境死亡）：
  ```
  392.6s  00 00 02 00 04 01 50
  392.9s  00 00 02 00 04 01 3c
  393.6s  00 00 02 00 04 01 28
  394.6s  00 00 02 00 04 01 14
  394.9s  00 00 02 00 04 01 00   → 同一刻 Death_CN 0000020003000000000000
  ```
  第二段（460.7s）是從 0x28 開始，一樣遞減到 0 後死亡。
- ✅ 已確認 [DLL] `Assist_CN`（`0x107060eb`）的 body 是 `+0 u16`、`+2 u16`（用 `Game_User_Check` 檢查的 user index，這裡是 2＝自己）、`+4 u8 type`（原值 1–4 直接照送，其他值會重新對應）、`+5 u8`（參數為 1 時送 1，否則送 2）、`+6 u8` 數值。只有 host 且遊戲進行中才會送出。Ghidra 的參數名稱可能錯位，**以 offset 為準**。
- ✅ 已確認 [DLL] `Assist_SN`（`0x1070a425`）：status／error 必須都是 0，接著讀 `+0x0A u16 userA`、`+0x0C u16 userB`、`+0x11/+0x13` 與 `+0x15/+0x17` 兩組數值，分別呼叫 `Game_User_Assist_Set`。後者依 user key 找到 `[this+0x1034]` 表，把數值累加到分數與統計欄位。
- 🟡 [TEST] 目前的 handler（`lobby.dispatch.js` 的 case `0x00230121`，註解還寫著舊猜測「Lobby Leave」）回的是 6 bytes 的零 body。依上面的讀法，userA／userB 都是 0，只會對 key 為 0 的使用者加 0，**實際上沒有作用**，客戶端也沒有異常。
- 🟡 假設：數值每次減 20、減到 0 就死亡，看起來像某種倒數或耐久（例如離開戰區警告），不像一般的助攻計分。沒有對應的操作 marker，**未確認**。decompile 輸出存於 `docs/research/2026-09-17-assist/`。
