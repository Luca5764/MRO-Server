# ★★★ 對戰 opcode 全部定位完成 —— 而且不在 `0x25xxxx`

> 從 docs/opcode-ledger.md 第 680–737 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

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

