# 客戶端 dispatcher 映射（server → client）
**產生方式：** `tools/dispatch-map.py`，直接模擬 `ZNetwork.dll` 中各 `ZDispatch*::Dispatch` 的比較鏈與跳躍表。這不是推測，是把客戶端自己的分派邏輯跑一遍得到的結果。
重新產生：

```bash
cd "Metal Rage Online Server"
python3 tools/dispatch-map.py --list          # 列出 14 個 dispatcher
python3 tools/dispatch-map.py <dispatcher-va>
```
> **只涵蓋伺服器送給客戶端的封包。** 客戶端自己送出的 CQ／CN 不會出現在它的 dispatcher 裡，因此本表查不到某個 opcode **不代表它不存在**。
> 部分 handler 對應**兩個** opcode，原因未明。

產生於 2026-09-15，共 273 筆映射。

## 依 opcode 排序（速查）
| Opcode | Handler |
|---|---|
| `0x00110102` | `ZDispatchAccount::Login_Account_SA` |
| `0x00110114` | `ZDispatchAccount::Login_GameHi_SA` |
| `0x00110123` | `ZDispatchAccount::Login_Netmarble_SA` |
| `0x00110125` | `ZDispatchAccount::Login_Again_SA` |
| `0x00110131` | `ZDispatchAccount::Wait_SN` |
| `0x00110143` | `ZDispatchAccount::Login_GameYarou_SA` |
| `0x00110152` | `ZDispatchAccount::Login_Wasabii_SA` |
| `0x00110155` | `ZDispatchAccount::Login_NexonJapan_SA` |
| `0x001101d2` | `ZDispatchAccount::Login_Member_SA` |
| `0x00210101` | `ZDispatchAccount::DefaultInfo_SN` |
| `0x00210102` | `ZDispatchAccount::PlayInfo_SN` |
| `0x00210103` | `ZDispatchAccount::RecordInfo_SN` |
| `0x00210104` | `ZDispatchAccount::MechLevel_SN` |
| `0x00210104` | `ZDispatchRoom::Reward_Record_Mech_SN` |
| `0x00210105` | `ZDispatchAccount::Rank_SN` |
| `0x00210111` | `ZDispatchAccount::ItemInfo_SN` |
| `0x00210112` | `ZDispatchAccount::ExpirationItem_SN` |
| `0x00210113` | `ZDispatchAccount::WearInfo_SN` |
| `0x00210115` | `ZDispatchAccount::MapInfo_SN` |
| `0x00210121` | `ZDispatchAccount::Complete_SN` |
| `0x00210202` | `ZDispatchAccount::Create_SA` |
| `0x00220101` | `ZDispatchLobby::Server_Add_SN` |
| `0x00220102` | `ZDispatchLobby::Channel_Add_SN` |
| `0x00220113` | `ZDispatchLobby::User_Add_SN` |
| `0x00220113` | `ZDispatchRoom::Invite_User_Default_SN` |
| `0x00220115` | `ZDispatchLobby::Leave_SA` |
| `0x00220116` | `ZDispatchLobby::User_Delete_SN` |
| `0x00220122` | `ZDispatchCommunity::Search_User_SA` |
| `0x00220142` | `ZDispatchLobby::Request_SA` |
| `0x00220202` | `ZDispatchLobby::Create_SA` |
| `0x00220203` | `ZDispatchRoom::Room_Default_SN` |
| `0x00220204` | `ZDispatchLobby::Room_List_SN` |
| `0x00220212` | `ZDispatchRoom::MaxUser_Change_SA` |
| `0x00220213` | `ZDispatchRoom::Room_Boundary_SN` |
| `0x00220214` | `ZDispatchRoom::Room_State_SN` |
| `0x00220216` | `ZDispatchRoom::Option_Change_SA` |
| `0x00220217` | `ZDispatchRoom::Room_Option_SN` |
| `0x00220219` | `ZDispatchRoom::Name_Change_SA` |
| `0x0022021a` | `ZDispatchRoom::Room_Name_SN` |
| `0x0022021c` | `ZDispatchRoom::Password_Change_SA` |
| `0x00220222` | `ZDispatchRoom::Map_Change_One_SA` |
| `0x00220223` | `ZDispatchRoom::Map_Change_One_SN` |
| `0x00220225` | `ZDispatchRoom::Map_Change_All_SA` |
| `0x00220226` | `ZDispatchRoom::Map_Change_All_SN` |
| `0x0022022a` | `ZDispatchRoom::Rotate_Next_SN` |
| `0x00220232` | `ZDispatchLobby::Enter_SA` |
| `0x00220233` | `ZDispatchRoom::User_Default_SN` |
| `0x00220235` | `ZDispatchRoom::Leave_SA` |
| `0x00220236` | `ZDispatchRoom::Leave_SN` |
| `0x00220312` | `ZDispatchRoom::Team_Change_SA` |
| `0x00220313` | `ZDispatchRoom::Team_Change_SN` |
| `0x00220319` | `ZDispatchRoom::User_Master_SN` |
| `0x00220338` | `ZDispatchRoom::Kickout_SA` |
| `0x00220401` | `ZDispatchRoom::User_State_SN` |
| `0x00220402` | `ZDispatchRoom::User_Pilot_SN` |
| `0x00220411` | `ZDispatchRoom::User_Levelup_SN` |
| `0x00220412` | `ZDispatchRoom::Reward_Record_User_SN` |
| `0x00220421` | `ZDispatchLobby::User_Nick_Change_SN` |
| `0x00220421` | `ZDispatchRoom::User_Name_SN` |
| `0x00220501` | `ZDispatchCommunity::Chat_Channel_All_SN` |
| `0x00220503` | `ZDispatchCommunity::Chat_Room_Team_SN` |
| `0x00220505` | `ZDispatchCommunity::Chat_Room_All_SN` |
| `0x00220507` | `ZDispatchCommunity::Chat_Game_Team_SN` |
| `0x00220509` | `ZDispatchCommunity::Chat_Game_All_SN` |
| `0x00220512` | `ZDispatchCommunity::Whisper_User_SA` |
| `0x00220513` | `ZDispatchCommunity::Whisper_User_SN` |
| `0x00221102` | `ZDispatchRoom::Invite_Open_SA` |
| `0x00221104` | `ZDispatchCommunity::Invite_SN` |
| `0x00221112` | `ZDispatchCommunity::Together_SN` |
| `0x00221211` | `ZDispatchCommunity::Option_Game_SN` |
| `0x00221222` | `ZDispatchCommunity::Option_Game_SA` |
| `0x00221431` | `ZDispatchCommunity::Advertise_Clear_SN` |
| `0x00221432` | `ZDispatchCommunity::Advertise_Add_SN` |
| `0x00222102` | `ZDispatchRoom::Game_Ready_SN` |
| `0x00222104` | `ZDispatchRoom::Game_Start_SN` |
| `0x00222111` | `ZDispatchGame::Game_Info_SN` |
| `0x00222111` | `ZDispatchWaiting::Game_Info_SN` |
| `0x00222112` | `ZDispatchGame::Game_User_SN` |
| `0x00222114` | `ZDispatchGame::Game_Score_SN` |
| `0x00222121` | `ZDispatchGame::Team_Change_All_SN` |
| `0x00222121` | `ZDispatchRoom::Team_Change_All_SN` |
| `0x00222128` | `ZDispatchRoom::Rotate_Stop_SA` |
| `0x00222129` | `ZDispatchRoom::Rotate_Stop_SN` |
| `0x00222132` | `ZDispatchGame::Leave_SA` |
| `0x00222211` | `ZDispatchGame::EndRound_SN` |
| `0x00222212` | `ZDispatchGame::EndQuater_SN` |
| `0x00222213` | `ZDispatchGame::EndGame_SN` |
| `0x00222221` | `ZDispatchRoom::User_Score_SN` |
| `0x00222231` | `ZDispatchRoom::Reward_Levelup_User_SN` |
| `0x00222232` | `ZDispatchRoom::Reward_Levelup_Mech_SN` |
| `0x00222233` | `ZDispatchRoom::Reward_FirstReceiveExp_User_SN` |
| `0x00222312` | `ZDispatchCommunity::Report_SA` |
| `0x00223102` | `ZDispatchRoom::Matching_Start_SN` |
| `0x00223103` | `ZDispatchRoom::Matching_Complete_SN` |
| `0x00223104` | `ZDispatchRoom::Matching_List_SN` |
| `0x00223112` | `ZDispatchRoom::Matching_Cancel_SN` |
| `0x00223113` | `ZDispatchRoom::Matching_Cancel_Always_SN` |
| `0x00223115` | `ZDispatchRoom::Matching_Break_SN` |
| `0x00223116` | `ZDispatchRoom::Matching_Break_Always_SN` |
| `0x00230102` | `ZDispatchGame::ChangeSlot_SN` |
| `0x00230104` | `ZDispatchGame::Respawn_SN` |
| `0x00230106` | `ZDispatchGame::InstantRespawn_SN` |
| `0x00230112` | `ZDispatchGame::Timeout_SN` |
| `0x00230122` | `ZDispatchGame::Assist_SN` |
| `0x00230124` | `ZDispatchGame::Death_SN` |
| `0x00230126` | `ZDispatchGame::Special_SN` |
| `0x00230132` | `ZDispatchGame::Capture_SN` |
| `0x00230134` | `ZDispatchGame::Conquest_SN` |
| `0x00230136` | `ZDispatchGame::Bomb_SN` |
| `0x00230138` | `ZDispatchGame::Boss_SN` |
| `0x0023013a` | `ZDispatchGame::Campaign_SN` |
| `0x0023013c` | `ZDispatchGame::TwoBoss_SN` |
| `0x0023013e` | `ZDispatchGame::TriggerTouch_SN` |
| `0x00230152` | `ZDispatchGame::BeginRound_SN` |
| `0x00240102` | `ZDispatchHangar::Open_SA` |
| `0x00240104` | `ZDispatchHangar::Close_SA` |
| `0x00240106` | `ZDispatchHangar::Pilot_Change_SA` |
| `0x00240108` | `ZDispatchHangar::Slot_Change_SA` |
| `0x00240109` | `ZDispatchHangar::Slot_Change_SN` |
| `0x00240112` | `ZDispatchHangar::DefaultSlot_Change_SA` |
| `0x00240113` | `ZDispatchHangar::DefaultSlot_Change_SN` |
| `0x00240115` | `ZDispatchHangar::DefaultSlot_Empty_SN` |
| `0x00240122` | `ZDispatchHangar::Item_Active_SA` |
| `0x00240124` | `ZDispatchHangar::Item_Delete_SA` |
| `0x00240126` | `ZDispatchHangar::Item_Use_SA` |
| `0x00240131` | `ZDispatchHangar::Packege_Item_SN` |
| `0x00240132` | `ZDispatchHangar::Packege_Point_SN` |
| `0x00240133` | `ZDispatchHangar::Packege_Coupon_SN` |
| `0x00240142` | `ZDispatchHangar::Item_Period_Merge_SA` |
| `0x00240144` | `ZDispatchHangar::Item_Stack_Merge_SA` |
| `0x00240152` | `ZDispatchHangar::Increase_UpgradeSlot_Size_SA` |
| `0x00240154` | `ZDispatchHangar::Save_ReinforceStone_SA` |
| `0x00240202` | `ZDispatchHangar::Buy_PointItem_SA` |
| `0x00240204` | `ZDispatchHangar::Buy_CashItem_SA` |
| `0x00240206` | `ZDispatchHangar::Charge_PeriodPointItem_SA` |
| `0x00240208` | `ZDispatchHangar::Charge_PeriodCashItem_SA` |
| `0x0024020a` | `ZDispatchHangar::Charge_StackPointItem_SA` |
| `0x0024020c` | `ZDispatchHangar::Charge_StackCashItem_SA` |
| `0x00240212` | `ZDispatchHangar::CashReLoad_SA` |
| `0x00240213` | `ZDispatchHangar::CashReLoad_SN` |
| `0x00240222` | `ZDispatchHangar::ChargeSerialKey_SA` |
| `0x00240241` | `ZDispatchHangar::ShopList_SN` |
| `0x00240242` | `ZDispatchHangar::CashShopList_SN` |
| `0x00240301` | `ZDispatchHangar::Item_Expiration_SN` |
| `0x00240512` | `ZDispatchHangar::Gift_Send_SA` |
| `0x00240513` | `ZDispatchHangar::Gift_Send_SN` |
| `0x00240522` | `ZDispatchHangar::Send_UserItem_SA` |
| `0x00240602` | `ZDispatchHangar::Nick_Name_Change_SA` |
| `0x00240603` | `ZDispatchHangar::Nick_Name_Change_SN` |
| `0x00240612` | `ZDispatchHangar::Account_Reset_KillDeath_SA` |
| `0x00240622` | `ZDispatchHangar::Account_Reset_Record_SA` |
| `0x00240632` | `ZDispatchHangar::License_Obtain_SA` |
| `0x00240702` | `ZDispatchHangar::RandomBox_Open_SA` |
| `0x00240711` | `ZDispatchHangar::RandomBox_Notify_SN` |
| `0x00250101` | `ZDispatchCard::Load_Failed_SN` |
| `0x00250112` | `ZDispatchCard::Open_SA` |
| `0x00250114` | `ZDispatchCard::Close_SA` |
| `0x00250202` | `ZDispatchCard::PointGamble_SA` |
| `0x00250212` | `ZDispatchCard::CouponGamble_SA` |
| `0x00250301` | `ZDispatchCard::CardList_SN` |
| `0x00250302` | `ZDispatchCard::Coupon_SN` |
| `0x00250303` | `ZDispatchRoom::Reward_Coupon_SN` |
| `0x00250304` | `ZDispatchCard::PackageCard_SN` |
| `0x00250312` | `ZDispatchCard::Reward_SA` |
| `0x00250322` | `ZDispatchCard::Exchange_SA` |
| `0x00250332` | `ZDispatchCard::WantCard_SA` |
| `0x00250352` | `ZDispatchCard::Use_MasterCard_SA` |
| `0x00250402` | `ZDispatchCard::Send_UserItem_SA` |
| `0x00250502` | `ZDispatchCard::Card_Combination_Type_SA` |
| `0x00250512` | `ZDispatchCard::Destroy_Socket_SA` |
| `0x00260101` | `ZDispatchAccount::LicenseInfo_SN` |
| `0x00310102` | `ZDispatchPostbox::Open_SA` |
| `0x00310104` | `ZDispatchPostbox::Close_SA` |
| `0x00310111` | `ZDispatchCommunity::Option_Community_SN` |
| `0x00310122` | `ZDispatchCommunity::Option_Community_SA` |
| `0x00310201` | `ZDispatchPostbox::Mail_Info_SN` |
| `0x00310202` | `ZDispatchPostbox::Mail_List_SN` |
| `0x00310212` | `ZDispatchPostbox::Mail_Send_SA` |
| `0x00310213` | `ZDispatchPostbox::Mail_Send_SN` |
| `0x00310215` | `ZDispatchPostbox::Mail_Read_SA` |
| `0x00310217` | `ZDispatchPostbox::Mail_Refresh_SA` |
| `0x00310219` | `ZDispatchPostbox::Mail_Delete_SA` |
| `0x00310301` | `ZDispatchPostbox::Gift_Info_SN` |
| `0x00310302` | `ZDispatchPostbox::Gift_List_SN` |
| `0x00310315` | `ZDispatchPostbox::Gift_Read_SA` |
| `0x00310317` | `ZDispatchPostbox::Gift_Receive_SA` |
| `0x00310319` | `ZDispatchPostbox::Gift_Refresh_SA` |
| `0x0031031b` | `ZDispatchPostbox::Gift_Delete_SA` |
| `0x00310321` | `ZDispatchPostbox::Packege_Item_SN` |
| `0x00320101` | `ZDispatchFriend::FriendList_Add_SN` |
| `0x00320102` | `ZDispatchFriend::FriendList_Empty_SN` |
| `0x00320103` | `ZDispatchFriend::Load_Failed_SN` |
| `0x00320202` | `ZDispatchFriend::Friendship_Ask_SN` |
| `0x00320203` | `ZDispatchFriend::FriendList_Request_SN` |
| `0x00320205` | `ZDispatchFriend::Friendship_Answer_SN` |
| `0x00320206` | `ZDispatchFriend::FriendList_Response_SN` |
| `0x00320209` | `ZDispatchFriend::Friendship_Break_SA` |
| `0x00320210` | `ZDispatchFriend::FriendList_Delete_SN` |
| `0x00320212` | `ZDispatchCommunity::Whisper_Friend_SN` |
| `0x00320213` | `ZDispatchFriend::FriendList_Online_SN` |
| `0x00320214` | `ZDispatchFriend::FriendList_Offline_SN` |
| `0x00320221` | `ZDispatchFriend::FriendList_ClanEmblem_SN` |
| `0x00320231` | `ZDispatchFriend::FriendUser_Nick_Change_SN` |
| `0x00360101` | `ZDispatchClan::Load_Waiting_SN` |
| `0x00360102` | `ZDispatchClan::Load_Failed_SN` |
| `0x00360103` | `ZDispatchClan::ClanInfo_Empty_SN` |
| `0x00360105` | `ZDispatchClan::ClanServer_Disconnect_SN` |
| `0x00360112` | `ZDispatchClan::Open_SA` |
| `0x00360122` | `ZDispatchClan::Close_SA` |
| `0x00360202` | `ZDispatchCommunity::Search_Clan_SA` |
| `0x00360212` | `ZDispatchClan::Create_Check_SA` |
| `0x00360222` | `ZDispatchClan::Create_SA` |
| `0x00360232` | `ZDispatchClan::Destroy_SA` |
| `0x00360242` | `ZDispatchClan::Join_Open_SA` |
| `0x00360252` | `ZDispatchClan::Member_Join_SA` |
| `0x00360253` | `ZDispatchClan::Member_Join_SN` |
| `0x00360262` | `ZDispatchClan::Join_Accept_SA` |
| `0x00360263` | `ZDispatchClan::Join_Accept_SN` |
| `0x00360272` | `ZDispatchClan::Join_Reject_SA` |
| `0x00360273` | `ZDispatchClan::Join_Reject_SN` |
| `0x00360301` | `ZDispatchClan::ClanInfo_SN` |
| `0x00360302` | `ZDispatchClan::ClanUserInfo_SN` |
| `0x00360303` | `ZDispatchClan::Join_Open_SN` |
| `0x00360401` | `ZDispatchClan::Online_SN` |
| `0x00360402` | `ZDispatchClan::Offline_SN` |
| `0x00360412` | `ZDispatchClan::Grade_Change_SA` |
| `0x00360413` | `ZDispatchClan::Grade_Change_SN` |
| `0x00360414` | `ZDispatchClan::ClanUserInfo_Add_SN` |
| `0x00360422` | `ZDispatchClan::Secede_SA` |
| `0x00360423` | `ZDispatchClan::Secede_SN` |
| `0x00360432` | `ZDispatchClan::Kickout_SA` |
| `0x00360433` | `ZDispatchClan::Kickout_SN` |
| `0x00360452` | `ZDispatchClan::Master_Change_SA` |
| `0x00360453` | `ZDispatchClan::Master_Change_SN` |
| `0x00360461` | `ZDispatchLobby::User_Clan_Info_SN` |
| `0x00360461` | `ZDispatchRoom::Invite_User_Clan_SN` |
| `0x00360462` | `ZDispatchRoom::User_Clan_Add_SN` |
| `0x00360463` | `ZDispatchLobby::User_Clan_Clear_SN` |
| `0x00360464` | `ZDispatchRoom::User_Clan_Delete_SN` |
| `0x00360471` | `ZDispatchClan::Reset_Clanner_WinLose_SN` |
| `0x00360472` | `ZDispatchClan::Reset_Clanner_KillDeath_SN` |
| `0x00360502` | `ZDispatchClan::Introduce_Change_SA` |
| `0x00360503` | `ZDispatchClan::Introduce_Change_SN` |
| `0x00360512` | `ZDispatchClan::Notice_Change_SA` |
| `0x00360513` | `ZDispatchClan::Notice_Change_SN` |
| `0x00360524` | `ZDispatchClan::Emblem_Change_SA` |
| `0x00360525` | `ZDispatchClan::Emblem_Change_SN` |
| `0x00360534` | `ZDispatchClan::Clan_Name_Change_SA` |
| `0x00360535` | `ZDispatchClan::Clan_Name_Change_SN` |
| `0x00360542` | `ZDispatchClan::Limit_Expansion_SA` |
| `0x00360543` | `ZDispatchClan::Limit_Expansion_SN` |
| `0x00360551` | `ZDispatchClan::ClanUser_Nick_Change_SN` |
| `0x00360562` | `ZDispatchClan::Reset_Clan_Record_SA` |
| `0x00360563` | `ZDispatchClan::Reset_Clan_Record_SN` |
| `0x00360602` | `ZDispatchCommunity::Chat_Clan_All_SN` |
| `0x00360612` | `ZDispatchCommunity::Whisper_Claner_SA` |
| `0x00360613` | `ZDispatchCommunity::Whisper_Claner_SN` |
| `0x00360712` | `ZDispatchClan::Invite_SA` |
| `0x00360713` | `ZDispatchClan::Invite_SN` |
| `0x00360801` | `ZDispatchClan::ClanScore_SN` |
| `0x00360802` | `ZDispatchClan::ClanMemberScore_SN` |
| `0x00410102` | `ZDispatchWaiting::Regist_SA` |
| `0x00410103` | `ZDispatchWaiting::Clear_SQ` |
| `0x00420111` | `ZDispatchRoom::Game_Wait_SN` |
| `0x00420112` | `ZDispatchGame::Ready_Failed_SN` |
| `0x00420113` | `ZDispatchGame::Ready_Host_SQ` |
| `0x00420115` | `ZDispatchGame::Ready_Host_SN` |
| `0x00420116` | `ZDispatchGame::Ready_Success_SN` |
| `0x00420121` | `ZDispatchGame::HostChange_SN` |
| `0x00420133` | `ZDispatchGame::Leave_SN` |
| `0x00510101` | `ZDispatchCommunity::Grade_Info_SN` |
| `0x00510202` | `ZDispatchCommunity::Notice_SA` |
| `0x00510203` | `ZDispatchCommunity::Notice_SN` |

