# Backlog：交給中階的契約任務

給 Gemini（Antigravity）、Codex Luna、Claude 子 agent 這些中階執行者用。**先讀 `AGENTS.md`**（工作原則、硬性約束、證據標籤、「只剩中階可用時」一節）。

## 共通規則（每個任務都適用）

- **不改 `docs/state.md`、不標 ✅／❌、不改資料庫。** 結論一律標 🟡 或「待審」，由高階審查。
- 分析任務不改程式。契約明寫允許實作的任務，新行為一律放在**預設關閉的開關**後面（例如 `const XXX_MODE = 'disabled'; // 'disabled' | 'enabled'`），commit 時一定是關閉。開關預設值只有高階能改。
- 客戶端與伺服器只有一套。**不要要求操作者測試**，也不要啟動、停止或 `/reload` 伺服器（tmux `server` 由高階控制）。實測由高階安排。
- 工作位置：`git -C /home/lucas/mro-reverse worktree add -b <分支> ~/mro-wt/<名稱> reverse-work`，只在那個 worktree 裡動檔案。**不要在主目錄切分支**，也不要用 `/tmp`。
- 交付：
  - 原始 decompile／組語存到 `docs/research/<日期>-<主題>/`。
  - 一篇日誌 `docs/journal/<日期>-<HHMM>-<主題>.md`（50–100 行）。在 `docs/journal/INDEX.md` 追加一行，**5 欄**：日期｜檔名｜opcode｜`—`｜一句話（第 4 欄是舊的狀態欄，新列一律填 `—`，狀態記在 state.md／backlog）。
  - commit 最後一行 `Agent: <工具> (中階)`。
- 資料庫變更寫成 `tools/` 下的腳本，由高階執行，不直接下 SQL。
- 工具（在 `Metal Rage Online Server/` 底下執行）：`python3 tools/disasm.py {exports|at|func|xref|str} ...`、`tools/ghidra/decompile.sh <va>`（換 DLL：`DLL=Engine.dll`）、`tools/dispatch-map.py`、`tools/item-names.py <編號或名稱>`；opcode 名稱查 `docs/client-dispatch-map.md`。客戶端檔案在 `/mnt/c/Games/MetalRage Online/data/`。
- 解密後的客戶端 UnrealScript 原始碼：`~/mro-decrypted/src/<Package>/<Class>.uc`；class 預設值：`tools/uetool/bin/Release/net8.0/uetool ~/mro-decrypted/<Pkg>.u decompile <Class>`。不要讀 `Metal Rage Online Server/static/`。
- **Ghidra 的參數順序常出錯**：封包欄位偏移一律回頭看組語確認，日誌裡寫出你核對的組語位址。
- 一次只改一個變數。遇到跟既有 ✅ 矛盾、需要超出範圍的改動或架構決策：停下來回報，不要自己擴大範圍。

---

## 優先（roadmap M0–M2）

依 `docs/roadmap.md`。A 線要用客戶端，一次只做一件；B 線可以平行。

### 佔位常數中與多人有關的（優先查）

出自 `docs/reference/placeholder-audit.md`，以下幾筆跟 user index、隊伍、人數有關，排在其他 (c) 類前面：
- `gate.dispatch.js:51`：Gate Enter_SA +0x06 送 `0xDEADBEEF`（測試用的 account index）。
- `room.dispatch.js:620-621`：Ready 回送固定 slot `0`。
- `lobby.dispatch.js:314-316`：`Room_List_SN 0x00230103` 固定送空清單（flag／count／size 都是 0）。
- `room/room-user.sender.js`：`User_Default_SN 0x00220233` +0x15、`User_State_SN 0x00220401` count `1`、`User_Master_SN 0x00220319` 的 state 來源。
- `room/room-game-user.sender.js:125-144`：`Game_User_SN 0x00222112` 的 record header count。
- `room/room-state.sender.js:55-60`：`Room_Default_SN 0x00220203` 房間旗標 +0x09 等欄位。
- `gate.game.dispatch.js:654-657`：Create_SA +0x0B。

### 停放清單（不影響多人打完一場，不刪）

H1、H3、H6、P1、P1b、Legend 機體授權、exp 公式、房間頭像（R14／R15，`journal/2026-09-18-2305`）。

---

## T1：困難模式時間上限跟隨房間設定（A 線）

> **狀態：2026-09-18 開立。先做組語確認，再實作並實測。**

