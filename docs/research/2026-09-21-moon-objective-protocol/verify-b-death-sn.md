# Verify-B: Death_SN / EndRound_SN 廣播給加入者 — 有沒有副作用

verifier（中階），2026-09-21。唯讀核對，不改程式、不改 state.md。

## (a) 組語核對

- `ZNetwork.dll` export `?Death_SN@ZDispatchGame@@...` 是 thunk（0x1070a2f4 系列 jmp 表，非本次重點）；本次重點是 handler 內對 `Game_Action_Death` 的呼叫點：`0x107db912 call 0x10706807`。
  `tools/disasm.py exports ZNetwork.dll Death` 確認 `0x10706807` == `?Game_Action_Death@UZNetwork_DJ@@QAEXHHHHHH@Z` 的 thunk（jmp 到真身 `0x1072e120`）。**Moon 的位址判定成立。**
- `EndRound_SN` handler 真身在 `0x107d7a50`（`0x10701794` 系列 jmp 表第一項），其中 `0x107d7c0d call 0x10703a12`；`0x10703a12` == `?Game_End_Round@UZNetwork_DJ@@QAEXH@Z` 的 thunk（jmp 到真身 `0x1072e310`）。`xref 0x10703a12` 只有這一個呼叫點。**Moon 的位址判定成立。**

### 真身反編譯（`tools/ghidra/decompile.sh 0x1072e120 0x1072e310`）

`Game_Action_Death`（0x1072e120）：
1. 無條件更新自己這份 UZNetwork_DJ 的擊殺/陣亡計數陣列（`param_1+0x1034/0x1038`，跟 GameInfo 無關）。
2. `if (*GIsClient_exref != 0)`：找本機的 PlayerController，呼叫 `APlayerController::eventTreatKillMSG_UJ`（擊殺訊息 HUD）。找不到就只是 `ZNetworkManager::Log_Set/Log_Write("UZNetwork_DJ::Game_Action_Death")`，不是腳本例外。這段跟 Level.Game 無關，host/joiner 都會跑到。
3. **`if ((*(byte *)(param_1 + 0xfac) & 1) != 0) { ... }`** —— 這個位元經反編譯 `Game_Host_Check`（`0x10707630` thunk -> 真身 `0x1071a560`：`return *(param_1+0xfac) & 1;`）**逐位元組確認就是同一個旗標**。也就是說，這整段（含 `ULevel::GetLevelInfo` 拿 `LevelInfo->Game` 再呼叫 `AGameInfo::eventMissionActionSuccess_BD`）**只在 `Game_Host_Check()==true` 時才執行**。加入者的 `UZNetwork_DJ` 這個旗標是 false，**整段連 null 檢查都不會跑到，也不會寫 log，直接跳過**。
   - 就算旗標是 true 但 `LevelInfo->Game`（GameInfo）是 0，也只是 `Log_Set/Log_Write("UZNetwork_DJ::Game_Action_Death")` 後 return——是原生 C++ 手動記的內部日誌，**不是** UnrealScript 的 `Accessed None`／`ScriptWarning`。

**結論 (a)-Death**：native 端已經有 `Game_Host_Check()` 前置檢查，加入者身上呼叫 `Game_Action_Death` **不會**觸碰 `Level.Game`，更不會產生腳本層 Accessed None。Moon 的「加入者沒有 Level.Game 所以會出事」對 Death_SN 這條路徑**不成立**——native 已經擋掉了。

`Game_End_Round`（0x1072e310）：
1. 無條件更新自己這份 UZNetwork_DJ 的旗標（`+0xfe8`、`+0x1014`），跟 GameInfo 無關。
2. `if (DAT_108e550c == 0 || Level == 0) { Log_Set/Log_Write("UZNetwork_DJ::Game_End_Round") } else { call [[Level vtable]+0xb4]() }` —— **這裡的前置檢查只查 `Level` 是否存在，不像 `Game_Action_Death` 那樣額外查 `Game_Host_Check()` 或 `LevelInfo->Game`**。加入者身上 `Level` 一定存在（同一張圖），所以這個 vtable 呼叫**會**執行。
3. vtable slot `+0xb4` 呼叫目標是執行期決定的（`ULevel`/`ALevelInfo` 實際型別的虛表），本次**沒有解出**它具體是哪個函式、會不會摸到 GameInfo — 標 ⬜ 未查出，需要對 `Engine.dll`／`Core.dll` 的 vtable 做進一步逆向（超出本次時間預算）。
3. 呼叫後把陣列歸零（跟 GameInfo 無關）。

