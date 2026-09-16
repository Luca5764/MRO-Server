# 舊台帳矛盾裁決，建立 state.md

背景：舊台帳拆分後，由中階子 agent 整理出 8 條矛盾（原始清單：`docs/research/2026-09-17-ledger-migration/opcode-inventory.md` 第 2 節）。本篇由高階逐條裁決，結果已寫進 `docs/state.md`。

**依據：** 2026-09-17 重跑 `tools/dispatch-map.py`，對象是 `ZDispatchGame 0x1070139d`、`ZDispatchLobby 0x10706a7d`、`ZDispatchCommunity 0x1070871a`。輸出跟 `docs/client-dispatch-map.md` 一致。

| # | 矛盾 | 裁決 | 依據 |
|---|---|---|---|
| 2.1 | `0x00230103` 是 SN 還是 CN；`room.dispatch.js` 仍把它當 `Room_List_SN` 送出 | ✅ 是 `Respawn_CN`，不在任何客戶端 dispatcher 裡，所以伺服器送它會被忽略。真正的 `Room_List_SN` 是 `0x00220204` | [DLL] dispatch-map 重跑 |
| 2.2 | `0x00230111`／`0x00230112` 是 Lobby Enter 還是 Timeout | ✅ `Timeout_CN`／`Timeout_SN`，屬於 `ZDispatchGame`。程式碼在大廳與登入時送 `0x00230112` 等於沒送 | [DLL] 同上，加上 `journal/2026-09-16-18-scene-6-three-cn-messages.md` 的送出端 |
| 2.3 | 台帳約第 696–736 行的「完整映射」表 vs `client-dispatch-map.md` | ❌ 台帳內嵌表是錯的；`client-dispatch-map.md` 與重跑的工具輸出一致 | [DLL] 同上 |
| 2.4 | `0x0025xxxx` 是「對戰」還是 Card | ✅ 客戶端的 `0x0025xxxx` handler 全屬 `ZDispatchCard`；對戰在 `0x0022xxxx`／`0x0023xxxx`／`0x0042xxxx`。但客戶端確實會送 C→S 的 `0x00250102`，真名 ⬜ | [DLL] 存檔；[LOG] `session-20260916-215019.jsonl` |
| 2.5 | `0x00222102` 叫 `Room_Enter_SN` 還是 `Game_Ready_SN` | ✅ `Game_Ready_SN`（`ZDispatchRoom`）。`gate.game.dispatch.js` 約第 714 行標錯；在那個時機送 Game_Ready 是否恰當 ⬜ | [DLL] 存檔 |
| 2.6 | 聊天 `0x00220501`／`0x00220505` 是請求／應答，還是 SN | ✅ 客戶端沒有 `0x00220502`／`0x00220506` 的 handler，伺服器回這兩個會被忽略。🟡 推測正確做法是把同一個 `Chat_*_All_SN` 廣播回去（未測） | [DLL] `ZDispatchCommunity` 重跑 |
| 2.7 | `0x0042xxxx` 側的名稱對應 | ✅ `0x00420112` Ready_Failed_SN、`0x00420113` Ready_Host_SQ、`0x00420115` Ready_Host_SN、`0x00420116` Ready_Success_SN、`0x00420121` HostChange_SN、`0x00420133` Leave_SN。`0x00420114`／`0x00420117` 是 C→S（後者是 `Battle_Success_CN`）。`0x00230121`／`0x00230123` 是 `Assist_CN`／`Death_CN`，舊表的 Ready_Host／HostChange 說法作廢。另外，盤點表把 `0x00420115` 寫成 Ready_Success_SN、`0x00420116` 寫成 HostChange_SN，是照抄舊表的錯 | [DLL] `ZDispatchGame` 重跑 |
| 2.8 | `lobby.dispatch.js` 檔名與整段 `0x0023xxxx` | 只是名稱誤導，檔內註解已承認。記入 state.md 第 5 節，不改檔名（避免大範圍重構） | — |

**這次沒有改任何程式碼。** state.md 第 5 節列出的錯誤名稱與無效封包，要逐一單獨測試後再修：刪掉「送了等於沒送」的封包理論上無害，但仍然會改變線上的位元組，需要實測確認。

**盤點表本身的錯誤：** 除了 2.7 提到的 `0x00420115`／`0x00420116`，盤點表是中階產出，引用前要回頭核對。state.md 只採用了已經核對過的部分。
