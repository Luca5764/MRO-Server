# G6-unblock：ShopList／購入後 ItemInfo 靜態分析（待審）

## 範圍與結論

- 本輪只處理 `ShopList_SN 0x00240241`、`CashShopList_SN 0x00240242`、
  `Packege_Item_SN 0x00240131`，以及購買成功後必要的 `ItemInfo_SN 0x00210111`。
- 🟡 `[DLL]`／client source 對照顯示，既有 ShopList entry 把四個顯示旗標整體右移
  一個 byte；`IsShow` 因而落在 client 讀取位置的前一個 byte，
  `ZPanel_ShopItems.ListLoad()` 會在第一個判斷直接丟掉每一列。
- 已加入預設關閉的 `SHOP_UNBLOCK_MODE`。開啟時只修正 ShopList 四個旗標位置，
  並在購買 DB insert 後、`0x00240202` 回覆前，以既有 chunked sender 重送 ItemInfo。
  預設仍是 `disabled`，本輪沒有開 server 或實測。

## 客戶端靜態證據

### ShopList entry

`/home/lucas/mro-decrypted/src/ZNetwork/ZNetwork_DJ.uc:172-183` 的舊
`SHOP_ITEM_INFO` 定義順序是三個 `int`：`ItemIndex`、`DisplayPrice`、`Price`，
接著 `bool IsShow`、`IsNew`、`IsHot`、`IsSale`，最後是 `SellSort`。
`/home/lucas/mro-decrypted/src/ZGameMainMenu/ZPanel_ShopItems.uc:387-405`
的 `ListLoad()` 先檢查 `ItemList[n].IsShow`，再以 `HighGroup == 2` 選主武器，
並呼叫 `ItemSubordinateCheck(ItemIndex)`；所以 `IsShow` 為零時尚未進入
主武器篩選，`HighGroup`／subordination 不是本次空白的首要原因。

已知實際 frame 長度是 `43/143/203/263/503`，即 body `3 + 20*n`
（`docs/opcode-ledger.md:203`）。因此三個 4-byte 欄位後的四個 bool
正好是 entry `+0x0c..+0x0f`；剩下 `+0x10..+0x13` 保留既有
`SellSort` 的 `[01, 'P'/'C', 00, 00]` 編碼。現行 code 在 `+0x0c` 寫 0、
在 `+0x0d..+0x0f` 才寫 `IsShow/IsNew/IsHot`，這與上述欄位順序衝突。

修正後的逐欄位 body（LE）為：

| offset | size | 欄位 | enabled path |
|---|---:|---|---|
| `+0x00` | 4 | `ItemIndex` | catalog raw `item_id` |
| `+0x04` | 4 | `DisplayPrice` | `discount_price`，無效時 `Price` |
| `+0x08` | 4 | `Price` | catalog `price` |
| `+0x0c` | 1 | `IsShow` | `1` |
| `+0x0d` | 1 | `IsNew` | `item_catalog.is_new` |
| `+0x0e` | 1 | `IsHot` | `item_catalog.is_hot` |
| `+0x0f` | 1 | `IsSale` | `0`（schema 沒有 sale 欄位） |
| `+0x10..0x13` | 4 | `SellSort` | existing `01, 'P'/'C', 00, 00` |

`ShopList_SN`／`CashShopList_SN` 的 client handler 完整 DLL VA 尚未在本
worktree 的 research 中保存；只有 opcode dispatch map 與 frame 長度紀錄。
這裡不猜 handler 位址，欄位修正只依 client source struct、ListLoad 使用方式及
已觀察的 20-byte entry 長度。

### Packege_Item_SN

目前 sender 的 body 是：`u8 count`，接著每列 `u32 SerialIndex`、
`u32 ItemIndex`，所以 body size 是 `1 + 8*n`。本輪沒有找到該 SN handler
的 DLL assembly 或可核對的 client 使用者；因此保留目前的 raw catalog
`item_id`、不改格式，也不把它誤當成 `HaveList` 的主要來源。

### ItemInfo_SN（購買後 owned inventory）

這條路徑有完整 DLL assembly 可核對：

| DLL VA | 證據 |
|---|---|
| `0x107095c0` | `ZDispatchAccount::ItemInfo_SN` export thunk，跳到 `0x107c4560` |
| `0x107c45aa` | 跳過 16-byte frame header |
| `0x107c45bf`、`0x107c45ca`、`0x107c45cf` | body `+0x01` 是 count |
| `0x107c45e9`、`0x107c45f9` | 每筆 record size `0x23`（35 bytes） |
| `0x107c467b`、`0x107c4680` | 逐筆呼叫 `Item_Add` |
| `0x10704840` → `0x10732450` | `Item_Add` thunk／本體 |
| `0x10732616`、`0x1073262d`、`0x1073263e` | 依 SerialIndex 更新或追加，不是整包替換 |

現有 `dispatch/item-info.sender.js` 已符合這個 6-byte header、35-byte
record 與 `<= 0x400` frame 限制；`ITEM_INFO_CHUNK=12` 也低於 DLL
接收上限。購買成功後只補送同一 sender，沒有另造 ItemInfo 格式，也沒有
改 `PVE_SLOT_SELECT_FLOW`、`Grade_Info`、`Death_SN` 或 G6 save handler。

逐欄位格式為：header `+0x00 SuccessFlag u8`、`+0x01 ItemCount u8`、
`+0x02 AccountKey u32`；每筆 `+0x00 serial u32`、`+0x04 item_id u32`、
`+0x08 equipped u32`、`+0x0c reserved u32`、`+0x10 mech_type u16`、
`+0x12 part_slot u32`、`+0x16 use/equipped byte`、`+0x17 quantity u32`、
`+0x1b/+0x1f expiration u32`。

## 失敗嘗試與實測邊界

- `[LOG]` `docs/journal/2026-09-17-23-g6-slot-change-save.md:62-69`：U1
  購買 `41200101` 確實寫入 DB，items `34→35`，但它是 part 4 booster，
  不是主武器；重登後截圖 `shots/shot-221153.png` 仍顯示主武器右側商店空白、
  左下只有一把已擁有主武器。
- 這次 U1 沒有第二把主武器 serial，故不能用它觸發／驗證
  `Slot_Change_CQ 0x00240107` 的不同 serial，也不能把 G6 保存結果當成
  ShopList 修正證據。
- 本輪沒有新增未知 opcode；沒有可保存的未知 packet hex，因此沒有用推測值
  補寫 hex dump。下輪若出現未知 frame，仍須保留完整 body hex。

## 交付與待審

- 最小程式 diff：`Metal Rage Online Server/dispatch/room.dispatch.js`。
- 新行為開關：`SHOP_UNBLOCK_MODE = 'disabled'`；未啟用時保留舊 sender 行為。
- `node --check` 與 `git diff --check` 已通過。
- ⬜ 待高階核對 ShopList handler 的 DLL VA／原始 bytes；未將本輪結論標成
  `✅ 已確認`，也未進行實測。
