# 觀測與分析工具

> 參考文件，需要時才讀。規則與陷阱摘要在 `AGENTS.md`。
> 2026-09-17 從 `AGENTS.md`「封包紀錄（觀測工具）」與 `docs/HANDOFF.md`「工作方法」 原文搬來。

## 封包紀錄（觀測工具）

`packetlog.js` 在 `client.js` 的收發咽喉點各掛一個 hook，把**每一個封包、雙向**寫成 JSONL，一行一筆。這是加在既有 console 輸出**旁邊**的，那 190 多個 `console.log` 一個都沒動。

每筆帶：時間戳、相對毫秒、連線編號、port、方向、opcode、長度、完整 body hex，以及當下的場景狀態快照（`accountId`／`roomIndex`／`mapId`／`gameMode`／`gameStarted` 等，沒設的欄位自動省略）。另外會記 `connect`／`close`／`marker`，以及沒有任何 service 認領的 `unhandled`。

**寫入是同步的，這是刻意的。** 一個 session 裡最有價值的封包通常是客戶端崩潰前的最後一個，那正是有緩衝的 stream 會弄丟的那一個。

### Marker：把「我做了什麼」釘進時間軸

Marker 有三個來源，紀錄裡會標明是哪一種。

**1. 遊戲內聊天（推薦）** — 在遊戲聊天框打的每一句話都會自動成為 marker。不用 alt-tab，而且它就落在自己所描述的封包旁邊。這是實際操作中最好用的方式。

**2. 伺服器 console** — 直接在終端機打字按 Enter。非互動終端會自動略過，用 .bat 或背景跑不受影響。

**3. 自動（`src: auto`）** — 伺服器在自己看得到的狀態轉換時自行標記，操作者不用做任何事。戰鬥中根本沒空打字，所以這些邊界由伺服器自己劃：

- `gameStarted_` 由 false 轉 true
- 跨重連還原 session
- 送出 `Ready_Host_SQ` / `Ready_Success_SN` / `BeginRound_SN` / `Game_Start_SA` / `Game_Start_SN`

**Marker 框的是區間，不是瞬間。** 動作前後各打一個，中間全部就是候選。更有效的做法是**一次 session 只做一件事**——紀錄檔很便宜，髒了就丟掉重錄。

### 自己看畫面

```bash
tools/win/shot.sh                  # 截遊戲視窗
tools/win/shot.sh --full           # 截整個桌面
tools/win/drive.sh click 512,300   # 點擊（視窗相對座標）
tools/win/drive.sh key '{F5}'
tools/win/drive.sh type '進訓練場'  # 打進遊戲聊天框 → 自動成為 marker
```

**為什麼要有這個：** 這個專案的判斷大量依賴「畫面上發生了什麼」，而轉述過的畫面不是觀察。曾有一張只框到標題列的截圖被當成「畫面全白」，據此做了兩次錯誤的回歸判定，再據此建立了一整套錯誤的場景切換理論——台帳裡連續數條記錄因此作廢。

> **`drive.sh` 的鍵盤輸入對本客戶端無效**，成因未定（見台帳）。同樣的方法對記事本完全正常，所以不是工具壞掉。保留是因為它對其他視窗可用，但**不要期待能自動操作遊戲**。截圖才是這組工具的價值所在。
>
> `drive.sh` 會**奪取前景並移動滑鼠**，等於接管機器。操作者正在使用電腦時不要跑。
>
> 只用作業系統層級的輸入，**不注入行程、不附加除錯器**——客戶端有 y0da、Themida 與 anti-attach，那條線本專案不碰。

### 客戶端自己的 log

`C:\Games\MetalRage Online\data\Log\MetalRage.log`（WSL 路徑 `MetalRage/data/Log/MetalRage.log`）。

**不要忽略這個檔案。** 它是單位元組編碼（不是 UTF-16），客戶端持續寫入，內容包含 `ScriptLog` 與引擎的 `Browse`／`LoadMap` 記錄——也就是**客戶端如何理解目前狀態**，這是封包看不出來的。開戰流程卡關的關鍵發現就是從這裡讀到的（客戶端組出的 travel URL 全是預設值）。

崩潰時它也會寫下完整的 `Critical:` 呼叫堆疊。

### 查紀錄

```bash
cd "Metal Rage Online Server"
node tools/slice.js                        # 列出所有 session
node tools/slice.js <檔名>                  # marker 清單 + opcode 統計
node tools/slice.js <檔名> -m 2             # 切出 marker 2 到 marker 3 之間
node tools/slice.js <檔名> -m 2 -s          # 同上，只要 opcode 次數
node tools/slice.js <檔名> --unhandled      # 只看沒人認領的
node tools/slice.js <檔名> --op 0x00250102  # 只看某個 opcode
node tools/slice.js <檔名> --dump           # hex 改用 offset dump 排版
```