- **目標：** `Game_Info_SN 0x00222111` 的 TimeLimit 改用房間的 PlayTime，不再寫死 10 分鐘。
- **範圍：** 只動 `gate.game.dispatch.js` 的 `timeLimitMinutes`。
- **背景：** `journal/2026-09-18-18-pve-hard-flow.md`：困難房在 547 秒左右停住。
- **限制：** 只改這一個變數，放在預設關閉的開關後面。PlayTime 的單位和它在 body 裡的偏移要先確認，並附組語位址，不可以從 CQ 的值直接類推。
- **交付：** 一篇日誌，加上一次實測：開 9012 困難房，看能不能打超過 10 分鐘、會不會出現 Campaign／EndGame。
- **完成條件：** 有 [LOG] 和 [OBS]；或者明確寫出「時間上限不是停住的原因」，並附上證據。

## A6b：回歸測試補一個 PvE 整場樣本（B 線最優先）

> **狀態：2026-09-18 開立。**

- **目標：** 新增一個黃金樣本，走完這條流程：建房 → F5 開始 → `Game_User_SN` → `Game_Info_SN` → BeginRound → Respawn → 幾次 Death／ChangeSlot → `Campaign_CN` → `EndGame_SN` → 回房間 → Leave_CQ。
- **範圍：** 從現有 session log 切一段完整通關的場次，例如 `session-20260918-205012.jsonl` 那場 9010 簡單房。
- **背景：** `Metal Rage Online Server/test/README.md` 的「Not covered yet」一節。
- **限制：** 不改 dispatch 的程式。伺服器行為如果帶計時器，要用假時鐘，不可以用 sleep 等過去。fake-db 缺資料就補 fixture，不連真的資料庫。
- **交付：** 樣本本身，加上 README 的更新。
- **完成條件：** 未改動的程式跑出來全綠；`Game_User_SN` 和 `EndGame_SN` 各改一個 byte，兩次都要變紅，兩種結果的輸出都要附上。

## S1：單人假設盤點（B 線，唯讀）

> **狀態：2026-09-18 開立。**

- **目標：** 列出 `dispatch/` 和 `session.js` 裡所有假設「只有一個玩家」的地方。
- **範圍：** 寫死的 user index 或隊伍；只回送給來源連線的 SN；掛在單一連線上的房間狀態（例如 `campaignRoom_`）；`Game_User_SN`、`User_Default_SN`、`Room_List_SN` 的筆數；房主怎麼判定；`Ready_Host_SN 0x00420115` 帶的 IP 從哪裡來。
- **限制：** 不改程式。不確定的項目標不確定，不要猜。
- **交付：** `docs/reference/multiplayer-audit.md`。每一列寫明「檔案:行號、現在的行為、多人時應該怎麼做、依據」，分成「M1 兩個人在房間裡互相看得到」和「M2 兩個人打完一場」兩組。
- **完成條件：** M1 那一組可以直接拿去排工。

## N0：第二台主機連到伺服器（B 線）

> **狀態：2026-09-18 開立。**

- **目標：** 同一個區網的第二台主機，用 TCP 連得到 WSL2 裡的 9211 和 30907。
- **範圍：** Windows portproxy 或 WSL mirrored networking，加上防火牆規則。
- **限制：** 不改 `server.js`。需要系統管理員權限的指令寫成腳本，交給操作者執行。**只對區網開放**（硬性約束第 2 條）。
- **交付：** 做法寫進 `docs/reference/setup.md`，附一個可以還原設定的腳本。
- **完成條件：** 在第二台主機上執行 `Test-NetConnection`，兩個埠都成功，而且 session log 看得到連線來源是區網 IP。

## X1：伺服器全域例外防護（B 線）

> **狀態：2026-09-18 開立。**

- **目標：** 任何一條連線的 handler 丟出例外時，只關掉那一條連線，並留下完整的 hex dump 和堆疊，整個伺服器程序不能掛掉。
- **範圍：** dispatch 入口的 try/catch；`process.on('uncaughtException'／'unhandledRejection')` 只寫紀錄，不吞掉錯誤，log 裡要有一筆醒目的 marker。
- **背景：** 多人時，一個怪封包會讓所有人一起斷線。
- **限制：** 正常路徑的行為不變，不要順手重構。
- **完成條件：** 回歸測試全綠；另外寫一個測試：故意送一個會讓 handler 丟例外的封包，確認伺服器程序還活著，log 裡也有 dump。

## W1：帳號白名單（排在 X1 之後，M3 之前）

