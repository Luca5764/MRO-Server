# 機庫金錢（G 幣／M 幣）持久化分析與設計提案

- 日期：2026-09-18
- 分析者：Antigravity (中階)
- 狀態：🟡 待審（只設計，不實作）

---

## 1. 核心問題分析

### Q1: 客戶端的 G 幣／M 幣顯示，分別由哪個封包的哪個欄位決定？Open_SA 的 +0x06／+0x0A 跟 Packege_Point/Coupon_SN 是不是同一份資料？誰後到誰贏？

- **M 幣（Cash）**：
  - 由 `Open_SA 0x00240102` 的 `body + 0x06`（8 bytes `int64 LE`，低 32 位 `+0x06`、高 32 位 `+0x0A`）決定。
    - 依據：`[DLL]` `ZDispatchHangar::Open_SA 0x107ddbd0`。在 `0x107ddc32` 檢查狀態碼為 0 成功後，於 `0x107ddc48` - `0x107ddc5d` 讀取 `[esi+0x16]` 與 `[esi+0x1a]`，呼叫 `UZNetwork_DJ::Account_GameMoney_Cash_Set(int64)`（`0x107052d1`）。
    - 另在購買現金道具時，`Buy_CashItem_SA 0x00240204` 的 `body + 0x06`（`int64 LE`）亦會呼叫 `Account_GameMoney_Cash_Set`（`0x107debd2`）。
- **G 幣（Point）**：
  - 登入時：由 `RecordInfo_SN 0x00210103` 的 `body + 0x48`（8 bytes `int64 LE`）決定。
    - 依據：`[DLL]` `ZDispatchAccount::RecordInfo_SN 0x107c0fa0`。於 `0x107c1154` - `0x107c116b` 讀取 `[eax+0x58]` / `[eax+0x5c]`（即 body+0x48），呼叫 `UZNetwork_DJ::Account_GameMoney_Point_Set(int64)`（`0x10706e24`）。
  - 機庫開啟／同步時：由 `Packege_Point_SN 0x00240132` 的 `body + 0x04`（8 bytes `int64 LE`）決定。
    - 依據：`[DLL]` `ZDispatchHangar::Packege_Point_SN 0x107dda30`。於 `0x107ddab6` - `0x107ddac5` 讀取 `body+0x04`，呼叫 `Account_GameMoney_Point_Set(int64)`。注意組語 `0x107dda6f` 有 `test esi, esi; jle 0x107ddaca`，若 `body+0x00 <= 0` 則直接跳過金錢更新！
  - 購買道具時：由 `Buy_PointItem_SA 0x00240202` 的 `body + 0x06`（8 bytes `int64 LE`）決定。
    - 依據：`[DLL]` `ZDispatchHangar::Buy_PointItem_SA 0x107dea70`。於 `0x107deadd` - `0x107deaf2` 讀取 `body+0x06`，呼叫 `Account_GameMoney_Point_Set(int64)`。
- **優惠券（Coupon）**：
  - 登入時由 `RecordInfo_SN 0x00210103` 的 `body + 0x14`（8 bytes `int64 LE`，`0x107c1170` - `0x107c1187` 呼叫 `Account_GameMoney_Coupon_Set`）決定。
  - 機庫同步時由 `Packege_Coupon_SN 0x00240133` 的 `body + 0x04`（8 bytes `int64 LE`，`0x107ddb86` - `0x107ddb95` 呼叫 `Account_GameMoney_Coupon_Set`）決定。
- **Open_SA 的 +0x06／+0x0A 跟 Packege_Point/Coupon_SN 是不是同一份資料？誰後到誰贏？**
  - **不是同一份資料！**
    - `Open_SA +0x06/+0x0A` 是 64 位的 **Cash（M 幣）**，寫入 `UZNetwork_DJ.default.m_MyGameMoney.Cash`（`+0x468`）。
    - `Packege_Point_SN +0x04/+0x08` 是 64 位的 **Point（G 幣）**，寫入 `m_MyGameMoney.Point`（`+0x45c`）。
    - `Packege_Coupon_SN +0x04/+0x08` 是 64 位的 **Coupon（優惠券）**，寫入 `m_MyGameMoney.Coupon`（`+0x474`）。
    - 三者分別寫入 `GAME_MONEY_INFO` 的不同欄位（`ZNetwork_DJ.uc:282`），彼此獨立，不會互相覆蓋。
  - **覆蓋規則**：
    若針對**同一幣別**（例如 `RecordInfo_SN` vs `Packege_Point_SN` vs `Buy_PointItem_SA` 對 Point），則為**後到者覆蓋先到者**。
    （這完全解釋了操作者的觀察：登入時 `RecordInfo_SN` 將 Point 設為 1,000；進入機庫時 `Packege_Point_SN` 覆蓋成 100,000；購買後 `0x00240202` 因伺服器送 6 bytes 被客戶端讀到 0 覆蓋成 0；重登後又從 `RecordInfo_SN` 變回 1,000。）

