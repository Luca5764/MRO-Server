# Death_CN (C→S) attacker／victim 欄位定位（待審，中階 verifier）

任務：T2（`docs/design/d2-pvp-tdm.md`）開工前提「`Death_CN` 的 attacker 欄位 offset 要先 ✅ [DLL]」。
本篇是機械核對，**不標 ✅**，結論一律 🟡，交高階覆核後升級。

## 0. 先更正任務背景裡的一個前提

派工描述說「同 opcode `0x00230124` 兩個方向都用：C→S 是客戶端回報擊殺，S→C（`Death_SN`）是伺服器廣播」。
**這點跟這次查到的證據不符**：C→S 與 S→C 其實是**兩個不同的 opcode**，不是同一個 opcode 雙向：

- `0x00230123` = `Death_CN`（C→S，客戶端回報擊殺）
- `0x00230124` = `Death_SN`（S→C，伺服器廣播）

依據：
- [DLL] `0x107d879f`：`ZDispatchGame::Death_CN` 的封包模板把 `dword ptr [buf+0xc] = 0x230123`；同一函式 `0x107d87a9` 把 `word ptr [buf+6] = 0x1b`（長度）。
- [LOG] `logs/session-20260922-222051.jsonl:404`：`"dir":"recv","op":"0x00230123"`（host→server，30907）。
- [LOG] `logs/session-20260922-222051.jsonl:405-406`：同一毫秒 `"dir":"send","op":"0x00230124"`（server→兩條連線廣播）。
- 這跟既有 `docs/state.md` 第 64-65 行、`docs/journal/2026-09-17-13-death-assist-cn.md`、`docs/design/d2-pvp-tdm.md:56/58` 的既有記法一致（都已把兩者列成不同 opcode），只有這次派工的任務描述本身把兩者混成同一個 opcode。這篇底下全部針對 **`0x00230123`（Death_CN，C→S）**。

## 1. 從程式碼走到組包函式的路徑

`Death_CN` 是**客戶端組包送出**的封包，不會出現在（S→C）dispatch 表裡（`AGENTS.md`／`docs/state.md` 第 1 節已有此陷阱提示）。實際路徑：

1. 遊戲邏輯判定死亡事件後，直接呼叫 `ZDispatchGame::Death_CN`（Ghidra 標的內部名 `FUN_107d98a0` @ `0x107d98a0`）。這個函式名字雖然叫 "Death_CN"，但它是**組包＋送出**，不是收包 handler。
2. 該函式先做三道檢查：`Game_Host_Check`（只有房主送）、`Game_Play_Check`（要在戰鬥中）、`Game_User_Check`（依 DeathType 決定要驗證哪個 UserIndex——見下方欄位表的驗證邏輯）。
3. 通過檢查後跳到 `LAB_107d99f5`：呼叫 `call 0x107060be`（thunk）→ `0x107d8790`，回傳一個 0x400-byte 的封包模板指標（`eax`／`esi`），已預填 `opcode=0x230123`、`length=0x1b`（27 bytes）。
4. 依序把 6 個參數寫進這個模板固定 offset（見第 2 節），呼叫 `ZNetworkManager::Send` 送出。

實際反組譯（本次獨立跑 `tools/disasm.py at 0x107d98a0 260`／`tools/disasm.py at 0x107d8790 60` 重新確認，不是只讀舊研究檔）：

```
0x107d99f6  call     0x107060be          ; thunk -> 0x107d8790，回傳 Format* 於 eax
0x107d99fb  mov      ecx, [esp+0x20]     ; param_5（KillWeaponIndex，u32）
0x107d99ff  mov      dl,  [esp+0x24]     ; param_6（KillWeaponType，u8）
0x107d9a03  mov      esi, eax            ; esi = Format*（= 封包緩衝區起點）
0x107d9a05  mov      word ptr [esi+0x12], bx   ; bx  = param_2（被殺者 DeathUserIndex）
0x107d9a12  mov      byte ptr [esi+0x15], al   ; al  = (param_7 != 0)（CriticalHit）
0x107d9a1b  mov      word ptr [esi+0x10], di   ; di  = param_4（擊殺者 KillUserIndex）
0x107d9a1f  mov      dword ptr [esi+0x17], ecx ; KillWeaponIndex
0x107d9a22  mov      byte ptr [esi+0x16], dl   ; KillWeaponType
...switch(param_3)...
0x107d9a32.. mov      byte ptr [esi+0x14], <mapped death-type>
```

`0x107d8790` 本體（封包模板）：
```
0x107d8790  push edi
0x107d8791  xor  eax, eax
0x107d8793  mov  ecx, 0x100
0x107d8798  mov  edi, 0x10902d80
0x107d879d  rep stosd                    ; 整塊 0x400 bytes 先清零
0x107d879f  mov  dword ptr [0x10902d8c], 0x230123   ; buf+0x0c = opcode
0x107d87a9  mov  word  ptr [0x10902d86], 0x1b        ; buf+0x06 = length(0x1b=27)
0x107d87b2  mov  eax, 0x10902d80                      ; 回傳 buf 起點
```

