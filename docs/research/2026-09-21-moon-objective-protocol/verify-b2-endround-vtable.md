# Verify-B2: `Game_End_Round` 的 `[Level vtable]+0xb4` 到底是誰

explorer（中階），2026-09-21。唯讀核對，不改程式、不改 state.md、不改既有 journal。
接續 `verify-b-death-sn.md` 留下的 ⬜。

## 1. `[Level vtable]+0xb4` 是哪個函式

`UZNetwork_DJ::Game_End_Round`（ZNetwork.dll 真身 `0x1072e310`）組語核對（`tools/disasm.py at 0x1072e310`）：

```
mov eax, [0x108e550c]        ; DAT_108e550c，全域指標，63 處 xref
test eax, eax
je  <log path>
mov ecx, [eax+0x14c]         ; ecx = Level（ULevel*）
test ecx, ecx
je  <log path>
mov edx, [ecx]               ; edx = Level 的 vtable（第一個，UObject-facing）
call [edx+0xb4]              ; thiscall，this=ecx=Level，無其他參數
```

`DAT_108e550c+0x14c` 的型別由 Ghidra 對**同一個 DLL 裡另一個函式**（`Game_Action_Death`，
`0x1072e120`）的反編譯確認為 `ULevel *`——那邊同一個欄位被傳進
`ULevel::GetLevelInfo()`，Ghidra 標成 `*(ULevel **)(DAT_108e550c + 0x14c)`。兩處是同一個
全域＋同一個偏移，可視為同一欄位，**`Game_End_Round` 這次呼叫的 this 是 `ULevel` 物件本身**。

`Engine.dll` export `??_7ULevel@@6BUObject@@@`（VA `0x10691af8`，這是 UObject-facing 那個
vtable，不是 `??_7ULevel@@6BFNetworkNotify@@@` 那個 interface vtable）用 `pefile` 直接讀
`+0xb4` 位置的 dword：

```
0x10691af8 + 0xb4 = 0x10691bac -> 0x1047ab70
```

比對 `Engine.dll` export 表，`0x1047ab70` == `?EndRound_BD@ULevel@@UAEHXZ`（`ULevel::EndRound_BD`）。
**核對過相鄰 slot 當 sanity check**：`+0xa0` = `0x1047a5e0` == `?Listen@ULevel@@...@Z`，這正是
`docs/research/2026-09-20-netspeed-init/notes.md` 已經用 export 位址確認過的
`ULevel::Listen`（export VA `0x1047a5e0`）——**同一顆 vtable、同一個位址在兩份獨立調查裡對上，
可信度高**。順便也讀出鄰近 slot：`+0xb0`=`EndGame_BD`、`+0xb8`=`EndQuater_BD`、
`+0xbc`=`DediCateServerStart_BD`，命名上和本次任務高度相關，一起記錄。

**結論 1**：`[[Level vtable]+0xb4]` == **`ULevel::EndRound_BD`**（`Engine.dll` VA `0x1047ab70`）。
已確認（DLL 位址＋export 名稱＋鄰近 slot 交叉核對），不是猜測。

## 2. `ULevel::EndRound_BD` 在加入者身上會怎樣

反編譯（`DLL=Engine.dll tools/ghidra/decompile.sh 0x1047ab70`）：

```c
int __thiscall ULevel::EndRound_BD(ULevel *this)
{
  if (((*(int *)(this + 0x40) != 0) && (*(int *)(*(int *)(this + 0x40) + 0x3c) == 0)) &&
      (pUVar1 = *(UObject **)(**(int **)(this + 0x30) + 0x630), pUVar1 != (UObject *)0x0)) {
      // FindFunctionChecked(pUVar1, "EndRound_BD") + pUVar1->ProcessEvent(...)
  }
  pUVar1 = *(UObject **)(**(int **)(this + 0x30) + 0x648);
  if (pUVar1 != (UObject *)0x0) {
      // FindFunctionChecked(pUVar1, "RoundEnd_BD") + pUVar1->ProcessEvent(...)
  }
  return 1;
}
```