> **狀態：2026-09-18 開立，操作者已同意。**

- **目標：** 只有列在設定檔裡的帳號名稱，才能登入或自動建立帳號。
- **範圍：** 登入 handler（`CQ_LOGIN_WASABII` 那條路徑）；新增設定檔 `config/allowed-users.json`，不進版控，repo 裡附一份 example。
- **背景：** 硬性約束第 2 條；roadmap M3。
- **限制：**
  - 設定檔不存在時維持現在的行為，但啟動時要印出醒目的警告，build 事件也要記錄白名單是開還是關。開發和回歸測試都不受影響。
  - 拒絕登入前，要先查出 DLL 裡登入失敗的 SA 格式，並附位址。查不到就只關閉連線，不要自己猜一個失敗封包的格式。
  - 被拒絕的嘗試要寫進 log，記下帳號名稱和來源 IP。
- **完成條件：** 回歸測試全綠（設定檔不存在的情況）；另外寫兩個測試：白名單內的帳號可以登入；白名單外的帳號不會建立帳號，DB 裡沒有新增資料列。

## K1：安裝包（M3 的時候再做）

> **狀態：記錄用，M3 前不動。**

- 寫一個 `set-server-ip.bat`：一次改掉客戶端的 `ip=` 啟動參數、`MetalRage.ini` 和 `Default.ini` 的 `ServerIP` 三處（見 `docs/reference/client.md`）。
- 附一頁安裝說明。朋友遠端安裝時，不能指望他們自己手動改 ini。
- **偵測作業系統版本**：Win10 的 build 號碼小於 22000。依結果自動選對應的 exe，至少要印出提示。安裝包要同時附上兩個版本的 exe（雜湊見 `reference/setup.md`「依作業系統選 exe」）。
- **修掉 `Play Metal Rage Online.bat` 的 bug**：內層的 `if %ERRORLEVEL% NEQ 0` 包在 `if ( ... )` 區塊裡，`%ERRORLEVEL%` 在剖析整個區塊時就已經展開成外層的非零值，所以檢查 `reg add` 有沒有成功的那一行等於失效：永遠判斷成失敗、印出 FIRST RUN 然後離開。改用 `if errorlevel 1`，或開啟 delayed expansion 改用 `!ERRORLEVEL!`。
- **字型檢查**：第二台的 `Window Font Count` 是 347，主機是 512。切中文介面前，要確認有安裝「繁體中文補充字型」（Windows「選用功能」）。

## D1：多人房間模型設計稿（C 線，高階自己做）

> **狀態：等 S1 交付。屬於「要重構先問」：PM 審查、操作者同意之後才能實作。**

- 內容：Room 物件（成員、user index 分配、房主、紅藍隊）；「送給房內所有人／所有人但排除自己」的輔助函式；斷線和重連時怎麼處理成員資格（客戶端換地圖會斷線重連）；哪些 SN 要改成廣播（每一個都附 opcode 和依據）。
- 交付：約兩頁，放在 `docs/design/`。實作要拆成單人行為不變的小步驟，每一步回歸測試都保持全綠。

---

## H1：登入後 1 號機商店清單漏接

> **停放：不影響多人打完一場**（2026-09-18 roadmap 重排，未刪除）

> **狀態：2026-09-18 Claude 高階新增，未指派**

### 目標

找出重新登入進機庫後，1 號機商店清單沒有顯示、但切到 2 號機再切回就出現的真正原因，提出最小修正；新行為須放在預設關閉的開關後。

### 範圍

- 客戶端腳本 `ZPanel_ShopItems` 的 `ShopUpdate`、`ListLoad` 呼叫時機與頁面初始化狀態。
- 客戶端是否送出「商店開啟」或其他商店請求 CQ，以及伺服器對應的接收路徑。
- `Metal Rage Online Server/dispatch/room.dispatch.js` 中
  `Delayed ShopList refresh (initial default) slot=1 after 500ms` 路徑、`Slot_Change_SA` 後送出時機與相關 log／封包。
- 最近 session 中登入初始 1 號機與切換機體後的 `ShopList_SN 0x00240241`／`CashShopList_SN 0x00240242`。

### 背景