---

## 依 dispatcher 分組

### ZDispatchGame  （29）

| Opcode | Handler |
|---|---|
| `0x00222111` | `Game_Info_SN` |
| `0x00222112` | `Game_User_SN` |
| `0x00222114` | `Game_Score_SN` |
| `0x00222121` | `Team_Change_All_SN` |
| `0x00222132` | `Leave_SA` |
| `0x00222211` | `EndRound_SN` |
| `0x00222212` | `EndQuater_SN` |
| `0x00222213` | `EndGame_SN` |
| `0x00230102` | `ChangeSlot_SN` |
| `0x00230104` | `Respawn_SN` |
| `0x00230106` | `InstantRespawn_SN` |
| `0x00230112` | `Timeout_SN` |
| `0x00230122` | `Assist_SN` |
| `0x00230124` | `Death_SN` |
| `0x00230126` | `Special_SN` |
| `0x00230132` | `Capture_SN` |
| `0x00230134` | `Conquest_SN` |
| `0x00230136` | `Bomb_SN` |
| `0x00230138` | `Boss_SN` |
| `0x0023013a` | `Campaign_SN` |
| `0x0023013c` | `TwoBoss_SN` |
| `0x0023013e` | `TriggerTouch_SN` |
| `0x00230152` | `BeginRound_SN` |
| `0x00420112` | `Ready_Failed_SN` |
| `0x00420113` | `Ready_Host_SQ` |
| `0x00420115` | `Ready_Host_SN` |
| `0x00420116` | `Ready_Success_SN` |
| `0x00420121` | `HostChange_SN` |
| `0x00420133` | `Leave_SN` |

