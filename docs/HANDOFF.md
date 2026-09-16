# 交接:接手前先讀這頁

給下一個接手的人(Codex 或其他)。這份只講「現在在哪、下一步做什麼、以及別踩什麼坑」。
背景知識全部在 `docs/opcode-ledger.md`,它是這個專案的記憶體,**每一次發現都要寫回去**。

---

## 這是什麼

Metal Rage Online(鐵影特攻 Online),2009 年 GameHi 的機甲 TPS,台灣由紅心辣椒代理,
2011 年收攤。`Metal Rage Online Server/` 是社群的 Node.js 私服模擬器(`shanzenos/MRO-Server`),
目標是讓這款已停運的遊戲重新能玩。客戶端裝在 `/mnt/c/Games/MetalRage Online`(WSL2 看得到)。

**架構重點:這是 listen-server。** 開局時伺服器要客戶端自己當 host
(`?Listen?LPort=30907`),實際戰鬥不見得經過我們的伺服器。我們送的封包主要是在
**推動客戶端的狀態機與 UI**,不是在模擬戰鬥。

---

## 現在的狀態

已經可以:登入 → 大廳 → 房間(地圖列表正常)→ 按 F5 → 客戶端讀進 `Map_PC01`,
顯示 MISSION BRIEFING(CAMPAIGN MODE / Protect the strategy fusion)。

還不行:**沒有機體**。WASD 只能移動攝影機 = spectator。

根因已經查清楚(詳見 ledger「`team=255` 的成因鏈」):travel URL 的 `team=%d` 來自
`Game_User_Team_Get(自己的 account index)`,它查 `[this+0x1034]` 這張表,查不到就回 255。
那張表只有 `Game_User_SN (0x00222112)` 會填,而該封包先前是關閉的。

**本輪已經修了,但還沒實測。** 改了兩件事:
1. `Game_User_SN` 打開,並從房間(場景 5,handler 必定丟棄)移到場景 6 的開局序列
2. `Game_Info_SN` 的 `+0x13` 原本誤寫 `quarterIndex=1`,那其實是 TimeLimit(分鐘),改成 10

---

## 你要做的第一件事:驗證這兩項

請使用者開伺服器(`tmux` session 名為 `server`,`npm start`)、開客戶端、登入、建房、按 F5。
然後看三件事:

1. `/mnt/c/Games/MetalRage Online/MetalRage.log` 裡的 travel URL
   - `team=` 應該從 `255` 變成 `0`
   - `TimeLimit=` 應該從 `1` 變成 `10`
2. 進圖後是否出現**選機體畫面**
3. 封包記錄:`node tools/slice.js`(見下方工具清單)

如果 `team=0` 但還是沒有選機體畫面,下一個要查的是 `Game_User_SN` 記錄裡
`rec+0x10`(selected slot)與槽位陣列的內容是否讓客戶端認得出機體。

**如果出現選機體畫面**,客戶端按下去會送 `ChangeSlot_CN 0x00230101`
(這是 UnrealScript native `execGame_Slot` 直接呼叫的,見 ledger)。目前沒有 handler,
會落到 unhandled logger 並 dump body。拿那個 body 去反編譯 `ChangeSlot_SN 0x00230102`
的 handler,做出回應。

---

## 再下一步:RESPAWN 0 → 4

使用者看過舊影片,確認流程是:任務簡報動畫 → 選機體 → 右側 F1~F5 技能列
(消耗 SP 30/30/50/200/300:攻擊力、防禦力、裝填、核心 EMP、憤怒模式),
標籤 `RESPAWN 0 / KILL 0`;**RESPAWN 變成 4 之後才能操控機體**。

DLL 側的候選符號(都還沒驗證):
- `UZNetwork_DJ::Game_User_Sally_Add` — sally = 出撃,最像 spawn
- `UZNetwork_DJ::Game_Item_InstantRespawn_Get/Set`
- `UZNetwork_DJ::Item_InstantRespawnCount_Get` — `Game_Info_SN` 的最後一行就呼叫它
- `UZNetwork_DJ::Game_User_State_All_Set` — `Game_Play_Start` 以 `(1, false)` 呼叫

再往後是戰鬥封包:`Death_SN 0x00230107`、`Respawn_SN 0x00230103`、`Assist_SN 0x00230106`
(已從 dispatch map 讀出,尚未對照真實流量)。

---

## 工作方法(這條最重要)

**猜一次封包布局的成本是一整個測試場次;讀一次客戶端的程式碼是一分鐘。**
所以規則是:先反編譯,再改程式。這個專案的每一次重大進展都來自讀 DLL,
每一次浪費掉的場次都來自猜。

### 找「客戶端送出」的封包
不要在客戶端的 dispatcher 裡找——dispatcher 只列 server→client。
要搜尋把 opcode 寫進 Format 結構的那條指令:

```python
# 在 .text 裡線性掃描,找 mov [...], <opcode>
# 三處引用是標準形狀:一個 [ecx+0xc] 建構子 + 兩個全域 send 站
```

