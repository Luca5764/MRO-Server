opcode 逐一盤點（供 docs/state.md 遷移用的原始整理，不做裁決）
====================================================================

## 這份檔案是什麼

任務契約要求「只整理、不裁決」：把 `docs/opcode-ledger.md`、`docs/client-dispatch-map.md`、
`docs/HANDOFF.md` 與 `Metal Rage Online Server/dispatch/*.js`（含 `dispatch/room/*.js`）
裡出現過的每一個 opcode 的說法原樣列出，並標出彼此不一致的地方。**沒有任何一列是我下的結論**，
狀態符號、名稱、摘要全部照原文轉述並附行號，供主力回查後自行判定寫進 `docs/state.md` 的內容。

**讀取版本聲明：** 讀取當下 `docs/opcode-ledger.md` 共 **1781 行**，`head -5` 確認第 1 行為
`# Opcode 台帳`，**沒有**任何凍結說明（frozen notice）插入。以下所有 `docs/opcode-ledger.md:<行號>`
引用皆以此未凍結版本的原始行號為準。若你讀到的版本開頭多了 2–3 行凍結說明，下方引用的行號要整體
**加 2～3** 才能對上。

**涵蓋範圍：**
- `docs/opcode-ledger.md`（全 1781 行，分段讀完）
- `docs/client-dispatch-map.md`（273 筆 server→client 映射，2026-09-15 由 `tools/dispatch-map.py` 產生，全文讀完）
- `docs/HANDOFF.md`（224 行，全文讀完）
- `Metal Rage Online Server/dispatch/*.js` 與 `dispatch/room/*.js`：grep `case 0x...`／常數定義／`0x00......` 字面值，逐一核對送出與接收的 opcode

**表格產生方式：** 先用 script 把三個來源的 opcode 逐一取交集/聯集（依 8 位小寫十六進位正規化，
6 位與 8 位視為同一個），機械化產生骨架列；再手動針對台帳裡有實際敘述（body 結構、崩潰史、
狀態修正史）的 ~140 個 opcode 補上完整的多來源摘要與矛盾標註。**僅出現在 `client-dispatch-map.md`
的 ~200 個 opcode**（工具模擬客戶端 dispatcher 得出，但台帳與程式碼都沒有討論或實作）維持精簡列法，
註明「僅見於 client-dispatch-map.md」，不代表它們不重要，只代表目前沒有更多材料可轉述。

排除的雜訊（不是真正的 opcode，已從表格移除，僅在此說明以免誤會）：
- `0x0011497c`／`0x00114a50`／`0x00114b34`：`docs/opcode-ledger.md:456-458` 提到的是 **DLL 檔案偏移**（travel URL 格式字串位址），不是封包 opcode，只是正規化成 8 位後恰好落在 `0x11xxxx` 命名空間而被誤抓。
- `0x00230000`／`0x00240000`／`0x00ff0000`：程式碼裡 `type & 0x00FF0000 !== 0x00230000` 這類**命名空間遮罩比較用的常數**，不是實際會出現在線路上的 opcode。
- `0x00020099`／`0x00250181`：`docs/opcode-ledger.md:1377-1378` 表格裡用來測試「系統層誤攔」bug 的**合成測試值**，非真實協定 opcode。
- `0x00250000`：`dispatch/game.dispatch.js:26` 的命名空間遮罩常數（`(type & 0x00FF0000) !== 0x00250000`），非實際 opcode；相關矛盾見下方「矛盾清單」第一條。

---

## 1. Opcode 總表（依 opcode 由小到大排序，共 350 列）

