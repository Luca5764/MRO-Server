# 遊戲系統覆蓋率盤點（S2）

> 🟡 中階產出，待審。2026-09-19，`worktree ~/mro-wt/s2`（分支 `flash-wip-s2`），唯讀盤點，未改任何程式、資料庫或開關。
> 這份文件定義 roadmap「邀請制私服開服前要把遊戲系統全部做完整」裡「全部」的範圍（`docs/roadmap.md`）。

## 0. 方法與限制

**資料來源**（全部列出，供覆核）：
- `docs/client-dispatch-map.md`（`tools/dispatch-map.py` 2026-09-15 產生，273 筆映射、**267 個不重複 opcode**）— 唯一權威的 S→C opcode 名稱來源。
- `Metal Rage Online Server/logs/session-*.jsonl` 全部 **132 份**（2026-09-15～2026-09-19），寫一支唯讀腳本聚合：C→S 每個 opcode 的次數、`fallback`／`unhandled` 事件；S→C 每個 opcode 的送出次數。腳本與中間結果在 `/home/lucas/.claude/jobs/25618401/tmp/`（不在 repo 內，依契約不進版控）。
- `Metal Rage Online Server/dispatch/*.js`、`dispatch/room/*.js`：對每個 S→C opcode 的十六進位字面值（含大小寫，`0x0022021A` 這類）做全文比對，確認有沒有程式碼路徑會送。
- `docs/state.md`、`docs/reference/multiplayer-audit.md`、`docs/reference/placeholder-audit.md`、`docs/backlog.md`、`docs/journal/INDEX.md`、`docs/roadmap.md`。
- `~/mro-decrypted/src/ZNetwork/ZNetwork_DJ.uc`：`native static function` 宣告給出客戶端可以送出的每一個 C→S 動作（含韓文原始註解），用來補 log 裡沒出現過的動作。
- `~/mro-decrypted/src/ZGameMainMenu/*.uc`：UI 入口對照（頁面／面板／彈窗類名）。
- `docs/research/2026-09-19-card-system/notes.md`：操作者提供的 2011 巴哈姆特文章，卡片系統原版玩法描述（玩家記述，非官方規格）。

**S→C 狀態判定規則**（本文件的判定，不等於 `docs/state.md` 的 ✅／❌）：
- ✅ **已實作且有實測依據**：`docs/state.md` 明確以 `[TEST]`／`[OBS]`／`[SHOT]`／`[DB]` 標註過這個 opcode 的實際行為（不只是 `[DLL]` 查到名稱）。
- 🟡 **有送出但未經驗證**：程式碼裡找得到會送出這個 opcode 的路徑，且 132 份 log 裡至少送過一次，但沒有 `[TEST]`／`[OBS]` 等實機證據，或送出的是佔位／固定值。
- ⬜ **只有空包／fallback／未送過**：分三種都算 ⬜，各自在表格「狀態」欄位標註：
  - `⬜(code,unsent)`：程式碼有路徑，但 132 份 log 一次都沒送過（開關預設關閉，或路徑沒被觸發）。
  - `⬜(fallback-only)`：沒有專用 handler，客戶端送奇數 CQ 時被 `gate.game.dispatch.js`／`community.dispatch.js` 等檔案共用的「奇數 CQ 自動回 CQ+1」機制順帶回了對應 SA，不代表這個系統有實作（見 `docs/state.md` 第 5 節同類案例）。
  - `⬜`：程式碼裡沒找到，也沒送過，但 dispatch map 顯示這個 opcode 有兩個 handler 名稱（多半是共用同一個 opcode 的兩個系統），保留給有實作的那一邊。
- ❌ **從未實作、從未送過**：全專案 `grep` 不到這個十六進位字面值，132 份 log 也沒出現過。

**C→S 判定規則**：`handler`（dispatch 檔案裡有專屬 `case`）／`fallback ACK`（只靠奇數 CQ 自動 ACK）／`no reply`（`unhandled` 事件，伺服器完全不回）／`never seen`（132 份 log 沒出現，只能靠 `ZNetwork_DJ.uc` 的宣告確認客戶端「有能力」送出）。

**限制**：不從 opcode 名稱直接推斷 body 語意當作事實；語意不確定一律標 ⬜，並附出處（`[SRC]` 表示只有 UnrealScript／DLL 原始碼佐證，不是實測）。系統分類（登入帳號／房間／PvE…）是本文件為了排工方便做的**結構性歸類**，不是對 opcode 內容的語意宣告——例如 `0x0021xxxx` 屬於 `ZDispatchAccount`，但依實際用途拆進「登入帳號」「結算與成長」「機庫與裝備」三節。

---

## 1. 總表

完成度 = `(✅ 個數 × 1 + 🟡 個數 × 0.5) / 該系統 opcode 總數`，只計 S→C（C→S 沒有官方 opcode 清單可以當分母，另外在各節列出）。這是**粗略**的封包覆蓋率，不代表玩法完整度（例如「房間」42% 但多人廣播仍多數未實機驗證，見 `multiplayer-audit.md`）。

| 系統 | 完成度（S→C，粗估） | 規模 | 主要相依 |
|---|---:|---|---|
| 登入帳號 | 17%（0/12 ✅，4 🟡） | S | 無（最先做，已可用） |
| 大廳頻道 | 16%（1/16 ✅，3 🟡） | S | 登入帳號 |
| 房間 | 42%（14/50 ✅，14 🟡） | L | 大廳頻道；多人廣播需 D1 房間模型（見 `multiplayer-audit.md`） |
| PvE 模式 | 59%（8/16 ✅，3 🟡）；戰役可玩，Boss／TwoBoss／Tutorial／Escort 完全未觸碰 | L | 房間、機庫與裝備（出場配裝）、結算與成長 |
| PvP 模式 | 0%（0/3 ✅，Capture/Conquest/Bomb SN 全未送；TDM／Sudden Death／Rage／Occupation 連對應的 dispatch opcode 都沒確認） | L | 房間、結算與成長；目前**完全沒有 PvP 開戰路徑**（`journal/2026-09-15-03-campaign-only-start-flow-pvp-blocked.md`） |
| 結算與成長 | 21%（1/17 ✅，5 🟡） | M | PvE/PvP 模式（觸發結算）；評等公式未定（backlog RANK） |
| 機庫與裝備 | 30%（4/22 ✅，5 🟡）＋ ItemInfo/WearInfo 另計 2 ✅ | M | 登入帳號；E1 IsShare 已實作未實機驗證 |
| 商店與現金商店 | 18%（1/11 ✅，2 🟡）；現金商城（Cash）完全未實作 | M | 機庫與裝備 |
| 物品期限／授權／修理 | 8%（0/6 ✅，1 🟡） | M | 機庫與裝備；Legend 授權欄位未知（backlog「Legend 機體授權」） |
| 好友／密語 | 0%（16 個全 ❌，含大廳私聊 Whisper_User） | M | 大廳頻道 |
| 公會 | 0%（57 個全 ❌，唯一例外是 fallback 誤答 2 次） | L | 大廳頻道、好友／密語 |
| 郵件／禮物 | 5%（0/21 ✅，2 🟡，多半只是 fallback） | M | 好友／密語（收件人查找） |
| 卡片 | 0%（16 個全 ❌，4 個 `⬜(code,unsent)` 死碼） | L | 機庫與裝備（換到的傳說機要能裝備）、商店（G 幣／優惠券抽卡） |
| 排行榜 | 未找到專屬 opcode（見第 15 節） | ⬜ | — |
| 活動 | 未找到專屬 opcode（見第 16 節） | ⬜ | — |
| 其他 | `Grade_Info_SN`（GM 權限，已✅）／`Notice_SA`／`Notice_SN`／`Report_SA` 全 ❌ | S | — |

規模估法：S＝單一 handler 或既有模式的延伸；M＝新系統但資料結構簡單（清單＋CRUD）；L＝需要新的跨連線共享狀態（房間、配對、公會）或新的遊戲模式流程（PvP、卡片養成）。

---

## 2. 登入帳號

**opcode（S→C，12 個）：**

