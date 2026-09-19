# 留門檢查 (a) SQL 參數化、(c) Linux VPS 可攜性（explorer 中階，🟡）

## (a) SQL
- `dispatch/` 和 `database/db.js` 的查詢全部參數化，包括商店購買時直接來自封包的 `itemId`。`IN (...)` 的寫法只用 `.map(()=>'?')` 產生佔位符，是安全的。
- 字串拼接的只有兩個離線工具：`tools/add-account-money.js:59`（ALTER TABLE 欄位名稱來自寫死的常數）、`tools/renumber-item-serials.js:143`（AUTO_INCREMENT 常數）。兩者都不讀 argv，客戶端碰不到。之後有空再改。
- 結論：沒有找到客戶端可以觸發的 SQL 注入路徑。

## (c) VPS
- 已經可以直接用：
  - `server.js:65` listen 0.0.0.0；
  - Cache.Bin 搜尋全用 path/fs，只要 VPS 上放一份 Cache.Bin；
  - DB、publicHost、hostAddress 都走設定檔。
- 要決定的：`publicHost` 和 `hostAddress` 目前限制 15 字元的 IPv4 字面值，理由是 SN_SERVER_ADD 欄位 16 bytes；這只是程式註解，還沒用 DLL 核對。要用網域名稱連線的話，得先查欄位大小。用 VPN IP 就不用改。
- 只能在開發環境用：`tools/win/*`、`tools/ghidra/decompile.sh` 寫死 /mnt/c 路徑，VPS 上不需要。
- 備註：戰鬥是 P2P，VPS 只負責登入、大廳、房間。每個房主的 `hostAddress` 要填他的 VPN IP，而且要開 UDP 30907。