**結論 (a)-EndRound**：native 端**沒有**看到跟 `Game_Action_Death` 同等的 host-check 或 Game-null 保護；vtable 目標未解出，靜態證據不足以判定「安全」或「危險」，只能靠 (b) 的實際 log 補證據。

## (b) 加入者端客戶端 log

- **M2 驗收（dusk，2026-09-19 晚，945 次 Death_SN、EndRound_SN x9）**：能找到的加入者 log 只有
  `docs/research/2026-09-19-second-client-win10/MetalRage.log`（52 行），**內容只到 `ScriptLog: START MATCH` 就結束**（客戶端在戰鬥開始前就被記錄截斷/log 檔在那之後沒再寫，或當時沒有續錄）——**沒有涵蓋戰鬥本身，無法從這份檔案判斷有沒有 Accessed None**。
  房主（Lucas）當時那份 `MetalRage.log` 也找不到——目前 `/mnt/c/Games/MetalRage Online/data/Log/MetalRage.log` 已被 2026-09-20/21 的後續 session 覆蓋（引擎 log 每次啟動截斷同名檔案，`journal/2026-09-20-2030-same-machine-and-netspeed.md` 已記錄這個機制）。
  journal 裡 PM「沒有 WARNING、REFUSING、EXCEPTION、fallback」的統計，經核對 `logs/session-20260919-200917.jsonl` 的事件型別（`pkt`/`fallback`/`marker`/`connect`/`close`/`build`/`session`），**那是我們自己伺服器 session log 的事件標籤，不是客戶端 `MetalRage.log` 的 ScriptWarning**。這條和本次要驗的問題（客戶端腳本層有沒有 Accessed None）**是兩件事**，M2 這場對 (b) **沒有直接證據**。

- **2026-09-20 晚同機雙開 joiner（`MetalRage Online 2/data/System/run-*.log`，9 個檔，涵蓋房主/加入者角色互換、多場 PvE 對戰含擊殺）**：
  ```
  grep -c "ScriptWarning\|Accessed None\|Warning\|UZNetwork_DJ::Game_Action_Death\|UZNetwork_DJ::Game_End_Round" run-*.log
  ```
  逐一核對每個命中，**沒有任何一行是 `UZNetwork_DJ::Game_Action_Death`、`UZNetwork_DJ::Game_End_Round`、`MissionActionSuccess`、`TreatKillMSG`，也沒有任何一行 `Accessed None` 提到 `GameInfo`／`Game`／`Mission`／`Death`／`EndRound`**。實際出現的 `Accessed None` 只有兩種、都跟本題無關：
  - `run-200814.63.log:219`（及另外 5 個檔各一次）：
    `Warning: ZSetCorePlayercontroller Map_PC04.ZSetCorePlayercontroller (Function ZBase.DefaultPlayerController.Spectating.BeginState:0023) Accessed None 'PlayerReplicationInfo'`
    出現在**地圖預載完成、正式開打前**（前後文是 precaching geometry/textures 的 log，還沒進入 `WeaponLog` 的第一行），是進場時進入 Spectating 狀態的既有小毛病，跟 Death_SN／EndRound_SN 完全無關。
  - `run-212015.11.log`、`run-212841.90.log`（各 6 次）：
    `Warning: MRNavigation Map_PC04.MRNavigation (Function ZBase.BaseNavigation.CalcNodeSort_CoreEscort:...) Accessed None 'NodeActor'`
    是 PvE 護送地圖的怪物導航問題，跟 GameInfo/Death 無關。
  - 主安裝、副安裝、筆電三份現存 `MetalRage.log` 也都 grep 不到 `UZNetwork_DJ::Game_Action_Death`/`Game_End_Round`/`MissionActionSuccess`/`TreatKillMSG`。

**結論 (b)**：M2 那場（945 次 Death_SN 的那場）**沒有涵蓋戰鬥的加入者 log**，無法直接驗證；但 2026-09-20 晚 9 份**真的打過仗**的加入者 log，完全沒有出現跟 Death_SN／EndRound_SN／GameInfo 相關的 Accessed None 或內部 log 字串。跟 (a) 的 `Game_Host_Check()` 前置檢查（Death_SN 這條路徑）互相印證：加入者不會走到那段程式，自然也不會留下痕跡。EndRound_SN 那條路徑靜態上未解出 vtable 目標，但這 9 份實測 log 裡也沒有異常，屬於「目前找不到反例」而非「證明安全」。

## (c) 跟 dusk 回報的怪象有沒有關係