| Opcode | Handler | 狀態 | 出現次數(132份log) | 程式位置 |
|---|---|---|---|---|
| `0x00110102` | `Login_Account_SA` | ❌ | 0 | — |
| `0x00110114` | `Login_GameHi_SA` | ❌ | 0 | — |
| `0x00110123` | `Login_Netmarble_SA` | ❌ | 0 | — |
| `0x00110125` | `Login_Again_SA` | 🟡 | 116 | gamelogin.dispatch.js |
| `0x00110131` | `Wait_SN` | ❌ | 0 | — |
| `0x00110143` | `Login_GameYarou_SA` | ❌ | 0 | — |
| `0x00110152` | `Login_Wasabii_SA` | 🟡 | 121 | account.dispatch.js |
| `0x00110155` | `Login_NexonJapan_SA` | ❌ | 0 | — |
| `0x001101d2` | `Login_Member_SA` | ❌ | 0 | — |
| `0x00210101` | `DefaultInfo_SN` | 🟡 | 236 | gamelogin.dispatch.js |
| `0x00210121` | `Complete_SN` | 🟡 | 236 | gamelogin.dispatch.js |
| `0x00210202` | `Create_SA` | ❌ | 0 | — |

只有 `Login_Wasabii_SA`（原廠台版發行商登入流程）有實作；其餘 8 種發行商登入分支（GameHi、Netmarble、GameYarou、NexonJapan、Member）全部 ❌，這是刻意的——伺服器只走 Wasabii 這條路。**沒有任何一個標 ✅**：`DefaultInfo_SN`／`Complete_SN`／`Login_Again_SA` 都有送、次數也高（每次登入都送），但沒有 `[TEST]`／`[OBS]` 專門驗證過它們的 body 內容或行為，只是「有送、客戶端沒卡住」。

**C→S：** `0x00110124`（`Login_Again_CQ`，✅ [DLL] 名稱，`docs/state.md` 4c 節有完整 token 鏈分析）、`0x00110151`（Wasabii 登入 CQ，handler）、`0x00220131`（`CQ_LEAVE`，離開 Gate／9211 準備轉去遊戲伺服器，handler，`account.dispatch.js`/`gate.dispatch.js`）。

**UI 入口：** `ZPage_Login.uc`、`ZPage_LoginWasabii.uc`、`ZPage_Certify.uc`。

**缺口：** 帳號建立流程（`0x00210202 Create_SA`）完全沒送過，代表新帳號建立目前是伺服器端 heuristic（自動建號），不是走這個官方 SA；白名單任務（backlog W1）要接的位置就在這裡。

## 3. 大廳頻道

**opcode（S→C，16 個）：**

| Opcode | Handler | 狀態 | 出現次數(132份log) | 程式位置 |
|---|---|---|---|---|
| `0x00220101` | `Server_Add_SN` | ✅ | 120 | gate.game.dispatch.js |
| `0x00220102` | `Channel_Add_SN` | 🟡 | 120 | gate.game.dispatch.js |
| `0x00220113` | `Invite_User_Default_SN`（另一 handler 屬房間） | ❌ | 0 | — |
| `0x00220115` | `Leave_SA` | ❌ | 0 | — |
| `0x00220116` | `User_Delete_SN` | ❌ | 0 | — |
| `0x00220122` | `Search_User_SA` | 🟡 | 8 | gate.game.dispatch.js |
| `0x00220142` | `Request_SA` | ⬜(fallback-only) | 1 | — |
| `0x00220204` | `Room_List_SN` | 🟡 | 171 | lobby.dispatch.js,gamelogin.dispatch.js,room.dispatch.js,room-list.sender.js |
| `0x00220501` | `Chat_Channel_All_SN` | ⬜(code,unsent) | 0 | gate.game.dispatch.js |
| `0x00221102` | `Invite_Open_SA` | ⬜(fallback-only) | 2 | — |
| `0x00221104` | `Invite_SN` | ❌ | 0 | — |
| `0x00221112` | `Together_SN` | ❌ | 0 | — |
| `0x00221211` | `Option_Game_SN` | ❌ | 0 | — |
| `0x00221222` | `Option_Game_SA` | ❌ | 0 | — |
| `0x00221431` | `Advertise_Clear_SN` | ❌ | 0 | — |
| `0x00221432` | `Advertise_Add_SN` | ❌ | 0 | — |

只有 `Server_Add_SN`（登入時 `publicHost` 取代 127.0.0.1，`[LOG][OBS]` 已驗證第二台主機連得到）真正 ✅。`Room_List_SN` 雖然是多人排工的關鍵（第二個玩家在大廳看到既有房間），已有多個 D1-4 系列開關（`LOBBY_ROOM_LIST_MODE`）在送，但全部標「未實機驗證」（`journal/2026-09-19-0330-d1-step4-room-join.md` 系列），依規則只能是 🟡。頻道聊天 `Chat_Channel_All_SN` 程式碼有路徑但沒送過。邀請（`Invite_*`）、一起玩（`Together_SN`）、選項同步（`Option_Game_*`）、跑馬燈（`Advertise_*`）**完全沒動過**。

**C→S：** `0x00220111`（Gate 頻道進入 CQ，對應 `Gate_Lobby_Enter`）、`0x00220121`（玩家查詢 CQ，handler，`gate.game.dispatch.js` 註解「Player lookup」）、`0x00220141`（社群請求，fallback→`0x00220142`）。

**UI 入口：** `ZPage_Lobby.uc`、`ZPanel_Channel.uc`、`ZPopup_FindUserInfo.uc`、`ZPopup_Invitation.uc`。

**缺口：** 大廳頻道聊天完全沒實作（房間聊天已有 `ROOM_CHAT_BROADCAST_MODE`，大廳頻道沒有對應開關）；「一起玩」「邀請」等社交入口全部落到 fallback ACK。

## 4. 房間

**opcode（S→C，50 個）：**

| Opcode | Handler | 狀態 | 出現次數(132份log) | 程式位置 |
|---|---|---|---|---|
| `0x00210115` | `MapInfo_SN` | 🟡 | 125 | gamelogin.dispatch.js,map-info.sender.js |
| `0x00220202` | `Create_SA` | 🟡 | 143 | gate.game.dispatch.js |
| `0x00220203` | `Room_Default_SN` | ✅ | 368 | room.dispatch.js,room-state.sender.js |
| `0x00220212` | `MaxUser_Change_SA` | ⬜(fallback-only) | 17 | — |
| `0x00220213` | `Room_Boundary_SN` | ✅ | 368 | room.dispatch.js,room-state.sender.js |
| `0x00220214` | `Room_State_SN` | 🟡 | 368 | room.dispatch.js,room-state.sender.js |
| `0x00220216` | `Option_Change_SA` | 🟡 | 2 | gate.game.dispatch.js |
| `0x00220217` | `Room_Option_SN` | 🟡 | 368 | room.dispatch.js,room-state.sender.js |
| `0x00220219` | `Name_Change_SA` | 🟡 | 2 | gate.game.dispatch.js |
| `0x0022021a` | `Room_Name_SN` | ✅ | 370 | room.dispatch.js,room-string.js,room-state.sender.js |
| `0x0022021c` | `Password_Change_SA` | ❌ | 0 | — |
| `0x00220222` | `Map_Change_One_SA` | ✅ | 169 | gate.game.dispatch.js |
| `0x00220223` | `Map_Change_One_SN` | ✅ | 511 | room.dispatch.js,gate.game.dispatch.js,room-map.sender.js |
| `0x00220225` | `Map_Change_All_SA` | ❌ | 0 | — |
| `0x00220226` | `Map_Change_All_SN` | ✅ | 942 | room.dispatch.js,gate.game.dispatch.js,room-map.sender.js |
| `0x0022022a` | `Rotate_Next_SN` | ❌ | 0 | — |
| `0x00220232` | `Enter_SA` | 🟡 | 36 | gate.game.dispatch.js |
| `0x00220233` | `User_Default_SN` | 🟡 | 516 | room.dispatch.js,room-user.sender.js |
| `0x00220235` | `Leave_SA` | ✅ | 112 | gate.game.dispatch.js |
| `0x00220236` | `Leave_SN` | ✅ | 40 | gate.game.dispatch.js,room-leave.js |
| `0x00220312` | `Team_Change_SA` | ⬜(fallback-only) | 7 | — |
| `0x00220313` | `Team_Change_SN` | ❌ | 0 | — |
| `0x00220319` | `User_Master_SN` | 🟡 | 361 | room.dispatch.js,room-user.sender.js |
| `0x00220338` | `Kickout_SA` | ✅ | 4 | gate.game.dispatch.js |
| `0x00220401` | `User_State_SN` | ✅ | 571 | room.dispatch.js,gate.game.dispatch.js,room-user.sender.js |
| `0x00220402` | `User_Pilot_SN` | 🟡 | 516 | room.dispatch.js,room-user.sender.js |
| `0x00220421` | `User_Name_SN` | ✅ | 516 | room.dispatch.js,room-user.sender.js |
| `0x00220503` | `Chat_Room_Team_SN` | ⬜(code,unsent) | 0 | gate.game.dispatch.js |
| `0x00220505` | `Chat_Room_All_SN` | 🟡 | 97 | gate.game.dispatch.js |
| `0x00222102` | `Game_Ready_SN` | 🟡 | 140 | gate.game.dispatch.js |
| `0x00222104` | `Game_Start_SN` | 🟡 | 98 | gate.game.dispatch.js |
| `0x00222121` | `Team_Change_All_SN` | ❌ | 0 | — |
| `0x00222128` | `Rotate_Stop_SA` | ❌ | 0 | — |
| `0x00222129` | `Rotate_Stop_SN` | ❌ | 0 | — |
| `0x00223102` | `Matching_Start_SN` | ❌ | 0 | — |
| `0x00223103` | `Matching_Complete_SN` | ❌ | 0 | — |
| `0x00223104` | `Matching_List_SN` | ❌ | 0 | — |
| `0x00223112` | `Matching_Cancel_SN` | ❌ | 0 | — |
| `0x00223113` | `Matching_Cancel_Always_SN` | ❌ | 0 | — |
| `0x00223115` | `Matching_Break_SN` | ❌ | 0 | — |
| `0x00223116` | `Matching_Break_Always_SN` | ❌ | 0 | — |
| `0x00410102` | `Regist_SA` | ❌ | 0 | — |
| `0x00410103` | `Clear_SQ` | ❌ | 0 | — |
| `0x00420111` | `Game_Wait_SN` | ✅ | 107 | gate.game.dispatch.js |
| `0x00420112` | `Ready_Failed_SN` | ❌ | 0 | — |
| `0x00420113` | `Ready_Host_SQ` | ✅ | 98 | gate.game.dispatch.js |
| `0x00420115` | `Ready_Host_SN` | ✅ | 27 | gate.game.dispatch.js |
| `0x00420116` | `Ready_Success_SN` | 🟡 | 95 | room.dispatch.js,gate.game.dispatch.js,community.dispatch.js |
| `0x00420121` | `HostChange_SN` | ❌ | 0 | — |
| `0x00420133` | `Leave_SN` | ❌ | 0 | — |

