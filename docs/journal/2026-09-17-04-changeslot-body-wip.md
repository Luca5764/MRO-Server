# WIP：ChangeSlot_SN 0x00230102 的欄位與接收行為

## 停止點與證據等級

- 本篇依操作者收尾指示保存現有結果，**任務 2 尚未完整完成**；收到指示後不再讀 DLL、不開新子 agent、不改程式。
- 已做到：Luna 整理 handler／setter 與搜尋結果；Codex 高階在收尾前核對主要欄位讀取、兩份表的寫入、成功分支及失敗事件呼叫。沒有實測。
- ✅ [DLL] 只用於本輪高階已核對的部分；🟡 為未獨立核對的子 agent 報告；⬜ 為仍缺證據。整篇仍待 Claude 跨公司審查。
- 背景：[槽位／出擊函式後續分析](2026-09-16-26-slot-sortie-function-followup-analysis.md)。舊文不是完整 body 定義，不能把未讀區域當成已知欄位。
- 來源為安裝客戶端 `data/System/ZNetwork.dll`；本輪已記錄 SHA-256：`6b07758edf57adcce7c96adeccc015d7a30bb72ba67eb01ad8b84e3451cfea1b`。
- 原始資料：[來源與限制](../research/2026-09-17-changeslot-wip/provenance.txt)、[handler](../research/2026-09-17-changeslot-wip/full-branches.txt)、[dispatcher](../research/2026-09-17-changeslot-wip/dispatcher.txt)、[高階既有查核摘錄](../research/2026-09-17-changeslot-wip/root-reviewed-excerpts.txt)。只搬存已存在的工具輸出，沒有重新分析。

## 入口與 body 基址

- ✅ [DLL] 高階接手時先重跑 `python3 tools/dispatch-map.py 0x1070139d`，確認 `0x00230102` 對應 `ZDispatchGame::ChangeSlot_SN`；dispatcher 本體 `0x107dbc50`，匯出 handler `0x107044c6` → `0x107db2f0`。
- ✅ [DLL] `0x107db328 mov ebx,[esp+0x0c]` 在兩個 push 後取的是第一參數 `Format*`。以下 body offset 均以 `ebx+0x10` 為零點，不把 frame header 算進 body。
- ✅ [DLL] handler 在 `0x107db2f3`／`0x107db2f6` 檢查 dispatcher 的 `this+4`；`ZDispatchGame::Check` 入口 `0x1070928c` → `0x107d4bf0`，`0x107d4bf0` 檢查場景 6。未啟用時只記 log 返回。

## 已觀察的完整讀取範圍（不是精確 wire 長度宣告）

| body offset | 型別／狀態 | 去向與作用 | 位址依據 |
|---|---|---|---|
| `+0x00..+0x01` | u16 LE，✅ [DLL] | status0；直接比較，不存入玩家表；非零走失敗分支 | `0x107db3a5 cmp word ptr [ebx+0x10],0`、`0x107db3aa` |
| `+0x02..+0x05` | u32 LE，✅ [DLL] | Result／status1；先送 log，再放 EAX 判零，不存入玩家表 | `0x107db389`、`0x107db3ac`、`0x107db3af`、`0x107db3b1`；log 字串 `0x1082b848` 稱 Result |
| `+0x06..+0x09` | 共 4 bytes；實際型別／欄位切分 ⬜ | handler 沒有讀取或持久化；語意未知，**不能命名為 padding／reserved** | 已讀 handler `0x107db2f0` 至 `0x107db444` 未見此範圍存取 |
| `+0x0A..+0x0B` | u16 LE，✅ [DLL] | UserIndex 零擴展到 EDI，作兩份表的查找 key；不是在此新增 user 記錄 | `0x107db336 movzx edi,word ptr [ebx+0x1a]`；`0x107db3b4`、`0x107db3c8` 傳入 setter |
| `+0x0C` | u8，✅ [DLL] | slotRaw 零擴展到 EAX，轉成 ESI；成功時存成下述兩個 int 欄位 | `0x107db32c`、`0x107db331`、`0x107db332`、`0x107db33a`；jump table `0x107db448` |
| `+0x0D` 之後 | ⬜ 是否存在其他欄位／填充未知 | 此 handler 沒有讀取；目前沒有 SN 建構子的精確長度證據 | 下節記錄搜尋範圍與限制 |

- ✅ [DLL] `slotRaw=1..7` → `selected=0..6`；其餘值（含 0、8、255）→ 7。`dec eax` 後 unsigned `ja` 判範圍，預設在 `0x107db371 mov esi,7`；七個分支在 `0x107db343`、`0x107db347`、`0x107db34e`、`0x107db355`、`0x107db35c`、`0x107db363`、`0x107db36a`。
- ✅ [DLL] status 之前就讀了 user／slot；所以不能假設失敗回應只需 6-byte EVENT_INFO。讀到 `+0x0C` 只證明至少要有 `0x0D` bytes 可讀，**不證明 body 精確長度為 13**。

## 成功分支與實際存放位置

成功條件是 status0、status1 都為零（`0x107db3a5` 至 `0x107db3b1`）。下列呼叫使用同一個 `UZNetwork_DJ` default object。✅ [DLL]

