// ======== 0x10733cf0  FUN_10733cf0  @ 10733cf0 ========
/* WARNING: Function: __chkstk replaced with injection: alloca_probe */

void __thiscall FUN_10733cf0(UZNetwork_DJ *param_1,wchar_t *param_2)

{
  UCacheManager *pUVar1;
  int *piVar2;
  wchar_t *pwVar3;
  int iVar4;
  wchar_t *_Format;
  int iVar5;
  ZNetworkManager *this;
  undefined4 uVar6;
  undefined4 uVar7;
  wchar_t local_1008 [2];
  wchar_t local_1004 [1022];
  wchar_t local_808 [2];
  undefined1 local_804 [2040];
  undefined4 uStack_c;
  
  uStack_c = 0x10733d00;
  pwVar3 = local_1008;
  for (iVar5 = 0x200; iVar5 != 0; iVar5 = iVar5 + -1) {
    pwVar3[0] = L'\0';
    pwVar3[1] = L'\0';
    pwVar3 = pwVar3 + 2;
  }
  pwVar3 = local_808;
  for (iVar5 = 0x200; iVar5 != 0; iVar5 = iVar5 + -1) {
    pwVar3[0] = L'\0';
    pwVar3[1] = L'\0';
    pwVar3 = pwVar3 + 2;
  }
  pUVar1 = UCacheManager::GetCache();
  if (pUVar1 == (UCacheManager *)0x0) {
    ZNetworkManager::Log_Set
              (*(ZNetworkManager **)GZNetworkManager_exref,1,"UZNetwork_DJ::Game_Info_URL_Get");
    ZNetworkManager::Log_Write(this,*(ushort **)GZNetworkManager_exref);
  }
  else {
    iVar5 = 0;
    if (0 < *(int *)(pUVar1 + 0x84)) {
      piVar2 = *(int **)(pUVar1 + 0x80);
      do {
        if (*piVar2 == *(int *)(param_1 + 0xfc8)) {
          pwVar3 = (wchar_t *)
                   FString::operator*((FString *)(*(int *)(pUVar1 + 0x80) + 0x20 + iVar5 * 0xbc));
          swprintf(local_1008,0x108149ac,pwVar3);
          pwVar3 = (wchar_t *)
                   FString::operator*((FString *)(*(int *)(pUVar1 + 0x80) + 0x54 + iVar5 * 0xbc));
          swprintf(local_808,0x108149b4,pwVar3);
          goto LAB_10733e05;
        }
        iVar5 = iVar5 + 1;
        piVar2 = piVar2 + 0x2f;
      } while (iVar5 < *(int *)(pUVar1 + 0x84));
    }
    ZNetworkManager::Log_Set
              (*(ZNetworkManager **)GZNetworkManager_exref,1,"UZNetwork_DJ::Game_Info_URL_Get");
    ZNetworkManager::Log_Write
              (*(ZNetworkManager **)(param_1 + 0xfc8),*(ushort **)GZNetworkManager_exref);
  }
LAB_10733e05:
  iVar5 = *(int *)(param_1 + 0x44c);
  uVar7 = *(undefined4 *)(param_1 + 0xec4);
  iVar4 = UZNetwork_DJ::Game_User_Team_Get(param_1,iVar5);
  switch(*(undefined4 *)(param_1 + 0xfcc)) {
  case 0:
  case 1:
    uVar6 = *(undefined4 *)(param_1 + 0xfd8);
    break;
  default:
    uVar6 = 0;
    break;
  case 4:
  case 6:
  case 7:
    uVar6 = *(undefined4 *)(param_1 + 0xfd0);
    break;
  case 5:
    uVar6 = *(undefined4 *)(param_1 + 0xfdc);
  }
  if (((byte)param_1[0xfac] & 1) != 0) {
    swprintf(param_2,0x10814a50,local_1004,*(undefined4 *)(param_1 + 0x388),iVar5,local_804,uVar7,
             uVar6,*(undefined4 *)(param_1 + 0xfd4),iVar4);
    return;
  }
  uVar7 = *(undefined4 *)(param_1 + 0xfbc);
  pwVar3 = local_1004;
  _Format = (wchar_t *)FString::operator*((FString *)(param_1 + 0xfb0));
  swprintf(param_2,0x10814b34,_Format,uVar7,pwVar3);
  return;
}