這是覆蓋率最高、但「已驗證」比例最被高估的系統：14 個 ✅ 大多是**單人**行為驗證（房間格子、名稱、地圖同步、踢人），2026-09-19 的 D1 系列（房間清單、加入、聊天廣播、開戰廣播、Ready 廣播等，見 `docs/journal/INDEX.md` 大量「未實機驗證」條目）都還沒有雙機實測，依規則只能 🟡。配對（`Matching_*` 7 個）、等待室（`0x0041xxxx`）、隊伍切換（`Team_Change_*`）、循環地圖（`Rotate_*`）全部 ❌。

**戰鬥中參與／`IsIntrude`（中途加入）：** 客戶端 `ZPanel_RoomInfo.uc` 的 `co_Intrude`（`:66`、`:355-357`）讀 `RoomInfo.IsIntrude`（`:618`、`:629`），依房型決定顯示或隱藏（`:624-643`）；彈窗字串 `RAGEMODE_INTRUDE_ONLY` 暗示這跟 Rage 模式有關。已知 wire 欄位：`Room_Option_Change_CQ 0x00220215` body+2 = `IsIntrude`（DLL sender `0x107eeb80`）。伺服器目前**完全沒有處理** `0x00220215`（見下方 C→S 表，只落在 fallback）。⬜，另有專門的 INTRUDE 分析任務在追這個欄位的完整格式，這裡只記錄入口與已知欄位。

**C→S（handler 或 fallback，依 log 與程式碼）：**

| Opcode | 名稱（依據） | 狀態 | 次數 |
|---|---|---|---|
| `0x00220201` | `CQ_CREATE` 建房 | handler | 143 |
| `0x00220211` | `MaxUser_Change_CQ` | fallback ACK（`→0x00220212`） | 17 |
| `0x00220215` | `Room_Option_Change_CQ`（body+2＝`IsIntrude`，DLL `0x107eeb80`） | fallback ACK（`→0x00220216`），**完全沒讀 body** | 2 |
| `0x00220218` | `Name_Change_CQ` | handler | 3 |
| `0x00220221` | `Map_Change_One_CQ` | handler | 169 |
| `0x00220231` | `Enter_CQ` 加入房間 | handler | 36 |
| `0x00220234` | `Leave_CQ` | handler | 116 |
| `0x00220311` | `Team_Change_CQ` | fallback ACK | 7 |
| `0x00220337` | `Kickout_CQ` | handler | 4 |
| `0x00220505` | 房間聊天（同 SN opcode） | handler（廣播，開關） | 85 |
| `0x00221101` | `Invite_Open_CQ` | fallback ACK | 2 |
| `0x00221221` | 硬體/畫質回報（純 CN） | handler（只 ACK，不回應） | 18 |
| `0x00222101` | 場景載入完成／準備（`Game_Ready_CN`） | handler | 42 |
| `0x00222103` | 房主按 F5 開始 | handler | 92 |
| `0x00222131` | 戰鬥中離開 CN | fallback ACK（`→0x00222132`） | 49 |
| `0x00223114` | 配對相關（名稱未知） | fallback ACK | 1 |
| `0x00420114` | `Ready_Host_CA`（房主回報監聽埠） | handler | 88 |
| `0x00420117` | `Battle_Success_CN`（地圖載入完成） | fallback ACK（回 `0x00420118`，客戶端沒這個 handler，等於沒回） | 78 |
| `0x00420132` | 名稱未知（`ZDispatchWaiting` 範圍） | fallback ACK | 5 |

**UI 入口：** `ZPage_Room.uc`、`ZPopup_CreateRoom.uc`、`ZPopup_RoomSet.uc`、`ZPanel_RoomInfo.uc`、`ZPanel_TeamMember.uc`、`ZPopup_MapSelect.uc`、`ZPanel_QuickMatch.uc`（配對，完全未動）。

## 5. PvE 模式

**opcode（S→C，16 個，含遊戲內聊天）：**

| Opcode | Handler | 狀態 | 出現次數(132份log) | 程式位置 |
|---|---|---|---|---|
| `0x00220507` | `Chat_Game_Team_SN` | ✅ | 8 | gate.game.dispatch.js |
| `0x00220509` | `Chat_Game_All_SN` | ✅ | 0 | gate.game.dispatch.js |
| `0x00222111` | `Game_Info_SN` | ✅ | 452 | gate.game.dispatch.js |
| `0x00222112` | `Game_User_SN` | ✅ | 103 | gate.game.dispatch.js,room-game-user.sender.js |
| `0x00230102` | `ChangeSlot_SN` | ✅ | 104 | lobby.dispatch.js |
| `0x00230104` | `Respawn_SN` | ✅ | 194 | lobby.dispatch.js |
| `0x00230106` | `InstantRespawn_SN` | ⬜(code,unsent) | 0 | lobby.dispatch.js |
| `0x00230112` | `Timeout_SN` | 🟡 | 801 | lobby.dispatch.js,gamelogin.dispatch.js,room.dispatch.js |
| `0x00230122` | `Assist_SN` | 🟡 | 459 | lobby.dispatch.js |
| `0x00230124` | `Death_SN` | ✅ | 3087 | lobby.dispatch.js |
| `0x00230126` | `Special_SN` | ⬜(fallback-only) | 3 | — |
| `0x00230138` | `Boss_SN` | ❌ | 0 | — |
| `0x0023013a` | `Campaign_SN` | 🟡 | 522 | room.dispatch.js,gate.game.dispatch.js,room-map.sender.js |
| `0x0023013c` | `TwoBoss_SN` | ❌ | 0 | — |
| `0x0023013e` | `TriggerTouch_SN` | ❌ | 0 | — |
| `0x00230152` | `BeginRound_SN` | ✅ | 117 | lobby.dispatch.js,room.dispatch.js,gate.game.dispatch.js |

