// ======== 0x100359c0  ResetInput  @ 100359c0 ========
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
/* public: virtual void __thiscall UGUIController::ResetInput(void) */

void __thiscall UGUIController::ResetInput(UGUIController *this)

{
  UObject *pUVar1;
  undefined1 *puVar2;
  int iVar3;
  UFunction *pUVar4;
  undefined1 local_15;
  undefined1 *local_14;
  void *local_10;
  undefined1 *puStack_c;
  undefined4 local_8;
  
                    /* 0x359c0  883  ?ResetInput@UGUIController@@UAEXXZ */
  puStack_c = &LAB_10048ba0;
  local_10 = ExceptionList;
  local_14 = &stack0xffffffd4;
  local_8 = 0;
  ExceptionList = &local_10;
  for (iVar3 = 0; iVar3 < 0xff; iVar3 = iVar3 + 1) {
    this[iVar3 + 0x25c] = (UGUIController)0x0;
  }
  pUVar1 = *(UObject **)(this + 0x194);
  this[0x248] = (UGUIController)0x0;
  *(undefined4 *)(this + 0x144) = 0;
  *(undefined4 *)(this + 0x148) = 0;
  *(uint *)(this + 0x24c) = *(uint *)(this + 0x24c) & 0xfff9fff0;
  puVar2 = &stack0xffffffd4;
  if ((pUVar1 != (UObject *)0x0) && (puVar2 = &stack0xffffffd4, pUVar1[0x60] != (UObject)0x2)) {
    local_15 = 2;
    pUVar4 = UObject::FindFunctionChecked(pUVar1,_XINTERFACE_MenuStateChange,0);
    (**(code **)(*(int *)pUVar1 + 0x10))(pUVar4,&local_15,0);
    puVar2 = local_14;
  }
  local_14 = puVar2;
  pUVar1 = *(UObject **)(this + 0x198);
  if ((pUVar1 != (UObject *)0x0) && (pUVar1[0x60] != (UObject)0x0)) {
    local_15 = 0;
    pUVar4 = UObject::FindFunctionChecked(pUVar1,_XINTERFACE_MenuStateChange,0);
    (**(code **)(*(int *)pUVar1 + 0x10))(pUVar4,&local_15,0);
  }
  ExceptionList = local_10;
  return;
}