---

### Q2: 購買時扣款發生在哪一端？客戶端是自己本地扣、還是等伺服器回新的餘額？Shop Buy SA 0x00240202 的 body 有沒有帶餘額欄位？

- **扣款完全發生在伺服器端，客戶端不進行本地扣款，而是等伺服器回傳新餘額。**
  - 依據：`[DLL]` `ZDispatchHangar::Buy_PointItem_CQ 0x107e1540`。客戶端送出購買請求時，body 僅有 5 bytes（`1 byte 0x01` + `4 bytes ItemId`，`0x107e15c5` - `0x107e15cc`），完全沒有修改本地金錢。
  - 依據：`[DLL]` `ZDispatchHangar::Buy_PointItem_SA 0x107dea70`。收到購買回應時，組語在 `0x107deacf` 檢查狀態碼 `body[0x00] == 0 && body[0x02] == 0` 後，於 `0x107deadd` - `0x107deaf2` 直接讀取 `body[0x06..0x0D]`（int64 LE）呼叫 `Account_GameMoney_Point_Set`，將本地 G 幣直接指定為伺服器送回來的新餘額！
- **Shop Buy SA 0x00240202 的 body 有帶餘額欄位！**
  - 完整 body 佈局（至少 14 bytes = 0x0E）：
    - `+0x00` (u16): Status Code（0=成功）
    - `+0x02` (u32): Sub Result Code（0=成功）
    - `+0x06` (int64 LE, 8 bytes): **扣款後玩家最新的 Point (G 幣) 餘額**
  - 現行伺服器程式碼（`room.dispatch.js:884`）只回送了 6 bytes（只填了 `+0x00` 與 `+0x02`），導致客戶端讀取 `+0x06` 時讀到了緩衝區尾部的 0，進而將 G 幣設為 0！

---

### Q3: 客戶端買東西前會不會自己檢查餘額？（如果會，伺服器送太小的值會讓玩家買不起；送太大則會出現原廠不可能有的數字）

- **客戶端買東西前不會阻擋購買！**
  - 依據：`[SRC]` `ZPopup_Buy.uc:959-962`。繪製介面時，`strValue = DividThirdString( string( MyPoint - SellPoint + BonusPoint ) )` 僅用來將試算剩餘金額畫在 UI 上（若 `MyPoint < SellPoint`，文字會顯示負數，如 `-100 G`）。
  - 依據：`[SRC]` `ZPopup_Buy.uc:517 OnClick_Buy()` → `ZPage_Hangar.uc:2799 Buy_Check()`。點擊購買只會打開確認彈窗 `"BUY"`（`"선택한 아이템을 구매하시겠습니까?"`）。
  - 依據：`[SRC]` `ZPopup_Buy.uc:576 BUY_YES` → `ZPage_Hangar.uc:2804 Buy_PointItem()`。點擊確定後直接呼叫 `Hangar_Item_Buy`。
  - 依據：`[DLL]` `UZNetwork_DJ::execHangar_Item_Buy 0x1071eb30`。在原生層解析 UnrealScript 參數後，直接呼叫 `Buy_PointItem_CQ` 發送 `0x00240201` 封包，全程無任何餘額檢查阻擋。
- **結論**：餘額是否足夠完全由**伺服器端**裁決。若伺服器判斷餘額不足，應在 `0x00240202` 回傳失敗狀態碼（非 0），終止交易。

---

### Q4: 伺服器要送多大的值才安全？有沒有上限或會溢位的欄位寬度？

- **欄位寬度與上限限制**：
  1. **C++ 通訊層**：
     - `Account_GameMoney_Point_Set`、`Cash_Set`、`Coupon_Set` 皆接收 64 位整數 `__int64`（`%I64d` 轉字串）。封包欄位為 8-byte `int64 LE`。
  2. **UnrealScript UI 層（關鍵瓶頸）**：
     - `ZPopup_Buy.uc:905`: `MyPoint = int( MyGameMoneyInfo.Point );`
     - `ZPage_Hangar.uc:2814`: `m_nOldPoint = int( class'ZNetwork.ZNetwork_DJ'.static.My_GameMoney_Get().Point );`
     - `ZPopup_Mail.uc:622`: `nCurPoint = int( class'ZNetwork.ZNetwork_DJ'.static.My_GameMoney_Get().Point );`
     - UnrealScript 的 `int` 為 **32 位有號整數（signed 32-bit int）**，最大值為 `2,147,483,647`（約 21.4 億）。
     - 若伺服器送出超過 `0x7FFFFFFF` 的值，在 UnrealScript 中轉型 `int(Point)` 會發生有號整數溢位變成負數，導致購買介面運算失常！
  3. **`Packege_Point_SN 0x00240132` 的第 0 個 byte/word**：
     - 組語 `0x107dda6f` 檢查：`mov esi, [eax+0x10]; test esi, esi; jle 0x107ddaca`。
     - 若 `body[0x00] <= 0`，客戶端會提前跳出，**完全不更新 G 幣**！因此 `body[0x00]` 必須為 `> 0` 的數值（例如填 1 或填入該筆金額）。