### ZDispatchAccount  （21）

| Opcode | Handler |
|---|---|
| `0x00110102` | `Login_Account_SA` |
| `0x00110114` | `Login_GameHi_SA` |
| `0x00110123` | `Login_Netmarble_SA` |
| `0x00110125` | `Login_Again_SA` |
| `0x00110131` | `Wait_SN` |
| `0x00110143` | `Login_GameYarou_SA` |
| `0x00110152` | `Login_Wasabii_SA` |
| `0x00110155` | `Login_NexonJapan_SA` |
| `0x001101d2` | `Login_Member_SA` |
| `0x00210101` | `DefaultInfo_SN` |
| `0x00210102` | `PlayInfo_SN` |
| `0x00210103` | `RecordInfo_SN` |
| `0x00210104` | `MechLevel_SN` |
| `0x00210105` | `Rank_SN` |
| `0x00210111` | `ItemInfo_SN` |
| `0x00210112` | `ExpirationItem_SN` |
| `0x00210113` | `WearInfo_SN` |
| `0x00210115` | `MapInfo_SN` |
| `0x00210121` | `Complete_SN` |
| `0x00210202` | `Create_SA` |
| `0x00260101` | `LicenseInfo_SN` |

### ZDispatchWaiting  （3）

| Opcode | Handler |
|---|---|
| `0x00222111` | `Game_Info_SN` |
| `0x00410102` | `Regist_SA` |
| `0x00410103` | `Clear_SQ` |

