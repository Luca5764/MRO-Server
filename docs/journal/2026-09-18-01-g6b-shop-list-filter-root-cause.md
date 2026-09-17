# G6b：機庫商店清單被客戶端篩掉的原因（待審）

## 結論摘要

- 本篇只做靜態分析與既有 log／Cache.Bin 對照；沒有改程式、資料庫、開關，
  沒有開 server，也沒有請操作者實測。
- 🟡 `[DLL][CACHE]` 實際 `ShopList_SN 0x00240241` 的第一件
  `21100101` 能通過 `Item_List_Check`；它不是在清單 handler 的 Cache 存在性
  檢查被丟掉。
- 🟡 `[SRC][CACHE][LOG]` 它之後會在 `ZPanel_ShopItems.ListLoad()` 的
  `ItemSubordinateCheck()` 被排除：目前槽位的 body 是 `11100101`，而既有
  客戶端 log 已記錄 `Small Cannot use ... MOC_a`。這解釋了主武器 tab 為空。
- 🟡 `[SQL][DLL]` 伺服器 slot=1 的 catalog 篩選送出的是 `21x` 主武器家族；
  官方 Cache `DefaultSetList` 的第一槽主武器是 `22100101`。也就是說，
  `catalog.mech_type=1` 使伺服器選出一批能進 wire、但不適合目前小型機的商品。
- 高階已確認的 `IsShow=+0x0D` 與舊 sender 寫法本篇沿用；不打開
  `SHOP_UNBLOCK_MODE` 的欄位修正，也不重排腳本 struct 與 wire format。

## 逐關檢查

| 實際商品 | 封包／資料證據 | Item_List_Check | ListLoad 後續 | 判定 |
|---|---|---|---|---|
| `21100101` | 2026-09-17 log 的 10 筆 point/cash frame 第 1 筆；Cache record `[2,1,1]` | `0x107180b9` 呼叫 `GetGameItemRecord`，結果的 ItemIndex 非零，回傳 true | `IsShow=1`、`HighGroup=2` 通過；`ItemSubordinateCheck` 依 `11100101` body 檢查相容性而不通過 | 🟡 待審；有既有 `Small Cannot use ... MOC_a` log 支持 |
| `21200101` | 同一 10 筆 frame 第 2 筆；Cache record `[2,1,2]` | 同上，Cache 有記錄 | `IsShow=1`、`HighGroup=2` 可通過；與小型機的逐筆 SubOrdinationRecord 尚未在本輪完整抽出 | ⬜ 未知（不能只因同家族猜成已確認） |
| `21300101` | 同一 frame 第 3 筆；Cache record `[2,1,3]` | 同上，Cache 有記錄 | `IsShow=1`、`HighGroup=2` 可通過；逐筆相容性未單獨核定 | ⬜ 未知 |
| `21500101` | 同一 frame 第 4 筆；Cache record `[2,1,5]` | 同上，Cache 有記錄 | `IsShow=1`、`HighGroup=2` 可通過；逐筆相容性未單獨核定 | ⬜ 未知 |
| `31100101` | 2 筆 frame；Cache record `[3,1,1]` | 能通過 Cache 存在性 | `HighGroup=3`，主武器 group=0 時不列入；不是本次主武器空白的商品 | 🟡 待審 |

`212/213/215` 的逐筆相容性不能以「21x」字首代替原始
SubOrdinationRecord；研究檔只把它們保留為待審，不猜格式。至少第一件
`21100101` 已足以指出實際商品在 `ItemSubordinateCheck` 關卡被排除，並解釋
為何清單 handler 有收到多件資料而 UI 仍為空。

## DLL：Item_List_Check 到 Add

- `[DLL]` `0x10702a7c -> 0x10718040` 是 `Item_List_Check`；Shop caller 在
  `0x107e2959`、Cash caller 在 `0x107e2b89` 呼叫它，失敗才跳到各自的丟棄／
  error log 分支。
- `[DLL]` 函式把 caller 複製的 20-byte entry 指標取為參數，呼叫
  `GetCache()`（`0x107180a8`）及 `GetGameItemRecord`（`0x107180b9`），
  最後測試複製 record 的 `ItemIndex`（`0x107180e6`）。這裡沒有讀 entry
  `+0x0D`、價格、分類或 owned inventory。