- **安全數值建議**：
  - 建議範圍：`0 <= Point, Cash, Coupon <= 2,147,483,647`。
  - 實務設定：新帳號預設 G 幣建議為 `100,000`，單一帳號最大金額建議限制在 `999,999,999` 以內，兼具遊戲體驗並防止 UI 排版破版與 32-bit 溢位。

---

## 2. 資料庫設計提案

### accounts 表新增欄位
建議在 `accounts` 表直接新增三個貨幣欄位（因貨幣屬帳號級別資產，與 `pilot`、`account_level` 同級）：
- `point`: `BIGINT NOT NULL DEFAULT 100000`（G 幣，預設 10 萬）
- `cash`: `BIGINT NOT NULL DEFAULT 0`（M 幣，預設 0）
- `coupon`: `BIGINT NOT NULL DEFAULT 0`（優惠券，預設 0）

### DB Migration 腳本草稿（僅供審查，不執行）
```sql
-- Migration: Add money columns to accounts table
ALTER TABLE `accounts`
    ADD COLUMN `point` BIGINT NOT NULL DEFAULT 100000 AFTER `gender`,
    ADD COLUMN `cash` BIGINT NOT NULL DEFAULT 0 AFTER `point`,
    ADD COLUMN `coupon` BIGINT NOT NULL DEFAULT 0 AFTER `cash`;

-- 針對既有已建立之帳號補上預設金錢（若已有帳號）
UPDATE `accounts` SET `point` = 100000 WHERE `point` = 0;
```

---

## 3. 金錢變動與寫回時機

1. **帳號註冊 / 初始化（`db.js createAccount`）**：
   - 插入新帳號時給予預設金錢（point=100000, cash=0, coupon=0）。
2. **登入進入遊戲（`gamelogin.dispatch.js handleGameLogin`）**：
   - 從 `accounts` 讀出 `point`, `cash`, `coupon`。
   - 存入連線物件：`client.point_ = Number(account.point); client.cash_ = Number(account.cash); client.coupon_ = Number(account.coupon);`。
   - 經 `session.restore(client)` 延續於換房/斷線重連。
   - 送出 `RecordInfo_SN 0x00210103`：在 `+0x48` 填入 `client.point_`，在 `+0x14` 填入 `client.coupon_`（修正原本將 `exp_max` 錯填至 `+0x48` 的問題）。
3. **進入機庫（`room.dispatch.js case 0x00240101`）**：
   - 發送 `Open_SA 0x00240102`：在 `+0x06` 寫入 `client.cash_`（int64 LE）。
   - 呼叫 `sendPackageMoney(client)`：
     - `Packege_Point_SN 0x00240132`：`+0x00` 填 1，`+0x04` 填 `client.point_`（int64 LE）。
     - `Packege_Coupon_SN 0x00240133`：`+0x00` 填 1，`+0x04` 填 `client.coupon_`（int64 LE）。
4. **商城購買（`room.dispatch.js handleShopPurchase`）**：
   - 取得商品售價 `price = Number(item.price || item.discount_price || 0)`。
   - 檢查餘額：若 `client.point_ < price`，則拒絕購買（`result = 1`），不新增裝備列。
   - 若餘額足夠：
     - 扣款：`client.point_ -= price;`
     - 寫入 DB：`await db.pool.execute("UPDATE accounts SET point = ? WHERE id = ?", [client.point_, client.accountId_]);`
     - 寫入 `items` 表（維持既有邏輯）。
   - 發送 `Shop Buy SA 0x00240202`（**長度擴充至 14 bytes = 0x0E**）：
     - `+0x00` (u16): 0
     - `+0x02` (u32): result (0=成功)
     - `+0x06` (int64 LE): `BigInt(client.point_)`（扣款後之新餘額）
   - 購買成功後觸發之 `sendPackageMoney(client)` 亦自動帶出扣款後之 `client.point_`。
5. **對戰結算（未來擴充點，`lobby.dispatch.js`）**：
   - 戰鬥結束計算擊殺得點（如 `kills * POINT_PER_KILL`）後，累加至 `client.point_` 並非同步更新 DB `UPDATE accounts SET point = point + ? WHERE id = ?`。

---

## 4. 具體修改檔案與行號清單

### (1) `Metal Rage Online Server/dispatch/gamelogin.dispatch.js`
- **行 90-95**（載入帳號資料處）：
  ```javascript
  client.point_ = Number(account.point) || 100000;
  client.cash_ = Number(account.cash) || 0;
  client.coupon_ = Number(account.coupon) || 0;
  ```
