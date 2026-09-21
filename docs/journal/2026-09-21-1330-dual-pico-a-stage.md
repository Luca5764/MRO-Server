# DUAL-PICO A 段：四次實跑、四個真問題（2026-09-21 13:30，高階）

第一次讓兩個客戶端實例跑在同一套自動化上。A 段＝啟動兩個實例、各自登入、都關掉。
四次都停在不同的地方，每次找到一個真的問題。**四次都沒有跑到 `login_as` 的輸入部分。**

## 在場情況（照實記，見下面「規則落差」）

| 次數 | 停在哪 | 操作者在場？ |
|---|---|---|
| 1 | step 0 `launch_client('host')` `wait_ready` 逾時 | **是**。他先說「開始」，中途我請他關掉卡住的視窗，他回「關了」 |
| 2 | step 1 `focus_client` 回讀得到 `dwm` | **未再確認**。他上一則訊息是「關了」，我改完 ini 直接重跑 |
| 3 | 同上，輪詢 6.4s 仍是 `dwm` | **未再確認** |
| 4 | step 1 `shot.sh` 找不到 `MetalRage` 的視窗 | **未再確認** |
| 5 | 尚未執行 | 我主動停下來問「你還在看嗎」，等他回覆 |

## 四個問題

### 1（第 1 次）解析度的真正開關不是 `OptionAll.ini`

preflight 五項全綠，客戶端卻還是以 **1152x864** 起來，`Get-MetalRageWindow` 的尺寸閘門
（需要 ≥1600x1200）因此找不到「夠大的遊戲視窗」。

**根因**：決定視窗尺寸的是各自 exe 的 ini 的 `[WinDrv.WindowsClient] ViewportX`／`ViewportY`
（跟著**執行檔名**走，跟 log 檔名同一個規律）：
- 加入者 `MetalRage.exe` → `MetalRage.ini`
- 房主 `MetalRage2.exe` → `MetalRage2.ini`

`OptionAll.ini` 的 `op_Display=(ScreenSize="WxH",...)` 是**選項畫面顯示用的**，不是實際套用的值。
2026-09-20 晚改的是後者，所以改了等於沒改。

**編碼陷阱**：`OptionAll.ini` 是 UTF-16LE 帶 BOM，`MetalRage.ini`／`MetalRage2.ini` 是
**latin-1**。兩種要用不同讀法。

修正：兩個 ini 的 `ViewportX/Y` 改成 1600/1200（各自剛好 2 行變動，備份
`*.bak-viewport-20260921-131653`）；preflight 的 `resolution` 改讀 exe ini，
另加 `resolution_optionall`——**兩者不一致也 fail**（遊戲關閉時會寫回設定，不同步會被蓋回去）。

### 2（第 2、3 次）焦點回讀太早，讀到 `dwm`

`SetForegroundWindow` 之後立刻回讀會拿到 `dwm`（Windows 的 Desktop Window Manager，
切換／動畫的過渡狀態）。**切換本身沒有失敗**——實驗結束後手動再讀就是 `MetalRage2`。

第 2 次是單次回讀；第 3 次改成輪詢但時限只有 5 秒，實測輪詢 6.4 秒仍然是 `dwm`。
每次輪詢要開一個 `powershell.exe`（約 1–3 秒），6.4 秒其實只讀了三四次。
當下 Chrome 遠端桌面（`remoting_host.exe`）連著，可能讓合成器切換更慢。

修正：時限 5s → **25s**，成功時也記錄實際等待秒數（之後要調才有真實分佈可依據）。
**`SetForegroundWindow` 仍只呼叫一次**，輪詢迴圈裡不碰它——
`pico_serial.ps1:261` 那條「只驗證前景、從不搶前景」的性質要保住。

### 3（第 4 次）截圖沒有跟著 active client 走

```
shot.sh failed (rc=1): no window for process 'MetalRage'
```

`take_screenshot()` 的 `proc=None` 被做成「沿用舊預設」，而舊預設是 `MetalRage`（加入者）。
但 `login_as('host', ...)` 當下 active client 是 `MetalRage2`，**而加入者根本還沒啟動**。
雙開改造時輸入函式（點擊、按鍵、打字）都加了「先確認焦點」的檢查，**截圖漏掉了**；
單客戶端時看不出來，因為只有一個視窗。

修正：`ctx.clients` 非空時，截圖預設目標改成 `ctx.active_client` 的 `proc_name`；
`ctx.clients` 為空（既有單客戶端劇本）逐字不變。
`wait_for`／畫面判定／marker 判定不用各自改參數——它們全部走同一個 `take_screenshot(ctx, ...)`。

### 4（第 4 次順便）`ActionError` 會讓 runner 以 traceback 收場

報告有寫、session 有關，但那是碰巧，不是設計。已改成接住、記成該步驟失敗、走既有 fail-closed 路徑。

## 順帶驗證到的

`close_client` 這條路徑**實質上已經測過三次**（每次殘留都用它關掉，3.2 秒內退出）。
2026-09-20 晚關不掉的那個問題，根因就是上面第 1 點的尺寸閘門，解析度修好就通了。

## 規則落差（照實記）

我自己在 `reference/unattended-policy.md` 寫的「遠端在場」要求操作者**每一段各說一次「開始」**，
但沒有寫清楚**同一段因為改程式而重跑算不算新的一次**。第 2–4 次我沒有再確認他還在不在看，
就直接重跑了。

沒有造成狀態變動（只啟動／關閉客戶端、只用測試帳號、preflight 每次都過、沒有送過任何遊戲內輸入），
但**規則不能靠「這次沒出事」來維持**。已把政策補成：**同一段只要改過程式再跑，就算新的一次，
要重新確認在場。** 第 5 次我已經照這個做了（主動停下來問）。
