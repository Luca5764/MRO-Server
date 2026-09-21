# 外部來源：Moon 的目標類模式協定筆記（2026-09-21 收到）

**這整個目錄是外部資料，全部先標 🟡。** 來源是上游 PR 作者 Moon 回信與附件
（原檔在操作者桌面，原樣複製進來，沒有改過一個字）。

| 檔案 | 內容 |
|---|---|
| `protocol_objective.en.md` | 289 行，`ZDispatchGame` 的 `0x2301xx`／`0x2222xx` 目標類模式筆記，含 DLL 位址 |
| `message.txt` | 他的回信本文 |

## 規矩

- **外部說法不直接進 `docs/state.md`**，一律先核對。核對成立、並且是我們自己驗過的，
  才進 state.md，**並註明來源致謝**。
- 他自己的標示慣例（寫在他文件開頭）：`confirmed`＝從反組譯／原始碼讀出或實際觀察到；
  `live-confirmed`＝用兩個真客戶端驗過；`guess／unconfirmed`＝他自己標明的猜測；
  `our rule`＝原廠公式已不存在，他的伺服器自己選的值。**注意最後一類不是原廠行為。**
- 核對結果寫進 `docs/journal/`，這裡只放原始資料。

## 為什麼這份特別重要

他的 §1／§7 跟我們現行實作**直接衝突**：他說戰鬥中所有 CN 都從房主的 socket 進來，
**不要把 `Death_SN` 或目標類 SN 送給加入者**，因為那些 handler 結尾會呼叫 GameInfo 的
腳本事件，而加入者沒有 `Level.Game`。我們的 D1-6 第 3 步（`battleEndBroadcastMode`）
正是把 `Death_SN`／`EndRound_SN`／`User_Score_SN`／`EndGame_SN` 廣播給全房，
M2 驗收那場對加入者送了 945 次 `Death_SN`。

這一條的核對結論出來之前，**不要改行為**。