| opcode | 各處出現過的名稱（附來源檔:行號） | 最新說法摘要（附檔:行號） | 台帳最新狀態符號 | 證據標籤（照原文） | 程式碼處理位置 |
|---|---|---|---|---|---|
| `0x00020080` | Handshake（`docs/opcode-ledger.md:27`） | 客戶端發起 handshake，client.js 系統層直接處理，不進 dispatch chain。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:27） | Metal Rage Online Server/client.js（系統層 onInternalMessage） |
| `0x00020081` | Handshake Response（docs/opcode-ledger.md:28） | body: secret(4)+elapsed(4)+saltBE(4)+saltLE(4)。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:28） | client.js |
| `0x00020082` | Time Sync（docs/opcode-ledger.md:29） | body 8 bytes；`start_` 由此設定，未設定前為 0（docs/opcode-ledger.md:1386 的崩潰成因）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:29,1386） | client.js（getLocalTime()） |
| `0x00020083` | Keep Alive（docs/opcode-ledger.md:30） | 約每 30 秒一次，4 bytes body。若早於 Time Sync 送達曾使 `writeUint32BE` 拋例外、打死整個 process（docs/opcode-ledger.md:1384-1401，已修）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:30,1384-1401,1659） | client.js |
| `0x00020084` | Acknowledge（docs/opcode-ledger.md:31） | 回覆 elapsed time。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:31） | client.js |
| `0x00110102` | `ZDispatchAccount::Login_Account_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00110114` | `ZDispatchAccount::Login_GameHi_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00110123` | `ZDispatchAccount::Login_Netmarble_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00110124` | CQ_LOGIN_AGAIN（docs/opcode-ledger.md:41）；`CQ_GAME_LOGIN`（gamelogin.dispatch.js:10） | 遊戲伺服器（30907）重新驗證請求。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:41） | dispatch/gamelogin.dispatch.js:10；dispatch/gamelogin.dispatch.js:7；dispatch/gate.dispatch.js:50 |
| `0x00110125` | SA_LOGIN_AGAIN（docs/opcode-ledger.md:42）／`Login_Again_SA`（docs/client-dispatch-map.md:21） | 對 0x00110124 的回應；與 client-dispatch-map 對照確認一致（docs/opcode-ledger.md:758）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:42,758） | dispatch/gamelogin.dispatch.js:11；dispatch/gamelogin.dispatch.js:7 |
| `0x00110131` | SN_WAIT（docs/opcode-ledger.md:43）／`Wait_SN`（docs/client-dispatch-map.md:22） | 登入序列中送出，語意未深究；client-dispatch-map 對照確認送法一致（docs/opcode-ledger.md:758）。 | 🟡 假設（台帳表格未升級，但 docs/opcode-ledger.md:758 已列為「經此確認一致」） | [OBS]（docs/opcode-ledger.md:43）；比對 [TEST]（docs/opcode-ledger.md:758） | 無 |
| `0x00110143` | `ZDispatchAccount::Login_GameYarou_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00110151` | CQ_LOGIN_WASABII（docs/opcode-ledger.md:39） | 客戶端登入請求；body 必須剛好 0x381 bytes（docs/opcode-ledger.md:163）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:39,163） | dispatch/account.dispatch.js:5 |
| `0x00110152` | SA_LOGIN_WASABII（docs/opcode-ledger.md:40）／`Login_Wasabii_SA`（docs/client-dispatch-map.md:24） | 無驗證一律成功，登入序列第一個封包（docs/opcode-ledger.md:149）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:40,149,758） | dispatch/account.dispatch.js:14 |
| `0x00110155` | `ZDispatchAccount::Login_NexonJapan_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x001101d2` | `ZDispatchAccount::Login_Member_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00210101` | SN_DEFAULT_INFO（docs/opcode-ledger.md:51）／`DefaultInfo_SN`（docs/client-dispatch-map.md:27） | 登入序列第 2 個封包，32 bytes（docs/opcode-ledger.md:150）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:51,150,758） | dispatch/gamelogin.dispatch.js:13 |
| `0x00210102` | SN_PLAY_INFO（docs/opcode-ledger.md:52）／`PlayInfo_SN`（docs/client-dispatch-map.md:28） | 登入序列第 3 個封包，32 bytes（docs/opcode-ledger.md:151）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:52,151） | dispatch/gamelogin.dispatch.js:125,298,376 |
| `0x00210103` | SN_RECORD_INFO（docs/opcode-ledger.md:53）／`RecordInfo_SN`（docs/client-dispatch-map.md:29） | 登入序列第 4 個封包，96 bytes（docs/opcode-ledger.md:152）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:53,152,758） | dispatch/gamelogin.dispatch.js:14 |
| `0x00210104` | SN_MECH_LEVEL（docs/opcode-ledger.md:54）／`MechLevel_SN`（docs/client-dispatch-map.md:30） | 8 個機體，240 bytes（docs/opcode-ledger.md:154）。**`docs/client-dispatch-map.md:31` 同一 opcode 另對應 `Reward_Record_Mech_SN`**（dispatch-map.md 自己註記「部分 handler 對應兩個 opcode，原因未明」，docs/client-dispatch-map.md:11）。 | ✅ 已確認（MechLevel_SN 部分） | [TEST]（docs/opcode-ledger.md:54,154） | dispatch/gamelogin.dispatch.js:15 |
| `0x00210105` | SN_RANK（docs/opcode-ledger.md:55）／`Rank_SN`（docs/client-dispatch-map.md:32） | 台帳稱「舊 prototype 有，現版本未使用」；client-dispatch-map 顯示客戶端確實有此 handler，兩者不衝突（未使用≠不存在）。 | 🟡 假設 | [DLL]（docs/opcode-ledger.md:55） | 無 |
| `0x00210111` | SN_ITEM_INFO（docs/opcode-ledger.md:56）／`ItemInfo_SN`（docs/client-dispatch-map.md:33） | 登入序列第 9 個封包，早期為 848 bytes（docs/opcode-ledger.md:157）。**重大**：客戶端拒收整包 >0x400 bytes 的 frame（docs/opcode-ledger.md:1752-1766），36 筆記錄=1296 bytes 造成登入卡死，已縮回 24 筆。 | ✅ 已確認（存在）／⚠️ 卡死成因已定位 | [TEST]（docs/opcode-ledger.md:56,157）；[DLL]（docs/opcode-ledger.md:1754-1761 frame 驗證函式 0x107f8e00） | dispatch/gamelogin.dispatch.js:183,335,395 |
| `0x00210112` | SN_EXPIRATION_ITEM（docs/opcode-ledger.md:57）／`ExpirationItem_SN`（docs/client-dispatch-map.md:34） |  | ✅ 已確認 | [DLL]（docs/opcode-ledger.md:57,758） | 無 |
| `0x00210113` | SN_WEAR_INFO（docs/opcode-ledger.md:58）／`WearInfo_SN`（docs/client-dispatch-map.md:35） | **重大修正**：每組裝備第二個 u32 必須是 ItemInfo 的物品實例 key（非 item code），原本欄位順序 `[uniqueKey, itemIndex]` 是錯的，已改 `[itemIndex, uniqueKey]`（docs/opcode-ledger.md:1607-1621），配對由 0→24。 | ✅ 已確認（結構）／🟡 待完整實測是否解決選機體 UI | [DLL]（docs/opcode-ledger.md:1609-1611）；[TEST]（docs/opcode-ledger.md:1615,1619） | dispatch/gamelogin.dispatch.js:17；dispatch/room.dispatch.js:76 |
| `0x00210115` | SN_MAP_INFO（docs/opcode-ledger.md:59）／`MapInfo_SN`（docs/client-dispatch-map.md:36） | 登入序列第 7 個封包，32 bytes（docs/opcode-ledger.md:155）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:59,155） | 無 |
| `0x00210121` | SN_COMPLETE（docs/opcode-ledger.md:60）／`Complete_SN`（docs/client-dispatch-map.md:37） | 登入序列第 11 個封包，256 bytes（docs/opcode-ledger.md:159）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:60,159） | dispatch/gamelogin.dispatch.js:18 |
| `0x00210122` | CQ_COMPLETE 候選 A（docs/opcode-ledger.md:61） | 四個候選中實際觸發哪一個尚未確認；dispatcher 只列 server→client，查不到候選是正常的（docs/opcode-ledger.md:769）。 | ⬜ 未知 | [GUESS]（docs/opcode-ledger.md:61,68,769） | 無 |
| `0x00210131` | CQ_COMPLETE 候選 B（docs/opcode-ledger.md:62） | 同上。 | ⬜ 未知 | [GUESS]（docs/opcode-ledger.md:62） | 無 |
| `0x00210132` | CQ_COMPLETE 候選 C（docs/opcode-ledger.md:63） | 同上。 | ⬜ 未知 | [GUESS]（docs/opcode-ledger.md:63） | 無 |
| `0x00210141` | CQ_COMPLETE 候選 D（docs/opcode-ledger.md:64） | 同上。 | ⬜ 未知 | [GUESS]（docs/opcode-ledger.md:64） | 無 |
| `0x00210201` | CQ_CREATE（docs/opcode-ledger.md:65） |  | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:65） | 無 |
| `0x00210202` | SA_CREATE（docs/opcode-ledger.md:66）／`Create_SA`（docs/client-dispatch-map.md:38） |  | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:66） | 無 |
| `0x00220101` | SN_SERVER_ADD（docs/opcode-ledger.md:76）／`Server_Add_SN`（docs/client-dispatch-map.md:39） | 登入序列第 12 個封包，224 bytes（docs/opcode-ledger.md:160）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:76,160,758） | dispatch/gate.game.dispatch.js:523 |
| `0x00220102` | SN_CHANNEL_ADD（docs/opcode-ledger.md:77）／`Channel_Add_SN`（docs/client-dispatch-map.md:40） | 登入序列第 13 個封包，64 bytes（docs/opcode-ledger.md:161）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:77,161） | dispatch/gate.game.dispatch.js:523 |
| `0x00220111` | 頻道進入（docs/opcode-ledger.md:78） | 由 `ZGameLoginDispatch`（gamelogin.dispatch.js）攔截，必須排在 `ZGateGameDispatch` 前面，見 CLAUDE.md 架構節。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:78） | dispatch/gamelogin.dispatch.js:42,55；dispatch/gate.game.dispatch.js:523（排除用） |
| `0x00220112` | （docs/opcode-ledger.md:205「各自的SA」） | 頻道進入的 SA；gamelogin.dispatch.js 用於 channel-enter ACK。 | ⬜ 未知（僅觀察到 S→C 16 bytes） | [OBS]（docs/opcode-ledger.md:205） | dispatch/gamelogin.dispatch.js:422 |
| `0x00220113` | `ZDispatchLobby::User_Add_SN;ZDispatchRoom::Invite_User_Default_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220115` | `ZDispatchLobby::Leave_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220116` | `ZDispatchLobby::User_Delete_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220121` | （無台帳正式名稱） | code 端猜測為玩家名稱查詢 CQ（Player lookup），以 25-byte ASCII 姓名為 body，回應 0x00220122。 | ⬜ 未知（僅程式碼猜測） | [GUESS]（gate.game.dispatch.js:695-702，無台帳依據） | dispatch/gate.game.dispatch.js:695；dispatch/gate.game.dispatch.js:9 |
| `0x00220122` | `Search_User_SA`（docs/client-dispatch-map.md:45） | client-dispatch-map 確認為 Search_User_SA；與 code 對 0x00220121 的回應（型別 EVENT_INFO）吻合方向，但 code 未採用該名稱。 | ⬜ 未知（名稱來自 dispatch-map，未經行為驗證） | [DLL]（docs/client-dispatch-map.md:45） | dispatch/gate.game.dispatch.js:700 |
| `0x00220131` | CQ_LEAVE（docs/opcode-ledger.md:79） |  | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:79） | 無 |
| `0x00220132` | SA_LEAVE（docs/opcode-ledger.md:80）／`Leave_SA`（docs/client-dispatch-map.md:43，Lobby） |  | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:80） | 無 |
| `0x00220141` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/gate.game.dispatch.js:10 |
| `0x00220142` | `ZDispatchLobby::Request_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220201` | 建房 CQ（docs/opcode-ledger.md:194）；`CQ_CREATE` | body 開頭範例 `02 10 63 1b 03 00 02 00 00 00 00 01 05 00 00 00`（PVP、roomType=2，docs/opcode-ledger.md:266）。 | ⬜ 未知（僅 body 起手位元組觀察） | [OBS]（docs/opcode-ledger.md:194,266,923） | dispatch/gate.game.dispatch.js:16 |
| `0x00220202` | 建房 SA（docs/opcode-ledger.md:194）／`Create_SA`（docs/client-dispatch-map.md:47，Lobby） |  | ⬜ 未知 | [OBS]（docs/opcode-ledger.md:194） | dispatch/gate.game.dispatch.js:17 |
| `0x00220203` | `Room_Default_SN`（docs/opcode-ledger.md:81） | body 0x021A bytes。修正 Map ID 後 mapIndex 觀察值為 9001（docs/opcode-ledger.md:518）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:81,518,758） | dispatch/room.dispatch.js:62；room-state.sender.js:1 |
| `0x00220204` | `ZDispatchLobby::Room_List_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220212` | `ZDispatchRoom::MaxUser_Change_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220213` | `Room_Boundary_SN`（docs/opcode-ledger.md:82） | max(1)+current(1)。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:82） | dispatch/room.dispatch.js:63；room-state.sender.js:2 |
| `0x00220214` | `Room_State_SN`（docs/opcode-ledger.md:83） | 2 bytes。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:83） | dispatch/room.dispatch.js:64；room-state.sender.js:3 |
| `0x00220215` | （無正式名稱） | code 端視為 Option_Change 的 CQ，回應 0x00220216。 | ⬜ 未知（僅程式碼推測） | [GUESS]（gate.game.dispatch.js:893-896） | dispatch/gate.game.dispatch.js:893 |
| `0x00220216` | `Option_Change_SA`（docs/client-dispatch-map.md:53） |  | ⬜ 未知 | [DLL]（docs/client-dispatch-map.md:53） | dispatch/gate.game.dispatch.js:896 |
| `0x00220217` | `Room_Option_SN`（docs/opcode-ledger.md:84） | 4 個 flag，bit 對應為靜態分析推得；經 dispatch-map 對照後列為「與客戶端一致」（docs/opcode-ledger.md:759,760）。 | 🟡 假設（台帳表格未正式升級為 ✅，但 docs/opcode-ledger.md:759-760 已列入一致清單） | [DLL]（docs/opcode-ledger.md:84）；[TEST]（docs/opcode-ledger.md:759） | dispatch/room.dispatch.js:65；room-state.sender.js:4 |
| `0x00220219` | `ZDispatchRoom::Name_Change_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x0022021a` | `Room_Name_SN`（docs/opcode-ledger.md:85） | UTF-16LE 字串，0x32 bytes。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:85,759） | dispatch/room.dispatch.js:66；room-state.sender.js:5 |
| `0x0022021c` | `ZDispatchRoom::Password_Change_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220221` | （無正式名稱） | code 端視為 Map_Change_One 的 CQ，回應 0x00220222。 | ⬜ 未知（僅程式碼推測） | [GUESS]（gate.game.dispatch.js:822-836） | dispatch/gate.game.dispatch.js:822 |
| `0x00220222` | `Map_Change_One_SA`（docs/client-dispatch-map.md:58） |  | ⬜ 未知 | [DLL]（docs/client-dispatch-map.md:58） | dispatch/gate.game.dispatch.js:836 |
| `0x00220223` | `Map_Change_One_SN`（docs/opcode-ledger.md:59） | 觀察值：選中 9001（docs/opcode-ledger.md:518）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:518） | dispatch/room/room-map.sender.js:18 |
| `0x00220225` | `ZDispatchRoom::Map_Change_All_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220226` | `Map_Change_All_SN`（docs/opcode-ledger.md:61） | **多次修正**：header 原多 4 bytes（推論記錄應從 body+0x02 起，docs/opcode-ledger.md:631-661），後經反組譯 `0x107ebab0` 完整確認（docs/opcode-ledger.md:773-802）：flag(1)+count(1)+每筆 9 bytes 記錄自 +0x02 起。`Event_Call(NETWORK_ROOM_INFO)` 在寫入房間資訊**之前**觸發，第一次送達時腳本讀到的是舊資料（docs/opcode-ledger.md:1035-1067），故改為連送兩次；連送後房間清單確實列出內容，但彈出視窗 `m_MapInfoList` 仍為 0/0（docs/opcode-ledger.md:1133-1139，資料來源不同，未解）。 | ✅ 已確認（body 結構）／⬜ 未知（為何 popup 清單仍空） | [TEST]（docs/opcode-ledger.md:631-661）；[DLL]（docs/opcode-ledger.md:773-802,1035-1067） | dispatch/room.dispatch.js:67；room-map.sender.js:17 |
| `0x0022022a` | `ZDispatchRoom::Rotate_Next_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220232` | `ZDispatchLobby::Enter_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220233` | `User_Default_SN`（docs/opcode-ledger.md:86） | **大量反組譯與修正**：body=2 bytes 標頭 + 每筆 0x34 記錄，欄位含 UserIndex/PilotID/等級/Hidden-Score/LevelType/StateRaw/TeamIndex/Rank/ClanID/暱稱（ASCII，非 UTF-16，docs/opcode-ledger.md:552-590）。暱稱先前誤判為寬字串。修正後房間內能看到玩家、房主提示曾一度出現（docs/opcode-ledger.md:594-616 揭露 roomMasterSent_ 需隨每次重建重送）。docs/opcode-ledger.md:1594-1596 確認 travel URL team 已從 255→0，但仍卡在「無選機體畫面」，故未升級到 ✅。 | 🟡 假設（結構反組譯已驗證存在性符號 7/7，惟客戶端最終行為仍未完全確認，docs/opcode-ledger.md:590） | [DLL]（docs/opcode-ledger.md:552-590）；[TEST]（docs/opcode-ledger.md:594-616,1594-1596） | dispatch/room.dispatch.js:70；room-user.sender.js:1 |
| `0x00220234` | （客戶端卡死觸發點，docs/opcode-ledger.md:195） | 房間內按「上一頁」送出，body 長度 0，伺服器原本不回應導致客戶端卡在 Loading 79 秒後重送（docs/opcode-ledger.md:270-291）。已上線實驗：回一個空 `EVENT_INFO`（opcode 0x00220235），客戶端恢復（docs/opcode-ledger.md:360-365）。此 opcode **不在** client-dispatch-map.md 的 273 筆映射中，代表模擬器未能定位其官方 handler。 | 🟡 假設（已知回應能讓客戶端前進，但語意/回應 opcode 是否正確仍未驗證，docs/opcode-ledger.md:364） | [OBS]（docs/opcode-ledger.md:195,270-291）；[TEST]（docs/opcode-ledger.md:360-365） | dispatch/gate.game.dispatch.js:857-886（`BACK_FROM_ROOM_SA_EXPERIMENT_MODE`）；⚠️ dispatch/room.dispatch.js 內另有 `sendLobbyBootstrapAfterRoomLeave()` 對「離開房間回大廳」情境改走 0x00230112/0x00230103，兩條路徑目的重疊但用不同 opcode，未整合 |
| `0x00220235` | （docs/opcode-ledger.md:285,362 的實驗回應 opcode） | 對 0x00220234 的空 EVENT_INFO 回應，是否為正確 opcode 尚未驗證（docs/opcode-ledger.md:364）。 | 🟡 假設（同 0x00220234） | [TEST]（docs/opcode-ledger.md:285,362-365） | dispatch/gate.game.dispatch.js:882 |
| `0x00220236` | `ZDispatchRoom::Leave_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220312` | `ZDispatchRoom::Team_Change_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220313` | `ZDispatchRoom::Team_Change_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220319` | `User_Master_SN`（docs/opcode-ledger.md:87） | body=uint16 userIndex+uint32 state。`Room_Master_Check`（0x10718D10）只比對兩個整數，我方送法「與此一致，無須修改」（docs/opcode-ledger.md:588）。必須隨每次房間狀態重建（`User_Default_SN`）一起重送，否則房主資訊被清掉（docs/opcode-ledger.md:594-616）；重送次數後降為 2 次以減少房主提示重複跳出（docs/opcode-ledger.md:884-897）。 | ✅ 已確認（送法正確）／🟡 房主體驗仍有殘留問題 | [DLL]（docs/opcode-ledger.md:588）；[TEST]（docs/opcode-ledger.md:594-616,884-897） | dispatch/room.dispatch.js:72；room-user.sender.js:3 |
| `0x00220338` | `ZDispatchRoom::Kickout_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220401` | `User_State_SN`（docs/opcode-ledger.md:88） |  | 🟡 假設 | [DLL]（docs/opcode-ledger.md:88） | dispatch/room.dispatch.js:71；room-user.sender.js:2 |
| `0x00220402` | `User_Pilot_SN`（docs/opcode-ledger.md:89） |  | 🟡 假設 | [DLL]（docs/opcode-ledger.md:89） | dispatch/room.dispatch.js:74；room-user.sender.js:5 |
| `0x00220411` | `ZDispatchRoom::User_Levelup_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220412` | `ZDispatchRoom::Reward_Record_User_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220421` | `User_Name_SN`（docs/opcode-ledger.md:90） | client-dispatch-map 同一 opcode 也對應到 Lobby 的 `User_Nick_Change_SN`（docs/client-dispatch-map.md:75，dual mapping）。 | 🟡 假設 | [DLL]（docs/opcode-ledger.md:90） | dispatch/room.dispatch.js:73；room-user.sender.js:4 |
| `0x00220501` | 大廳聊天（docs/opcode-ledger.md:179）／`Chat_Channel_All_SN`（docs/client-dispatch-map.md:77） | 觀察方向為 C到S 258 bytes（0x102）／S到C 16；dispatch-map 卻把此 opcode 定義為伺服器到客戶端的「All」廣播 SN，兩種描述方向不完全一致（詳見矛盾清單）。body 前 2 bytes 用途未明，之後為 Big5/cp950 字串。 | ✅ 已確認（能正常聊天） | [TEST]（docs/opcode-ledger.md:179-188） | 無 |
| `0x00220502` | 大廳聊天 SA（docs/opcode-ledger.md:205） |  | ⬜ 未知 | [OBS]（docs/opcode-ledger.md:205） | 無 |
| `0x00220503` | `ZDispatchCommunity::Chat_Room_Team_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220505` | 房間聊天（docs/opcode-ledger.md:180）／`Chat_Room_All_SN`（docs/client-dispatch-map.md:79） | body 結構與 0x00220501 完全相同，只有 opcode 不同。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:180-188） | 無 |
| `0x00220506` | 房間聊天 SA（docs/opcode-ledger.md:180 隱含） | **⚠️ client-dispatch-map.md 273 筆映射裡沒有 `0x00220506` 這個 opcode**（0501/0503/0505/0507/0509/0512/0513 都有，唯獨 0506 缺席）；台帳僅由「S→C 16 bytes」的觀察推得存在此回應。 | ⬜ 未知 | [OBS]（docs/opcode-ledger.md:180） | 無 |
| `0x00220507` | `ZDispatchCommunity::Chat_Game_Team_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220509` | `ZDispatchCommunity::Chat_Game_All_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220512` | `ZDispatchCommunity::Whisper_User_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00220513` | `ZDispatchCommunity::Whisper_User_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00221102` | `ZDispatchRoom::Invite_Open_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00221104` | `ZDispatchCommunity::Invite_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00221112` | `ZDispatchCommunity::Together_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00221211` | `ZDispatchCommunity::Option_Game_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00221221` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/gate.game.dispatch.js:11；dispatch/gate.game.dispatch.js:683 |
| `0x00221222` | `ZDispatchCommunity::Option_Game_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00221431` | `ZDispatchCommunity::Advertise_Clear_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00221432` | `ZDispatchCommunity::Advertise_Add_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00222101` | 按「準備」CQ（docs/opcode-ledger.md:530） | body `270a000001`，與按「開始」的 0x00222103（body `270a000000`）僅末位元組不同；客戶端沒有提供「開始」動作，F5 也是送 0x00222101（docs/opcode-ledger.md:530）。code 端另有 `case 0x00222101` 回 `sendOkSa(client, 0x00222102, 'Room_Enter_SN')`——**這個命名與 dispatch-map.md:91 的 `Game_Ready_SN` 矛盾**（見矛盾清單）。 | ✅ 已確認（存在，觸發時機） | [OBS]（docs/opcode-ledger.md:530） | dispatch/gate.game.dispatch.js:711-724 |
| `0x00222102` | `Game_Ready_SN`（dispatch-map.md:91，docs/opcode-ledger.md:1307） | **同一份程式碼內部命名矛盾**：`gate.game.dispatch.js:714` 稱其為「Room_Enter_SN」，但同檔案 `:760,802` 稱其為「Game_Ready_SN」（與 dispatch-map.md 一致）。opcode 數值本身沒有爭議，只有標籤不一致。 | ✅ 已確認 | [DLL]（dispatch-map.md:91）；[TEST]（docs/opcode-ledger.md:1307） | dispatch/gate.game.dispatch.js:714（標「Room_Enter_SN」）,760,802（標「Game_Ready_SN」） |
| `0x00222103` | F5／按下開始 CQ（docs/opcode-ledger.md:196,242,315,923） | `gameStarted_` 設定點之一（另一個是 0x00240301），見「狀態活不過重連」章節（docs/opcode-ledger.md:209-232）。伺服器驅動開戰流程的觸發點（docs/opcode-ledger.md:1264-1327）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:1264-1327） | dispatch/gate.game.dispatch.js:726-822 |
| `0x00222104` | `Game_Start_SN`（dispatch-map.md:92，docs/opcode-ledger.md:196,245,1307） |  | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:1307） | dispatch/gate.game.dispatch.js:761,804,810 |
| `0x00222111` | `Game_Info_SN`（docs/opcode-ledger.md:698,807-1000+） | **全台帳篇幅最大的單一 opcode**。body 結構經三輪反組譯確認（docs/opcode-ledger.md:824-841 asm 版本、docs/opcode-ledger.md:950-999 Ghidra 版本、docs/opcode-ledger.md:1471-1489 最終組語版本，三者互相校正）。已知有**兩個 handler**（依場景）：`ZDispatchWaiting::Game_Info_SN`（0x107f0910，scene 1，會清資料）與 `ZDispatchGame::Game_Info_SN`（0x107d4f50，scene 6，不清資料），台帳最初以為是「時機」問題，後定位為「場景」問題（docs/opcode-ledger.md:1187-1224），最終以「伺服器驅動」流程解決（docs/opcode-ledger.md:1262-1327，2026-09-16 首次成功進圖）。 | ✅ 已確認（body 結構與場景邏輯） | [DLL]（docs/opcode-ledger.md:950-999）；[TEST]（docs/opcode-ledger.md:1289-1327） | dispatch/gate.game.dispatch.js:242-301 |
| `0x00222112` | `Game_User_SN`（docs/opcode-ledger.md:699,805-880,1003-1031,1501-1547） | **opcode 本身曾長期送錯**（舊碼誤用 `0x00230111`，docs/opcode-ledger.md:699,865）。記錄大小 0x1E5 經組語驗證（docs/opcode-ledger.md:1539「0x6D+8×0x2F=0x1E5」）。曾因誤判「改對 opcode 後客戶端全白當機」而停用（docs/opcode-ledger.md:860-880），後證實是截圖判讀錯誤（只框到標題列），該次停用是誤判（docs/opcode-ledger.md:1071-1087 撤回）。 | ✅ 已確認（結構）／🟡 欄位語意仍有未驗證處 | [DLL]（docs/opcode-ledger.md:1003-1031,1501-1547）；[TEST]（docs/opcode-ledger.md:1594,1625） | dispatch/room/room-game-user.sender.js:11 |
| `0x00222114` | `Game_Score_SN`（dispatch-map.md:96） | 台帳待調查佇列項目之一：「定位 Game_Score_SN 需要的 body 結構」（docs/opcode-ledger.md:1409），至今未實作。 | ⬜ 未知（未實作） | [DLL]（dispatch-map.md:96） | 無 |
| `0x00222121` | `Team_Change_All_SN`（dispatch-map.md:97，雙 dispatcher：Game/Room） |  | ⬜ 未知（未實作） | [DLL]（dispatch-map.md:97-98） | 無 |
| `0x00222128` | `ZDispatchRoom::Rotate_Stop_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00222129` | `ZDispatchRoom::Rotate_Stop_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00222132` | `Leave_SA`（dispatch-map.md:101，Game） |  | ⬜ 未知（未實作） | [DLL]（dispatch-map.md:101） | 無 |
| `0x00222211` | `EndRound_SN`（dispatch-map.md:102） | CLAUDE.md 列為完全未實作的對戰 opcode之一。 | ⬜ 未知（未實作） | [DLL]（dispatch-map.md:102） | 無 |
| `0x00222212` | `EndQuater_SN`（dispatch-map.md:103） | 同上。 | ⬜ 未知（未實作） | [DLL]（dispatch-map.md:103） | 無 |
| `0x00222213` | `EndGame_SN`（dispatch-map.md:104） | 同上。 | ⬜ 未知（未實作） | [DLL]（dispatch-map.md:104） | 無 |
| `0x00222221` | `ZDispatchRoom::User_Score_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00222231` | `ZDispatchRoom::Reward_Levelup_User_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00222232` | `ZDispatchRoom::Reward_Levelup_Mech_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00222233` | `ZDispatchRoom::Reward_FirstReceiveExp_User_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00222312` | `ZDispatchCommunity::Report_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00223102` | `ZDispatchRoom::Matching_Start_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00223103` | `ZDispatchRoom::Matching_Complete_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00223104` | `ZDispatchRoom::Matching_List_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00223112` | `ZDispatchRoom::Matching_Cancel_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00223113` | `ZDispatchRoom::Matching_Cancel_Always_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00223115` | `ZDispatchRoom::Matching_Break_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00223116` | `ZDispatchRoom::Matching_Break_Always_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00230101` | `ChangeSlot_CN`（docs/opcode-ledger.md:1551-1555） | UnrealScript native `execGame_Slot`（0x10704278）直接呼叫 `ZDispatchGame::ChangeSlot_CN(a,b)`，玩家選機體按下去即觸發。**與 lobby.dispatch.js 的舊猜測「Possible Lobby Enter/Request CQ」矛盾**（見矛盾清單）。 | ✅ 已確認（DLL 呼叫鏈） | [DLL]（docs/opcode-ledger.md:1551-1555） | dispatch/lobby.dispatch.js:25（CQ_NAMESPACE 陣列），97-108（case，仍標註舊猜測） |
| `0x00230102` | `ChangeSlot_SN`（docs/client-dispatch-map.md:117） | body：+0x0A u16 user index、+0x0C u8 slot raw（1..7→0..6，其餘→7）；成功條件 body+0x00 u16 與 +0x02 u32 均為 0（docs/opcode-ledger.md:1603）。成功分支依 `Game_Item_InstantRespawn_Get` 決定送 `InstantRespawn_CN` 或 `Respawn_CN`（docs/opcode-ledger.md:1604）。**目前無 handler 主動送出這個結構**，lobby.dispatch.js case 0x00230101 只是照舊猜測回一個空 EVENT_INFO 到 0x00230102，欄位未必正確。 | ✅ 已確認（body 結構，DLL）／⬜ 未知（我方尚未依此結構實作） | [DLL]（docs/opcode-ledger.md:1603-1604） | dispatch/lobby.dispatch.js:102（送出，但依舊猜測而非新結構） |
| `0x00230103` | `Respawn_CN`（docs/opcode-ledger.md:1629,1631） | **經歷三次身分變更**：①台帳 2026-09-15 完整映射表（docs/opcode-ledger.md:707）曾稱為 `Respawn_SN`；②docs/opcode-ledger.md:1628 用 `tools/dispatch-map.py` 重新確認它**不是任何 server→client handler**（客戶端完全忽略）；③docs/opcode-ledger.md:1629,1631 更正為 `Respawn_CN`（client→server）。**lobby.dispatch.js 已依③正確處理**（收到後呼叫 sendRespawn）。**但 room.dispatch.js 的 `sendLobbyBootstrapAfterRoomLeave()` 仍把 0x00230103 當成「Lobby Room_List_SN」從伺服器送給客戶端**——這與③直接矛盾，是目前程式碼裡最明確的一處活的矛盾（見矛盾清單）。 | ✅ 已確認（Respawn_CN，DLL）／⚠️ 程式碼內部不一致 | [DLL]（docs/opcode-ledger.md:1628-1629,1631） | dispatch/lobby.dispatch.js:215-224（正確方向：接收）；dispatch/room.dispatch.js:242-248（矛盾方向：送出，標註「Room_List_SN」） |
| `0x00230104` | `Respawn_SN`（docs/opcode-ledger.md:1629,1631） | body: +0x00 u16 status、+0x02 u32 error、+0x0A u16 user index（docs/opcode-ledger.md:1627）。成功時用 `Game_User_SN` 已設的 selected slot，呼叫 `Game_Action_Revive("SUCCESS")` → `SelectUnitSlot_BD`（docs/opcode-ledger.md:1627）。**2026-09-16 首次成功生成並持有機體**即靠此封包（docs/opcode-ledger.md:1633-1637）。舊台帳完整映射表一度誤標為 `InstantRespawn_SN`（docs/opcode-ledger.md:708）。 | ✅ 已確認 | [DLL]（docs/opcode-ledger.md:1627,1631）；[TEST]（docs/opcode-ledger.md:1633-1637） | dispatch/lobby.dispatch.js:128-159,313-320；dispatch/room.dispatch.js（間接經 sendRespawn） |
| `0x00230105` | （僅出現於舊完整映射表） | 舊台帳 2026-09-15 完整映射表稱為 `Timeout_SN`（docs/opcode-ledger.md:709），與最終定案的 `Timeout_SN=0x00230112`（docs/opcode-ledger.md:1631, dispatch-map.md:120）不同，判定為舊表的系統性錯位（docs/opcode-ledger.md:1631 明文承認）。 | ❌ 已排除（該對應已被 docs/opcode-ledger.md:1631 更正） | [DLL]（docs/opcode-ledger.md:709→1631 更正） | dispatch/lobby.dispatch.js:25 |
| `0x00230106` | `Assist_SN`（docs/opcode-ledger.md:710，已被更正） | **任務範例矛盾**：台帳 2026-09-15 完整映射表第 710 行標為 `Assist_SN`；docs/opcode-ledger.md:1631 明文更正「最新工具輸出確認…`InstantRespawn_SN=0x230106`」，即真正的 InstantRespawn_SN。真正的 `Assist_SN` 是 `0x00230122`（dispatch-map.md:121，docs/opcode-ledger.md:1631,1779）。 | ❌ 已排除（Assist_SN 說法）／✅ 已確認（InstantRespawn_SN 說法，dispatch-map.md:119） | [DLL]（docs/opcode-ledger.md:710→1631 更正；dispatch-map.md:119） | dispatch/lobby.dispatch.js:26 |
| `0x00230107` | `Death_SN`（docs/opcode-ledger.md:711，「★★ 專案主要目標」，已被更正） | 舊完整映射表標為此，但**client-dispatch-map.md 當前 273 筆映射中完全沒有 `0x00230107` 這個條目**。真正的 `Death_SN` 是 `0x00230124`（dispatch-map.md:122，docs/opcode-ledger.md:1650-1654）。 | ❌ 已排除 | [DLL]（docs/opcode-ledger.md:711→1631,1650 更正） | dispatch/lobby.dispatch.js:26 |
| `0x00230108` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/lobby.dispatch.js:26 |
| `0x00230109` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/lobby.dispatch.js:26 |
| `0x0023010a` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/lobby.dispatch.js:26 |
| `0x00230111` | `Timeout_CN`（docs/opcode-ledger.md:1416-1430） | **多重矛盾的核心 opcode**：①docs/opcode-ledger.md:202 早期觀察記為「S→C 487 大廳」（實為我方舊碼誤用此 opcode 送 `Game_User_SN` 資料，見 docs/opcode-ledger.md:699,865-870）；②lobby.dispatch.js 的 code 註解猜為「Possible Lobby Enter/Request CQ」（line 70-95）；③docs/opcode-ledger.md:1341 稱其為「in-map 輪詢，非 Lobby Enter」；④docs/opcode-ledger.md:1416-1430 最終以 DLL 確認為 `ZDispatchGame::Timeout_CN`，送出前提為 scene 6 + `Game_Host_Check()` + `Game_Play_Check()`，即回合逾時通知（每分鐘的 TimeLimit 跑完後每秒送一次）。**code 至今未更新註解或行為**。 | ✅ 已確認（Timeout_CN，DLL）／⚠️ 與現行程式碼猜測矛盾 | [DLL]（docs/opcode-ledger.md:1416-1430） | dispatch/lobby.dispatch.js:70-95（仍標「Lobby Enter」猜測） |
| `0x00230112` | `Timeout_SN`（dispatch-map.md:120）；code 稱 `SA_LOBBY_ENTER` | **與 0x00230111 同一組矛盾**：dispatch-map.md 與 docs/opcode-ledger.md:1426 確認這是 `Timeout_SN`；但 gamelogin.dispatch.js 定義常數 `SA_LOBBY_ENTER = 0x00230112` 並在登入序列中無條件送出（lines 358,408,429），lobby.dispatch.js 也在猜測的「Lobby Enter」分支回送它。room.dispatch.js 的 `sendLobbyBootstrapAfterRoomLeave()` 同樣送它，標註「Lobby Enter SA」。 | ✅ 已確認（Timeout_SN，DLL）／⚠️ 與現行程式碼三處命名矛盾 | [DLL]（docs/opcode-ledger.md:1426；dispatch-map.md:120） | dispatch/gamelogin.dispatch.js:19,358,408,429；dispatch/lobby.dispatch.js:87；dispatch/room.dispatch.js:235（皆標「Lobby Enter」） |
| `0x00230114` | 舊表稱 `Capture_SN`（雙 opcode之一）（docs/opcode-ledger.md:713） | 僅見於 docs/opcode-ledger.md 2026-09-15 完整映射表，屬於「同一 handler 對應兩個 opcode」的第一個變體；dispatch-map.md 目前只列出第二個變體（見對應的 013x 條目），此變體未被工具重新驗證。 | ⬜ 未知（舊表未經最終工具覆核） | [DLL]（docs/opcode-ledger.md:713，未見於 dispatch-map.md 重新產生的清單） | 無 |
| `0x00230116` | 舊表稱 `Bomb_SN`（雙 opcode之一）（docs/opcode-ledger.md:714） | 僅見於 docs/opcode-ledger.md 2026-09-15 完整映射表，屬於「同一 handler 對應兩個 opcode」的第一個變體；dispatch-map.md 目前只列出第二個變體（見對應的 013x 條目），此變體未被工具重新驗證。 | ⬜ 未知（舊表未經最終工具覆核） | [DLL]（docs/opcode-ledger.md:714，未見於 dispatch-map.md 重新產生的清單） | 無 |
| `0x00230118` | 舊表稱 `Boss_SN`（雙 opcode之一）（docs/opcode-ledger.md:715） | 僅見於 docs/opcode-ledger.md 2026-09-15 完整映射表，屬於「同一 handler 對應兩個 opcode」的第一個變體；dispatch-map.md 目前只列出第二個變體（見對應的 013x 條目），此變體未被工具重新驗證。 | ⬜ 未知（舊表未經最終工具覆核） | [DLL]（docs/opcode-ledger.md:715，未見於 dispatch-map.md 重新產生的清單） | 無 |
| `0x0023011a` | 舊表稱 `Campaign_SN`（docs/opcode-ledger.md:716），與 `0x0023013a` 並列 | 我方已送對 `room-map.sender.js` 使用的是 `0x0023013a`（docs/opcode-ledger.md:716,758）。 | ⬜ 未知（此變體）／✅ 已確認（0x0023013a 變體） | [DLL]（docs/opcode-ledger.md:716） | 無 |
| `0x0023011c` | 舊表稱 `TwoBoss_SN`（docs/opcode-ledger.md:717） | 同上模式，未實作。 | ⬜ 未知 | [DLL]（docs/opcode-ledger.md:717） | 無 |
| `0x0023011e` | 舊表稱 `TriggerTouch_SN`（docs/opcode-ledger.md:718） | 同上模式，未實作。 | ⬜ 未知 | [DLL]（docs/opcode-ledger.md:718） | 無 |
| `0x0023011f` | 舊表稱 `Ready_Failed_SN`（docs/opcode-ledger.md:719），與 `0x00420112` 並列 | dispatch-map.md:282 確認 `0x00420112`=`Ready_Failed_SN`。 | ⬜ 未知（此變體） | [DLL]（docs/opcode-ledger.md:719） | 無 |
| `0x00230120` | 舊表稱 `Ready_Host_SQ`（docs/opcode-ledger.md:720），與 `0x00420113` 並列 | 我方已送對的是 `0x00420113`（docs/opcode-ledger.md:720,762）。 | ⬜ 未知（此變體）／✅ 已確認（0x00420113） | [DLL]（docs/opcode-ledger.md:720） | 無 |
| `0x00230121` | `Ready_Host_SN`（docs/opcode-ledger.md:721，舊表）→ 更正為 `Assist_CN`（docs/opcode-ledger.md:1631,1768-1781） | **核心矛盾**：舊完整映射表（docs/opcode-ledger.md:721）稱其對應 `0x00420114`／`Ready_Host_SN`；docs/opcode-ledger.md:1631 更正映射系統性錯位；docs/opcode-ledger.md:1768-1781 以 DLL（`0x107060eb`）確認 `Assist_CN` 的 body 結構（+0 u16、+2 u16 userIndex、+4 u8 type、+5 u8、+6 u8），且 2026-09-16 log 首次觀察到遞減數值序列（docs/opcode-ledger.md:1769-1777）。**`lobby.dispatch.js` 的 `case 0x00230121` 註解仍寫著「Lobby Leave」的舊猜測**（line 110-118），回應也只是空 body，與 Assist 的真正欄位無關。 | 🟡 假設（Assist_CN body 結構，DLL）／⚠️ 與現行程式碼命名矛盾 | [DLL]（docs/opcode-ledger.md:1768-1781） | dispatch/lobby.dispatch.js:110-118（仍標「Lobby Leave」） |
| `0x00230122` | `Assist_SN`（dispatch-map.md:121，docs/opcode-ledger.md:1631,1779） | status/error 須為 0，讀 +0x0A u16 userA、+0x0C u16 userB 等，呼叫 `Game_User_Assist_Set`（docs/opcode-ledger.md:1779）。目前 handler（lobby.dispatch.js case 0x00230121 的回應）只回全零 body，userA/userB 皆為 0，「實際上沒有作用」（docs/opcode-ledger.md:1780）。 | 🟡 假設（body 結構，DLL）／❌ 目前送法沒有效果 | [DLL]（docs/opcode-ledger.md:1779-1780） | dispatch/lobby.dispatch.js:116（回應，但欄位皆零） |
| `0x00230123` | `HostChange_SN`（docs/opcode-ledger.md:723，舊表）→ 更正為 `Death_CN`（docs/opcode-ledger.md:1650-1654） | **同類矛盾**：舊表稱其對應 `0x00420116`／`HostChange_SN`（docs/opcode-ledger.md:723）；最終定案為 `Death_CN`，body: attacker u16、victim u16、death type u8、flag u8、part u8、u32（docs/opcode-ledger.md:1650）。lobby.dispatch.js 目前已依 Death_CN 正確處理（非舊猜測），這裡的矛盾僅存在於「已被取代的舊表」與「現行程式碼」之間，程式碼本身已跟上。 | ✅ 已確認（Death_CN，DLL+TEST，docs/opcode-ledger.md:1650-1654） | [DLL]（docs/opcode-ledger.md:1650）；[TEST]（docs/opcode-ledger.md:1653） | dispatch/lobby.dispatch.js:172-207（已依新結構實作） |
| `0x00230124` | `Leave_SN`（docs/opcode-ledger.md:724，舊表）→ 更正為 `Death_SN`（docs/opcode-ledger.md:1631,1650-1654） | dispatch-map.md:122 確認為 `Death_SN`。body: +0x00 status、+0x02 error、+0x0A attacker、+0x0C victim、+0x0E death type（docs/opcode-ledger.md:1651）。2026-09-16 實測死亡→重生流程成功（docs/opcode-ledger.md:1653，使用者確認「有重生了」）。 | ✅ 已確認 | [DLL]（docs/opcode-ledger.md:1651）；[TEST]（docs/opcode-ledger.md:1653） | dispatch/lobby.dispatch.js:184-207 |
| `0x00230126` | 舊表稱 `Special_SN`（docs/opcode-ledger.md:725） | dispatch-map.md:123 同樣列為 `Special_SN`，無變動。 | ⬜ 未知（未實作） | [DLL]（docs/opcode-ledger.md:725；dispatch-map.md:123） | 無 |
| `0x00230131` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/lobby.dispatch.js:227；dispatch/lobby.dispatch.js:27 |
| `0x00230132` | `Capture_SN`（dispatch-map.md:124） | 舊表另有變體 `0x00230112`（誤，實為 Timeout_SN；docs/opcode-ledger.md:712 寫的是 0x00230112/0x00230132 並列，經核對 0x00230112 其實是 Timeout_SN，非 Capture_SN 的另一變體——舊表此處的「雙 opcode」很可能是誤植）。 | ⬜ 未知（未實作；舊表「雙 opcode」列法可疑） | [DLL]（dispatch-map.md:124；docs/opcode-ledger.md:712 存疑） | dispatch/lobby.dispatch.js:250；dispatch/lobby.dispatch.js:28 |
| `0x00230134` | `Conquest_SN`（dispatch-map.md:125） |  | ⬜ 未知（未實作） | [DLL]（dispatch-map.md:125） | 無 |
| `0x00230136` | `Bomb_SN`（dispatch-map.md:126） |  | ⬜ 未知（未實作） | [DLL]（dispatch-map.md:126） | 無 |
| `0x00230138` | `Boss_SN`（dispatch-map.md:127） |  | ⬜ 未知（未實作） | [DLL]（dispatch-map.md:127） | 無 |
| `0x0023013a` | `Campaign_SN`（dispatch-map.md:128，docs/opcode-ledger.md:716,758,762） | 我方已送對（room-map.sender.js）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:716,758,762） | dispatch/room.dispatch.js:69；room-map.sender.js:19 |
| `0x0023013c` | `TwoBoss_SN`（dispatch-map.md:129） |  | ⬜ 未知（未實作） | [DLL]（dispatch-map.md:129） | 無 |
| `0x0023013e` | `TriggerTouch_SN`（dispatch-map.md:130） |  | ⬜ 未知（未實作） | [DLL]（dispatch-map.md:130） | 無 |
| `0x00230141` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/lobby.dispatch.js:268；dispatch/lobby.dispatch.js:28 |
| `0x00230142` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/lobby.dispatch.js:271；dispatch/lobby.dispatch.js:28 |
| `0x00230143` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/lobby.dispatch.js:28 |
| `0x00230144` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/lobby.dispatch.js:28 |
| `0x00230145` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/lobby.dispatch.js:29 |
| `0x00230146` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/lobby.dispatch.js:29 |
| `0x00230147` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/lobby.dispatch.js:29 |
| `0x00230148` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/lobby.dispatch.js:29 |
| `0x00230149` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/lobby.dispatch.js:29 |
| `0x0023014a` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/lobby.dispatch.js:30 |
| `0x00230151` | `BeginRound_CN`（docs/opcode-ledger.md:1423,1636） | scene 6 條件下客戶端送出，4-byte body（docs/opcode-ledger.md:1423）。2026-09-16 已觀察到客戶端主動送出（docs/opcode-ledger.md:1635）。 | ✅ 已確認 | [DLL]（docs/opcode-ledger.md:1423）；[TEST]（docs/opcode-ledger.md:1635） | dispatch/lobby.dispatch.js:128-159 |
| `0x00230152` | `BeginRound_SN`（dispatch-map.md:131，docs/opcode-ledger.md:726） | 僅呼叫 `Game_Play_Start`，不解析 body、不 spawn 機體（docs/opcode-ledger.md:1345）。我方一度誤送為 `0x00250301`（docs/opcode-ledger.md:726）。 | ✅ 已確認 | [DLL]（docs/opcode-ledger.md:1345）；[TEST]（docs/opcode-ledger.md:1635） | dispatch/lobby.dispatch.js:130-134；dispatch/room.dispatch.js:544-561 |
| `0x00240101` | （docs/opcode-ledger.md:197 觀察） | C→S/S→C 14 bytes，出現在房間情境；程式碼視為 Hangar Open 的 CQ。 | ⬜ 未知 | [OBS]（docs/opcode-ledger.md:197） | dispatch/room.dispatch.js:397-425 |
| `0x00240102` | `Open_SA`（dispatch-map.md:132） | 經此確認一致（docs/opcode-ledger.md:760）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:760） | dispatch/room.dispatch.js:400,419 |
| `0x00240103` | （無正式名稱） | code 端視為 Hangar Close 的 CQ。 | ⬜ 未知（僅程式碼） | [GUESS] | dispatch/room.dispatch.js:474 |
| `0x00240104` | `Close_SA`（dispatch-map.md:133） |  | ⬜ 未知 | [DLL]（dispatch-map.md:133） | dispatch/room.dispatch.js:479 |
| `0x00240106` | `ZDispatchHangar::Pilot_Change_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240107` | 商店（docs/opcode-ledger.md:198） | 每次出現後伺服器立刻回一整批 0x00240241/0x00240242；body 前 8 bytes 為兩個 uint32 LE（觀察值皆為 1,1）。後續確認為 `Slot_Change_CQ`（docs/opcode-ledger.md:1619）。 | ⬜ 未知（推測用途）→✅（docs/opcode-ledger.md:1619 命名為 Slot_Change_CQ） | [OBS]（docs/opcode-ledger.md:198,1619） | dispatch/room.dispatch.js:618-645 |
| `0x00240108` | `Slot_Change_SA`（dispatch-map.md:135） | docs/opcode-ledger.md:199 早期只記錄為「商店清單送完後」S→C 34 bytes，未點名為 Slot_Change_SA；dispatch-map 的定名較晚出現，兩者描述的可能是同一封包但先前未連結。 | ⬜ 未知（早期）→⬜（dispatch-map 命名，未經行為驗證整合） | [OBS]（docs/opcode-ledger.md:199）；[DLL]（dispatch-map.md:135） | dispatch/room.dispatch.js:457,625,645 |
| `0x00240109` | `Slot_Change_SN`（dispatch-map.md:136） |  | ⬜ 未知 | [DLL]（dispatch-map.md:136） | 無 |
| `0x00240111` | （無正式名稱） | code 視為 DefaultSlot_Change 的 CQ。 | ⬜ 未知（僅程式碼） | [GUESS] | dispatch/room.dispatch.js:574 |
| `0x00240112` | `DefaultSlot_Change_SA`（dispatch-map.md:137） |  | ⬜ 未知 | [DLL]（dispatch-map.md:137） | dispatch/room.dispatch.js:577,598 |
| `0x00240113` | `DefaultSlot_Change_SN`（docs/opcode-ledger.md:200） | 房間情境 S→C 10 bytes；經此確認一致（docs/opcode-ledger.md:760）。 | ✅ 已確認 | [OBS]（docs/opcode-ledger.md:200）；[TEST]（docs/opcode-ledger.md:760） | dispatch/room.dispatch.js:437,602 |
| `0x00240115` | `ZDispatchHangar::DefaultSlot_Empty_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240122` | `ZDispatchHangar::Item_Active_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240124` | `ZDispatchHangar::Item_Delete_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240126` | `ZDispatchHangar::Item_Use_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240131` | `Packege_Item_SN`（docs/opcode-ledger.md:106） | 原文拼字即為 Packege（非筆誤）；經此確認一致（docs/opcode-ledger.md:760）。 | ✅ 已確認 | [DLL]（docs/opcode-ledger.md:106）；[TEST]（docs/opcode-ledger.md:760） | dispatch/room.dispatch.js:77 |
| `0x00240132` | `Packege_Point_SN`（docs/opcode-ledger.md:107） |  | 🟡 假設 | [DLL]（docs/opcode-ledger.md:107） | dispatch/room.dispatch.js:78 |
| `0x00240133` | `Packege_Coupon_SN`（docs/opcode-ledger.md:108） |  | 🟡 假設 | [DLL]（docs/opcode-ledger.md:108） | dispatch/room.dispatch.js:79 |
| `0x00240142` | `ZDispatchHangar::Item_Period_Merge_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240144` | `ZDispatchHangar::Item_Stack_Merge_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240152` | `ZDispatchHangar::Increase_UpgradeSlot_Size_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240154` | `ZDispatchHangar::Save_ReinforceStone_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240201` | （無正式名稱） | code 視為 Buy_PointItem 的 CQ。 | ⬜ 未知（僅程式碼） | [GUESS] | dispatch/room.dispatch.js:492 |
| `0x00240202` | `Buy_PointItem_SA`（dispatch-map.md:150） |  | ⬜ 未知 | [DLL]（dispatch-map.md:150） | dispatch/room.dispatch.js:510,744 |
| `0x00240204` | `ZDispatchHangar::Buy_CashItem_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240206` | `ZDispatchHangar::Charge_PeriodPointItem_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240208` | `ZDispatchHangar::Charge_PeriodCashItem_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x0024020a` | `ZDispatchHangar::Charge_StackPointItem_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x0024020c` | `ZDispatchHangar::Charge_StackCashItem_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240212` | `ZDispatchHangar::CashReLoad_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240213` | `ZDispatchHangar::CashReLoad_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240222` | `ZDispatchHangar::ChargeSerialKey_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240241` | `ShopList_SN`（docs/opcode-ledger.md:201） | 成對出現，一次 session 送了 85 對；經此確認一致（docs/opcode-ledger.md:760）。 | ✅ 已確認 | [OBS]（docs/opcode-ledger.md:201）；[TEST]（docs/opcode-ledger.md:760） | dispatch/room.dispatch.js:80 |
| `0x00240242` | `CashShopList_SN`（docs/opcode-ledger.md:201） | 經此確認一致（docs/opcode-ledger.md:760）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:760） | dispatch/room.dispatch.js:81 |
| `0x00240301` | （docs/opcode-ledger.md:213） | 原本設定 `gameStarted_` 的其中一個位置（另一個是 0x00222103）；此狀態綁在單一 TCP 連線，重連即消失，是 0x25xxxx 長期挖不動的根因之一（docs/opcode-ledger.md:209-232）。 | ✅ 已確認（存在此送出點）／⬜（欄位語意未細究） | [TEST]（docs/opcode-ledger.md:213） | dispatch/room.dispatch.js:523-541 |
| `0x00240302` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/room.dispatch.js:537；dispatch/room.dispatch.js:541 |
| `0x00240512` | `ZDispatchHangar::Gift_Send_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240513` | `ZDispatchHangar::Gift_Send_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240521` | （已排除，docs/opcode-ledger.md:110,139,768） | 客戶端 SN dispatcher 不會把此 opcode 導向 `Packege_Item_SN`；已排除該路徑。 | ❌ 已排除 | [TEST]（docs/opcode-ledger.md:110,139,768） | 無 |
| `0x00240522` | `Send_UserItem_SA`（docs/opcode-ledger.md:768） | 台帳原記「0x240521→Packege_Item_SN 已排除」是對的，正確映射是 0x00240522=Send_UserItem_SA（docs/opcode-ledger.md:768）。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:768） | 無 |
| `0x00240602` | `ZDispatchHangar::Nick_Name_Change_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240603` | `ZDispatchHangar::Nick_Name_Change_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240612` | `ZDispatchHangar::Account_Reset_KillDeath_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240622` | `ZDispatchHangar::Account_Reset_Record_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240632` | `ZDispatchHangar::License_Obtain_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240702` | `ZDispatchHangar::RandomBox_Open_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00240711` | `ZDispatchHangar::RandomBox_Notify_SN`（docs/client-dispatch-map.md）；docs/opcode-ledger.md:102（無正式名稱，僅原始 hex/位址提及） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/room.dispatch.js:15 |
| `0x00250101` | `Load_Failed_SN`（dispatch-map.md:172，屬 ZDispatchCard） | 台帳舊 0x25xxxx 章節（docs/opcode-ledger.md:114-131）把 0x00250101~0x00250512 整段標為「Game（對戰中）」；dispatch-map.md 顯示這其實是 `ZDispatchCard`（卡片系統）的命名空間，與對戰完全無關。**見矛盾清單「整個 0x25xxxx 命名空間判定」**。 | ❌ 已排除（作為 Game 命名空間）／⬜ 未知（作為 Card 命名空間，未驗證用途） | [DLL]（docs/opcode-ledger.md:680-736 推翻前提）；dispatch-map.md:172 | dispatch/game.dispatch.js:6 |
| `0x00250102` | 遊戲場景進入通知（docs/opcode-ledger.md:120） | 未開打時回 0x250103，開打後送 Ready_Host_SQ；`game.dispatch.js` 目前唯三個真正處理的 opcode之一（CLAUDE.md「目前進度」節）。**opcode 本身有效不代表命名空間判定正確**——它落在 `ZDispatchCard` 的範圍內（dispatch-map.md 未列出 0x00250102，代表它可能根本不是任何已知 client dispatcher 認領的 SN，我方能用純粹是巧合／客戶端有其他判斷邏輯）。 | ✅ 已確認（可用，行為符合預期）／⚠️ 命名空間歸屬存疑 | [TEST]（docs/opcode-ledger.md:120） | dispatch/game.dispatch.js:39-55 |
| `0x00250103` | 場景進入 ACK（docs/opcode-ledger.md:121） |  | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:121） | dispatch/game.dispatch.js:49 |
| `0x00250112` | `ZDispatchCard::Open_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00250114` | `ZDispatchCard::Close_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00250201` | `Ready_Success_SN`（docs/opcode-ledger.md:122） | `game.dispatch.js` 內用此回應 0x00250204。與 dispatch-map.md 定案的真正 `Ready_Success_SN=0x00230122`（Game 命名空間內，docs/opcode-ledger.md:722,762）不同——後者才是經 client 自己 dispatcher 模擬確認的。 | ✅ 已確認（此為我方 0x25 命名空間內部一致的舊實作）／⚠️ 與 dispatch-map.md 的正式映射衝突 | [TEST]（docs/opcode-ledger.md:122） | dispatch/game.dispatch.js:61-67 |
| `0x00250202` | `Ready_Host_SN`（docs/opcode-ledger.md:123） | 多人用，目前忽略。 | 🟡 假設 | [OBS]（docs/opcode-ledger.md:123） | dispatch/game.dispatch.js:81-82 |
| `0x00250203` | `Ready_Host_SQ`（docs/opcode-ledger.md:124） | 與 dispatch-map.md 定案的真正 `Ready_Host_SQ=0x00420113`（docs/opcode-ledger.md:720,762）不同，同一矛盾模式。 | ✅ 已確認（0x25 命名空間內部）／⚠️ 與正式映射衝突 | [TEST]（docs/opcode-ledger.md:124） | dispatch/game.dispatch.js:42 |
| `0x00250204` | `Ready_Host_CA`（docs/opcode-ledger.md:125） | `game.dispatch.js` 真正處理的三個 opcode之一。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:125） | dispatch/game.dispatch.js:57-79 |
| `0x00250212` | `ZDispatchCard::CouponGamble_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00250301` | `BeginRound_SN`（docs/opcode-ledger.md:126） | 延遲 500ms 送出；後來確認真正的 `BeginRound_SN` 是 `0x00230152`（docs/opcode-ledger.md:726），我方曾「誤送為 0x00250301」。 | ❌ 已排除（作為 BeginRound_SN） | [TEST]（docs/opcode-ledger.md:126→726 更正） | dispatch/game.dispatch.js:70-76 |
| `0x00250302` | `ZDispatchCard::Coupon_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00250303` | `ZDispatchRoom::Reward_Coupon_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00250304` | `ZDispatchCard::PackageCard_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00250312` | `ZDispatchCard::Reward_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00250322` | `ZDispatchCard::Exchange_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00250332` | `ZDispatchCard::WantCard_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00250352` | `ZDispatchCard::Use_MasterCard_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00250402` | `ZDispatchCard::Send_UserItem_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00250502` | `ZDispatchCard::Card_Combination_Type_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00250512` | `ZDispatchCard::Destroy_Socket_SA`（docs/client-dispatch-map.md）；docs/opcode-ledger.md:116（無正式名稱，僅原始 hex/位址提及） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/game.dispatch.js:6 |
| `0x00260101` | SN_LICENSE_INFO（docs/opcode-ledger.md:156）／`LicenseInfo_SN`（docs/client-dispatch-map.md:188） | 登入序列第 8 個封包，80 bytes；當時「用途未確認」（docs/opcode-ledger.md:156,165），後由 dispatch-map 對照確認送法一致（docs/opcode-ledger.md:758）。code 端另註記「must be sent before SN_COMPLETE / lobby enter」。 | ⬜→✅（docs/opcode-ledger.md:758 起視為一致） | [OBS]（docs/opcode-ledger.md:156,165）；[TEST]（docs/opcode-ledger.md:758） | dispatch/community.dispatch.js:50；dispatch/gamelogin.dispatch.js:20 |
| `0x00260111` | CQ_QUEST_COMPLETE（community.dispatch.js:44） | 僅程式碼常數定義，台帳未討論，用途未驗證。 | ⬜ 未知（僅程式碼） | [GUESS]（程式碼定義，無台帳依據） | dispatch/community.dispatch.js:44 |
| `0x00260112` | SA_QUEST_COMPLETE（community.dispatch.js:45） | 同上。 | ⬜ 未知（僅程式碼） | [GUESS] | dispatch/community.dispatch.js:45 |
| `0x00260121` | CQ_LICENSE_QUERY（community.dispatch.js:49） | 同上。 | ⬜ 未知（僅程式碼） | [GUESS] | dispatch/community.dispatch.js:49 |
| `0x00260122` | （community.dispatch.js:102,182，無正式名稱） | 程式碼註解稱「空白 ACK 會清空客戶端授權清單（期限已過/無授權）」。 | ⬜ 未知（僅程式碼註解） | [GUESS]（程式碼註解，無台帳依據） | dispatch/community.dispatch.js:102；dispatch/community.dispatch.js:182 |
| `0x00310101` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/community.dispatch.js:109 |
| `0x00310102` | `ZDispatchPostbox::Open_SA`（docs/client-dispatch-map.md） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/community.dispatch.js:197 |
| `0x00310104` | `ZDispatchPostbox::Close_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00310111` | `ZDispatchCommunity::Option_Community_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00310122` | `ZDispatchCommunity::Option_Community_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00310201` | `ZDispatchPostbox::Mail_Info_SN`（docs/client-dispatch-map.md） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/community.dispatch.js:224 |
| `0x00310202` | `ZDispatchPostbox::Mail_List_SN`（docs/client-dispatch-map.md） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/community.dispatch.js:260 |
| `0x00310212` | `ZDispatchPostbox::Mail_Send_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00310213` | `ZDispatchPostbox::Mail_Send_SN`（docs/client-dispatch-map.md） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/community.dispatch.js:266 |
| `0x00310215` | `ZDispatchPostbox::Mail_Read_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00310216` | （無名稱來源） | 僅有零星提及，未整理成獨立結論；細節需回查引用行號。 | ⬜ 未知 | [OBS]/[DLL]（依來源行號判斷，未逐一分類） | dispatch/community.dispatch.js:115 |
| `0x00310217` | `ZDispatchPostbox::Mail_Refresh_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00310219` | `ZDispatchPostbox::Mail_Delete_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00310301` | `ZDispatchPostbox::Gift_Info_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00310302` | `ZDispatchPostbox::Gift_List_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00310315` | `ZDispatchPostbox::Gift_Read_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00310317` | `ZDispatchPostbox::Gift_Receive_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00310319` | `ZDispatchPostbox::Gift_Refresh_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x0031031b` | `ZDispatchPostbox::Gift_Delete_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00310321` | `ZDispatchPostbox::Packege_Item_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00320101` | `ZDispatchFriend::FriendList_Add_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00320102` | `ZDispatchFriend::FriendList_Empty_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00320103` | `ZDispatchFriend::Load_Failed_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00320104` | Card 頻道進入 CQ（docs/opcode-ledger.md:204） | 0 bytes，頻道進入後立刻送。 | ✅ 已確認 | [OBS]（docs/opcode-ledger.md:204） | dispatch/community.dispatch.js:131-135 |
| `0x00320105` | Card SA（docs/opcode-ledger.md:204） | 16 bytes。 | ✅ 已確認 | [OBS]（docs/opcode-ledger.md:204） | dispatch/community.dispatch.js:132 |
| `0x00320202` | `ZDispatchFriend::Friendship_Ask_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00320203` | `ZDispatchFriend::FriendList_Request_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00320205` | `ZDispatchFriend::Friendship_Answer_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00320206` | `ZDispatchFriend::FriendList_Response_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00320209` | `ZDispatchFriend::Friendship_Break_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00320210` | `ZDispatchFriend::FriendList_Delete_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00320212` | `ZDispatchCommunity::Whisper_Friend_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00320213` | `ZDispatchFriend::FriendList_Online_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00320214` | `ZDispatchFriend::FriendList_Offline_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00320221` | `ZDispatchFriend::FriendList_ClanEmblem_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00320231` | `ZDispatchFriend::FriendUser_Nick_Change_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360101` | `ZDispatchClan::Load_Waiting_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360102` | `ZDispatchClan::Load_Failed_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360103` | `ZDispatchClan::ClanInfo_Empty_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360105` | `ZDispatchClan::ClanServer_Disconnect_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360112` | `ZDispatchClan::Open_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360122` | `ZDispatchClan::Close_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360202` | `ZDispatchCommunity::Search_Clan_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360212` | `ZDispatchClan::Create_Check_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360222` | `ZDispatchClan::Create_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360232` | `ZDispatchClan::Destroy_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360242` | `ZDispatchClan::Join_Open_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360252` | `ZDispatchClan::Member_Join_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360253` | `ZDispatchClan::Member_Join_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360262` | `ZDispatchClan::Join_Accept_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360263` | `ZDispatchClan::Join_Accept_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360272` | `ZDispatchClan::Join_Reject_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360273` | `ZDispatchClan::Join_Reject_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360301` | `ZDispatchClan::ClanInfo_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360302` | `ZDispatchClan::ClanUserInfo_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360303` | `ZDispatchClan::Join_Open_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360401` | `ZDispatchClan::Online_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360402` | `ZDispatchClan::Offline_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360412` | `ZDispatchClan::Grade_Change_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360413` | `ZDispatchClan::Grade_Change_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360414` | `ZDispatchClan::ClanUserInfo_Add_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360422` | `ZDispatchClan::Secede_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360423` | `ZDispatchClan::Secede_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360432` | `ZDispatchClan::Kickout_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360433` | `ZDispatchClan::Kickout_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360452` | `ZDispatchClan::Master_Change_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360453` | `ZDispatchClan::Master_Change_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360461` | `ZDispatchLobby::User_Clan_Info_SN;ZDispatchRoom::Invite_User_Clan_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360462` | `ZDispatchRoom::User_Clan_Add_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360463` | `ZDispatchLobby::User_Clan_Clear_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360464` | `ZDispatchRoom::User_Clan_Delete_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360471` | `ZDispatchClan::Reset_Clanner_WinLose_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360472` | `ZDispatchClan::Reset_Clanner_KillDeath_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360502` | `ZDispatchClan::Introduce_Change_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360503` | `ZDispatchClan::Introduce_Change_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360512` | `ZDispatchClan::Notice_Change_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360513` | `ZDispatchClan::Notice_Change_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360524` | `ZDispatchClan::Emblem_Change_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360525` | `ZDispatchClan::Emblem_Change_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360534` | `ZDispatchClan::Clan_Name_Change_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360535` | `ZDispatchClan::Clan_Name_Change_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360542` | `ZDispatchClan::Limit_Expansion_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360543` | `ZDispatchClan::Limit_Expansion_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360551` | `ZDispatchClan::ClanUser_Nick_Change_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360562` | `ZDispatchClan::Reset_Clan_Record_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360563` | `ZDispatchClan::Reset_Clan_Record_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360602` | `ZDispatchCommunity::Chat_Clan_All_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360612` | `ZDispatchCommunity::Whisper_Claner_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360613` | `ZDispatchCommunity::Whisper_Claner_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360712` | `ZDispatchClan::Invite_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360713` | `ZDispatchClan::Invite_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360801` | `ZDispatchClan::ClanScore_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00360802` | `ZDispatchClan::ClanMemberScore_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00410101` | `Regist_CQ`（docs/opcode-ledger.md:1213） | 客戶端在場景 1（Waiting）送出，我方從未觀察到任何 0x0041xxxx 封包出現在崩潰那輪 session（docs/opcode-ledger.md:1219），代表客戶端從未真正進入場景 1。 | ⬜ 未知（我方從未觸發過） | [DLL]（docs/opcode-ledger.md:1213） | 無 |
| `0x00410102` | `Regist_SA`（dispatch-map.md:279，docs/opcode-ledger.md:1213） | 對 0x00410101 的回應；場景 1 的三個 handler之一，我方尚未實作場景 1 握手。 | ⬜ 未知（未實作） | [DLL]（docs/opcode-ledger.md:1213） | 無 |
| `0x00410103` | `Clear_SQ`（dispatch-map.md:280，docs/opcode-ledger.md:1214） |  | ⬜ 未知（未實作） | [DLL]（docs/opcode-ledger.md:1214） | 無 |
| `0x00420111` | `Game_Wait_SN`（dispatch-map.md:634，docs/opcode-ledger.md:374,1235,1271） | `Game_Data_Clear`+`Scene_Change(6)`（docs/opcode-ledger.md:1235）。伺服器驅動開戰流程的第一步（docs/opcode-ledger.md:1264-1327）。 | ✅ 已確認 | [DLL]（docs/opcode-ledger.md:1235）；[TEST]（docs/opcode-ledger.md:1271） | dispatch/gate.game.dispatch.js:212-214 |
| `0x00420112` | `Ready_Failed_SN`（dispatch-map.md:282） |  | ⬜ 未知（未實作） | [DLL]（dispatch-map.md:282） | 無 |
| `0x00420113` | `Ready_Host_SQ`（docs/opcode-ledger.md:720,762,925） | 我方已送對。 | ✅ 已確認 | [TEST]（docs/opcode-ledger.md:925,762） | dispatch/gate.game.dispatch.js:150-154 |
| `0x00420114` | `Ready_Host_CA`（docs/opcode-ledger.md:721 舊表 Ready_Host_SN, docs/opcode-ledger.md:376「客戶端回應」） | 客戶端送出（C→S 8 bytes，`000000000000bb78`），非 SN；community.dispatch.js 另把它當「Ready_Host_CA-like packet」處理，呼叫 `sendReadySuccessAndBeginRound`。 | ✅ 已確認（客戶端會送出） | [OBS]（docs/opcode-ledger.md:376） | dispatch/community.dispatch.js:122-124 |
| `0x00420115` | `Ready_Success_SN`（docs/opcode-ledger.md:722，舊表誤標為 Ready_Host_SN） | **崩潰史**：body 寫死 0x13 導致 IP/MapName 字串被截斷（`Map_PC` 缺 `01`），造成 ClientTravel 到不存在的地圖而崩潰（docs/opcode-ledger.md:308-357）。已改為依字串長度動態決定 body 大小（`READY_HOST_SN_URL_MODE='fit'`）。訪客格式字串 `%s:%d/%s`（docs/opcode-ledger.md:457）證實此欄位是**給其他玩家連上主機用**，不是主機自己 travel 用（docs/opcode-ledger.md:452-462）。 | ✅ 已確認（截斷 bug 已修） | [DLL]（docs/opcode-ledger.md:452-462）；[TEST]（docs/opcode-ledger.md:308-357） | dispatch/gate.game.dispatch.js:150-207 |
| `0x00420116` | `HostChange_SN`（docs/opcode-ledger.md:723 舊表，實為 Ready_Success_SN 對應位置矛盾，已被 docs/opcode-ledger.md:1631 系統更正覆蓋） | observed body 全 0，16 bytes。 | ⬜ 未知 | [OBS]（docs/opcode-ledger.md:378） | dispatch/community.dispatch.js:25-29；dispatch/room.dispatch.js:549-553 |
| `0x00420117` | `Leave_SN`（docs/opcode-ledger.md:724 舊表） | in-map 時客戶端會送出，目前只用 fallback（docs/opcode-ledger.md:1339）。**確認為 `Battle_Success_CN`**（client 送出端，docs/opcode-ledger.md:1416-1424）：`execGame_Load_Complete`→`Battle_Success_CN`，前提 scene 6 + `Game_Host_Check()` 參數 0 分支。與「Leave_SN」的舊猜測方向相反（一個是 SN 一個是 CN）。 | ✅ 已確認（Battle_Success_CN，DLL）／❌ 已排除（Leave_SN 的猜測） | [DLL]（docs/opcode-ledger.md:1416-1424） | 無 |
| `0x00420118` | （fallback 回應，docs/opcode-ledger.md:1339） | 對 0x00420117 的 fallback 回應，用途未知。 | ⬜ 未知 | [OBS]（docs/opcode-ledger.md:1339） | 無 |
| `0x00420121` | `ZDispatchGame::HostChange_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00420133` | `ZDispatchGame::Leave_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00510101` | Community 命名空間（docs/opcode-ledger.md:153,165） | 登入序列第 5 個封包，16 bytes，「用途未確認」；handleHangarOpen() 另在機庫開啟時送同一 opcode，但 body 只有 4 bytes（getExactMessageBuffer 無填充），內容為固定值 11，兩處大小差異推測是 16-byte 對齊 vs 精確 buffer 的差別，非結構衝突。 | ⬜ 未知 | [OBS]（docs/opcode-ledger.md:153,165） | dispatch/account.dispatch.js:20（常數定義）；dispatch/gamelogin.dispatch.js:16（重複定義）；dispatch/community.dispatch.js:206（機庫開啟時另送一次，4-byte body） |
| `0x00510202` | `ZDispatchCommunity::Notice_SA`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |
| `0x00510203` | `ZDispatchCommunity::Notice_SN`（docs/client-dispatch-map.md） | 僅見於 client-dispatch-map.md（`tools/dispatch-map.py` 模擬客戶端 dispatcher 得出），台帳未討論、程式碼未實作。 | ⬜ 未知（僅工具產出，未經行為驗證） | [DLL]（dispatch-map.md，模擬客戶端分派邏輯得出，非試打） | 無 |