- `[DLL]` 通過後，`ShopList_SN` 在 `0x107e29fe` 呼叫
  `Item_ShopList_Add`，Cash 在 `0x107e2c2e` 呼叫
  `Item_CashShopList_Add`；兩個 Add body 又各自以 Cache record 填入 0x50-byte
  detail，故 `HighGroup` 不是由 server catalog 欄位直接塞給 client。
- 完整相關組語與 import 位址見
  `docs/research/2026-09-18-shop-list/shop-list-assembly.txt`。

## 腳本 ListLoad 的所有篩選

- `[SRC]` `ZPanel_ShopItems.uc:387-390`：`IsShow == false` 直接 continue。
- `[SRC]` `:397-403`：主武器 group 要求 `HighGroup == 2`，再呼叫
  `ItemSubordinateCheck(ItemIndex)`；副武器、裝備、其他物品分別用 3、4、
  1 或大於 4。
- `[SRC]` `:434-437`：`RequestLevel` 不會丟列，只設 `IsNotUse`。
- `[SRC]` `:441-465`：`IsNotUse`、`IsNew`、`IsHot`、`IsSale` 只影響排序，
  不是清單排除條件。
- `[SRC]` `:690-746`：`ItemSubordinateCheck` 取目前槽位 body 的
  `MechHighGroup/MiddleGroup`，再逐筆比對 Cache 的 SubOrdinationList；
  一般項目要求兩個 group 相等，特殊項目比 `SubordinationIndex`。
- 因此顯示旗標與等級不是這批主武器空白的充分原因；商品相容性才是目前
  有直接資料支持的丟棄點。

## 伺服器送出時機與 catalog

- `[LOG]` 同一段紀錄先送 `Open_SA 0x00240102`（ms 153536），再送
  `DefaultSlot_Change_SA 0x00240113`（153590），約 65ms 後送 10 筆
  `ShopList_SN/CashShopList_SN`（153601），場景 context 是 hangar
  `roomType=2`。完整 hex 在 research 檔。
- `[CODE]` `room.dispatch.js:441-470` 是同一時序：先 Open_SA，50ms callback
  送 package／wear/default slot，再送 shop list；不是錯送到 PVE/game scene。
- `[SQL]` `metalrageserver.sql:212-226` 的 21x rows 都是
  `category_type=2, mech_type=1`；`:227` 的 `22100101` 是
  `category_type=2, mech_type=2`。`buildShopItems()` 以 selectedSlot 過濾，
  所以 slot=1 得到 21x 而排除 221。
- `[CACHE]` Cache `0x37456` 的 DefaultSetList 第一列是
  `11100101, 1, 22100101, 32100101, 31100101, 41100101, 61101001`。
  這與既有 `[LOG]` 的 Small/MOC 不相容觀察相互支持。
- 時序仍可用單變數實驗獨立排除，但不需要假設時序問題，就已能解釋
  `21100101` 在 UI 清單消失的關卡。

## 最多兩個單變數實驗（僅建議，不執行）

1. 只把 slot=1 主武器清單的第一個商品由 `21100101` 換成 Cache 相容的
   `22100101`，保留 20-byte 其餘欄位、Open_SA 順序與所有旗標不變。若只此列
   出現，直接確認是 `ItemSubordinateCheck`／catalog 相容性，而不是 IsShow。
2. 若實驗 1 通過，再保持商品 ID 不變，只把同一批 ShopList 發送點延後到
   已有 `Slot_Change_SA 0x00240108` 後一次；用來區分資料被篩掉與 page
   `ShopUpdate()` 先於 native list 到達的時序問題。兩次都應維持預設關閉。

## 交付狀態

- 原始組語、完整已知商店 frame hex、Cache/catalog 解析：
  `docs/research/2026-09-18-shop-list/`。
- 本篇所有新結論標為 🟡／⬜ 待高階審查；沒有改 `state.md`，沒有標 ✅。
- 未改程式、DB schema/data、G6 save handler、ItemInfo 分包、PVE_SLOT_SELECT_FLOW、
  Grade_Info、Death_SN 或 G7。
