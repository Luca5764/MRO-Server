# 交接:接手前先讀這頁

給下一個接手的人。這份只放**最新的交接快照與下一步**，每次交接時改寫最上面那一段。
規則與陷阱看 `AGENTS.md`，現況看 `docs/state.md`，歷史看 `docs/journal/`。舊快照搬到 `docs/journal/2026-09-16-34-handoff-history.md`。

---

## 🟡 中階交接：Codex（2026-09-18，G6d 實作）

- 工作區／分支：`/home/lucas/mro-reverse-g6-unblock`／`flash-wip-g6-unblock`；
  起始 HEAD 為 `3d10ce2`。
- 新增預設關閉 `SHOP_FULL_CATALOG_MODE`。enabled 時送出 catalog
  `category_type 2..6` 的完整列，依 `item_id` 去重／排序，客戶端自行做
  `ItemSubordinateCheck()`；每分類最多 45 筆一包。disabled 保留原本
  `mech_type`／family 篩選與 CAT_LIMIT 路徑。
- 保持 `SHOP_UNBLOCK_MODE`、`SHOP_COMPAT_EXPERIMENT` disabled；未改 DB、schema、
  G6 save handler、ItemInfo 分包、PVE_SLOT_SELECT_FLOW、Grade_Info、Death_SN 或 G7。
- 交付：`docs/journal/2026-09-18-03-g6d-shop-full-catalog.md`、INDEX、
  `room.dispatch.js`。`node --check` 與 `git diff --check` 已通過；沒有開 server，
  沒有要求操作者重啟或實測。
- `Metal Rage Online Server/node_modules` 是既有未追蹤目錄，未加入 commit。
- 下一步契約：先由 Claude 高階審查並安排 G6d 實測；不要自行把開關改 enabled、
  重啟 server 或請操作者測試。

---

## ⚡ 交接快照（2026-09-18 08:5x，Claude 高階，請以此段為準）

### 今天完成：G6 機庫換裝備存檔，全部實測通過

分支 `flash-wip-g6-unblock`（worktree `/home/lucas/mro-reverse-g6-unblock`），已由 Claude 高階審查、實測、合併回 `reverse-work`。
一路拆掉**四層**阻塞，每層原因都不同（日誌 `2026-09-18-02` ～ `-06`）：

1. **商店全空**：伺服器用 `item_catalog.mech_type` 依槽位篩商品，但那欄是**武器家族**，送出的武器該機體不能裝，全被客戶端 `ItemSubordinateCheck` 濾掉。→ 整批送出、交給客戶端過濾（`SHOP_FULL_CATALOG_MODE`）。
2. **購入物歸錯機**：購買時把 catalog 的 `mech_type` 照抄進 `items`，應寫玩家當下的機庫槽位（`PURCHASE_MECH_SLOT_MODE`）。
3. **買完不即時顯示**：購買後重送 ItemInfo 的程式被 `SHOP_UNBLOCK_MODE` 綁著（那個開關另含已被組語否決的 IsShow 欄位重排）→ 拆成 `PURCHASE_ITEMINFO_REFRESH`。
4. **庫存永遠只有一格**（最隱蔽）：客戶端 `ZPanel_InvenItems.uc:408-411` 把 **SerialIndex 101–999** 當保留區整段跳過，而 `items.id` 全落在裡面。→ `tools/renumber-item-serials.js` 把主鍵搬到 100000+，程式不需做偏移。

實測：換裝 → 寫 DB → **完全關閉客戶端重開**仍保留 → PvE 出場帶入（`Game_User_SN` slots 送出 `22100301`）。
截圖 `shots/g6d-main.png`、`w1-after-buy.png`、`w2-inventory.png`、`w3-equipped.png`、`w4-pve-weapon.png`。

### 開關現況（`Metal Rage Online Server/dispatch/room.dispatch.js`）

預設 **enabled**：`EQUIP_SAVE_MODE`、`PURCHASE_MECH_SLOT_MODE`、`PURCHASE_ITEMINFO_REFRESH`、`SHOP_FULL_CATALOG_MODE`。
維持 **disabled**：`SHOP_UNBLOCK_MODE`（含已被組語否決的 ShopList 欄位重排，不要打開）、`SHOP_COMPAT_EXPERIMENT`（一次性實驗）。

### 環境注意

- 伺服器目前從 worktree 跑；合併後**要換回主目錄** `/home/lucas/mro-reverse/Metal Rage Online Server` 再 `npm start`。
- worktree 原本缺 repo 根目錄的 `MetalRage` symlink，導致 Cache.Bin 讀不到（只影響 `CACHE_INDEX_BY_ITEM_ID`）。已補。
- DB 已跑過 `tools/renumber-item-serials.js`（70 筆 154–223 → 100154–100223，AUTO_INCREMENT=200000）。腳本冪等，重跑無害。

### 下一步（`docs/backlog.md`）

- **H1** 登入後預設機體的 ShopList 漏接（切機再切回才出現；兩次封包逐位元組相同，是時機問題）
- **H2** G 幣不持久化（重登回到初始值）
- **H3** catalog 髒資料（`ItemIndex 27430`、強化等級 01–08 全部同價）
- Legend（時限）機體授權：`Mech_License_Check`／`IsLicense`（0 無／1 教學／2 購買）對應 DB `mech_licenses`，**填這個欄位的封包還沒找到**。`11100101`／`11200101` 這類配對只是塗裝變體，可裝武器相同（`research/2026-09-18-premium-mech/notes.md`，🟡）。

