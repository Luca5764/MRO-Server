# 0x00230111／0x00230112 身分衝突調查（中階 explorer，待審）

> 任務：解掉「`lobby.dispatch.js` 把 `0x00230111` 當 Lobby Enter CQ」與「DLL/Moon 說是 `Timeout_CN`」的衝突，供 D2 TDM 用。
> 本檔只回報證據，不下 ✅／❌ 結論（中階權限）。

## 開場更正：這個「矛盾」在 `docs/state.md` 其實已經標 ✅ 了

任務描述引用 `docs/state.md:68-69,190-192` 說「矛盾、⬜ 未解」，但實際讀取這幾行（2026-09-22 現況）：

- `docs/state.md:69`：`C→S 0x00230111 Timeout_CN：場景 6、host、遊戲進行中才送...` **✅ [DLL]**
- `docs/state.md:192`：`lobby.dispatch.js case 0x00230111 ... Timeout_CN，只在場景 6 送出。✅ [DLL] | 大廳時的分支可能永遠不會觸發 ⬜`

身分本身（0x00230111=Timeout_CN／0x00230112=Timeout_SN）已經是 ✅，依據是 `docs/journal/2026-09-16-18-scene-6-three-cn-messages.md` 和 `docs/journal/2026-09-17-02-ledger-contradictions-adjudicated.md`（2.2 條）。**真正還開著的只有一個 ⬜**：「lobby.dispatch.js 那個大廳分支會不會被真的觸發」。這份調查主要是在補這個 ⬜（見第 3、5 題），並且用今天自己重新反組譯的結果核對了一次舊結論（完全對得上，見第 1、4 題）。

---

## Q1：客戶端 dispatcher 對 0x00230111 / 0x00230112 的 handler

用 `tools/dispatch-map.py 0x1070139d`（`ZDispatchGame::Dispatch`，thunk → `0x107dbc50`）：

```
ZDispatchGame::Timeout_SN          0x00230112
```

也對其餘 13 個 dispatcher（`--list` 列出的全部）各跑一次，**0x00230111 沒有出現在任何一個 dispatcher 的映射表裡**——這是預期的，因為 `ZDispatchXxx::Dispatch` 只處理「客戶端收到、要分派」的訊息（S→C），而 0x00230111 是客戶端自己送出的 CN。

另外用匯出表＋`tools/disasm.py`（不靠 dispatch-map，直接看組語，已依規則核對）：

| opcode | 匯出符號 | 匯出位址（thunk） | 真正函式體 |
|---|---|---|---|
| `0x00230112` | `?Timeout_SN@ZDispatchGame@@QAEXPAUFormat@System@Share@@PAD@Z` | `0x107040cf`（`jmp 0x107d7820`） | `0x107d7820` |
| `0x00230111` | `?Timeout_CN@ZDispatchGame@@QAEXXZ`（無參數，對應「空 body」）| `0x1070812f`（`jmp 0x107db0c0`）| `0x107db0c0` |

`Timeout_CN` 函式體（`0x107db0c0`）組語核對過：先做兩個布林檢查（`test al, al` 在 `[ecx+4]`，接著呼叫 `0x10707630`＝`?Game_Host_Check@UZNetwork_DJ` 和 `0x10703832`＝`?Game_Play_Check@UZNetwork_DJ`，兩者都是匯出符號直接核對到名字，不是猜的），三個條件都過才會走到：`rep stosd` 清 0x400 bytes buffer → `mov dword ptr [buf+0xC], 0x230111`（opcode 欄）→ `mov word ptr [buf+6], 0x10`（長度欄，= 16，無 body）→ 呼叫送出函式 `0x10701582`。這跟 `journal/2026-09-16-18-scene-6-three-cn-messages.md` 描述的「scene 6 + Game_Host_Check + Game_Play_Check、0x10（無 body）」完全一致，屬於今天獨立重跑後的**二次確認**，不是新結論。

## Q2：我方 `lobby.dispatch.js` 對 0x00230111 的處理與其依據

程式碼位置：`dispatch/lobby.dispatch.js:137-155`（`getExactMessageBuffer` 這類 helper 在同檔 62-68 行）。

