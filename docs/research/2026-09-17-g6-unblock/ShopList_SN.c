// ======== 0x107e2ac0  FUN_107e2ac0  @ 107e2ac0 ========
void __thiscall FUN_107e2ac0(int param_1,uint param_2)
{
  uint uVar1;
  UObject *pUVar2;
  int iVar3;
  uint uVar4;
  uint uVar5;
  char *pcVar6;
  char *pcVar7;
  bool bVar8;
  bool unaff_retaddr;
  byte local_19 [5];
  ZNetworkManager *local_14;
  int local_10;
  int local_c;
  int local_8;
  undefined1 auStack_3 [3];
  uVar1 = param_2;
  if (*(char *)(param_1 + 4) == '\0') {
    ZNetworkManager::Log_Set
              (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchHangar::CashShopList_SN");
    ZNetworkManager::Log_Write
              ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
    return;
  }
  uVar5 = 0;
  bVar8 = param_2 != 0;
  param_2 = param_2 & 0xffffff00;
  uVar4 = uVar1;
  if (bVar8) {
    uVar4 = 0;
    if (uVar1 + 0x10 != 0) {
      thunk_FUN_1073d780(&param_2,uVar1 + 0x10,1);
      uVar4 = 0;
      if (uVar1 + 0x11 != 0) {
        thunk_FUN_1073d780(local_19,uVar1 + 0x11,1);
        uVar5 = (uint)local_19[0];
        uVar4 = 0;
        if (uVar1 + 0x12 != 0) {
          thunk_FUN_1073d780(local_19,uVar1 + 0x12,1);
          uVar5 = (uint)local_19[0];
          uVar4 = uVar1 + 0x13;
        }
      }
    }
  }
  do {
    if (uVar5 == 0) {
      return;
    }
    if (uVar4 != 0) {
      thunk_FUN_1073d780(&local_14,uVar4,0x14);
      uVar4 = uVar4 + 0x14;
    }
    pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
    bVar8 = UZNetwork_DJ::Item_List_Check((UZNetwork_DJ *)pUVar2,(int)local_14);
    if (bVar8) {
      ZNetworkManager::Log_Set
                (*(ZNetworkManager **)GZNetworkManager_exref,2,"ZDispatchHangar::CashShopList_SN");
      ZNetworkManager::Log_Write
                (*(ZNetworkManager **)GZNetworkManager_exref,
                 (ushort *)*(ZNetworkManager **)GZNetworkManager_exref);
      bVar8 = true;
      iVar3 = 2;
      pcVar7 = "P";
      pcVar6 = (char *)register0x00000010;
      do {
        pcVar6 = pcVar6 + 1;
        if (iVar3 == 0) break;
        iVar3 = iVar3 + -1;
        bVar8 = *pcVar6 == *pcVar7;
        pcVar7 = pcVar7 + 1;
      } while (bVar8);
      local_14 = (ZNetworkManager *)CONCAT31(local_14._1_3_,!bVar8);
      pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
      UZNetwork_DJ::Item_CashShopList_Add
                ((UZNetwork_DJ *)pUVar2,local_10,local_c,local_8,auStack_3[0],auStack_3[1],
                 auStack_3[2],unaff_retaddr,SUB41(local_14,0));
    }
    else {
      ZNetworkManager::Log_Set
                (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchHangar::CashShopList_SN");
      ZNetworkManager::Log_Write(local_14,*(ushort **)GZNetworkManager_exref);
    }
    uVar5 = uVar5 - 1;
  } while( true );
}
