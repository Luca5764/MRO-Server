# E1 設計稿：物品「擁有」與「裝在哪台」拆開（IsShare）

> 中階（Claude Sonnet worker）產出，🟡／待審，未經跨公司審查。PM 已裁決 E1 排在 M2 之後；本篇只寫設計，未改程式、未改 DB（只執行過唯讀 `SELECT`）。

## 1. ShareType 的 Cache.Bin 偏移

- [SRC] `~/mro-decrypted/src/Engine/CacheManager.uc:131-159` `GameItemRecord` 欄位宣告順序：
  `ItemIndex, RepresentIndex, HighGroup, MiddleGroup, LowGroup, DetailGroup, SellType(string),
  DisplayPoint, SellPoint, DisplayCash, SellCash, DisplayCoupon, SellCoupon, BonusPoint, Grade,
  UseType, UseCount, UseTime, RequestLevel, FunctionIndex, ShareType, MergeType, CanGift,
  HaveSocket, DefaultSocketCount, MaxSocketCount`。
- [CACHE] 已知錨點沿用 `room.dispatch.js:196-198`（`GAME_ITEM_RECORD_TABLE_START 0x2294`、
  stride `0x67`、`count 2112`）與 `docs/research/2026-09-18-shop-item-period/parse_22100101_family.txt`
  已經逐欄位手算出的絕對位置（`SellType_lenbyte` 固定 `0x02`，即 1 個 ANSI 字元 + null，
  欄位本身 3 bytes）。用這兩份資料回推整數欄位偏移：
  `+0x00 ItemIndex, +0x04 RepresentIndex, +0x08 HighGroup, ..., +0x18 SellType(3B),
  +0x1B DisplayPoint ... +0x43 UseTime（= room.dispatch.js 現有的「期限秒數」）,
  +0x47 RequestLevel, +0x4B FunctionIndex, +0x4F ShareType, +0x53 MergeType, +0x57 CanGift,
  +0x5B HaveSocket, +0x5F DefaultSocketCount, +0x63 MaxSocketCount`（結束於 `+0x67`，正好等於
  已知 stride，交叉驗證成立）。
- **本任務新驗證**：[CACHE] 寫了唯讀腳本
  `docs/research/2026-09-19-e1-item-ownership/parse_share_type.py`，直接讀
  `/home/lucas/mro-reverse/MetalRage/Data/System/Cache.Bin`（唯讀），用上述固定 stride 掃過全部
  2112 筆，逐筆檢查 `SellType` 長度 byte 是否都是 `0x02`——**全部 2112 筆都是**，代表整張表的
  固定 stride／偏移假設在全表成立，不只兩個樣本家族。完整輸出見
  `docs/research/2026-09-19-e1-item-ownership/output.txt`。
- **結論（🟡 [CACHE]，偏移本身信心高，語意詮釋仍待審）：`ShareType` 在
  `GAME_ITEM_RECORD_TABLE_START + i*0x67 + 0x4F`。**

### 各類數量（HighGroup 依 `CacheManager.GetSpecItemName` 的分類：2=主武器 3=副武器 4=推進器 6=塗裝）

| 類別 | 總數 | ShareType=0 | ShareType=1 |
|---|---|---|---|
| 主武器 | 495 | 495 | **0** |
| 副武器 | 192 | 0 | **192（全部）** |
| 推進器（裝備／booster） | 72 | 30 | 42 |
| 塗裝 | 633 | 633 | **0** |
| 機體 | 104 | 104 | 0 |
| 駕駛員 | 143 | 143 | 0 |

- **注意：PM 交付契約裡的例子標反了類別。** 用 `tools/item-names.py` 查證：
  - `32100101` 簡易機槍：`HighGroup=3`（**副武器**，不是主武器），實測 `ShareType=1`。
  - `26300101` 奪魂鋸：`HighGroup=2`（**主武器**，不是副武器），實測 `ShareType=0`。
  - 這組例子換過來剛好完美對應操作者的哥哥的回報（「以前輔助武器、裝備買了以後所有機體都能用」
    ——輔助武器＝副武器＝全部 `ShareType=1`；主武器從未共用）。