---

## 2. 矛盾清單

每條格式：opcode、說法 A（檔:行）、說法 B（檔:行）、哪個較新（依行號/日期，事實陳述，不做對錯判定）。

### 2.1 `0x00230103`：「Respawn_SN」→「不是任何 handler」→「Respawn_CN」，而且程式碼現在兩種用法並存

- 說法 A：`docs/opcode-ledger.md:707`（2026-09-15「完整映射(29/29)」表）稱 `0x00230103` = `Respawn_SN`（伺服器→客戶端）。
- 說法 B：`docs/opcode-ledger.md:1628`（2026-09-16）用 `tools/dispatch-map.py 0x1070139d ZNetwork.dll` 重新確認，稱「第一輪 Respawn 實驗誤送 `0x00230103`……確認它不是任何 server→client handler」。
- 說法 C：`docs/opcode-ledger.md:1629,1631` 進一步更正為「正確配對是 `Respawn_CN 0x00230103` / `Respawn_SN 0x00230104`」，即 `0x00230103` 其實是**客戶端→伺服器**方向。
- 較新：C（2026-09-16，行號 1629/1631 > 707）。
- **程式碼現況（比台帳更晚，仍未同步）**：`dispatch/lobby.dispatch.js:215-224` 的 `case 0x00230103` 依 C 正確地把它當成客戶端送來的 `Respawn_CN` 處理；但 `dispatch/room.dispatch.js:242-248`（`sendLobbyBootstrapAfterRoomLeave()`）仍在**伺服器主動送出** `0x00230103`，console.log 標註「Sent Lobby Room_List_SN 0x230103 after room leave」——這與 C 直接矛盾，且發生在同一個程式碼庫、同一次讀取裡，是本次盤點裡最明確的一處「活的」矛盾。

