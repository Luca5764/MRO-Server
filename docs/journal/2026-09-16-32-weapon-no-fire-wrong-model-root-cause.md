# 武器無法開火／外觀像另一台機體的根因突破（2026-09-16）

> 從 docs/opcode-ledger.md 第 1663–1692 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

- ✅ 已確認 [LOG] 客戶端 `MetalRage.log` 記錄顯示：
  - `ScriptLog: Pawn: SA02m`
  - `ScriptLog: WeaponLog=== Small Cannot use Map_PC01.MOC_a`
  - `Warning: MOC_a Map_PC01.MOC_a (Function ZBase.W_DefaultWeapon.BringUp:00A5) Accessed None 'ThirdPersonActor'`
- ✅ 已確認 [CACHE.BIN/DLL] 經由反編譯 `Engine.dll` `UCacheManager::LoadAnotherFile_BD` 與分析 `Cache.Bin` 二進制結構：
  - `FSpecMechRecord` 中：
    - `11100101`: `ZMechanic.SA01m`, `DefaultMech=0`, `MechType=0x1`（一代輕裝甲 Vanguard，預設機體）
    - `11200101`: `ZMechanic.SA02m`, `DefaultMech=1`, `MechType=0x1`（二代輕裝甲 Raven，非預設機體）
  - `FGameItemRecord` 中：
    - `11100101`: `HighGroup=1, MiddleGroup=1, LowGroup=1`
    - `11200101`: `HighGroup=1, MiddleGroup=1, LowGroup=2`
    - `21100101` (`MOC_a`): `HighGroup=2, MiddleGroup=1, LowGroup=1`
    - `31100101` (`AOC_a`): `HighGroup=3, MiddleGroup=1, LowGroup=1`
    - `41100101` (`BPE_a`): `HighGroup=4, MiddleGroup=1, LowGroup=1`
- ✅ 根因定位 [DLL/LOG]：
  - 原先 `db.js` 的 `starterLoadouts` 與資料庫中 account 2 的機體 body 誤填為 `11200101`（`SA02m` Raven），但裝備的主副武器與推進器全是一代裝備（`LowGroup=1`）。
  - 當客戶端生成 `SA02m` 時，試圖裝載 `MOC_a`，引擎判定型號不合印出 `Small Cannot use Map_PC01.MOC_a`，導致 `BringUp` 找不到 `ThirdPersonActor`，武器完全未掛載。
  - 此完全解釋了使用者回報的四項現象：(1) 機體外觀是 Raven 而非 Vanguard (2) 無法開火（無武器 Actor） (3) 無副武器 (4) 無推進器。
- ✅ 已修正 [DB/CODE]：
  - 資料庫 `items` 表已將 account 2 的 Mech 1 body 更新為 `11100101`（`SA01m` Vanguard）。
  - `database/db.js` 的 `starterLoadouts` 已將 8 台預設機體 body ID 全數更正為 `DefaultMech=0` 的一代機體（`11100101`, `12100101`, `13100101`, `14200101`, `15200101`, `16200101`, `17100101`, `18100101`）。
  - `room-game-user.sender.js` 補充 `DEFAULT_MECH_BODY` 映射作為 fallback，避免未查到裝備時回退至不合法的數字。
- 🟡 待驗證 [OBS] 使用者重測開局，觀察：
  - 機體是否變為 Vanguard (`SA01m`)
  - 畫面上是否掛載了武器與推進器
  - 左鍵是否可以正常開火、Shift 是否有推進器效果
  - client log 是否不再出現 `Cannot use Map_PC01.MOC_a`