- 推進器（booster）是混合的：同一把武器的「永久版」（`RepresentIndex==ItemIndex`，
  `UseType=4`／`UseTime=0`，例如 `41100101` 電漿推進器）`ShareType=0`；同一把武器的**天數租借
  變體**（`41100102`–`41100108`，`UseType=2`、`UseTime` 為對應秒數）目前看到的樣本
  `ShareType=1`。**這條「永久版=0、租借版=1」的規則只從一個 booster 家族觀察到，樣本數不足以
  當通則（30/42 的總數也對不上「每家族 1 個永久+N 個租借」的簡單假設）；標 ⬜，需要更多
  booster 家族樣本才能下通則。**
- 塗裝、機體、駕駛員全部 `ShareType=0`，跟操作者的哥哥沒提到這兩類有關（塗裝本來就綁 mesh，
  換機體大概率本來就用不上）。

## 2. 現況（伺服器怎麼把 items 綁死在一台機上）

- [CODE] `items.mech_type` 一件物品只能綁一台機；購買 `room.dispatch.js:884-892` 直接
  `INSERT INTO items (..., mech_type, part_slot, ...)`，**不檢查帳號是否已經擁有同一
  `item_id`**——同一件東西買兩次會變兩筆各自綁不同機的列（見下面 §5 的實際 DB 例子）。
- [CODE] `saveEquippedLoadout`（`database/db.js:152-220`，換裝 `Slot_Change_CQ` 的落地路徑）：
  - 先把目標機（`mech_type = 傳入的 slot`）目前所有 `part_slot 0-5` 的列 `equipped=0`（清空整台機）；
  - 再把**這批 serial**（不分原本在哪台機）`equipped=0`（一個 serial 同時只能裝在一個地方）；
  - 最後把這批 serial `UPDATE ... SET equipped=1, mech_type=?, part_slot=?`——**這行同時改寫了
    `mech_type`**，等於把該 serial 的「擁有歸屬」也一起搬到新機，不只是「裝備」狀態。非共享
    物品原本掛在 A 機、換到 B 機裝上之後，A 機的庫存清單會直接看不到它（不是顯示成「未裝備」，
    是那一列的 `mech_type` 已經不是 A 了）。
- [CODE] 三個讀取路徑都用同一種「精確符合 `items.mech_type`」的篩選，換句話說目前系統裡「哪台機
  能看到某個 serial」跟「該 serial 裝在哪個部位」是同一個 `mech_type` 欄位決定的，沒有分開：
  - `WearInfo_SN 0x00210113`：`account.dispatch.js:659-671`、`room.dispatch.js:1035-1038`／
    `1359-1366`，都用 `item.equipped && item.mech_type >= 1 && item.mech_type <= MAX_MECH_COUNT`
    分桶進 `mechSlots[item.mech_type][slot]`。
  - `Game_User_SN 0x00222112`：`room/room-game-user.sender.js:72-78` 的 `equippedBySlot(items,
    mechType, partSlot)`，精確比對 `item.equipped===1 && item.mech_type===mechType &&
    item.part_slot===partSlot`。
  - `Slot_Change_SA 0x00240108`：`room.dispatch.js:818`
    `Number(item.mech_type) !== Number(slot) || Number(item.equipped) !== 1` 篩掉非本機已裝備物。
  - `ItemInfo_SN 0x00210111`：`dispatch/item-info.sender.js:45` 把 `item.mech_type` 原樣塞進
    wire record `+0x10`（`u16`），純粹是庫存清單的展示欄位，不是「哪台機能用」的判斷依據——那個
    判斷在客戶端另外走 `ItemSubordinateCheck`（見下段 §3）。

## 3. 新模型

**擁有表／裝備表拆開：**

