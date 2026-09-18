# 第二台主機第一次登入成功（M1 第一個觀察點）

## 過程

1. N0：操作者用系統管理員執行 `tools/win/lan-open.ps1`。[TEST] `netsh interface portproxy show all` 顯示 9211 和 30907 都轉到 WSL `192.168.217.8`。
2. 第一次嘗試：[LOG] `session-20260918-233617.jsonl`：第二台（`dusk`）在 9211 登入成功，但沒有連到 30907。原因是 `Server_Add_SN 0x00220101` 的遊戲伺服器位址寫死 `127.0.0.1`（`account.dispatch.js:740`），第二台連到的是它自己。
3. N1 修正（`f8fc052`）：位址改讀 `config/server.json` 的 `publicHost`，沒有設定時維持 127.0.0.1。本機設定為 `192.168.1.105`，並開啟白名單（`Lucas`、`dusk`）。
4. 第二次：[LOG] `session-20260919-002245.jsonl`，build 事件：`test-server@f8fc052 dirty=true nonDefault=[GAME_INFO_TIME_LIMIT_MODE] whitelist=on(2 users) publicHost=192.168.1.105`。

## Fable 要求的三項檢查

- ✅ [LOG] 第二個帳號：`dusk` 自動建成帳號 #3，之後每次登入都找到 #3。
- ✅ [LOG]（有條件）兩條連線沒有互相干擾：conn2（dusk，16:24:10 登入）271 筆封包的 `ctx.accountId` 全是 3；conn4（Lucas，16:25:09）28 筆全是 1。**這是因為依序登入，「抓最後登入者」剛好猜對。** 換地圖重連時仍然可能認錯人 → 開戰前一定要先做 D1 第 0 步（`journal/2026-09-18-2350-game-login-token-chain.md`）。
- ✅ [LOG] 兩條連線收到的登入封包序列一致，只有 `ItemInfo_SN 0x00210111` 的包數不同（dusk 3 包、Lucas 5 包，因為物品數量不同）。
- [OBS] 第二台進得了商城，這台在大廳。

## 其他

- [LOG] 經過 portproxy 之後，所有連線的來源都是 `192.168.208.1`（Windows 的 vEthernet），分不出是哪台主機。N0 已預告這個限制。認人要靠 token，白名單拒絕紀錄裡的 IP 也沒有參考價值。
- 設定 `publicHost` 之後，這台主機自己也要經過 portproxy 才連得到 30907。執行 `lan-close.ps1` 前，要先刪掉 `config/server.json` 並重啟。
