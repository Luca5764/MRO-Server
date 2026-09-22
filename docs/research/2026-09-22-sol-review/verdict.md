# 跨公司審查結論（Sol）— 2026-09-22 批次

審查範圍依 `request.md`：第一、二級全部；第三級未審。以下只判斷現有結論是否由現有證據支持，不把本次機械覆核當成新的逆向結論。

## 1. Engine.dll 候選 1b

**結論：部分同意。候選 1b 的 bytes、控制流與 100000 A/B 結論同意 ✅；「30000 單獨讓遺失歸零」反對 ❌，發包候選應寫成 30000＋budget。**

- 原廠組語成立：`0x1047f9b0 cmp eax,0x708`、`0x1047f9b5 jge 0x1047f9be`、`0x1047f9b7 mov eax,0x708`、`0x1047f9bc jmp 0x1047f9c4`，最後於 `0x1047f9c8` 寫入 `[Connection+0x50]`。因此文件中的 `0x1047f9b1`、`0x1047f9b8` 是立即值 operand 位址，`0x1047f9b5` 是指令起點；原始 bytes 與 `design.md:55-67,163-166` 一致。
- NOP 掉 `0x1047f9b5` 後必定 fall through 到 patched `mov eax,<value>`，再由原本的 `jmp` 跳過 cap 比較。候選 1b 確實無條件把指定值寫進 `Connection+0x50`，不依賴輸入 `v`。
- host/joiner 分流的證據成立：`0x1047ecf5 cmp [NetDriver+0x3c],0`，`0x1047ecf8 je 0x1047f5d5`；`ServerConnection==0` 的 host 路徑才可達 NETSPEED 區塊。欄位身分與可達性依據見 `design.md:133-161`，本次重跑組語與其一致。
- 100000 A/B 是交錯執行，逐輪記錄房主 DLL hash；自動化 A 16/71、B 0/49，人手 A′ 24/34、B′ 34/34。證據見 `journal/2026-09-22-1245-round2-result.md:8-37` 與 `research/2026-09-21-netspeed-host-patch/round2-run-tally.txt:1-12`。沒有找到第二個有意改動的變數；已揭露的副本、機身與樣本數偏離見該日誌 `:87-105`。所以「100000 在這個 2 人同機 PvE 條件下消除已量到的缺口」成立。
- 30000 的慢速自動化只有 36/36，且三輪都中途被打斷；原結論本來也明列「人手連按未測」 (`journal/2026-09-22-1345-netspeed-min.md:32-67`)。後續人手輪已測得 33/35，缺 2 發（5.7%），所以同檔 `:71-74` 的無條件「遺失歸零」已被後證推翻。原始計數可在 `research/2026-09-22-netspeed-budget/manual-30000-run-190747.55.log` 重算為 HitLoc 35、`MTE_a Fire` 33。
- 同一操作者、同晚、同條件加 budget 後為 34/34；見 `threshold-tally.txt:44-63` 與 `manual-30000-budget-run-192214.53.log`。因此現有發包選擇應是 **30000＋budget**，但此人手比較各只有一輪，結論範圍限目前的 2 人同機 PvE 條件。
- 我用 stock `Engine.dll` 在記憶體中重套 `patch_netspeed_host.py --value 30000 --budget` 的六處修改，重算 sha256 為 `f4b253a3606243a0aa41101b812a1bec9dca79ab3de91818c024e458f14b4970`，與 `tools/client-kit/setup-client.ps1:61-65` 相同。

## 2. budget patch（Moon 外部來源，我方核對）

**結論：靜態機制同意 ✅；實驗歸因維持 🟡，尚不足以把「budget 一般性消除遺失」標成已確認。**