**只有一般戰役（Campaign）打通**：開戰、出場、死亡／重生、回合推進（`EndRound_SN`，見「結算與成長」節）、遊戲內聊天都有 `[TEST]`／`[OBS]` 證據。`Boss_SN`／`TwoBoss_SN`／`TriggerTouch_SN`（[SRC] `ZNetwork_DJ.uc:1896-1900`：보스미션/2보스미션，Boss／TwoBoss 任務）**完全沒送過**，代表 Boss、TwoBoss 兩種 PvE 任務類型即使地圖能載入，伺服器也從沒送過任何 Boss 專屬事件。`ZModeTutorial`、`ZModeEscortPve`（教學、護送）對應的模式檔案存在，但沒有找到專屬 opcode（教學可能完全走本機腳本，不經伺服器；見下方 UI 入口）。

**C→S：** `0x00230101`（`ChangeSlot_CN`，handler）、`0x00230103`（`Respawn_CN`，handler）、`0x00230111`（`Timeout_CN`，戰鬥中每秒一次心跳，**伺服器故意不回**，`unhandled` 8900 次）、`0x00230121`（`Assist_CN`，handler，回空 body）、`0x00230123`（`Death_CN`，handler）、`0x00230125`（`Special_CN`，fallback ACK→`0x00230126`）、`0x00230139`（`Campaign_CN`，handler）、`0x00230151`（`BeginRound_CN`，handler）、`0x00220507`/`0x00220509`（遊戲內聊天，C→S 與 S→C 共用同一 opcode，handler，原樣廣播）。

`0x00250102`（"게임 씬 진입 알림"／遊戲場景進入通知，`game.dispatch.js` 註解）觸發 `Ready_Host_SQ`；這個 opcode 落在 `0x0025xxxx`（Card 範圍）但語意其實是開戰交握的一部分，是 `docs/state.md` 第 5 節記錄過的檔名/opcode 對不上的案例之一，這裡歸入 PvE 模式（房間→戰鬥交握）而不是卡片。

**UI 入口：** `ZPanel_PVE.uc`、`ZPage_TutorialTGS.uc`、`ZPopup_TutorMission.uc`（教學任務彈窗，未接觸）、`ZPage_PveResult.uc`、`ZPage_TutorialResult.uc`（結算頁，見下節）。

**缺口：** Boss／TwoBoss／教學／護送四種模式，客戶端都有專屬腳本和 opcode，伺服器一個都沒碰過；規模估計 L（每種都要重播對應的 `Game_*` 動作 opcode，且不確定地圖資源是否已支援離線測試）。

## 6. PvP 模式

**opcode（S→C，3 個確認的模式事件）：**

| Opcode | Handler | 狀態 | 出現次數(132份log) | 程式位置 |
|---|---|---|---|---|
| `0x00230132` | `Capture_SN` | ⬜(code,unsent) | 0 | lobby.dispatch.js |
| `0x00230134` | `Conquest_SN` | ❌ | 0 | — |
| `0x00230136` | `Bomb_SN` | ❌ | 0 | — |

`Capture_SN` 有一個空的 case（`lobby.dispatch.js`），但從沒被觸發過。**PvP 完全沒有開戰路徑**：目前的開戰序列（`journal/2026-09-16-15` 起）只驗證過戰役房（`campaignRoom_=true`）；`journal/2026-09-15-03-campaign-only-start-flow-pvp-blocked.md` 明確記錄 PvP 房開戰被擋。

**客戶端模式清單**（`~/mro-decrypted/src/` 檔名，[SRC] 只是檔案存在，不代表伺服器有對應實作）：`ZTeamDM`（含 `ZTeamDMPractice`／`ZTeamDMTutorial`）、`ZModeBlow`（爆破／Bomb）、`ZModeCapture`（奪取）、`ZModeOccupation`（占領／Conquest）、`ZModeRage`（Rage 模式，前一節 `IsIntrude` 疑似跟這個模式有關）、`ZModeSuddenDeath`（Sudden Death）、`ZModeBot`（AI 練習）。這些模式各自的伺服器端事件 opcode（Korean 原始碼：`Game_Capture`／`Game_Bomb`／`Game_Conquest` 對應 `Capture_SN`／`Bomb_SN`／`Conquest_SN`；TDM／Rage／Sudden Death 目前沒找到專屬事件 opcode，可能沿用 `Game_Info_SN` 的 `GameMode` 欄位區分，⬜未查）。

**規模估計：L。** 除了 opcode 本身，還需要：(1) PvP 房開戰序列（目前完全未知會不會卡在跟 PvE 不同的檢查點）；(2) 隊伍平衡／出生點；(3) 每種模式各自的目標物（旗幟、炸彈、據點）同步。roadmap 已把 PvP 列為延伸目標（M4 TDM），與本盤點的「未動」結論一致。

## 7. 結算與成長

**opcode（S→C，17 個）：**

| Opcode | Handler | 狀態 | 出現次數(132份log) | 程式位置 |
|---|---|---|---|---|
| `0x00210102` | `PlayInfo_SN` | 🟡 | 236 | gamelogin.dispatch.js |
| `0x00210103` | `RecordInfo_SN` | ✅ | 236 | money.js,gamelogin.dispatch.js |
| `0x00210104` | `Reward_Record_Mech_SN`（另一 handler `MechLevel_SN` 屬登入啟動） | 🟡 | 235 | gamelogin.dispatch.js |
| `0x00210105` | `Rank_SN` | ❌ | 0 | — |
| `0x00220411` | `User_Levelup_SN` | ❌ | 0 | — |
| `0x00220412` | `Reward_Record_User_SN` | ❌ | 0 | — |
| `0x00222114` | `Game_Score_SN` | ❌ | 0 | — |
| `0x00222132` | `Leave_SA`（戰鬥中離開的回應） | ⬜(fallback-only) | 49 | — |
| `0x00222211` | `EndRound_SN` | 🟡 | 9 | lobby.dispatch.js |
| `0x00222212` | `EndQuater_SN` | ❌ | 0 | — |
| `0x00222213` | `EndGame_SN` | 🟡 | 18 | lobby.dispatch.js |
| `0x00222221` | `User_Score_SN` | 🟡 | 1 | lobby.dispatch.js |
| `0x00222231` | `Reward_Levelup_User_SN` | ❌ | 0 | — |
| `0x00222232` | `Reward_Levelup_Mech_SN` | ❌ | 0 | — |
| `0x00222233` | `Reward_FirstReceiveExp_User_SN` | ❌ | 0 | — |
| `0x00240612` | `Account_Reset_KillDeath_SA` | ❌ | 0 | — |
| `0x00240622` | `Account_Reset_Record_SA` | ❌ | 0 | — |

**通關流程本身能跑**（`Campaign_CN`→`EndRound_SN`／`EndGame_SN` 已 `[LOG][OBS]`，見 PvE 節），但結算的「內容」幾乎全是佔位：`EndGame_SN`／`EndRound_SN` 的分數欄位全部送 0（backlog RANK 已分析根因：評等由 `User_Score_SN 0x00222221` 的 `WinTeamRank` 決定，伺服器只送過 1 次、且公式未定），升級、獎勵、首次獲得經驗值等 4 個 `Reward_*` opcode **完全沒送過**——代表玩家打完一場，帳號的等級、勳章、經驗值即使 DB 有記，客戶端畫面上也看不到對應的「升級了！」「獲得獎勵」提示。`Rank_SN`（可能是排行榜或個人段位，⬜語意未查）也從沒送過。

**UI 入口：** `ZPage_GameResult.uc`、`ZPage_PveResult.uc`、`ZPage_RageResult.uc`、`ZPage_TutorialResult.uc`、`ZPanel_LevelUp.uc`、`ZPanel_MedalUp.uc`、`ZPopup_Experience.uc`。

**規模估計：M。** opcode 名稱都已知，缺的是公式（exp／評等／勳章條件）與逐欄位格式，屬於「先定規則、再照 DLL 核對 body」的工作，不是新架構。

## 8. 機庫與裝備

**opcode（S→C，22 個，另計 ItemInfo／WearInfo 已在登入清單送出）：**

