# 回覆 Moon 的四個未解問題（2026-09-21，explorer 中階調查）

**狀態說明**：本檔由中階 explorer 產出，**待高階審查**，尚未進 `docs/state.md`。
證據標籤依 `AGENTS.md`：`[DLL]` 附完整位址、`[CACHE]`／`[LOG]` 附檔名與行號。
所有 DLL 位址讀自實機 `/mnt/c/Games/MetalRage Online/data/System/ZNetwork.dll`
（ImageBase `0x10700000`），組語與原始位元組都用 `tools/disasm.py` 與直接讀檔核對過，
不是只看 Ghidra decompile。UnrealScript 引用自 `~/mro-decrypted/src/`。

---

## 1. `Special` 的 8 個 code 各是什麼意思、哪個模式會送？

**已答（部分修正 Moon 的描述）。**

原生宣告的完整韓文註解 [DLL 鄰接來源：UnrealScript 反編譯]：

`~/mro-decrypted/src/ZNetwork/ZNetwork_DJ.uc:1891`
```
native static function Game_Special( int UserIndex, int ActionType );
// 병과 ( ActionType - 1:건물건설, 2:건물파괴, 3:지뢰제거, 4:EMP,
//        5:타켓팅걸린상태에서 죽음, 6:스카우트제거, 7:터렛제거, 8:타겟팅, 9:쉴드설치 )
```

翻譯（ActionType 1–9，**是 9 個不是 8 個**）：

| ActionType | 韓文 | 英文/中文意思 |
|---|---|---|
| 1 | 건물건설 | 建造完成（build complete） |
| 2 | 건물파괴 | 建築被摧毀（building destroyed） |
| 3 | 지뢰제거 | 地雷被清除（mine removed） |
| 4 | EMP | EMP |
| 5 | 타켓팅걸린상태에서 죽음 | 被鎖定狀態下死亡（died while locked-on） |
| 6 | 스카우트제거 | 偵察兵（探測機）被摧毀（scout/probe removed） |
| 7 | 터렛제거 | 砲塔被摧毀（turret removed） |
| 8 | 타겟팅 | 鎖定中（targeting/lock-on in progress） |
| 9 | 쉴드설치 | 護盾建造完成（shield installed） |

**呼叫端範圍檢查（`[DLL] 0x107da0e2-0x107da0ee`）：builder 只接受 `ActionType` 落在 `[1,9]`**
（`cmp edi,1 / jl 錯誤路徑`, `cmp edi,9 / jg 錯誤路徑`），超出範圍會走錯誤 log 路徑、不送封包。
Moon 說「8-way jump table」在**組語形狀上是對的**——但那是第二層轉換，不是 ActionType 本身：

**重大修正／新發現：wire 上的 body 第 3 個 byte 不是 ActionType 原始值，是經過一個轉換表映射過的值。**
[DLL] builder 在 `0x107da0fc-0x107da13f`：
```
eax = ActionType - 1
if (eax > 7) 走 default（對應 ActionType 9）
else 走 8-way jump table @ 0x107da1b4（eax*4 索引）
```
用 `tools/disasm.py` 讀出的原始 byte（已用 python 直接讀 DLL bytes 二次核對，不是只信 disasm 文字）：

| ActionType | wire byte (body+0x02) | 對應意思 |
|---|---|---|
| 1 | `0x3e` | 建造完成 |
| 2 | `0x5d` | 建築被摧毀 |
| 3 | `0x51` | 地雷清除 |
| 4 | `0x54` | EMP |
| 5 | `0x53` | 鎖定中死亡 |
| 6 | `0x5c` | 探測機被摧毀 |
| 7 | `0x5b` | 砲塔被摧毀 |
| 8 | `0x52` | 鎖定中 |
| 9（default，未進 jump table） | `0x3d` | 護盾建造完成 |