- `items`：保留現有欄位當「這帳號擁有哪些 serial」的表，`mech_type` 欄位**不再有意義**（保留
  欄位本身避免大改 schema，但停止在任何讀寫路徑當作「屬於哪台機」使用；新程式碼一律改讀新表）。
- 新增 `item_equips`（草案）：`(id, account_id, item_id /* = items.id，即 serial */, mech_slot
  1..8, part_slot 0..5)`，`UNIQUE (account_id, mech_slot, part_slot)`（一台機一個部位同時只能裝
  一個 serial）。
  - **非共享物品**（`ShareType=0`）：裝到 B 機時，先刪掉這個 `item_id` 在其他所有列的
    `item_equips` 紀錄，才插入 B 機這筆——對應 [SRC] `ZPage_Hangar.uc:917-924` `ItemFree()`
    「裝到 B 就從 A 卸下」的行為。
  - **共享物品**（`ShareType=1`）：同一個 `item_id` 可以同時出現在多筆 `item_equips`（不同
    `mech_slot`），只要每筆的 `(account_id, mech_slot, part_slot)` 唯一。
  - `ShareType` 判斷需要伺服器能查到，建議在既有 `item_catalog`（或等價的 catalog 表，
    `database/db.js` 已有讀 catalog 流程）加一欄 `share_type`，用跟本任務相同的固定偏移
    `+0x4F` 從 Cache.Bin 匯入，避免每次請求都重新解析 Cache.Bin。
- `WearInfo_SN`、`Game_User_SN`、`Slot_Change_SA` 三個讀取路徑，全部改成查
  `item_equips WHERE account_id=? AND mech_slot=?`（取代現在對 `items.mech_type` 的篩選），
  `part_slot` 邏輯不變；共享物品因此可以同時出現在多台機的查詢結果裡。
- `saveEquippedLoadout` 改寫：不再 `UPDATE items SET mech_type=?`，改成對 `item_equips` 做
  「清掉這台機這幾個部位的舊列 → 依 `share_type` 決定要不要先清掉別台機的同 serial 列 →
  insert 新列」。`items.equipped` 欄位的意義也要重新界定（目前是「有沒有裝備」的全域旗標，
  拆表後應該由 `item_equips` 是否存在對應列取代，或乾脆棄用）。
- **`ItemInfo_SN` record `+0x10` 該送什麼：⬜ 未知，暫不建議動。**
  依 [SRC] IS1 既有分析，`ITEM_DETAIL_INFO`（`ZNetwork_DJ.uc:185-220`）本身沒有「屬於哪台機」的
  欄位，`+0x10` 目前對應的是伺服器自訂的 35-byte wire record 裡的 `mech_type`（`u16`），不是
  UnrealScript struct 裡任何一個已知欄位的直接映射（現有 wire 格式是伺服器自己設計的精簡版，
  `docs/journal/2026-09-17-03-iteminfo-accumulation.md` 只確認了 body 的 count／stride／
  Item_Add 呼叫方式，沒有逐欄位對到 `ITEM_DETAIL_INFO` 的欄位名）。
  **本任務新發現（⬜，超出 IS1 範圍，建議另開票查）**：`ITEM_DETAIL_INFO.IsShare`
  （`ZNetwork_DJ.uc:216`）在客戶端 `ZPage_Hangar.uc:442-476`（`PROCESS_USE`／`PROCESS_DELETE`，
  也就是**已擁有物品**的路徑）是**直接從網路收到的 `ItemList[n].IsShare` 讀出**，不是客戶端
  自己查 Cache 算的；只有 `PROCESS_BUY`／`PROCESS_METAL`（尚未擁有、商店彈窗）才會用
  `GetGameItemRecord(...).ShareType` 現查 Cache。現在的 35-byte `ItemInfo_SN` record
  （`dispatch/item-info.sender.js:35-52`）**沒有寫任何一個位元給 `IsShare`**，如果客戶端真的
  依賴這個欄位判斷「已擁有物品能不能同時裝多台」，光改 DB 模型可能不夠，還需要在 wire record
  裡找一個位元送 `IsShare`（或確認客戶端在拿到 0 時的預設行為剛好等於我們要的行為）。這件事
  需要對 `0x107095c0` 一路组語核對 wire record 到 `ITEM_DETAIL_INFO` 欄位的完整映射，本任務
  的分析範圍不含這個，先記錄成阻塞。

