// ======== 0x107cf451  FUN_107cf3b0  @ 107cf3b0 ========
void __thiscall FUN_107cf3b0(int param_1,int param_2)

{
  UObject *this;
  ZNetworkManager *this_00;
  int iVar1;
  
  if (*(char *)(param_1 + 4) != '\0') {
    switch(*(undefined4 *)(param_2 + 0x10)) {
    case 0xb:
      iVar1 = 4;
      break;
    case 0xc:
      iVar1 = 3;
      break;
    case 0xd:
      iVar1 = 1;
      break;
    case 0xe:
      iVar1 = 2;
      break;
    default:
      iVar1 = 0;
    }
    ZNetworkManager::Log_Set
              (*(ZNetworkManager **)GZNetworkManager_exref,2,"ZDispatchCommunity::Grade_Info_SN");
    ZNetworkManager::Log_Write(this_00,*(ushort **)GZNetworkManager_exref);
    this = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
    UZNetwork_DJ::Account_Grade_Set((UZNetwork_DJ *)this,iVar1);
    return;
  }
  ZNetworkManager::Log_Set
            (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchCommunity::Grade_Info_SN");
  ZNetworkManager::Log_Write
            ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
  return;
}