Body layout（`[DLL]` 同一個 builder function，入口約 `0x107da093`，配合初始化函式 `0x107d8810`
把靜態封包模板清零、寫入 opcode `0x230125` 於 buffer+0xc、長度 `0x13`(=19=16+3) 於 buffer+0x6）：
```
+0x00 u16 UserIndex   (word ptr [esi+0x10] = bx)
+0x02 u8  wire-code    (byte ptr [esi+0x12], 上表數值)
```
跟 Moon 寫的 `[u16 UserIndex][u8 code]` 形狀一致，**但 code 欄位的實際數值需要用上表反查回 ActionType，
不能直接當 1–9 讀**。這點原文檔沒寫，我們自己一開始也差點誤讀（見下方 §5 的 log 分析）。

**哪個模式會送**：目前**沒有找到任何 mode-specific 的呼叫者**（沒有 `ZModeXxx` 直接呼叫）。
所有呼叫端都在**共用的武器／載具基底類別**：
- `ZBaseWeapon/BaseTurret.uc:257,272`、`ZIntelligenceObject/MoveObject.uc:272,287`、
  `ZModePve/AI_Dynamic_TurretILT.uc:111,116` → ActionType 7（砲塔被摧毀）
- `ZBase/ObservationProbe.uc:421` → ActionType 6（探測機被摧毀）
- `ZBase/DefaultMech.uc:3623` → ActionType 4（EMP）；`:3633` → ActionType 5（鎖定死亡）
- `ZBase/PawnSecond.uc:174` → ActionType 8（鎖定中）
- `ZModeTutorial/ZTutorialMine.uc:196` → ActionType 3（地雷清除，教學模式）
- `ZBase/W_DefaultMechForWeapon.uc:930-936`（`ServerTreatPoint_UJ`，函式註解「건설팔과 같은 무기의
  포인트를 처리하기 위한 함수」＝處理建設臂類武器的「點」）→ 呼叫端 `ZBaseWeapon/BaseInstant_Construct_Fire.uc:86`
  傳 `1`（建造完成）、`:124` 傳 `9`（護盾裝設完成）、`ZBaseWeapon/BaseGun_Construct_Weapon.uc:165` 傳 `9`。

**沒找到 ActionType=2（建築被摧毀）的呼叫端**——原生註解裡有這個值，但反編譯出來的 src 樹裡沒人呼叫它
（可能觸發點在我們沒有解密原始碼的建築物件類別，例如 `AniBuildObject` 本體，我們只找到它的觸發器
`ZBaseObject/AniBuildObjectTrigger.uc`，裡面沒有呼叫）。**⬜ 未知，缺原始碼佐證。**

**結論**：這些都是**工兵（建設兵種）與載具的通用戰鬥事件**，不是某個模式專屬的「目標」封包——
只要地圖上有砲塔／地雷／探測機／建設兵武器就可能觸發，PvE（`ZModePve`）與教學模式明確用到，
理論上 PvP 圖只要有這些物件／兵種一樣會觸發，我們沒證據排除 PvP。

---

## 2. `Boss`／`TwoBoss` 的 action 1／2 各代表什麼？

**Boss：已答，且有實際呼叫端上下文（含原始碼自己標註的「臨時代碼」瑕疵）。**
**TwoBoss：已答字面意思（原生註解），但沒有找到任何呼叫端**（原始碼樹裡沒有 TwoBoss 模式的腳本）。

原生宣告 [DLL 鄰接來源]：
```
Game_Boss( UserIndex, TargetIndex, ActionType )
  // 보스미션 - 결과 ( ActionType - 1:보스가 목표지점에 도착, 2:보스 죽음 )
  // = Boss 任務結果：1 = 頭目抵達目標地點（護送成功）、2 = 頭目死亡

Game_TwoBoss( UserIndex, TargetIndex, ActionType )
  // 2보스미션 - 결과 ( ActionType - 1:레드보스 죽음, 2:블루보스 죽음 )
  // = TwoBoss 任務結果：1 = 紅方頭目死亡、2 = 藍方頭目死亡
```
（`ZNetwork/ZNetwork_DJ.uc:1896`、`:1900`）

