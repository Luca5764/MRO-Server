# 比賽中的隊伍計分板是哪一包在更新（T2.5 前置調查）

調查者：explorer（中階），2026-09-23。高階存檔並覆核結論分級。
**全篇未經跨公司審查。** 下面標 ✅ 的只有「這條指令在做這件事」等級的機械事實；
「這就是畫面讀的那個欄位」**沒有證實**，維持 🟡。

## 0. 先講一個已證實、而且直接解釋症狀的發現

2026-09-22 那場 2 人 PvP（`logs/session-20260922-222051.jsonl`）：

- **我方伺服器全程沒有送過 `Game_Score_SN 0x00222114`（0 筆）。**
- 唯四的 `0x00230112` 出現在 ms 107602／107656／173885／174071，**都在進大廳階段**，
  `ctx` 沒有 `roomIndex`／`gameStarted`，body 是 16 bytes 全 0，對應
  `dispatch/gamelogin.dispatch.js:33` 的 `SA_LOBBY_ENTER` 與 `dispatch/lobby.dispatch.js:155`。
  **同一個 opcode 數字在不同場景被複用成不同訊息**——又一個 AGENTS.md 已知陷阱的實例。

✅ [LOG] 所以「隊伍總分卡在 `000`」**不是欄位填錯，是這條路徑我們根本沒送過**。

## 1. 兩個候選其實是同一條管線的兩個入口

```
Timeout_SN    0x00230112 真身 0x107d7820 ─┐
Game_Score_SN 0x00222114 真身 0x107d5130 ─┤
                                          ├→ Game_Score_Set 0x1072d0e0
                                          │  Game_Score_Add 0x1072cec0
                                          │    （寫進以 (team_id, round) 為 key 的統計陣列）
                                          └→ Game_Score_Update 0x1072d1b0
```

`Game_Score_Update`（`0x1072d1b0`）做的事：

```
Game_Score_Get(this, *(this+0xff0))  -> iVar1   // team A
Game_Score_Get(this, *(this+0xff4))  -> iVar2   // team B
(**(*(int*)(0x108e550c + 0x14c) + 0xc4))(iVar1, iVar2)
```

🟡 這是全部 29 個 `ZDispatchGame` handler 裡**唯一一處**「兩個 team-keyed int → UI callback」的形狀，
最像隊伍計分板的寫入點。**但 `vtable+0xc4` 的目標類別沒解出來**——`0x108e550c` 有一百多處 xref。
**這是本次最大的缺口**，也是「它就是畫面讀的那個」只能標 🟡 的原因。

## 2. `Timeout_SN 0x00230112` body 欄位表

body 起點＝frame+0x10。逐行手動核對 `tools/disasm.py at 0x107d7820 220`，
**沒有採信 Ghidra 的 decompile**（它的參數個數與匯出簽章對不上，還漏掉 `word@[esi+0x20]`／
`word@[esi+0x22]` 兩欄——正是 AGENTS.md 警告的那種錯位）。

| body offset | 寬度 | 語意 | 狀態 |
|---|---|---|---|
| `0x00` | u16 LE | **必須為 0**，否則整段 Score_Set 跳過 | ✅ [DLL] `0x107d7884`／`0x107d7889` |
| `0x02` | u32 LE | **必須為 0**，同上 | ✅ [DLL] `0x107d788f`／`0x107d7894` |
| `0x06`–`0x09` | 4 B | 這個 handler 沒讀 | ⬜ |
| `0x0a` | u16 LE | Block A 的 id key（team_id 候選） | 🟡 [DLL] `0x107d78b1` `movzx edi,[esi+0x1a]`，最後一個 push → Add 的 param_3 |
| `0x0c` | u16 LE | **Block A 的分數欄**，一般模式下 `Game_Score_Get` 回傳的就是它 | 🟡 較高 [DLL] `0x107d78a7` `movzx ebx,[esi+0x1c]`，追蹤最乾淨的一欄 |
| `0x0e` | u8 | Block A 第三統計欄 | ⬜ 對到 record[3..7] 哪一個追不動（中間兩次 Log_Set／Log_Write 把堆疊弄亂） |
| `0x0f` | u8 | 第四統計欄 | ⬜ |
| `0x10` | u16 LE | 第五統計欄 | ⬜ |
| `0x12` | u16 LE | 第六統計欄（mode 2/3 時 `Game_Score_Get` 改讀的 record[6] 候選） | ⬜ |
| `0x14` | u32 LE | 第七統計欄 | ⬜ |
| `0x18` | u16 LE | **Block B（第二隊）id key**，鏡射 `0x0a`，block size＝`0xE` | 🟡 較高 [DLL] `0x107d794a` 讀 `[esi+0x32]` |
| `0x1a` | u16 LE | **Block B 分數欄**，鏡射 `0x0c` | 🟡 較高 |
| `0x1c`–`0x25` | — | Block B 其餘統計欄，鏡射 `0x0e`–`0x17` | ⬜ |

