// ======== 0x107e5b60  FUN_107e5b60  @ 107e5b60 ========
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void __thiscall
FUN_107e5b60(int param_1,int param_2,int param_3,undefined4 param_4,char param_5,undefined4 param_6,
            undefined1 param_7,undefined2 param_8,undefined1 param_9,undefined2 param_10,
            undefined2 param_11,undefined2 param_12)

{
  UObject *pUVar1;
  ushort *puVar2;
  int iVar3;
  undefined4 *puVar4;
  wchar_t *pwVar5;
  
  if (*(char *)(param_1 + 4) == '\0') {
    ZNetworkManager::Log_Set
              (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchLobby::Create_CQ");
    ZNetworkManager::Log_Write
              ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
    return;
  }
  pUVar1 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
  puVar2 = (ushort *)UZNetwork_DJ::Mech_License_Count_Get((UZNetwork_DJ *)pUVar1);
  if (puVar2 != (ushort *)0x0) {
    if (param_2 == 4) {
      pUVar1 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
      puVar2 = (ushort *)UZNetwork_DJ::Mech_Attack_License_Count_Get((UZNetwork_DJ *)pUVar1);
      if (puVar2 == (ushort *)0x0) {
        pwVar5 = L"NETWORK_NEED_ATTACK_LICENSE";
        pUVar1 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
        UZNetwork_DJ::Event_Call((UZNetwork_DJ *)pUVar1,(ushort *)pwVar5,puVar2);
        return;
      }
    }
    puVar4 = &DAT_1090f2d0;
    for (iVar3 = 0x100; iVar3 != 0; iVar3 = iVar3 + -1) {
      *puVar4 = 0;
      puVar4 = puVar4 + 1;
    }
    _DAT_1090f2dc = 0x220201;
    DAT_1090f2d4._2_2_ = 0x43;
    switch(param_2) {
    case 1:
      DAT_1090f2e0 = 3;
      break;
    case 2:
      DAT_1090f2e0 = 1;
      break;
    case 3:
      DAT_1090f2e0 = 5;
      break;
    case 4:
      DAT_1090f2e0 = 6;
      break;
    default:
      DAT_1090f2e0 = 2;
    }
    if (param_3 < 1) {
      FUN_107e37e0();
    }
    else {
      DAT_1090f2eb = 1;
      _DAT_1090f2ec = (undefined2)param_3;
    }
    if (param_5 != '\0') {
      DAT_1090f307 = 1;
      FUN_107e37e0();
    }
    DAT_1090f2e1 = param_7;
    _DAT_1090f2e2 = param_8;
    DAT_1090f2e6 = param_9;
    _DAT_1090f2e4 = param_10;
    _DAT_1090f2e7 = param_11;
    _DAT_1090f2e9 = param_12;
    ZNetworkManager::Send
              (*(ZNetworkManager **)GZNetworkManager_exref,(Format *)&DAT_1090f2d0,0x220202);
    return;
  }
  pwVar5 = L"NETWORK_NEED_LICENSE";
  pUVar1 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
  UZNetwork_DJ::Event_Call((UZNetwork_DJ *)pUVar1,(ushort *)pwVar5,puVar2);
  return;
}