Boss 實際呼叫端 `~/mro-decrypted/src/ZModeBot/BossMission.uc:340-366`：
```
event ActorEventTrigger_MH(...):
    // inEventIndex >= 99 時（關卡 Kismet 觸發事件）
    Game_Boss( 0, 0, 1 )   // 頭目抵達目標點（護送成功）

function NotifyKilled(...):
    // 被殺的 Pawn 是 MRBossMech（頭目機體）時
    if (KilledPawn.GetTeamNum()==0)
        Game_Boss( 0, 0, 2 )   // 頭目死亡
    else
        Game_Boss( 0, 0, 1 )   // 「臨時代碼，之後要重新定義」——原始碼自己的註解：
                                 // "임시 코드 삽입 추후에 제정의 필요"
```
**注意**：原始開發者自己在程式裡留了「臨時代碼、之後要重新定義」的註解，
`else` 分支把非 0 隊的頭目死亡也送成 action 1（抵達），**這是原廠自己承認的未完工邏輯，
不是我們的推測**。UserIndex/TargetIndex 全部傳 0，跟 Moon 文件裡「no UserIndex, so nobody can be
credited」的觀察一致。

TwoBoss：**沒有找到任何呼叫端**——`~/mro-decrypted/src` 裡沒有 TwoBoss 模式的腳本檔案
（搜尋 `TwoBoss|MRTwoBoss|Boss2|2Boss` 只命中 `ZNetwork_DJ.uc` 本身的宣告）。所以「1=紅方頭目死亡、
2=藍方頭目死亡」是**從原生註解直接讀出來的（可信），但沒有實際使用場景可以交叉驗證**。

---

## 3. `TriggerTouch` 是哪個模式在用？

**已答（來自原生註解），但一樣沒有呼叫端可交叉驗證。**

```
Game_TriggerTouch( UserIndex, TargetIndex )
  // 2보스미션 - 포인트점령
  // = TwoBoss 任務 - 據點占領
```
（`ZNetwork/ZNetwork_DJ.uc:1897`，緊接在 `Game_Boss` 之後、`Game_TwoBoss_Damage` 之前，
上下文明顯屬於同一組 TwoBoss 任務函式）

也就是說：**`TriggerTouch` 是 TwoBoss 模式專用的「據點占領」封包，形狀類似 Conquest/Occupation
的據點事件**，這跟 Moon 文件 4.4 節「SN 跟 Conquest 同形狀（0x39、records +0x0D/+0x1B、
`Game_Info_Area_Set`）」的觀察吻合，可以互相印證。同樣因為 TwoBoss 模式原始碼沒被解密／沒找到，
**送出時機、TargetIndex 的實際含義沒有呼叫端可以核對，是 ⬜ 部分已答**。

---

## 4. Rage 模式用哪個封包？

**部分已答，傾向「不存在」，但無法完全排除。**

檢查了 Rage 模式的全部腳本（`~/mro-decrypted/src/ZModeRage/`：`RageMission.uc`、
`RMPlayerController.uc`、`RMQuest_KillEnemy.uc`、`RMReplicationInfo.uc`、`RMScoreBoard.uc`、
`RMHud.uc`），**沒有任何一個檔案呼叫 `Game_Special`／`Game_Capture`／`Game_Boss`／`Game_TwoBoss`／
`Game_TriggerTouch`／`Game_Conquest`／`Game_Blow` 等任何「目標類」CN builder**。它們只呼叫
`Game_Info_Get`／`Game_UserList_Get`／`Game_Find_User`／`Game_Team_Check`／`Game_Result_Get`
這些**唯讀**的狀態查詢函式。

`RMQuest_KillEnemy.uc`（Rage 的擊殺任務邏輯）整段是**純客戶端本地計算**：
讀 `Game_UserList_Get()` 算隊伍人數決定 `m_MaxCount`（任務目標擊殺數），
`CheckTarget()` 純粹靠本地計數 `m_CurrentCount++`，完全沒有對外發送任何封包。

