# 遊戲伺服器登入的身分鏈：Gate Leave_SA 發 8 bytes，Login_Again_CQ 原樣帶回

## 問題

S1 盤點發現，`gamelogin.dispatch.js` 在 30907 登入時用 `SELECT * FROM accounts ORDER BY last_login DESC LIMIT 1` 抓帳號。兩個人同時在線，或換地圖重連時，會被指派成別人的帳號。這是多人化的最大阻礙。

## I1 子 agent 的結果（中階），以及高階的更正

- ✅ [LOG] 30907 的第一個封包一律是 `0x00110124`＝`ZDispatchAccount::Login_Again_CQ`（[DLL] thunk `0x10708adf` → 本體 `0x107c3e70`），8 bytes。76 份 log 裡 body **全是 0**，換地圖重連（例如 `session-20260917-131036.jsonl`，9 次）送的也是同一個 CQ。
- ✅ [DLL] body+0／+4 來自 singleton `0x108e23e8` 的 +0x311c／+0x3120（`0x107c3ef5`、`0x107c3f00`），也就是絕對位址 `0x108e5504`／`0x108e5508`。
- ❌ I1 說「DLL 裡沒有任何地方寫入這兩個欄位」：**錯**。它只搜了 disp32 偏移 0x311c／0x3120，漏掉用絕對位址存取的寫法。

## 高階補查：寫入點與來源

- [DLL] `0x10715f70`＝`Certify_Away_Set(uint, uint)`（匯出 thunk `0x10703404`）：
  - `mov byte [ecx+0x369], 4`：認證類型設為 `CERTIFY_AWAY`（`ZNetwork_DJ.uc:44-51` 的 enum 第 4 項）。
  - `mov [0x108e5504], eax`；`mov [0x108e5508], ecx`：把兩個參數存起來。
- [DLL] 唯一的呼叫點 `0x107dc846`，在 `ZDispatchGate::Leave_SA` 的本體（log 字串 `0x1082fd84`）裡，本體從 `0x107dc7d3` 開始：
  - `cmp word [esi+0x10], 0`（body+0x00 status）；`[esi+0x12]`（body+0x02 result）要等於 0。
  - 成功時讀 `[esi+0x16]`＝**body+0x06 u32** 和 `[esi+0x1a]`＝**body+0x0A u32**，傳給 `Certify_Away_Set`。
- [LOG] 目前伺服器回的 Gate `Leave_SA 0x00220132` 是 16 bytes 全 0（`session-20260918-225741.jsonl`），所以客戶端帶回來的 8 bytes 也全是 0。

## 結論

✅ [DLL] **身分鏈存在**：9211 Gate `Leave_SA 0x00220132` 的 body+0x06、+0x0A 各 4 bytes → 客戶端存進 away-certify → 連到 30907 時放進 `Login_Again_CQ 0x00110124` 的 body+0／+4 原樣帶回。換地圖重連送的是同一個 CQ，所以會繼續帶著同一組值（🟡 未實測，用存的值推論）。

伺服器只要在 Gate Leave_SA 放「accountId＋每次登入隨機產生的 key」，30907 就能準確認出是誰，不需要靠 IP 配對，也不需要 last_login。

- `0xDEADBEEF`（Gate `Enter_SA 0x00220112` +0x06）跟這條鏈無關：它不會被帶回。
- 這項改動會讓 `login-dispatch` 樣本的 `0x00220132` 輸出改變，要在 commit 裡註明原因後重錄基準。
- 實作排進 D1 的第一步。
