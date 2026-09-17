// ======== 0x10734610  FUN_10734610  @ 10734610 ========
void __thiscall FUN_10734610(UZNetwork_DJ *param_1,int param_2,FString *param_3)

{
  undefined1 *puVar1;
  FString *pFVar2;
  int iVar3;
  char *pcVar4;
  ushort *puVar5;
  ushort local_828 [1024];
  FString local_28 [20];
  undefined1 *local_14;
  void *local_10;
  undefined1 *puStack_c;
  int local_8;
  
  puStack_c = &LAB_108027e9;
  local_10 = ExceptionList;
  iVar3 = *(int *)(param_2 + 0xc);
  pcVar4 = (char *)(iVar3 + 1);
  ExceptionList = &local_10;
  *(char **)(param_2 + 0xc) = pcVar4;
  local_14 = &stack0xfffff7cc;
  local_8 = 0;
  puVar1 = &stack0xfffff7cc;
  if (*pcVar4 == 'B') {
    *(int *)(param_2 + 0xc) = iVar3 + 2;
    (**(code **)(GNatives_exref + 0x108))(param_2,0);
    puVar1 = local_14;
  }
  local_14 = puVar1;
  puVar5 = local_828;
  for (iVar3 = 0x200; iVar3 != 0; iVar3 = iVar3 + -1) {
    puVar5[0] = 0;
    puVar5[1] = 0;
    puVar5 = puVar5 + 2;
  }
  UZNetwork_DJ::Game_Info_URL_Get(param_1,local_828);
  pFVar2 = (FString *)FString::FString(local_28,local_828);
  local_8._0_1_ = 1;
  FString::operator=(param_3,pFVar2);
  local_8 = (uint)local_8._1_3_ << 8;
  FString::~FString(local_28);
  ExceptionList = local_10;
  return;
}