- `this+0x30` 解引用一次拿到的指標，`+0x630` 這個偏移**在 `verify-b-death-sn.md` 已經核對過**
  就是 `ALevelInfo->Game`（`Game_Action_Death` 那邊 `ULevel::GetLevelInfo()` 回傳值 `+0x630` ==
  `AGameInfo*`，逐次出現在 `docs/research/2026-09-16-slots/mro-slot-followup.txt`、
  `docs/research/2026-09-17-changeslot-wip/*` 好幾處獨立 decompile，偏移一致）。也就是說
  `this+0x30` 解引用後就是 `ALevelInfo*`（`ULevel::GetLevelInfo()` 很可能就是回傳這個快取欄位）。
- **第一段（呼叫 `GameInfo.EndRound_BD()`）同時被兩件事擋住**：
  1. 一個看起來像「是不是主機」的檢查：`this+0x40 != 0 && *(this+0x40+0x3c) == 0`。
     `this+0x40` 極可能是 `ULevel::NetDriver`（`docs/journal/2026-09-20-2223-netspeed-init.md`
     提到同一個欄位 `edi+0x40` 就是房主的 NetDriver 實例）；`+0x3c` 目前**沒有**進一步核對是哪個
     旗標，只能標 🟡／⬜，不確定它精確等不等於「is host」。
  2. **不管上面那個檢查是什麼意思，`pUVar1 != 0`（即 `Game != 0`）是明確寫在同一個 `&&` 鏈的
     最後一項，而且是短路求值**——只要前兩項有一個是 false，`pUVar1` 的賦值跟後面的呼叫**根本不會執行**。
     加入者的 `LevelInfo->Game` 是 null（`verify-b-death-sn.md` 已用 `Game_Host_Check`/
     `Game_Action_Death` 反覆核對過這件事），所以就算 host-check 那部分語意有出入，**這段永遠不會對
     null 的 `Game` 呼叫 `ProcessEvent`**。
- **第二段（呼叫 `?.RoundEnd_BD()`）用的是 `this+0x30`（LevelInfo）另一個欄位 `+0x648`，跟
  `+0x630`（Game）不是同一個欄位**，且**沒有 host 檢查，只有 `pUVar1 != 0` 的 null 檢查**。
  `+0x648` 沒有在本次或既有 journal 裡逐位元組核對出具體是哪個成員，但從命名與行為模式強烈懷疑
  是 `GameReplicationInfo`（GRI）：
  - `ULevel::EndGame_BD`（`Engine.dll` VA `0x1047aa30`，vtable `+0xb0`，同一顆 vtable鄰居）
    結構完全對稱：`Game`（`+0x630`，host-check+null 檢查）呼叫 `GameInfo.EndGame_BD()`；
    `this+0x30+0x648`（同一欄位）呼叫 `?.GameEnd_BD()`，且該分支的 `else` 是「找不到這個物件時
    做 Host Create Fail / DISCONNECT 清理」的邏輯——這正是 GRI 在正常對局中一定存在、只有
    連線失敗等異常情況才會是 null 的典型寫法。
  - GRI 在 UE1 裡的設計目的就是「複製給所有 client 看的房間/對局狀態」，跟只存在於 host 端的
    `Game`（AGameInfo）語意互補，這兩段一個 host-only（`EndRound_BD`／`EndGame_BD`）、一個
    全員可跑（`RoundEnd_BD`／`GameEnd_BD`）的配對完全符合這個設計慣例。
  - **這是推論，不是逐位元組核對出來的欄位名**，標 🟡。但即使 `+0x648` 猜錯，**只要它在加入者
    身上是合法非 null 的物件（不是 null 就是某個真實存在的 actor），呼叫 `ProcessEvent` 找一個
    可能不存在的 UnrealScript 函式，`FindFunctionChecked` 在 UE1 找不到具名函式時的標準行為是
    log 一次 warning 並跳過，不是崩潰**——這件事沒有在本次逐行核對 `FindFunctionChecked` 的原始碼
    行為，是引擎慣例知識，標 🟡。