- `0x1042e1ee` 起的原始程式先算 `D=DeltaTime*CurrentNetSpeed`，再做 `QueuedBytes -= D`，並把下限夾到 `-2D`。比較與兩個寫入點的逐指令解讀和 `high-tier-review.md:5-30` 一致。
- cave 重現被覆蓋的 `fadd st(0),st(0)` 與 `mov ecx,[esi+0x14c]`，中間加入 `CurrentNetSpeed >> 2`，經 x87 `fild/faddp` 後返回 `0x1042e200`；`0x1042e202 fchs` 後結果是 `-(2D + floor(CurrentNetSpeed/4))`。本案測試值都可被 4 整除，等同文件寫的算式。跳轉算術與 bytes 見 `high-tier-review.md:37-58`。
- `[ebp-0x1c]` 的借用安全：cave 讀完暫存值才返回，而原碼緊接著在 `0x1042e204` 覆寫該 slot，再於 `0x1042e207` 讀取；沒有 live range 重疊。
- 函式身分可以定案：Engine.dll 匯出表直接把 `0x1042dda0` 命名為 `?Tick@UNetConnection@@UAEXXZ`，目標區間位於同一函式且中間無 `ret`。因此 `high-tier-review.md:32-35` 的函式身分 ⬜ 可解除，這就是 `UNetConnection::Tick`。
- 15000 交錯 A/B 的原始 log 重新計數吻合：A1–A3 為 4/37，B1–B3 為 0/36；A4 後為 A 8/53、B 0/36（`threshold-tally.txt:21-38,69-78`）。六輪的唯一有意變數是 budget 三處修改，方向乾淨。
- 統計敘述需更正：A1–A3 vs B1–B3 的 Fisher two-sided `p≈0.115`（文件四捨五入為 0.12）正確；加入 A4 後 8/53 vs 0/36 的 two-sided `p≈0.0192`，所以 `threshold-tally.txt:78` 所稱「統計強度未再加強」不正確。這仍只有三個 B 輪，且 A4 是看過結果後單邊追加；配合 30000 人手輪的一對小樣本，適合維持 🟡，不宜升成一般性 ✅。
- 「code cave 未使客戶端起不來或在這幾場崩潰」有 15000＋budget 三場、30000＋budget 自動化一場及人手一場支持；「長時間、跨網、多人、所有場景均安全」沒有證據。

## 3. 加入者收戰鬥封包的安全性

**結論：同意 ✅，限 `state.md:161-165` 已寫明的 client 行程與已查分支；保留 `Event_Call` 消費者的 ⬜。**

- `Death_SN`：`Game_Host_Check` 真身 `0x1071a560` 是 `return *(this+0xfac)&1`；`Game_Action_Death` 在 `0x1072e208` 先測同一 bit，false 就跳過 GameInfo 段。host gate 前的 client HUD 路徑逐層有 null check，最後呼叫 `eventTreatKillMSG_UJ`。與 `verify-b-death-sn.md:61-132` 一致。
- live 佐證成立且可定位：`logs/session-20260919-200917.jsonl` 對 conn 2、4 各送 945 次 `0x00230124`；同場還對兩端送了 EndRound、User_Score、EndGame。PvP 首輪則在 `logs/session-20260922-222051.jsonl:404-406` 收 attacker 5/victim 6 並對兩條連線送 `Death_SN`；`research/2026-09-22-d2-tdm/pvp2p-after-kill-joiner.png` 顯示加入者仍存活且個人分數為 `P 0010`。
- `EndRound_SN`：`Game_End_Round 0x1072e310` 的 vtable `+0xb4` 確實落到匯出 `ULevel::EndRound_BD 0x1047ab70`。該函式在 `0x1047ab94-0x1047ab96` 對 `LevelInfo+0x630` 的 GameInfo 做顯式 null check；第二個 `+0x648` 物件也在 `0x1047abbe-0x1047abc0` 另做 null check。核心「不會對 null GameInfo 呼叫」成立；`+0x648` 的精確欄位名仍是 🟡，不要順便標成已確認 GRI。
- `User_Score_SN`：`0x107ece60-0x107ed15d` 全函式沒有 `0x108e550c`、Level 或由 Level 解出的 vtable call，結論與 `verify-d-endgame.md:27-40` 一致。
- `EndGame_SN`：`0x107d806a` 依 `GIsClient` 分支；我方有畫面的 host/joiner 走 `Game_End_Battle`、`Community_Chat_Clear`、`Event_Call`、`Scene_Change(5)`。`Dedi_End 0x10716e90` 在 `0x10716e98` 對 `GIsClient!=0` 早返回，Level vtable 路徑不可達。已展開的 callee 與 `verify-d-endgame.md:18-42` 一致。
- 限制不能刪：`Event_Call` 只把 `NETWORK_GAME_END` 放進 `this+0x3cc`，消費者尚未找到（`verify-d-endgame.md:44-52`）。現有完整 PvE 實跑沒有反例，足以支持目前路徑的實務安全性；不等於已窮盡所有延後回呼。

## 4. 勝負由伺服器判定（D2 P1）

**結論：同意 ✅；P2 維持 ⬜ 恰當。**