```js
// 行 137-138
// Trying 0x00230111 based on the CQ/SA pattern (X111/X112)
case 0x00230111:
{
    // 行 139-147：client.gameStarted_ 為 true 時直接 return false（交給 fallback），
    // 註解已自承這是因為每秒一次的 in-map 輪詢誤回會造成噪音迴圈
    if (client.gameStarted_) {
        console.log(`[ZLobbyDispatch] >> 0x230111 while in game — not treating as Lobby Enter`);
        return false;
    }
    console.log(`[ZLobbyDispatch] >> Lobby Enter CQ (guessed)`);
    {
        const [msg, respBody] = client.getMessageBuffer(0x00230112, 0x6);
        respBody.writeUint16LE(0x0000, 0); // EventMessage = OK
        respBody.writeUint32LE(0x0000, 2); // ErrorMessage = OK
        client.send(msg);
    }
    this.sendEmptyRoomList(client);
    return true;
}
```

**依據**：程式碼自己的註解寫明是**猜的**（`// Trying 0x00230111 based on the CQ/SA pattern (X111/X112)`，也就是「奇數＝CQ、偶數＝SN 相鄰」的命名規律類推），**不是實測，也不是反組譯**。`docs/journal/2026-09-16-17-stuck-at-briefing-waiting-spawn.md:14,23` 記錄了這個猜測後來被發現在地圖裡造成「誤回 Lobby Enter SA + 空房間清單」的噪音迴圈（連續 380+ 秒每秒一對），才加上了 `gameStarted_` 這道保護閘。`docs/journal/2026-09-16-18-scene-6-three-cn-messages.md` 才是後來用反組譯確認真身是 `Timeout_CN` 的那篇。所以現在的程式碼是「先猜、猜錯被抓包、加保護閘、事後才確認真身，但沒改掉『Lobby Enter』這個名字」的狀態——這點 `docs/state.md:192` 本身也已經寫清楚。

## Q3：既有 session log 裡的實際封包紀錄（本題最重要）

在 `Metal Rage Online Server/logs/`（205 份 session）grep `"op":"0x00230111"` 且 `"dir":"recv"`：

- **12,472 筆**符合，橫跨至少 15 份 session（含 `session-20260915-*` 到 `session-20260921-070017.jsonl`，最新一筆時間戳 2026-09-22T11:38）。
- 全部 body 長度 `len:0`（空 body，跟 DLL 端「0x10、無 body」一致，扣掉 16 bytes 頭剩 0）。
- **12,472 筆裡，ctx.gameStarted 全部是 `true`，沒有一筆是 `false`。** 例：

  ```
  session-20260920-152820.jsonl:
  {"t":"2026-09-20T09:41:10.658Z","op":"0x00230111","len":0,
   "ctx":{"accountId":1,"nickname":"Lucas","roomIndex":0,"roomType":2,
          "mapId":5,"gameMode":0,"gameStarted":true,"campaignStarted":true,...},
   "route":"dispatch"}
  {"t":"2026-09-20T09:41:10.659Z","ev":"unhandled","conn":10,"server":"GameServer",
   "op":"0x00230111","len":0,"hex":""}
  ```

  即：每一筆 0x00230111 recv 後面緊跟一筆 `ev:"unhandled"`，代表它命中了 `lobby.dispatch.js` 的 `if (client.gameStarted_) return false`，被 fallback 接住只記 log、**不回應、不 `session.save`**（`server.js:110-131`：`handled` 為 false 才會走到 `unhandled` 分支，這條路徑沒有任何寫入）。

- 反向確認 `0x00230112`（server→client 送出，我方 `gamelogin.dispatch.js` 的 `SA_LOBBY_ENTER` 常數與 `room.dispatch.js` 的 `sendLobbyBootstrapAfterRoomLeave`）：`"dir":"send"` 有 1077 筆，body 固定 16 bytes 全 0（`respBody` 沒寫任何非零欄位，跟程式碼一致），這是我方主動送出的「假 Lobby Enter SA」，跟 Q3 談的「客戶端送來的 Timeout_CN」是不同方向、不同東西，`docs/state.md:191` 已經記過這個誤送。