- **行 139-150**（`SN_RECORD_INFO` 組裝處）：
  - 將原本錯填的欄位偏移校正，並寫入真實 G 幣與優惠券：
  ```javascript
  const [msg, respBody] = client.getMessageBuffer(SN_RECORD_INFO, 0x60);
  for (let i = 0; i < 0x60; i += 4) respBody.writeUint32LE(0, i);
  respBody.writeUint32LE(record.level, 0x00);
  respBody.writeBigUint64LE(BigInt(client.coupon_ || 0), 0x14); // 校正：0x14 是 Coupon (int64)
  respBody.writeUint32LE(record.wins, 0x1C);                  // 校正：0x1C 是 Win
  respBody.writeUint32LE(record.draws, 0x20);                 // 校正：0x20 是 Draw
  respBody.writeUint32LE(record.losses, 0x24);                // 校正：0x24 是 Lose
  respBody.writeUint32LE(record.kills, 0x28);                 // 校正：0x28 是 Kill
  respBody.writeUint32LE(record.deaths, 0x2C);                // 校正：0x2C 是 Death
  respBody.writeBigUint64LE(BigInt(record.exp), 0x40);        // 0x40 是 Level Exp
  respBody.writeBigUint64LE(BigInt(client.point_ || 100000), 0x48); // 校正：0x48 是 Point (G 幣)，原為 exp_max
  client.send(msg);
  ```

### (2) `Metal Rage Online Server/dispatch/room.dispatch.js`
- **行 528-535**（`Open_SA 0x00240102` 組裝處）：
  ```javascript
  const [msg, respBody] = getExactMessageBuffer(0x00240102, 0x0E);
  respBody.writeUint16LE(0x0000, 0);
  respBody.writeUint32LE(0x00000000, 0x02);
  const cash = BigInt(client.cash_ || 0);
  respBody.writeBigInt64LE(cash, 0x06); // 寫入真實 Cash (M 幣)
  client.send(msg);
  ```
- **行 845-863**（`handleShopPurchase` 購買檢查與扣款）：
  ```javascript
  const price = Number(item.price || item.discount_price || 0);
  const currentPoint = Number(client.point_ ?? 0);
  if (currentPoint < price) {
      result = 1; // 餘額不足，購買失敗
      console.log(`[ZRoomDispatch] >> Shop Buy failed: insufficient point (has ${currentPoint}, needs ${price})`);
  } else {
      const newPoint = currentPoint - price;
      client.point_ = newPoint;
      await db.pool.execute(
          'UPDATE accounts SET point = ? WHERE id = ?',
          [newPoint, client.accountId_]
      );
      // 原有寫入 items 表邏輯...
  }
  ```
- **行 884-888**（`Shop Buy SA 0x00240202` 組裝處）：
  - 長度由 `0x06` 改為 `0x0E`，帶入新餘額：
  ```javascript
  const [msg, body] = getExactMessageBuffer(0x00240202, 0x0E);
  body.writeUInt16LE(0, 0x00);
  body.writeUInt32LE(result, 0x02);
  body.writeBigInt64LE(BigInt(client.point_ ?? 0), 0x06); // 回傳扣款後新餘額
  client.send(msg);
  ```
- **行 1157-1180**（`sendPackageMoney` 組裝處）：
  ```javascript
  sendPackageMoney(client)
  {
      const point = BigInt(client.point_ ?? 100000);
      const coupon = BigInt(client.coupon_ ?? 0);

      {
          const [msg, body] = getExactMessageBuffer(SN_PACKAGE_POINT, 12);
          body.writeUint32LE(1, 0x00); // 必須 > 0 否則客戶端忽略
          body.writeBigInt64LE(point, 0x04);
          client.send(msg);
      }

      {
          const [msg, body] = getExactMessageBuffer(SN_PACKAGE_COUPON, 12);
          body.writeUint32LE(1, 0x00); // 必須 > 0 否則客戶端忽略
          body.writeBigInt64LE(coupon, 0x04);
          client.send(msg);
      }

      console.log(`[ZRoomDispatch] >> Sent Packege_Point_SN 0x240132: point=${point}`);
      console.log(`[ZRoomDispatch] >> Sent Packege_Coupon_SN 0x240133: coupon=${coupon}`);
  }
  ```

### (3) `Metal Rage Online Server/database/db.js`
- **行 220**（`createAccount`）：
  - 新建帳號時給予預設值：
  ```javascript
  const [result] = await conn.execute(
      'INSERT INTO accounts (username, nickname, pilot, account_level, point, cash, coupon) VALUES (?, ?, ?, 4, 100000, 0, 0)',
      [username, nickname, pilot]
  );
  ```