- `ZBase/DefaultGameInfo.uc:395-405` 的正式模式 `EndGame()` 只有 `Reason ~= "TimeLimit"` 時呼叫 `Game_Timeout()`；`teamscorelimit` 不做任何事。
- plain TDM 的本地偵測鏈仍活著：`ZGame/ZTeamDM.uc:935-960` → `ZGame/ZDeathMatch.uc:284-285` → `ZGame/ZTeamDM.uc:880-895`，達標後呼叫 `EndGame(...,"teamscorelimit")`，但終點被上述 override 吃掉。
- Blow 的偵測確實被註解：`ZModeBlow/BlowMission.uc:93-117,187-206`；其 `ScoreKill` 也沒有呼叫 `Super.ScoreKill`。所以 `verify-p1p2.md:43-61` 將「偵測被移除」與「偵測仍活但終點空殼」分成兩層是正確的。
- 小修正文句：`verify-p1p2.md:28-29` 說 Engine 原版 `EndGame()` 會 `GotoState('MatchOver')`，但現存 `Engine/GameInfo.uc:2002-2014` 是 `CheckEndGame`、設 `bGameEnded`、觸發事件與結束 logging，沒有該 `GotoState`。這不影響 DefaultGameInfo override 把正式結束流程取代掉的主結論。
- P2 只有可能的 None 存取，沒有 Moon 所述勝方矛盾 GPF 的堆疊或 dump；`verify-p1p2.md:73-94` 保持未知是正確處置。

## 5. TDM 設計稿 v2

**結論：降為 🟡。§5 的來源取捨成立，T1→T2→T3→T4 的大方向合理；§7 尚有四個必須先收斂的矛盾。**

- §5 同意：`Death_SN` 的 host-only GameInfo 段不代表加入者不能收整包；DLL gate、M2 945 次與本次 PvP live 結果互相吻合。這裡採我方 P5、拒絕 Moon B11 的 blanket rule 是正確的（`d2-pvp-tdm.md:94-107`）。
- **自殺計分規則與客戶端原始碼相反。** §7 T2 寫「同隊（含自殺）不計分」 (`d2-pvp-tdm.md:127-129`)；但原廠 `ZTeamDM.ScoreKill` 在 `ZGame/ZTeamDM.uc:943-950` 明確把自殺記給另一隊 `Teams[(Other.GetTeamNum()+1)%2]`。若伺服器忽略，client 內部 Team.Score 與伺服器勝負可能分歧。需決定跟隨客戶端，或提出實測證據證明這段在目前網路路徑不生效。
- **T3 的封包順序文字矛盾。** §3 明定 `User_Score_SN` 先、`EndGame_SN` 後 (`d2-pvp-tdm.md:62-67`)，現行 PvE log 也如此；§7 T3 卻寫「送 EndGame_SN＋User_Score_SN」 (`:129`)。實作契約應逐字改成先 User_Score、後 EndGame，避免執行者照表反送。
- **T4 的目標來源未收斂。** §4.1 說房設定真值是 `MapKill` (`:118-121`)；§7 T4 只寫 `Game_Info_SN +0x16` (`:130`)；U1 又要求 `+0x15/+0x16/+0x18` 三欄同填 (`:144`)。這三句可能描述不同層，但目前沒有一條單一、可執行的資料流。需明定「room MapKill → 哪些 Game_Info 欄位」，並保證結束判斷讀同一來源。
- **即時隊伍分數同步缺步驟。** PvP live 已顯示 `Death_SN` 讓個人 `P 0010` 更新，但隊伍總分仍 `000`（`journal/2026-09-22-2230-pvp-2p-first.md:14-34`）。T2 目前只要求 server log，T3 到時間到才送結束包；若設計目標包含比賽中計分顯示，應在 T2/T3 間新增經 DLL 核對的同步包與驗收，不應只留在 U3 的舊問題描述。
- §3.1 的冪等 guard 應保留，但理由需更正：客戶端 `Timeout_CN 0x00230111` 在 `0x107db0c0` 有 `Game_Host_Check` 與 `Game_Play_Check` gate，現有 12,472 筆也全來自 playing host（`timeout-opcode-conflict.md:27-34,65-87`）。「加入者的計時器也可能送」目前沒有證據。冪等仍可防重送、延遲 Death_CN 與 timeout/goal 同時完成。

在上述四點修正前，不建議把設計稿整體標成已確認或直接照 §7 往下實作 T2–T4。

## 證據重用、存在性與本批未審範圍

- `logs/session-20260919-200917.jsonl` 同時被 packet safety 與 TDM §5 引用；它是一份共同證據，不是兩份獨立佐證。
- 30000 自動化 36/36 同時被 NETSPEED-MIN 與 budget 閾值分析引用；同樣只能算一組資料。
- `request.md` 點名的文件全部存在。round2、NETSPEED-MIN 與 15000 A/B 的原始 `run-*.log` 目前也存在安裝目錄，但除兩份 30000 人手 log 外沒有收進 `docs/research/`；日後清理客戶端後將只剩 tally，不是可攜的完整原始證據。
- `tools/client-kit/setup-client.ps1` 目前引用並要求同目錄的 `Engine.dll`，但 workspace 內沒有 `tools/client-kit/Engine.dll`。hash 與產生方式可重現，但正式發包前仍需確認實際包內有該檔，且 hash 為上述 `f4b253a3…`。
- 第三級（`state.md` 131、149、167、173 與 P3/E1 設計）本批未審，留待下一批。
