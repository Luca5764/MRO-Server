# DUAL-PICO 設計稿：同機雙客戶端無人值守（2026-09-20，高階）

狀態：**v3 —— PM 審過的 v2 ＋ P1 的結果（launcher 與 log 認檔方式已定），六項修訂已併入，可以派 worker。** 依據是兩份唯讀盤點
（explorer，2026-09-20 晚），引用的行號都來自那兩份回報。v2 的修訂點在每節標了「(PM)」。

## 0. 不變式（先寫死，實作不准偏離）

1. **只有一支 Pico、一套實體鍵鼠 → 輸入天生序列化。** 不做「同時操作兩個視窗」，
   只做「輪流」：任何時刻只有一個實例是 active，所有輸入都先確認前景是它。
2. **模型不在迴圈裡。** 完成條件優先用伺服器 session log 的 `pkt` 記錄（有 `conn` 可歸屬），
   畫面分類只當輔助與「非預期畫面就停」的守門員。
3. 不改伺服器行為、不改任何客戶端檔案（副本現有的 `IpDrv.dll` 修補維持原狀）、不碰
   `MetalRage.exe`。
4. 只用標 `isTest` 的帳號。
5. 無人時段得到的結論一律 🟡。
6. **行程名稱一律精確比對（PM）。** `MetalRage` 是 `MetalRage2` 的前綴——任何一處用
   `-like`、`StartsWith`、`Get-Process -Name MetalRage*` 或萬用字元，前景閘門就會把兩個
   實例當成同一個，**這是這個設計最容易出的致命錯**。I2／I3／I4 一律用 `-eq`／精確字串比對。
7. **焦點切換的順序寫死（PM）：** 先改允許的前景行程名 → `SetForegroundWindow` →
   **回讀前景行程名確認** → 才准送任何輸入。中間任何一步失敗就 halt，不重試、不搶前景。

## 1. 實例模型

```
CLIENTS = {
  "host":   proc "MetalRage2",  dir "C:\Games\MetalRage Online 2",
            launcher "Play Second Client.bat",  IpDrv.dll 已修補(100000),
            account <第二測試帳號>
  "joiner": proc "MetalRage",   dir "C:\Games\MetalRage Online",
            launcher "Play With Log.bat"  ← v3 改（原本是 "Play Metal Rage Online.bat"）,
            原廠, account mrotest
}
```

每個實例的執行期狀態：`id / proc_name / install_dir / launcher / log_path /
account / conn_id / launch_time`（`conn_id` 登入後才填，見第 4 節；`log_path` 啟動後才解析，
見第 6 節 P1）。

**v3 的 launcher 決定（P1 的結果）**：兩個實例都用帶 `-log=` 的 launcher，讓兩邊的主訊號
檔**同一種類型**（各自安裝的 `data\System\run-<STAMP>.log`）：
- host → 副本的 `Play Second Client.bat`（已經帶 `-log=`）
- joiner → 主安裝的 `Play With Log.bat`（2026-09-20 21:26 建立，已經帶 `-log=`）
  **不要用 `Play Metal Rage Online.bat`**——它不帶 `-log=`，log 會落到
  `data\Log\MetalRage.log` 而且**每次重開被截斷**，量測會被下一次啟動毀掉。

**角色分配的理由**（kickoff 指定，不要對調）：副本的 `IpDrv.dll` 已把
`MaxClientRate`／`MaxInternetClientRate` 改成 100000，所以副本當**房主**才有意義——
`GameInfo.uc:1504` 的 `ClientCapBandwidth()` 是房主的值去蓋加入者。加入者用原廠主安裝，
才能量到「客戶端自己送出的值是多少」。

## 2. 基礎設施改動（worker 要動的檔案，按風險由低到高）