- [OBS] 2026-09-18 實測：重新登入進機庫後，1 號機主武器頁空白，只剩一個 `»X«` 佔位圖；證據為 [SHOT] `/home/lucas/mro-reverse/shots/g6d-relogin.png`。
- [OBS][SHOT] 切到 2 號機時商店正常滿列，證據為 `shots/g6d-mech2.png`；再切回 1 號機後清單出現。
- [LOG] 子 agent 比對 `session-20260918-071737.jsonl` 兩段連線，同位置 frame 逐位元組相同；筆數差異只對應購買觸發的 repaint，伺服器送出內容沒有差別。
- [CODE] `room.dispatch.js` 有 `Delayed ShopList refresh (initial default) slot=1 after 500ms`，目前懷疑送出時客戶端商店頁尚未建立。

### 限制

- 只做分析，不改程式、不改資料庫、不改 `docs/state.md`、不標 ✅。
- 不啟動或重啟伺服器，不請操作者測試；伺服器由 Claude 高階控制。
- 不先假定是時序問題；若需修改，只提出預設關閉開關的單一最小方案。
- 既有 ShopList 欄位偏移、G6d 完整 catalog 與 G6e 購買路徑不在本任務擴大修改。

### 交付

- 日誌 50–100 行，`docs/journal/INDEX.md` 追加一行並標「待審」，逐段對照登入與切換機體的實際 frame、客戶端腳本呼叫與 DLL／封包證據。
- 原始 decompile／組語與必要的封包 hex 存入 `docs/research/2026-09-17-backlog/H1/`。
- 提出最多兩個單變數實驗，並列出最小修正與預設關閉開關名稱；不實作、不測試。

### 完成條件

能以實際 session、腳本或組語證據說明為何登入初始 1 號機漏接而切換後恢復；若無法確認，明確列出未知點與阻塞，不猜時序或封包格式。

## H3：catalog 髒資料

> **停放：不影響多人打完一場**（2026-09-18 roadmap 重排，未刪除）

> **狀態：2026-09-18 Claude 高階新增，未指派**

### 目標

查明商店 catalog 中非法 ItemIndex 與期限／價格排序異常的來源，判斷是否應在送出前過濾非法項目、是否只販售代表項，並提出價格排序修法建議，不修改資料。

### 範圍

- catalog／item_catalog 表及其 seed、匯入或生成來源；追查 `ItemIndex=27430` 對應列與相關 item_id／category 欄位。
- `ShopList_SN 0x00240241`、`CashShopList_SN 0x00240242` 的建構路徑、ItemIndex 合法性與價格欄位。
- 2026-09-18 session 中 cat2 第一包及同一武器強化等級 01–08 的實際封包、log 與客戶端畫面。
- 若能取得原廠資料或客戶端 catalog／腳本，只作對照，不把推測當成原廠規則。

### 背景

- [LOG] 2026-09-18 送出的 cat2 第一包第一筆 `ItemIndex=27430`，不是合法 8 位 item id。
- [OBS] 商店中同一把武器的強化等級 01–08 價格全是 1000G。
- G6d 已確認完整 catalog 能讓客戶端自行過濾相容商品，但髒資料與強化品是否應顯示尚未裁定。
- [OBS][LOG] G6g 彈窗顯示 `3Day 62,210G` 高於 `30Day 27,650G`；`catalog` 價格依 item_id 末碼遞增填寫，但末碼順序不是期限天數順序（`08` 是 3 天）。
- [CACHE] `GameItemRecord +0x44` 有隨期限的值：1 天 337、3 天 1012、7 天 2362、15 天 5062、30 天 10125、60 天 20250、90 天 30375，永久為 0；兩把不同武器數值完全相同，因此 🟡／⬜，不可當成單品價格。

### 限制

- 只做分析與建議，不改資料庫、不改程式、不改資料、不改 `docs/state.md`、不標 ✅。
- 不啟動或重啟伺服器，不請操作者測試；未知資料保留完整 hex 與原始列值。
- 不擅自過濾商品、不改價格、不改 `SHOP_FULL_CATALOG_MODE` 或任何其他開關。
- 不把「合法 8 位」直接當成充分的客戶端合法性規則，必須提供 DLL／catalog／實際反應證據。

### 交付

- 日誌 50–100 行，`docs/journal/INDEX.md` 追加一行並標「待審」，列出髒資料來源、完整欄位、實際封包與客戶端處理結果。
- 原始 SQL／catalog 摘錄、decompile／組語與完整相關 hex 存入 `docs/research/2026-09-17-backlog/H3/`。
- 最多提出兩個單變數建議實驗，分別針對非法 ItemIndex 過濾與強化等級顯示；只提出方案，不執行。

### 完成條件

