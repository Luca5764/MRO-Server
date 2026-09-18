# R-ROUND 分析（中階 explorer，高階抽驗；🟡 未經跨公司審查）

## Campaign_CN 0x00230139 不帶回合數（高階抽驗 ✅ [DLL]）

`ZDispatchGame::Campaign_CN`（thunk `0x10704bd8` → `0x107dab70`）：
```
0x107dac1e  dec eax                                ; ActionType-1
0x107dac1f  mov cl, 1
0x107dac21  mov dword [0x10904f3c], 0x230139       ; opcode
0x107dac2b  mov word  [0x10904f36], 0x13            ; 長度
0x107dac34  mov byte  [0x10904f40], cl              ; body[0] = 1（常數）
0x107dac3a  mov byte  [0x10904f42], 2               ; body[2] 預設 2
0x107dac41  jne 0x107dac49
0x107dac43  mov byte  [0x10904f42], cl              ; ActionType==1 → body[2] = 1
```
body＝`01 00 01`（達標）或 `01 00 02`。**沒有回合數。** backlog 原本「body[0..1] 可能是目前回合數」的假設不成立。中間回合（`ZModePve.uc:1155-1160`）與最後一回合（`:1127-1129` → `EndGame_SH` → `Game_Campaign`）送出的封包完全一樣 → **伺服器必須自己記錄目前回合**，拿來跟 MapInfo.Round（5／8／10）比較。

## 候選的「回合結束」SN

- `EndRound_SN 0x00222211`（thunk `0x10701794` → `0x107d7a50`）、`EndQuater_SN 0x00222212`（`0x10702793` → `0x107d7c90`）、`EndGame_SN 0x00222213`（`0x1070a182` → `0x107d7ed0`）、`Campaign_SN 0x0023013a`（`0x10709e7b` → `0x107d7040`）都在 `ZDispatchGame::Dispatch`（`0x1070139d`）裡，只有場景 6 才生效。
- EndRound／EndQuater 的結構幾乎一樣，EndGame 多呼叫了 5 個 helper（包括 `Scene_Change 0x1070148d`）。依複雜度 Round < Quater < Game 推測語意 🟡。
- ⬜ **最大缺口：** 沒有在組語上證明 EndRound_SN 會觸發腳本的 `EndRound_BD`（`ZModePve.uc:716-722`）。handler 裡看得到的 helper 都在改 `UZNetwork_DJ` 的 +0xfe8..+0x1020（跟 `Game_Play_Start` 同一塊），DLL 裡也找不到 `NETWORK_GAME_END_ROUND` 這類字串。
- EndRound_SN 的 body 🟡：從 frame+0x10 開始 16 bytes 一組，寬度 u16/u16/u16/u8/u8/u16/u16/u32（`0x107d7a91` 起），似乎有兩組（team A／B），沒有實測過。

## 其他

- [SRC] `CurrentRound` 在 native 的 `PveRoundManager.StartNextRound` 裡遞增，腳本看不到。
- [LOG] `session-20260918-205012.jsonl` 的 4 次 Campaign_CN 是**操作者手動重打 4 場**（每次 EndGame 後隔 420–561 秒才重新開戰，出戰機體也不同），不是同一場清了好幾回合。A6b 黃金樣本「三輪通關」要理解成「三次獨立嘗試」。

## 單變數實驗（PVE_ROUND_ADVANCE_MODE，預設關閉）

伺服器記錄每一場的目前回合（初值 1）。收到 Campaign_CN body[2]==1 時回合 +1：還沒超過 MapInfo.Round → 回 EndRound_SN（先用最小長度，body 格式 🟡）；已經到了 → 維持回 EndGame_SN。body[2]==2 的失敗路徑不動。用初級（5 回合）實測，看第二個 `BeginRound_CN 0x00230151` 有沒有出現；如果客戶端卡住或沒反應，代表上面的缺口猜錯了。
