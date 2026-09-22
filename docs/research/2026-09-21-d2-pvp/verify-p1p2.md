# D2-P1／P2：PvP 的回合與勝負由誰判定（2026-09-21）

全部從解密後的 UnrealScript 讀出來（`~/mro-decrypted/src`），**沒有把 Moon 的說法當前提**。
🟡 待審（未經跨公司審查）。本次沒有碰 DLL，所以沒有新位址。

> 本檔由高階代為落檔：explorer 的角色設定禁止寫檔，它**正確地拒絕**了契約裡的寫檔要求。

## 最有價值的一條：`EndGame()` 被整個換成空殼

不管上游的偵測有沒有被註解掉，**所有非 Tutorial 的正式模式最後都呼叫同一個 `EndGame()`，
而它被覆寫成幾乎什麼都不做**：

```
// DefaultGameInfo.uc:395-405
function EndGame(PlayerReplicationInfo Winner, string Reason)
{
    if( UseZNetwork )
    {
        if ( (Reason ~= "TimeLimit") )
        {
            // 게임 종료. 호스트만 호출가능   ("Game end. Only the host can call this.")
            class'ZNetwork.ZNetwork_DJ'.static.Game_Timeout();
        }
    }
}
```

這**完全蓋掉** `Engine/GameInfo.uc:2002` 的原版（原版會 `CheckEndGame()`、設 `bGameEnded`、
通知所有 controller、觸發事件與結束 logging）。改寫後：

> **更正（2026-09-23，Sol 跨公司審查）：** 上一句原本寫原版會 `GotoState('MatchOver')`，那是錯的——
> 現存 `Engine/GameInfo.uc:2002-2014` 裡沒有這個呼叫。不影響本節主結論
> （`DefaultGameInfo` 的 override 把正式結束流程換掉了）。

- `Reason` 不是 `"TimeLimit"` 就**什麼都不做**——`ZTeamDM.CheckScore` 送進來的
  `"teamscorelimit"` 被整個吃掉，不 `GotoState`、不通知任何人。
- 唯一活的分支做的事不是結束遊戲，是送 `Timeout_CN 0x00230111`，**把決定權交還伺服器**。

只有 Tutorial／Practice 類才覆寫真正會動的 `EndGame()`
（`SuddenDeathMissionTutorial.uc:111`、`OccupationMissionTutorial.uc:94`、
`BlowMissionTutorial.uc:71`、`ZTeamDMTutorial.uc:102`、`CaptureMissionTutorial.uc:89`、
`ZTeamDMPractice.uc:113`）。

**`ZModePve.uc` 也沒有覆寫 `EndGame()`** → PvE 能跑通所依賴的機制
（伺服器送 `EndGame_SN`／`EndRound_SN` 驅動 `_BD` 事件）**跟 PvP 是同一套**，
不是 PvE 專屬的巧合。這對 D2 是好消息。

## 逐模式

| 模式 | 判定者 | 依據（檔:行） | 送錯／不送的後果 |
|---|---|---|---|
| `BlowMission`（extends `ZTeamDM`） | **伺服器** | 全滅檢查整段註解 `BlowMission.uc:93-117`（行 103 韓文註解「올킬 체크 막음」＝全滅檢查已封鎖）；`TeamWinSetting` 呼叫被註解 `:187,191`，函式本體被註解 `:196-206`；`ScoreKill`（`:37-83`）**不呼叫** `Super.ScoreKill`，切斷往 `CheckScore` 的鏈 | 不送 → 回合永遠卡住，`state RoundEnd` 進不去。`RoundEnd.Timer()`（`:217-223`，每 10 秒）只會 `BeginRound()` 重開回合，**不判勝負** |
| `SuddenDeathMission` | **伺服器**，同一套 | 全滅檢查註解 `SuddenDeathMission.uc:70-94`（行 80 同樣的韓文註解）；`ScoreKill`（`:14-60`）同樣無 `Super` | 同上 |
| `OccupationMission` | **伺服器** | `OccupationZoneScoreCheck()` 呼叫被註解 `:79`；本地算分與 `EndGame(None,"TimeLimit")` 被註解 `:138,142,144-150,152-160,182`；改成 `Game_Mission_Get()` 向網路層要狀態 `:163` | 佔領區永遠不會在本地判定完成 |
| `CaptureMission` | ⬜ **推定伺服器，證據較弱** | 完全沒定義 `TeamScoreEvent`／`CheckScore`／`CheckEndGame`／`EndGame`／`GotoState('RoundEnd')`；`ScoreKill` 有覆寫但無 `Super`。**未讀 `CaptureObject.uc`／`CaptureZone.uc`**，不排除邏輯在那 | 未窮盡 |
| `RageMission` | 偵測**活著**，但終點被閹割 | 全檔 239 行**沒有覆寫** `ScoreKill`／`TeamScoreEvent`／`CheckScore`／`NotifyKilled`／`EndGame`，全繼承 `ZTeamDM` | 效果同上 |
| plain `ZTeamDM`（若直接當 TDM） | 同上 | `ZTeamDM.ScoreKill`（`ZGame/ZTeamDM.uc:935-960`，**未註解**，`Team.Score+=1` 並呼叫 `Super`）→ `ZDeathMatch.ScoreKill`（`:285`，呼叫 `CheckScore`）→ `ZTeamDM.CheckScore`（`:880-895`，`Score>=GoalScore` 就 `EndGame(Scorer,"teamscorelimit")`）——**整條鏈都活著，但終點是空殼** | 同上 |

