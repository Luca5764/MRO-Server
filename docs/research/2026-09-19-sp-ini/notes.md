# 舊「無限 SP 外掛」檔案分析（純靜態，未套用）

來源：[OBS] 操作者 2026-09-19 提供的 `G:\User\Downloads\archive`，內容只有兩個檔案：`ZController.ini`（6745 bytes）和 `w.txt`（使用說明）。裡面沒有執行檔。

- `w.txt` 的用法：等遊戲載入到 100% 還沒開始前，把這份 `ZController.ini` 蓋到 `data\System`。也就是只替換設定檔，不是注入程式。
- 跟現行客戶端的 `data/System/ZController.ini` 比對：外掛版**整段拿掉**了 `[ZModePve.ZPvePlayerController]` 和 `[ZModeEscortPve...]` 下的 SP 設定，包括 `SpdUpSP=0` ×10 和 `SkillInfos[n]=(UsePoint=30/50…, EffectType, CoolTime…)`，還有一些 `ZBase.DefaultPlayerController` 的鏡頭參數。🟡 推測：少了 ini，類別預設值（例如 UsePoint=0）就會生效，所以 SP 技能不花點數。沒有對照 UC 預設值確認。
- 意義：
  - PvE 的 SP 技能花費（UsePoint）、冷卻、效果種類都是**客戶端 ini 設定**，伺服器不管。
  - 同一個檔案裡的 `RecentServers` 保留了原廠台服位址：外掛版 `210.66.207.39:31003`，現行版 `210.66.207.31:31002`、`210.66.207.34:31002`。可以補進 `docs/reference/client.md` 的原廠網域資料。
- 處理：只做分析，不套用到任何客戶端。這個 ini 替換不碰反作弊，但會讓客戶端設定跟其他玩家不一致；要不要在私服用它當「測試模式」由操作者決定。