`docs/journal/2026-09-19-2120-m2-acceptance.md` 記錄 dusk 的怪象（怪物閃現、蓄力射擊/2連發火箭/主武器有時沒射出、第9回合能量柱沒 HP 條）全部標注歸因 **NET-2（P2P 同步問題）**，PM 判定跟 M2 本身無關、另外處理。`docs/journal/2026-09-20-2030-same-machine-and-netspeed.md` 進一步用組語（`Engine.dll AActor::ProcessRemoteFunction 0x105234b0`，`ToAll` 廣播迴圈對每個 connection 呼叫 `UNetConnection::IsNetReady`，回 false 就整包消失不重傳）加實測（同機 33% 缺口、`CurrentNetSpeed` 被夾在 10000/15000）解釋了「射不出、沒特效、閃現」——**這是頻寬/RPC 佇列問題，不是腳本層 Accessed None，也不是 GameInfo 呼叫失敗**。目前找不到任何 journal 把這些症狀跟 Death_SN/EndRound_SN 的 GameInfo 呼叫連在一起；(a)(b) 的證據也顯示 Death_SN 那條路徑在加入者身上根本不會碰 GameInfo。**沒有關聯的證據，反而有明確的另一個根因（NET-2 頻寬節流）已經用 DLL+實測驗證過。**

## 結論

**1. 無害，可維持現狀（Death_SN 部分）**——`Game_Action_Death` native 端有 `Game_Host_Check()` 前置檢查，加入者呼叫時整段 GameInfo 相關程式碼直接跳過，不會產生 Accessed None；9 份真實加入者戰鬥 log 也零命中。

**EndRound_SN／User_Score_SN／EndGame_SN 這三個 ⬜ 未完全比照驗證**：`Game_End_Round` native 端沒有看到跟 Death_SN 同等的 host-check（只查 Level 是否存在），vtable 呼叫目標本次沒解出，**不能因為 Death_SN 安全就類推它們也安全**——外部說法 §7 明確把 EndRound 跟 Death_SN 並列成「不安全」名單，這部分只有實測 log 零命中撐著，靜態證據不足。建議下一批任務：解 `Game_End_Round` 那個 vtable slot 的實際目標（`Engine.dll`/`Core.dll` 的 `ULevel`/`ALevelInfo` 虛表），或者比照 Death_SN 直接去讀 `AGameInfo::eventGame_End_Round`（若存在）在腳本端的實作，確認它有沒有自己的 None 檢查。

## 補充（PM 要求）：`Game_Action_Death` 裡 host 閘門之前那段在做什麼

PM 機械核對 `0x1071a560`（`Game_Host_Check` 真身）與 `0x1072e208`（`Game_Action_Death` 內
`test byte ptr [esi+0xfac], 1`，即 host 閘門所在）兩個位址都對。以下補上 host 閘門**之前**那段
（`0x1072e189`–`0x1072e1dc`），逐行反組譯核對（`tools/disasm.py at 0x1072e120 90`）：

```
0x1072e189  mov  edx, [0x1091b884]      ; import Core.dll ?GIsClient@@3HA
0x1072e18f  cmp  dword ptr [edx], 0
0x1072e192  je   0x1072e208             ; GIsClient==0 -> 跳過整段，直接到 host 閘門
0x1072e194  mov  eax, [0x108e550c]      ; DAT_108e550c
0x1072e199  test eax, eax
0x1072e19b  je   0x1072e1de             ; null -> 走失敗分支（internal log）
0x1072e19d  mov  eax, [eax+0x34]
0x1072e1a0  test eax, eax
0x1072e1a2  je   0x1072e1de
0x1072e1a4  mov  ecx, [eax+0x34]
0x1072e1a7  test ecx, ecx
0x1072e1a9  je   0x1072e1de
0x1072e1ab  mov  eax, [eax+0x30]
0x1072e1ae  mov  ecx, [eax]
0x1072e1b0  mov  ecx, [ecx+0x34]
0x1072e1b3  test ecx, ecx
0x1072e1b5  je   0x1072e1de
0x1072e1b7..0x1072e1d5  (組參數)
0x1072e1d6  call dword ptr [0x1091ba80]   ; import Engine.dll
                                          ; ?eventTreatKillMSG_UJ@APlayerController@@QAEXHEHHEEH@Z
0x1072e1dc  jmp  0x1072e208
0x1072e1de  (失敗分支：Log_Set/Log_Write，字串 "UZNetwork_DJ::Game_Action_Death"，
             file offset 0x114f1c，`tools/disasm.py str "UZNetwork_DJ::Game_Action_Death"` 確認)
0x1072e208  test byte ptr [esi+0xfac], 1   ; host 閘門，本篇原本核對過的那段
```