能追到 `27430` 與期限價格排序異常的資料來源，並以證據提出是否過濾／如何排序價格的待審建議；若真正價格欄位無法確認，明確保留未知，不猜 `+0x44` 的資料意義。

- **待審價格資料**：`catalog` 表價格與 Cache.Bin `DisplayPoint` 不一致，趨勢同構但數字約差 10%；分析是否應改用 Cache 的數字，暫不修改資料或程式。

## H6：房間難度燈慢一拍

> **停放：不影響多人打完一場**（2026-09-18 roadmap 重排，未刪除）

> **狀態：2026-09-18 Claude 高階新增，未指派**

### 目標

找出房間設定中難度燈慢一拍的真正原因，讓第一次按初級／中級／高級後，燈號立即對應所選 PvE map 的 `PlayPve` 值；只提出最小修正，先不擴大到其他房間 UI。

### 範圍

- 追蹤 `ZPage_Room.uc:680`、`ZPanel_PVE.uc` 的難度燈讀值，以及 `SN_MAP_CHANGE_ALL 0x00220226`／`SN_MAP_CHANGE_ONE 0x00220223` 到 `MapInfoList` 的寫入與事件觸發順序。
- 對照 `docs/journal/2026-09-18-13-map-change-order.md` 的 ALL／ONE 實測 frame、客戶端 log 與既有 `room-map.sender.js` 順序。
- 查明值已正確但畫面更新延遲一個選擇的原因；必要時保存完整 frame 與事件 log。

### 背景

- [OBS] R6 後目標回合已正確顯示 5／8／10，但難度燈仍慢一拍。
- [OBS][LOG] R7 與 R7b 都證明只要 ALL 排在 ONE 後就會覆蓋地圖選擇；因此送出順序不是可直接採用的修正，R7 開關維持 disabled。
- [SRC] 難度燈由 `MapInfoList[j].PlayPve` 驅動；目前缺的是事件、寫入與重繪之間的精確先後。

### 限制

- 先做 DLL／腳本／session 分析，不直接改程式、不改資料庫、不改 `docs/state.md` 或 `docs/HANDOFF.md`。
- 不把 R7/R7b 的失敗再標成成功；不得把 `MAP_CHANGE_ORDER_MODE` 打開。
- 不啟動或重啟伺服器，不請操作者測試；若提出實驗，最多兩個單變數、預設關閉。

### 交付

- 50–100 行日誌與 INDEX 待審列，列出難度燈讀值、ALL／ONE 完整封包與事件順序證據。
- 原始組語、腳本摘錄、完整相關 hex 存入 `docs/research/` 對應目錄。
- 最多兩個單變數修正／實驗建議；若無法定位，明確列出缺失證據，不猜時序。

### 完成條件

能以客戶端腳本或 DLL 證明燈號慢一拍的具體觸發點，並提出不改地圖選擇語意的最小預設關閉修正；否則只交分析與阻塞。

## H7：房間設定對話框地圖清單為空

> **待觀察**（2026-09-18 roadmap 重排）

> **狀態：2026-09-18 Claude 高階新增，未指派**

### 目標

找出 `ZPopup_RoomSet`／地圖選擇對話框清單仍為空的最後一個篩選關卡，讓 PvE 地圖可列出且人數控制切換到 PvE 版本；提出最小修正，不重做已驗證的房間同步路徑。

### 範圍

- 追蹤 `Account_MapList_Check`／`m_MapList`、人數範圍篩選與 `g_SelectMapInfo` 設定者的完整鏈。
- 對照 `docs/research/2026-09-18-room-setting/`、`docs/research/2026-09-18-map-list-zero/`，以及 R4／R9 日誌與實測結果。
- 查明 `g_SelectMapInfo` 何時、由哪個 Cache record 或事件設定；保留 `MapIndex < 1000`、人數陣列與 map type 的原始證據。

### 背景

- [OBS] R4 把 `SN_ROOM_DEFAULT` 首筆 entry 改成真實 map id 後仍是 4 VS 4、清單空；R9 已送 `MapInfo_SN 0x00210115` 的 9001–9012 十二筆仍無效果。
- [DLL][SRC] `Account_MapList_Check`／`m_MapList` 只是其中一關；完整鏈還包含人數範圍，而只有 `g_SelectMapInfo` 命中才切 PvE 人數陣列。
- [OBS] Gemini「伺服器從未送出 `0x00210115`」已由 session log 推翻；不要回到該錯誤前提。

### 限制

