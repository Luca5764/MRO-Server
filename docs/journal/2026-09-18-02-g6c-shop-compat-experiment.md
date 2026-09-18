# G6c：商店相容性單變數實驗實測結果

契約：`docs/backlog.md` G6c；前篇 `docs/journal/2026-09-18-01-g6b-shop-list-filter-root-cause.md`。

## 結論摘要

- ✅ `[LOG][OBS][SHOT]`（Claude 高階裁定）：主武器商店空白的原因是伺服器用
  `item_catalog.mech_type`（實際上是武器家族編號）依槽位篩商品，送出的
  21x 家族全部過不了客戶端 `ZPanel_ShopItems.ItemSubordinateCheck()`；
  把 slot=1 主武器清單第一筆由 `21100101` 換成小型機相容的 `22100101`
  後，該筆立刻在 UI 顯示，其餘 9 筆（未換）仍不顯示。
- ❌ 同時排除的替代解釋：IsShow 欄位偏移（`+0x0D` 寫法不變也能顯示）、
  送出時機（在 `Open_SA` 之後約 65ms 送出，不變也能顯示）、
  `Item_List_Check` 把商品丟掉（21x 本來就能通過它，見 G6b）。
- 🟡 待進一步確認：同一批 5 個 frame 在這次連線被重送三輪，UI 沒有出現
  三份重複，疑似客戶端對同一 `ItemIndex` 不會重覆列出；本次沒有針對這點
  做單變數實驗。
- 下一步：真正的修正是伺服器不要用 `mech_type` 篩選，改成把可販售商品
  全部送出，交給客戶端相容性檢查過濾（G6d，由 Claude 高階指派）。

## 實測資料

- `[LOG]` worktree `Metal Rage Online Server/logs/session-20260917-231213.jsonl`，
  ms 27716342 起（本機時間 2026-09-18 約 06:55）送出
  `ShopList_SN 0x00240241` len=203，header `01 00 0a` = 10 筆 × 20 bytes。
  第 1 筆 `ItemIndex=22100101`、DisPrice=1000、Price=1000，其餘欄位
  `00 01 00 00 01 50 00 00`（`+0x0D` IsShow=1、`+0x11` `'P'`）；第 2～10 筆
  依序為 21200101、21300101、21500101、21100201、21200201、21300201、
  21500201、21200301、21300301（未換）。
- `[LOG]` 同時間送出的 `CashShopList_SN 0x00240242` len=203 第 1 筆仍是
  `21100101`（實驗只套用在一般商店 `ShopList_SN`，未動 Cash 分支）；其餘
  相同。
- `[LOG]` 同一批還有 43／143／263／503 bytes 的 frame（31x 2 筆、41x 7 筆、
  51x 13 筆、61x 25 筆），內容未改，作為對照組。
- `[OBS]` 操作者 2026-09-18 早上依契約把
  `Metal Rage Online Server/dispatch/room.dispatch.js` 的
  `SHOP_COMPAT_EXPERIMENT` 改成 `'enabled'`、從 worktree 重啟伺服器、進
  機庫 1 號機開商店。
- `[SHOT]` `shots/g6c-shop.png`（Claude 高階 06:58 用 `tools/win/shot.sh`
  截取，存在主目錄 `/home/lucas/mro-reverse/shots/`）：G幣商城 → 主武器頁
  恰好一件商品「輕量型來福機槍 1000G」；其餘分頁與機庫配裝畫面正常，
  沒有斷線。

## 排除的替代解釋

- ❌ IsShow 欄位偏移：`+0x0D` 寫法本次沒有改，換過的那筆一樣顯示，代表
  空白不是 IsShow 位置錯誤。
- ❌ 送出時機：`ShopList_SN` 仍在 `Open_SA` 後約 65ms 送出，時序不變也能
  讓換過的一筆顯示，排除「page 先於 native list 到達」的時序假設。
- ❌ `Item_List_Check` 丟棄：G6b 已用 DLL 位址核對 21x 系列能通過
  `Item_List_Check`（只看 Cache 是否存在），本次實測與此一致，沒有反例。

## 交付狀態

- 開關 `SHOP_COMPAT_EXPERIMENT` 實測後已改回 `'disabled'`（原始預設
  行為）。
- 只動了這篇日誌、`docs/journal/INDEX.md`、開關這一行；沒有動
  `SHOP_UNBLOCK_MODE`、ItemInfo 分包、`PVE_SLOT_SELECT_FLOW`、Grade_Info、
  Death_SN、G7、`docs/state.md`、資料庫。
- 下一步交給 Claude 高階指派的 G6d：伺服器改成送出可販售商品全集，交由
  客戶端 `ItemSubordinateCheck` 過濾，而不是伺服器自行用
  `catalog.mech_type` 篩選。
