# U-20260919-01：有人在旁的無人流程試跑（商店分頁盤點）

計畫：`research/2026-09-19-unattended-trial/plan.md`。操作者在電腦前監看。伺服器沒有改開關、也沒有重啟。

## 結果
- ✅ [TEST] 護欄的「擋下」方向：
  - 第一次 `CLICK_AT` 閉迴路發散，游標跑到 (0,298)；因為沒有收斂，BLOCKED、沒有點擊，session 鎖住。
  - 原因：迴圈直接送像素誤差，沒有扣掉 Windows 指標加速的約 2.46 倍放大（worker 契約裡沒寫清楚，是高階的疏失）。改成依上一步實測估計每軸倍率（0.3–3.0），最多 12 次。
- ✅ [TEST][SHOT] 修正後全部一次命中：
  - 商城／格納庫：`shots/u-20260919-01-01-shop.png`
  - 輔助武器、裝備、道具、M幣商城四個分頁：`shots/u-20260919-01-02-sheet.png`
  - 上一頁回大廳：`shots/u-20260919-01-03-back.png`
  - 每次 `CLICK_AT` 約 2.2–2.6 秒。
- ✅ [TEST] 停止條件：操作者點 VS Code 後送 `KEY ESC` → `[BLOCKED] foreground window belongs to process 'Code'`，第二次送出時回報 session halted。`actions.log` 與伺服器 marker（`pico: KEY ESC -> BLOCKED ...`）都有記錄。
- 截圖座標和 `CLICK_AT` 座標的換算：`shot.sh` 拍的是整個視窗外框（1616×1239），client area 是 1600×1200，相對外框偏移 (8,31)。所以 client 座標＝截圖座標－(8,31)。
- [SHOT] 附帶觀察：商店每樣商品都標 1000G／1000M，是伺服器的預設價格（P3 價格清單要處理）。

## 操作面
- 開始前遊戲必須是前景，AI 無法自己把遊戲切到前景；出門前由操作者點一下遊戲。
- 操作者 2026-09-19 直接確認同意：專用測試帳號給開發者等級、讓 Pico 自動打完整場；從 WSL 重開當掉的客戶端。邊界照 PM 訊息（只給一個設定檔指定的測試帳號；每 session 最多重啟 3 次；同一步連續當掉兩次就停）。開發者功能的唯讀分析進行中。

## 開發者等級／自動過關的唯讀分析（explorer，高階已核對關鍵行）
- 全文：`research/2026-09-19-dev-grade-cheats/notes.md`。
- Grade 11 不解鎖過關指令，只換觀戰鏡頭按鍵表，PvE 還會讓 GM 直接進 Spectating（跟 `journal/2026-09-17-11` 一致）。→ 「專用測試帳號給開發者等級」這條路**用不到**。
- [SRC] `ZModePve/ZPvePlayercontroller.uc:904` `exec function GameCampaign(int Action)` 直接呼叫 `ZNetwork_DJ.Game_Campaign(Action)`，沒有任何權限檢查（高階已看過原始碼）。Action=1 由房主送出 `Campaign_CN 0x00230139`，我們的伺服器收到就回 `EndGame_SN` 判勝利。另有 `PveNextRound_BD`（:1140，原始碼註解明寫是作弊鍵）、`CoreHpMax`（:1151）。
- 卡點：這些 exec 只能從 console 下，console 熱鍵是 `IK_F24`（135），一般鍵盤按不到。**Pico 是 USB 鍵盤，送得出 F24**（adafruit_hid `Keycode.F24`），可能是可行路徑 🟡，還沒測。要先問操作者同意再測。
- 風險（記進 backlog）：任何玩家只要能按 F24（硬體巨集、特殊鍵盤）就能用 `GameCampaign 1` 直接過關，因為伺服器不驗證 Campaign_CN。朋友私服可以接受，但要知道有這件事。
- ✅ [TEST][SHOT] 操作者同意後，韌體 KEY_MAP 加入 F13–F24。在大廳用 Pico 送 `KEY F24`，畫面左側出現主控台提示 `(> _`；送 `KEY ESC` 後提示消失（`shots/f24-compare.png`，上＝F24 之後，下＝ESC 之後）。→ Pico 的 F24 能打開客戶端主控台。還沒有下任何 exec 指令。未經跨公司審查。
- 下一步（要操作者核准清單）：在 PvE 開戰後由房主下 `GameCampaign 1`，確認伺服器收到 `Campaign_CN 0x00230139` body[2]=1 並進入結算。

