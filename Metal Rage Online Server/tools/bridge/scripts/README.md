# BRIDGE-SPIKE 階段 2 腳本

契約：`docs/backlog.md` `BRIDGE-SPIKE`（2026-09-22 二次修訂，階段 2 改為實作）。
位址與資料結構依據：`docs/research/2026-09-22-bridge-spike/stage2-addresses.txt`
（中階 explorer 唯讀反組譯，組語逐一核對；**未經跨公司審查**）。
沿用階段 1 的載入路徑：`docs/journal/2026-09-22-1820-bridge-stage1.md`。

**這份 README 與三支腳本都只做到「語法檢查過」，沒有在實機上跑過。**
結論一律標 🟡／待驗，實跑與過關判定由主力做。

## 三支腳本各做什麼

### `bridge-lib.js`

不是可載入的 gadget 腳本，是共用邏輯的「單一事實來源」（參考用）。
gadget 的 script 模式是否支援 `require()` **未驗證**，為了不讓一次載入失敗連累兩支
真正要用的腳本，`bridge-scene.js` 與 `bridge-fire.js` 各自把需要的函式**複製貼上**進
檔案開頭，沒有互相 import。**改邏輯要三份一起改**（這裡 + 兩支腳本裡的複本）——這是
唯一的代價，換來的是任何一支腳本都能單獨丟給 gadget 用而不必擔心模組解析失敗。

### `bridge-scene.js`

每秒寫一行目前場景編號到 `bridge-scene.log`。掛 `ZNetwork.dll + 0x38910`
（`UZNetwork_DJ::Scene_Change`），第一次呼叫時把 `this`（ecx）快取起來，之後直接讀
`this + 0x38c`（1 byte）。快取拿到之前印 `scene=unknown (waiting for Scene_Change)`；
Scene_Change 每次被呼叫的當下也會馬上多印一行 `scene_change old=... new=...`，這樣
切換的**時刻**跟每秒的**狀態**都留得下來。

已知場景值（見 stage2-addresses.txt）：`0`=斷線/未登入、`1`=Waiting、
`4`=房內某分支（語意⬜）、`5`=Room/結算、`6`=Game 戰鬥中。

### `bridge-fire.js`

掛 `Engine.dll + 0x2234b0`（`AActor::ProcessRemoteFunction`），從 `args[0]`
（`UFunction*`）解出函式名字，數兩類：名字含 `ServerFire`（加入者端送出）、
含 `ClientFire`（加入者端收到）。同時對**所有**經過的函式名字做普查
（不管是不是 Fire），這是刻意要的——除了驗證 FName 解析鏈走對之外，也讓我們看到
實際上有哪些 RPC 在流動。

寫到 `bridge-fire.log`，格式是「視窗計數」：每 5 秒（`FLUSH_MS`）flush 一次，
寫一行摘要（`calls=` 總呼叫數、`ServerFire=`、`ClientFire=`、`unresolved=`、
`distinct_names=`），接著是依次數排序的普查明細（`  census <name>=<count>`）。
**flush 完就歸零**，所以每一行 log 代表的是「這 5 秒內」，不是從程式啟動以來的累計；
要看累計自己加總。`nameCache`（指標→名字）例外，它是跨視窗保留的，因為同一個
`UFunction*` 在整個行程生命週期內名字不會變，重新解析沒有意義。

**逐筆記錄開關 `MRO_FIRE_VERBOSE`**：預設 `false`。開啟方式是**直接改檔案裡的常數**
再重新部署，沒有走環境變數——gadget script 能不能讀到宿主行程的環境變數未驗證，
與其猜一個可能不存在的 API 不如用最保守的做法。開了之後每個視窗最多記
`VERBOSE_MAX_LINES_PER_WINDOW`（預設 2000）筆逐筆記錄，超過的部分只計數
（`verbose_overflow=`），避免 verbose 開著時單一視窗記憶體無限長。

## 怎麼換腳本