### ZDispatchQuest  （0）

模擬器未解出任何 handler。該 dispatcher 的分派形式與其他不同，尚未支援。

### ZDispatchClan  （49）

| Opcode | Handler |
|---|---|
| `0x00360101` | `Load_Waiting_SN` |
| `0x00360102` | `Load_Failed_SN` |
| `0x00360103` | `ClanInfo_Empty_SN` |
| `0x00360105` | `ClanServer_Disconnect_SN` |
| `0x00360112` | `Open_SA` |
| `0x00360122` | `Close_SA` |
| `0x00360212` | `Create_Check_SA` |
| `0x00360222` | `Create_SA` |
| `0x00360232` | `Destroy_SA` |
| `0x00360242` | `Join_Open_SA` |
| `0x00360252` | `Member_Join_SA` |
| `0x00360253` | `Member_Join_SN` |
| `0x00360262` | `Join_Accept_SA` |
| `0x00360263` | `Join_Accept_SN` |
| `0x00360272` | `Join_Reject_SA` |
| `0x00360273` | `Join_Reject_SN` |
| `0x00360301` | `ClanInfo_SN` |
| `0x00360302` | `ClanUserInfo_SN` |
| `0x00360303` | `Join_Open_SN` |
| `0x00360401` | `Online_SN` |
| `0x00360402` | `Offline_SN` |
| `0x00360412` | `Grade_Change_SA` |
| `0x00360413` | `Grade_Change_SN` |
| `0x00360414` | `ClanUserInfo_Add_SN` |
| `0x00360422` | `Secede_SA` |
| `0x00360423` | `Secede_SN` |
| `0x00360432` | `Kickout_SA` |
| `0x00360433` | `Kickout_SN` |
| `0x00360452` | `Master_Change_SA` |
| `0x00360453` | `Master_Change_SN` |
| `0x00360471` | `Reset_Clanner_WinLose_SN` |
| `0x00360472` | `Reset_Clanner_KillDeath_SN` |
| `0x00360502` | `Introduce_Change_SA` |
| `0x00360503` | `Introduce_Change_SN` |
| `0x00360512` | `Notice_Change_SA` |
| `0x00360513` | `Notice_Change_SN` |
| `0x00360524` | `Emblem_Change_SA` |
| `0x00360525` | `Emblem_Change_SN` |
| `0x00360534` | `Clan_Name_Change_SA` |
| `0x00360535` | `Clan_Name_Change_SN` |
| `0x00360542` | `Limit_Expansion_SA` |
| `0x00360543` | `Limit_Expansion_SN` |
| `0x00360551` | `ClanUser_Nick_Change_SN` |
| `0x00360562` | `Reset_Clan_Record_SA` |
| `0x00360563` | `Reset_Clan_Record_SN` |
| `0x00360712` | `Invite_SA` |
| `0x00360713` | `Invite_SN` |
| `0x00360801` | `ClanScore_SN` |
| `0x00360802` | `ClanMemberScore_SN` |