**結論 2**：`ULevel::EndRound_BD` 在加入者身上執行**不會**對 null 的 `Game`（GameInfo）呼叫任何東西
——`pUVar1 != 0` 的顯式 null 檢查直接擋住（這點是逐行核對出來的，可信度高，不是猜測）。第二段呼叫
的物件（懷疑是 GRI）在加入者身上應該是合法存在的，這段推論本身標 🟡，但**不影響「不會摸 null
GameInfo」這個核心結論**，因為兩段用的是不同欄位、不同物件。

## 3. `User_Score_SN` / `EndGame_SN` 有沒有走類似路徑

用 `tools/dispatch-map.py --list` + 逐個 dispatcher 掃描，位址核對如下：

- **`User_Score_SN`**：opcode `0x00222221`，其實在 **`ZDispatchRoom`**（不是 `ZDispatchGame`），
  export `?User_Score_SN@ZDispatchRoom@@...` VA `0x107051b9`，thunk → 真身 `0x107ece60`。
  反編譯（`tools/ghidra/decompile.sh 0x107ece60`）：整個函式只呼叫
  `UZNetwork_DJ::Game_Score_Set`／`Game_Score_Update`／`Game_Result_Set`／`Game_User_Reward_Set`，
  **完全沒有出現 `DAT_108e550c`、`Level`、`GameInfo`、任何 vtable 呼叫**。這些都是對
  `UZNetwork_DJ` 自己實例資料的寫入，跟 `Game_End_Round` 是不同的程式碼路徑。
- **`EndGame_SN`**：opcode `0x00222213`，`ZDispatchGame`，export VA `0x1070a182`，
  thunk → 真身 `0x107d7ed0`。反編譯後呼叫 `Game_Score_Set`／`Game_Score_Update`／
  （dedicated 時）`Dedi_End`／（非 dedicated 時）`Game_End_Battle`／`Community_Chat_Clear`／
  `Event_Call("NETWORK_GAME_END")`／`Scene_Change`。追進 `Game_End_Battle`
  （`UZNetwork_DJ::Game_End_Battle`，真身 `0x1071b450`）：只有兩行，跟 `Game_End_Round` 開頭
  那段更新 `+0xfe8`/`+0x1014` 旗標的邏輯一模一樣，**但沒有後面呼叫 vtable 那段**——也就是說
  `Game_End_Round` 其實是「`Game_End_Battle` 的邏輯 + 呼叫 `Level->EndRound_BD()`」，`EndGame_SN`
  走的是前半段，沒有觸碰 `Level`/`GameInfo`。`Dedi_End`／`Community_Chat_Clear`／`Event_Call`／
  `Scene_Change` 這四個沒有逐一往下追（超出本次任務範圍），標 ⬜ 未查。

**結論 3**：`User_Score_SN` 和 `EndGame_SN` 的 handler（在本次追到的深度內）**沒有**呼叫
`Game_End_Round`／`ULevel::EndRound_BD` 那條 vtable 路徑，跟 Moon 原本可能假設的「這三個 opcode
都走同一種危險模式」**不一致**——它們用的是完全不同的、看起來單純寫 `UZNetwork_DJ` 自身欄位的函式。
`Dedi_End`／`Game_End_Battle` 呼叫之後的 `Community_Chat_Clear`／`Event_Call`／`Scene_Change`
沒有追到底，不能保證這幾個裡面完全没有 GameInfo 相關呼叫，這部分標 ⬜。

## 總結論

**`EndRound_SN` 廣播給加入者：無害**（結論 2 有逐行核對支撐：null 檢查明確存在，短路求值下
`Game` 為 null 時整段不執行）。

**`User_Score_SN`／`EndGame_SN`**：在追到的呼叫深度內看不到 `Game_End_Round` 那種 GameInfo 相關的
vtable 呼叫，**目前沒有找到危險路徑**，但 `Dedi_End`／`Community_Chat_Clear`／`Event_Call`／
`Scene_Change` 沒有逐一展開，嚴謹說法是**「目前證據顯示無害，但沒有窮盡驗證」**，不是「已徹底排除」。

建議標記：**EndRound_SN：✅ 可標（by 高階，需要的話）；User_Score_SN／EndGame_SN：🟡，如果要標 ✅
需要再展開 `Dedi_End`/`Game_End_Battle` 之後那四個呼叫**。
