# Verify: Moon 目標類模式筆記— 五項具體宣稱核對

Verifier（中階）核對，唯讀，2026-09-21。來源：`protocol_objective.en.md`（外部資料，全部先🟡）。
方法：`tools/disasm.py`、`tools/dispatch-map.py`、`tools/ghidra/decompile.sh`（ZNetwork.dll，ImageBase 0x10700000）。

---

## 1. Opcode 表與 SN body 長度 — 成立

**宣稱**：跳表在 `0x107dbf48`；8 組 CN/SN opcode 與 body 長度如文中表格。

**依據**：
- 直接反組譯 `ZDispatchGame::Dispatch` 找到 `sub edx, 0x230132 / cmp edx, 0xc / ja 0x107dbefe /
  jmp dword ptr [edx*4 + 0x107dbf48]`（`0x107dbdcf`–`0x107dbdf0`），確認跳表位址與索引範圍
  （`0x230132`..`0x23013e`，13 格）完全吻合。
- 用 pefile 直接讀出跳表 13 個指標，逐一 xref 到最終 handler，對照文中 8 個 SN handler 位址：
  `0x230126→0x107d6300`、`0x230132→0x107d6490`、`0x230134→0x107d6ab0`、`0x230136→0x107d67a0`、
  `0x230138→0x107d6d90`、`0x23013a→0x107d7040`、`0x23013c→0x107d7290`、`0x23013e→0x107d7540` —
  **全部逐位址核對，完全相符**（Special 的 `je 0x107dbdbe`→`0x107d6300` 亦核對，走的是表外的獨立分支，
  與文中描述一致）。
- Body 長度：用 ghidra 反編譯 Capture/Conquest/Bomb/Boss 四個 handler，逐一核對每個欄位的
  offset（record A/B 起點、mission 欄位 offset），結果與文中列出的 offset **逐位元組吻合**，且
  「body 長度 = 最後一個欄位 offset + 該欄位大小」在全部 8 組都精確對上（例：Capture mission
  `+0x33/+0x37`→ `param_2+0x43/+0x47`，兩個 `*(int*)` 讀取，結尾 `0x37+4=0x3B`，與宣稱的 SN body
  `0x3B` 相符；Boss 無 mission 欄位，record B 在 `+0x1B`，`0x1B+0xE=0x29`，與宣稱的 `0x29` 相符）。

無反例，五個位址系列（跳表位址、8 個 handler 位址、body 長度公式）全部核對通過。

---

## 2. 14-byte 記錄的 team 欄 — 不成立（關鍵，見下）

**宣稱**：`ClientRedIndex=1 / ClientBlueIndex=2`。

**判定**：這兩個數字**確實存在**於 DLL 裡（`UZNetwork_DJ::execTutorial_Open`，
`0x10706d7a→0x107301f0`，內有 `mov ebx,1` 之後 `mov [esi+0xff0],ebx`（RedIndex=1）與
`mov dword ptr [esi+0xff4], 2`（BlueIndex=2，立即數）），但**這是單機教學模式（Tutorial）專用的初始化
路徑，不是連線對戰的路徑**。把這兩個值當成「所有場次都要送 1/2」是誤用了不同的 code path。

**客戶端拿 team 欄去跟誰比（完整鏈路，全部直接反組譯核對）：**

1. `Game_Score_Update`（`0x1072d1b0`）呼叫 `Game_Score_Get(this, *(this+0xff0))` 取 RedScore，
   `Game_Score_Get(this, *(this+0xff4))` 取 BlueScore——查表 key 就是 `+0xff0`／`+0xff4`
   這兩個「Client Red/Blue Index」欄位。
2. `Game_Score_Get`（`0x1072d120`）在陣列裡找 `record[0]==傳入的key`，這個 `record[0]` 就是
   Objective SN 14-byte 記錄裡直接搬過去、**未經任何轉換**的 team 欄位（在 Bomb/Capture/Conquest
   handler 反編譯中逐一核對：`Game_Score_Set` 第一個參數 = wire body 記錄的 team 欄，原封不動傳入）。