### ZDispatchBase  （0）

模擬器未解出任何 handler。該 dispatcher 的分派形式與其他不同，尚未支援。

### ZDispatchCard  （15）

| Opcode | Handler |
|---|---|
| `0x00250101` | `Load_Failed_SN` |
| `0x00250112` | `Open_SA` |
| `0x00250114` | `Close_SA` |
| `0x00250202` | `PointGamble_SA` |
| `0x00250212` | `CouponGamble_SA` |
| `0x00250301` | `CardList_SN` |
| `0x00250302` | `Coupon_SN` |
| `0x00250304` | `PackageCard_SN` |
| `0x00250312` | `Reward_SA` |
| `0x00250322` | `Exchange_SA` |
| `0x00250332` | `WantCard_SA` |
| `0x00250352` | `Use_MasterCard_SA` |
| `0x00250402` | `Send_UserItem_SA` |
| `0x00250502` | `Card_Combination_Type_SA` |
| `0x00250512` | `Destroy_Socket_SA` |

### ZDispatchFriend  （13）

| Opcode | Handler |
|---|---|
| `0x00320101` | `FriendList_Add_SN` |
| `0x00320102` | `FriendList_Empty_SN` |
| `0x00320103` | `Load_Failed_SN` |
| `0x00320202` | `Friendship_Ask_SN` |
| `0x00320203` | `FriendList_Request_SN` |
| `0x00320205` | `Friendship_Answer_SN` |
| `0x00320206` | `FriendList_Response_SN` |
| `0x00320209` | `Friendship_Break_SA` |
| `0x00320210` | `FriendList_Delete_SN` |
| `0x00320213` | `FriendList_Online_SN` |
| `0x00320214` | `FriendList_Offline_SN` |
| `0x00320221` | `FriendList_ClanEmblem_SN` |
| `0x00320231` | `FriendUser_Nick_Change_SN` |