**結論性觀察（有 LOG 證據，非猜測）**：在現有全部 205 份 session log 裡，`lobby.dispatch.js` 那個被猜成「Lobby Enter CQ」的分支（`gameStarted_ === false` 時才會進入）**從未被真正的 0x00230111 封包觸發過**——因為客戶端只在遊戲中（`Game_Play_Check()` 為真）才送這個 opcode，而這時 `gameStarted_` 已經是 true，直接被閘門擋掉丟給 fallback。這把 `docs/state.md:192` 那條「大廳時的分支可能永遠不會觸發 ⬜」往「目前所有記錄到的情況下確實沒觸發過」推進了一步，但**沒有窮盡所有情境**（例如換圖瞬間 `gameStarted_` 還沒更新、host migration 等邊界情況，log 裡沒有明確反例，但也沒有專門測過）。

## Q4：Timeout_SN（0x00230112）的 0x26 body，DLL 端解析

真正函式體在 `0x107d7820`（見 Q1）。組語核對如下（今天自己反組譯，非引用 Moon）：

- 進入後先做一個布林檢查（`[ecx+4]` 不為 0 才繼續，否則走記 log 的失敗分支，log 字串是寬字元 `"Failed - Active"`）。
- 讀到的指標（記為 `fmt`，即匯出簽章裡的 `Format*` 參數）有一段守門：`word [fmt+0x10] == 0` **且** `dword [fmt+0x12] == 0` 兩者都成立才會往下讀分數記錄，否則整段跳過（不更新任何東西）——這跟 `client.getMessageBuffer` 那套「body+0 u16 EventMessage、body+2 u32 ErrorMessage 都要 0 才算成功」的既有慣例（見 `lobby.dispatch.js` 自己送 0x00230112 時寫的那兩個欄位）完全對得上，只要假設 `fmt` 指向的是完整訊息緩衝（含 0x10 bytes 頭），即 `fmt+0x10` = body+0x00、`fmt+0x12` = body+0x02。
- 之後讀了兩組共 7 個欄位的「record」，兩組固定間隔 0x0E（14）bytes：
  - Record A：`fmt+0x1a`(word) `fmt+0x1c`(word) `fmt+0x1e`(byte) `fmt+0x1f`(byte) `fmt+0x20`(word) `fmt+0x22`(word) `fmt+0x24`(dword) — 合計 14 bytes。
  - Record B：同樣排列往後平移 0x0E：`fmt+0x28` `fmt+0x2a` `fmt+0x2c` `fmt+0x2d` `fmt+0x2e` `fmt+0x30` `fmt+0x32`(dword，讀到 `fmt+0x36` 結束）。
  - 每組讀完都呼叫同一個 log 函式，格式字串（DLL 內寬字元字串，位址 `0x1082e200`／`0x1082e2b8`，兩處字串內容逐位元組核對過完全相同）是：
    ```
    Team : %d, Score : %d, Round : %d, Alive : %d, Try : %d, Goal : %d, Exp : %d
    ```
    共 7 個 `%d`，跟讀到的 7 個欄位數目對上。

**換算成 body-relative offset（減掉 0x10 bytes 頭）**：Record A 從 `body+0x0A` 開始，Record B 從 `body+0x18` 開始，Record B 最後一個欄位（dword）讀到 `body+0x26` 結束——**跟 Moon 說的「0x26 body、records at +0x0A / +0x18」逐位元組對上，包括 body 總長度剛好等於 0x26**。這不是巧合式的湊數：guard 欄位（body+0x00 word、body+0x02 dword）、record 間距（0x0E）、body 結尾位置（0x26）三個獨立算出來的數字全部吻合，算是用 DLL 把 Moon 這條 🟡 往上頂了一截，但我仍標 🟡，理由見下段。

**沒有把握、需要更多確認的部分**：7 個欄位裡「哪個 byte offset 對應 `Team`／`Score`／`Round`／`Alive`／`Try`／`Goal`／`Exp` 哪一個名字」，我用純組語手動追 `push`／`mov [esp+N]` 的暫存器搬移，中間牽涉到同一個 `eax`／`ecx` 被覆寫多次、`printf` 風格的 varargs 壓堆疊順序，手動追到後段時無法排除算錯一步的風險（沒有 decompiler 的 SSA 輸出可以核對）。**這部分沒有把握，需要 Ghidra 反編譯或更仔細的 trace 才能釘死**，不要直接拿去當作封包欄位表使用。只有「7 個欄位、各自的 byte size、record 起點與間距、body 總長」是我有信心的部分。

## Q5：如果 0x00230111 真的是 Timeout_CN，現行「當 Lobby Enter 處理」有什麼後果

依 Q1–Q3 的證據：

- Timeout_CN 只在 `scene 6 + Game_Host_Check() + Game_Play_Check()` 都成立時才會被客戶端送出——也就是**正在打的一場遊戲、而且是房主**。
- `lobby.dispatch.js` 的「Lobby Enter CQ」分支只在 `client.gameStarted_ === false` 時才會進入。
- 在現有 12,472 筆 0x00230111 recv 紀錄裡，`gameStarted` 沒有一筆是 false（見 Q3），所以**目前看得到的所有 session 裡，這個誤判分支從未被真正的封包命中過**；命中的全部是 fallback，只記 log、不回應、無副作用。

**换句話說**：目前的證據顯示這個身分誤判本身沒有造成過實際的行為錯誤（因為兩個條件恰好互斥），但這是「巧合互斥」不是「設計上互斥」——`gameStarted_` 是我方自己維護的旗標，不是客戶端狀態的直接鏡射，如果它曾經（或未來）在客戶端已經在遊戲中、但伺服器還沒把 `gameStarted_` 設成 true 的短暫窗口收到 0x00230111，就會真的把它當 Lobby Enter 回應（送 `0x00230112` + 空房間清單），這在 D2 TDM「靠 Timeout_CN/SN 判時間到誰贏」的用途上，等於**吃掉一次本該送到 fallback／未來 Timeout_SN handler 的封包，且回了一個客戶端在遊戲中收到會被無視的假 Lobby Enter SN**（因為 `ZDispatchGame::Dispatch` 才認得 0x00230112＝Timeout_SN，遊戲中收到帶著空房間清單語意內容的 0x230112，會被當成不完整/全零的 Timeout_SN 處理，兩個 guard 欄位剛好是 0，可能通過 guard 但後面兩組 record 全部讀到我方沒填的隨機/超界記憶體）——**這條沒有 log 佐證，是根據 Q4 結構推出來的可能後果，屬於未驗證的推論，不要當結論用**。

## 小結（給主力）

1. 身分本身（0x00230111=Timeout_CN、0x00230112=Timeout_SN）在 `docs/state.md` 已經是 ✅，不是開著的矛盾；今天用 `tools/dispatch-map.py` + `tools/disasm.py` 對匯出符號、guard 函式（`Game_Host_Check`/`Game_Play_Check`）、送出邏輯重新核對過一次，跟既有 journal 完全吻合，沒發現矛盾。
2. 真正還開著的是 `docs/state.md:192` 那個「lobby 分支會不會被觸發」的 ⬜。這次補上了 LOG 證據：**205 份 session、12,472 筆 recv，全部 `gameStarted:true`，分支從未被命中**——但這是「目前沒觀察到」，不是「不可能發生」，`gameStarted_` 跟客戶端實際場景狀態之間的同步時機沒有專門測過。
3. Timeout_SN 的 0x26 body、雙 record（各 14 bytes，起點 +0x0A / +0x18）、7 個欄位的存在與大小，這次用原始組語核對過，跟 Moon 的說法完全對上；但**field-level 的名稱對應（哪個 offset 是 Team/Score/…）沒有把握**，建議下一步用 Ghidra 對 `0x107d7820` 出 pseudocode 再核一次，比手動追暫存器可靠。
4. 建議：如果 D2 TDM 真的要用 Timeout_SN 判斷輸贏，直接做一版乾淨的新 handler／常數（`TIMEOUT_CN = 0x00230111`／`TIMEOUT_SN = 0x00230112`），不要沿用 `lobby.dispatch.js` 現有那個 case——這樣可以順便拿掉 `gameStarted_` 這個易混淆的保護閘，讓兩個身分不再共用同一段程式碼。這是建議，不是本次任務要做的修改。
