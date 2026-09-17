// ======== 0x107dab70  FUN_107dab70  @ 107dab70 ========
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
void __thiscall FUN_107dab70(int param_1,int param_2)
{
  bool bVar1;
  UObject *pUVar2;
  int iVar3;
  undefined4 *puVar4;
  if (*(char *)(param_1 + 4) == '\0') {
    ZNetworkManager::Log_Set
              (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchGame::Campaign_CN");
  }
  else {
    pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
    bVar1 = UZNetwork_DJ::Game_Host_Check((UZNetwork_DJ *)pUVar2);
    if (bVar1) {
      pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
      bVar1 = UZNetwork_DJ::Game_Play_Check((UZNetwork_DJ *)pUVar2);
      if (bVar1) {
        puVar4 = &DAT_10904f30;
        for (iVar3 = 0x100; iVar3 != 0; iVar3 = iVar3 + -1) {
          *puVar4 = 0;
          puVar4 = puVar4 + 1;
        }
        DAT_10904f41 = 0;
        _DAT_10904f3c = 0x230139;
        DAT_10904f34._2_2_ = 0x13;
        DAT_10904f40 = 1;
        DAT_10904f42 = 2;
        if (param_2 == 1) {
          DAT_10904f42 = 1;
        }
        ZNetworkManager::Log_Set
                  (*(ZNetworkManager **)GZNetworkManager_exref,2,"ZDispatchGame::Campaign_CN");
        ZNetworkManager::Log_Write
                  ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
        ZNetworkManager::Send(*(ZNetworkManager **)GZNetworkManager_exref,(Format *)&DAT_10904f30,0)
        ;
        return;
      }
      ZNetworkManager::Log_Set
                (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchGame::Campaign_CN");
    }
    else {
      ZNetworkManager::Log_Set
                (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchGame::Campaign_CN");
    }
  }
  ZNetworkManager::Log_Write
            ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
  return;
}
// ======== 0x107d7040  FUN_107d7040  @ 107d7040 ========
void __thiscall FUN_107d7040(int param_1,int param_2,undefined4 param_3,int param_4,int param_5)
{
  UObject *pUVar1;
  uint uVar2;
  ZNetworkManager *this;
  uint uVar3;
  uint uVar4;
  uint uVar5;
  int iVar6;
  int iVar7;
  if (*(char *)(param_1 + 4) == '\0') {
    ZNetworkManager::Log_Set
              (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchGame::Campaign_SN");
    ZNetworkManager::Log_Write
              ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
    return;
  }
  ZNetworkManager::Log_Set
            (*(ZNetworkManager **)GZNetworkManager_exref,2,"ZDispatchGame::Campaign_SN");
  ZNetworkManager::Log_Write
            (*(ZNetworkManager **)(param_2 + 0x12),*(ushort **)GZNetworkManager_exref);
  if ((*(short *)(param_2 + 0x10) == 0) && (*(int *)(param_2 + 0x12) == 0)) {
    uVar2 = (uint)*(byte *)(param_2 + 0x22);
    uVar5 = (uint)*(ushort *)(param_2 + 0x1d);
    uVar3 = (uint)*(ushort *)(param_2 + 0x1f);
    uVar4 = (uint)*(byte *)(param_2 + 0x21);
    iVar6 = *(int *)(param_2 + 0x27);
    ZNetworkManager::Log_Set
              (*(ZNetworkManager **)GZNetworkManager_exref,2,"ZDispatchGame::Campaign_SN");
    ZNetworkManager::Log_Write
              ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
    iVar7 = param_2;
    pUVar1 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
    UZNetwork_DJ::Game_Score_Set((UZNetwork_DJ *)pUVar1,uVar5,uVar3,uVar4,iVar6,uVar2,param_4,iVar7)
    ;
    this = (ZNetworkManager *)(uint)*(byte *)(param_2 + 0x30);
    uVar4 = (uint)*(ushort *)(param_2 + 0x2b);
    uVar2 = (uint)*(ushort *)(param_2 + 0x2d);
    uVar3 = (uint)*(byte *)(param_2 + 0x2f);
    iVar6 = *(int *)(param_2 + 0x35);
    ZNetworkManager::Log_Set
              (*(ZNetworkManager **)GZNetworkManager_exref,2,"ZDispatchGame::Campaign_SN");
    ZNetworkManager::Log_Write(this,*(ushort **)GZNetworkManager_exref);
    pUVar1 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
    UZNetwork_DJ::Game_Score_Set
              ((UZNetwork_DJ *)pUVar1,uVar4,uVar2,uVar3,param_2,(int)this,param_5,iVar6);
    pUVar1 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
    UZNetwork_DJ::Game_Score_Update((UZNetwork_DJ *)pUVar1);
  }
  return;
}