body 最小長度 `0x26`（38 bytes）；frame 至少 `0x36`（54 bytes，未含 16-byte 補齊）。

⚠️ **客戶端拒收整包超過 `0x400` bytes 的 frame**，這包遠低於上限，沒問題。

`Game_Score_SN 0x00222114`（真身 `0x107d5130`）**欄位表沒做**——Ghidra 在這個函式上連
`unaff_retaddr` 這種堆疊分析失敗標記都出來了，比 `Timeout_SN` 更不可信。只確認了呼叫結構：
4 次 `Game_Score_Add`（前兩次 level=1，後兩次在 `quater>1` 時才跑、level=2）、一次
`Game_Score_Update`，外加一段 stride `0x13` 的逐人戰績列表。資訊量比 `Timeout_SN` 大很多。

## 3. 加入者端安不安全

對兩個 handler 都做了**全函式**掃描，找 `call 0x1071a560`（`Game_Host_Check` 真身）與
`call 0x10707630`（thunk）——**兩者都沒有出現**。兩個 handler 都是透過
`UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass)` 拿 class default object，
**不是 per-Level 實例指標**，沒看到 `Level->`／`GameInfo->` 這類在加入者端容易是 null 的解參考。

⚠️ 這是「**沒找到閘門**」的消極證據，**不等於**「證實加入者端安全」。沒有做過實際送包測試。
與 §5 那一整套（`Death_SN` 等四包）不同，那幾包有實跑佐證。

## 4. 排除與未排除

| 候選 | 結果 |
|---|---|
| `Game_User_SN`（`0x1070920a`）、`Team_Change_All_SN`（`0x107d8170`） | 各往後掃約 400 條指令，**沒有**呼叫 Score_Add／Set／Update。非窮盡掃描，但目前無證據 |
| `EndRound_SN`／`EndQuater_SN`／`EndGame_SN`（`0x107d7a50`／`0x107d7c90`／`0x107d7ed0`） | **沒有排除，反而可疑**——它們跟 `Timeout_SN` 緊挨著排在同一段連續程式碼，掃描窗口裡確實出現 Score_Set／Update 呼叫，但函式之間沒有間隔、固定指令數的視窗溢出到下一個函式，**無法可靠歸屬**。要用 function-boundary-aware 的方式重查（`tools/ghidra/decompile.sh` 逐一對三個位址下手，讓 Ghidra 自己找邊界，不要用 `disasm.py at` 的固定指令數） |

## 5. 位址索引（全部是核對過的真身，非 thunk）

| 名稱 | 真身 | thunk |
|---|---|---|
| `Timeout_SN` handler | `0x107d7820` | — |
| `Game_Score_SN` handler | `0x107d5130` | — |
| `Game_Score_Set` | `0x1072d0e0` | `0x10706e56` |
| `Game_Score_Add` | `0x1072cec0` | `0x1070657d` |
| `Game_Score_Get` | `0x1072d120` | — |
| `Game_Score_Update` | `0x1072d1b0` | `0x1070544d` |
| `Game_Host_Check` | `0x1071a560` | `0x10707630` |

## 6. 下一步（由高階排序，見設計稿 §7.3）

1. **動態驗證**最快定案：送一包填了已知數值的 `Timeout_SN`，截圖看隊伍總分是否變成那個值。
   一次同時驗證「是哪一包」「是不是畫面讀的那個欄位」「加入者收了會不會崩」三件事。
2. 解出 `*(0x108e550c + 0x14c)` 指向的類別（找 RTTI 字串，或找誰寫入 `+0x14c`），
   確認 `vtable+0xc4` 真的在畫面更新路徑上，而不是只是統計快取。
3. `*(UZNetwork_DJ+0xff0)`／`+0xff4`（`Game_Score_Update` 查表用的兩個 team id）是誰、何時設定。
   **加入者端這兩個值若與房主不一致，送對包也會拿到錯的隊伍分。**
4. 若動態驗證顯示要送的是 `Game_Score_SN`，它的欄位表要從頭逐指令核對。
