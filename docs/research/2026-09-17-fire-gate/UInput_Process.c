// ======== 0x10468e00  Process  @ 10468e00 ========
/* public: virtual int __thiscall UInput::Process(class FOutputDevice &,enum EInputKey,enum
   EInputAction,float) */

int __thiscall
UInput::Process(UInput *this,FOutputDevice *param_1,EInputKey param_2,EInputAction param_3,
               float param_4)

{
  int iVar1;
  ushort *puVar2;
  void *local_10;
  undefined1 *puStack_c;
  undefined4 local_8;
  
                    /* 0x168e00  6700
                       ?Process@UInput@@UAEHAAVFOutputDevice@@W4EInputKey@@W4EInputAction@@M@Z */
  puStack_c = &LAB_1065b5c0;
  local_10 = ExceptionList;
  local_8 = 0;
  if (((int)param_2 < 0) || (ExceptionList = &local_10, 0xfe < (int)param_2)) {
    ExceptionList = &local_10;
    appFailAssert("iKey>=0&&iKey<IK_MAX",".\\UnIn.cpp",0x2d7);
  }
  iVar1 = FString::Len((FString *)(this + (param_2 * 3 + 0xd8) * 4));
  if (iVar1 != 0) {
    *(EInputAction *)(this + 0xf64) = param_3;
    *(float *)(this + 0xf68) = param_4;
    puVar2 = FString::operator*((FString *)(this + (param_2 * 3 + 0xd8) * 4));
    (**(code **)(*(int *)this + 0xa8))(puVar2,param_1);
    *(undefined4 *)(this + 0xf64) = 0;
    *(undefined4 *)(this + 0xf68) = 0;
    ExceptionList = local_10;
    return 1;
  }
  ExceptionList = local_10;
  return 0;
}


