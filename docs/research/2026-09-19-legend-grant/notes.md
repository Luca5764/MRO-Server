# 傳說機發放（LEGEND-GRANT-A，explorer 中階，🟡）

- 原型 → 傳說對照（機種 1–8）：
  - 11100101 → 11200101 RAVEN
  - 12100101 → 12200101 CRUAL MASSACRE
  - 13100101 → 13200101 VALKYRIE
  - 14200101 → 14300101 PHANTOM
  - 15200101 → 15300101 ZODIAC
  - 16200101 → 16300101 ROXANNE
  - 17100101 → 17200101 FENRIS
  - 18100101 → 18200101 SPECTOR

  傳說機是獨立的機體 item（HighGroup=1，MiddleGroup 跟原型相同），每台另有專屬塗裝鎖定它。
- 加成：UC 的 `e_MechSection==MS_Season_01`（`Pawn.uc:350,353`、`HangarMech.uc:79`，各武器檔會依它改數值）。只要穿上就生效，伺服器不用送額外欄位。
- IsLicense：是**槽位**的解鎖旗標，不是傳說機專屬（`ZPage_Hangar.uc:1544-1552`：購買限時傳說機前要先擁有該機種）。我們建帳號時已經給了 8 筆 mech_licenses，所以這一關應該已經過了（🟡）。
- 機庫裡原型機上的「傳說圖示」畫在哪裡，沒找到 ⬜，要靠實測確認。
- 缺口：`account.dispatch.js:52-60`、`gamelogin.dispatch.js:63-72` 登入時 WearInfo 的 `BODY_IDX` 只有 8 台原型加上 PHANTOM；其他 7 台傳說機查不到時會退回原始 item_id，圖示可能顯示錯。`room.dispatch.js` 用的是完整的 `CACHE_INDEX_BY_ITEM_ID`。
- 最小方案：
  1. 對帳號 4 的 items 插入 8 筆傳說機體（equipped=0）；
  2. 登入時的 WearInfo 改用完整 Cache 索引；
  3. 實測：機庫看不看得到、能不能換上（Slot_Change body 部位送的是 serial，E1 已經支援）、出場有沒有加成。