| Opcode | Handler | 狀態 | 出現次數(132份log) | 程式位置 |
|---|---|---|---|---|
| `0x00210111` | `ItemInfo_SN` | ✅ | 838 | gamelogin.dispatch.js,room.dispatch.js,item-info.sender.js |
| `0x00210113` | `WearInfo_SN` | ✅ | 323 | gamelogin.dispatch.js,room.dispatch.js |
| `0x00240102` | `Open_SA` | 🟡 | 84 | room.dispatch.js |
| `0x00240104` | `Close_SA` | 🟡 | 71 | room.dispatch.js |
| `0x00240106` | `Pilot_Change_SA` | ❌ | 0 | — |
| `0x00240108` | `Slot_Change_SA` | ✅ | 214 | room.dispatch.js |
| `0x00240109` | `Slot_Change_SN` | ❌ | 0 | — |
| `0x00240112` | `DefaultSlot_Change_SA` | ⬜(code,unsent) | 0 | room.dispatch.js |
| `0x00240113` | `DefaultSlot_Change_SN` | 🟡 | 36 | room.dispatch.js |
| `0x00240115` | `DefaultSlot_Empty_SN` | ❌ | 0 | — |
| `0x00240122` | `Item_Active_SA` | ❌ | 0 | — |
| `0x00240124` | `Item_Delete_SA` | ❌ | 0 | — |
| `0x00240126` | `Item_Use_SA` | ❌ | 0 | — |
| `0x00240131` | `Packege_Item_SN` | 🟡 | 89 | room.dispatch.js |
| `0x00240132` | `Packege_Point_SN` | ✅ | 89 | money.js,room.dispatch.js |
| `0x00240133` | `Packege_Coupon_SN` | 🟡 | 89 | room.dispatch.js |
| `0x00240152` | `Increase_UpgradeSlot_Size_SA` | ❌ | 0 | — |
| `0x00240154` | `Save_ReinforceStone_SA` | ❌ | 0 | — |
| `0x00240602` | `Nick_Name_Change_SA` | ❌ | 0 | — |
| `0x00240603` | `Nick_Name_Change_SN` | ❌ | 0 | — |
| `0x00240702` | `RandomBox_Open_SA` | ❌ | 0 | — |
| `0x00240711` | `RandomBox_Notify_SN` | ⬜(code,unsent) | 0 | room.dispatch.js |

核心迴圈（開機庫→看庫存／裝備→換裝→存檔→帶進 PvE）已 ✅，包含 2026-09-19 完成的 E1（IsShare 共享裝備拆帳，`item_equips` 表）與 P1B（預設武器不發實體物品），但這兩批**全部未實機驗證**（`journal/2026-09-19-1639-e1-item-equips.md`、`-1731-p1b-default-items.md` 都寫「未實機驗證」），所以在本表只影響底層資料結構，不會讓 `WearInfo_SN`／`ItemInfo_SN` 從 ✅ 降級（那兩個 opcode 本身另有更早的 `[TEST]` 依據）。**完全沒碰過**的：機師切換（`Pilot_Change_SA`）、單品啟用／刪除／使用（`Item_Active`／`Item_Delete`／`Item_Use`）、機體槽位擴充（`Increase_UpgradeSlot_Size`）、強化石（`Save_ReinforceStone`）、暱稱改名（`Nick_Name_Change`）、補給箱（`RandomBox_*`）。

**C→S：** `0x00240101`（Hangar 開啟 CQ，handler）、`0x00240103`（Hangar 關閉 CQ，handler）、`0x00240107`（`Slot_Change_CQ`，handler）。`Hangar_Item_Merge`／`Hangar_Item_Use`／`Hangar_Item_Remove`／`Hangar_Pilot_Change`／`Hangar_RandomBox_Open`／`Hangar_License_Obtain`／`Hangar_Increase_UpgradeSlot`／`Hangar_ReinforceStone_Use`（[SRC] `ZNetwork_DJ.uc:1992-2010`）在 132 份 log 裡**從未出現過**，只能確認客戶端「有這個按鈕」，沒有任何封包格式線索。

**UI 入口：** `ZPage_Hangar.uc`、`ZPanel_InvenItems.uc`、`ZPanel_WeaponInfo.uc`、`ZPanel_StoneInfo.uc`（強化石）、`ZPopup_SubEquip.uc`、`ZPopup_MetalBox.uc`（補給箱）。

**規模估計：M。** 骨架已經在，缺的是週邊功能（強化石、補給箱、機師）各自的封包格式，都要先等到操作者實際點開對應 UI 才有封包可看（log 裡完全沒出現過）。

## 9. 商店與現金商店

**opcode（S→C，11 個）：**

| Opcode | Handler | 狀態 | 出現次數(132份log) | 程式位置 |
|---|---|---|---|---|
| `0x00240202` | `Buy_PointItem_SA` | ✅ | 53 | money.js,room.dispatch.js |
| `0x00240204` | `Buy_CashItem_SA` | ❌ | 0 | — |
| `0x00240206` | `Charge_PeriodPointItem_SA` | ❌ | 0 | — |
| `0x00240208` | `Charge_PeriodCashItem_SA` | ❌ | 0 | — |
| `0x0024020a` | `Charge_StackPointItem_SA` | ❌ | 0 | — |
| `0x0024020c` | `Charge_StackCashItem_SA` | ❌ | 0 | — |
| `0x00240212` | `CashReLoad_SA` | ❌ | 0 | — |
| `0x00240213` | `CashReLoad_SN` | ❌ | 0 | — |
| `0x00240222` | `ChargeSerialKey_SA` | ❌ | 0 | — |
| `0x00240241` | `ShopList_SN` | 🟡 | 12587 | room.dispatch.js |
| `0x00240242` | `CashShopList_SN` | 🟡 | 12587 | room.dispatch.js |

G 幣購買（`Buy_PointItem_SA`）已 ✅（含持久化，`[DLL][LOG][DB][OBS]` M1）。**現金商城完全沒實作**：`CashShopList_SN` 雖然每次開機庫都送（12587 次，等於每台機都送一份），但客戶端收到後能不能顯示、能不能按下去購買（`Buy_CashItem_SA` 從沒送過）完全未知；期限品／堆疊品的加值（`Charge_Period*`／`Charge_Stack*`）、儲值找零（`CashReLoad_*`）、序號兌換（`ChargeSerialKey_SA`）全 ❌。這對應 roadmap「經濟系統全部開放」的目標，目前只有 G 幣單品購買這一條路能用。

**C→S：** `0x00240201`（Buy CQ，handler，`money.js`/`room.dispatch.js`）。`Hangar_Item_Buy`（native，`PayType` 1＝Point、2＝Cash）看起來是同一個 CQ 帶不同 `PayType`，但伺服器目前是否分流處理 Cash 路徑未查（`⬜`，需要再讀一次 `room.dispatch.js` 的 `0x00240201` handler body 解析部分，本盤點沒有進去看內部邏輯，只確認有沒有這個 case）。

**UI 入口：** `ZPanel_ShopItems.uc`、`ZPopup_Buy.uc`、`ZPopup_CashPassword.uc`。

**規模估計：M。** 現金幣別在 DB（`accounts.cash`）已經有欄位（`MONEY_PERSIST_MODE` 已含 Cash），缺的主要是 Cash 購買分支與加值/序號流程的 body 格式。

## 10. 物品期限／授權／修理

**opcode（S→C，6 個）：**

| Opcode | Handler | 狀態 | 出現次數(132份log) | 程式位置 |
|---|---|---|---|---|
| `0x00210112` | `ExpirationItem_SN` | ❌ | 0 | — |
| `0x00240142` | `Item_Period_Merge_SA` | ❌ | 0 | — |
| `0x00240144` | `Item_Stack_Merge_SA` | ❌ | 0 | — |
| `0x00240301` | `Item_Expiration_SN` | ⬜(code,unsent) | 0 | room.dispatch.js,gate.game.dispatch.js |
| `0x00240632` | `License_Obtain_SA` | ❌ | 0 | — |
| `0x00260101` | `LicenseInfo_SN` | 🟡 | 235 | gamelogin.dispatch.js,community.dispatch.js |

