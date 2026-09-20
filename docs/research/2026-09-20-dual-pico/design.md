# DUAL-PICO 設計稿：同機雙客戶端無人值守（2026-09-20，高階）

狀態：**設計稿，待 PM 過目後才派 worker 實作。** 依據是兩份唯讀盤點
（explorer，2026-09-20 晚），引用的行號都來自那兩份回報。

## 0. 不變式（先寫死，實作不准偏離）

1. **只有一支 Pico、一套實體鍵鼠 → 輸入天生序列化。** 不做「同時操作兩個視窗」，
   只做「輪流」：任何時刻只有一個實例是 active，所有輸入都先確認前景是它。
2. **模型不在迴圈裡。** 完成條件優先用伺服器 session log 的 `pkt` 記錄（有 `conn` 可歸屬），
   畫面分類只當輔助與「非預期畫面就停」的守門員。
3. 不改伺服器行為、不改任何客戶端檔案（副本現有的 `IpDrv.dll` 修補維持原狀）、不碰
   `MetalRage.exe`。
4. 只用標 `isTest` 的帳號。
5. 無人時段得到的結論一律 🟡。

## 1. 實例模型

```
CLIENTS = {
  "host":   proc "MetalRage2",  dir "C:\Games\MetalRage Online 2",
            launcher "Play Second Client.bat",  IpDrv.dll 已修補(100000),
            account <第二測試帳號>
  "joiner": proc "MetalRage",   dir "C:\Games\MetalRage Online",
            launcher "Play Metal Rage Online.bat", 原廠,
            account mrotest
}
```

每個實例的執行期狀態：`id / proc_name / install_dir / launcher / engine_log /
game_log / account / conn_id`（`conn_id` 登入後才填，見第 4 節）。

**角色分配的理由**（kickoff 指定，不要對調）：副本的 `IpDrv.dll` 已把
`MaxClientRate`／`MaxInternetClientRate` 改成 100000，所以副本當**房主**才有意義——
`GameInfo.uc:1504` 的 `ClientCapBandwidth()` 是房主的值去蓋加入者。加入者用原廠主安裝，
才能量到「客戶端自己送出的值是多少」。

## 2. 基礎設施改動（worker 要動的檔案，按風險由低到高）

| # | 檔案 | 現況 | 改法 |
|---|---|---|---|
| I1 | `tools/win/shot.sh:17,19-25` | `ARGS=(-Proc MetalRage)` 寫死，參數迴圈只認 `--full`／`--name` | 加 `--proc NAME`，透傳給 `screen.ps1`（它的 `param()` 本來就有 `-Proc`） |
| I2 | `tools/win/screen.ps1:70-80` | 只有 `-Proc` **精確等於** `"MetalRage"` 才走 `Get-MetalRageWindow`（EnumWindows 找同行程最大可見視窗）；其他值落入舊版 `MainWindowHandle` 邏輯，而那個舊邏輯 2026-09-19 實測會抓到啟動畫面 | 把 `Get-MetalRageWindow`（41-67 行）參數化成吃行程名，**任何** `-Proc` 值都走它；舊路徑刪掉或只留在明確指定時 |
| I3 | `tools/pico/pico_serial.ps1` `Test-ForegroundGate`（約 229-284） | 硬編 `$fgProc.Name -ne "MetalRage"` → Blocked | 允許的前景行程名改成可設定的**單一值**，由 `pico_ctl` 在切換 active 實例時寫進 session 狀態。維持 fail-closed：值沒設就 Blocked |
| I4 | `tools/pico/client_ctl.ps1:39-41` | `$ProcName`／`$BatPath` 寫死主安裝 | 加「目標實例」參數，行程名與 launcher 從實例表來 |
| I5 | `tools/pico/client_ctl.py:94,241-282` | `CLIENT_LOG_WSL` 寫死主安裝的 `MetalRage.log` | 依實例選 log；讀檔頭 `Init: Base directory:` 驗證這份 log 真的屬於該實例（見第 6 節 P1） |
| I6 | `tools/pico/actions.py:164-171` `Context` | 全域單例，沒有「哪個客戶端」欄位 | 加 `clients`（實例表）與 `active_client`；所有輸入動作先經 `focus_client` |
| I7 | `tools/pico/actions.py:1217-1275` `find_pkts_since` | 只按 `since_ms` 篩，不看 `conn` | 加 `conn=` 過濾；新 helper `resolve_conn_id(account)` |

