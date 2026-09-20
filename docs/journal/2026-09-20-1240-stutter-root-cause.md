# 卡頓根因：Windows 錯誤回報凍結遊戲行程（2026-09-20）

## 怎麼量的
- 操作者以管理員執行 `wpr.exe -start CPU.Verbose -filemode` → 玩 15 分鐘 → `wpr.exe -stop C:\MROTrace\cpu.etl`。檔案 21.5 GB，trace 期間 UTC 04:16:33–04:35:38。
- 卡頓時操作者在遊戲內打字（`0x00220507`），伺服器 log 留下時間戳：UTC 04:32:22「剛剛卡了」、04:32:31「又卡」（`session-20260920-114648.jsonl`）。
- 裝 Windows ADK 的 Windows Performance Toolkit。`xperf -a cswitch/-a dumper` 的 `-range` **單位是微秒**（說明文件沒寫，試出來的）。抽出 935–965 秒的 CSwitch／ReadyThread 共 123 萬列。

## 結果 ✅（未經跨公司審查）
- [TEST] 這 30 秒內，**MetalRage 的所有執行緒（約 50 條）被同時暫停 6 次**，每次 140–273 ms：940.564／940.807／941.058／954.266／954.492／954.765 秒。主執行緒（tid 39696，30 秒內吃 25.5 秒 CPU）的中位數是 226 ms。
- [TEST] 每一次凍結期間 `WerFault.exe` 都在密集執行（每次 181–413 個排程事件），而它在整個視窗裡只在 940.43–954.91 秒活動。凍結與 WerFault 活動完全重疊。
- [LOG] Windows 應用程式事件記錄在 trace 期間有 4 筆 Application Error（1000）：12:18:49、12:18:57、**12:32:14**、**12:32:27**（後兩筆＝trace 的 940.5／954.2 秒）。內容：`MetalRage.exe` 例外 `0xc0000005`、錯誤模組 `unknown`、位移 `0x00000002`、行程 id `0x10B78`＝68472（當時的客戶端）。
- 解讀 🟡：加殼保護（y0da）刻意製造存取違規並自行處理，Windows 錯誤回報看到例外就附加到行程抓快照，**抓快照要暫停所有執行緒**，那 140–273 ms 就是玩家感覺到的卡頓。遊戲本身沒有崩潰。
- 這推翻了先前的 H-Y0DA 假設：不是 y0da 的監控執行緒在暫停主執行緒，而是**作業系統的錯誤回報服務**在暫停整個行程。y0da 只是製造例外的源頭。

## 下一步
- 建議操作者在 `HKLM\SOFTWARE\Microsoft\Windows\Windows Error Reporting\ExcludedApplications` 加 `MetalRage.exe = 1`（DWORD），讓 WER 不要為這個程式抓快照，再用同樣方法錄一次 trace 對照。這是 Windows 設定，不碰遊戲、可還原。
- 若有效：朋友的機器也要做同樣設定，寫進 K1 安裝說明。
- 若無效：再看凍結是否還在、是否改由別的行程造成。
- 例外本身（0xc0000005 @ +2）的來源沒有查，也不需要查：不碰 y0da 是既有約束。

## 第二次量測（加了 WER 排除清單之後）
- 操作者在 `HKLM\...\Windows Error Reporting\ExcludedApplications` 加了 `MetalRage.exe=1`，重開遊戲後**還是卡**，而且在選單就卡。
- [TEST] 用記憶體模式錄 102 秒（`wpr -start CPU` → `-stop stutter2.etl`，1.6 GB）：
  - 主執行緒（tid 71428）仍有 6 次 Suspended 凍結：3.765s 258.7ms、4.024s 178.5ms、73.060s 227.9ms、73.288s 140.6ms、73.587s 229.9ms、73.817s 159.7ms。成群出現，跟第一次一樣。
  - 凍結期間沒有任何 MetalRage 執行緒在跑。
  - ReadyThread：凍結前後喚醒 MetalRage 執行緒的來源，**WerFault.exe 佔 186 次**，主執行緒在 4.024s 正是被 `WerFault.exe (71944)` 喚醒的。
- → 排除清單只抑制回報，**不會阻止 WerFault 附加**。下一步請操作者停用 WerSvc 服務（`Stop-Service WerSvc -Force`、`Set-Service WerSvc -StartupType Disabled`），再量一次。
- [OBS] 操作者觀察：用**道具很多的 Lucas** 帳號很快就復現，**什麼都沒有的 mrotest** 觸發少很多。🟡 可能是道具多的帳號會讓客戶端多跑會出例外的那段程式碼（例如道具清單處理）。伺服器在這 102 秒內送過兩批各約 80 個 `0x00240241`／`0x00240242`（每個 903 bytes）給 Lucas，但時間點（51.6–51.8 秒）跟凍結（3.7／73 秒）沒有重疊，所以不是封包直接觸發。