### 2.2 `0x00230111` / `0x00230112`：「Lobby Enter」猜測 vs. DLL 確認的 `Timeout_CN`/`Timeout_SN`

- 說法 A：`dispatch/lobby.dispatch.js:70-95` 的程式碼註解「Trying `0x00230111` based on the CQ/SA pattern (X111/X112)」「Possible Lobby Enter/Request CQ (0x230101)」（原文如此，變數名打錯但邏輯用的是 `0x00230111`），回應 `0x00230112`。`dispatch/gamelogin.dispatch.js:19` 定義常數 `SA_LOBBY_ENTER = 0x00230112` 並在登入序列裡無條件送出（lines 358,408,429）。`dispatch/room.dispatch.js:235` 送出時 console.log 標「Lobby Enter SA」。
- 說法 B：`docs/opcode-ledger.md:1341`（2026-09-16）稱「`0x00230111` 每秒 1 次……誤回 Lobby Enter SA + 空房間清單……⬜ in-map 輪詢,非 Lobby Enter」——已經觀察到「Lobby Enter」的猜測有問題。
- 說法 C：`docs/opcode-ledger.md:1416-1430`（2026-09-16，同一天稍後）以掃描 `ZNetwork.dll` 的 `mov [...], <opcode>` 送出端確認：`0x00230111` = `ZDispatchGame::Timeout_CN`（送出前提 scene 6 + `Game_Host_Check()` + `Game_Play_Check()`），對應的 `Timeout_SN = 0x00230112`，並在 `docs/client-dispatch-map.md:120` 得到獨立確認。
- 較新：C（行號 1416-1430，且是 2026-09-15 完整映射表之後的方法論修正——「先前把 `0x00230111` 標成『每秒輪詢，含義未知』，是因為只從客戶端的 dispatcher 找它」，`docs/opcode-ledger.md:1432-1435`）。
- **程式碼至今未跟進 C**：三處程式碼（`lobby.dispatch.js`、`gamelogin.dispatch.js`、`room.dispatch.js`）仍用「Lobby Enter」的名稱與行為。

