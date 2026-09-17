// ======== 0x10147ad0  ScriptConsoleExec  @ 10147ad0 ========
/* WARNING: Function: __chkstk replaced with injection: alloca_probe */
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
/* public: virtual int __thiscall UObject::ScriptConsoleExec(unsigned short const *,class
   FOutputDevice &,class UObject *) */

int __thiscall
UObject::ScriptConsoleExec(UObject *this,ushort *param_1,FOutputDevice *param_2,UObject *param_3)

{
  ushort uVar1;
  UObject *pUVar2;
  int *piVar3;
  int iVar4;
  uint *puVar5;
  int iVar6;
  ushort *puVar7;
  uint uVar8;
  FOutputDevice *this_00;
  uint uVar9;
  undefined4 *puVar10;
  int iVar11;
  ushort local_bc [64];
  FName local_3c [12];
  uint local_30;
  UObject *local_2c;
  int local_28;
  int local_24;
  undefined4 *local_20;
  int local_1c;
  int *local_18;
  undefined1 *local_14;
  void *local_10;
  undefined1 *puStack_c;
  undefined4 local_8;
  
                    /* 0x47ad0  1662  ?ScriptConsoleExec@UObject@@UAEHPBGAAVFOutputDevice@@PAV1@@Z
                        */
  puStack_c = &LAB_10166e68;
  local_10 = ExceptionList;
  local_14 = &stack0xffffff38;
  local_8 = 0;
  if (GIsScriptable == 0) {
    return 0;
  }
  ExceptionList = &local_10;
  local_2c = this;
  iVar4 = ParseToken(&param_1,local_bc,0x40,1);
  if (iVar4 == 0) {
    ExceptionList = local_10;
    return 0;
  }
  puVar5 = (uint *)FName::FName(local_3c,local_bc,0);
  local_30 = *puVar5;
  if (local_30 == 0) {
    ExceptionList = local_10;
    return 0;
  }
  if ((*(int *)(this + 0xc) != 0) && (iVar4 = *(int *)(*(int *)(this + 0xc) + 0x1c), iVar4 != 0)) {
    for (iVar4 = *(int *)(iVar4 + 0x9c + (local_30 & 0xff) * 4); iVar4 != 0;
        iVar4 = *(int *)(iVar4 + 0x34)) {
      if (*(uint *)(iVar4 + 0x24) == local_30) goto LAB_10147b81;
    }
  }
  iVar4 = *(int *)(*(int *)(this + 0x28) + 0x9c + (local_30 & 0xff) * 4);
  while( true ) {
    if (iVar4 == 0) {
      ExceptionList = local_10;
      return 0;
    }
    if (*(uint *)(iVar4 + 0x24) == local_30) break;
    iVar4 = *(int *)(iVar4 + 0x34);
  }
LAB_10147b81:
  if (((iVar4 == 0) || ((*(uint *)(*(int *)(iVar4 + 0x28) + 0x49c) & 0x80000) == 0)) ||
     ((*(uint *)(iVar4 + 0x84) & 0x200) == 0)) {
    ExceptionList = local_10;
    return 0;
  }
  uVar1 = *(ushort *)(iVar4 + 0x8e);
  if (uVar1 == 0) {
    local_20 = (undefined4 *)0x0;
  }
  else {
    local_14 = &stack0xffffff38;
    local_20 = (undefined4 *)&stack0xffffff38;
  }
  uVar9 = uVar1 & 3;
  puVar10 = local_20;
  for (uVar8 = (uint)(uVar1 >> 2); uVar8 != 0; uVar8 = uVar8 - 1) {
    *puVar10 = 0;
    puVar10 = puVar10 + 1;
  }
  for (; uVar9 != 0; uVar9 = uVar9 - 1) {
    *(undefined1 *)puVar10 = 0;
    puVar10 = (undefined4 *)((int)puVar10 + 1);
  }
  local_24 = -1;
  local_28 = iVar4;
  FUN_10133260(iVar4);
  while ((local_18 != (int *)0x0 && ((*(uint *)((int)local_18 + 0x40) & 0x480) == 0x80))) {
    local_18 = *(int **)((int)local_18 + 0x30);
    local_24 = local_24 + 1;
    FUN_10133080();
  }
  iVar11 = 0;
  if (iVar4 == 0) {
    local_18 = (int *)0x0;
  }
  else {
    local_18 = *(int **)(iVar4 + 0x40);
  }
  local_1c = iVar4;
  FUN_1010b6f0();
  pUVar2 = param_3;
  do {
    piVar3 = local_18;
    if ((local_18 == (int *)0x0) || ((local_18[0x10] & 0x480U) != 0x80)) goto LAB_10147d7f;
    if ((iVar11 == 0) &&
       ((pUVar2 != (UObject *)0x0 && (iVar4 = FUN_10121cb0(local_18), iVar4 != 0)))) {
      for (iVar6 = *(int *)(pUVar2 + 0x28); iVar6 != 0; iVar6 = *(int *)(iVar6 + 0x2c)) {
        if (iVar6 == *(int *)(iVar4 + 0x70)) goto LAB_10147cd8;
      }
      if (*(int *)(iVar4 + 0x70) != 0) goto LAB_10147cf2;
LAB_10147cd8:
      *(UObject **)((int)local_20 + piVar3[0x13]) = pUVar2;
    }
    else {
LAB_10147cf2:
      ParseNext(&param_1);
      param_1 = (ushort *)
                (**(code **)(*piVar3 + 0xa4))
                          (param_1,(undefined1 *)(piVar3[0x13] + (int)local_20),
                           (iVar11 == local_24) - 1U & 2 | 1);
      if (param_1 == (ushort *)0x0) {
        if ((*(byte *)(piVar3 + 0x10) & 0x10) == 0) {
          puVar7 = LocalizeError((ushort *)L"BadProperty",(ushort *)L"Core",(ushort *)0x0);
          this_00 = (FOutputDevice *)(*(int *)(_Names + local_30 * 4) + 0xc);
          FOutputDevice::Logf(this_00,(ushort *)param_2,puVar7,this_00,
                              *(int *)(_Names + piVar3[9] * 4) + 0xc);
          iVar4 = local_28;
          goto LAB_10147d70;
        }
LAB_10147d7f:
        iVar4 = local_28;
        (**(code **)(*(int *)local_2c + 0x10))(local_28,local_20,0);
LAB_10147d70:
        local_1c = iVar4;
        if (iVar4 == 0) {
          local_18 = (int *)0x0;
        }
        else {
          local_18 = *(int **)(iVar4 + 0x40);
        }
        while ((FUN_1010b6f0(), piVar3 = local_18, local_18 != (int *)0x0 &&
               ((local_18[0x10] & 0x480U) == 0x80))) {
          (**(code **)(*local_18 + 0xb8))((undefined1 *)(local_18[0x13] + (int)local_20));
          local_18 = (int *)piVar3[0xc];
        }
        ExceptionList = local_10;
        return 1;
      }
    }
    local_18 = (int *)piVar3[0xc];
    FUN_1010b6f0();
    iVar11 = iVar11 + 1;
  } while( true );
}