## 真正的機制（2026-09-20 13:30，✅ 未經跨公司審查）
- [OBS] 停用 `WerSvc` 服務之後，操作者回報「好像真的沒卡了」。
- [TEST] `C:\Users\<user>\AppData\Local\CrashDumps\` 裡有 **10 個 29 MB 的 MetalRage 傾印檔**，時間 13:20–13:24（卡頓那幾分鐘），共 278 MB。→ 每一次卡頓就是 Windows 在寫一個 29 MB 的當機傾印檔，寫檔期間整個行程被暫停。
- [TEST] 解析傾印檔（自寫的 minidump parser）：例外 `0xc0000005`，位址 **0x3**，不屬於任何已載入模組（解殼後的動態程式碼）。也就是呼叫了空指標。保護殼自己有處理常式接住，所以遊戲不會當。出錯的執行緒不是主執行緒。
- [TEST] 登錄檔 `HKLM\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps` 底下只有第三方程式（`AltA2dp*`，藍牙音訊）的子機碼。**但只要這個機碼存在，Windows 就會對所有程式啟用本機傾印**（預設路徑 `%LOCALAPPDATA%\CrashDumps`），所以遊戲也被收集。
- 結論：卡頓＝保護殼丟例外 → Windows 本機傾印功能被第三方程式打開 → WerFault 附加、暫停整個行程寫 29 MB 檔案 → 140–260 ms 凍結。**跟伺服器、網路、WSL 無關**，也不是 y0da 自己在暫停執行緒（H-Y0DA 已被推翻）。
- 建議的精準解法（比停用整個服務好）：`LocalDumps\MetalRage.exe` 加 `DumpCount=0`，其他程式的錯誤回報維持正常。待操作者實測。
- 朋友的機器要不要處理，看各自有沒有 `LocalDumps` 機碼；這是系統設定，不是遊戲問題。

## 解法確認（2026-09-20 13:50）
- 操作者恢復 `WerSvc` 為「手動」並啟動，改成只對遊戲關閉本機傾印：`HKLM\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\MetalRage.exe` 的 `DumpCount = 0`（DWORD），並刪掉舊的 278 MB 傾印檔。
- ✅ [TEST] 試打 90 秒期間 `%LOCALAPPDATA%\CrashDumps` **沒有產生任何新檔案**（先前是每次卡頓一個 29 MB 檔）。
- [OBS] 操作者：「好像偶爾會有一小段卡頓，但是可接受的。」→ 主要症狀解決，剩下的殘留另外查（可能是別的原因，例如 Win11 視窗化最佳化、記憶體或載入）。
- 這是推薦給所有玩家的設定；不是遊戲問題，是各自 Windows 上有沒有被第三方程式打開本機傾印。

## 待補（PM 2026-09-20）
1. **修正後要用同一種量法再量一次才標 ✅**：再錄 60–90 秒 CSwitch，確認「整個行程同時被暫停」的事件消失或大幅縮短。目前「90 秒無新傾印檔＋主觀感受」只算 🟡。
2. **兩人場補驗**：Lucas 當房主時，dusk 的「怪物閃現、子彈沒射出」是否跟著消失。那才是當初的症狀。
3. **殘留輕微卡頓**：例外還在丟，只是不寫傾印檔。`ExcludedApplications\MetalRage.exe=1` 在 13:0x 就加了、至今仍在，所以現在的狀態是「排除清單＋DumpCount=0」兩個都在。要單獨評估排除清單的效果，得先移除它再量一次（一次一個變數）。
4. ⬜ 不要假設能推廣：
   - 筆電（Win11）有沒有 `LocalDumps` 機碼？卡頓時 `WerFault` 有沒有動？
   - Win10 的 dusk 為什麼不卡：沒有那個機碼，還是原廠 exe 在 Win10 根本不丟這個例外？
   - K1 說明頁已經寫成「檢查並設定」，不是「一定是這個原因」。
5. 這個發現值得分享給上游 Win11 修正的作者（他自己也有同樣的卡頓）：「看一下 `%LOCALAPPDATA%\CrashDumps` 是不是一直長出 MetalRage 的傾印檔」。等跟 moonlight 的對話有進展時再提。

## H-ASSIST-AV ❌（PM 假設，2026-09-20 驗證）
假設：那些 0xc0000005 例外不是保護殼丟的，而是我們的畸形回包（Assist_SN／Special_SN 長度不足）讓客戶端解參考垃圾指標。

- [LOG] Windows 應用程式事件記錄，`MetalRage.exe` 的 1000 事件：2026-09-18 以來共 **6816 次**，今天 **1389 次**。先前以為只有 4 次是誤解——那只是有存下傾印檔的次數（`DumpCount` 預設上限 10）。
- 逐分鐘比對今天的例外數與 session log 裡 `Assist_CN 0x00230121`／`Death_CN` 的到達數（時間已換算成本地時間）：
  - 例外**整天固定每 4–5 分鐘 2 次**，包含完全沒有遊戲流量的時段（客戶端只是開著）。
  - 客戶端啟動時會爆量（11:08–11:10 共 150 次、11:27–28 共 85 次、13:12 共 77 次、14:51 共 68 次、15:10 共 88 次、15:17 共 67 次），對應我們每次重開客戶端。
  - **戰鬥時段反而最少**：12:20–12:35、13:17–14:01 有大量 Assist／Death 封包，同時段例外幾乎為 0。
- 結論 ❌：例外與 Assist_CN／Special_CN 無相關，形狀比較像保護殼的週期性檢查（固定間隔）＋解殼時的集中爆發。修 Assist_SN 不會解決卡頓。
- 仍然要修 Assist_SN／Special_SN：越界讀本身是隱患，而且 Moon 回報的計分問題跟它同類（`research/2026-09-20-fallback-ack-audit/notes.md`）。
- 附帶更正：卡頓的頻率與例外一致（每 4–5 分鐘一次），跟操作者「偶爾一小段」的體感吻合；DumpCount=0 之後剩下的輕微卡頓，可能就是 WER 處理例外本身（不寫檔也要做事）。
