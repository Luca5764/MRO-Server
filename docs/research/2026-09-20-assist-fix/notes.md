# Assist_SN 0x00230122 位元組方案（ASSIST-FIX 第 1 步，2026-09-20）

verifier 這次重新反組譯得到，不是抄舊 journal。匯出 thunk：`0x1070a425 → 0x107d5fa0`（Assist_SN handler）、`0x107060eb → 0x107d9c60`（Assist_CN sender）。body 偏移＝`[esi+X] - 0x10`。

## 1. Assist_SN handler 的讀取地圖（`0x107d5fa0`）

| body | 寬度 | 指令 | 成功路徑才讀？ | 用途 |
|---|---|---|---|---|
| 0x00 | u16 | `0x107d6134` | 閘門 | 非 0 就整段跳過 |
| 0x02 | u32 | `0x107d6112`／`0x107d613b` | 閘門 | 非 0 就整段跳過 |
| 0x06–0x09 | — | 全函式沒有指令讀它 | — | 未使用 |
| 0x0A | u16 | `0x107d5fe3` | 否 | 第 1 次 `Game_User_Assist_Set` 的搜尋鍵 |
| 0x0C | u16 | `0x107d5fdb` | 否 | 第 2 次呼叫的搜尋鍵 |
| 0x0E | u8 | `0x107d5feb` | 否 | 經跳表 `0x107d6184`／`0x107d61f8` 解碼，只進 log |
| 0x0F | u8 | `0x107d60e9` | 否 | 只進 log |
| 0x10 | u8 | `0x107d5fdf` | 否 | 只進 log |
| 0x11 | u16 | `0x107d6146` | **是** | 第 1 次呼叫的 Exp |
| 0x13 | i16 (movsx) | `0x107d6142` | **是** | 第 1 次呼叫的 Point |
| 0x15 | u16 | `0x107d614a` | **是** | 第 2 次呼叫的 Exp |
| 0x17 | i16 (movsx) | `0x107d614e` | **是** | 第 2 次呼叫的 Point |

`Game_User_Assist_Set`（`0x1072d860`）：線性掃 `[this+0x1034]`（count `[this+0x1038]`、stride 0x80）找 dword-0 == 鍵的列。找不到就整段跳過；找到就 `+0x4c` 累加（mode==9 時 Exp×5）、`+0x54` 累加 Exp、`+0x5c` 累加 Point。不論有沒有找到，`[this+0x1030] |= 1`（分數髒旗標）都會跑——現在的 fallback 也已經會跑，不是新副作用。

## 2. Assist_CN 的 7 bytes（`0x107d9c60`，並對照實際封包）
0x00 u16 AssistUserIndex、0x02 u16 UserIndex、0x04 u8 AssistType、0x05 u8 Action、0x06 u8 HP。
[LOG] `session-20260919-200917.jsonl`：ms 335944 `00000300040150`、338922 `0000030004013c`、349954 `00000300040114`（同兩人，HP 80→60→20）、337630 `00000100040150`。

## 3. 提案的回覆（25 bytes body，尚未實作）
| body | 寬度 | 值 | 來源 |
|---|---|---|---|
| 0x00 | u16 | 0 | 常數，成功路徑的閘門 |
| 0x02 | u32 | 0 | 常數，深層讀取的閘門 |
| 0x06 | 4B | 0 | 確認未被讀取 |
| 0x0A | u16 | 回抄 CN 的 AssistUserIndex | 同欄位同寬度 |
| 0x0C | u16 | 回抄 CN 的 UserIndex | 同上 |
| 0x0E | u8 | 回抄 AssistType | 兩個方向同一組編碼 |
| 0x0F | u8 | 回抄 Action | 只進 log |
| 0x10 | u8 | 回抄 HP | 只進 log |
| 0x11／0x13／0x15／0x17 | u16／i16／u16／i16 | 0 | **沒有已知的 Exp／Point 公式，不要瞎編** |

## 4. 風險（最重要）
現在的 fallback 送 AssistUserIndex=UserIndex=0，索引 0 幾乎不會對到真實玩家列，所以 `Game_User_Assist_Set` 永遠走「找不到」分支，**越界讀到的垃圾目前不會被套用**。
→ **如果只修索引回抄（0x0A–0x0D）而沒有同時把 body 加長，垃圾就會變成真的被加到某個玩家的 Exp／Point 上。索引與長度必須一起改，不可以拆成兩個 commit**（AGENTS 工作原則 7 的反例）。

## 5. 可見效果
⬜ 仍然未知：除了 `Game_User_Assist_Set` 這個累加表之外，找不到 HUD 的對應。修完只能驗「不再越界、沒有壞掉」，驗不了「修對了」。

## PM 核對後的附註（2026-09-20，不擋實作）
- `[esi+0xfcc]==9` 時 Assist 欄位乘 5（`0x1072d89b` 比較、`0x1072d8a6 lea edx,[ecx+ecx*4]`）。0xfcc 疑似遊戲模式或地圖模式欄位（9＝PvE／戰役？）⬜。做 P3 的 exp 公式時可能用得上。
- `+0x4c`／`+0x54`／`+0x5c` 三個累加欄位由誰讀（結算頁？Tab 計分板？）⬜。修正前後各跑一場同樣的單人 PvE，比對結算頁與計分板，如果哪個數字從 0 變非 0，就知道它餵到哪裡。
- 關卡結論：累加成立（`0x1072d8b0`、`0x1072d8ba–c4`、`0x1072d8d4`；`shl edi,7` 即 stride 0x80，與 Game_User_Add 同表），送 0 安全，放行實作。Sol 審查與 P3 第 3 步一起送，兩邊都過才上線。

## 修正前的基準（2026-09-20，runner 自動跑單人 PvE）
[SHOT] `shots/assist-base-res-2.png`：結算畫面 TOTAL POINT `00000`、ROUND BONUS `0000`、TOTAL SCORE `00000`、RANK S、獲得 0 G 幣，下方戰績列 0戰 0勝 0平 0敗。
→ 修正後再跑同樣一場，這些數字不該變（PM 訂的可觀察項）。若有任何數字變成非 0，就知道 `+0x4c`／`+0x54`／`+0x5c` 餵到結算頁。
