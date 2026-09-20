# 投射物為什麼加入者看不到（2026-09-20，explorer 讀客戶端腳本）

## 關鍵發現：投射物不是「複寫的 actor」，是「各端各自生成」

- 開火流程（[SRC] `ZBase/W_DefaultMechForWeapon.uc:59,92-99,1313-1334`）：
  1. 開槍的客戶端呼叫 `ServerFireProjectileCenterLoc_MH`（`reliable if (Role < Role_Authority)`，C→S）。
  2. 房主（Authority）收到後，先在自己的世界本地 spawn 一顆（所以**房主永遠看得到**，不需要任何網路封包）。
  3. 房主接著呼叫 `ClientFireProjectileCenterLoc_MH`（**`reliable ToAll if (Role == Role_Authority)`**，S→所有客戶端）。
  4. 每個收到的客戶端**各自在本地 spawn 自己的那一顆**。
- 所以「看不看得到投射物」取決於**那個 reliable RPC 有沒有送達並執行**，不是取決於 actor 的 NetPriority 或相關性裁切。
- 全樹 grep 不到任何對投射物的 `NetPriority=`／`NetUpdateFrequency=`／`bNetTemporary=`／`RemoteRole=` 賦值，這些都是原生類別的編譯期預設，腳本裡看不到。

## 傷害在哪裡算
- 投射物爆炸時的傷害計算被包在 `if (... bMyProj ...)` 裡（[SRC] `ZBaseWeapon/BaseProjectile_Proj.uc:275,311-316`），而 `bMyProj = Instigator.IsLocallyControlled()`（`ZBase/W_BaseProjectile_Weapon.uc:820,862`）。
- 也就是說**只有開槍者自己那台機器上的那顆副本會申報傷害**，房主機器上「別人開的那顆」副本 `bMyProj=false`、不申報。
- → **「加入者看不到自己的投射物」和「沒有造成傷害」是同一個根因**：那個 reliable RPC 沒到，加入者本地就沒有副本，也就不會有傷害申報。兩個症狀一定同時出現。
- hitscan 走完全不同、更輕的路徑（[SRC] `ZBaseWeapon/BaseInstant_Fire.uc:122,130-167,208`）：不 spawn 任何 actor，命中判定也只在開槍者本機跑，所以不受影響。這解釋了 Moon 說的「投射物／hitscan 分裂」。

## 對假設的影響
- ❌ **PM 的「複寫飢餓（NetPriority 讓短命 actor 被擠掉）」機制與實際程式路徑對不上**：這條路徑根本不靠 actor 複寫。
- 🟡 新假設 H-RPC-DROP：`ClientFireProjectileCenterLoc_MH` 這個 reliable RPC 沒有及時送達加入者（頻寬預算排隊、房主 tick 停頓、或送出的順序被別的東西卡住）。調高速率上限**仍可能**改善（reliable RPC 一樣吃頻寬預算），但修法方向與「調 NetPriority」不同。

## 可以馬上驗的預測（下一場兩人局）
1. **加入者看不到自己的火箭時，一定也沒有傷害**；看得到時就有傷害。→ 房主站著不動讓加入者打，計數「射了幾發／看到幾發／房主掉幾次血」。
2. hitscan 不受影響（預測 100% 正常）。
若 1 不成立（看不到卻有傷害，或看得到卻沒傷害），這份分析就有問題，要回頭查。

## 還沒確認 ⬜
- 加入者連線實際採用哪一組速率（`?LAN` 與否、`CurrentNetSpeed` 怎麼定）：`Game_URL_Get` 是原生函式，腳本裡看不到，要反組譯 DLL。
- `reliable ToAll` 的原生語意（會不會送回開槍者自己）。
- 客戶端現行 ini 值不是出廠值（`MetalRage.ini` 的 `[IpDrv.TcpNetDriver]` 是操作者加的），做速率實驗時基準要寫清楚。

---

## 追加（2026-09-20 晚）：Moon 的同機案例是最乾淨的對照組

[OBS] 操作者再看一次 Moon 的影片後指出：**同一台電腦上的兩個客戶端視窗更新速度基本上一樣**，沒有「失焦的視窗被降速」的跡象。

→ ❌ **「房主失焦／房主更新太慢」從 Moon 案例的候選原因移除。** 先前幾次討論（含 PM 的假設）都把它當成可能的加重因子，依據只是「Windows 通常會降低背景視窗的更新率」，沒有針對這個客戶端的觀察。

這讓 Moon 的案例變成目前最有價值的對照組：**同一台電腦、迴路介面、幾乎零延遲、零掉包、零抖動、兩端更新率相同，投射物仍然不定時消失。**

→ 網路品質、房主卡頓、視窗焦點**都不是必要條件**（可能加重，但不是成因）。

對 2026-09-20 收斂出來的兩條線沒有影響，反而收緊了：
1. 成串失敗 ← `HasAmmo()` 閘門（有 `sup1` 的數據支持，🟡）；
2. 殘留的孤立單發 ← 回程 `ClientFireProjectileCenterLoc_MH`（`reliable ToAll`）的送出路徑（未查）。

**對區網基準那一輪的預測要改**（原本寫「缺口接近 0」）：如果 Moon 的同機案例是同一個成因，**區網應該仍然有個位數百分比的孤立單發**。兩種結果都有資訊量：
- 區網仍有個位數 → 與同機案例一致，定性為引擎固有行為，寫進已知限制往下走；
- 區網接近 0 → 抖動確實有影響，而 Moon 那邊另有原因，要重開一條線。

量測方法見 `journal/2026-09-20-1820-projectile-loss-counted.md`；同樣的 `WeaponLog` 量法 Moon 一個人在一台機器上就能跑，還能同時拿到兩端的 log。