### 協作狀態

- tmux：`server`（伺服器，Claude 高階自己控，不要請操作者代勞）、`codex`（Luna 中階）、`sol`、`antigravity`。**已開的 session 不要關**，cache 會掉。
- 今天的中階產出全部由 Claude 高階審查過；`SHOP_UNBLOCK_MODE` 的 IsShow 欄位假設已被否決兩次，不要再提。

---

## 目前交接快照（2026-09-17 21:30，Claude 高階，請以此段為準）

### 今天完成的（全部已實測，細節看各篇日誌）

| 項目 | 日誌 |
|---|---|
| 客戶端腳本包 `.tzp` 離線解密，UnrealScript 原始碼可讀（`~/mro-decrypted/src`，**不 commit**，用 `tools/tzp-extract.py` 重建）；class 預設值用 `tools/uetool`（UELib 需套 `tools/uetool/uelib-metalrage.patch`） | `2026-09-17-07`、`-09` |
| PvE 按鍵失效根因：`Grade_Info_SN 0x00510101` 送 11＝開發者權限 → 套 GM 按鍵表；改送 0。`DefaultInfo_SN` 那個欄位其實是 UserType（性別），不是權限 | `-11`（更正 `-08`） |
| PvE 回合沒啟動：`Game_Info_SN` body+0x15 是 MapInfo.Round，原本送 0；改送建房的 PlayRound。附 GAME_INFO 完整偏移 | `-12` |
| 伺服器切 frame bug（補齊到 16 吃掉下一個封包 → 戰鬥中斷線）已修 | `-13` |
| Death_CN：body+0 擊殺者、+2 被擊殺者、+4 類型（1～4＝玩家）；AI 被殺不排程重生 | `-13` |
| 任務結束：`Campaign_CN 0x00230139`（body[2] 1 成功／2 失敗）→ 伺服器回 `EndGame_SN 0x00222213` → 結算頁 → 回房間 | `-14` |
| PvE 地圖／難度照客戶端選的（建房 body[2..3]、`Map_Change_One_CQ` w1/b5）| `-18`（G4）、`-19` |
| ItemInfo 分包（每包 ≤28 筆，現在 12）並送機體本體列 → 機庫顯示機體 | `-20` |
| Death_SN 戰績塊送累計值（`Game_User_Battle_Set` 是直接指定，送 0 會清空）→ 有分數 | `-16`（G2）、`-21` |
| PvE 選機體：`PVE_SLOT_SELECT_FLOW='client'`，開局與陣亡後走 ZSlotSelectPage → `ChangeSlot_CN` → `ChangeSlot_SN` → `Respawn_CN`；`Game_User_SN` 送 8 個槽位 | `-22`（G5） |

### 目前可玩的範圍

登入 → 機庫（看得到 8 台機）→ 建 PvE 房（選地圖／難度）→ 選機體出場 → 開火／跳／推進器 → 敵人與回合 → 擊殺計分 → 陣亡後重選機體 → 任務失敗／成功 → 結算頁 → 回房間。已實測地圖：9001 `Map_PC01`（動力奪取戰）、9010 `Map_PC04`（潛入作戰）。

### 已知問題（未處理）

- 結算頁隊伍分數塊全 0；exp／point 每殺 10 是暫定值（`lobby.dispatch.js`）。
- `Assist_SN 0x00230122` 仍回 16 bytes 空包（正確格式見 G1 `-15`）。
- 遊戲內聊天不顯示（伺服器回了客戶端不認得的 opcode；做法見 G3 `-17`）。
- 機庫換裝備沒有存 DB；`room.dispatch.js` 把 `0x00240112` 當 CQ（DLL 的 DefaultSlot CQ 是 `0x00240111`）。
- 間歇性卡頓，伺服器端看不出網路停頓，疑似客戶端本身。
- `room.dispatch.js` `sendRoomState` 的房間資訊地圖仍固定 9001／舊 index 58，目前沒看到影響。
- Map_PC04 客戶端 log 有 `MRNavigation ... Accessed None 'NodeActor'` 警告。

### 協作狀態

- 分支：`reverse-work`（主線）；中階成果應 commit 到 `flash-wip` 再由高階合併。
- tmux：`server`（伺服器）、Codex session（操作者 2026-09-17 21:45 把原本的 `sol` 關掉，改開 Codex 主力做 backlog）。Sol（高階 reviewer）額度約剩 30%，只留給重要審查；已開的 Codex session 不要隨便關，cache 會掉。
- `docs/backlog.md` 的 G1～G5 都已完成並審查。

### 下一步

- **Claude 額度將盡**，操作者決定交給 Codex（Luna，中階）或 Gemini（中階）：做 `docs/backlog.md` 的 **G6（機庫換裝備存檔）**，有餘力再做 **G7（遊戲內聊天顯示）**。兩個都允許改伺服器，但新行為要放在預設關閉的開關後面、在 `flash-wip` 分支、實測時暫時打開，規則寫在 backlog「2026-09-17 21:40 新增」。
- 審查：Codex reviewer Sol（需要時用 `codex -m gpt-5.6-sol` 另開，額度約 30%）或下一個接手的 Claude。審過才把開關預設打開並合併回 `reverse-work`。
- 之後的候選：結算細節（EndGame_SN 隊伍分數、exp／point 真實算法、遊戲結束後取消殘留重生）、`Assist_SN` 照 G1 補格式。