這樣一次就把 `Timeout_CN` / `BeginRound_CN` / `Battle_Success_CN` 三個全部命名出來。

### 反編譯

```bash
cd "Metal Rage Online Server"
tools/ghidra/decompile.sh 0x107d8ae0          # 自動找出包住該位址的函式
DLL=Engine.dll tools/ghidra/decompile.sh 0x...
tools/disasm.py exports ZNetwork.dll 'Game_User'   # 符號齊全,用名字找位址
tools/disasm.py at 0x107d8ae0 130                  # 組語
tools/disasm.py str 'MapIndex'
```

⚠ **匯出表位址是 thunk。** `tools/disasm.py at <export>` 只會看到一條 `jmp`,
要再跳一次才是本體。`decompile.sh` 會自己處理。

⚠ **Ghidra 的參數順序與 stack 變數命名會出錯。** 在 `Game_Info_SN` 上它把 p2/p3 與
p8/p9 對調;在 `Game_User_SN` 上它把記錄偏移整批位移了 4 bytes。
**凡是要寫進封包的偏移,一律回頭看組語確認。** 驗算方法:結構通常緊密打包,
算算看總長度對不對(例:`0x6D + 8 × 0x2F = 0x1E5` 剛好等於記錄大小)。

### 封包記錄

```bash
node tools/slice.js                 # 列出 marker 與 opcode 直方圖
node tools/slice.js --unhandled     # 只看沒有 handler 的,含 body dump
node tools/slice.js --op 0x230111 --dump
```

記錄是 JSONL,同步寫入,所以**崩潰前最後一個封包也留得住**。
在遊戲裡打字聊天會被記成 marker(Big5 解碼),可以用來標記「我現在按了 F5」。

### 一次只改一個變數
ledger 裡有一條方法學紀錄,是因為曾經一輪改兩處,症狀變了卻無法歸因,浪費一個場次。
真的要同時改兩項時,先確認兩項的**觀察特徵互斥**,並在 ledger 寫明怎麼分辨
(本輪就是這樣做的:`TimeLimit=` 對應一項,`team=` 對應另一項)。

### ledger 的證據標記
`✅ 已確認` / `🟡 假設` / `⬜ 未知` / `❌ 已排除`,來源標 `[DLL]` `[OBS]` `[TEST]` `[GUESS]`。
**推翻自己的結論也要寫進去**,ledger 裡已經有好幾條是我自己的錯誤更正——那些比正確答案更省時間。

---

## 協定備忘

- 16-byte header:CRC32 @0x00(BE)、sequence @0x04(BE)、length @0x06(BE)、opcode @0x0C(BE)
- **body 欄位幾乎全是 LE**。混淆是 CRC32 table 當 keystream 做 XOR,不是加密
- opcode 慣例:奇數 = CQ/CN,SA/SN = opcode+1
- **場景閘門**:每個 `ZDispatch*::Check(SCENE_TYPE)` 設 `*(this+4)`,每個 handler 都先測它。
  `ZDispatchWaiting`=場景 1,`ZDispatchRoom`=場景 5 或 6,`ZDispatchGame`=**場景 6**。
  送錯場景的封包會被靜默丟棄——這是本輪 `Game_User_SN` 失效的原因之一,務必先確認場景。
- `ZNetwork.dll` ImageBase `0x10700000`,所有 section 的 RVA == 檔案偏移

---

## 環境

- MySQL 已裝好、schema 已匯入(用 `metalrageserver.sql`,不是 `database/schema.sql`)
- 伺服器跑在 tmux session `server`;使用者保留手動介入的餘地
- Ghidra 12.1.3 在 `~/tools/ghidra_12.1.3_PUBLIC`,專案在 `~/tools/mro-ghidra-proj`
- `tools/win/shot.sh` 截圖**可用**;`tools/win/drive.sh` 送輸入**無效**(前景視窗與 IME 都試過了,
  點擊也不進去)。**遊戲操作一律請使用者手動執行**,你只能觀察。

---

## 兩條硬性約束

1. **不做反作弊繞過。** 不 patch / NOP XIGNCODE 初始化、不注入行程、不附加除錯器、
   不偽造輸入來源旗標。純分析可以,修改不行。這是與使用者談定的,不要重新提議。
   (使用者的滑鼠硬體巨集、Pi Pico HID 這類「真實硬體、他自己的裝置」不在此限。)
2. **不要把這個伺服器暴露到不信任的網路。** `accounts` 表沒有密碼欄位,
   `handleLogin()` 遇到未知使用者名稱會直接建立帳號。任何連得到 port 的人都能登入成任何人。
   這是伺服器目前的設計,不是這裡的疏漏,但後果是真的。

---

## 使用者

台灣人,講中文。這是他的童年遊戲,他自己也會動手(裝套件、開伺服器、操作客戶端)。
他會直接糾正你的錯誤,而且通常是對的——有幾次我的判斷錯了都是他先看出來的。
被糾正就改,不用反覆道歉。