**`screen.ps1:83` 的 `SetForegroundWindow` 已經是通用的**，`$hwnd` 來自 `-Proc` 分支——
所以 I1+I2 做完，「把指定實例叫到前景」就不必新寫任何 Win32 呼叫。

## 3. 新動作清單

每一個都是 `actions.py` 的新函式，簽名照既有慣例 `fn(ctx, **params) -> ActionResult`。

| 動作 | 做什麼 | 完成條件（主／輔） | 逾時 |
|---|---|---|---|
| `focus_client(id)` | `shot.sh --proc <proc>` 把該實例叫到前景，寫進 `ctx.active_client`，同步更新 I3 的允許前景行程名 | **主**：回讀前景行程名 == 目標；**輔**：截圖能分類成已知畫面 | 10s |
| `launch_client(id)` | 用該實例的 launcher 啟動 | **主**：該實例的 log 出現檔頭且 `Init: Base directory:` 指向該實例的安裝目錄；**輔**：畫面分類 == `login` | 120s |
| `close_client(id)` | 關掉該實例（讓客戶端 log 完整 flush） | **主**：行程消失 | 30s |
| `login_as(id, account)` | `focus_client` → 既有 `login()` 流程 | **主**：session log 出現該帳號的登入 pkt（`0x00110151` recv），並由它**取得並記下 `conn_id`**；**輔**：畫面 == `lobby` | 90s |
| `join_room(id, room_name)` | 大廳房間清單點選 → 加入 | **主**：`conn` 過濾後該實例收到房間相關 pkt；**輔**：畫面 == `room` | 45s |
| `set_ready(id)` | 房內按準備 | **主**：`User_State_SN 0x00220401` 對應 pkt；**輔**：截圖 READY | 20s |
| `host_start_battle()` | `focus_client(host)` → F5 | **主**：`Game_Start_SN` 送出的 pkt（**不要只靠 `gameStarted_ false -> true` marker，見第 5 節 L1**）；**輔**：雙方畫面 == `battle` | 120s |
| `console_cmd_on(id, text)` | `focus_client(id)` → F24 開主控台 → 打字 → Enter → ESC | **主**：該實例的客戶端 log 出現對應回應行；**輔**：主控台開／關的截圖 | 30s |
| `leave_battle(id)` | 離開戰場回房 | **主**：`conn` 過濾後的離開 pkt；**輔**：畫面 == `room` | 60s |

**指令白名單**：`console_cmd_on` 沿用既有白名單機制，這一輪只加 `netspeed <n>`、
`stat net`、`WeaponLog`。不開放任意指令。

## 4. 完成條件怎麼歸屬到某一個客戶端

- **`pkt` 記錄有 `conn`**（`client.connId_`，`packetlog.js:184-212`），可以唯一區分兩個客戶端。
  `ctx.accountId_`／`ctx.nickname_` 也在 `pkt` 裡，但登入前不會出現。
- **`conn_id` 怎麼拿**：`login_as` 成功那一刻，在 session log 找該帳號的登入 pkt，
  取它的 `conn`，寫進實例狀態。之後所有 pkt 類完成條件都帶這個 `conn` 去過濾。
- **不要用 `port` 欄位認人**：`client.socket_` 是 accept socket，`localPort` 對所有客戶端
  都是伺服器自己監聽的那個埠（`remotePort` 才是來源埠），分辨不出誰是誰。🟡 讀碼推論，
  第一次雙開跑完要拿真 log 核對這一點。

## 5. 已知限制（寫進實作註解，不要假裝沒有）

- **L1：`marker` 記錄沒有 `conn`。** `packetlog.js:253` 的 `marker(text, src)` 簽名不吃
  client／conn，所以 `gameStarted_ false -> true`、`Game_Start_SN sent` 這兩個
  既有 `start_battle()` 依賴的訊號，在雙開時無法歸屬。**改用同一時刻的 `pkt` 記錄
  （有 `conn`）當主訊號，marker 只當輔助。** 例外：聊天 marker 有手動帶 `conn`
  （`packetlog.js:194`）。