## 4. Migration 腳本草案（不建立檔案，只寫在這裡；之後要放 `tools/`，高階執行前先備份）

```
-- 冪等，交易包起來；執行前印出 items 總筆數、equipped=1 筆數，執行後再印一次比對。

BEGIN;

-- 1. 新表（IF NOT EXISTS，重跑安全）
CREATE TABLE IF NOT EXISTS item_equips (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_id INT NOT NULL,
  item_id INT NOT NULL,
  mech_slot TINYINT NOT NULL,
  part_slot TINYINT NOT NULL,
  UNIQUE KEY uniq_mech_part (account_id, mech_slot, part_slot)
);

-- 2. 只搬「目前確實已裝備」的列，用 WHERE NOT EXISTS 保證重跑不會產生重複
INSERT INTO item_equips (account_id, item_id, mech_slot, part_slot)
SELECT i.account_id, i.id, i.mech_type, i.part_slot
FROM items i
WHERE i.equipped = 1
  AND i.part_slot BETWEEN 0 AND 5
  AND NOT EXISTS (
    SELECT 1 FROM item_equips e
    WHERE e.item_id = i.id AND e.mech_slot = i.mech_type AND e.part_slot = i.part_slot
  );

COMMIT;
```

- **先備份**：跑之前對 `items` 表（至少）做一次 `mysqldump`，腳本本身印出備份指令，不自動執行。
- **冪等性**：`WHERE NOT EXISTS` 讓重跑不會重複插入；`UNIQUE (account_id, mech_slot, part_slot)`
  會在真的撞到「同一台機同一部位有兩個不同 equipped=1 的 serial」時讓 INSERT 失敗並中止交易，
  而不是靜默選一個——這種情況目前 schema 理論上不該發生（`items.part_slot` 篩選在
  `saveEquippedLoadout` 裡已經先清過同機同部位），但 migration 腳本要能大聲失敗，不能猜。
- **P1b 舊測試殘留（帳號 1 的 `22100201`、`24100301`）自然不會造成衝突**：[DB] 唯讀查詢
  （見 §5）目前 `22100201` 的兩筆（serial 100221 mech2、100222 mech1）**equipped 都是 0**，
  `24100301` 兩筆裡只有一筆（serial 200011，mech4）`equipped=1`——這個腳本只搬 `equipped=1`
  的列，兩個殘留品自動被排除，不需要另外處理。**但殘留的 `equipped=0` 列本身還是會留在
  `items` 表**，是庫存清單裡看得到、裝不上（因為沒有任何一筆會被搬進 `item_equips`）的死物件；
  P1b 那張票的清理範圍仍然是獨立的，本腳本不處理它。

## 5. E1 與 P2 是否同一根因

- [DB] 唯讀查詢帳號 1、3 的 `items`（`database/config.json` 的連線，只下過 `SELECT`）：帳號 3
  的 `item_id=33800101`（HighGroup=3 副武器，`ShareType=1`）有三筆列：`mech_type=5 equipped=0`、
  `mech_type=5 equipped=1`、`mech_type=1 equipped=1`——**同一件共享物品被買了三次**，目前恰好
  兩台機同時 `equipped=1`。這証實了 §2「購買不檢查已擁有」造成的現象：玩家感覺「這件東西在多台
  機上都能用」，其實是意外重複購買湊出來的假象，不是系統真的支援共享；`item_id=41200201`（推進器
  租借變體）也是同樣的模式，兩筆分別 `mech_type=3`／`mech_type=1` 同時 `equipped=1`。