- 只做分析與最小方案，不改資料庫、不改 `state.md`／`HANDOFF.md`，不先動已驗證的四個 enabled 開關。
- 不重開伺服器、不請操作者測試；未知封包保留完整 hex，不猜 `g_SelectMapInfo` 的寫入格式。
- 若需修正，只提出預設關閉單變數開關；不得修改 `PVE_SLOT_SELECT_FLOW`、ItemInfo、G6、G7 或 `Grade_Info`。

### 交付

- 50–100 行日誌與 INDEX 待審列，逐關列出 `m_MapList`、人數範圍、`g_SelectMapInfo` 與清單生成條件。
- 原始反組譯、腳本摘錄、Cache／封包資料存入 `docs/research/` 對應目錄。
- 最多兩個單變數實驗建議；若無法確認最後關卡，只交分析及需要高階裁決的阻塞。

### 完成條件

能以 DLL／腳本／實際 log 證明清單在哪一關被丟掉，並給出不影響現有房間地圖同步的最小預設關閉修正；若不能確認，不猜格式、不改程式。

## P1：基礎主武器在庫存顯示兩把

> **停放：不影響多人打完一場**（2026-09-18 roadmap 重排，未刪除）

> **狀態：2026-09-18 操作者回報，未指派；先分析**

### 目標

找出庫存中基礎主武器看似出現兩把，是資料重複、不同 item 共用名稱／圖示，或客戶端重複列示；先不修改資料。

### 範圍

- 對照 account 1 的 `ItemInfo_SN 0x00210111`、`WearInfo_SN 0x00210113`、Package item 與 DB rows。
- 解析畫面上兩列對應的 serial、item_id、RepresentIndex、名稱與 ImageIndex；需要畫面辨識時請操作者提供完整截圖。
- 檢查 starter loadout、購買 insert 與 ItemInfo refresh 是否可能各建立同一件基礎武器。

### 背景

- [OBS] 一位不熟悉逆向進度的實際玩家指出基本主武器在庫存顯示兩把。
- [DB] account 1 的 mech 1／part 1 目前有七筆，但沒有相同 `item_id` 重複；`22100101` 只有 serial `100155` 一筆。
- [LOG] 登入 ItemInfo 與 WearInfo 均引用實際 serial；僅憑畫面相同不能判定 DB 重複。

### 限制

- 只分析，不刪 DB row、不改 starter data、sender、開關或 Cache，不標 ✅。
- 未取得兩列的 item_id／serial 前，不把「兩把」解讀成重複資料。
- 不掃描整個 `static/`；只讀與候選 item 直接相關的 Cache record。

### 交付

- 一篇待審日誌與 INDEX 待審列，列出兩列從 UI 到 ItemInfo／DB／Cache 的映射。
- 原始 packet／Cache 摘錄存 `docs/research/<日期>-duplicate-basic-main/`。
- 若確認重複，只提出一個單變數、可回復的後續修正。

### 完成條件

能指出兩列各自的 serial 與 item_id，並以資料鏈判定是合法不同物品、顯示碰撞或真正重複；證據不足時明列缺少的截圖或欄位。

## P2：PvE 只保留主武器、輔武與裝備回預設

> **2026-09-18 分析完成（🟡，高階初審）：** `Game_User_SN 0x00222112` 在 `session-20260918-214305.jsonl:522` 的 8 個 slot、6 個部位都送了非預設值；[SRC] `DefaultPlayerController.uc:874-907` 的 `ServerMechWeaponSet_MH` 會讀 Part[1..4] 全部武器欄位。伺服器端路徑沒找到錯誤。剩下沒排除的是「戰鬥中切換機體」（`Game_Slot` 由客戶端在本機切換，不經過伺服器）。**下一步：** 操作者在 PvE 裡切換到另一台已完整裝備的機體，截圖看武器，同時看 log 有沒有新封包。另外 `database/db.js:267` 的註解把 part 4／5 的標籤寫反了（數值沒錯），收斂時順手修正。

> **狀態：2026-09-18 操作者回報，未指派；先分析**

### 目標

找出機庫完整換裝已保存、但 PvE 出場只套用主武器的原因；區分 CQ 保存、DB、`Game_User_SN` 組包及遊戲生成機體四層。

### 範圍

