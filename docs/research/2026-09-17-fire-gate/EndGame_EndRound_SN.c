== EndGame_SN@ZDispatchGame 0x1070a182 -> 0x107d7ed0
// ======== 0x107d7ed0  FUN_107d7ed0  @ 107d7ed0 ========
void __thiscall FUN_107d7ed0(int param_1,int param_2,undefined4 param_3,int param_4,int param_5)
{
  uint uVar1;
  UObject *pUVar2;
  uint uVar3;
  uint uVar4;
  uint uVar5;
  uint uVar6;
  int unaff_retaddr;
  int iVar7;
  int iVar8;
  wchar_t *pwVar9;
  ushort *puVar10;
  SCENE_TYPE SVar11;
  if (*(char *)(param_1 + 4) == '\0') {
    ZNetworkManager::Log_Set
              (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchGame::EndGame_SN");
    ZNetworkManager::Log_Write
              ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
    return;
  }
  ZNetworkManager::Log_Set
            (*(ZNetworkManager **)GZNetworkManager_exref,2,"ZDispatchGame::EndGame_SN");
  ZNetworkManager::Log_Write
            ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
  uVar1 = (uint)*(byte *)(param_2 + 0x17);
  uVar3 = (uint)*(ushort *)(param_2 + 0x1a);
  uVar6 = (uint)*(ushort *)(param_2 + 0x12);
  uVar4 = (uint)*(ushort *)(param_2 + 0x14);
  uVar5 = (uint)*(byte *)(param_2 + 0x16);
  iVar7 = *(int *)(param_2 + 0x1c);
  ZNetworkManager::Log_Set
            (*(ZNetworkManager **)GZNetworkManager_exref,2,"ZDispatchGame::EndGame_SN");
  ZNetworkManager::Log_Write
            (*(ZNetworkManager **)GZNetworkManager_exref,
             (ushort *)*(ZNetworkManager **)GZNetworkManager_exref);
  iVar8 = unaff_retaddr;
  pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
  UZNetwork_DJ::Game_Score_Set((UZNetwork_DJ *)pUVar2,uVar6,uVar4,uVar5,iVar7,uVar1,param_4,iVar8);
  uVar1 = (uint)*(byte *)(param_2 + 0x25);
  uVar6 = (uint)*(ushort *)(param_2 + 0x20);
  uVar4 = (uint)*(ushort *)(param_2 + 0x22);
  uVar5 = (uint)*(byte *)(param_2 + 0x24);
  iVar7 = *(int *)(param_2 + 0x2a);
  ZNetworkManager::Log_Set
            (*(ZNetworkManager **)GZNetworkManager_exref,2,"ZDispatchGame::EndGame_SN");
  ZNetworkManager::Log_Write
            ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
  pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
  UZNetwork_DJ::Game_Score_Set
            ((UZNetwork_DJ *)pUVar2,uVar6,uVar4,uVar5,unaff_retaddr,uVar1,param_5,iVar7);
  pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
  UZNetwork_DJ::Game_Score_Update((UZNetwork_DJ *)pUVar2);
  if (*(int *)GIsClient_exref == 0) {
    pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
    UZNetwork_DJ::Dedi_End((UZNetwork_DJ *)pUVar2);
    SVar11 = 1;
  }
  else {
    pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
    UZNetwork_DJ::Game_End_Battle((UZNetwork_DJ *)pUVar2,uVar3);
    pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
    UZNetwork_DJ::Community_Chat_Clear((UZNetwork_DJ *)pUVar2);
    puVar10 = (ushort *)0x0;
    pwVar9 = L"NETWORK_GAME_END";
    pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
    UZNetwork_DJ::Event_Call((UZNetwork_DJ *)pUVar2,(ushort *)pwVar9,puVar10);
    SVar11 = 5;
  }
  pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
  UZNetwork_DJ::Scene_Change((UZNetwork_DJ *)pUVar2,SVar11);
  return;
}
== EndRound_SN@ZDispatchGame 0x10701794 -> 0x107d7a50
// ======== 0x107d7a50  FUN_107d7a50  @ 107d7a50 ========
void __thiscall FUN_107d7a50(int param_1,int param_2,undefined4 param_3,int param_4,int param_5)
{
  ZNetworkManager *this;
  UObject *pUVar1;
  uint uVar2;
  uint uVar3;
  uint uVar4;
  uint uVar5;
  uint uVar6;
  int iVar7;
  int iVar8;
  if (*(char *)(param_1 + 4) == '\0') {
    ZNetworkManager::Log_Set
              (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchGame::EndRound_SN");
    ZNetworkManager::Log_Write
              ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
    return;
  }
  uVar6 = (uint)*(ushort *)(param_2 + 0x10);
  ZNetworkManager::Log_Set
            (*(ZNetworkManager **)GZNetworkManager_exref,2,"ZDispatchGame::EndRound_SN");
  ZNetworkManager::Log_Write
            ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
  this = (ZNetworkManager *)(uint)*(byte *)(param_2 + 0x16);
  uVar2 = (uint)*(byte *)(param_2 + 0x17);
  uVar3 = (uint)*(ushort *)(param_2 + 0x12);
  uVar4 = (uint)*(ushort *)(param_2 + 0x14);
  iVar7 = *(int *)(param_2 + 0x1c);
  ZNetworkManager::Log_Set
            (*(ZNetworkManager **)GZNetworkManager_exref,2,"ZDispatchGame::EndRound_SN");
  ZNetworkManager::Log_Write(this,*(ushort **)GZNetworkManager_exref);
  iVar8 = param_2;
  pUVar1 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
  UZNetwork_DJ::Game_Score_Set
            ((UZNetwork_DJ *)pUVar1,uVar3,uVar4,iVar7,(int)this,uVar2,param_4,iVar8);
  uVar2 = (uint)*(byte *)(param_2 + 0x24);
  uVar3 = (uint)*(byte *)(param_2 + 0x25);
  uVar4 = (uint)*(ushort *)(param_2 + 0x20);
  uVar5 = (uint)*(ushort *)(param_2 + 0x22);
  iVar7 = *(int *)(param_2 + 0x2a);
  ZNetworkManager::Log_Set
            (*(ZNetworkManager **)GZNetworkManager_exref,2,"ZDispatchGame::EndRound_SN");
  ZNetworkManager::Log_Write
            (*(ZNetworkManager **)GZNetworkManager_exref,
             (ushort *)*(ZNetworkManager **)GZNetworkManager_exref);
  pUVar1 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
  UZNetwork_DJ::Game_Score_Set((UZNetwork_DJ *)pUVar1,uVar4,uVar5,param_2,uVar2,uVar3,param_5,iVar7)
  ;
  pUVar1 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
  UZNetwork_DJ::Game_Score_Update((UZNetwork_DJ *)pUVar1);
  pUVar1 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
  UZNetwork_DJ::Game_End_Round((UZNetwork_DJ *)pUVar1,uVar6);
  return;
}
