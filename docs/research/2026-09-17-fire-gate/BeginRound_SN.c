// ======== 0x107d5ad0  FUN_107d5ad0  @ 107d5ad0 ========
void __fastcall FUN_107d5ad0(int param_1)

{
  UObject *this;
  
  if (*(char *)(param_1 + 4) == '\0') {
    ZNetworkManager::Log_Set
              (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchGame::BeginRound_SN");
    ZNetworkManager::Log_Write
              ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
    return;
  }
  ZNetworkManager::Log_Set
            (*(ZNetworkManager **)GZNetworkManager_exref,1,"ZDispatchGame::BeginRound_SN");
  ZNetworkManager::Log_Write
            ((ZNetworkManager *)GZNetworkManager_exref,*(ushort **)GZNetworkManager_exref);
  this = UClass::GetDefaultObject(&UZNetwork_DJ::PrivateStaticClass);
  UZNetwork_DJ::Game_Play_Start((UZNetwork_DJ *)this);
  return;
}