`LicenseInfo_SN` 每次登入都送（235 次），但沒有 `[TEST]` 驗證內容；其餘全部沒碰。這裡跟「Legend 機體授權」（`docs/state.md` 4 節「Legend（時限）機體有授權機制…填這個欄位的封包未知 ⬜」、backlog「查明填 IsLicense 的封包」）是同一個缺口：`Mech_License_Check`／`IsLicense` 用哪個封包填、期限品到期時客戶端怎麼被通知（`Item_Expiration_SN`／`ExpirationItem_SN` 兩個候選都沒送過）完全沒有解。這也是卡片系統「集滿卡片換永久傳說機」流程收尾要用到的欄位（見第 13 節）。「修理」在目前找到的 opcode 裡沒有獨立對應項，可能不需要修理機制（原版可能沒有耐久度系統），⬜待查。

**UI 入口：** `ZPopup_ItemExpiration.uc`。

**規模估計：M。** 主要工作是先確認客戶端在哪個時機查詢／被動接收授權和到期資訊，再定 body 格式。

## 11. 好友／密語

**opcode（S→C，16 個，全 ❌）：**

| Opcode | Handler | 狀態 | 出現次數(132份log) | 程式位置 |
|---|---|---|---|---|
| `0x00220512` | `Whisper_User_SA` | ❌ | 0 | — |
| `0x00220513` | `Whisper_User_SN` | ❌ | 0 | — |
| `0x00320101` | `FriendList_Add_SN` | ❌ | 0 | — |
| `0x00320102` | `FriendList_Empty_SN` | ❌ | 0 | — |
| `0x00320103` | `Load_Failed_SN` | ❌ | 0 | — |
| `0x00320202` | `Friendship_Ask_SN` | ❌ | 0 | — |
| `0x00320203` | `FriendList_Request_SN` | ❌ | 0 | — |
| `0x00320205` | `Friendship_Answer_SN` | ❌ | 0 | — |
| `0x00320206` | `FriendList_Response_SN` | ❌ | 0 | — |
| `0x00320209` | `Friendship_Break_SA` | ❌ | 0 | — |
| `0x00320210` | `FriendList_Delete_SN` | ❌ | 0 | — |
| `0x00320212` | `Whisper_Friend_SN` | ❌ | 0 | — |
| `0x00320213` | `FriendList_Online_SN` | ❌ | 0 | — |
| `0x00320214` | `FriendList_Offline_SN` | ❌ | 0 | — |
| `0x00320221` | `FriendList_ClanEmblem_SN` | ❌ | 0 | — |
| `0x00320231` | `FriendUser_Nick_Change_SN` | ❌ | 0 | — |

好友清單、加好友、應答、刪除、上下線通知、密語（大廳私聊與好友私聊各自獨立 opcode）**完全沒有任何實作**，是這次盤點裡「客戶端明顯有大量支援但伺服器零碰觸」的代表系統之一。

**C→S：** `0x00320104` 有一個 handler（`community.dispatch.js:205`），但程式碼註解自己標成「Card CQ」，回 `0x00320105`（16 bytes 全 0）——這是一個**分類矛盾**：opcode 數值屬於 `ZDispatchFriend` 的範圍（`0x0032xxxx`），且送出時機是「頻道進入後立刻送、0-byte body」，比較像是好友清單的初始查詢（對照 `ZNetwork_DJ.uc` 沒有直接列出對應的好友初始化 native，需要再查）；而 `0x00320105` **不在** `docs/client-dispatch-map.md` 裡，代表客戶端可能根本沒有這個 SA 的 handler，這個回應很可能跟 `docs/state.md` 第 5 節列的其他「送了等於沒送」案例一樣無效。這裡標記為疑點，不下結論，只依現狀歸類到好友／密語（依 opcode 數值），不採信程式碼自己的「Card CQ」註解。

**UI 入口：** `ZPanel_Chat.uc`（密語輸入）、`ZPopup_FindUserInfo.uc`。好友清單面板在列出的 `ZGameMainMenu` 檔案裡沒有找到獨立檔名（可能併在 `ZPage_Lobby.uc` 或 `ZPanel_Interface.uc` 裡），未逐一確認，⬜。

**規模估計：M。** opcode 齊全、語意清楚（韓文原始碼直接寫「친구 요청」等），主要工作是新增一張好友關係表＋清單/上下線通知，不需要新的跨連線架構（可以疊在 D1 房間模型之後做的「送給特定帳號」機制上）。

## 12. 公會

**opcode（S→C，57 個，56 個 ❌，1 個 fallback-only）：**

| Opcode | Handler | 狀態 | 出現次數(132份log) | 程式位置 |
|---|---|---|---|---|
| `0x00360101` | `Load_Waiting_SN` | ❌ | 0 | — |
| `0x00360102` | `Load_Failed_SN` | ❌ | 0 | — |
| `0x00360103` | `ClanInfo_Empty_SN` | ❌ | 0 | — |
| `0x00360105` | `ClanServer_Disconnect_SN` | ❌ | 0 | — |
| `0x00360112` | `Open_SA` | ❌ | 0 | — |
| `0x00360122` | `Close_SA` | ❌ | 0 | — |
| `0x00360202` | `Search_Clan_SA` | ❌ | 0 | — |
| `0x00360212` | `Create_Check_SA` | ❌ | 0 | — |
| `0x00360222` | `Create_SA` | ❌ | 0 | — |
| `0x00360232` | `Destroy_SA` | ❌ | 0 | — |
| `0x00360242` | `Join_Open_SA` | ❌ | 0 | — |
| `0x00360252` | `Member_Join_SA` | ❌ | 0 | — |
| `0x00360253` | `Member_Join_SN` | ❌ | 0 | — |
| `0x00360262` | `Join_Accept_SA` | ❌ | 0 | — |
| `0x00360263` | `Join_Accept_SN` | ❌ | 0 | — |
| `0x00360272` | `Join_Reject_SA` | ❌ | 0 | — |
| `0x00360273` | `Join_Reject_SN` | ❌ | 0 | — |
| `0x00360301` | `ClanInfo_SN` | ❌ | 0 | — |
| `0x00360302` | `ClanUserInfo_SN` | ❌ | 0 | — |
| `0x00360303` | `Join_Open_SN` | ❌ | 0 | — |
| `0x00360401` | `Online_SN` | ❌ | 0 | — |
| `0x00360402` | `Offline_SN` | ❌ | 0 | — |
| `0x00360412` | `Grade_Change_SA` | ❌ | 0 | — |
| `0x00360413` | `Grade_Change_SN` | ❌ | 0 | — |
| `0x00360414` | `ClanUserInfo_Add_SN` | ❌ | 0 | — |
| `0x00360422` | `Secede_SA` | ❌ | 0 | — |
| `0x00360423` | `Secede_SN` | ❌ | 0 | — |
| `0x00360432` | `Kickout_SA` | ❌ | 0 | — |
| `0x00360433` | `Kickout_SN` | ❌ | 0 | — |
| `0x00360452` | `Master_Change_SA` | ❌ | 0 | — |
| `0x00360453` | `Master_Change_SN` | ❌ | 0 | — |
| `0x00360461` | `Invite_User_Clan_SN` | ❌ | 0 | — |
| `0x00360462` | `User_Clan_Add_SN` | ❌ | 0 | — |
| `0x00360463` | `User_Clan_Clear_SN` | ❌ | 0 | — |
| `0x00360464` | `User_Clan_Delete_SN` | ❌ | 0 | — |
| `0x00360471` | `Reset_Clanner_WinLose_SN` | ❌ | 0 | — |
| `0x00360472` | `Reset_Clanner_KillDeath_SN` | ❌ | 0 | — |
| `0x00360502` | `Introduce_Change_SA` | ❌ | 0 | — |
| `0x00360503` | `Introduce_Change_SN` | ❌ | 0 | — |
| `0x00360512` | `Notice_Change_SA` | ❌ | 0 | — |
| `0x00360513` | `Notice_Change_SN` | ❌ | 0 | — |
| `0x00360524` | `Emblem_Change_SA` | ❌ | 0 | — |
| `0x00360525` | `Emblem_Change_SN` | ❌ | 0 | — |
| `0x00360534` | `Clan_Name_Change_SA` | ❌ | 0 | — |
| `0x00360535` | `Clan_Name_Change_SN` | ❌ | 0 | — |
| `0x00360542` | `Limit_Expansion_SA` | ❌ | 0 | — |
| `0x00360543` | `Limit_Expansion_SN` | ❌ | 0 | — |
| `0x00360551` | `ClanUser_Nick_Change_SN` | ❌ | 0 | — |
| `0x00360562` | `Reset_Clan_Record_SA` | ❌ | 0 | — |
| `0x00360563` | `Reset_Clan_Record_SN` | ❌ | 0 | — |
| `0x00360602` | `Chat_Clan_All_SN` | ⬜(fallback-only) | 2 | — |
| `0x00360612` | `Whisper_Claner_SA` | ❌ | 0 | — |
| `0x00360613` | `Whisper_Claner_SN` | ❌ | 0 | — |
| `0x00360712` | `Invite_SA` | ❌ | 0 | — |
| `0x00360713` | `Invite_SN` | ❌ | 0 | — |
| `0x00360801` | `ClanScore_SN` | ❌ | 0 | — |
| `0x00360802` | `ClanMemberScore_SN` | ❌ | 0 | — |

