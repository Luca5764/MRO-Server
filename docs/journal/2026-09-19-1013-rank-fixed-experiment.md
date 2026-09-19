# RANK：User_Score_SN 固定值實驗（中階實作，🟡 未經跨公司審查）

任務見 `docs/backlog.md` RANK 節；分析依據 `docs/research/2026-09-19-rank/notes.md`。
**固定值只用來驗證封包，不是真正的評等公式** ——公式待操作者/PM 裁決。

## 1. 組語核對（`0x107ece60`–`0x107ed15d`，`ZDispatchRoom::User_Score_SN`）

Ghidra 反編譯（`tools/ghidra/decompile.sh 0x107ece60`）直接標出函式名
`ZDispatchRoom::User_Score_SN`，跟 notes.md 一致。逐項核對：

- **(a) 閘門與筆數＝0 是否安全：** 函式開頭 `mov al,[ecx+4]; test al,al; jne 0x107ece99`
  ——`[this+4]` 為 0 時只呼叫兩次 `ZNetworkManager::Log_Set/Log_Write`（`1`,
  `"ZDispatchRoom::User_Score_SN"`）後直接 `ret 8`，完全不碰封包內容；為非 0
  才進入主體。逐人筆數在 `body+0x24`（`packet+0x34`，`movzx eax,[esi+0x34]`）；
  `test eax,eax; jle 0x107ed156` 直接跳到 `pop×4; ret 8` 的 epilogue，**筆數 0
  時整個 `do-while` 迴圈完全不執行**，不會越界讀。Ghidra 反編譯同一段確認：
  `if (bVar1 != 0) { ... } return;`。
- **(b) 最小安全 body 長度：** 因為筆數 0 時只讀到 `body+0x24`（含），最小安全
  長度是 **0x25（37）bytes**。
- **(c) 兩次 Game_Score_Set：** 確認，Ghidra 直接標出兩次
  `UZNetwork_DJ::Game_Score_Set(...)` 呼叫（第二次後還多一次
  `UZNetwork_DJ::Game_Score_Update()`），字串常數都是
  `"ZDispatchRoom::User_Score_SN"`（`0x10838cac`／`0x10838d90`）。

欄位偏移（對照 `dispatch/lobby.dispatch.js` 既有 EndGame_SN／EndRound_SN 的
14-byte team block 註解，同一格式）：

```
+0x00 u16 WinTeamIndex
+0x02 u16 WinTeamRank        (1=F .. 11=SS)
+0x04 u32 WinTeamScore
```
三者由 `UZNetwork_DJ::Game_Result_Set(WinTeamIndex, WinTeamScore, WinTeamRank)`
消費（`0x107ecfdb`–`0x107ecff6`，esi+0x10/0x12/0x14 = header 0x10 + body 偏移），
即 `ZPage_PveResult.uc:113-165` 讀的 `GameInfo.WinTeamRank`。

```
+0x08 Team A Game_Score_Set 區塊（14 bytes：TeamIndex u16、Score u16、Round
      u8、Alive u8、Try u16、Goal u16、Exp u32）
+0x16 Team B 區塊，同格式
+0x24 u8 逐人筆數
```
（`0x107ecea0`–`0x107ecec9` 讀第一區塊、`0x107ecf35`–`0x107ecf5d` 讀第二區塊，
header 0x10 + packet 偏移 0x18/0x26 = body 0x08/0x16，皆核對過。）

**與 notes.md 不同的一點（更正，待審）：** notes.md 猜逐人記錄 stride 是
`0x4B`；實際上迴圈是先 `param_2 += 0x4B` 再以 `param_2 - 0x16 .. param_2 + 0x1F`
讀第一筆欄位，之後每筆用 `param_2 += 0x3A`（58 bytes）遞增——`0x4B` 只是第一筆
的起始位移，不是逐筆 stride。因為本實驗筆數固定送 0，這個更正不影響實作，
留給下一位需要送逐人資料時參考。

## 2. 設定與傳送實作

- `config/server.js`：新增 `pveFixedRank`（整數 1–11，預設不存在＝
  `getPveFixedRank()` 回 `undefined`），讀法與 `pveExtraLives` 同一套快取
  邏輯；`packetlog.js` 的 `recordBuild` 加一欄。
- `dispatch/lobby.dispatch.js`：`Campaign_CN 0x00230139` 的成功分支
  （`action===1`），在送 `EndGame_SN` **之前**，若 `pveFixedRank` 有設定，用
  既有的 `getExactMessageBuffer`（不走 16-byte 補齊，理由同 EndRound_SN 的
  註解）送 `User_Score_SN 0x00222221`，body 0x25 bytes：WinTeamIndex=0、
  WinTeamRank=設定值、WinTeamScore=0、兩區塊只填 TeamIndex（0／1）其餘 0、
  筆數 0。失敗分支（`action===2`）完全不碰，維持原樣。
- `config/server.example.json` 加一行範例；`test/replay-golden.js` 的假
  `config/server.js` 補 `getPveFixedRank()`（回 `undefined`，維持既有樣本不變）。

## 3. 測試輸出

`node test/replay-golden.js`：4 個樣本全綠（`pve-full-match` 8383 packets
PASS），逐位元組跟未改動前一致（沒設定 `pveFixedRank` 時行為不變）。

新增 `node test/fixed-rank.js`（3 案例）：
```
[fixed-rank] PASS: pveFixedRank=10 + success -> User_Score_SN 0x00222221 sent before EndGame_SN, body byte-exact
[fixed-rank] PASS: pveFixedRank unconfigured -> User_Score_SN never sent (unchanged behaviour)
[fixed-rank] PASS: pveFixedRank configured but Campaign_CN failure -> User_Score_SN not sent
[fixed-rank] ALL CASES PASS
```

其餘既有單元測試（`console-commands`、`exception-guard`、`extra-lives`、
`login-token`、`map-list-single`、`room-chat`、`room-join`、`rooms`、
`round-advance`、`whitelist`）逐一 `node test/<name>.js` 全部 exit=0。

## 4. 實測步驟（尚未執行，留給高階安排）

1. 在 `config/server.json` 加 `"pveFixedRank": 10`。
2. **完整重啟**伺服器（不是 `/reload`——跟 `pveExtraLives` 一樣，這個值只在
   啟動時讀一次快取，見 `config/server.js`）。
3. 開一場初級房，打通關（5 回合）。
4. 結算頁應顯示 **S**（`WinTeamRank=10` → `ZPage_PveResult.uc` 的
   `m_Rank.Score = 10-1 = 9`，對照註解 `F=1..SS=11` 換算，第 10 級對應 S；
   實際顯示字樣待操作者截圖確認）。
5. 確認畫面沒有卡住／斷線，`User_Score_SN` 送出後 `EndGame_SN` 仍正常送達。

未做：實機驗證（需要高階安排、完整重啟）；逐人記錄格式（本次全送筆數 0，
未解碼）；真正評等公式（待操作者/PM 裁決）。