### 1. 最後呼叫的是什麼

`0x1091ba80` 用 pefile 對 import table 逐一比對，確認是 **`Engine.dll` 匯出的
`?eventTreatKillMSG_UJ@APlayerController@@QAEXHEHHEEH@Z`**——PM 猜對了，不是照猜，是實際核對
import table 名字比對出來的。這段的前提只有 `GIsClient != 0`（Core.dll 的 `?GIsClient@@3HA`，
偏移 `0x1091b884`）加上下面那條指標鏈非 null，跟 `Game_Host_Check()`（`0xfac` 位元）**完全無關**，
跟後面 host 閘門是兩段獨立的 if。

### 2. 加入者身上這條指標鏈會不會因為某一層 null 被跳過

**`DAT_108e550c` 是什麼，先查清楚：** 在 `0x10728960` 附近的另一個函式裡，`esi`（一個傳入參數）
先被 `call dword ptr [0x1091ba7c]`（import `?StaticClass@UGameEngine@@SAPAVUClass@@XZ`）檢查是否
`IsA(UGameEngine)`（走 `[esi+0x28]` 逐層 `[+0x2c]` 的 class-chain 比對），**通過才會**
`mov dword ptr [0x108e550c], esi`（`0x107289a8`），沒通過就存 0（`0x107289b0`）。
→ **`DAT_108e550c` 是這個客戶端「自己」快取的 `UGameEngine`（即 `GEngine`）指標**，跟 P2P 房主/加入者
身分完全無關——這是**每個執行中的客戶端行程各自都有一份**的東西，不是網路上交換來的、也不是只有房主
才會建立的物件（跟 `Game_Action_Death` 後半段用 `LevelInfo->Game`／`AGameInfo` 那個「只有房主端才有
實例」的東西是完全不同層級）。

`+0x34`／`+0x34`／`+0x30`→`[0]`→`+0x34` 這條鏈，因為 `Engine.dll` 沒有 PDB/型別資訊給 Ghidra，
**沒能解出對應到 `UEngine`/`UGameEngine` 的具體欄位名稱**（例如是不是 `GamePlayers(0)`），這點標 ⬜。
但從「最終結果被當 `APlayerController*` 傳給 `eventTreatKillMSG_UJ`」、以及 `DAT_108e550c` 已確認是
「自己這個行程的 GEngine」這兩點合起來看，**這條鏈在語意上是在找『這個行程自己的本機玩家 PlayerController』**
（等同 UE2 常見的 `GEngine->GamePlayers(0)->Actor` 存取模式），不是什麼房主專屬的資源。

**結論：沒有找到「加入者身上這一層一定是 null」的結構性理由。** 這條鏈檢查的是「這個客戶端自己的本機
玩家是否已經有一個活著的 PlayerController」，房主和加入者各自的遊戲行程都會建立自己的本機玩家
PlayerController（跟 `AGameInfo` 那種只在權威端／host 才會實體化的物件不同），理論上兩邊在正常對戰中
都應該非 null。唯一合理會讓它暫時 null 的情境是**載入/尚未 spawn 的空窗期**（跟本篇稍早找到的
`Warning: ... DefaultPlayerController.Spectating.BeginState ... Accessed None 'PlayerReplicationInfo'`
出現在地圖預載完成、正式開打**之前**是同一類「還沒 spawn 完」的空窗），這種空窗房主和加入者都可能遇到，
不是加入者專屬。

**實測佐證**：這條鏈的失敗分支跟後面 `Game_Host_Check` 那段的失敗分支**共用同一個字串**
`"UZNetwork_DJ::Game_Action_Death"`（file offset `0x114f1c`）。本篇稍早已經對 9 份真實加入者戰鬥
log（`MetalRage Online 2/data/System/run-*.log`）、房主/副安裝/筆電現存 log 全部 grep 過這個字串，
**零命中**——代表就我們手上這批紀錄而言，**這條鏈也從沒被觀察到走到失敗分支過**，跟「加入者看不到擊殺
提示」這個猜測沒有找到支持的證據。**沒有證據不等於證明不會發生**——如果操作者之後實際回報「加入者沒看到
擊殺訊息」，這條鏈仍然是第一個該回頭查的地方，但目前的靜態＋實測證據都指向「跟房主/加入者身分無關」。