**公會是客戶端功能最完整、伺服器最完全沒碰過的系統**：57 個 opcode（開／關、建立、搜尋、加入審核、成員管理、職級、公告、徽章、改名、擴編、戰績重設、公會聊天、私聊、邀請、公會排名／成員排名）全部 ❌，唯一一次「回應」是 `0x00360601` 公會聊天 CQ 落到 fallback，回了 2 次無效 ACK。`ClanScore_SN`／`ClanMemberScore_SN` 是本盤點裡最接近「排行榜」語意的 opcode（見第 15 節），但完全沒送過。

**C→S：** 只確認過 `0x00360601`（公會聊天 CQ，fallback）。其餘全部靠 `ZNetwork_DJ.uc:2089-2128`（`Clan_Open`／`Clan_Create`／`Clan_Join`／`Clan_Member_Grade`／`Clan_Member_Kickout` 等）確認客戶端有這些動作，132 份 log 一次都沒出現過。

**UI 入口：** `ZPage_MyClan.uc`、`ZPanel_ClanManage.uc`、`ZPanel_ClanMember.uc`、`ZPanel_ClanRanking.uc`、`ZPanel_ClanSearch.uc`、`ZPanel_CreateClan.uc`、`ZPanel_FindClan.uc`、`ZPopup_Clan*.uc`（7 個彈窗）。

**規模估計：L。** 公會是全新的跨帳號共享實體（成員清單、職級、公告），架構上跟房間類似（需要一個「送給公會全體」的廣播機制），建議排在 D1 房間廣播模式驗證完之後再做，可以重用同一套「送給一群連線」的輔助函式。

## 13. 郵件／禮物

**opcode（S→C，21 個）：**

| Opcode | Handler | 狀態 | 出現次數(132份log) | 程式位置 |
|---|---|---|---|---|
| `0x00240512` | `Gift_Send_SA` | ❌ | 0 | — |
| `0x00240513` | `Gift_Send_SN` | ❌ | 0 | — |
| `0x00240522` | `Send_UserItem_SA` | ❌ | 0 | — |
| `0x00310102` | `Open_SA` | ⬜(code,unsent) | 0 | community.dispatch.js |
| `0x00310104` | `Close_SA` | ❌ | 0 | — |
| `0x00310111` | `Option_Community_SN` | ❌ | 0 | — |
| `0x00310122` | `Option_Community_SA` | ❌ | 0 | — |
| `0x00310201` | `Mail_Info_SN` | ⬜(code,unsent) | 0 | community.dispatch.js |
| `0x00310202` | `Mail_List_SN` | 🟡 | 8 | community.dispatch.js |
| `0x00310212` | `Mail_Send_SA` | ❌ | 0 | — |
| `0x00310213` | `Mail_Send_SN` | 🟡 | 8 | community.dispatch.js |
| `0x00310215` | `Mail_Read_SA` | ❌ | 0 | — |
| `0x00310217` | `Mail_Refresh_SA` | ❌ | 0 | — |
| `0x00310219` | `Mail_Delete_SA` | ❌ | 0 | — |
| `0x00310301` | `Gift_Info_SN` | ❌ | 0 | — |
| `0x00310302` | `Gift_List_SN` | ❌ | 0 | — |
| `0x00310315` | `Gift_Read_SA` | ❌ | 0 | — |
| `0x00310317` | `Gift_Receive_SA` | ❌ | 0 | — |
| `0x00310319` | `Gift_Refresh_SA` | ❌ | 0 | — |
| `0x0031031b` | `Gift_Delete_SA` | ❌ | 0 | — |
| `0x00310321` | `Packege_Item_SN` | ❌ | 0 | — |

只有站內信清單／寄信有極粗淺的路徑（`Mail_List_SN`／`Mail_Send_SN` 各送過 8 次，無 `[TEST]`），讀信、刪信、重新整理、禮物（收發、讀取、領取、刪除）全部 ❌。機庫端的送禮物（`Gift_Send_SA/SN`、`Send_UserItem_SA`）也完全沒碰。

**C→S：** `0x00310216`（Mail 重新整理 CQ，handler，`community.dispatch.js:126`）、`0x00310318`（禮物相關 CQ，fallback ACK，無回應內容）。其餘（`Postbox_Mail_Send`／`Mail_Read`／`Mail_Delete`／`Gift_Send`／`Gift_Read`／`Gift_Receive`／`Gift_Delete`，[SRC] `ZNetwork_DJ.uc:2038-2051`）從沒出現過。

**UI 入口：** `ZPopup_Mail.uc`、`ZPopup_SendMail.uc`、`ZPopup_RecvMail.uc`、`ZPopup_SendGift.uc`、`ZPopup_RecvGift.uc`、`ZPopup_ViewGift.uc`。

**規模估計：M。** 跟好友一樣，opcode 語意清楚、不需要新架構，只是完全沒人碰過。

## 14. 卡片

> 原版玩法對照：`docs/research/2026-09-19-card-system/notes.md`（操作者提供的 2011 巴哈姆特文章與留言，玩家記述、非官方規格）——選一款要收集的傳說機種開始抽卡；用 G 幣或優惠券抽（身上要 ≥3000G）；抽卡介面可調整張數；多餘卡片湊滿 6 張可換 1～2 次抽卡（按「交換卡片」，沒按就直接抽會被送回集卡冊）；集滿一款後，右下角金色 legend 亮起，點下去把**永久傳說機甲**直接放進格納庫（不經信箱），但要先擁有對應的原型機甲才能換、還要手動裝備上去才能在實戰用；卡片不能交易。

**opcode（S→C，16 個）：**

| Opcode | Handler | 狀態 | 出現次數(132份log) | 程式位置 | 對照原版玩法（🟡 依 opcode 名稱＋文章，格式未經 DLL 核對） |
|---|---|---|---|---|---|
| `0x00250101` | `Load_Failed_SN` | ⬜(code,unsent) | 0 | game.dispatch.js | 讀取失敗通知 |
| `0x00250112` | `Open_SA` | ❌ | 0 | — | 開卡片頁 |
| `0x00250114` | `Close_SA` | ❌ | 0 | — | 關卡片頁 |
| `0x00250202` | `PointGamble_SA` | ⬜(code,unsent) | 0 | game.dispatch.js | G 幣抽卡（文章：身上需 ≥3000G） |
| `0x00250212` | `CouponGamble_SA` | ❌ | 0 | — | 優惠券抽卡（文章當時未開放） |
| `0x00250301` | `CardList_SN` | ⬜(code,unsent) | 0 | game.dispatch.js | 集卡冊清單 |
| `0x00250302` | `Coupon_SN` | ❌ | 0 | — | 優惠券數量 |
| `0x00250303` | `Reward_Coupon_SN` | ❌ | 0 | — | 獲得優惠券獎勵 |
| `0x00250304` | `PackageCard_SN` | ❌ | 0 | — | 卡包內容 |
| `0x00250312` | `Reward_SA` | ❌ | 0 | — | 集滿領傳說機（文章：直接進格納庫，需已有原型機） |
| `0x00250322` | `Exchange_SA` | ❌ | 0 | — | 6 張換 1～2 抽（文章：要按「交換卡片」） |
| `0x00250332` | `WantCard_SA` | ❌ | 0 | — | 指定想要的卡 |
| `0x00250352` | `Use_MasterCard_SA` | ❌ | 0 | — | 用「王牌卡」換指定卡 |
| `0x00250402` | `Send_UserItem_SA` | ❌ | 0 | — | ⬜ 語意未查（可能與贈送有關） |
| `0x00250502` | `Card_Combination_Type_SA` | ❌ | 0 | — | ⬜ 可能是強化石／插槽合成，非卡片本體 |
| `0x00250512` | `Destroy_Socket_SA` | ⬜(code,unsent) | 0 | game.dispatch.js | ⬜ 同上，可能是機體插槽拆除 |