| 次序 | 呼叫與存放位置 | 關鍵位址 |
|---|---|---|
| 1 | `Game_Slot_Selected_Set(user,selected)`：在 `this+0x1040` 表按 row `+0x00` 查 user，stride `0xEC`，將 selected 以 int 寫到 row `+0x08` | 呼叫 `0x107db3c2`；thunk `0x10703a17` → `0x1072df10`；查找 `0x1072df30`、寫入 `0x1072df4f` |
| 2 | `Game_UserSocket_Selected_Set(user,selected)`：在 `this+0x104c` 表按 row `+0x00` 查 user，stride `0x68`，將 selected 以 int 寫到 row `+0x04` | 呼叫 `0x107db3d6`；thunk `0x10709818` → `0x1072e070`；查找 `0x1072e090`、寫入 `0x1072e0a9` |
| 3 | `Game_Item_InstantRespawn_Get(user)`：在 `this+0x1040` 同一列讀 `+0xE4`，找不到回 0 | 呼叫 `0x107db3e9`；thunk `0x1070a164` → `0x1072ddd0`；`0x1072ddd7 xor eax,eax`、`0x1072de0b` |
| 4 | 本機 host 檢查 `this+0xFAC` bit 0 | 呼叫 `0x107db3fd`；`Game_Host_Check` 本體 `0x1071a560`、`0x1071a566`；非 host 在 `0x107db404` 返回路徑 |
| 5 | host 且 instant 值為 0 → `Respawn_CN(user)`；非零 → `InstantRespawn_CN(user,instant)` | `0x107db406`、`0x107db40d`、`0x107db41b`；送出 opcode 寫入點為 `0x107d9731` 的 `0x00230103`、`0x107d9805` 的 `0x00230105` |

- ✅ [DLL] 兩個 setter 都只修改找到的既有記錄，找不到就返回；不會新增玩家、補建表或直接生成機體。第一份是 `Game_Item` 表，不要與 `this+0x1034` 的 `Game_User` 表混淆。
- 已核對的 setter 原始資料：[slot](../research/2026-09-17-changeslot-wip/slot-selected-storage.txt)、[socket](../research/2026-09-17-changeslot-wip/socket-selected-storage.txt)、[instant getter](../research/2026-09-17-changeslot-wip/instant-respawn-get.txt)。上述直接寫入部分為 ✅ [DLL]，不代表整條遊戲流程已測。

## 失敗分支：已有查核，腳本效果未查

- ✅ [DLL] 任一 status 非零時，不跑兩個 setter；`0x107db427`／`0x107db428`／`0x107db429` 推入 selected、user、UTF-16LE `"OBSERVER"`（`0x1082b8ac`），`0x107db43b` 呼叫 `Game_Action_Revive`（thunk `0x107047e6` → `0x1071a740`）。
- ✅ [DLL] 這個 callee 在 `0x1071a75e`／`0x1071a760` 先檢查 host；`0x1071a771` 以 `wcscmp` 比對 `"SUCCESS"`（`0x10814ea4`）。`"OBSERVER"` 走非 SUCCESS 路徑。
- ✅ [DLL] 當 Engine／level／Game 指標存在，`0x1071a88b` 經匯入 `0x1091ba68` 呼叫 `AGameInfo::eventSelectUnitSlotFailed_BD(user,FString("OBSERVER"))`。失敗路徑不使用 selected 參數；這不只是一般錯誤 log。
- ⬜ 後面的腳本／UI 會呈現什麼、是否實際切觀察者尚未確認；僅讀到 Engine wrapper `0x1033ca60` 及其 `0x1033cac1` 間接事件呼叫，不宣稱看到畫面效果。[既有 callee 輸出](../research/2026-09-17-changeslot-wip/error-callee.txt)

## 未完成項與後續契約

- 🟡 待審：Luna 回報掃描 ZNetwork.dll 全 PE sections 的 LE bytes `02 01 23 00`，只命中 `0x107dbd3d`（dispatcher 比較立即值）與 `0x1083ac78`（`.rdata` 資料）；Engine.dll 無命中。高階**沒有重做這個搜尋**，原始腳本未保存。[ZNetwork 結果](../research/2026-09-17-changeslot-wip/opcode-230102-byte-scan.txt)、[Engine 輸出](../research/2026-09-17-changeslot-wip/engine-opcode-scan.txt)
- ⬜ 未找到 SN 建構子、精確 frame／body 長度、`+0x06..+0x09` 的語意，以及 `+0x0D` 之後是否另有欄位。負搜尋結果不證明不存在建構子；不能拿 CN 的長度替代 SN。
- 後續實作注意（尚未實作）：應依以上 user／slot 位置與成功條件設計回應；不要把最小可讀長度當精確協定長度，也不要把未知 4 bytes 擅自解釋成零填充。此處僅保存分析含意，不變更測試 A／B 或 handler。
- **目標：** 由 Claude 審查目前證據，再決定是否繼續補齊完整結構。
- **範圍：** 本篇與既存 research；若續查，只針對未知長度／四個 bytes／失敗事件後續。
- **背景：** 已知欄位和入表位址已整理，但任務 2 以 wip 收尾。
- **限制：** 本輪停止；沒有操作者實測，不把靜態呼叫當成 UI 已驗證，不改 handler。
- **交付：** 後續審查／更正日誌；保留本篇的 wip 證據與未知標籤。
- **完成條件：** 逐欄核對與未知裁決完成後，才更新完整 body 結論；本篇不宣稱達成此條件。