## P1 的結論：Moon 方向對，但機制要分兩層

1. **Blow／SuddenDeath／Occupation**：連**偵測本身**都在原始碼被物理註解掉。
2. **Rage／plain TDM**：**偵測還活著、沒被註解**，但最終呼叫的 `EndGame()` 被閹割，效果相同。

**差別在於將來若要恢復客戶端本地判定**：Rage／TDM 只要修一個函式（`EndGame()`），
Blow／SD／Occupation 要同時復原好幾處被砍掉的偵測邏輯。
**這個區別所有既有文件（含 Moon 的筆記）都沒寫出來。**

### `_BD` 事件是網路驅動的直接證據

`Engine/GameInfo.uc:1980-1981` 宣告 `event EndRound_BD(); event EndGame_BD();`（無實作＝可被
native 呼叫）；`ZModePve.uc:716` 在覆寫版本正上方有原作者的註解
「라운드 종료시 Network에서 호출」＝**「回合結束時由 Network 呼叫」**。

⚠️ **更正 Moon 文件的一處引用**：`protocol_objective.en.md:180` 說那句註解在
`ZTeamDM.EndRound_BD`，**實際上在 `ZModePve.uc:716`**——`ZTeamDM.uc` 整檔沒有
`EndRound_BD` 這個字串（已 grep）。結論沒錯，引用位置錯，不要照抄。

## P2（GPF）：⬜ 未解，純源碼查不出來

Moon 說「勝方與客戶端任務狀態矛盾會 GPF」。流程是
`EndRound_SN` → `EndRound_BD()`（`BlowMission` 沒覆寫，繼承 `DefaultGameInfo.uc:287-291`）
→ `GotoState('RoundEnd')` → 10 秒後 `Timer()`（`BlowMission.uc:217-223`）
→ `Global.Timer(); BeginRound();`（`DefaultGameInfo.uc:1915-2017`）。

`BeginRound()` 裡兩個候選的 None 存取，**但都無法確認跟「勝方矛盾」有因果關係**：
1. `DefaultGameInfo.uc:1988` 的短路 OR：`PlayerReplicationInfo==None` 時條件為真、**繼續往下**
   執行到 `:1995/2001/2007` 的 `DP.PlayerReplicationInfo.Team`，此時可能仍是 None
   （`:1991-1992` 的 `DP==none` 檢查堵不住這種情況）。
2. `ZGameMidMenu/ZSlotSelectPage.uc:46`：`Game_Info_Get().MapInfo.Index` 直接串接存取。
   但這是 `InitComponent`，正常開選機介面就會跑到，不是「勝負矛盾」專屬路徑。

**沒有找到**任何被註解掉、專門處理「WinTeam 與炸彈狀態矛盾」的檢查——
更像是**從來就沒做過這個校驗**，送矛盾資料時就直接走既有那條 None-prone 的路。

（UnrealScript 的 Accessed None 正常只記警告、當空值繼續跑，不必然等於 GPF——
除非 native 端沒做同樣的空值防護。）

**下一步**：需要 Moon 那次 crash（"explosion as a BLUE win"）的呼叫堆疊或崩潰傾印，
配 `tools/disasm.py` 對 `ZNetwork.dll`／`Engine.dll` 定位實際解參考的欄位。純源碼到此為止。
