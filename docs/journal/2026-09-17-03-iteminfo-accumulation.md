# ItemInfo_SN 分包：不同 key 追加，相同 key 替換單筆

## 結論與範圍

- ✅ 已確認 [DLL] `ItemInfo_SN 0x00210111` **不會每包清空庫存**。通過物品檢查後，不同實例 key 追加；相同 key 移除舊的一筆，再把新的一筆加到尾端。關鍵：`0x10732616`、`0x1073262d`、`0x1073263e`。
- ✅ 已確認 [DLL] 這不是跨生命週期的保留保證：`Disconnect_Complete` 會呼叫 `Server_Data_Clear`，清掉同一份表；初始化與物件解構也會清理它。入口見下表。
- 本輪只有靜態 DLL 分析，沒有改程式、開服務或操作客戶端；測試 A／B 仍未做。Codex 高階核對組語，結論待 Claude 跨公司審查。

## 接手與證據

- 接手依序讀 `HANDOFF.md`、`state.md`、`INDEX.md` 最後 20 行，再搜尋本次 opcode；沒有讀凍結的舊台帳。
- ✅ 已確認 [DLL] 接手覆核：重跑 `ZDispatchGame`，`0x00230102` 為 `ChangeSlot_SN`；frame 上限仍是 `0x107f8fad cmp eax,0x400`，失敗在 `0x107fa581` 跳過消化資料的路徑。
- 分析檔案：安裝客戶端的 `data/System/ZNetwork.dll`，ImageBase `0x10700000`；SHA-256 `6b07758edf57adcce7c96adeccc015d7a30bb72ba67eb01ad8b84e3451cfea1b`。
- 另讀其匯入的 `Core.dll`，直接核對 `FArray::AddZeroed`、`Remove`、`Empty`，沒有只憑函式名稱推斷。
- 原始證據：[handler 與 Item_Add](../research/2026-09-17-iteminfo-accumulation/znetwork-assembly.txt)、[Core 增刪](../research/2026-09-17-iteminfo-accumulation/core-assembly.txt)、[生命週期](../research/2026-09-17-iteminfo-accumulation/lifecycle-assembly.txt)、[Core 清空](../research/2026-09-17-iteminfo-accumulation/core-empty-assembly.txt)。各檔保留 DLL hash、VA 與指令 bytes。
- dispatcher 重跑存檔：[Account](../research/2026-09-17-iteminfo-accumulation/account-dispatch-map.txt)。命令皆從 `Metal Rage Online Server/` 執行：`python3 tools/dispatch-map.py 0x107039db`；反組譯用 `tools/disasm.py at` 與 pefile／Capstone。

## 每包解析到實際寫入

| 層次 | 組語證據 | 判定 |
|---|---|---|
| 匯出入口 | `0x107095c0 jmp 0x107c4560` | 必須跳過 thunk |
| 場景閘門 | `Check` thunk `0x10704ff2` → `0x107c01d0`；`0x107c01e1 cmp [esp+4],2` | `GIsClient` 非零且場景 2 才啟用；handler 在 `0x107c4566` 檢查此旗標 |
| body 起點 | `0x107c45aa add esi,0x10` | 跳過 16-byte frame header |
| 本包筆數 | `0x107c45bf inc esi`；`0x107c45ca` 複製 1 byte；`0x107c45cf movzx edi,...` | count 是 body `+0x01` 的 u8 |
| 記錄起點／步長 | `0x107c45d7`、`0x107c45da` 再跳 5 bytes；`0x107c45e9 push 0x23`、`0x107c45f9 add esi,0x23` | body header 6 bytes，每筆 35 bytes |
| 每筆呼叫 | `0x107c467b call 0x10704840`；`0x107c4680 dec edi`、`0x107c4681 jne` | 一筆一次 `Item_Add`，沒有整包替換操作 |
| Item_Add 入口 | `0x10704840 jmp 0x10732450` | 實際入庫邏輯在本體 |

- ✅ 已確認 [DLL] body `+0x00` 雖被複製，沒有參與清空／追加分支；`+0x02..+0x05` 被跳過。count=0 在 `0x107c45df` 直接離開，**空 ItemInfo 也不會清庫**。
- ✅ 已確認 [DLL] stack 重新核算：記錄複製後、沒有暫時 push 時，rec 起點是 `esp+0x10`。`0x107c4673` 前已有 7 個參數入棧，因此 `[esp+0x2c]` 對回 rec `+0x00`，`0x107c4678` 把它作為 `Item_Add` 第一參數；rec `+0x04` 是第二參數。不能直接套舊 Ghidra 的 stack 變數名。
- ✅ 已確認 [DLL] 第一參數是實例 key，第二參數交給 `UCacheManager::GetGameItemRecord`（`0x107324cb`、`0x107324dd`；匯入 `0x1091ba5c`）。Cache 回傳記錄首欄為零（`0x1073250b`／`0x10732511`）或其 `+0x44` 欄為零（`0x107325a4`、`0x107325e7`／`0x107325f7`），就離開入庫路徑；這兩個 cache 欄位的完整語意未在本任務命名。

## 累加與同 key 替換

庫存是 `UZNetwork_DJ` 的 FArray：data=`this+0x81c`、Num=`this+0x820`、Max=`this+0x824`；記錄 stride `0x50`。✅ [DLL] `0x107325fd`、`0x10732610`、`0x1073261b`；Core 的 Num／Max 存取在 `0x10101f19`／`0x10101f1c`。