**結論（🟡 傾向性推論，非結案）**：Rage 模式本身的腳本沒有專屬的目標類 CN——它大概率只靠
標準的 `Death_CN`／擊殺記錄驅動計分，任務進度是純本地端算的，不特別回報伺服器。
**但不能排除**：Rage 對戰裡如果玩家用了建設兵種／地雷／EMP／鎖定類武器，仍然可能觸發
上面 §1 的 `Special_CN`（那些是共用武器基底類別，不挑模式）。所以「Rage 不送任何目標類封包」
和「Rage 沒有專屬目標封包，但共用機制仍可能觸發 Special」是兩個不同的結論，我們只能確認後者。

這**部分推翻**（不是完全推翻）Moon 文件 4.6 節「Rage is a candidate」的猜測：至少
Rage 模式的任務系統本身不送 Special，如果 Special 真的出現在 Rage 對戰裡，來源會是共用武器機制，
不是 Rage 專屬邏輯。**目前 202 份 log 裡沒有任何一場 Rage 對戰**，所以這條在我們手上完全沒有
實測資料可以核對，純粹是讀原始碼的推論。

---

## 5. `Special_CN 0x00230125` 在我們 202 份 session log 裡的實際出現紀錄

**先更正任務描述的數字**：`grep -l` 找到 **7 個 session 檔案**含有這個 opcode，但**實際封包出現
次數是 10 次**（其中兩個檔案各自出現了 2 次和 3 次獨立事件，不是重複計算同一封包——
每個 session log 對同一個封包會有一條 `pkt`(recv) 記錄 + 一條 `fallback` 記錄，這兩條算同一次
封包事件，已經去重）。以下 10 筆全部整理，時間、UserIndex、wire byte 都用上面 §1 的轉換表反查
出 ActionType。

**全部 10 筆的遊戲情境完全一致**：`mapId: 5`、`gameMode: 0`、`campaignStarted: true`、
`isTrueCampaign: true` —— **全部是 Campaign（劇情戰役）模式，同一張地圖 `mapId=5`**，
不是泛稱的「PvE」bot 模式（`ZModeBot`／`ZModePve`），而是 Campaign 專屬玩法。
**⬜ 沒有查 `mapId=5` 對應的實際地圖名稱**（Cache.Bin 或地圖表未查，時間關係沒做）。

| # | session 檔案 | log 行號 | 時間 (UTC) | UserIndex | body hex | wire byte | ActionType（反查） | 意思 | 前後文摘要 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `session-20260917-211810.jsonl` | 165 | 2026-09-17T13:21:47.914Z | 1 | `010052` | `0x52` | 8 | 鎖定中 | 前：`ChangeSlot_CN/SN`(230101/102)、`Respawn_CN/SN`(230103/104)，之後只有 10s 心跳(020083/084)，無聊天 marker |
| 2 | `session-20260917-221628.jsonl` | 139 | 2026-09-17T14:18:26.460Z | 1 | `01003d` | `0x3d` | 9 | 護盾裝設完成 | 前 16s 有一則遊戲內聊天(0x00220507)，之後心跳，20s 後才有下一個 `Death_CN` |
| 3 | `session-20260919-211100.jsonl` | 635 | 2026-09-19T13:17:22.230Z | 3 | `03005b` | `0x5b` | 7 | 砲塔被摧毀 | 前 2s 內連續兩筆 `Death_CN`(230123，body 顯示帳號記錄同一個)，緊接著這筆 Special |
| 4a | `session-20260919-184235.jsonl` | 7567 | 2026-09-19T11:37:09.097Z | 4 | `040052` | `0x52` | 8 | 鎖定中 | 前面是連續心跳(020083/084)，無聊天/marker |
| 4b | `session-20260919-184235.jsonl` | 7570 | 2026-09-19T11:37:12.021Z | 4 | `040052` | `0x52` | 8 | 鎖定中 | 與 #4a 同一個 UserIndex，僅間隔 2.9 秒，同一波鎖定事件的重複觸發 |
| 5 | `session-20260919-200917.jsonl` | 2661 | 2026-09-19T12:29:30.746Z | 3 | `03003d` | `0x3d` | 9 | 護盾裝設完成 | 前 2–8s 內有 `Death_CN`(accountId 1、accountId 3 各一筆) |
| 6a | `session-20260920-152820.jsonl` | 13750 | 2026-09-20T10:43:17.579Z | 3 | `03005b` | `0x5b` | 7 | 砲塔被摧毀 | 前面是 `Timeout_CN` 心跳(230111，unhandled，戰鬥中每秒一次) |
| 6b | `session-20260920-152820.jsonl` | 14041 | 2026-09-20T10:45:05.740Z | 3 | `03003d` | `0x3d` | 9 | 護盾裝設完成 | 與 6a 同一個 session，間隔 108 秒；前面同樣是 `Timeout_CN` 心跳 |
| 6c | `session-20260920-152820.jsonl` | 14152 | 2026-09-20T10:45:43.030Z | 3 | `03003d` | `0x3d` | 9 | 護盾裝設完成 | 與 6b 間隔 38 秒；前 3s 有一筆 `Assist_CN`(230121) |
| 7 | `session-20260919-170919.jsonl` | 6035 | 2026-09-19T10:03:38.158Z | 3 | `03003d` | `0x3d` | 9 | 護盾裝設完成 | 前 10s 有 `Respawn_CN`(230103)，之後是 `Death_CN` |