沿用階段 1 的 gadget 部署方式（`C:\Games\MetalRage Online 3\data\System\`）：

1. 把要用的那一支（`bridge-scene.js` 或 `bridge-fire.js`，**一次只選一支**）複製到
   `data\System\`，檔名可以沿用階段 1 的 `bridge-stage1.js`，或另外命名，
   但要跟 gadget 的 `.config` 裡指的路徑一致。
2. 編輯 `frida-gadget-*.config`（階段 1 已經放好一份範例），把 `"script"` 欄位指到
   這支腳本的絕對路徑。
3. 兩支腳本的 log 各自獨立（`bridge-scene.log` / `bridge-fire.log`），
   **不會**互相覆蓋，也不會覆蓋階段 1 的 `bridge-gadget.log`。
4. 目前沒有「兩支腳本同時載入」的機制——`.config` 一次只能指一個 `script`。
   如果要場景與開火同時記，需要另外寫一支合併腳本（把兩支的 hook 都掛上），
   這次沒做，見下面「還沒驗證的事」。

## 已知風險（我的判斷，不是客套）

**最可能在實機上出問題的是 `bridge-fire.js` 的呼叫頻率，不是位址算錯。**
位址（`0x2234b0`／`0x38910`／`0x24`／`0x1ca6fc`／`0xc`）都是組語核對過的，出錯的機率
比較低；真正的風險是：

1. `ProcessRemoteFunction` 是所有 RPC-like UFunction 呼叫的共同入口，戰鬥中賓果會有
   移動同步、生命值同步等一大堆非 Fire 的 RPC 一起經過這個 hook，即使 onEnter 已經
   薄到只剩「查 Map + 加計數」，呼叫頻率本身（可能每秒數百到數千次）疊加 Frida
   `Interceptor.attach` 本身的 trampoline 開銷，**有可能拖慢 frame rate 或造成明顯輸入
   延遲**，這是純腳本邏輯層面看不出來、只有實跑才知道的事。階段 1 只驗過「不掛任何
   hook」的情況，加了熱路徑 hook 之後保護機制（XIGNCODE）跟效能的反應都是新變數，
   建議先在 Waiting／Room 場景（RPC 量少）驗證，再進戰鬥場景。
2. `nameCache` 用 `ufunctionPtr.toString()` 當 key——如果同一個記憶體位址在行程生命
   週期內被不同的 `UFunction` 重複使用（理論上 UFunction 是靜態/CDO 等級的物件，
   不應該發生，但沒有實際觀察驗證），快取會回傳過期的名字。目前判斷風險低但沒驗證。

## 還沒驗證的事

- ⬜ gadget script 環境是否支援 `require()`（因此 `bridge-lib.js` 用複製貼上迴避，
  沒有實際測試過兩種寫法哪個能跑）。
- ⬜ gadget script 能不能讀到宿主行程的環境變數（因此 `MRO_FIRE_VERBOSE` 用寫死常數）。
- ⬜ 兩支腳本都只在**語法層面**驗證過（`node --check`），完全沒有在真正的 gadget /
  V8 或 QuickJS runtime 裡跑過，Frida 的 `Interceptor`、`File`、`Module` 等 API
  在 gadget 環境裡的實際行為（尤其是例外處理的細節）沒有實機確認。
- ⬜ `bridge-scene.js` 讀到的 `this.context.ecx` 是否真的在 `Scene_Change` 生命週期內
  穩定不變（stage2-addresses.txt A3 判斷它是 CDO 單例，但沒有在 Frida 裡實際比對
  `GetDefaultObject` 拿到的值）。
- ⬜ `bridge-fire.js` 對戰鬥場景的實際效能衝擊（見上「已知風險」第 1 點）。
- ⬜ 場景值 `4` 的語意（房內某分支）沒有深究，`bridge-scene.js` 只是如實記錄，
  不代表這個值的意義已經確認。
- ⬜ `ServerFire`／`ClientFire` 的字串比對用 `indexOf`（含即算），沒有反查客戶端 .u
  腳本確認實際的 UFunction 名字清單長什麼樣（stage2-addresses.txt B6 指出這兩個函式
  是純 UnrealScript，DLL 裡沒有獨立符號），普查輸出的用途之一就是拿來核對這個假設。
