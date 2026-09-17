# PvE 戰鬥中的 Death_CN／Assist_CN（2026-09-17）

decompile：`docs/research/2026-09-17-fire-gate/Death_CN.c`、`Death_Assist_CN.c`。

## Death_CN `0x00230123`

- ✅ [DLL] `ZDispatchGame::Death_CN`（thunk `0x10701ae1` → `0x107d98a0`），封包由 `0x107d8790` 建立（opcode `0x230123`，長度 0x1b）。只有 host 且 `Game_Play_Check` 為真時才送。
- ✅ [DLL] 組語 `0x107d99f5`–`0x107d9a1f`：body+0 u16 = di（第 3 個參數）、body+2 u16 = bx（第 1 個參數）、body+4 = 類型、body+5 = bool、body+6 u8、body+7 u32。
- ✅ [DLL] `0x107d9935`–`0x107d9955`：類型參數 `< 5` 時，對**第 1 個參數**（body+2）做 `Game_User_Check`；否則檢查第 3 個參數（body+0）。所以 **body+0 = 擊殺者、body+2 = 被擊殺者**；body+4 類型 1～4 = 玩家被擊殺，其他（預設 `0x0b`、`0x0c`、`0x15`…）= 被擊殺的是 AI／物件，此時 body+2 不是玩家。
- [LOG] 測試 N：`01000000 0b...`（我擊殺 AI）、`00000100 03...`（AI 擊殺我，victim=1）。
- 伺服器原本對**每一筆** Death_CN 都在 5 秒後送 `Respawn_SN`（AI 被殺時 userIndex=0），而且每筆都會讓 `respawnGeneration_` 加一，可能取消掉玩家自己正在倒數的重生。

## Assist_CN `0x00230121`

- ✅ [DLL] `ZDispatchGame::Assist_CN`（thunk `0x107060eb` → `0x107d9c60`），封包由 `0x107d87d0` 建立（opcode `0x230121`，長度 0x17）。同樣只有 host 且 IsPlay 時送。body+0 u16、body+2 u16、body+4 類型（對照表與 Death_CN 相同）、body+5 = (參數==1 ? 1 : 2)、body+6 u8。
- [LOG] 測試 N：`0000 0100 04 01 xx`，xx 依序 0x50→0x14→0x00，降到 0 之後出現我的 Death_CN。🟡 推測是「誰對誰造成傷害」與剩餘 HP％之類的數值；body+0／+2 的語意還沒從組語核對。
- 伺服器目前回 16 bytes 空的 `Assist_SN 0x00230122`，**這次不改**（一次一個變數）。

## 改動（單一變數：只對玩家死亡排程重生）

- `dispatch/lobby.dispatch.js` Death_CN handler：類型不在 1～4 時，只送 `Death_SN`，**不排程 `Respawn_SN`**，也不改 `respawnGeneration_`。
- 伺服器 19:29 重啟（`session-20260917-192903.jsonl`）。待測：`docs/next-test.md` 測試 O。