- 以 `session-20260918-214305.jsonl` 的兩筆 `Slot_Change_CQ 0x00240107`、DB equipped rows與 `Game_User_SN 0x00222112` 做逐欄重播。
- 追蹤 `GAME_ITEM_INFO.Slot[].Part[]` 到 `DefaultGameInfo.RestartPlayer()`／`ServerMechWeaponSet_MH()` 的讀取順序。
- 核對 `Game_Slot_Set` 六個欄位的 part 語意與 sender 的 body/main/left/right/equipment/skin 對應。
- `Game_UserSocket_Set` 是強化石 socket 候選，不得未經讀取端證據就改成武器欄位。

### 背景

- [OBS] 其他機體完成裝配後進 PvE，只有主武器保留，輔助武器與裝備回到預設。
- [LOG] slot 1 CQ 最終送 `body=100154 main=200013 left=100219 right=200003 equipment=200005 skin=0`；slot 3 送 `body=100162 main=200010 left=200001 right=0 equipment=0 skin=0`。
- [DB] slot 1 五個非零欄位皆已保存；slot 3 保存 body/main/left，CQ 對 right/equipment 本來就是 0。
- [LOG][CODE] 開戰 `Game_User_SN` 從 DB 分別寫出 main／left／right／booster／skin，並非只組主武器。

### 限制

- 先分析，不改 DB、canonical defaults、`Game_User_SN` 或 slot change handler，不標 ✅。
- 不用 slot 1 與 slot 3 的觀察互相代替；每台機體逐欄對照。
- 若提出實驗，只能預設關閉且一次改一個 part offset／值。

### 交付

- 待審日誌、INDEX 待審列與一份 slot record 解碼表，附 DLL／SRC 位址及本場 hex。
- 說明資料第一次偏離使用者選擇的位置；最多提出一個單變數實驗。
- 原始重播資料放 `docs/research/<日期>-pve-loadout-parts/`。

### 完成條件

能逐一證明 body/main/left/right/equipment 從 CQ 到 PvE pawn 的值，定位第一個錯誤轉換；無法定位則列出必須再錄的單一機體／單一 part 測試。

## P3：困難潛入作戰實際仍走簡單流程

> **狀態：分析已交付（`docs/journal/2026-09-18-18-pve-hard-flow.md`，🟡 高階初審／只分析），根因與修正仍未裁定，未指派後續**

### 目標

找出房間已選 `9012／Round 10`、開戰 GameInfo 也正確後，實際仍只有三命且通關只涵蓋簡單段落的原因。

### 範圍

- 從 `Map_Change_One_CQ 0x00220221`、`Game_Info_SN 0x00222111`、travel URL 到 `ZSetCoreModePve`／`PveRoundManager` 逐段追蹤難度資料。
- 核對 `GameInfo.MapInfo.Round`、`DefNumLive`、`PveRespawnAddCount`、Campaign_CN／EndGame_SN 與主機端結束條件。
- 比較同一 `Map_PC04` 的 9010／9011／9012 Cache records，找出除 MapIndex／GoalDefault 外是否還有難度欄位或 URL option。
- 檢查是否由伺服器過早回 EndGame、客戶端 round manager 只建立五回合，或 map package 另需初始化資料；保留完整事件時間線。

### 背景

- [OBS] 玩家選困難後仍只有三條命，打通關內容只到簡單段落；中級／困難理應有後續階段與更多命。
- [LOG] 最後選擇 CQ `0034233c000a00000000`＝MapIndex 9012、Time 60、Round 10；SA／SN 也回 9012／10。
- [LOG] 開戰前兩次 `Game_Info_SN` body `010000000000010000000000000000020034230a000a00000000`＝map 9012、time 10、round 10。
- [SRC] `ZModePve.ModeReset_BD()` 以 `GameInfo.MapInfo.Round` 判斷完成；命數由 `DefNumLive + GAME_ITEM_INFO.PveRespawnAddCount` 設定，現行 bonus 為 0。

### 限制

- 不回頭改已證明正確的 room map CQ／SA／SN 或把 9012 降回 9010；不標 ✅。
- 先分析，不改 `Game_Info_SN`、Campaign handler、命數或 map package。
- 不把三命單獨視為 map 載錯；必須同時對照 round manager 與結束事件。

### 交付

- 一篇待審日誌、INDEX 待審列與完整的選難度→開戰→通關時間線。
- 9010／9011／9012 Cache 欄位差異表，以及 `DefNumLive`／round 上限來源說明。
- 最多兩個互斥、單變數且預設關閉的實驗建議；原始資料放 `docs/research/<日期>-pve-hard-flow/`。

### 完成條件

