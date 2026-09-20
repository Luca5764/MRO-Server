# 房主端 per-connection CurrentNetSpeed：找到印 log 的地方，10000 的來源仍未定位（2026-09-20 21:53）

中階唯讀分析任務，承 `2026-09-20-2030-same-machine-and-netspeed.md`／`2026-09-20-2130-netspeed-clamp.md`。原始資料見 `docs/research/2026-09-20-server-netspeed/engine-notifyreceivedtext-netspeed.md`。不標 ✅／❌，全部 🟡 待審，等高階核對。

## 背景（沿用主力提供，未重新驗證）

[TEST]（今晚，主力提供）：把兩份安裝的 `IpDrv.dll`（`UTcpNetDriver::StaticConstructor`，VA `0x10714693`/`0x1071469d`）兩個值都改成 100000 後——加入者 `stat net` 顯示 `Speed = 100000`（自己端變了），但**房主的 log 仍印 `Client netspeed is 10000`**，投射物缺口沒有改善。

## 1. `Client netspeed is %` 印在哪：找到了，但只在特定分支才會走到

`tools/disasm.py str "Client netspeed" Engine.dll` → UTF-16 字串在 file `0x3c5444`（VA `0x106c5444`）。`tools/disasm.py xref` 只有**一筆** xref：file `0x17f9cc`（VA `0x1047f9cc`），落在一個 `__thiscall` 函式裡（起點 VA `0x1047ec80`，很可能就是先前日誌認定的 `ULevel::NotifyReceivedText`——同一個函式在更早的位置就是先前日誌記錄的 `Clamp(v,1800,cap)`，VA `0x1047f9a4`，這次組語核對完全對得上）。

組語核對（逐行看過，見 research 檔案完整清單）：
- VA `0x1047f988-996`：對收到的文字（`[ebp+0xc]`）呼叫類似 `Parse` 的函式，找 token `"NETSPEED"`（VA `0x106a7fb4`，file `0x3a7fb4`，核對過內容確實是 UTF-16 `"NETSPEED\0"`）。
- VA `0x1047f998`：`je` —— **沒找到就跳到 `0x1047f9e6`，去檢查下一個 token（`"HAVE"`），這條路徑完全不碰 `connection+0x50`、也不印這行 log。**
- 找到的話：轉整數 → `clamp(v, 1800, NetDriver->MaxClientRate@+0x1168)` → 寫進 `[ebp+8]->+0x50`（connection 的 CurrentNetSpeed）→ 印 `"Client netspeed is %"`。

**結論：** 這行 log 只在收到的文字含 `"NETSPEED"` token 時才會出現。clamp 只會把「超過上限」的值往下夾；10000 本身小於被修補後的 100000 上限，**夾不出 10000**。所以「兩端 IpDrv.dll 都改到 100000 後，房主仍印 10000」這個現象，不是這段 clamp 邏輯能解釋的——10000 這個數字是在呼叫 Parse **之前**就已經在「收到的文字」裡了，不是這裡算出來的。

## 2. IpDrv.dll 對 `+0x1168`／`+0x116c` 只有一組引用

對 IpDrv.dll 全檔位元組搜尋 dword `0x1168`／`0x116c`：**各只有一筆**，就是已知的 `UTcpNetDriver::StaticConstructor`（VA `0x10714693`/`0x1071469d`）。IpDrv.dll 裡沒有任何別的地方讀寫這兩個欄位——換句話說，如果「connection 建立時預設值」真的是從 `NetDriver->MaxInternetClientRate` 複製到 `connection+0x50`，那段程式碼**不在 IpDrv.dll**，應該在 Engine.dll 的 base class `UNetConnection` 初始化路徑，但**沒能在時間內定位到**（Engine.dll 對 `+0x1168`/`+0x116c` 的引用有十幾筆，看起來多數是同一份「大結構逐欄位複製」樣板碼，CDO→instance，沒能篩出哪一筆對應 connection 初始化）。

另外對 Engine.dll 全檔搜尋「直接把字面 10000 寫進某物件 `+0x50`」的機器碼樣式（`c7 xx 50 10 27 00 00`）：**0 筆命中**。所以也不是一個寫死的立即數。

## 3. 沒查完的：客戶端送的文字裡到底有沒有 `"NETSPEED"` token

如果登入時客戶端根本沒送這個 token（前一篇日誌已指出客戶端組的 URL 是 `IP:port/Map?team=0`，沒有 `NETSPEED=`），那整個第 1 節的 clamp 分支**從未執行**，房主印出的 `Client netspeed is 10000` 另有印出點，還沒找到（xref 只找到這一處，但不排除有第二個 debugf 呼叫點用同一個格式字串指標、只是這次搜尋方式沒抓到，或者這行 log 其實是 `netspeed` 主控台指令走的路徑，而非登入路徑——兩者共用同一段程式碼是我的推論，沒有反向證據，也沒有正向證據）。

順帶一提：`?execSetNetSpeed@APlayerController@@QAEXAAUFFrame@@` 這個 mangled 字串存在於 Engine.dll `.data`（file `0x4a6c4b`），但**組語層級查不到任何 xref**，大概率只是連結器留的除錯符號，沒有追下去。

## 給下一位（高階或下一輪中階）

1. **卡在哪：** connection `+0x50` 的「建立時預設值」寫入點（推測在 Engine.dll 的 `UNetConnection::InitConnection` 或建構式）沒定位到；10000 這個數字實際從哪個記憶體位置/常數來的，還是未知。
2. **下一步建議：**
   - 拿一份含登入封包的 hex dump（[LOG] 或封包 capture），確認客戶端的登入文字裡到底有沒有 `"NETSPEED"` 這個 token——如果沒有，第 1 節的分支可以直接排除，省掉後面繼續猜的時間。
   - 對 Engine.dll 用更精細的方式篩選 `+0x1168`/`+0x116c` 的十幾筆引用，逐一分類出哪些是「CDO→instance 複製樣板」、哪些是「connection 初始化專用」。
   - 若上述都查不出，改用 runtime 觀測手段（附加除錯器讀 `connection+0x50` 在 accept 當下的值）可能比純靜態分析快，但這超出唯讀分析／不碰客戶端的範圍，要另外談。
3. **跟既有 ✅ 沒有矛盾**，本輪找到的是新細節，補強 `2026-09-20-2130-netspeed-clamp.md` 的 clamp 描述（那篇講的是「netspeed 指令」與「NETSPEED token 找到時」的夾值上限，本篇補上「找不到 token 時完全不碰這個欄位」這條路徑）。
