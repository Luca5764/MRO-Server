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