`buf+0x0c` 是 opcode（4 bytes），`0x0c+4=0x10`，跟 `Death_SN` 分析（`Death_SN_asm.txt` 開頭：「esi points to Format* (packet start). Body begins at esi + 0x10.」）一致：**body 從 buf+0x10 開始**。所以 `[esi+0x12]`／`[esi+0x10]` 等偏移，換成 body 偏移是**再減 0x10**。

## 2. 欄位表（body，11 bytes；總 frame = 16-byte header + 11-byte body = 0x1b）

| body offset | 寬度 | 位元組序 | 欄位名 | 狀態 | 依據 |
|---|---|---|---|---|---|
| `+0x00` | u16 | LE | **attacker / KillUserIndex**（擊殺者） | 🟡（待高階升 ✅） | [DLL] `0x107d9a1b`：`mov word ptr [esi+0x10], di`，`di`＝呼叫時的 `param_4`；[LOG] 見第 3 節逐 byte 對照 |
| `+0x02` | u16 | LE | **victim / DeathUserIndex**（被殺者） | 🟡 | [DLL] `0x107d9a05`：`mov word ptr [esi+0x12], bx`，`bx`＝`param_2`；[LOG] 見第 3 節 |
| `+0x04` | u8 | — | DeathType（wire 值，經 `switch(param_3)` 映射，如原始 1→1、7→0x15、10→0x1f…） | 🟡 | [DLL] `0x107d9a32`起的 switch／`0x107d9ad4`（default→0xb）；[LOG] 多筆對得上（見第 3 節與 4 節） |
| `+0x05` | u8 (bool) | — | CriticalHit（0/1） | 🟡 | [DLL] `0x107d9a0d-0x107d9a12`：`test ebx,ebx; setne al; mov [esi+0x15],al` |
| `+0x06` | u8 | — | KillWeaponType（`param_6`） | 🟡 offset 確定，語意⬜未測 | [DLL] `0x107d9a22`：`mov byte ptr [esi+0x16], dl` |
| `+0x07..0x0a` | u32 | LE | KillWeaponIndex（`param_5`） | 🟡 offset 確定，語意⬜未測 | [DLL] `0x107d9a1f`：`mov dword ptr [esi+0x17], ecx` |

驗證邏輯（決定哪個 UserIndex 要先過 `Game_User_Check`，反過來印證誰是「被殺者」誰是「擊殺者」）：
- `param_3`（DeathType，即上表 body+0x04 映射前的原始值）`< 5` 時，一定驗證 `param_2`（→ body+0x02，被殺者）；`param_3 == 1` 時**額外**驗證 `param_4`（→ body+0x00，擊殺者）。
- `param_3 >= 5` 時，只驗證 `param_4`（→ body+0x00，擊殺者）。
- 對照 `Game_Action_Death`（`0x1072e120`，收包端，`docs/research/2026-09-17-backlog/G2/Game_Action_Death_asm.txt`）的參數順序 `(DeathUserIndex, DeathType, KillUserIndex, KillWeaponIndex, KillWeaponType, CriticalHit)`——`FUN_107d98a0` 的 `param_2/3/4/5/6/7` 跟這組一一對應（`param_2`=DeathUserIndex=被殺者、`param_3`=DeathType、`param_4`=KillUserIndex=擊殺者、`param_5`=KillWeaponIndex、`param_6`=KillWeaponType、`param_7`=CriticalHit）。這點是**既有研究檔的推論**（`docs/research/2026-09-17-fire-gate/Death_CN.c`），本次用獨立反組譯核對了實際寫入 `[esi+0x10]`／`[esi+0x12]` 的組語，方向一致，但「param_2/param_4 跟 Game_Action_Death 呼叫慣例同序」這件事本身沒有再往上追函式指標或呼叫端逐一核對，仍算 🟡。

## 3. 逐 byte 對照：`session-20260922-222051.jsonl:404`（已知 attacker=5／victim=6）

```
line 404: {"dir":"recv","op":"0x00230123","len":11,"hex":"05000600010000850c8201", conn=2, port=30907}
```

Body hex 拆分（11 bytes）：

| byte idx | hex | 對應欄位（依第 2 節表） | 解出值 |
|---|---|---|---|
| 0x00-0x01 | `05 00` | attacker u16 LE | **5** |
| 0x02-0x03 | `06 00` | victim u16 LE | **6** |
| 0x04 | `01` | DeathType（映射值） | 1 |
| 0x05 | `00` | CriticalHit | 0（非爆擊） |
| 0x06 | `00` | KillWeaponType | 0 |
| 0x07-0x0a | `85 0c 82 01` | KillWeaponIndex u32 LE | 0x01820c85 |

**對上了。** 解出 attacker=5、victim=6，跟任務背景給的已知答案完全一致，逐 byte 沒有落差。時間、連線（conn=2，30907，房主）都跟同一毫秒送出的 `Death_SN`（line 405-406）對得上。