1. ✅ [DLL] `0x10732616 cmp [ecx],edi` 以記錄第一個 int 比實例 key；不以 item code 去重。
2. ✅ [DLL] 找到同 key 才走 `0x10732624 push 1`、`0x10732626 push eax`、`0x1073262d call 0x10702766`。helper `0x107311a3`／`0x107311a9` 呼叫 `FArray::Remove(index,1,0x50)`，只移除一筆。
3. ✅ [DLL] 無論是否找到，接著 `0x10732632 push 1`、`0x1073263a push 0x50`、`0x1073263e call [0x1091b8a0]`，對原表 `AddZeroed(0x50,1)`。
4. ✅ [DLL] Core `0x10101f19` 保留舊 Num；`0x10101f1f`／`0x10101f29` 令 Num 加 1；`0x10101f4f`／`0x10101f55` 只從舊尾端開始清零，`0x10101f7a` 回傳舊 Num 作為新索引。不是清掉整個陣列。
5. ✅ [DLL] `0x1073264c` 將 key 寫入新列 `+0x00`，`0x10732658` 將第二參數寫入 `+0x04`，其後填其他物品屬性。

因此兩包各含有效且不同 key 的 A、B，結果包含 A 與 B；若第二包重送 A 的 key，只替換 A，其他物品保留。若第二包的 cache 檢查失敗，連舊 A 都不會先刪，因為檢查位於移除之前。✅ [DLL] 上述分支順序；這是靜態控制流程結論，未做線上分包實測。

## 哪些路徑會清掉這份庫存

| 路徑 | 關鍵指令 | 能確認的範圍 |
|---|---|---|
| `Server_Data_Clear` thunk `0x107048d6` → `0x107292b0` | `0x107292b7 xor ebp,ebp`；`0x107293fb push ebp`；`0x107293fc lea ecx,[esi+0x81c]`；`0x10729402 push 0x50`；`0x1072940a call [0x1091b8b8]` | ✅ [DLL] `FArray::Empty(0x50,0)` 整庫清空；Core `0x10101fc9` 將 Num 設零 |
| 斷線完成 | `Disconnect_Complete` thunk `0x107034b8` → `0x10770a20`，`0x10770a64 call 0x107048d6` | ✅ [DLL] `GIsClient` 非零走此路徑；清庫後 `0x10770a8c push 0`、`0x10770aa2` 呼叫 `Scene_Change(0)` |
| Tick 處理斷線狀態 | `0x107aa6fe` 讀狀態；`0x107aa709` 清狀態；`0x107aa71a dec eax`、`0x107aa71b je 0x107aa7cc`；`0x107aa7ce call 0x107034b8` | ✅ [DLL] **舊值 1** 才呼叫斷線完成；底層關閉 socket 的 `0x107f94aa` 寫此值 1。舊值 2 是另一分支，不能混用 |
| 初始化 | `InitScript` thunk `0x10706be5` → `0x10728260`，`0x1072843a` 對 `this+0x81c` 呼叫相同 Empty | ✅ [DLL] `ZNetworkManager::Initialize` 本體 `0x107702c0` 在 `0x107702f3` 呼叫它；不是 ItemInfo 每包初始化 |
| 解構 | `~UZNetwork_DJ` thunk `0x10703814` → `0x10738d30`，`0x10738ff0`／`0x10738ffb` 清理此陣列 | ✅ [DLL] helper `0x107375e0` 在 `0x10737648` 移除全 Num 筆，`0x10737658` 解構 FArray |

- ✅ 已確認 [DLL] `Item_Delete`（`0x107328b0`）按 key 查找，`0x10732961`／`0x10732964` 只移除一筆。它不能作為「第二包清空庫存」的依據。
- ✅ 已確認 [DLL] `Game_Data_Clear`（`0x1072cbf0`）清的是戰鬥欄位與 `+0x1034`、`+0x1040`、`+0x104c` 等表，完整本體到 `0x1072cc7c` 沒有清 `+0x81c`。
- ✅ 已確認 [DLL] `Scene_Change` 本體 `0x10738910` 更新場景並呼叫 `Dispatch_Check`，沒有直接清 `+0x81c`；這不等於所有場景轉換、其間接回呼或伴隨的斷線都保留庫存。
- 搜尋包含此表 offset 的組語引用、清空函式的直接 call／jmp xref、初始化／解構，以及上述場景相關函式。本 DLL 中 `Server_Data_Clear` 唯一直呼來自斷線完成（[xref](../research/2026-09-17-iteminfo-accumulation/server-clear-xrefs.txt)）；`InitScript` 唯一直呼來自 Initialize（[xref](../research/2026-09-17-iteminfo-accumulation/initscript-xrefs.txt)）。
- ⬜ 未知：外部 DLL／腳本的完整呼叫集合與各種重連實測時序；本輪沒有證明「任何其他封包／切場景都不可能間接清庫」，也沒有找到獨立的「清空 ItemInfo」SN。

## 測試 B 之後的實作含意（尚未實作）

- ✅ [DLL] 在同一次 Account 可收的場景 2 內，分包可以累加；全部 chunks 應在離開該階段前送完，不能依賴跨斷線保留。
- 每包 count 填該包筆數，沿用有效 item code／實例 key；重送相同 key 不會增加數量。庫存陣列並沒有「全局最多 28 筆」這個入庫條件。
- 單包仍須遵守 frame ≤ `0x400`，35-byte 記錄加 6-byte body header 時最多 28 筆；這只是分包設計依據，不取代 `next-test.md` 的 A／B 單變數實測。