### ZDispatchHangar  （40）

| Opcode | Handler |
|---|---|
| `0x00240102` | `Open_SA` |
| `0x00240104` | `Close_SA` |
| `0x00240106` | `Pilot_Change_SA` |
| `0x00240108` | `Slot_Change_SA` |
| `0x00240109` | `Slot_Change_SN` |
| `0x00240112` | `DefaultSlot_Change_SA` |
| `0x00240113` | `DefaultSlot_Change_SN` |
| `0x00240115` | `DefaultSlot_Empty_SN` |
| `0x00240122` | `Item_Active_SA` |
| `0x00240124` | `Item_Delete_SA` |
| `0x00240126` | `Item_Use_SA` |
| `0x00240131` | `Packege_Item_SN` |
| `0x00240132` | `Packege_Point_SN` |
| `0x00240133` | `Packege_Coupon_SN` |
| `0x00240142` | `Item_Period_Merge_SA` |
| `0x00240144` | `Item_Stack_Merge_SA` |
| `0x00240152` | `Increase_UpgradeSlot_Size_SA` |
| `0x00240154` | `Save_ReinforceStone_SA` |
| `0x00240202` | `Buy_PointItem_SA` |
| `0x00240204` | `Buy_CashItem_SA` |
| `0x00240206` | `Charge_PeriodPointItem_SA` |
| `0x00240208` | `Charge_PeriodCashItem_SA` |
| `0x0024020a` | `Charge_StackPointItem_SA` |
| `0x0024020c` | `Charge_StackCashItem_SA` |
| `0x00240212` | `CashReLoad_SA` |
| `0x00240213` | `CashReLoad_SN` |
| `0x00240222` | `ChargeSerialKey_SA` |
| `0x00240241` | `ShopList_SN` |
| `0x00240242` | `CashShopList_SN` |
| `0x00240301` | `Item_Expiration_SN` |
| `0x00240512` | `Gift_Send_SA` |
| `0x00240513` | `Gift_Send_SN` |
| `0x00240522` | `Send_UserItem_SA` |
| `0x00240602` | `Nick_Name_Change_SA` |
| `0x00240603` | `Nick_Name_Change_SN` |
| `0x00240612` | `Account_Reset_KillDeath_SA` |
| `0x00240622` | `Account_Reset_Record_SA` |
| `0x00240632` | `License_Obtain_SA` |
| `0x00240702` | `RandomBox_Open_SA` |
| `0x00240711` | `RandomBox_Notify_SN` |