**更正（自查）：這不是這個 session 裡唯一一筆 `0x00230123`。** `logs/session-20260922-222051.jsonl` 整份共有 3 筆 `recv 0x00230123`（line 404、469、493），line 404 是時間最早的一筆，對應任務背景說的「PvP 首輪」。另外兩筆沒有背景給的獨立已知答案，僅供參考、不能當成第二個「已驗證」樣本：

| line | hex | attacker | victim | type |
|---|---|---|---|---|
| 404 | `05000600010000850c8201` | 5 | 6 | 1 |
| 469 | `06000500010000c54e9101` | 6 | 5 | 1 |
| 493 | `0000050003000000000000` | 0 | 5 | 3 |

line 469（攻守互換：6 殺 5）跟 line 493（attacker=0、type=3，型態上像先前 journal 記錄的「環境／AI 死亡」）都跟「body+0=擊殺者、body+2=被殺者」的方向一致，但因為沒有操作者或 PM 給的獨立已知答案可比對，只能算跟第 4 節一樣的「自我一致」佐證，不是獨立驗證。

## 4. 另外兩組獨立樣本（同一次 verifier 任務內查證，非既有研究檔的重複引用）

- `logs/session-20260919-200917.jsonl`（PvE，單機打 campaign，`accountId=1` "Lucas"）：
  - `hex":"0300000015000000000000"`（103 次）／`"0100000015000000000000"`（320 次）：attacker=3 或 1（Lucas 的 UserIndex，隨場次不同）、**victim=0**（打死的是 AI，AI 的 DeathUserIndex 慣例為 0）、type=0x15。
  - `hex":"0000030002000000000000"`（24 次）／`"0000010002000000000000"`（19 次）：**attacker=0**（AI）、victim=3 或 1（Lucas 被 AI 殺）、type=0x02。
  - 這組樣本本身沒有「已知答案」可比對（沒有第三方紀錄告訴我們當時誰殺了誰），但兩種模式（打 AI 時 victim 固定是 0；被 AI 打時 attacker 固定是 0）跟「body+0=擊殺者、body+2=被殺者」這個方向一致，且跟 `docs/journal/2026-09-17-13-death-assist-cn.md` 舊測試（"01000000 0b..."＝我殺 AI、"00000100 03..."＝AI 殺我）的模式同構，只是資料集不同、次數多很多（本次共 466 筆同構樣本）。**只能算加強信心，不能算獨立於「body+0=擊殺者」這個假設的驗證**——因為沒有除封包外的第三方真相可比對，邏輯上仍是同一個假設在自我一致，不是新證據來源。

## 5. 沒解出來的欄位

- `+0x06`（KillWeaponType）／`+0x07..0x0a`（KillWeaponIndex）：**offset／寬度已由 DLL 組語確認**（第 2 節），但**語意沒有跟實際武器 ID 對照過**。`docs/journal/2026-09-17-13-death-assist-cn.md` 對同構的 `Assist_CN` 欄位也留了同樣的 ⬜。下一步：挑幾筆武器明確不同的擊殺（例如近戰 vs 遠程），比對 `+0x07` 的值是否隨武器種類固定，需要新的 marker 化 session，不能只查舊 log。
- `+0x04` DeathType 映射表：`switch(param_3)` 的**輸入值**（1..0x1a 的哪些子集）沒有全部從遊戲行為對出中文語意（哪個是墜落死、哪個是載具自爆等），只有 1~4＝玩家死亡、其餘＝AI／環境死亡這條粗分類（既有研究已定）。這不影響 attacker/victim 的 offset 結論，但如果 T2 要用 DeathType 做例外處理（例如排除環境死亡不計分），要另外查。

## 6. 給 T2 的結論（僅供高階參考，不是核准）

- **attacker = body+0x00（u16 LE），victim = body+0x02（u16 LE）**，兩者都有 [DLL]（本次獨立反組譯，非僅引用舊檔）＋[LOG]（含一筆已知答案的逐 byte 對照、外加 466 筆同構樣本）雙重依據，可以支撐 T2 開工，但**升級成 ✅ 要由高階做（AGENTS.md 權限表，我是中階不可標 ✅）**。
- 高階覆核時建議順便核對：`param_2`/`param_4` 跟 `Game_Action_Death` 呼叫慣例同序這條（本篇第 2 節末段標注的推論）——我沒有往上追到呼叫 `FUN_107d98a0` 的地方逐一核對兩邊參數列是否真的同序，只是兩份獨立分析（`Death_CN.c` 與這次的 disasm）在效果上一致。

## 附：驗證環境

- `tools/disasm.py at 0x107d98a0 260`、`tools/disasm.py at 0x107d8790 60`、`tools/disasm.py at 0x107060be 40`（本次執行，於 `Metal Rage Online Server/` 下）。
- `Metal Rage Online Server/logs/session-20260922-222051.jsonl`（line 404-406）、`logs/session-20260919-200917.jsonl`（`0x00230123` 共 945 筆，grep 統計於本篇）。
- 未啟動客戶端、未 attach debugger、未改任何程式檔。
