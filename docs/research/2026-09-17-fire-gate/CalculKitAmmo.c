// ======== 0x10511c73  execSetAmmo  @ 10511b80 ========
/* public: void __thiscall AWeapon::execSetAmmo(struct FFrame &,void * const) */

void __thiscall AWeapon::execSetAmmo(AWeapon *this,FFrame *param_1,void *param_2)

{
  byte bVar1;
  int iVar2;
  char *pcVar3;
  uint uVar4;
  bool bVar5;
  undefined4 local_18;
  undefined1 *local_14;
  void *local_10;
  undefined1 *puStack_c;
  undefined4 local_8;
  
                    /* 0x211b80  8569  ?execSetAmmo@AWeapon@@QAEXAAUFFrame@@QAX@Z */
  puStack_c = &LAB_106601b0;
  local_10 = ExceptionList;
  local_18 = 0;
  bVar1 = **(byte **)(param_1 + 0xc);
  local_14 = &stack0xffffffd4;
  ExceptionList = &local_10;
  *(byte **)(param_1 + 0xc) = *(byte **)(param_1 + 0xc) + 1;
  local_8 = 0;
  (**(code **)(GNatives_exref + (uint)bVar1 * 4))(param_1,&local_18);
  iVar2 = *(int *)(param_1 + 0xc);
  pcVar3 = (char *)(iVar2 + 1);
  *(char **)(param_1 + 0xc) = pcVar3;
  if (*pcVar3 == 'B') {
    *(int *)(param_1 + 0xc) = iVar2 + 2;
    (**(code **)(GNatives_exref + 0x108))(param_1,0);
  }
  UnSecret_UJ(this,*(int *)(this + 0x428));
  UnSecret_UJ(this,*(int *)(this + 0x420));
  param_1 = (FFrame *)FUN_1063e244();
  if (*(int *)(this + 0x3f4) != 0) {
    uVar4 = (uint)param_1 & 0x80000001;
    bVar5 = uVar4 == 0;
    if ((int)uVar4 < 0) {
      bVar5 = (uVar4 - 1 | 0xfffffffe) == 0xffffffff;
    }
    if (!bVar5) {
      param_1 = param_1 + 1;
    }
  }
  iVar2 = Secret_UJ(this,(float)(int)param_1);
  *(int *)(this + 0x428) = iVar2;
  *(int *)(this + 0x48c) = iVar2;
  *(int *)(this + 0x474) = iVar2;
  CalculKitAmmo(this);
  if (((byte)this[0x44c] & 1) == 0) {
    if (param_1 == (FFrame *)0x0) {
      this[0x41c] = (AWeapon)0x9;
    }
    else if (this[0x41c] == (AWeapon)0x9) {
      this[0x41c] = (AWeapon)0x4;
      ExceptionList = local_10;
      return;
    }
  }
  ExceptionList = local_10;
  return;
}


INFO  REPORT: Save succeeded for processed file: /Engine.dll (HeadlessAnalyzer)