- [CODE] `saveEquippedLoadout`（§2）把「裝備」跟「擁有歸屬」用同一個 `mech_type` 欄位處理，
  意味著把一個非共享 serial 從 A 機換裝到 B 機，A 機那個部位不會回到「有這件但沒裝」，而是這件
  東西直接從 A 機的庫存清單消失（`mech_type` 已經改寫成 B）。這是 §3 要拆表解決的核心問題。
- **P2**（`docs/backlog.md` P2 節）的症狀是「其他機體換裝完整後，進 PvE 只保留主武器，副武器／
  裝備回預設」。P2 既有分析（高階初審，🟡）已經核對過 `session-20260918-214305.jsonl`：
  - `Slot_Change_CQ` 送到伺服器的六個欄位（body/main/left/right/equipment/skin）在測試的 slot 1
    跟 slot 3 都非零；
  - `saveEquippedLoadout` 落地後，DB 裡對應欄位也都存到了（slot 1 五個非零欄位全存，slot 3 的
    `right`／`equipment` 本來 CQ 就是 0，不是遺失）；
  - `Game_User_SN` 組包時也確實從 DB 分別讀了 main／left／right／booster／skin，不是只組主武器。
  - 換句話說，**P2 已經走到「CQ→DB→Game_User_SN 全部正確」，問題發生在更後面**——P2 票面上
    寫的剩餘嫌疑是「戰鬥中切換機體」：`Game_Slot` 由客戶端在本機切換，不經過伺服器，伺服器端
    完全看不到這個動作。
  - **🟡 結論：以目前證據看，P2 跟 E1 不是同一個根因。** E1 的問題（`mech_type` 同時代表
    「擁有」跟「裝備」）會讓非共享物品在换裝時整批從舊機「消失」，但 P2 分析的那筆重播資料顯示
    DB 在請求的機體上是完整存好的——如果是 E1 的問題，應該是「換到另一台機時，另一台機的東西不見」，
    而不是「同一台機自己的副武器/裝備在進 PvE 這一步驟丟了」。**不建議合併 P2 進 E1**；但兩張票
    共用同一段 `items` 讀寫路徑，E1 實作時應該把 P2 用到的那個 `session-20260918-214305.jsonl`
    重播樣本也一起跑一次回歸，確認拆表沒有意外改掉 P2 已經確認正確的那段行為。
  - 這個判斷是**用現況 DB＋程式邏輯推論**，不是重放歷史操作序列（帳號 1、3 的購買/換裝順序
    無法從現有資料還原），所以標 🟡，不排除還有其他解讀。

## 6. 回歸測試影響

- `test/fixtures/fake-db.js`：`items` 固定資料（`:157-158` 起）跟 mock 的
  `INSERT INTO items (...) VALUES` 解析器（`:234-241`）都要跟著加一份對應的 `item_equips` mock
  資料與 SQL 比對分支；現有黃金樣本裡任何走過 `WearInfo_SN`／`Game_User_SN`／`Slot_Change_SA`
  的封包，輸出的位元組不會變（只要 migration 後 `item_equips` 的內容跟原本 `mech_type` 篩選
  結果一致），但**產生輸出的查詢路徑會換掉**，所以這些樣本本質上都要重新跑過一次確認逐位元組
  相同，不能只看「有沒有變紅」。
- 涉及購買（`Shop Buy`）與換裝（`Slot_Change_CQ`）的樣本，購買流程改成「已擁有就不重複插入
  `items`，只在 `item_equips` 加一筆」後，`Shop Buy persisted` 這行 log 的語意會變（現在買貴
  重複品会印一筆新的 `items` insert log，之後可能印「改用既有 serial」之類新分支）——這屬於
  log 文字變動，按 AGENTS 規則要當一個獨立變數處理，不要跟拆表一起改。
- `ItemInfo_SN` 的黃金樣本（35-byte record 逐欄位比對）如果之後真的要塞 `IsShare` 位元
  （§3 的阻塞項），會動到 wire record 本身的位元組內容，必須是完全獨立的一步、有自己的組語證據
  才能做，不能跟拆表合併成一個 commit。