## GameCampaign 1：Pico 自動打完一場 PvE（操作者核准，他手動開戰，之後手離開）
- ✅ [TEST][LOG] `logs/session-20260919-211100.jsonl`：戰場裡用 Pico 送 `F24` → `TYPE GameCampaign 1` → `ENTER`，伺服器在 ms 5332588 收到 `Campaign_CN 0x00230139` hex `010001`，由 PVE_ROUND_ADVANCE 回 `EndRound_SN 0x00222211`（`R-ROUND: cleared=1 playRound=5`）。之後每約 15 秒送一次，連續 4 次：cleared=2、3、4，第 5 次 `last round, EndGame_SN`。
- [SHOT] `shots/gc-console-small.png`（戰場裡主控台 `(>` 打開）、`shots/gc-after-small.png`（ROUND 2）、`shots/gc-end-small.png`（EndGame 後約 6 秒回到房間）。結算畫面這次沒拍到。
- 結論 ✅：完全不用操作者操作，就能讓一場 PvE 從第 1 回合跑到 EndGame 再回房間；證據是伺服器封包加截圖。未經跨公司審查。這次是房主單人。
- 這條路徑可以拿來做 EndRound → EndGame → 結算 → 寫回 DB（P3）的回歸測試。

## 執行腳本（runner，模型不在迴圈裡）第一次實跑
- 第一次跑：FAIL，但這是對的。前置檢查判斷畫面是 unknown（lobby 分數 15.4，門檻 12，灰區），沒有送出任何輸入。原因：[SHOT] `shots/lobby-now-small.png`，客戶端跳出「因長時間未動作，所以被強制退場。」提示框，整個大廳被壓暗。這是 GameCampaign 那場打完回房間後沒人操作，被**客戶端自己**踢回大廳。
- 用 Pico 點「確認」（client 798,675）關掉提示框之後重跑：**PASS**，6 步每步約 6 秒，全部由本機比對判定（分數 0.00–3.82，沒有落在灰區）。報告在 `tools/pico/logs/reports/U-shop-tabs-20260919-225406.txt`（gitignored），過程中高階沒有看任何截圖。
- 待辦：
  - 把「提示框」加進 atlas，附一個 `dismiss_notice` 動作；
  - 無人清單要考慮房間的閒置踢出（客戶端計時，時長未知 ⬜）。

## U-pve-fullmatch：整場無人自動化（runner 實跑，操作者在旁）
- 第一次 FAIL（開戰這步）：server 的 `gameStarted_ false -> true` marker 比 pico 的 F5 回報還早約 50 ms 寫進 log，runner 在送出之後才取 log 基準點，所以漏看。R-ROUND 也一樣，比 pico 回報早約 100 ms。修法：送輸入**之前**先取基準點（`wait_for_log_markers(baseline_ms=)`）。
- 戰場裡主控台的區塊比對落在灰區（open 18.25／closed 25.50），因為主控台沒有底板、背景一直在動。改看提示字元 `(>` 的固定位置（shot 座標 x 6–34、y 612–627），數接近純白的像素：開著 39–43，關著 0（大廳、房間、商店、戰場的參考圖都是 0）。另外 F24 是切換鍵，要先確認提示字元不在畫面上才按。
- start_battle 看到 server marker 時，客戶端還在載入地圖；campaign_win_all 改成最多等 60 秒等戰場 HUD 出現，不再做一次性的前置檢查。
- 修完之後：✅ [TEST] `U-pve-fullmatch` **PASS**。8 步全部由 runner 自己判定，約 2.5 分鐘；5 回合的 R-ROUND、EndGame、結算畫面、回房、回大廳都有。高階只讀了文字報告（`tools/pico/logs/reports/U-pve-fullmatch-20260919-233020.txt`，gitignored）。未經跨公司審查。