> **注意：`send` 方向的長度是實際上線位元組，含填充。** `getMessageBuffer` 會補到 16-byte 對齊，所以一個邏輯上 6 bytes 的 EVENT_INFO 在紀錄裡會顯示 16 bytes、後面拖 10 個 `00`。這是對的（線上真的是這樣），但不要誤判成 body 結構。

## 調查新 opcode 的標準流程

1. 啟動伺服器，**先在 console 打一行 marker** 描述你接下來要做什麼
2. 在客戶端做一個**單一、明確**的動作，然後再打下一個 marker
3. `node tools/slice.js <檔名> -m <編號>` 切出那個動作造成的所有封包
4. 用 `--unhandled` 找出沒人認領的，記下：觸發動作、opcode、body 長度、hex
5. 比對 DLL 字串裡的候選名稱，形成假設
6. 寫一個最小回應試打，觀察客戶端是否前進或斷線
7. 不論成功與否，都寫一篇日誌（`docs/journal/`）；高階另外更新 `docs/state.md`

**失敗的嘗試和成功的一樣有價值**，請一併記錄，避免未來重複試同一條死路。

## 工作方法(這條最重要)

**猜一次封包布局的成本是一整個測試場次;讀一次客戶端的程式碼是一分鐘。**
所以規則是:先反編譯,再改程式。這個專案的每一次重大進展都來自讀 DLL,
每一次浪費掉的場次都來自猜。

### 找「客戶端送出」的封包
不要在客戶端的 dispatcher 裡找——dispatcher 只列 server→client。
要搜尋把 opcode 寫進 Format 結構的那條指令:

```python
# 在 .text 裡線性掃描,找 mov [...], <opcode>
# 三處引用是標準形狀:一個 [ecx+0xc] 建構子 + 兩個全域 send 站
```

這樣一次就把 `Timeout_CN` / `BeginRound_CN` / `Battle_Success_CN` 三個全部命名出來。

### 反編譯

```bash
cd "Metal Rage Online Server"
tools/ghidra/decompile.sh 0x107d8ae0          # 自動找出包住該位址的函式
DLL=Engine.dll tools/ghidra/decompile.sh 0x...
tools/disasm.py exports ZNetwork.dll 'Game_User'   # 符號齊全,用名字找位址
tools/disasm.py at 0x107d8ae0 130                  # 組語
tools/disasm.py str 'MapIndex'
```

⚠ **匯出表位址是 thunk。** `tools/disasm.py at <export>` 只會看到一條 `jmp`,
要再跳一次才是本體。`decompile.sh` 會自己處理。

⚠ **Ghidra 的參數順序與 stack 變數命名會出錯。** 在 `Game_Info_SN` 上它把 p2/p3 與
p8/p9 對調;在 `Game_User_SN` 上它把記錄偏移整批位移了 4 bytes。
**凡是要寫進封包的偏移,一律回頭看組語確認。** 驗算方法:結構通常緊密打包,
算算看總長度對不對(例:`0x6D + 8 × 0x2F = 0x1E5` 剛好等於記錄大小)。

### 封包記錄

```bash
node tools/slice.js                 # 列出 marker 與 opcode 直方圖
node tools/slice.js --unhandled     # 只看沒有 handler 的,含 body dump
node tools/slice.js --op 0x230111 --dump
```

記錄是 JSONL,同步寫入,所以**崩潰前最後一個封包也留得住**。
在遊戲裡打字聊天會被記成 marker(Big5 解碼),可以用來標記「我現在按了 F5」。

### 一次只改一個變數
ledger 裡有一條方法學紀錄,是因為曾經一輪改兩處,症狀變了卻無法歸因,浪費一個場次。
真的要同時改兩項時,先確認兩項的**觀察特徵互斥**,並在日誌寫明怎麼分辨
(本輪就是這樣做的:`TimeLimit=` 對應一項,`team=` 對應另一項)。

### ledger 的證據標記（已被 AGENTS.md「證據標籤」取代）
`✅ 已確認` / `🟡 假設` / `⬜ 未知` / `❌ 已排除`,來源標 `[DLL]` `[OBS]` `[TEST]` `[GUESS]`。
**推翻自己的結論也要寫進去**(用追加更正的方式),舊 ledger 裡已經有好幾條是我自己的錯誤更正——那些比正確答案更省時間。

## 黃金樣本回歸測試

`node test/replay-golden.js`（在 `Metal Rage Online Server/` 底下）：把已驗證 session 的 C→S 封包餵給目前的 dispatch 程式，逐位元組比對輸出與存下的基準。DB 用固定的假資料（`test/fixtures/fake-db.js`），不連正式 DB。`--record <樣本>` 重建基準，只有在**有意改變行為**時才能這樣做，而且要在 commit 訊息寫明原因。worktree 要先 `ln -s /home/lucas/mro-reverse/MetalRage <worktree>/MetalRage`，否則讀不到 Cache.Bin。細節見 `test/README.md`。重構、開關收斂、改名，都要先跑它全綠。
