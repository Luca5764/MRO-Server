# H-AMMO-DESYNC：彈藥數不是複寫變數（2026-09-20）

## 核心發現
- [SRC] `ZBase/W_DefaultMechForWeapon.uc:22-113` 的 `replication` 區塊裡**沒有任何彈藥變數**（只有 `AttackLocation_Sh`、`UseWeaponIndex_MH`）。彈藥完全是兩台機器各自維護的本地狀態，只靠 RPC 對齊。
- **補彈的那組 RPC 一半是不可靠的**：
  - `ServerAmmoAgency`／`ServerAddAmmo_UJ`／`ServerSetAmmo_UJ`／`ServerInfiniteAmmoMode`（客戶端→房主）是 **reliable**（`:70-74`）；
  - 對應的 `ClientAmmoAgency`／`ClientAddAmmo_UJ`／`ClientSetAmmo_UJ`／`ClientSetAmmoByCash_UJ`／`ClientInfiniteAmmoMode`（房主→該客戶端）是 **unreliable**（`:100-108`，註解寫明只送給當事人）。
  - → 任何一次補彈，只要那個 UDP 封包掉了，兩邊的彈藥數就永久對不上。
- 開火時的不對稱（`:1319-1332`，韓文註解「호스트는 이미 자기의 총알을 DoFireEffect에서 깍았다」）：開槍者本機在 `DoFireEffect()` 無條件先扣（`ZBaseWeapon/BaseProjectile_Fire.uc:363-366,398`），房主則只在自己那份 `HasAmmo()` 為真時才扣、才 spawn、才送通知。
  - → 如果房主那份比較低，加入者會**連續好幾發**都「自己扣彈、但房主不動作」，直到加入者本機也扣到空。**失敗成串、而且房主也看不到** —— 這正是 H-AMMO-DESYNC 的指紋。

## 我們的伺服器有沒有關係
- `Game_User_SN 0x00222112` 只送槽位的道具 id 與選用槽位（`dispatch/room/room-game-user.sender.js:13,42-58`），**整個 `dispatch/` 樹 grep 不到任何 ammo**。
- 彈藥初值來自武器類別的 `var config`（`W_DefaultWeapon.uc:116-117`）與原生的 `InitAmmo()`／`CalculKitAmmo()`（`Engine/Weapon.uc:156-157`），每台機器各自算。
- → **我們送的資料不會直接造成彈藥不同步**。我們唯一能動的槓桿是連線品質／速率設定（因為出問題的正是那組不可靠 RPC）。

## 還沒確認 ⬜
- `InitAmmo()`／`CalculKitAmmo()` 是原生函式，同樣的設定輸入在兩台機器上會不會算出不同結果，腳本看不到（要反組譯客戶端 DLL）。
- `ConsumeAmmo()` 也是原生：房主代遠端玩家扣彈時，會不會觸發 `HasAmmo()` 裡的防竄改檢查（`W_DefaultWeapon.uc:381-394` 比對 `AmmoNumTotal` 與兩份隱藏副本）而把彈藥歸零。若會，那是另一個獨立 bug。
- 重生後房主端重新初始化武器的時機，跟加入者可能提早開火之間有沒有競態。

## 怎麼分辨（現場觀察，不用抓封包）
- 失敗**成串**、房主也看不到、而且加入者自己畫面在連串失敗結束前就出現「沒彈」的乾擊 → H-AMMO-DESYNC。
- 失敗**零星**、房主看得到 → 通知本身沒送達／沒執行（H-RPC-DROP 或武器物件未就緒）。
- **測試時要額外記錄每一次補彈／經過補給區的時間點**，那正是不可靠封包可能掉的地方。
