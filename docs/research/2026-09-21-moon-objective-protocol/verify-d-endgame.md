# P6：`User_Score_SN`／`EndGame_SN` 廣播給加入者安不安全（2026-09-21）

承 `verify-b-death-sn.md`／`verify-b2-endround-vtable.md` 留下的 ⬜。
**全部 [DLL]，🟡 待審（未經跨公司審查）。** 由 explorer 反組譯，高階整理落檔。

> 本檔由高階代為落檔：explorer 的角色設定禁止寫檔，它**正確地拒絕**了契約裡
> 「寫進某檔案」的要求並把內容交回。契約寫錯的是我。

## 關鍵前提：`EndGame_SN` 分兩支，我方只走其中一支

`EndGame_SN` 真身 `0x107d7ed0`：
- `0x107d806a`：`mov eax,[0x1091b884]; cmp [eax],0; je ...`
  （`0x1091b884` 經 pefile IAT 核對 ＝ `Core.dll ?GIsClient@@3HA`）
- **`GIsClient == 0`**（純 dedicated server 行程）→ `Dedi_End`
- **`GIsClient != 0`**（**我方 host 與 joiner 都是這種**，都是有畫面的 client 行程）
  → `Game_End_Battle` → `Community_Chat_Clear` → `Event_Call("NETWORK_GAME_END")` → `Scene_Change(5)`

## 四個 callee 逐一

| # | callee | 位址 | 對加入者 | 依據 |
|---|---|---|---|---|
| 1 | `Dedi_End` | thunk `0x10704a98` → 真身 `0x10716e90` | **安全（不可達）** | 開頭就是 `if (GIsClient!=0) return;`（`0x10716e98 jne 0x10716ede`）。**我方每個 client 的 `GIsClient` 恆為非 0，這條分支永遠不會執行。** 它往下才是唯一真的會碰 `Level` vtable（`+0xb0` ＝ `ULevel::EndGame_BD`，`Engine.dll 0x1047aa30`）的路徑 |
| 2 | `Community_Chat_Clear` | thunk `0x107080d0` → 真身 `0x1072e830` | **安全** | 真身只有 4 條指令，對 `this+0xde0`（自己的成員陣列）呼叫逐元素解構＋`Core.dll FArray::Empty`。**完全沒有從封包／Level／GameInfo 取指標** |
| 3 | `Event_Call("NETWORK_GAME_END", NULL)` | thunk `0x107097ff` → 真身 `0x10728cc0` | **安全（就這一層）** | 第一參數 null 就直接 ret；再查 `GIsClient`；通過才把事件字串塞進 `this+0x3cc` 自己的佇列（`Core.dll FArray::AddZeroed` ＋ `FStringNoInit::operator=`）。**只寫自己的陣列** |
| 4 | `Scene_Change(5)` | thunk `0x1070148d` → 真身 `0x10738910` | **安全（已查深度內）** | 只寫 `this+0x38c`，再對一個**固定全域** `0x108e5510`（不是 `DAT_108e550c`、不是 Level）呼叫監聽者廣播 `0x1079a090`——該函式走鏈結串列，**每次呼叫回呼前都有 `test ecx,ecx; je skip` 的 null 檢查**。scene==5 另呼叫兩個只碰自身欄位的輔助函式（`0x107380b0` 字串格式化、`0x10715030` 欄位更新） |

## `User_Score_SN`（真身 `0x107ece60`）複核

**複核成立。** 完整反組譯 `0x107ece60`–`0x107ed15f`，出現的呼叫只有：
Log_Set／Log_Write 風格兩支、`Core.dll GetDefaultObject`（拿 `UZNetwork_DJ` 單例，
`ecx` 是固定 class 指標 `0x108e9b70`）、`Game_Score_Set`（`0x1072d0e0`）、
`Game_Score_Update`（`0x1072d1b0`）、`Game_Result_Set`（`0x1071b4b0`，純寫自身
`+0x1018/0x101c/0x1020`）、`Game_User_Reward_Set`（`0x1072da10`，純寫自身陣列
`ecx+0x1034` stride `0x80`）、一支 CRT 內部函式。

**全函式沒有出現一次 `0x108e550c`、沒有 `Level`、沒有任何透過物件解出來的 vtable 呼叫。**

## 總結論

- **`User_Score_SN` 對加入者：安全。** 整支 handler 只寫 `UZNetwork_DJ` 自己的欄位／陣列。
- **`EndGame_SN` 對加入者：安全（在我方實際會走到的分支內）。**
  已展開的深度內沒有任何對 Level／GameInfo 的未檢查解參考。

## 還沒封頂的三個斷點（刻意停在契約劃定的深度）

1. ⬜ **`Event_Call` 佇列的消費者沒找到**——真正消費 `this+0x3cc`、觸發
   `"NETWORK_GAME_END"` 對應 UnrealScript 事件的函式。`EndGame_SN` 沒有直接呼叫它。
   **這是唯一一個「理論上可能摸到 GameInfo」但完全沒查過的斷點**，要把結論推到 ✅ 得先補它。
2. ⬜ `ULevel::EndGame_BD`（`Engine.dll 0x1047aa30`）只有名字沒有內容。
   因為 `Dedi_End` 不可達，現階段無實務影響；**若之後考慮跑 dedicated server 模式就要補**。
3. ⬜ `Scene_Change` 廣播的全域監聽者清單（`0x108e5510`）裡登記了誰、
   `0x10715030` 結尾對另一全域 `0x108e8694` 的呼叫——無界 fan-out，沒有展開。

## 新解出的符號（給之後的 `tools/symbols.json`）

| dll | va | name | kind |
|---|---|---|---|
| ZNetwork.dll | `0x10716e90` | `UZNetwork_DJ::Dedi_End` | function |
| ZNetwork.dll | `0x1072e830` | `UZNetwork_DJ::Community_Chat_Clear` | function |
| ZNetwork.dll | `0x10728cc0` | `UZNetwork_DJ::Event_Call` | function |
| ZNetwork.dll | `0x10738910` | `UZNetwork_DJ::Scene_Change` | function |
| ZNetwork.dll | `0x1071b4b0` | `UZNetwork_DJ::Game_Result_Set` | function |
| ZNetwork.dll | `0x1072da10` | `UZNetwork_DJ::Game_User_Reward_Set` | function |
| ZNetwork.dll | `0x107279e0` | FArray::Empty ＋逐元素解構輔助（無具名匯出） | helper |
| ZNetwork.dll | `0x1079a090` | 全域監聽者廣播輔助（`this` 固定 `0x108e5510`） | helper |
| ZNetwork.dll | `0x107380b0` | 自身欄位字串格式化輔助（FString＋swprintf） | helper |
| ZNetwork.dll | `0x10715030` | 自身欄位更新輔助（`+0x1654..+0x1690`） | helper |
| Engine.dll | `0x1047aa30` | `ULevel::EndGame_BD`（vtable `+0xb0`，**只有名字**） | function |
| import | `0x1091b884` | `Core.dll ?GIsClient@@3HA` | import(data) |
| import | `0x1091b990` | `Core.dll ?GetDefaultObject@UClass@@QAEPAVUObject@@XZ` | import |
| import | `0x1091ba40` | `Engine.dll ?GZNetworkManager@@3PAV...@@A` | import(data) |
| import | `0x1091b8a0` | `Core.dll ?AddZeroed@FArray@@QAEHHH@Z` | import |
| import | `0x1091b8b8` | `Core.dll ?Empty@FArray@@QAEXHH@Z` | import |
| import | `0x1091bd5c` | `MSVCR71.dll swprintf` | import |
