# 場景 6 的三個 CN:客戶端在地圖裡送什麼 ✅ 已確認 [DLL]

> 從 docs/opcode-ledger.md 第 1414–1438 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

先前這三個都被當成「未知輪詢」,其中 `0x00230111` 還被 `lobby.dispatch.js` 誤判成 Lobby Enter。
在 `ZNetwork.dll` 掃描 `mov dword ptr [...], <opcode>` 即可定位送出端,三處引用的形狀完全一致
(一個 `[ecx+0xc]` 建構子 + 兩個全域 Format 的 send 站)。

| opcode | 名稱 | 封包長度 | 送出前提 |
|---|---|---|---|
| `0x00230111` | `ZDispatchGame::Timeout_CN` | 0x10(無 body) | scene 6 + `Game_Host_Check()` + **`Game_Play_Check()`** |
| `0x00230151` | `ZDispatchGame::BeginRound_CN` | 0x14(4-byte body) | scene 6 |
| `0x00420117` | `ZDispatchGame::Battle_Success_CN` | 0x10 | scene 6 + `Game_Host_Check()`,參數為 0 的分支 |

對應的 SN 在 dispatch map 裡:`Timeout_SN 0x00230112`、`BeginRound_SN 0x00230152`、`ChangeSlot_SN 0x00230102`。

**這推翻了「回合沒有開始」的假設。** `Timeout_CN` 的送出前提就包含 `Game_Play_Check()` 為真,
所以客戶端進圖後回合其實正常開始了;那 60 秒的靜默是 `TimeLimit=1`(單位:分鐘)的回合計時,
跑完之後客戶端每秒回報一次逾時。問題從頭到尾不是回合,是**玩家沒有 pawn**。

### 方法學
先前把 `0x00230111` 標成「每秒輪詢,含義未知」,是因為只從客戶端的 *dispatcher* 找它——
而 dispatcher 只列 server→client。客戶端自己送的封包要在 **send 站**找,也就是搜尋
把 opcode 寫進 Format 結構的那條 `mov`。這條路徑對任何 CQ/CN 都適用。

---