### 2.3 台帳「完整映射(29/29)」表（`docs/opcode-ledger.md:696-727`）與同名的 `docs/client-dispatch-map.md` 現行內容不一致

- 說法 A：`docs/opcode-ledger.md:696-727`（2026-09-15）聲稱由 `tools/dispatch-map.py` 產出「完整映射（29/29）」，例如 `Respawn_SN=0x00230103`、`InstantRespawn_SN=0x00230104`、`Timeout_SN=0x00230105`、`Assist_SN=0x00230106`、`Death_SN=0x00230107`（並標記「★★ 專案主要目標」）。台帳同一節（`docs/opcode-ledger.md:740`）也稱這是「273 筆映射」的一部分，與 `docs/client-dispatch-map.md` header 自稱「產生於 2026-09-15，共 273 筆映射」的數字相同。
- 說法 B：`docs/client-dispatch-map.md`（目前實際內容，行 118-131）：`Respawn_SN=0x00230104`、`InstantRespawn_SN=0x00230106`、`Timeout_SN=0x00230112`、`Assist_SN=0x00230122`、`Death_SN=0x00230124`——**與 A 完全不同**，且 `0x00230103/0x00230105/0x00230107` 在目前的 dispatch-map.md 裡根本不存在。
- 較新：B。`docs/opcode-ledger.md:1631` 明文承認：「更正前文完整映射中一組系統性錯位：最新工具輸出確認 `Respawn_SN=0x230104`、`InstantRespawn_SN=0x230106`、`Timeout_SN=0x230112`、`Assist_SN=0x230122`、`Death_SN=0x230124`；舊表把多個 CN 奇數 opcode 誤標成 SN。後續以 `tools/dispatch-map.py 0x1070139d ZNetwork.dll` 的實際輸出為準。」`docs/HANDOFF.md:122-125` 也同步記載了這次更正，並點名「舊 ledger 曾把多個 CN 奇數 opcode 誤標為 SN」。
- **這正是任務範例指出的矛盾**（`Assist_SN` 第 710 行 vs 第 1631 行的更正），但範圍比單一 opcode 大得多——整段 29 筆映射表都受影響，且是**同一份文件裡兩個聲稱「273 筆」的段落彼此不吻合**，而不只是單一數值筆誤。