| # | 檔案 | 現況 | 改法 |
|---|---|---|---|
| I1 | `tools/win/shot.sh:17,19-25` | `ARGS=(-Proc MetalRage)` 寫死，參數迴圈只認 `--full`／`--name` | 加 `--proc NAME`，透傳給 `screen.ps1`（它的 `param()` 本來就有 `-Proc`） |
| I2 | `tools/win/screen.ps1:70-80` | 只有 `-Proc` **精確等於** `"MetalRage"` 才走 `Get-MetalRageWindow`（EnumWindows 找同行程最大可見視窗）；其他值落入舊版 `MainWindowHandle` 邏輯，而那個舊邏輯 2026-09-19 實測會抓到啟動畫面 | 把 `Get-MetalRageWindow`（41-67 行）參數化成吃行程名，**任何** `-Proc` 值都走它；舊路徑刪掉或只留在明確指定時 |
| I3 | `tools/pico/pico_serial.ps1` `Test-ForegroundGate`（約 229-284） | 硬編 `$fgProc.Name -ne "MetalRage"` → Blocked | 允許的前景行程名改成可設定的**單一值**，由 `pico_ctl` 在切換 active 實例時寫進 session 狀態。維持 fail-closed：值沒設就 Blocked。**必須用 `-eq` 精確比對**，且 worker 要附一個離線測試：前景是 `MetalRage2`、允許值是 `MetalRage` → **必須 Blocked**（PM） |
| I4 | `tools/pico/client_ctl.ps1:39-41` | `$ProcName`／`$BatPath` 寫死主安裝 | 加「目標實例」參數，行程名與 launcher 從實例表來 |
| I5 | `tools/pico/client_ctl.py:94,241-282` | `CLIENT_LOG_WSL` 寫死主安裝的 `data/Log/MetalRage.log` | **v3 改寫**：log 改成**執行期解析**——`launch_client` 記下啟動時刻，之後在該實例的 `data/System/` 找「啟動後才出現、mtime 最新」的 `run-*.log`，再用檔頭 `Init: Base directory:` 核對等於該實例的安裝路徑，不符就 fail-closed。路徑一律用**直接路徑**（`/mnt/c/Games/MetalRage Online[ 2]/data/...`），**絕對不要穿過 `MetalRage\` 這一段** |
| I6 | `tools/pico/actions.py:164-171` `Context` | 全域單例，沒有「哪個客戶端」欄位 | 加 `clients`（實例表）與 `active_client`；所有輸入動作先經 `focus_client` |
| I7 | `tools/pico/actions.py:1217-1275` `find_pkts_since` | 只按 `since_ms` 篩，不看 `conn` | 加 `conn=` 過濾；新 helper `resolve_conn_id(account)` |

**`screen.ps1:83` 的 `SetForegroundWindow` 已經是通用的**，`$hwnd` 來自 `-Proc` 分支——
所以 I1+I2 做完，「把指定實例叫到前景」就不必新寫任何 Win32 呼叫。

## 2b. Preflight：啟動客戶端之前一定要跑（PM 2026-09-20 裁決）

**原則：啟動任何客戶端之前，先確認關閉路徑可用。** 2026-09-20 晚踩到的就是反例——
一個唯讀量測任務啟動了客戶端，結果因為 P5 的尺寸閘門關不掉，擋住了整晚的雙開。

`runner` 在 session 開始時、**啟動任何實例之前**，對每一個要用到的實例做：

| 檢查 | 怎麼做 | 不過就 |
|---|---|---|
| 解析度與 atlas 相符 | 讀該實例的 `data\System\OptionAll.ini` 的 `op_Display=(ScreenSize="WxH",...)`，比對 `tools/pico/atlas/manifest.json` 的 `shot_size` 換算出的 client 尺寸 | **直接 fail，不啟動客戶端**，報告寫明現值、期望值、要改哪個檔 |
| 前景閘門可用 | Pico session 可開、`ping` 有回應、允許的前景行程名設得下去 | 直接 fail，不啟動 |
| STOP 檔不存在 | 既有機制 | 直接 fail |
| 該實例沒有殘留行程 | 行程名精確比對 | 直接 fail，報告寫明 PID |

**不要**做成「session 開始時自動改解析度、結束時還原」——那是改操作者的遊玩設定，
要等操作者表態（PM 2026-09-20）。

## 3. 新動作清單

每一個都是 `actions.py` 的新函式，簽名照既有慣例 `fn(ctx, **params) -> ActionResult`。

| 動作 | 做什麼 | 完成條件（主／輔） | 逾時 |
|---|---|---|---|
| `focus_client(id)` | `shot.sh --proc <proc>` 把該實例叫到前景，寫進 `ctx.active_client`，同步更新 I3 的允許前景行程名 | **主**：回讀前景行程名 == 目標；**輔**：截圖能分類成已知畫面 | 10s |
| `launch_client(id)` | 用該實例的 launcher 啟動 | **主（PM 修訂）**：該行程存在 **且** 找得到它的遊戲視窗；**輔**：畫面分類 == `login`、log 檔頭 `Init: Base directory:`。**不要等 log**（見 L4） | 120s |
| `close_client(id)` | 關掉該實例（讓客戶端 log 完整 flush 並解鎖） | **主**：行程消失 | 30s |
| `login_as(id, account)` | `focus_client` → 既有 `login()` 流程 | **主**：session log 出現該帳號的登入 pkt（`0x00110151` recv），並由它**取得並記下 `conn_id`**；**輔**：畫面 == `lobby` | 90s |
| `join_room(id, room_name)` | 大廳房間清單點選 → 加入 | **主**：`conn` 過濾後該實例收到房間相關 pkt；**輔**：畫面 == `room` | 45s |
| `set_ready(id)` | 房內按準備 | **主**：`User_State_SN 0x00220401` 對應 pkt；**輔**：截圖 READY | 20s |
| `host_start_battle()` | `focus_client(host)` → F5 | **主**：`Game_Start_SN` 送出的 pkt（**不要只靠 `gameStarted_ false -> true` marker，見 L1**）；**輔**：雙方畫面 == `battle` | 120s |
| `enter_battle(id)` | 加入者開戰後的畫面流程（PM）：載入 → **機體選擇頁 `ZSlotSelectPage`** → 戰場。沿用既有的選機動作 | **主**：`ChangeSlot_CN 0x00230101` / `Respawn_CN` 的 pkt（`conn` 過濾）；**輔**：畫面分類 | 120s |
| `idle_nudge(id)` | 防 80 秒踢出（PM）：切到該實例送一個無害輸入（滑鼠微動） | **主**：前景回讀成功、沒有 `Leave` pkt | 10s |
| `console_cmd_on(id, text)` | `focus_client(id)` → F24 開主控台 → 打字 → Enter → ESC | **主（PM 修訂）**：主控台開啟／關閉的像素判定（現成的 `(>` 白色像素計數）＋打字後截圖存檔；**輔**：無。**log 的驗證全部延到第 9 步關閉客戶端之後**（見 L4） | 30s |
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
- **L4（v3 強化，實測）：客戶端執行期間，它的 log 檔是鎖住的——連讀都讀不到。**
  [TEST] 2026-09-20 23:00：客戶端開著時對 `data/System/run-*.log` 下 `cat`／`head`／`xxd`
  一律 `Permission denied`（檔案權限顯示 0777，只有 `stat` 拿得到 size／mtime）。
  這比原本的「4 KB 緩衝」更強：**無論引擎怎麼 flush，自動化都不可能在客戶端還開著時讀它。**
  所以任何「等 log 出現某一行」的即時完成條件**都不可能成立**，不是會逾時而已。
  即時訊號一律用伺服器 session log 的 `pkt`、行程／視窗狀態、或像素判定；
  客戶端 log 的驗證全部延到關閉客戶端之後。
  （附帶：`-log=` 宣稱會開一個即時 log **視窗**，但 [TEST] 同一次啟動**沒有看到**那個視窗出現，
  🟡 可能要有新內容才建立，未再追。閒置在登入畫面 4 分鐘期間檔案大小完全沒變過，所以
  「即時 vs 批次」這題**沒有量到**，也不需要量——L4 已經由檔案鎖定這條更強的事實決定。）
- **L5：房間內閒置約 80 秒會被客戶端自己踢出（PM）。** 這是原版防掛機設計，不是伺服器造成的
  （`ZGUIController.uc:945-948`，每次有輸入才 `Room_Time_Reset()`；
  `journal/2026-09-19-0330-d1-step4-room-join.md:482` 起的補查）。**房主建房後輸入全在加入者
  那邊**，`join_room` 45s ＋ `set_ready` 20s ＋兩次切焦點已經貼近 80 秒 → 房主會自己送
  `Leave_CQ`、房間消失。對策見第 7 節的順序調整與 `idle_nudge`。
- **L6：加入者開戰後會先進機體選擇頁**（`ZSlotSelectPage`，`state.md` 第 4 節 PvE 選機那列），
  現有劇本只處理過房主。沒定義就會在「非預期畫面就停」這一關卡住。
- **L2：`MetalRage2` 的截圖可能抓到啟動畫面。** I2 沒做好就會重現 2026-09-19 那個舊問題。
  所以 `launch_client` 的主訊號用 log 檔頭而不是畫面。
- **L3（P1 已解決，2026-09-20）：`MetalRage\` 的 reparse point 只影響穿過它的路徑。**
  兩份安裝的 `MetalRage\` 都是 WSL 建的 `LX_SYMLINK`（tag `0xa000001d`），buffer 內容都是
  `/home/lucas/mro-reverse/MetalRage`，而那個又指回**主安裝**——所以副本的
  `...\MetalRage Online 2\MetalRage\...` 其實繞回主安裝。
  **但兩份安裝各自的 `data/Log`、`data/System` 是真正不同的目錄**（inode 實證：`data/System`
  主 `1407374883884089` vs 副 `2251799813956129`；`data/Log` 主 `2251799814006291` vs
  副 `118219490218740864`）。現有程式碼用的是不穿過 `MetalRage\` 的直接路徑，所以本來就
  沒踩到這個陷阱。**規則：一律用直接路徑，不要用 `MetalRage\` 前綴。**

## 6. 實作前要先釐清的事實（P，唯讀，先做）

- ~~**P1（擋路）**~~ **→ 已解決，2026-09-20（見 L3 與下面的「P1 結果」）。**
- **P1 的殘留項（PM 擴大的部分，仍待辦）：** junction 若涵蓋
  `User.ini`／`MetalRage.ini`／`OptionAll`，兩個實例就**共用設定**——UE2 的 `netspeed`
  指令會 `SaveConfig` 寫回 `User.ini`，帳號欄位的記憶也在裡面，這會影響劇本與之後的量測。
  同時要說清楚「副本的 `IpDrv.dll` 已修補、主安裝原廠」在 junction 結構下**為什麼成立**
  （哪一層是實體複本），寫進 `docs/reference/`。log 的部分需要確認：
  (a) `WeaponLog` 的 `HitLoc===` 行寫到哪個檔；
  (b) 房主的 `Client netspeed is N` 寫到哪個檔（引擎 log `data\System\<exe>.log`
      或 `Play Second Client.bat` 的 `-log=run-<時間>.log`，還是 `data\Log\MetalRage.log`）；
  (c) 兩個實例會不會同時寫同一個檔。
  判斷依據一律是檔頭 `Init: Base directory:` 與時間戳。
- **P2：第二個測試帳號。** 屬丙類（DB 變更），操作者已同意，但要**寫成 commit 進去的
  腳本、冪等、執行前先 dump DB**，帳號要加白名單並標 `isTest`。
  **必須連 `hostAddress` 一起加（PM）**：`HOST_ADDRESS_REQUIRE` 會擋掉「房內有非房主成員
  但房主沒有 hostAddress」的開戰（`config/whitelist.js`、`backlog.md:592`）。新帳號要當房主，
  值**不要寫死**，執行期沿用 `mrotest` 那一筆的 `hostAddress`。
  ⚠️ **更正（2026-09-20 23:3x）**：設計稿原本寫「`mrotest` 綁的 `192.168.0.10`」已經過時——
  `2026-09-20-1530-m3r-vpn-rehearsal.md` 那次把整份白名單的 `hostAddress` 換成了 VPN 位址。
  同機雙開走 VPN 位址是可行的（今晚的 DUAL-CLIENT 實驗就是這樣跑起來的），
  但**任何地方都不要抄寫死值**，一律動態沿用。
  ⚠️ `config/allowed-users.json` 不進 repo、裡面是真實 IP：**腳本不可以把真實 IP 寫進 repo**，
  文件一律用佔位值。
  ⚠️ 改 `config/` 要**完整重啟**伺服器（不是 `/reload`）。重啟前先 `/conns` 確認沒人在線。
- **P5（新，擋路，2026-09-20 23:20 發現）：主安裝的遊戲解析度與 atlas 不符，Pico 全線被擋。**
  `data\System\OptionAll.ini` 的 `op_Display=(ScreenSize="1152x864",...)`，但 atlas
  （`tools/pico/atlas/manifest.json`）的 `shot_size` 是 `1616x1239`（client 1600x1200）。
  `pico_serial.ps1` 的 `Get-MetalRageWindow` 有一道尺寸閘門：client area 小於 1600x1200
  就判定成 splash／未 ready → **BLOCKED**。這道閘門是**所有** gated Pico 指令共用的前置檢查，
  不只 CLOSE_WINDOW——**現在對主安裝的任何 Pico 操作都會被擋，不是雙開才有的問題**。
  [TEST] 2026-09-20 23:1x：`client_ctl.close_client()` 回
  `largest visible 'MetalRage' window is too small (client 1152x864, need >=1600x1200)`。
  **待裁決**（已送 PM）：改回 atlas 對應的解析度（改主安裝設定檔，kickoff 說主安裝不動）
  ／重拍 1152x864 的 atlas（工作量大）／請操作者在遊戲裡改。**在這一項解決之前，
  任何需要 Pico 輸入的無人劇本都跑不起來。**
- **P4：機體選擇頁上主控台開不開得起來（PM）。** netspeed 只需要連線已建立，不一定要出場；
  但如果機體選擇頁按不出主控台，劇本就要先選機出場再下指令。這一項要先確認。
- **P3：`MetalRage2` 截圖驗證。** I2 改完後，對 `MetalRage2` 截一張圖確認抓到的是遊戲
  視窗不是啟動畫面。

### P1 結果（2026-09-20，唯讀盤點）

| 問題 | 答案 |
|---|---|
| `HitLoc===`（WeaponLog）寫到哪 | **只在 `data/System/` 的 `run-*.log`**（`-log=` 啟動才有）。`data/Log/MetalRage.log` **0 筆** |
| `Client netspeed is` 寫到哪 | **只在 `data/System/` 的 `run-*.log`**，兩份安裝都已經有實例（目前值都還是 10000）。`data/Log/MetalRage.log` **0 筆** |
| 兩個實例會不會寫同一個檔 | **不會**，`data/Log`、`data/System` 兩份安裝 inode 不同 |
| 怎麼認定一份 log 屬於誰 | 檔頭 `Init: Base directory:`，**所有**類型的 log 都有，已逐檔核對無例外 |

`run-*.log` 的檔名是 `run-<HHMMSS.ss>.log`（`.bat` 用 `%time%` 組的），自動化拿不到精確值，
所以要用「啟動時刻之後、mtime 最新」＋檔頭核對**兩層一起**認檔。

🟡 未驗：原生 Win32 process 能不能穿透 `LX_SYMLINK` 型 reparse point。不影響結論，
因為 `.bat` 是 `cd /d "%~dp0data\System"` 直接切目錄，遊戲寫 log 不經過那一段。

## 7. 第一個劇本：netspeed（next-test.md 的實驗）

前置：伺服器在跑、兩個帳號都在白名單、STOP 檔不存在、P1–P3 都過。

**順序經 PM 修訂，為的是壓縮房主的閒置時間（L5）。** 先讓加入者站在大廳、房間清單已開，
房主才建房；房主閒置超過 **50 秒**就插一個 `idle_nudge(host)`。

1. `launch_client(host)` → `login_as(host, <帳號2>)`
2. `launch_client(joiner)` → `login_as(joiner, mrotest)` → **停在大廳、房間清單已開**
3. host 建房（沿用既有 `create_pve_room`，房名帶時間戳以利辨識）
4. `join_room(joiner, <房名>)` → `set_ready(joiner)`（超過 50 秒就先 `idle_nudge(host)`）
5. `host_start_battle()` → `enter_battle(joiner)`（載入 → 機體選擇 → 戰場，見 L6）
6. `console_cmd_on(joiner, "netspeed 100000")`
7. 等 5 秒 → `console_cmd_on(joiner, "stat net")`（拿得到就截圖，拿不到不擋）
8. `leave_battle(joiner)`、`leave_battle(host)`
9. `close_client(joiner)`、`close_client(host)`（關掉才會完整 flush）
10. 讀**房主**（副本）這一輪的 `data/System/run-*.log`，找 `Client netspeed is N`
    （認檔方式見 P1 結果；找之前先核對檔頭 `Init: Base directory:` 是
    `C:\Games\MetalRage Online 2\data\System\`）

**判讀**（next-test.md 已定）：
- `N = 15000` → 只有房主那台要改（`MaxClientRate` clamp 生效）
- `N = 10000` → 客戶端永遠送 10000，改房主沒用
- `N = 100000` → 房主的修補讓整條路都放開
- **房主 log 完全沒有新的 `Client netspeed` 行（PM 新增第四種）** → 代表指令沒有送出
  NETSPEED token，記為第四種結果（不是「沒效果」，是「沒送到」）——
  `2026-09-20-2153-server-netspeed.md` 已證實那行只在收到的文字含 `"NETSPEED"` token 時才印

### 第一次實跑拆成三段（仍然建議，但不再是「在場」要求）

**不要一口氣跑完整條**——拆段的價值是**失敗時知道卡在哪一段**，不是為了有人看著。
（原本的「每段都是一次獨立的遠端在場」已於 **2026-09-21 由操作者取消**，
見 `reference/unattended-policy.md`。）

| 段 | 跑到哪裡 | 涵蓋的新動作 |
|---|---|---|
| A | 兩個實例都登入並**停在大廳** | `launch_client`、`login_as`、`focus_client`（已測）、`close_client` |
| B | 建房 → 加入 → 準備 | `join_room`、`set_ready`、`idle_nudge` |
| C | 開戰 → 下指令 → 離開 → 關閉 | `host_start_battle`、`enter_battle`、`console_cmd_on`、`leave_battle` |

A 段成功才跑 B，B 成功才跑 C。任何一段 halt 就停在那裡寫報告。

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
4. 跑完後一份文字報告放 `docs/HANDOFF.md` 最上面。**報告必須註明（PM）**：兩個實例各自的
   `IpDrv.dll` sha256、各自用的帳號、誰是房主。
5. 第一次雙開跑完，拿真 log 核對「`port` 欄位分辨不出客戶端」這條 🟡（第 4 節）。

## 9b. 關閉客戶端只有一條路（v3 補，實測踩過）

**`taskkill`／`Stop-Process`／`CloseMainWindow()` 在這個客戶端上一律被拒**（access denied；
它透過 manifest 以提升權限執行）。專案唯一支援的關閉方式是
`tools/pico/client_ctl.py` 的 `close_client()`／`close_window()`——**用 Pico 送一個真實的
滑鼠點擊去按視窗標題列的關閉 X**（`pico_ctl.py raw CLOSE_WINDOW`），一樣走前景閘門。
這件事 `client_ctl.py` 的模組 docstring 與 `client_ctl.ps1:17` 的 2026-09-19 [TEST] 早就寫了。

**對雙開的影響**：`close_client(id)` 必須先 `focus_client(id)`，而且關閉 X 的座標是**相對
該實例的視窗**——I1／I2 的 `--proc` 參數化沒做好，這一步會點到另一個實例的視窗上。

## 9c. 已實作的偏離，經高階確認（2026-09-20）

**`client_ctl.py` 的 `evidence()` 沒有改用 `resolve_run_log()`，是刻意的。**
設計稿 I5 字面上要求「把 `CLIENT_LOG_WSL` 換成執行期解析」，但單客戶端的
restart／relaunch 流程用的 launcher **沒有帶 `-log=`**，根本不會產生 `run-*.log`——
把預設換掉會直接讓現有的當機證據蒐集失效。所以 `resolve_run_log()` 做成 opt-in
（傳非預設 `instance` 才會用）。**高階確認這個取捨正確。**
要把預設換掉，得先決定單客戶端的 launcher 是否也改用 `-log=`，那是另一個題目。

## 10. 明確不做

- 不自動重開客戶端。
- 不用畫面比對當主訊號。
- 不平行操作兩個視窗。
- 不改伺服器、不改客戶端檔案、不碰主安裝。
