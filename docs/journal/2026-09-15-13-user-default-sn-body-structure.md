# 🟡 `0x00220233` User_Default_SN — body 結構（反組譯，欄位錯位已修）

> 從 docs/opcode-ledger.md 第 552–593 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

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