3. **`+0xff0`／`+0xff4` 不是常數**：反組譯確認唯一一處在連線路徑會寫入它們的地方是
   `Game_Play_Start`（`0x10734050`）：
   ```
   eax = *(esi+0xffc)   ; Server Red
   edi = *(esi+0x1000)  ; Server Blue
   esi[0xff0] = eax     ; Client Red  = Server Red
   esi[0xff4] = edi     ; Client Blue = Server Blue
   ```
   而 `+0xffc`／`+0x1000`（Server Red/Blue）又是 `Game_Info_Team_Set`（`0x1071a420`）直接從
   **`Game_Info_SN` 封包 body+0x04／+0x06**（`RedTeamIndex`／`BlueTeamIndex`）寫入的——
   反組譯直接看到 `ZDispatchWaiting::Game_Info_SN`（`0x107f0910`）讀 `esi=body+0x04`、
   `edi=body+0x06`，緊接著呼叫 `Game_Info_Team_Set(this, esi, edi)`，然後立刻呼叫
   `Game_Play_Start` 把這兩個值複製進 `+0xff0`／`+0xff4`。

**結論：** 客戶端拿 team 欄去比的對象，是**我們自己在 `Game_Info_SN` 送的 RedTeamIndex/BlueTeamIndex**
（body+0x04/+0x06），不是任何寫死的常數。1/2 只在教學模式的預設值裡出現，對連線對戰不適用。

**我們現有程式碼已經獨立記載了同一條鏈路**（`dispatch/gate.game.dispatch.js:493-497,618-619,639-649`）：
> "Must match one of the two values Game_Info_SN puts in [0xffc] and [0x1000], which Game_Play_Start
> copies to [0xff0] and [0xff4]. We send red=0 there, so team 0 resolves to red instead of 255."
> `redTeamIndex = 0; blueTeamIndex = 1;`

這與本次反組譯結果完全吻合，屬於獨立交叉驗證（一邊是我們原有的程式碼註解，一邊是這次重新反組譯
`Game_Info_Team_Set`／`Game_Play_Start`／`Game_Score_Get`／`Game_Score_Update` 得到的結論）。

**因此：我們現在送的 0/1 是正確、自洽的**（只要 Score 記錄的 team 欄與 `Game_Info_SN` 的
Red/BlueTeamIndex 用同一套值即可，兩邊都是 0/1，比對得上）。Moon 的 1/2 不是「另一個欄位」，是**同一個
欄位、但對應到另一條 code path（教學模式）的預設值**，不能套用到我們的連線對戰。

---

## 3. `Game_User_Mission_Set 0x1072d970` — 部分成立

**宣稱 A（Mode==9 時 total×5）**：成立。反編譯 `0x1072d970`：
```
iVar4 = param_3 * 5;
if (*(int *)(param_1 + 0xfcc) != 9) iVar4 = param_3;
ScoreMission = iVar4 - ScoreAssist(+0x13) - ScoreBattle(+0x12)
```
`Game_User_Assist_Set`（`0x1072d860`，比宣稱的 `0x1072d8a6` 早 0x46 bytes，該位址落在同一函式內，
應是函式中段某條指令，非函式起點——地址本身沒有指向別的函式）也是同樣的
`param_3*5`／`!=9→param_3` 邏輯，兩者確認一致，`total×5` 的宣稱成立。

**宣稱 B（0xfcc 是 MapInfo.Mode）**：成立。`Game_Info_Set`（`0x1072cca0`）內對 `0xfcc` 的寫入
（`0x1072cdba`）發生在一個以 `MapIndex` 為 key、逐筆比對 `[edx]==ebx` 的線性搜尋迴圈之後，
命中的表項目 `+0x18` 欄位被寫進 `+0xfcc`——這是一張「地圖資訊表」（stride `0xbc`），`+0xfcc`
確實是這張表裡對應目前地圖的「Mode」欄位。

**宣稱 C（是不是地圖編號的首位數）**：不成立／查無此邏輯。反組譯完全找不到任何除法、取模或字串
運算把 `MapIndex` 拆出「首位數」——`0xfcc` 的值是**直接從地圖資訊表的 `+0x18` 欄位讀出來的**，
不是從 `MapIndex` 用算術算出來的。也就是說，若地圖資訊表裡 Mode 欄位的值剛好等於地圖編號的首位數，
那是 **Cache.Bin 那張表本身的資料安排**（設計者填的值），不是 DLL 程式碼裡的計算規則；DLL
本身沒有「取首位數」這段邏輯，這一小句宣稱查無實據。

---

## 4. `Game_Score_Get 0x1072d120`（Mode 2/3 回傳 goal）— 成立

**依據**：反編譯確認 `0x1072d120` 找到符合 team 的記錄後：
```
if (*(param_1+0xfcc) != 2 && *(param_1+0xfcc) != 3)
    return record[2];   // score
iVar2 = record[6];       // goal
return iVar2;
```
`record[2]`＝score（記錄結構 offset 0x08）、`record[6]`＝goal（offset 0x18）。Mode 為 2 或 3
（Conquest/Occupation）時回傳 goal 而非 score，與宣稱完全相符。此函式同時被 `Game_Score_Update`
（`0x1072d1b0`）呼叫來填 HUD 的 RedScore/BlueScore，串起來的邏輯鏈與文中 3.2 節描述一致。

