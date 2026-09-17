// ======== 0x107d87e5  FUN_107d87d0  @ 107d87d0 ========
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
undefined4 * FUN_107d87d0(void)
{
  int iVar1;
  undefined4 *puVar2;
  puVar2 = &DAT_10903250;
  for (iVar1 = 0x100; iVar1 != 0; iVar1 = iVar1 + -1) {
    *puVar2 = 0;
    puVar2 = puVar2 + 1;
  }
  _DAT_1090325c = 0x230121;
  DAT_10903254._2_2_ = 0x17;
  return &DAT_10903250;
}
// ======== 0x107d87a5  FUN_107d8790  @ 107d8790 ========
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
undefined4 * FUN_107d8790(void)
{
  int iVar1;
  undefined4 *puVar2;
  puVar2 = &DAT_10902d80;
  for (iVar1 = 0x100; iVar1 != 0; iVar1 = iVar1 + -1) {
    *puVar2 = 0;
    puVar2 = puVar2 + 1;
  }
  _DAT_10902d8c = 0x230123;
  DAT_10902d84._2_2_ = 0x1b;
  return &DAT_10902d80;
}
== 0x107060eb -> 0x107d9c60
// ======== 0x107d9c60  FUN_107d9c60  @ 107d9c60 ========
void __thiscall
FUN_107d9c60(int param_1,int param_2,int param_3,int param_4,Format param_5,int param_6)
{
  bool bVar1;
  UObject *pUVar2;
  Format *pFVar3;
  int iVar4;
  if (*(char *)(param_1 + 4) == '\0') {
    ZNetworkManager::Log_Set
              (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchGame::Assist_CN");
  }
  else {
    pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
    bVar1 = UZNetwork_DJ::Game_Host_Check((UZNetwork_DJ *)pUVar2);
    if (bVar1) {
      pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
      bVar1 = UZNetwork_DJ::Game_Play_Check((UZNetwork_DJ *)pUVar2);
      if (bVar1) {
        if ((param_6 == 2) || (4 < param_6)) {
          iVar4 = param_4;
          pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
          bVar1 = UZNetwork_DJ::Game_User_Check((UZNetwork_DJ *)pUVar2,iVar4);
          if (!bVar1) {
            ZNetworkManager::Log_Set
                      (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchGame::Assist_CN");
            goto LAB_107d9d38;
          }
        }
        else {
          iVar4 = param_2;
          pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
          bVar1 = UZNetwork_DJ::Game_User_Check((UZNetwork_DJ *)pUVar2,iVar4);
          if (!bVar1) {
            ZNetworkManager::Log_Set
                      (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchGame::Assist_CN");
LAB_107d9d38:
            ZNetworkManager::Log_Write
                      ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref)
            ;
            return;
          }
        }
        pFVar3 = (Format *)thunk_FUN_107d87d0();
        pFVar3[0x16] = param_5;
        *(short *)(pFVar3 + 0x10) = (short)param_4;
        *(short *)(pFVar3 + 0x12) = (short)param_2;
        switch(param_6) {
        case 1:
          pFVar3[0x14] = (Format)0x1;
          break;
        case 2:
          pFVar3[0x14] = (Format)0x2;
          break;
        case 3:
          pFVar3[0x14] = (Format)0x3;
          break;
        case 4:
          pFVar3[0x14] = (Format)0x4;
          break;
        default:
          pFVar3[0x14] = (Format)0xb;
          break;
        case 6:
          pFVar3[0x14] = (Format)0xc;
          break;
        case 7:
          pFVar3[0x14] = (Format)0x15;
          break;
        case 8:
          pFVar3[0x14] = (Format)0x16;
          break;
        case 9:
          pFVar3[0x14] = (Format)0x17;
          break;
        case 10:
          pFVar3[0x14] = (Format)0x1f;
          break;
        case 0xb:
          pFVar3[0x14] = (Format)0x20;
          break;
        case 0xc:
          pFVar3[0x14] = (Format)0x21;
          break;
        case 0xd:
          pFVar3[0x14] = (Format)0x29;
          break;
        case 0xe:
          pFVar3[0x14] = (Format)0x2a;
          break;
        case 0xf:
          pFVar3[0x14] = (Format)0x2b;
          break;
        case 0x10:
          pFVar3[0x14] = (Format)0x2c;
          break;
        case 0x11:
          pFVar3[0x14] = (Format)0x2d;
          break;
        case 0x12:
          pFVar3[0x14] = (Format)0x2e;
          break;
        case 0x13:
          pFVar3[0x14] = (Format)0x33;
          break;
        case 0x14:
          pFVar3[0x14] = (Format)0x34;
          break;
        case 0x15:
          pFVar3[0x14] = (Format)0x35;
          break;
        case 0x16:
          pFVar3[0x14] = (Format)0x3d;
          break;
        case 0x17:
          pFVar3[0x14] = (Format)0x47;
          break;
        case 0x18:
          pFVar3[0x14] = (Format)0x51;
          break;
        case 0x19:
          pFVar3[0x14] = (Format)0x52;
          break;
        case 0x1a:
          pFVar3[0x14] = (Format)0x5b;
          break;
        case 0x1b:
          pFVar3[0x14] = (Format)0x5;
          break;
        case 0x1c:
          pFVar3[0x14] = (Format)0x6;
        }
        if (param_3 == 1) {
          pFVar3[0x15] = (Format)0x1;
        }
        else {
          pFVar3[0x15] = (Format)0x2;
        }
        ZNetworkManager::Log_Set
                  (*(ZNetworkManager **)GZNetworkManager_exref,2,"ZDispatchGame::Assist_CN");
        ZNetworkManager::Log_Write
                  ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
        ZNetworkManager::Send(*(ZNetworkManager **)GZNetworkManager_exref,pFVar3,0);
        return;
      }
      ZNetworkManager::Log_Set
                (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchGame::Assist_CN");
    }
    else {
      ZNetworkManager::Log_Set
                (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchGame::Assist_CN");
    }
  }
  ZNetworkManager::Log_Write
            ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
  return;
}
