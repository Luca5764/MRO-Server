# SOL-REVIEW-2：D1-6 battle-start broadcast

1. **通過 — 四開關關閉／開啟後的一人房相容性** — 四個新開關均預設 `disabled`（`gate.game.dispatch.js:175,211`、`rooms.js:146,163`），關閉時落回原 send path。開啟的一人房中，Wait／Ready／Start／BeginRound 的 builder 相同；Game_User 的 target/source 都是同一 client（`gate.game.dispatch.js:432-454`）；Ready split 因 `members.size > 1` 不成立而仍只走既有 Success（`community.dispatch.js:143-178`）；hostAddress gate 也略過一人房（`gate.game.dispatch.js:1374-1389`）。Game_Info 在既有 `GAME_INFO_TIME_LIMIT_MODE='disabled'` 下欄位相同（`:605-643`）。各 commit 記錄的 replay 結果是 `login-dispatch`／`login-room-game` PASS；另兩個 golden 的既有 timestamp 差異不是本批變更。注意：新測試只驗包數／欄位，沒有直接做「四開關全開的一人房」完整 byte-stream 比對。

2. **需修改 — Game_User_SN 的逐人來源、數量與 scene-6 順序** — count 固定 1、body 487 bytes、frame 503 bytes，低於 0x400（`dispatch/room/room-game-user.sender.js:138-144`）；每 target × 每 source 且 DB account 使用 source.accountId（`gate.game.dispatch.js:432-454`），基本資料來源正確。但它排在 Wait 後 60 ms（`:1470-1479`），Info 到 150 ms 才送（`:1482-1488`），不符合「該 target 先收 Wait/Info」；而每個 `sendGameUserBootstrap()` 都未 await，DB 完成順序、與 150 ms Info 的先後都無保證。應把每個 target 的 N 包序列 await 完，並置於該 target 的 Info 之後。

3. **需修改 — Ready_Host_SN body／port／CA gating／frame** — 正常 8-byte CA 確實讀 body+0x06 u16 LE（`community.dispatch.js:147-165`；DLL `0x107d9195-0x107d91a4`），且只在房主 CA 到達後通知非房主。SN 以 +0 port、+2 zero、+3 ANSI `IP/Map\0` 組包（`gate.game.dispatch.js:326-360`；DLL `0x107d575d`、`0x107d57b8`），15-char hostAddress 下最大 frame 遠低於 0x400。問題是短 CA 被當成功並回退 30907（`community.dispatch.js:147-148`），違反「port 來自 +0x06」；且 result 非 0 時仍在 `:178` 對房主送 Ready_Success。應要求 `body.length >= 8`，失敗／畸形 CA 不向任何人送 Success。

4. **通過 — 非房主 Ready_Host_SN 後立即 Ready_Success_SN** — `Ready_Host_SN` 先呼叫 `Game_Host_Set`（DLL `0x107d57e4-0x107d57f7`），`GIsClient != 0` 且 `[this+9]` 為真時清旗標並在 handler 返回前呼叫 `Game_Host_Connect`（`0x107d57fc-0x107d582d`）。下一包 `Ready_Success_SN` 才檢查／清 `[this+8]` 並送出 `NETWORK_GAME_START` event（`0x107d5880-0x107d58fe`）。同一 TCP stream 依序處理時，`0x00420115` 緊接 `0x00420116` 符合客戶端狀態機，不需要非房主另送 CA。

5. **需修改 — BeginRound_SN 應每回合全房廣播一次** — `Game_Play_Start` 的 script wrapper 在 DLL `0x1071b6d1` 呼叫 `BeginRound_CN` sender `0x107d94b0`；UC 呼叫點是權威 GameInfo 的 `StartMatch`（`~/mro-decrypted/src/ZBase/DefaultGameInfo.uc:380-386`）與 PvE `EndRound_BD`（`~/mro-decrypted/src/ZModePve/ZModePve.uc:717-722`），因此應由 listen host 觸發、全房廣播一次。現 handler 對任何成員每收到一個 CN 都廣播（`lobby.dispatch.js:186-218`），沒有 host 驗證／每回合去重，會容許重複 `Game_Play_Start`（SN handler `0x107d5ad0-0x107d5b37`）。應只接受當前 room host，並以 round/generation 防重。

6. **通過 — 10c7809 的 username_、token login、whitelist** — 新增賦值只在 token lookup／fallback 已解析出 account 後執行（`gamelogin.dispatch.js:102-145`），不改 token key、拒絕條件或查詢路徑；值直接取該 account.username。Whitelist 舊 string entry 仍以 lowercase key 建 Map，`isAllowed()` 仍是同一 `.has(lowercase)` 語意（`config/whitelist.js:61-87,112-117`）；object entry 只是附加 hostAddress。

7. **需修改 — 成員中途離開的 timer／async race** — Wait 之後的 60/150/300/450/600 ms callbacks 捕捉 room/client（`gate.game.dispatch.js:1470-1537`）。`rooms.sendAll()` 每次重查 registry，對已移除成員大致安全（`rooms.js:368-375`）；但 Game_User 在 `:434` snapshot members 後跨 DB await，離線 target/source 仍可能被送包或被列入 player table（sender `:127-130,227`）。房主於 450 ms 前離開時，SQ 會投給新 host，但整條序列沒有 generation/cancel，且 start 狀態只設在舊觸發 client。應為 start 建 generation，callback／DB 完成時重驗 room、membership、live client 與 host 身分。

## Must fix before live test

- 將 Game_User 移到每個 target 的 Wait＋Info 之後，並 await 固定順序。
- CA 必須恰當驗證長度/result；不得用 30907 補短包，也不得在 Listen failure 後送 host Success。
- BeginRound 只接受房主並做到每回合全房一次；加 battle-start generation／離房取消與 async 重驗。
- 開戰狀態目前只設觸發者（`gate.game.dispatch.js:1448-1450`）；須同步設所有仍在房內的 live member，否則加入者的 `gameStarted_`／`campaignStarted_` 仍為 false，後續 `0x00230111` 會被當 lobby enter（`lobby.dispatch.js:122-129`）。

## 新疑點

- `battleStats_` 也只在送 `BeginRound_CN` 的連線清空（`lobby.dispatch.js:188-193`）；若 Death/EndGame 延後實作，需確認應改成逐成員或 room-level reset。
- `hostAddress` 目前只限制長度、不驗證 IPv4 字面值（`config/whitelist.js:71-81`）；設定錯字會原樣進 `IP/Map`。

## 高階處理（Claude，2026-09-19）

- 採納：3（CA 驗證）、5（BeginRound 只收房主、每回合一次）、7（開戰 generation／中途離開重驗）、must-fix 最後一項（全員設開戰狀態）、新疑點 2（hostAddress 驗證 IPv4）。已交給原 worker 修。
- 部分採納 2：Game_User 逐 target 依序 await、送前重驗成員；**不**移到 Game_Info 之後——單人路徑一直是 Wait 後 60 ms 送 Game_User、Info 在 150 ms，實測能用，而且要維持單人逐位元組不變。scene 6 由 Wait 切換，Info 不是前提（🟡，若雙機實測有人缺玩家資料再回頭處理）。
- 1 的注意事項：原 worker 說另兩個 golden「既有失敗」，實際是 worktree 的 MetalRage 連結壞掉；修好後 4 個樣本全過。
- 新疑點 1（battleStats_ 只在送 CN 的連線清空）留給 D1-6 step 3（Death/EndGame 廣播）一起處理。