---

## 5. `User_Score_SN 0x00222221` 佈局與時序 — 成立（含時序矛盾已解出）

### 5a. 逐人列佈局 — 成立

反編譯 handler（`ZDispatchRoom::User_Score_SN`，thunk `0x107051b9`→**`0x107ece60`**，Moon 未列此
handler 位址，屬新查出的補充資訊）：

- Header：`Game_Result_Set(this, WinTeamIndex=body+0x00, WinTeamScore=body+0x04, WinTeamRank=body+0x02)`
  —— 三個 offset 與宣稱的 `+0x00/+0x02/+0x04` 完全相符。
- Record A 的 team 欄落在 `body+0x08`，Record B 的 team 欄落在 `body+0x16` —— 與宣稱的
  `+0x08 record A / +0x16 record B` 相符。
- `userCount` 讀在 `body+0x24`（byte）—— 與宣稱的 `+0x24` 相符。
- 逐人迴圈：起始位址換算下來精確落在 `body+0x25`，每圈遞增 `0x3A`（`param_2 = param_2 + 0x3a`）——
  與宣稱的「`+0x25` 起、stride `0x3A`」**逐位元組核對相符**。第一個欄位（迴圈裡以 `param_2-0x16`
  讀出，換算即記錄起點 `+0x00`）讀出的是 `u16 userIndex`，與宣稱一致。exp/point 細項欄位
  （`+0x06/+0x16/+0x1A/+0x2A`）中僅 `point total`（`+0x2A`，`u32`）在反編譯裡能明確對上
  `Game_User_Reward_Set` 的參數；其餘 3 個子欄位因反編譯器把中間變數摺疊/重用，未逐一單獨核對，
  留 ⬜（不影響 stride/起點的結論）。

### 5b. 時序矛盾 — 已解出

**Moon 的推論**：`User_Score_SN` 是 `ZDispatchRoom` 的 handler，他認為只有 `EndGame_SN` 觸發
`Scene_Change(5)` 之後才會被接受，所以延後 500ms 送。

**我們的做法**：`EndGame_SN` 之前送，RANK 正常顯示。

**查證**：直接反組譯 `ZDispatchRoom::Check(SCENE_TYPE)`（`0x1070966a`→`0x107e9eb0`）：
```
edx = *[0x1091b884]      ; 一個全域指標的內容（IsClient 相關旗標）
if (edx == 0) { this[4]=0; return; }   ; 非 client 一律關閉
if (scene==5) goto enable;
if (scene==6) goto enable;
this[4] = 0; return;                    ; 其他場景一律關閉
enable: this[4] = 1;
```
**`ZDispatchRoom` 在場景 5「或」場景 6 都是啟用的**（`IsClient && (scene==5 || scene==6)`）。這與
`docs/journal/2026-09-16-13-battle-start-is-scene-driven.md` 既有記載的表格一致，本次是用
`disasm.py` 直接重新讀組語核對，不是單純引用該篇日誌。

`User_Score_SN` handler（`0x107ece60`）本身唯一的閘門就是 `Check()` 設的 `this+4` 旗標，沒有另外
對場景做二次檢查。**因為 `ZDispatchRoom` 在場景 6（戰鬥中，`EndGame_SN` 觸發 `Scene_Change(5)` 之前）
就已經是啟用狀態，所以在 `EndGame_SN` 之前送 `User_Score_SN` 完全合法**——不需要等場景真的切到 5。
Moon 的假設「只有切到場景 5 之後才接受」不成立：他大概只驗證過場景 5 的情況，沒注意到
`Check()` 的條件其實是 `scene==5 || scene==6` 的 OR，並非「必須是 5」。

**回饋給 Moon 的重點**：可以把 `EndGame_SN` 後的 500ms 延遲拿掉，`User_Score_SN` 在場景 6
（`EndGame_SN` 之前）送就會被接受，因為閘門是 `ZDispatchRoom::Check`（`0x107e9eb0`）而不是
`Scene_Change` 本身，且該 Check 對 5 和 6 都放行。

---

## 附註：本文件不涉及的部分

未核對 §3.2 record 逐欄（round/alive/try 具體 offset 的每一個細節，僅核對了 team 欄與 goal/score
的路徑）、§7 joiner sync、§5 各模式規則（皆標「our rule」或未經 live 測試，依指示不需核對，
Moon 自己也標了狀態）。
