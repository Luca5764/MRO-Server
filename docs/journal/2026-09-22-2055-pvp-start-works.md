# PvP 房開戰通了：TDM 真的進得去戰場

P1（PvP TDM）。開關 `PVP_START_FLOW_MODE='enabled'`（測試樹 dirty，**未進 commit**）。
劇本 `experiments/pvp-start-smoke.json`。伺服器 `test-server@885cf38`。

## 結果

✅ **PvP 房可以開戰並進入 TDM 戰場**（未經跨公司審查）

[SHOT] `research/2026-09-22-d2-tdm/pvp-tdm-battle-first.png`，畫面上逐項為證：

| 證據 | 意義 |
|---|---|
| **`TEAM DEATHMATCH`** 標題 | 模式真的是 TDM |
| 紅隊盾 `000 \| 000 \| 000` 藍隊盾 | 隊伍計分板在運作 |
| **`08:00` 倒數**（後續截圖 05:45／05:04） | TDM 時限計時器在跑 —— **這就是 `Timeout_CN` 的觸發來源** |
| 城市地圖（非 `Map_PC04` 月球地表） | **PvP 地圖載入成功**，地圖 id 那兩層修對了 |
| 機體已生成、彈藥 068、HUD 正常 | 玩家真的在場上 |
| `ChangeSlot_CN/Respawn_CN recv: seen` | 生成封包有收到（封包面佐證） |

**這條路從 2026-09-15 卡到今天，七天。** 而實際的修正只有兩件事：
把 8 個 TDM 地圖 id 送給客戶端、建房時的地圖預設值依房型分流。
那 8 個 id 一直以 `MAP_IDS_PVP` 常數躺在 `room.dispatch.js:180`，**定義了從來沒被呼叫過**。

## ⚠️ 但 runner 判定 `[FAIL]` —— 偵測器看不懂 PvP 畫面

```
[5] enter_battle -> ok=False   battle_hud=not_battle green_px=0
                               ChangeSlot_CN/Respawn_CN recv: seen
```

`screens.battle_hud_state()` 是**照 PvE 的 HUD 校準的**：它在找綠色的 `SP 0000` 計數器。
**TDM 的 HUD 用金黃色的 `P 0000`** → `green_px=0`，於是判定「不在戰鬥中」。

**封包說進去了、截圖說進去了、HUD 檢查說沒有。** 前兩者才是對的。

→ ⬜ **`battle_hud_state()` 需要 PvP 變體**，否則所有 PvP 自動化都會誤判失敗。
已開 backlog（`PVP-HUD-MARKER`）。
→ 教訓：**畫面判定一旦跨到沒校準過的場景就會說謊**，而它說的是「失敗」，
比說「成功」安全，但足以擋住整條自動化。

## 另一個坑：`enter_battle` 會留下開著的 GAME MENU

`enter_battle(mech_key=None)` 送的 ESC 會**打開** GAME MENU 並留在那裡。
清理流程若再送一次 ESC 就會把它**關掉**，之後的點擊就直接打進遊戲——
本次實際發生：兩下點擊變成**在戰場上開火**（彈藥 068→064，準心被推去看天空）。

→ 離開戰鬥前要**先確認選單狀態**，不要無條件送 ESC。
座標本身 PvP 與 PvE **相同**（離開 `(867,651)`、第二層確認 `(747,672)`），
失敗的是狀態假設不是座標。

## 尚未驗證

- ⬜ **只有一個人**。兩人分隊、`Game_User_SN` 的 team 欄（PvP 兩人都寫死 0）完全沒測。
- ⬜ 計分、擊殺、回合結束、時間到判勝負 —— 一項都還沒做。
- ⬜ 沒有打完一場（本次在 05:04 時人為離開）。
- ⬜ 開關仍是**測試樹 dirty**，沒有 commit；要正式啟用得另外決定。

---

## PM 判定與兩個條件（2026-09-22 21:3x 補）

**PM 判定：D2-1「PvP 房開戰進場」✅ [SHOT][LOG]，範圍：單人、未分隊、未計分、未打完。**
這不是 M4，是它的第一格。

### 條件 1：開關不留 dirty 過夜 ＋ golden replay 證據

- 測試樹的四處非預設設定已 commit 在 **`test-server` 分支**（`5e2ef01`），**不合回 `reverse-work`**；
  `reverse-work` 裡 `PVP_START_FLOW_MODE` 預設值仍是 `'disabled'`。
- golden replay（`test/replay-golden.js`，2026-09-22 21:0x 高階在 `reverse-work@281e05d` 重跑）：
  **ALL SAMPLES PASS**，開關為預設 `'disabled'`。四組樣本（`test/golden/<名稱>/` 底下各 4 個檔，
  依檔名排序串接後的 sha256 前 16 碼）：

  | 樣本 | 封包數 | sha256 |
  |---|---|---|
  | `login-dispatch` | 14 | `9675c44c3327c21d` |
  | `login-room-game` | 51 | `64c8e5cb17b1f94b` |
  | `login-room-shop-buy` | 364 | `581c03ac20af50d0` |
  | `pve-full-match` | **8384** | `aaa62876dc591b0d` |

  worker 先前回報 `pve-full-match` 有「既存的 send #21 失敗」，**高階重跑是全過的**，
  所以那不是既存問題（可能是它當時環境的暫時狀況），不要當成已知失敗留著。

### 條件 2：教訓

> **查「為什麼不通」之前，先 grep 現成的東西有沒有接上。**

TDM 的 8 張地圖 id 以 `MAP_IDS_PVP` 定義在 `room.dispatch.js:180`（連預設值 `MAP_ID_DEFAULT_PVP` 都有），
**七天沒被任何地方呼叫**。這七天裡 PvP 開戰被當成「尚未實作」，所有戰鬥封包研究被迫改用戰役房。
而答案一直就在程式裡，只差一行接線。
