// ======== 0x10511a20  execCalculKitAmmo  @ 10511a20 ========
/* public: void __thiscall AWeapon::execCalculKitAmmo(struct FFrame &,void * const) */

void __thiscall AWeapon::execCalculKitAmmo(AWeapon *this,FFrame *param_1,void *param_2)

{
  int iVar1;
  char *pcVar2;
  void *local_10;
  undefined1 *puStack_c;
  undefined4 local_8;
  
                    /* 0x211a20  8190  ?execCalculKitAmmo@AWeapon@@QAEXAAUFFrame@@QAX@Z */
  puStack_c = &LAB_10660190;
  local_10 = ExceptionList;
  iVar1 = *(int *)(param_1 + 0xc);
  pcVar2 = (char *)(iVar1 + 1);
  ExceptionList = &local_10;
  *(char **)(param_1 + 0xc) = pcVar2;
  local_8 = 0;
  if (*pcVar2 == 'B') {
    *(int *)(param_1 + 0xc) = iVar1 + 2;
    (**(code **)(GNatives_exref + 0x108))(param_1,0);
  }
  CalculKitAmmo(this);
  ExceptionList = local_10;
  return;
}


INFO  REPORT: Save succeeded for processed file: /Engine.dll (HeadlessAnalyzer)