## 當掉重開的實測（操作者在場並同意）
- ❌ [TEST] `client_ctl.py restart --step manual-test`：證據（截圖＋200 行 log）有存，但 `taskkill /IM MetalRage.exe /F` 回「無法終止 "MetalRage.exe" 處理程序 (PID 為 42340)」。工具照設計停下、session 鎖住，沒有嘗試重開。
- 呼叫端不是管理員；遊戲行程的一般 handle 開得起來，但 WMI 看不到它的命令列。🟡 [GUESS] XIGNCODE 的驅動擋了終止權限（反作弊保護行程）。依硬性約束 1，**不嘗試繞過**，也不再用其他方式強制結束。
- 結論：卡死但行程還在的客戶端，AI 無法結束它 → 停下來，等操作者處理。真正崩潰、行程已經消失的情況，才走「重開」那條路（這條路還沒實測過）。

## 當掉重開實測（client_ctl.py）
- 第一次（2026-09-19 23:40）：FAIL。證據有存，但 `kill` 那步 powershell 逾時，客戶端沒被關掉。當時跑的客戶端是 21:11 啟動的，比 XIGNCODE 修補（23:54）早，**還帶著 XIGNCODE**；舊紀錄就提過 XIGNCODE 會擋 taskkill 🟡。
- 第二次（2026-09-20 00:12）：操作者手動關掉客戶端，再跑 `restart --step manual-test`。✅ [TEST] 證據存下 → 沒有行程所以不 kill → 用 bat 啟動 → READY pid 38048，count 1/3。接著用同一個 step 再跑一次 → ✅ `[BLOCKED] two consecutive crashes at the same step`，沒有動到客戶端。
- 發現：新客戶端的 `MainWindowHandle` 是**啟動畫面**（420×260，rect 1070,590–1490,850），真正的遊戲視窗在它後面，已經到登入畫面，而啟動畫面一直疊在上面（[SHOT] `shots/relaunch-full2.png`）。`wait_ready` 把啟動畫面當成遊戲就緒；pico_serial.ps1 的前景／視窗檢查也用 MainWindowHandle，要改成挑最大的那個頂層視窗。
- 還沒驗：對已修補（沒有 XIGNCODE）的客戶端真的 kill 一次。
- ❌ [TEST] 2026-09-20 00:35：對**已修補**的客戶端（pid 38048）執行 `taskkill /IM MetalRage.exe /F` → 「存取被拒」；`Stop-Process -Force` 也一樣。`client_ctl restart` 正確回 BLOCKED（cannot terminate），沒有接著啟動第二個客戶端。
  - [SRC] MetalRage.exe manifest 寫 `requireAdministrator`，所以客戶端是提權執行，而 WSL 叫出的 powershell 沒有提權。奇怪的是 `OpenProcess(PROCESS_TERMINATE)` 有拿到 handle（2792），終止時卻被拒；可能還有別的保護（例如 kernel callback 把權限剝掉）🟡。
  - → XIGNCODE 修補**沒有**讓 kill 變可行。無人重開需要提權的管道（操作者預先建立的最高權限排程工作），或者由操作者手動處理。

## 還原 XIGNCODE 修補後（原版客戶端，2026-09-20 00:30–00:50）
- 合併 pico-login（a101694）後，實跑時發現三個問題：
  1. 三支 PowerShell 都把 `[void]EnumWindows(...) | Out-Null` 寫在一起，PS 5.1 會報「引數類型不能是 System.Void」→ 前景檢查丟例外（fail-closed 擋下，沒有送出輸入）、shot.sh 找不到視窗。已修（拿掉 `| Out-Null`）。
  2. `IME_EN`（WM_INPUTLANGCHANGEREQUEST）擋不住注音輸入法。帳號打進去變成注音，客戶端跳「ID、密碼只能使用0~9、a~z、A~Z」。`login()` 改成：試一次 → 出現這個提示框就按確認 → 按一次 SHIFT（切換注音的中／英模式）→ 再試一次 → 還是失敗就停。✅ [TEST] 00:44 第二次成功，登入後到大廳。
  3. `newest_session_log` 照檔名挑檔：00:03 有測試程式產生了檔名比較新的 session 檔，但伺服器實際一直寫在 `session-20260919-211100.jsonl`。改成照 mtime 挑。這一項在修之前，登入封包被判定 MISSING。
- keepalive 原本選 SHIFT，會切換注音的中／英模式，改成 mouse_wiggle（滑鼠移 1 px 再移回來）。
- ✅ [TEST] `U-pve-fullmatch` 在原版客戶端上 PASS（00:47，報告 `tools/pico/logs/reports/U-pve-fullmatch-20260920-0047*.txt`）。未經跨公司審查。
