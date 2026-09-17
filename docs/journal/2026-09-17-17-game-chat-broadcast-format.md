# G3 分析：遊戲內聊天廣播（Team、All、Clan）格式與組語核對（待審）

原始組語與 decompile：`docs/research/2026-09-17-backlog/G3/`（`Chat_Game_asm.txt`、`Chat_Clan_asm.txt`、`Community_Chat_Add_asm.txt`）。

## 1. 聊天格式原理（字串編碼、空白切割、HUD 顯示）

1. 🟡 **格式樣板**：客戶端在 `0x107355a0`（`execCommunity_Chat`）使用字串樣板 `0x10815b7c` `"%s  %s"`（注意為**兩個空白**）：
   - 第一個 `%s` = 發話者暱稱（`Account_Name`）
   - 中間兩個空白
   - 第二個 `%s` = 聊天文字（文字在台灣客戶端經 `winToANSI` 轉為 Big5/CP950，其餘位元組補 0）
2. 🟡 **接收端切割**：客戶端接收端在 `0x10734770`（`UZNetwork_DJ::Community_Chat_Add`）呼叫 `0x107280e0` 依空白切割三段：
   - Token 0（至第 1 個空白）= `SendUser`（發話者暱稱）
   - Token 1（第 1 與第 2 空白之間）= `RecvUser`（廣播聊天此處為空）
   - Token 2（第 2 個空白之後的整行剩餘）= `Message`（聊天訊息）
3. 🟡 **HUD 繪製**：`DefaultHud.uc:1129-1140` 依 `CHAT_INFO.Type` 呼叫 `AddTextMessage_BD(SendUser, Message, SayMessagePlus/TeamSayMessagePlus)`，將文字印在畫面上。

## 2. 頻道封包對照表（客戶端送出 vs 伺服器應廣播）

| 頻道 | 方向 | Opcode | 總長／Body 長 | Body 欄位與結構 | 組語位址與依據 |
|---|---|---|---|---|---|
| **All（全體）** | C→S (CN) | `0x00220509` | 0x112 / 258b | `+0x00` u16: 0<br>`+0x02` ANSI: `"<Nick>  <Msg>\0"` | `0x107d2000`（`Chat_Game_All_CN`） |
| **All（全體）** | S→C (SN) | `0x00220509` | 0x112 / 258b | `+0x00` u16: 0（未讀）<br>`+0x02` ANSI: `"<Nick>  <Msg>\0"` | `0x107cf9a0`（`Chat_Game_All_SN`），轉 Unicode 後傳入 `Community_Chat_Add(1, ...)` |
| **Team（隊伍）** | C→S (CN) | `0x00220507` | 0x112 / 258b | `+0x00` u16: 0<br>`+0x02` ANSI: `"<Nick>  <Msg>\0"` | `0x107d2100`（`Chat_Game_Team_CN`） |
| **Team（隊伍）** | S→C (SN) | `0x00220507` | 0x112 / 258b | `+0x00` u16: 0（未讀）<br>`+0x02` ANSI: `"<Nick>  <Msg>\0"` | `0x107cfac0`（`Chat_Game_Team_SN`），轉 Unicode 後傳入 `Community_Chat_Add(2, ...)` |
| **Clan（公會）** | C→S (CN) | `0x00360601` | 0x114 / 260b | `+0x00` u32: 0 (一般) / 1 (管理員)<br>`+0x04` ANSI: `"<Nick>  <Msg>\0"` | `0x107d2200`（`Chat_Clan_All_CN`） |
| **Clan（公會）** | S→C (SN) | `0x00360602` | ≥ 0x11D / 285b | `+0x00` u32: 0 (一般) / 1 (管理員)<br>`+0x04..+0x1C`: 25b（未讀保留）<br>`+0x1D` ANSI: `"<Nick>  <Msg>\0"` | `0x107cfbe0`（`Chat_Clan_All_SN`），`0x107cfc48` 從 `+0x1d` 讀文字傳入 `Community_Chat_Add(4/5, ...)` |

## 3. 頻道分類與大廳／房間聊天關聯（待審）

1. 🟡 **同類 opcode 對稱性**：
   - 頻道大廳聊天：C→S `0x00220501`（`Chat_Channel_All_CN`）與 S→C `0x00220501`（`Chat_Channel_All_SN 0x107cf640`）。
   - 等候室全體聊天：C→S `0x00220505`（`Chat_Room_All_CN`）與 S→C `0x00220505`（`Chat_Room_All_SN 0x107cf760`）。
   - 等候室隊伍聊天：C→S `0x00220503`（`Chat_Room_Team_CN`）與 S→C `0x00220503`（`Chat_Room_Team_SN`）。
   - 遊戲內全體與隊伍聊天（`0x00220509`、`0x00220507`）完全遵循此「CN 與 SN 共用同一個 opcode」之對稱設計。
2. 🟡 **密語格式**：
   - 私聊（`/w`）在 `0x10735d3e` 使用樣板 `0x10815aec` `"%s %s %s"`（發話者、目標、訊息），由 `Whisper_User_CQ 0x00220511` 送出，伺服器應回 `Whisper_User_SA 0x00220512`（確認）與 `Whisper_User_SN 0x00220513`（轉發給目標）。

## 4. 伺服器目前問題與建議修改（待審）

1. 🟡 **現有 bug 原因**：
   - 伺服器收到 `0x00220507`／`0x00220509` 時，曾推測回 `0x00220508`／`0x0022050a`（16 bytes 空包）。但客戶端**根本沒有**這兩個 handler，封包直接被靜默忽略。
   - 伺服器收到 `0x00360601` 時回了 16 bytes 的 `0x00360602`，但 `Chat_Clan_All_SN` 的文字起點在 `body + 0x1d`（第 29 位元組），16 bytes 空包讀不到任何字串。
2. 🟡 **長度與編碼約束**：
   - 整包長度（274 bytes / 301 bytes）遠小於客戶端上限 1024 bytes（`0x400`），安全無虞。
   - 文字為 ANSI（Big5/CP950），伺服器可直接做 buffer pass-through 廣播，不需重新轉碼。
3. 🟡 **建議伺服器行為**：
   - **All 頻道**：收到 `0x00220509` 後，以同一個 opcode `0x00220509` 與相同 body（258 bytes）廣播給同房間內所有客戶端。
   - **Team 頻道**：收到 `0x00220507` 後，以同一個 opcode `0x00220507` 與相同 body（258 bytes）廣播給同隊所有客戶端。
   - **Clan 頻道**：收到 `0x00360601` 後，轉發 `0x00360602`，注意 body 前 4 bytes 保留 mode（0 或 1），中間 25 bytes 補 0，文字自 `+0x1D` 起填入。
