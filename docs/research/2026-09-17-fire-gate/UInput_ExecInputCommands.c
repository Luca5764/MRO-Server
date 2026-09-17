// ======== 0x10466d80  ExecInputCommands  @ 10466d80 ========
/* protected: virtual void __thiscall UInput::ExecInputCommands(unsigned short const *,class
   FOutputDevice &) */

void __thiscall UInput::ExecInputCommands(UInput *this,ushort *param_1,FOutputDevice *param_2)

{
  FOutputDevice *pFVar1;
  undefined1 *puVar2;
  FString *this_00;
  int iVar3;
  FOutputDevice local_234 [512];
  FString local_34 [16];
  FString local_24 [16];
  undefined1 *local_14;
  void *local_10;
  undefined1 *puStack_c;
  int local_8;
  
                    /* 0x166d80  4609  ?ExecInputCommands@UInput@@MAEXPBGAAVFOutputDevice@@@Z */
  puStack_c = &LAB_1065b4b2;
  local_10 = ExceptionList;
  local_14 = &stack0xfffffdc0;
  local_8 = 0;
  ExceptionList = &local_10;
  puVar2 = &stack0xfffffdc0;
  pFVar1 = param_2;
  if (*(int *)(this + 0xf58) != 0) {
    ExceptionList = &local_10;
    FString::FString(local_24,param_1);
    local_8._0_1_ = 1;
    this_00 = (FString *)FString::Caps(local_24);
    local_8._0_1_ = 2;
    iVar3 = FString::InStr(this_00,(ushort *)L"ONALTMODE",0);
    local_8._0_1_ = 1;
    FString::~FString(local_34);
    if (-1 < iVar3) {
      *(undefined4 *)(this + 0xf5c) = 1;
    }
    local_8 = (uint)local_8._1_3_ << 8;
    FString::~FString(local_24);
    puVar2 = local_14;
    pFVar1 = param_2;
  }
  while (local_14 = puVar2, iVar3 = ParseLine(&param_1,(ushort *)local_234,0x100,0), iVar3 != 0) {
    param_2 = local_234;
    if (((*(int *)(this + 0xf5c) == 0) ||
        (iVar3 = ParseCommand((ushort **)&param_2,(ushort *)L"OnAltMode"), puVar2 = local_14,
        iVar3 != 0)) &&
       (iVar3 = ParseCommand((ushort **)&param_2,(ushort *)L"OnAltMode"), puVar2 = local_14,
       iVar3 == 0)) {
      if ((*(int *)(this + 0xf64) == 1) ||
         ((*(int *)(this + 0xf64) == 3 &&
          (iVar3 = ParseCommand((ushort **)&param_2,(ushort *)L"OnRelease"), iVar3 != 0)))) {
        (*(code *)**(undefined4 **)(*(int *)(this + 0xf54) + 0x30))(param_2,pFVar1);
        puVar2 = local_14;
      }
      else {
        (*(code *)**(undefined4 **)(this + 0x2c))(param_2,pFVar1);
        puVar2 = local_14;
      }
    }
  }
  *(undefined4 *)(this + 0xf5c) = 0;
  ExceptionList = local_10;
  return;
}


