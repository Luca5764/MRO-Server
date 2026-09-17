// ======== 0x107c0d40  FUN_107c0d40  @ 107c0d40 ========
void __thiscall FUN_107c0d40(int param_1,int param_2)

{
  char *pcVar1;
  UObject *pUVar2;
  int iVar3;
  ushort *puVar4;
  ushort local_34 [26];
  
  if (*(char *)(param_1 + 4) == '\0') {
    ZNetworkManager::Log_Set
              (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchAccount::DefaultInfo_SN");
    ZNetworkManager::Log_Write
              ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
    return;
  }
  puVar4 = local_34;
  for (iVar3 = 0xc; iVar3 != 0; iVar3 = iVar3 + -1) {
    puVar4[0] = 0;
    puVar4[1] = 0;
    puVar4 = puVar4 + 2;
  }
  *puVar4 = 0;
  pcVar1 = (char *)(param_2 + 0x12);
  if (pcVar1 != (char *)0x0) {
    iVar3 = winGetSizeUNICODE(pcVar1);
    if (iVar3 < 0x19) {
      iVar3 = winGetSizeUNICODE(pcVar1);
      if (iVar3 < 1) {
        local_34[0] = 0;
        goto LAB_107c0dda;
      }
    }
    else {
      iVar3 = 0x19;
    }
    winToUNICODE(local_34,pcVar1,iVar3);
    local_34[iVar3 + -1] = 0;
  }
LAB_107c0dda:
  iVar3 = atoi((char *)(param_2 + 0x10));
  ZNetworkManager::Log_Set
            (*(ZNetworkManager **)GZNetworkManager_exref,2,"ZDispatchAccount::DefaultInfo_SN");
  ZNetworkManager::Log_Write
            (*(ZNetworkManager **)GZNetworkManager_exref,
             (ushort *)*(ZNetworkManager **)GZNetworkManager_exref);
  puVar4 = local_34 + 2;
  pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
  UZNetwork_DJ::Account_Name_Set((UZNetwork_DJ *)pUVar2,puVar4);
  pUVar2 = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
  UZNetwork_DJ::Account_UserType_Set((UZNetwork_DJ *)pUVar2,iVar3);
  return;
}