**觀察**：
- 10 筆裡 ActionType 只出現 3 種：**9（護盾裝設，5 次）、8（鎖定中，3 次）、7（砲塔摧毀，2 次）**，
  沒有出現 1/2/3/4/5/6。UserIndex 集中在 1/3/4，符合小房間人數。
- 每一筆的伺服器回應都只是 §「fallback ACK」——**目前伺服器完全沒有解析這個封包**，
  只是照 6-byte generic ack 的模式回一個補零到 16 bytes 的 `Special_SN`。
  這跟 `docs/research/2026-09-20-fallback-ack-audit/notes.md` 第 6 行「`Special_CN` 確實落到通用
  fallback」的既有結論一致（`[LOG]` 已核對，無矛盾）。
- 沒有一筆前後有玩家自己打字的聊天 marker，都是自動時間戳，所以「前後文」只能用鄰近封包判斷，
  不是操作者自己標記的動作說明。

**跟既有文件的關係**：
- 這**修正**了 `Special` 只知道「layout only，code 8-way jump table，意義與送出模式不明」的狀態——
  現在 code、模式候選、部分呼叫端都補上了。
- 這**沒有推翻**任何已標 ✅ 的結論（`docs/state.md` 沒有 Special 的 ✅ 條目，只有 open item）。

---

## 給主力的建議

1. **§1 的 ActionType→wire byte 轉換表建議直接進 `docs/state.md`／`protocol.md`**，這是從 DLL 原始
   bytes 讀出來的（兩層核對：反組譯文字 + 直接讀檔比對 opcode `C6 46 12 XX`），信心很高，
   但**沒有 live-confirmed**（沒讓客戶端真的送過我們能操控的 Special 並觀察畫面），建議標
   `✅[DLL]` 但註明未 live-confirmed。
2. Boss 的「臨時代碼」瑕疵值得寫進給 Moon 的回信原文引用，這是原廠自己承認的已知問題，
   跨公司交流很有價值。
3. TwoBoss／TriggerTouch 因為原始碼樹裡完全沒有對應模式腳本，建議跟 Moon 確認：**他手上有沒有
   `ZModeTwoBoss` 或類似名稱的封包／腳本**，我們這邊解密的檔案集裡沒有。
4. Rage 的結論是讀原始碼推論，**強烈建議找一場真的有人擊殺/建造的 Rage 對戰 log 核對**——
   目前 202 份 log 完全沒有 Rage 場次，這條純粹靠反編譯，沒有任何 log 佐證。
5. mapId=5 對應哪張地圖沒有查，若要写進正式文件建議先確認（Cache.Bin 或既有地圖表）。