### ZDispatchLobby  （12）

| Opcode | Handler |
|---|---|
| `0x00220101` | `Server_Add_SN` |
| `0x00220102` | `Channel_Add_SN` |
| `0x00220113` | `User_Add_SN` |
| `0x00220115` | `Leave_SA` |
| `0x00220116` | `User_Delete_SN` |
| `0x00220142` | `Request_SA` |
| `0x00220202` | `Create_SA` |
| `0x00220204` | `Room_List_SN` |
| `0x00220232` | `Enter_SA` |
| `0x00220421` | `User_Nick_Change_SN` |
| `0x00360461` | `User_Clan_Info_SN` |
| `0x00360463` | `User_Clan_Clear_SN` |

### ZDispatchGate  （0）

模擬器未解出任何 handler。該 dispatcher 的分派形式與其他不同，尚未支援。

### ZDispatchCommunity  （25）

| Opcode | Handler |
|---|---|
| `0x00220122` | `Search_User_SA` |
| `0x00220501` | `Chat_Channel_All_SN` |
| `0x00220503` | `Chat_Room_Team_SN` |
| `0x00220505` | `Chat_Room_All_SN` |
| `0x00220507` | `Chat_Game_Team_SN` |
| `0x00220509` | `Chat_Game_All_SN` |
| `0x00220512` | `Whisper_User_SA` |
| `0x00220513` | `Whisper_User_SN` |
| `0x00221104` | `Invite_SN` |
| `0x00221112` | `Together_SN` |
| `0x00221211` | `Option_Game_SN` |
| `0x00221222` | `Option_Game_SA` |
| `0x00221431` | `Advertise_Clear_SN` |
| `0x00221432` | `Advertise_Add_SN` |
| `0x00222312` | `Report_SA` |
| `0x00310111` | `Option_Community_SN` |
| `0x00310122` | `Option_Community_SA` |
| `0x00320212` | `Whisper_Friend_SN` |
| `0x00360202` | `Search_Clan_SA` |
| `0x00360602` | `Chat_Clan_All_SN` |
| `0x00360612` | `Whisper_Claner_SA` |
| `0x00360613` | `Whisper_Claner_SN` |
| `0x00510101` | `Grade_Info_SN` |
| `0x00510202` | `Notice_SA` |
| `0x00510203` | `Notice_SN` |