能指出 9012／Round 10 在哪一層失去作用，並提出不破壞已驗證房間同步的最小實驗；若證據不足，明列需要補錄的 Campaign／round／client log。

## P1b：預設武器不發實體物品（不急）

> **停放：不影響多人打完一場**（2026-09-18 roadmap 重排，未刪除）

> **狀態：2026-09-18 Claude 高階新增；操作者同意可改但不急。未指派。**

### 目標

新帳號不再把官方預設配裝（DefaultSetList）發成 `items` 實體列，改由客戶端自己合成的 `SerialIndex=0` 預設項承擔，消除庫存中同名預設武器重複（例如 1～5 號機各一把 `32100101`，共五把）。

### 範圍

- `database/db.js` `createAccount()` 的 `starterLoadouts`；WearInfo／`Game_User_SN 0x00222112`／`Slot_Change_SA 0x00240108` 中 part serial 為 0 時的語意。
- 先確認：WearInfo 送 serial 0 時，客戶端是否把它當成「裝備預設武器」並正確顯示與出場（`ZPanel_InvenItems.uc:338-383` 會合成 serial 0 項；`SlotInfo.Part[].SerialIndex == 0` 會標成 SORT_WEAR）。

### 背景

- [DB][LOG] P1 調查（2026-09-18）：帳號 1 的 `32100101` ×5 分別對應 mech 1～5 的 SubLeft，符合 DefaultSetList（`journal/2026-09-16-33`）。每筆 DB 列只送一次。
- [SRC] `ZPanel_InvenItems.uc:338-383`：客戶端依 DefaultSetList 為目前機體強制加入 `SerialIndex=0` 的預設項；伺服器送的 `HaveList` 另外列出，不依 `items.mech_type` 篩選。
- 另有舊測試殘留：`22100201`（serial 100221 mech 2、100222 mech 1）、`24100301`（200011、200012），另案清理。

### 限制

- 單變數：先只做「serial 0 能否代表預設武器」的離線／實測驗證，不動既有帳號資料；DB 變更一律寫成腳本；新行為放在預設關閉的開關後。

### 交付

- 待審日誌，含 serial 0 路徑的 SRC／DLL 證據；一個預設關閉的實驗開關提案。

### 完成條件

能證明（或否定）serial 0 足以讓預設武器顯示、裝備、出場；否定時寫明原因。

## C1：收斂 2026-09-18 通過的開關（期限 2026-09-25）

> **狀態：Claude 高階開立；前置條件 A6 黃金樣本回歸測試（`flash-wip-replay`）要先合併。未指派。**

### 目標

刪掉下列已 ✅ 的開關，只保留驗證過的那條路：`ROOM_TEAM_INDEX_MODE`（R11）、`ROOM_USER_NAME_ANSI_MODE`（R12）、`ROOM_LEAVE_RESET_MODE`（L1）、`MONEY_PERSIST_MODE`（M1）、`POST_BUY_SLOT_REFRESH_MODE`（M3a）。依據見 `docs/state.md` 第 4、4b 節。

### 範圍

- 只動這五個開關與它們的 disabled 分支；其他開關（含 `docs/reference/switch-audit.md` 裡確定不能開的）另開任務。
- 一併更新 `gate.game.dispatch.js` 的 `0x00220234` 註解（約第 915 行）與 marker 文字（約第 944 行）：目前寫「EXPERIMENT, purpose unconfirmed」，但 state.md 已確認它是 `Leave_CQ`（回 `Leave_SA 0x00220235`，依據 `journal/2026-09-18-20-room-leave-reset.md`）。這是純註解與 log 文字，單獨一個 commit；marker 文字改了會影響回歸樣本，要在遮罩或樣本說明裡註明。
- 在 `~/mro-wt/<名稱>` 開 worktree 做，不要在主目錄切分支。

### 限制

- 一個開關一個 commit。每個 commit 都要跑黃金樣本回歸，全綠才算數，並把回歸測試的輸出附在 commit 訊息裡。
- **只收斂「翻掉會讓回歸測試變紅」的開關。** 翻掉之後還是綠的，代表回歸測試沒涵蓋到它，這種開關先不動，等 A6b 做完再收。
- 不改任何行為。收斂後的輸出要跟開關為 enabled 時逐位元組相同。

### 交付

- 五個 commit，外加回歸測試輸出摘要。

### 完成條件

五個開關都從程式中移除；回歸測試全綠；`switch-audit.md` 對應列標為已收斂。