### 2.4 `0x25xxxx` 整個命名空間的定性：「Game（對戰中）」vs.「其實是 Card，對戰在別的地方」

- 說法 A：`docs/opcode-ledger.md:114-131`（`## 0x25xxxx — Game（對戰中）⚠️ 主要缺口`）、`dispatch/game.dispatch.js:1-26` 的檔案頂端註解（「Confirmed message ID range: 0x00250101 through 0x00250512 (28 IDs total). All 0x25XXXX messages belong to this dispatch.」）、以及 CLAUDE.md 本身「目前進度與主要缺口」一節，都把 `0x25xxxx` 描述為「對戰中」的命名空間，且是專案的主要缺口。
- 說法 B：`docs/opcode-ledger.md:680-736`（2026-09-15 稍後，標題「★★★ 對戰 opcode 全部定位完成 —— 而且不在 `0x25xxxx`」）以反組譯 `ZDispatchGame` 的 `Dispatch` 方法確認：**該 dispatcher 處理的全部 29 個 handler 都落在 `0x2221xx`／`0x2222xx`／`0x2301xx`／`0x2302xx`／`0x0042xxxx`，沒有一個在 `0x25xxxx`**。`docs/client-dispatch-map.md:172` 進一步顯示 `0x00250101` 實際屬於 `ZDispatchCard`（卡片系統），與對戰無關。
- 較新：B（`docs/opcode-ledger.md:692` 明文：「`game.dispatch.js` 以 `(type & 0x00FF0000) === 0x00250000` 攔截並宣稱處理整個 `0x25xxxx` 範圍，這個假設從一開始就是錯的。」）。
- **程式碼至今未更新**：`dispatch/game.dispatch.js` 檔頭註解與遮罩判斷式（`(type & 0x00FF0000) !== 0x00250000`）都還維持說法 A；CLAUDE.md 的「目前進度與主要缺口」一節同樣還在用 `0x25xxxx` 描述對戰缺口。這代表**這份說明檔本身在寫這次任務時所依賴的專案地圖，跟台帳最新結論不一致**，值得主力注意。

