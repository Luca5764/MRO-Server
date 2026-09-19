# SOL-REVIEW-5（P1b）

- 通過 — 1. 預設表 — 直接讀 `MetalRage/Data/System/Cache.Bin` Table 4（起點 `0x37456`、stride `0x1c`、32 records）；DB `mech_levels` 的 mech 1–8 目前都只有 level 1，對應八筆（至 `0x37766`）的 body/main/left/right/booster/skin 與 `database/default-loadouts.js:12-20` 全同；level 2 同值。mech 4/5 的 Booster 確為 0，因此 `database/db.js:445-458` 移除發放正確。
- 通過 — 2. Serial-0／spawn — 空 WearInfo 初始化及正確線序 `[itemIndex=0,key=0]` 見 `dispatch/account.dispatch.js:645-667`、`dispatch/gamelogin.dispatch.js:263-306`；Game_User 缺列回落 Cache item id 見 `dispatch/room/room-game-user.sender.js:190-219`。`Game_User_SN` `0x107d8e15` 直接取 packet slot item ids，`Game_Slot_Set` `0x1072de30`（寫入點 `0x1072de82`–`0x1072ded7`）直接存進 GameItem；`DefaultGameInfo.uc:1012-1018` 取 GameItem slot，`DefaultPlayerController.uc:874-906` 直接以各 item id 查 Cache class，整鏈沒有 HaveList lookup。`ZPanel_InvenItems.uc:338-383` 另以 `SerialIndex=0` 合成部位 1–5 的預設品。
- 疑點 — 3. 清理規則／交易 — 規則實作吻合契約（`tools/p1b-remove-default-items.js:89-140`），單次執行在同一 transaction、錯誤 rollback、重跑 no-op（`:84,143-148`）；但 SELECT 無鎖，而 `item_equips` DDL 沒有 FK（`tools/migrate-e1-item-equips.js:66-73`），伺服器同時改裝可在 snapshot 後新增關聯，造成遺留／孤兒。實跑須停寫或補 account/row locking。
  - SELECT-only dry-run（2026-09-19），account 1：刪 15 equip/15 serial：`100154,100158,100162,100166,100170,100174-100178,100181-100185`；保留的已裝 serial：`100169,100173,100218,100219,200000,200003,200005,200006,200010,200011,200014,200068,200102,200103`，未裝列亦完全不碰。
  - account 4：刪 30 equip/26 serial：`200069-200074,200076-200078,200080-200082,200085-200086,200089-200100`。共享 catalog `32100101` 已合為 serial `200071`，五列全命中，故 serial 也刪；mech 4/5 booster `200084` (`41100101`)／`200088` (`41200101`) 非現行預設，均保留。原 journal 所稱「4 個命中序號因仍有列而保留」是誤讀：差額來自 `200071` 一個 serial 對五列。
- 需修改 — 4. hangar WearInfo — 是 live bug：Hangar Open 與購買成功分別呼叫 `sendHangarWearInfo`（`dispatch/room.dispatch.js:562-565,985-988`），但 `:1109-1110` 寫成 `[uniqueKey,itemIndex]`；DLL `WearInfo_SN` `0x107c4877/0x107c4a13` 以 record 第二個 u32（rec+`0x08`）作 ItemInfo key，正確應為 `[itemIndex,uniqueKey]`。`test/item-equips.js:99-114` 反而把錯序當預期，須同步修測試。
- 需修改 — 5. login-token noise — 不影響 production DB，但不是無害測試雜訊：fake DB `test/login-token.js:93-122` 缺 `getItemsWithEquipViews`，真路徑於 `dispatch/gamelogin.dispatch.js:271` 拋錯，再被 `:435-436` 吞掉，bootstrap 半途停止而測試仍於 `test/login-token.js:306-313` exit 0；應補 mock，讓非預期 DB error 令測試失敗。

## Go / No-go

**NO-GO：目前不要把 account 4 cleanup 當 live pilot 執行。** 先修 live `sendHangarWearInfo` 欄位順序及測試；實跑另須有 fresh backup，並保證伺服器／其他程序在 transaction 期間不寫該帳號（或先補鎖定）。

## 高階處理（Claude）
- 4（hangar WearInfo 欄位順序）與 5（login-token mock）採納，交 worker 修。
- 3：清理實跑時停伺服器再執行（跟 E1 同一套流程），不另外補鎖。
- 修完之後才做 account 4 pilot。Sol 額度用完，這兩個修正改由高階自審，事後再補審。