### ZDispatchPostbox  （16）

| Opcode | Handler |
|---|---|
| `0x00310102` | `Open_SA` |
| `0x00310104` | `Close_SA` |
| `0x00310201` | `Mail_Info_SN` |
| `0x00310202` | `Mail_List_SN` |
| `0x00310212` | `Mail_Send_SA` |
| `0x00310213` | `Mail_Send_SN` |
| `0x00310215` | `Mail_Read_SA` |
| `0x00310217` | `Mail_Refresh_SA` |
| `0x00310219` | `Mail_Delete_SA` |
| `0x00310301` | `Gift_Info_SN` |
| `0x00310302` | `Gift_List_SN` |
| `0x00310315` | `Gift_Read_SA` |
| `0x00310317` | `Gift_Receive_SA` |
| `0x00310319` | `Gift_Refresh_SA` |
| `0x0031031b` | `Gift_Delete_SA` |
| `0x00310321` | `Packege_Item_SN` |

### ZDispatchRoom  （50）

| Opcode | Handler |
|---|---|
| `0x00210104` | `Reward_Record_Mech_SN` |
| `0x00220113` | `Invite_User_Default_SN` |
| `0x00220203` | `Room_Default_SN` |
| `0x00220212` | `MaxUser_Change_SA` |
| `0x00220213` | `Room_Boundary_SN` |
| `0x00220214` | `Room_State_SN` |
| `0x00220216` | `Option_Change_SA` |
| `0x00220217` | `Room_Option_SN` |
| `0x00220219` | `Name_Change_SA` |
| `0x0022021a` | `Room_Name_SN` |
| `0x0022021c` | `Password_Change_SA` |
| `0x00220222` | `Map_Change_One_SA` |
| `0x00220223` | `Map_Change_One_SN` |
| `0x00220225` | `Map_Change_All_SA` |
| `0x00220226` | `Map_Change_All_SN` |
| `0x0022022a` | `Rotate_Next_SN` |
| `0x00220233` | `User_Default_SN` |
| `0x00220235` | `Leave_SA` |
| `0x00220236` | `Leave_SN` |
| `0x00220312` | `Team_Change_SA` |
| `0x00220313` | `Team_Change_SN` |
| `0x00220319` | `User_Master_SN` |
| `0x00220338` | `Kickout_SA` |
| `0x00220401` | `User_State_SN` |
| `0x00220402` | `User_Pilot_SN` |
| `0x00220411` | `User_Levelup_SN` |
| `0x00220412` | `Reward_Record_User_SN` |
| `0x00220421` | `User_Name_SN` |
| `0x00221102` | `Invite_Open_SA` |
| `0x00222102` | `Game_Ready_SN` |
| `0x00222104` | `Game_Start_SN` |
| `0x00222121` | `Team_Change_All_SN` |
| `0x00222128` | `Rotate_Stop_SA` |
| `0x00222129` | `Rotate_Stop_SN` |
| `0x00222221` | `User_Score_SN` |
| `0x00222231` | `Reward_Levelup_User_SN` |
| `0x00222232` | `Reward_Levelup_Mech_SN` |
| `0x00222233` | `Reward_FirstReceiveExp_User_SN` |
| `0x00223102` | `Matching_Start_SN` |
| `0x00223103` | `Matching_Complete_SN` |
| `0x00223104` | `Matching_List_SN` |
| `0x00223112` | `Matching_Cancel_SN` |
| `0x00223113` | `Matching_Cancel_Always_SN` |
| `0x00223115` | `Matching_Break_SN` |
| `0x00223116` | `Matching_Break_Always_SN` |
| `0x00250303` | `Reward_Coupon_SN` |
| `0x00360461` | `Invite_User_Clan_SN` |
| `0x00360462` | `User_Clan_Add_SN` |
| `0x00360464` | `User_Clan_Delete_SN` |
| `0x00420111` | `Game_Wait_SN` |