**全部 16 個 opcode 沒有一個真正實作**：4 個 `⬜(code,unsent)` 是 `game.dispatch.js` 裡的空 case（存在但從沒被觸發過，開關或路徑條件不明），其餘 12 個連空 case 都沒有。`Send_UserItem_SA`／`Card_Combination_Type_SA`／`Destroy_Socket_SA` 這三個從名稱和文章都對不太上，很可能屬於強化石／插槽系統（跟第 8 節「機庫與裝備」的 `Save_ReinforceStone_SA` 是同一組未查功能），⬜。

**C→S：** 沒有任何一個 Card CQ 在 132 份 log 出現過；[SRC] `ZNetwork_DJ.uc:2147-2172` 列出 `Card_Open`／`Card_Gamble`／`Card_Reward_Begin/Item/End`／`Card_Exchange_Begin/Item/End`／`Card_Want`／`Card_Combination_*`／`Card_MasterCard`／`Card_Gift_Send`／`Card_Destroy_Socket`，全部只有客戶端動作宣告，沒有任何一筆對應的伺服器端觀察。

**UI 入口：** `ZPage_Card.uc`、`ZPanel_CardBook.uc`（集卡冊）、`ZPanel_CardMenu.uc`、`ZPanel_CardMix.uc`（合成／交換）、`ZPopup_CardDetail.uc`、`ZPopup_CardDetailSeason.uc`、`ZPopup_CardGamble.uc`（抽卡動畫）、`ZPopup_CardMaster.uc`、`ZPopup_CardMixNeed.uc`、`ZPopup_CardReward.uc`（領傳說機）、`ZPopup_CardSelect.uc`、`ZPopup_CardSuccess.uc`、`ZPopup_ChangeMasterCard.uc`、`ZPopup_SendCard.uc`。

**規模估計：L。** 這是本盤點裡缺口最大的養成系統之一：需要新的資料結構（每個帳號、每個機種的集卡進度／季別）、抽卡機率表（Cache.Bin 裡可能有季別／卡片定義，未查）、6 換 1～2 的交換規則、以及跟「機庫與裝備」「物品期限／授權」共用的「傳說機需要先有原型機、換到後要手動裝備」邏輯（見第 10 節 Legend 授權缺口）。建議排在機庫與裝備、物品期限／授權都補齊之後再做，因為卡片系統的最終產出（永久傳說機）直接依賴這兩個系統的機制。

## 15. 排行榜

**沒有找到獨立的排行榜 dispatcher 或明確標名「Ranking」的 opcode。** 最接近的候選：
- `Rank_SN 0x00210105`（`ZDispatchAccount`，❌ 從沒送過，語意 ⬜——可能是個人段位/排名，也可能是別的統計）。
- `ClanScore_SN 0x00360801`／`ClanMemberScore_SN 0x00360802`（`ZDispatchClan`，❌，公會排名/成員排名，見第 12 節）。

排行榜很可能不是獨立系統，而是附掛在帳號資料（`Rank_SN`）和公會資料（`ClanScore_SN`）裡的欄位，需要先讀 DLL 裡這兩個 SN 的呼叫點才能確認。⬜，未進一步分析（超出本次唯讀盤點的時間預算）。

## 16. 活動

**同樣沒有找到獨立的「活動」dispatcher 或 opcode。** `ZPopup_Event.uc` 存在（客戶端有活動彈窗的 UI 骨架），但 `docs/client-dispatch-map.md` 267 個 opcode 裡沒有任何一個名稱像是「Event」「Activity」相關。可能活動內容是透過既有的公告（`Notice_SA/SN`，見第 17 節）或跑馬燈（`Advertise_*`，見第 3 節大廳頻道）夾帶，也可能原版活動大多是客戶端本地判斷時間／節慶資源，不特別經過伺服器封包。⬜，未進一步分析。

## 17. 其他

**opcode（S→C，4 個）：**

| Opcode | Handler | 狀態 | 出現次數(132份log) | 程式位置 |
|---|---|---|---|---|
| `0x00222312` | `Report_SA` | ❌ | 0 | — |
| `0x00510101` | `Grade_Info_SN` | ✅ | 352 | gamelogin.dispatch.js,community.dispatch.js,account.dispatch.js |
| `0x00510202` | `Notice_SA` | ❌ | 0 | — |
| `0x00510203` | `Notice_SN` | ❌ | 0 | — |

`Grade_Info_SN`（GM 權限等級，必須送 0 一般玩家才能正常操作，`journal/2026-09-17-11-grade-info-sn-root-cause.md`）已 ✅，是整個 PvE 打通的關鍵前提之一。舉報（`Report_SA`）、系統公告（`Notice_SA/SN`）完全沒碰，語意 ⬜。

**UI 入口：** `ZPopup_Report.uc`、`ZPopup_Notify.uc`、`ZPopup_WebBrowser.uc`（可能承載公告連結）。

---

## 附錄：opcode 覆蓋檢查

`docs/client-dispatch-map.md` 的「依 opcode 排序（速查）」共 **273 筆映射**（部分 opcode 對應兩個 handler 名稱，例如同一個 opcode 分屬 `ZDispatchLobby`／`ZDispatchRoom`），去除重複後共 **267 個不重複 opcode**。以下是每個系統小節收錄的 opcode 數（依第 2–14、17 節，第 15、16 節無 opcode）：

| 系統 | opcode 數 |
|---|---:|
| 登入帳號 | 12 |
| 大廳頻道 | 16 |
| 房間 | 50 |
| PvE 模式 | 16 |
| PvP 模式 | 3 |
| 結算與成長 | 17 |
| 機庫與裝備 | 22 |
| 商店與現金商店 | 11 |
| 物品期限／授權／修理 | 6 |
| 好友／密語 | 16 |
| 公會 | 57 |
| 郵件／禮物 | 21 |
| 卡片 | 16 |
| 其他 | 4 |
| **合計** | **267** |

**dispatch map opcodes: 267, covered: 267。** 每個 opcode 只歸類到一節（同一個 opcode 若有兩個 handler 名稱，取主要使用的那個系統，另一個在表格 Handler 欄位註記）。驗證方式：`docs/client-dispatch-map.md` 的「依 opcode 排序」表逐行取十六進位值，去重後與本文件 14 個小節表格的 opcode 集合比對，數量一致（267＝267），手動覆核無遺漏、無重複計入兩節。

C→S 沒有官方 opcode 清單，本文件依 132 份 session log 聚合到的 **54 個相異 C→S opcode**（不含系統層握手 `0x00020080`／`0x00020082`／`0x00020083`／`0x00ee0001`／`0x00ee0002`，這 5 個屬於連線層，不是遊戲系統）逐一在對應小節列出；`ZNetwork_DJ.uc` 裡宣告、但 132 份 log 從未出現過的動作（例如公會、好友、卡片、郵件幾乎全部的 CQ）只在對應小節的「C→S」段落點名，不單獨編號，因為沒有實際 opcode 數值可以核對。

---

## 已知的分類疑點（留給高階或下一輪覆核）

1. `0x00320104`／`0x00320105`：程式碼註解稱「Card CQ」，但 opcode 數值屬於 Friend（`0x0032xxxx`）範圍，且 `0x00320105` 不在客戶端 dispatch map 裡（可能是無效回應）。見第 11 節。
2. `0x00250102`：`game.dispatch.js` 註解「게임 씬 진입 알림」（遊戲場景進入通知），opcode 數值屬於 Card（`0x0025xxxx`）範圍，但語意其實是開戰交握的一部分。歸類進第 5 節 PvE 模式而非第 14 節卡片，已在文中註明。
3. 第 15、16 節（排行榜、活動）沒有找到獨立 opcode，可能附掛在其他系統裡，未深入分析，只列為缺口。
4. `Send_UserItem_SA`（0x00250402，卡片）／`Card_Combination_Type_SA`（0x00250502）／`Destroy_Socket_SA`（0x00250512）三個 opcode 語意存疑，可能屬於強化石／插槽而非卡片本體。