### 2.5 `0x00222102` 在同一個檔案內有兩個不同名稱

- 說法 A：`dispatch/gate.game.dispatch.js:711-714`（`case 0x00222101`）送出 `0x00222102` 時 console.log／參數標註為 `'Room_Enter_SN'`。
- 說法 B：同一檔案 `dispatch/gate.game.dispatch.js:760,802,804,810` 在伺服器驅動開戰流程裡送出同一個 `0x00222102`，標註為 `'Game_Ready_SN'`／`'server-driven: Game_Ready_SN'`。
- 說法 C：`docs/client-dispatch-map.md:91`（`ZDispatchRoom::Game_Ready_SN`）與 `docs/opcode-ledger.md:1307` 都稱其為 `Game_Ready_SN`。
- 較新／較多來源支持：C 與 B 一致（Game_Ready_SN），A（Room_Enter_SN）是同檔案裡唯一的例外標籤，來源不明（無台帳依據，純程式碼內部命名）。opcode 數值本身沒有爭議，只有標籤矛盾。

### 2.6 `0x00220505`/`0x00220501` 聊天封包的方向描述 vs. `client-dispatch-map.md` 的分類

- 說法 A：`docs/opcode-ledger.md:179-188`（2026-09-15 真實客戶端觀察）把 `0x00220501`→`0x00220502`、`0x00220505`→`0x00220506` 描述成「C→S 258 / S→C 16」的請求/應答對——即客戶端發起聊天請求，伺服器回一個小 ACK。
- 說法 B：`docs/client-dispatch-map.md:77,79` 把 `0x00220501` 標為 `ZDispatchCommunity::Chat_Channel_All_SN`、`0x00220505` 標為 `Chat_Room_All_SN`——字尾 `_SN` 代表伺服器主動通知（廣播給所有人，含自己），而非對客戶端請求的單純 ACK。
- 附帶缺口：`docs/client-dispatch-map.md` 273 筆映射裡**沒有 `0x00220506`**（0501/0503/0505/0507/0509/0512/0513 都在，唯獨 0506 缺席），但台帳觀察到「S→C 16 bytes」的回應，兩者對不上。
- 較新：兩者是同一時期（2026-09-15）的不同角度觀察，台帳本身沒有交叉核對過，**未經裁決**，留給主力判斷是否是「客戶端聊天送出後，伺服器把同一個 opcode 廣播回所有人（含發送者）」這種常見的 all-SN 模式，而非請求/應答。

### 2.7 舊表「Ready_Host_SN／Ready_Success_SN／HostChange_SN」在 `0x0042xxxx` 側的對應関係前後不一致

- 說法 A：`docs/opcode-ledger.md:721-723`（2026-09-15 完整映射表）：`0x00230121/0x00420114` = `Ready_Host_SN`、`0x00230122/0x00420115` = `Ready_Success_SN`、`0x00230123/0x00420116` = `HostChange_SN`。
- 說法 B：`docs/opcode-ledger.md:1631` 的系統性更正只提到 `Respawn_SN/InstantRespawn_SN/Timeout_SN/Assist_SN/Death_SN` 五個，**沒有明確覆蓋 Ready_Host_SN/Ready_Success_SN/HostChange_SN 這三個在 `0x0042xxxx` 側的對應**；但 `docs/opcode-ledger.md:1768-1781`（2026-09-17）另外以 DLL 反組譯確認 `0x00230121` 其實是 `Assist_CN`（而非 Ready_Host_SN），與說法 A 的 `0x00230121=Ready_Host_SN` 直接衝突。
- 較新：2026-09-17 的 `Assist_CN` 說法（行號最後）。但 `0x00420114/0x00420115/0x00420116` 在 `0x0042xxxx` 側究竟对应什么名字，台帳未見明確的「最終定案表」——`docs/opcode-ledger.md:1338`（進圖後表格）仍稱 `0x00420114`=`Ready_Host_CA`，与 dispatch-map.md 没有单独收录这三个 0042 side 的 SN 名稱做交叉核对，**这部分未被后续任何一次反组译重新覆核过，是台帐留下的空隙而非确认的矛盾**，一并记录供主力查证。

### 2.8 `dispatch/lobby.dispatch.js` 的 `CQ_NAMESPACE` 陣列（`0x00230101`~`0x0023014A`，`lobby.dispatch.js:25-30`）與 `ZDispatchGame` 才是真正 owner 的結論

- 說法 A：`dispatch/lobby.dispatch.js` 檔案本身把 `0x00230101`~`0x0023014A` 整段宣告為它自己的命名空間（`(type & 0x00FF0000) !== 0x00230000` 判斷式），檔名也叫 `lobby.dispatch.js`。
- 說法 B：`docs/opcode-ledger.md:680-736` 確認這整段 opcode 實際屬於 `ZDispatchGame`（客戶端側），與「Lobby」無關；`dispatch/lobby.dispatch.js:122-125` 的程式碼註解自己也承認：「Despite this file's historical name, the client dispatch map assigns the in-game 0x23xxxx range to `ZDispatchGame`.」
- 較新：B，且程式碼註解已自我承認，**這條不算活的矛盾**（code 已知情況），但因為檔名與宣告範圍仍維持舊稱，容易讓後來者誤判，故一併列入供主力決定是否要在 `docs/state.md` 裡用更準確的方式標注。

---

## 3. 非 opcode 的重要結論（依最新狀態符號列出，附檔:行號）

