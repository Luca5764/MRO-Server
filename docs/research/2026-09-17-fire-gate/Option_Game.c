Option_Game_SN@ZDispatchCommunity 0x10705e9d -> 0x107d1120
// ======== 0x107d1120  FUN_107d1120  @ 107d1120 ========
void FUN_107d1120(int param_1)

{
  UObject *pUVar1;
  int iVar2;
  char *pcVar3;
  wchar_t *pwVar4;
  ushort *puVar5;
  ushort local_3f8 [506];
  
  puVar5 = local_3f8;
  for (iVar2 = 0xfa; iVar2 != 0; iVar2 = iVar2 + -1) {
    puVar5[0] = 0;
    puVar5[1] = 0;
    puVar5 = puVar5 + 2;
  }
  *puVar5 = 0;
  pcVar3 = (char *)(param_1 + 0x10);
  if (pcVar3 != (char *)0x0) {
    iVar2 = winGetSizeUNICODE(pcVar3);
    if (iVar2 < 0x1f5) {
      iVar2 = winGetSizeUNICODE(pcVar3);
      if (iVar2 < 1) {
        local_3f8[0] = 0;
        goto LAB_107d118b;
      }
    }
    else {
      iVar2 = 0x1f5;
    }
    winToUNICODE(local_3f8,pcVar3,iVar2);
    local_3f8[iVar2 + -1] = 0;
  }
LAB_107d118b:
  puVar5 = local_3f8;
  pUVar1 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
  UZNetwork_DJ::Option_Server_Game_Set((UZNetwork_DJ *)pUVar1,puVar5);
  puVar5 = (ushort *)0x0;
  pwVar4 = L"NETWORK_OPTION_GAME";
  pUVar1 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
  UZNetwork_DJ::Event_Call((UZNetwork_DJ *)pUVar1,(ushort *)pwVar4,puVar5);
  return;
}


Option_Game_SA@ZDispatchCommunity 0x10707e87 -> 0x107d10a0
// ======== 0x107d10a0  FUN_107d10a0  @ 107d10a0 ========
void __thiscall FUN_107d10a0(int param_1,int param_2)

{
  int iVar1;
  UObject *this;
  
  if (*(char *)(param_1 + 4) == '\0') {
    ZNetworkManager::Log_Set
              (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchCommunity::Option_Game_SA");
    ZNetworkManager::Log_Write
              ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
    return;
  }
  iVar1 = *(int *)(param_2 + 0xc);
  this = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
  UZNetwork_DJ::Event_Call
            ((UZNetwork_DJ *)this,(ushort *)L"NETWORK_OPTION_GAME",iVar1,
             (uint)*(ushort *)(param_2 + 0x10),*(int *)(param_2 + 0x12));
  return;
}


Option_Game_CQ@ZDispatchCommunity 0x10704291 -> 0x107d2e90
// ======== 0x107d2e90  FUN_107d2e90  @ 107d2e90 ========
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void __thiscall FUN_107d2e90(int param_1,ushort *param_2)

{
  int iVar1;
  undefined4 *puVar2;
  
  if (*(char *)(param_1 + 4) == '\0') {
    ZNetworkManager::Log_Set
              (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchCommunity::Option_Game_CQ");
    ZNetworkManager::Log_Write
              ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
    return;
  }
  puVar2 = &DAT_108fe9e8;
  for (iVar1 = 0x100; iVar1 != 0; iVar1 = iVar1 + -1) {
    *puVar2 = 0;
    puVar2 = puVar2 + 1;
  }
  _DAT_108fe9f4 = 0x221221;
  DAT_108fe9ec._2_2_ = 0x205;
  if (param_2 != (ushort *)0x0) {
    iVar1 = winGetSizeANSI(param_2);
    if (iVar1 < 0x1f5) {
      iVar1 = winGetSizeANSI(param_2);
      if (iVar1 < 1) {
        DAT_108fe9f8 = 0;
        goto LAB_107d2f35;
      }
    }
    else {
      iVar1 = 0x1f5;
    }
    winToANSI(&DAT_108fe9f8,param_2,iVar1);
    (&DAT_108fe9f7)[iVar1] = 0;
  }
LAB_107d2f35:
  ZNetworkManager::Send(*(ZNetworkManager **)GZNetworkManager_exref,(Format *)&DAT_108fe9e8,0);
  return;
}


Option_Game_Set@UZNetwork_DJ 0x1070469c -> 0x10715370
// ======== 0x10715370  FUN_10715370  @ 10715370 ========
void __thiscall FUN_10715370(int param_1,int param_2)

{
  byte bVar1;
  int iVar2;
  ushort *puVar3;
  char *pcVar4;
  FString local_28 [20];
  undefined1 *local_14;
  void *local_10;
  undefined1 *puStack_c;
  uint local_8;
  
  puStack_c = &LAB_10801229;
  local_10 = ExceptionList;
  local_14 = &stack0xffffffcc;
  local_8 = 0;
  ExceptionList = &local_10;
  FString::FString(local_28);
  bVar1 = **(byte **)(param_2 + 0xc);
  *(byte **)(param_2 + 0xc) = *(byte **)(param_2 + 0xc) + 1;
  local_8 = CONCAT31(local_8._1_3_,1);
  (**(code **)(GNatives_exref + (uint)bVar1 * 4))(param_2,local_28);
  iVar2 = *(int *)(param_2 + 0xc);
  pcVar4 = (char *)(iVar2 + 1);
  *(char **)(param_2 + 0xc) = pcVar4;
  if (*pcVar4 == 'B') {
    *(int *)(param_2 + 0xc) = iVar2 + 2;
    (**(code **)(GNatives_exref + 0x108))(param_2,0);
  }
  puVar3 = FString::operator*(local_28);
  if (puVar3 == (ushort *)0x0) {
    puVar3 = (ushort *)&DAT_10813740;
  }
  else if (*puVar3 != 5) {
    puVar3 = (ushort *)&DAT_10813890;
  }
  FStringNoInit::operator=((FStringNoInit *)(param_1 + 0x1654),puVar3);
  local_8 = local_8 & 0xffffff00;
  FString::~FString(local_28);
  ExceptionList = local_10;
  return;
}


