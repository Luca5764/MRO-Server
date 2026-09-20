# 投射物消失：第一次數得出來的缺口（2026-09-20 18:20）

## 為什麼要重測

先前兩輪（09:31、09:54）是雙方在聊天室一發一發回報 `1`／`0`。那個方法有三個問題，操作者直接說「要數子彈、哪發消失、回報就是一件不現實的事情」：

1. 客戶端會擋連續發言（`發言過於頻繁`），節流不在我們伺服器，封包根本沒送出來，所以 log 也看不到；
2. 射手同時要開槍、要看對方畫面、要打字，數不準（操作者原話：「靠杯我數不來」）；
3. 第二輪中途對方回報 `very lag`，整段資料被汙染。

這輪改成讓客戶端自己數。

## 方法

客戶端內建主控台指令 `WeaponLog`（`ZBase/W_DPCForWeapon.uc:1011`）會翻 `class'Weapon'.default.bShowLog`，打開後 `MetalRage/data/Log/MetalRage.log` 會寫出每一次開火動畫與每一次爆炸特效。**只需要射手這一台開**，筆電完全不用動。

角色分配很重要：**射手必須是加入者**。房主自己開槍是本機直接生成，log 一定對得上，看不出東西。

- 房主：筆電（test）
- 射手／加入者：桌機（Lucas），武器 `HACH01`（砲），彈藥 70 發

計數方式：
- **扣扳機次數** = HUD 彈藥掉了多少。開槍那台在 `DoFireEffect()` 是無條件先扣彈的（`ZBaseWeapon/BaseProjectile_Fire.uc:363-366,398`），所以彈藥數就是扳機數。
- **實際生成數** = log 裡 `Now Animation Name : Map_PC04.ACH_a   Fire` 的行數。這行來自 `W_DefaultWeaponAttachment.uc:244` 的 `PlayAnimWithTwinGun`，而在投射物路徑上它只被 `W_BaseProjectile_Weapon.uc:910` 呼叫，也就是生成函式 `FireProjectileCenterLoc_UJ` 內部。

## 結果

- [OBS] 2026-09-20 18:2x，彈藥 **70 → 0**，即 70 次扣扳機。
- [LOG] `MetalRage.log` 第 910 行 `WeaponLog=====> Started` 之後：`Fire` **63**、投射物爆炸（`ZEmiWepGround.HACH01_Exp*`）**63**、`ReLoad` **62**（最後一發把彈匣打空，沒有重新裝填動畫）。
- 序列是 63 組完整的 `Fire → 爆炸 → ReLoad`，**沒有任何一組殘缺**。
- **缺口 = 70 − 63 = 7 發（10%）。** 與操作者當場目測「大概只看到 60 發左右」一致。

## 推論

那 7 發**沒有進到 `FireProjectileCenterLoc_UJ`**：如果進去了，`:910` 的開火動畫會先播（在 `Spawn()` 之前），log 就會留下 `Fire` 而沒有後續爆炸。實際上是整組三行都不存在。

- ❌ **H-SPAWN-FAIL 排除。** 「移動中 `CenterLocation` 過時，`Spawn()` 在自己的碰撞體內失敗」預期會留下有 `Fire`、沒有爆炸的殘缺組，一組都沒有。
- 剩下的解釋是房主那端沒有發出 `ClientFireProjectileCenterLoc_MH`。該呼叫被 `Weapons_UJ[WeaponIndex].HasAmmo()` 包著（`ZBase/W_DefaultMechForWeapon.uc:1324-1336`），而彈藥不是複寫變數、補彈的回程 RPC 是 unreliable（見 `docs/research/2026-09-20-projectile-replication/ammo-desync.md`）。→ **H-AMMO-DESYNC** 仍然站著 🟡。

## 還沒排除的

- 這一輪沒有同時記錄房主端的 log，所以「房主收到了但沒廣播」與「房主根本沒收到那個 RPC」還分不開。`ServerFireProjectileCenterLoc_MH` 是 reliable，理論上不該掉，但沒有實測證據。
- 缺口是否成串、是否集中在彈匣後段，這輪的 log 沒有時間戳，看不出來。

## 下一步

同樣的量測，開打前先在主控台打 `sup1`（`W_DPCForWeapon.uc:925` → `ServerInfiniteAmmoMode(true)`，reliable client→host，兩邊同時 `SupplyAmmo()`），再打滿一個彈匣。缺口歸零就確認 H-AMMO-DESYNC，照樣缺 7 發就排除彈藥這條。