- ⚠️ **客戶端拒收整包 > 0x400 bytes（1024 bytes）的 frame。** `docs/opcode-ledger.md:1752-1766`；驗證函式位址 `ZNetwork.dll 0x107f8e00`（接收迴圈 `0x107fa57a` 呼叫）；CLAUDE.md 對應段落見「⚠️ 客戶端拒收超過 0x400 bytes 的 frame」一節（line 330 附近）。**設計任何新封包前先算 `header(16) + body ≤ 1024 bytes`**（`docs/HANDOFF.md:14`）。
- ✅ **Session 狀態必須以 accountId 為鍵、跨重連存活**，否則 `gameStarted_` 等旗標在客戶端切地圖重連後全部消失，對戰永遠打不開。`docs/opcode-ledger.md:209-232`（首次定位根因）；已由 `session.js` 實作，CLAUDE.md「Session 狀態」一節列出哪些欄位帶、哪些不帶（不帶的是「這條連線已送過」的旗標、timer handle、以及重新驗證時本就會重建的帳號欄位）。
- ✅ **開戰是「場景驅動」而非「時機驅動」。** `docs/opcode-ledger.md:1187-1224`：`Game_Info_SN (0x00222111)` 有兩個 handler，依 `*(this+4)` 場景旗標啟用（`ZDispatchWaiting`=場景1、`ZDispatchGame`=場景6），送錯場景會被靜默丟棄；早期「送太晚/送太早」的時機假說（`docs/opcode-ledger.md:901-946`）後來被場景假說取代，兩者都曾各自被认为是「真正原因」，最終以「伺服器驅動開戰」（先送 `Game_Wait_SN` 把客戶端推進場景 6）解決（`docs/opcode-ledger.md:1262-1327`，2026-09-16 18:14 首次成功進圖）。
- ⚠️ **Ghidra 反編譯在特定函式上會把參數順序或棧變數偏移搞錯，要以組語為準。** 明確記錄兩處：`Game_Info_SN` 把 p2/p3 與 p8/p9 對調（`docs/opcode-ledger.md:1474`、`docs/HANDOFF.md:160-163`）；`Game_User_SN` 把記錄偏移整批位移 4 bytes（`docs/opcode-ledger.md:1541-1542`、`docs/HANDOFF.md:161`）。驗算方法：結構通常緊密打包，用總長度反推（例：`0x6D + 8×0x2F = 0x1E5`，`docs/opcode-ledger.md:1539`）。
- ✅ **Map ID 是查 Cache.Bin table 1 用的真實索引，不是任何自訂編號。** `docs/opcode-ledger.md:446-501`（格式字串位址 `0x114a50`/`0x114b34`/`0x11497c`，42 筆 Map ID 表，13 個 GameInfo 類別字串）；之前自創的 `CAMPAIGN_MAP_ALL_HINTS` 索引全部查無此表（`docs/opcode-ledger.md:488-492`）。
- ✅ **`WearInfo_SN` 每組裝備第二個 u32 必須是 ItemInfo 的物品實例 key，不是 item code。** `docs/opcode-ledger.md:1607-1621`；原本 `[uniqueKey, itemIndex]` 順序錯誤已改為 `[itemIndex, uniqueKey]`，配對由 0 → 24。**目前只驗證了配對數字，不代表選機體 UI 問題已完全解決**（`docs/opcode-ledger.md:1617,1621`）。
- ✅→❌ **兩次「客戶端變成全白視窗」的記錄是誤判，來源是只框到標題列的截圖，並非遊戲畫面。** `docs/opcode-ledger.md:1071-1087`（明確標「❌❌ 撤回」）。由此衍生的「場景切換理論」也一併作廢。**方法教訓被記錄了三次**（`docs/opcode-ledger.md:1183`：「這條記錄先前被我改過兩次方向」），CLAUDE.md 本身也把這個事件寫進了「為什麼要有截圖工具」一節，作為專案級別的教訓。
- ✅ **WSL 對客戶端的輸入注入全部無效（滑鼠點擊、鍵盤），截圖可用。** `docs/opcode-ledger.md:1143-1184`；根因判定為 XIGNCODE3 過濾帶注入標記的輸入事件，焦點與 IME 兩個變因已個別排除。**專案界線：不繞過**（不注入行程、不附加除錯器）。
- ⚠️ **`type & 0x80` 會誤攔任何低位元組 bit7 有設的 opcode，讓它們被系統層吞掉且早期沒有 hex dump。** `docs/opcode-ledger.md:1365-1381`；已修（加 default 分支印出完整 dump 並標示誤攔），但誤攔行為本身沒有改。**影響**：`0x25xxxx` 命名空間裡若有 opcode 低位元組 ≥ 0x80，在修正前是查不到的（但目前已知在用的 opcode 低位元組都 < 0x80，尚未實際踩到）。
- ⚠️ **Keep Alive 早於 Time Sync 會打死整個 process（已修）。** `docs/opcode-ledger.md:1384-1401`；`writeUint32BE` 對超大數字拋例外且未被捕捉，兩個 listener 一起掛掉，封包紀錄當場中斷。**目前沒有全域 `uncaughtException` 防護網**，未列為已解決。
- ✅ **六個 dispatch 對偶數 opcode 一律靜默不回應（已修，加上 fallback 記錄）。** `docs/opcode-ledger.md:294-304`；奇數會回一個沒意義的空 `EVENT_INFO`，偶數則讓客戶端無限等待（`0x00220234` 卡死的成因），現在都會寫 fallback log 並在偶數情況於 console 警告。
- ⬜ **`m_MapInfoList`（地圖選擇彈出視窗的清單）與房間清單「目前地圖」是兩個不同的資料來源，只有房間清單被修好。** `docs/opcode-ledger.md:1133-1139`；連送兩次 `Map_Change_All_SN` 讓房間清單有內容，但 `ZPopup_MapSelect.m_MapInfoList` 仍為 `0/0`，兩者的資料來源仍待查。
- ⬜ **`team=255` 的成因鏈已完全查清（DLL），但實際修正效果仍待驗證。** `docs/opcode-ledger.md:1439-1467`：`[this+0x1034]` 表只有 `Game_User_Add`（僅 `Game_User_SN 0x00222112` 呼叫）會寫，該封包先前關閉 → 表是空的 → 查無此人 → 255 → 只給 spectator 攝影機。`docs/opcode-ledger.md:1594-1596` 確認 team 已從 255 改為 0，但**仍無選機體畫面**，故 team 修正本身不足以解決出擊問題（`docs/opcode-ledger.md:1597` 明確排除「只要 team 修好就會出現選機體」）。

---

## 4. 待調查佇列

原始佇列（`docs/opcode-ledger.md:1405-1410`，2026-09-15 建立）：

- [ ] 確認四個 `CQ_COMPLETE` 候選（`0x00210122`/`0x00210131`/`0x00210132`/`0x00210141`）中實際觸發的是哪一個。**後續狀態**：`docs/opcode-ledger.md:769` 說明「dispatcher 只處理客戶端收到的封包」，所以用 `client-dispatch-map.md` 查不到候選是正常現象、不是排除依據；**這四個候選本身至今仍未被任何後續記錄實際驗證**，佇列項目維持開放。
- [ ] 定位 `Death_CN` 的 opcode：進訓練場後讓機體被擊毀，觀察未處理封包。**後續狀態**：已在 `docs/opcode-ledger.md:1650-1654`（2026-09-16）以 DLL 反組譯（`0x107d99f5`）+ 實測日誌定位為 `0x00230123`，並完成 handler 實作與死亡/重生回歸測試（`docs/opcode-ledger.md:1653` 使用者確認「有重生了」）。**看起來已有結果**，但原始佇列條目本身沒有被劃掉或標記完成。
- [ ] 定位 `Game_Score_SN` 需要的 body 結構。**後續狀態**：檢索全文（含 `docs/client-dispatch-map.md:96` 的 `0x00222114`）未見任何 body 結構的後續記錄，**仍為開放項目**，也沒有程式碼實作（見總表 `0x00222114` 列）。
- [ ] 釐清 `0x23xxxx` Lobby 已確認範圍。**後續狀態**：`docs/opcode-ledger.md:94-96` 原文只留一句「見 `lobby.dispatch.js`。已確認範圍待補。」之後 `docs/opcode-ledger.md:680-736` 的發現直接推翻了「`0x23xxxx` 是 Lobby」的前提（其實多數屬於 `ZDispatchGame`），所以這條佇列項目**已被更高層級的發現繞過，而非直接回答**；`dispatch/lobby.dispatch.js:122-125` 的程式碼註解已承認這點，但台帳的原始佇列條目未被劃掉。

本次盤點過程中發現、但台帳沒有正式列入「待調查佇列」小節、僅在敘述中留下 `⬜`/`🟡` 標記的開放項目（節錄，按敘述出現順序）：

- ⬜ `0x00220234` 的正確回應 opcode（目前用 `0x00220235` 純屬試打）是否正確，語意是否真的是「離開房間」。`docs/opcode-ledger.md:364`。**未見後續驗證記錄。**
- ⬜ `ChangeSlot_CN 0x00230101` 的回應 `ChangeSlot_SN 0x00230102` 該用什麼 body（DLL 結構已知：`docs/opcode-ledger.md:1603`），但**我方尚未依此結構實作**，`lobby.dispatch.js` 目前的回應仍是舊猜測的空 body。
- ⬜ Map_PC01 沒有敵人的根因：`Class''ZMechanicA 'call failed`／`PreLoadallPveAI_BD ... DefaultPawnClass` null（`docs/opcode-ledger.md:1661`）。**未見後續調查記錄。**
- ⬜ 開火／副武器/推進器的單變數測試（`docs/HANDOFF.md:13` 指向 `docs/next-test.md`）；`docs/opcode-ledger.md:1743` 明確標註「截圖只證明主武器 actor 存在」，左鍵開火、左右副武器掛載、Shift 推進器**均未確認**。
- ⚠️ Table 4 第二欄（先前稱為 `Level`）語意未知，「猜測對應 pilot 101/102」（`docs/opcode-ledger.md:1747`），**未驗證**。
- ⚠️ 4、5 號機在 Table 4 沒有推進器但 DB 給了推進器，是否造成掛載問題（`docs/opcode-ledger.md:1748`），**未測**。
- ⬜ ItemInfo 是否可分包送出、`Item_Add` 內部分包時是否去重或清空（`docs/opcode-ledger.md:1765`），**未查**，目前策略是把單包壓在 28 筆以內。
- ⬜ `0x0042xxxx` 側（`0x00420114/115/116`）与 `0x0023012x` 側的最終对应关系是否有独立于「029 完整映射表」之外的确认（见矛盾清单 2.7），**未见任何反组译或 dispatch-map.py 重新核对这三个 opcode 在 0x0042 侧的确切身份**。

---

## 5. 交付總覽（給主力核對用）

- opcode 總表：**350 列**（原始候選 361 個 8 位十六進位字串，扣除 11 個確認為 DLL 位址／遮罩常數／合成測試值的雜訊後為 350）。
- 矛盾清單：**8 條**（2.1～2.8）。
- 最嚴重的 5 條矛盾（僅列出，不裁決先後，供主力優先處理）：
  1. **2.1** `0x00230103`——程式碼**現在**同時存在「客戶端送來的 Respawn_CN」（lobby.dispatch.js，正確）與「伺服器送出的 Lobby Room_List_SN」（room.dispatch.js，過時）兩種用法，是活的、雙向衝突的程式碼級矛盾，不只是文件過時。
  2. **2.3** 台帳自稱「273 筆映射」的兩個段落（`docs/opcode-ledger.md:696-736` 的內嵌表 vs. 實際 `docs/client-dispatch-map.md` 檔案）內容不一致，且 2026-09-15 的內嵌表把 `Death_SN`（「★★ 專案主要目標」）標成了一個目前完全不存在於官方映射裡的 opcode（`0x00230107`）。
  3. **2.2** `0x00230111`/`0x00230112` 的「Lobby Enter」命名在三個檔案（`lobby.dispatch.js`、`gamelogin.dispatch.js`、`room.dispatch.js`）裡持續使用，即使台帳已在 2026-09-16 用 DLL 確認真實身分是 `Timeout_CN`/`Timeout_SN`（回合逾時通知），且此 opcode 在登入序列中被無條件送出，語意完全不同的兩件事被同一段程式碼混用。
  4. **2.4** 整個 `0x25xxxx` 命名空間的定性（「對戰中」vs.「其實是 Card，真正對戰在 0x22/0x23/0x42」）在 CLAUDE.md、`game.dispatch.js` 檔頭註解、與台帳最新結論之間三方不一致，影響的是專案級的心智地圖，不只是單一 opcode。
  5. **2.5** 同一檔案 `gate.game.dispatch.js` 對 `0x00222102` 用了兩個不同名稱（`Room_Enter_SN` vs `Game_Ready_SN`），雖然數值本身無爭議，但下次有人依名稱搜尋程式碼時容易漏掉其中一處呼叫點。
- 非 opcode 結論：**12 條**（第 3 節）。
- 待調查佇列：原始 4 條 + 本次盤點過程中額外發現的 7 條開放項目（第 4 節）。

**讀不完 / 不確定的範圍：**
- `docs/client-dispatch-map.md` 裡標記「部分 handler 對應兩個 opcode，原因未明」的情況（例如 `0x00210104` 同時對應 `MechLevel_SN` 與 `Reward_Record_Mech_SN`）本次只如實轉述，**沒有進一步反查是哪個場景/条件决定走哪一个**，因為台帳本身也沒有這個層級的資訊。
- `dispatch/gate.dispatch.js`、`dispatch/gate.social.dispatch.js`、`dispatch/account.dispatch.js` 三個檔案的 grep 結果較少（多數是共用常數或系統層轉發），沒有像 `lobby.dispatch.js`/`room.dispatch.js`/`gate.game.dispatch.js` 那樣逐行核對每個 `case` 分支的完整上下文；如果這幾個檔案裡藏有類似 2.1/2.2 的活矛盾，本次盤點可能沒有抓到。
- `docs/research/2026-09-16-slots/` 與 `docs/research/2026-09-17-assist/` 兩個既有的 research 子目錄（存放組語/反組譯原始輸出）本次**沒有**逐檔打開核對，只讀了台帳裡引用它們的摘要文字；如果這兩個目錄裡的原始資料與台帳摘要有落差，本次盤點不會發現。
- 表格裡「僅見於 client-dispatch-map.md」的 ~200 列，只做了機械化的存在性核對（opcode 是否同時出現在台帳/程式碼），**沒有**逐一確認這些 opcode 的 handler 名稱本身是否在 dispatch-map.py 的模擬過程中可能出錯（台帳 `docs/opcode-ledger.md:752` 已自陳「`Gate`／`Quest`／`Base` 解出 0 筆，其分派形式與其他不同」，代表工具本身對某些 dispatcher 是有已知盲區的）。
