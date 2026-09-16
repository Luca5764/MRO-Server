# 實測驗證進展與武器型號真正根因（2026-09-16 21:35）

> 從 docs/opcode-ledger.md 第 1693–1737 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

- ✅ 已確認 [SHOT] 實測截圖 `shots/shot-211936.png` 證實：
  - 機體外觀已正確恢復為 1 號機 Vanguard (`SA01m`)，防禦值為專屬的 280，機背掛載雙噴口推進器。
  - 右下角 HUD 顯示武器為「鷹式榴彈砲 / ANACONDA II (D)」，彈藥 006/0066。
  - 使用者回報：手上武器不是 1 號機武器，沒有副武器，沒有推進器，無法左鍵開火。
- ✅ 已確認 [LOG] 客戶端最新 `MetalRage.log` 仍然出現：
  - `ScriptLog: WeaponLog=== Small Cannot use Map_PC01.MOC_a`
  - `Warning: MOC_a Map_PC01.MOC_a (Function ZBase.W_DefaultWeapon.BringUp:00A5) Accessed None 'ThirdPersonActor'`
- ✅ 突破性發現 [CACHE.BIN/DLL]：
  - 反編譯 `Engine.dll` `UCacheManager::LoadAnotherFile_BD` 循序追蹤 37 個 Table 的載入：
    - Table 0: `FMapInfoRecord` (42 筆地圖)
    - Table 2: `FGameItemRecord` (2112 筆道具資訊，`ParseGameItemList`)
    - Table 4: `DefaultSetList` (32 筆官方配裝表，`ParseDefaultSetList`，stride 0x1C，7 個 int)
    - Table 6: `FSpecMechRecord` (16 筆機體規格，`ParseSpecMechList`)
    - Table 7: `FSpecWeaponMainRecord` (55 筆主武器規格，`ParseSpecWeaponMainList`)
    - Table 8: `FSpecWeaponSubRecord` (23 筆副武器規格，`ParseSpecWeaponSubList`)
    - Table 9: `FSpecBoosterRecord` (7 筆推進器規格，`ParseSpecBoosterList`)
    - Table 10: `FSpecSkinRecord` (塗裝規格，`ParseSpecSkinList`)
  - **核心根因 1：`MOC_a`（21100101）本來就不是 Small 機體的武器**：
    - `wid=21100101` 在 Table 7 名稱確實是「鷹式榴彈砲」（ANACONDA II），但它只能被 Medium/Heavy 機體裝備。
    - 輕型機體（Small / 1 號機 Vanguard `SA01m`）在執行 `W_DefaultWeapon.BringUp` 時會執行相容性檢查，判定為 Small 後印出 `Small Cannot use Map_PC01.MOC_a` 並拒絕掛載，因此手中沒有實體模型、也沒有註冊攻擊事件，**導致左鍵完全無法開火**！
  - **核心根因 2：Table 4（`DefaultSetList`）才是官方唯一指定的標準預設裝備表**：
    - 結構為：`[Mech, Level, Main, SubLeft, SubRight, Booster, Skin]`
    - **Mech 1 (11100101, SA01m Vanguard)**：
      - Main: `22100101` (`Zweapon.MOM_a` / 輕量型來福機槍) —— 這才是 1 號機真正的正版主武器！
      - SubLeft: `32100101` (`Zweapon.AOM_a` / 簡易機槍)
      - SubRight: `31100101` (`Zweapon.AOC_a` / 輕型主動式加農砲)
      - Booster: `41100101` (`Zweapon.BPE_a`)
      - Skin: `61101001`
    - **8 台一階機體官方 Table 4 權威清單**：
      1. `11100101` (Vanguard): Main `22100101`, SubLeft `32100101`, SubRight `31100101`, Booster `41100101`, Skin `61101001`
      2. `12100101` (Dual): Main `26300101`, SubLeft `32100101`, SubRight `31100101`, Booster `41100101`, Skin `61100101`
      3. `13100101` (劍虎): Main `21200101`, SubLeft `32100101`, SubRight `31100101`, Booster `41100101`, Skin `61101601`
      4. `14200101` (判官): Main `24100201`, SubLeft `32100101`, SubRight `31100101`, Booster `0`, Skin `61101201`
      5. `15200101` (聖戰士): Main `22200201`, SubLeft `32100101`, SubRight `31100101`, Booster `0`, Skin `61101301`
      6. `16200101` (雷霆): Main `25300101`, SubLeft `38500101`, SubRight `0`, Booster `43100101`, Skin `61101501`
      7. `17100101` (智多星): Main `28100101`, SubLeft `31100101`, SubRight `0`, Booster `42100101`, Skin `61101401`
      8. `18100101` (觀星者): Main `28300101`, SubLeft `39100101`, SubRight `31100101`, Booster `41100101`, Skin `61101101`
  - **核心根因 3：為什麼沒有副武器與推進器**：
    - 先前資料庫缺少 `part_slot=3`（SubRight），且把 SubRight 的 `31100101` 錯塞到 `part_slot=2`（SubLeft，應為 `32100101`），導致左右手副武器皆掛載失敗。
    - 推進器按鍵在 `OptionAll_Default.ini` 中為 `Key_Booster=16`（`Shift` 鍵），且機體若處於蹲伏/坐下狀態（`Key_SitDown=17`，`Ctrl` 鍵）時無法噴射。