## 附帶：操作者現在能自己開主控台

主控台熱鍵是 F24，一般鍵盤沒有，而客戶端不吃軟體注入的按鍵，先前只能請 AI 用 Pico 送（要遊戲在前景、每次約 3 秒，戰鬥中不可行）。

改法：USB 主機會把鍵盤 LED 狀態廣播給**所有**鍵盤，所以操作者按自己鍵盤的 ScrollLock，Pico 看得到，再由 Pico 送出真實 F24（commit 742eb6d，`tools/pico/code.py` 的 `poll_led_hotkey`）。[TEST] 2026-09-20 一次就開起來。

這一輪也浪費了一次：`WeaponLog` 是 toggle，AI 誤判第一次沒送出去而補送一次，等於關掉，害操作者那 70 發完全沒記到 log。之後一律先 `grep 'WeaponLog=====> \(Started\|Ended\)'` 確認狀態再開始。

## 工具

`tools/chat-markers.js`（commit e277c2f）：`packetlog.js` 的 marker 只認大廳 0x00220501 與房內 0x00220505，戰鬥中的聊天是 0x00220507／0x00220509，封包有記但沒變成 marker。這支從紀錄離線解回來，不必為了修 `CHAT_CQ` 而重啟伺服器打斷測試。

---

## 追加（18:40）：主武器量測，H-AMMO-DESYNC 也排除

上面那輪用的是輔助武器（`ACH`，InventoryGroup 2/3），所以沒有 `HitLoc===` 這行，分母只能靠 HUD 彈藥數。改用**主武器**（`MTE`，InventoryGroup 1）之後，`BaseProjectile_Fire.uc:135-139` 會在本機無條件寫 `HitLoc=== > <vector>`，分母也從 log 來，完全不需要看彈藥——這點很重要，因為 `sup1` 會讓彈藥停止遞減（[OBS] 操作者：「卡 70 發然後能一直開火」）。

同一場、同一把武器、只差 `sup1` 一個變數：

| | 扣扳機 | 生成 | 缺口 | 失敗串長度 |
|---|---|---|---|---|
| 基準（96 發打空） | 96 | 83 | **13.5%** | 3, 2, 2, 1×6 |
| `sup1` 之後 | 42 | 37 | **11.9%** | 1×5 |

[LOG] `MetalRage.log`，`MTE_I` 第一次出現之後的區段；切分點是操作者的遊戲內 marker「開完sup1 子彈回歸96」（10:37:18 UTC）之後的 42 發。

❌ **H-AMMO-DESYNC 排除。** `sup1`（`ServerInfiniteAmmoMode(true)`）在房主端直接對三把武器 `SupplyAmmo()`（`W_DefaultMechForWeapon.uc:800-806`），房主那份彈藥保證是滿的，`:1324` 的 `HasAmmo()` 閘門不可能擋；缺口卻沒有變。

失敗的形狀也不符合彈藥不同步：那個機制預期的是「房主那份先見底，之後連續整串失敗到加入者也打空」，實測是**散布在整輪的孤立單發**（基準輪前半 69 發漏 11、後半漏 7，沒有遞增趨勢）。

## 剩下的疑點

`W_DefaultMechForWeapon.uc:43-96` 的複寫宣告裡，去程 `ServerFireProjectileCenterLoc_MH` 是 **reliable**，回程 `ClientFireProjectileCenterLoc_MH` 是 **`reliable ToAll`**。兩邊都宣告可靠，卻實測掉 13%。`ToAll` 是 GameHi 自訂的關鍵字（原版 UE2 沒有），實際實作 ⬜。

## 下一步（待 PM 評估）

角色對調，分辨掉在去程還是回程，而且不需要任何人數發數：Lucas 當房主並開 `WeaponLog`，筆電當射手用主武器砲類打空一個彈匣，只回報**起始彈藥數**一個數字。房主為遠端玩家執行 `ServerFireProjectileCenterLoc_MH` 時會本機生成（`:1317-1321`），所以房主 log 的 `Fire` 數＝房主接受了幾發。

- 房主 log ≈ 筆電彈藥數 → 掉在回程的 `ToAll`
- 房主 log 明顯少 → 掉在去程，`reliable` 宣告與實際不符