- **L2：`MetalRage2` 的截圖可能抓到啟動畫面。** I2 沒做好就會重現 2026-09-19 那個舊問題。
  所以 `launch_client` 的主訊號用 log 檔頭而不是畫面。
- **L3：副本的 `MetalRage\` 是 junction，指回主安裝。** 兩個實例的 `data\Log\` 有可能
  是同一個目錄。這是實作前必須先釐清的事實，見 P1。

## 6. 實作前要先釐清的事實（P，唯讀，先做）

- **P1（擋路）：兩份 log 到底誰寫哪一個檔。** 因為 L3，需要先確認：
  (a) `WeaponLog` 的 `HitLoc===` 行寫到哪個檔；
  (b) 房主的 `Client netspeed is N` 寫到哪個檔（引擎 log `data\System\<exe>.log`
      或 `Play Second Client.bat` 的 `-log=run-<時間>.log`，還是 `data\Log\MetalRage.log`）；
  (c) 兩個實例會不會同時寫同一個檔。
  判斷依據一律是檔頭 `Init: Base directory:` 與時間戳。
- **P2：第二個測試帳號。** 屬丙類（DB 變更），操作者已同意，但要**寫成 commit 進去的
  腳本、冪等、執行前先 dump DB**，帳號要加白名單並標 `isTest`。
- **P3：`MetalRage2` 截圖驗證。** I2 改完後，對 `MetalRage2` 截一張圖確認抓到的是遊戲
  視窗不是啟動畫面。

## 7. 第一個劇本：netspeed（next-test.md 的實驗）

前置：伺服器在跑、兩個帳號都在白名單、STOP 檔不存在、P1–P3 都過。

1. `launch_client(host)` → `login_as(host, <帳號2>)`
2. `launch_client(joiner)` → `login_as(joiner, mrotest)`
3. host 建房（沿用既有 `create_pve_room`，房名帶時間戳以利辨識）
4. `join_room(joiner, <房名>)` → `set_ready(joiner)`
5. `host_start_battle()` → 等雙方進戰場
6. `console_cmd_on(joiner, "netspeed 100000")`
7. 等 5 秒 → `console_cmd_on(joiner, "stat net")`（拿得到就截圖，拿不到不擋）
8. `leave_battle(joiner)`、`leave_battle(host)`
9. `close_client(joiner)`、`close_client(host)`（關掉才會完整 flush）
10. 讀**房主**的 log，找 `Client netspeed is N`

**判讀**（next-test.md 已定）：
- `N = 15000` → 只有房主那台要改（`MaxClientRate` clamp 生效）
- `N = 10000` → 客戶端永遠送 10000，改房主沒用
- `N = 100000` → 房主的修補讓整條路都放開

## 8. 停止條件（全部 fail-closed）

- STOP 檔存在（沿用 `<WinUserProfile>\mro-pico\STOP`）→ 立即停。
- **遇到任何非預期畫面 → 立即 halt，不重試**（操作者 2026-09-20 同意）。
- 前景閘門 Blocked → halt（不要搶前景重試）。
- 任一實例崩潰 → **halt，不自動重開**。雙開情境下重開一個會打亂另一個的房間狀態，
  自動重開的價值低於風險。（單客戶端的 `RESTART_LIMIT=3` 在雙開劇本不適用。）
- `max_consecutive_failures: 1`。
- 整輪 dead-man 總時限 **25 分鐘**，逾時就收工並產報告。
- 任一動作逾時（第 3 節的欄位）→ halt。

## 9. 交付

1. `tools/pico/` 的 I1–I7 改動 ＋ 新動作。
2. `tools/pico/experiments/dual-netspeed.json`（第 7 節的劇本）。
3. `docs/reference/` 補一節「同機雙開自動化」（實例表、log 歸屬、前景閘門怎麼運作、
   怎麼手動中止）。
4. 跑完後一份文字報告放 `docs/HANDOFF.md` 最上面。

## 10. 明確不做

- 不自動重開客戶端。
- 不用畫面比對當主訊號。
- 不平行操作兩個視窗。
- 不改伺服器、不改客戶端檔案、不碰主安裝。
