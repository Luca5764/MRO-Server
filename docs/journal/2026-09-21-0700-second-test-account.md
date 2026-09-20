# 第二個測試帳號 `mrotesthost`（2026-09-21 07:00，高階執行）

同機雙開自動化需要兩個測試帳號：副本實例當房主、主安裝當加入者，兩邊要各自登入。
既有的只有 `mrotest` 一個。操作者 2026-09-20 晚同意建第二個（條件：腳本、冪等、先 dump），
PM 2026-09-21 轉達同意 `--apply`。

## 為什麼要寫成腳本而不是直接下 SQL

`AGENTS.md`：資料庫變更要寫成 commit 進去的腳本，不直接下 SQL。
腳本 `tools/create-second-test-account.js`（`flash-wip-testaccount` → `f477ee2` 合併）。

## 為什麼白名單那一筆一定要有 `hostAddress`

`HOST_ADDRESS_REQUIRE`（`config/whitelist.js`）會擋掉「房內有非房主成員、但房主沒有
`hostAddress`」的開戰。新帳號要**當房主**，所以缺這個欄位會在開戰那一步才炸。

**值不寫死**：腳本在執行期沿用 `mrotest` 那一筆的 `hostAddress`。
原因是這個值換過——`2026-09-20-1530-m3r-vpn-rehearsal.md` 那次把整份白名單換成了 VPN 位址，
設計稿裡抄的舊 LAN 值已經過時（已更正）。動態沿用就不會再發生這種事。

## 執行紀錄

兩份備份（PM 要求兩個路徑都留下）：
- 資料庫：`~/mro-backups/mro-before-testaccount2-20260921-065754.sql`（66632 bytes，腳本自己 dump，
  dump 失敗或輸出為空就中止，不會繼續）
- 白名單：`~/mro-backups/allowed-users.json.bak-20260921-065754`（高階手動備份）

結果：account **id=6**、username／nickname 都是 `mrotesthost`、pilot 101。

DB 核對（改後查）：mech levels **8**、licenses **8**、items **30**、item_equips **30**、
Point **100000**（預設）、Cash **0**。

**冪等驗收**：`--apply` 之後再跑一次 dry-run，輸出變成
「`"mrotesthost" already exists (id=6) -- nothing to create`」＋
「`entry already present with matching hostAddress and isTest=true -- nothing to change`」。

## 重啟

改 `config/` 不能 `/reload`，要完整重啟。重啟前 `/conns` **沒有任何輸出**——
`listConnections()`（`server.js:313`）是每條連線印一行、零連線就完全不印，所以空輸出＝沒人在線。

重啟後的 build 事件（[LOG] `logs/session-20260921-070017.jsonl`）：

```
build: test-server@26be66c dirty=true nonDefault=[MATCH_STATS_MODE, roomPlayingStateMode]
       whitelist=on(5 users) publicHost=<遮蔽> pveExtraLives=7 pveFixedRank=10
```

`whitelist=on(5 users)`，改前是 4（備份檔核對過），**剛好多 1**。
兩個 listener 都起來了：9211 與 30907 都在 `0.0.0.0`。

## 還沒做

這個帳號**還沒有實際登入過遊戲**。第一次登入要等雙開劇本的動作實作完，
而且照 `reference/unattended-policy.md`，沒實跑過的新動作第一次要操作者在場。
