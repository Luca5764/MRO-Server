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
