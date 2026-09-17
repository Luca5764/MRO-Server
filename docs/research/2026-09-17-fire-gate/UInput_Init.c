// ======== 0x10466f20  Init  @ 10466f20 ========
/* public: virtual void __thiscall UInput::Init(class UViewport *) */

void __thiscall UInput::Init(UInput *this,UViewport *param_1)

{
  ushort *puVar1;
  void *local_10;
  undefined1 *puStack_c;
  undefined4 local_8;
  
                    /* 0x166f20  5434  ?Init@UInput@@UAEXPAVUViewport@@@Z */
  puStack_c = &LAB_1065b4c0;
  local_10 = ExceptionList;
  ExceptionList = &local_10;
  *(UViewport **)(this + 0xf54) = param_1;
  local_8 = 0;
  *(undefined4 *)(this + 0xf58) = 0;
  *(undefined4 *)(this + 0xf5c) = 0;
  (**(code **)(*(int *)this + 0x88))();
  puVar1 = UObject::GetName(*(UObject **)(this + 0xf54));
  FOutputDevice::Logf(*(FOutputDevice **)GLog_exref,(EName)*(FOutputDevice **)GLog_exref,
                      (ushort *)0x2fa,L"Input system initialized for %s",puVar1);
  ExceptionList = local_10;
  return;
}


// ======== 0x10467570  StaticInitInput  @ 10467570 ========
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
/* public: static void __cdecl UInput::StaticInitInput(void) */

void __cdecl UInput::StaticInitInput(void)

{
  UStruct *this;
  UNameProperty *this_00;
  UStrProperty *pUVar1;
  UStructProperty *this_01;
  UClass *pUVar2;
  UObject *pUVar3;
  int iVar4;
  ushort *puVar5;
  int iVar6;
  FArchive local_70 [88];
  FName local_18 [4];
  undefined1 *local_14;
  void *local_10;
  undefined1 *puStack_c;
  uint local_8;
  
                    /* 0x167570  7545  ?StaticInitInput@UInput@@SAXXZ */
  puStack_c = &LAB_1065b509;
  local_10 = ExceptionList;
  local_14 = &stack0xffffff84;
  local_8 = 0;
  ExceptionList = &local_10;
  FArchive::FArchive(local_70);
  local_8 = CONCAT31(local_8._1_3_,1);
  this = UStruct::operator_new(0x84,(UObject *)&PrivateStaticClass,(ushort *)L"Alias",0);
  if (this == (UStruct *)0x0) {
    this = (UStruct *)0x0;
  }
  else {
    UStruct::UStruct(this,(UStruct *)0x0);
    *(undefined ***)this = &PTR_LAB_106c0e08;
  }
  UStruct::SetPropertiesSize(this,0x10);
  this_00 = UNameProperty::operator_new(0x70,(UObject *)this,(ushort *)L"Alias",4);
  if (this_00 != (UNameProperty *)0x0) {
    UNameProperty::UNameProperty(this_00,0,0,(ushort *)&DAT_1067da2c,0x2000);
    *(undefined ***)this_00 = &PTR_LAB_106c0d38;
  }
  pUVar1 = UStrProperty::operator_new(0x70,(UObject *)this,(ushort *)L"Command",4);
  if (pUVar1 != (UStrProperty *)0x0) {
    UStrProperty::UStrProperty(pUVar1,0,4,(ushort *)&DAT_1067da2c,0x2000);
    *(undefined ***)pUVar1 = &PTR_LAB_106adb68;
  }
  (**(code **)(*(int *)this + 0x88))(local_70,0);
  this_01 = UStructProperty::operator_new
                      (0x74,(UObject *)&PrivateStaticClass,(ushort *)L"Aliases",4);
  if (this_01 == (UStructProperty *)0x0) {
    this_01 = (UStructProperty *)0x0;
  }
  else {
    UStructProperty::UStructProperty(this_01,0,0x30,(ushort *)L"Aliases",0x2000,this);
    *(undefined ***)this_01 = &PTR_LAB_106c0c48;
  }
  *(undefined4 *)(this_01 + 0x38) = 0x33;
  pUVar2 = UEnum::StaticClass();
  pUVar3 = UObject::StaticFindObjectChecked
                     (pUVar2,(UObject *)&UInteractions::PrivateStaticClass,(ushort *)L"EInputKey",0)
  ;
  iVar6 = 0;
  while( true ) {
    if (0xfe < iVar6) break;
    FName::FName(local_18,0);
    iVar4 = FName::operator!=((FName *)(*(int *)(pUVar3 + 0x38) + iVar6 * 4),local_18);
    if (iVar4 != 0) {
      puVar5 = FName::operator*((FName *)(*(int *)(pUVar3 + 0x38) + iVar6 * 4));
      pUVar1 = UStrProperty::operator_new(0x70,(UObject *)&PrivateStaticClass,puVar5 + 3,4);
      if (pUVar1 != (UStrProperty *)0x0) {
        UStrProperty::UStrProperty(pUVar1,0,(iVar6 * 3 + 0xd8) * 4,(ushort *)L"RawKeys",0x2000);
        *(undefined ***)pUVar1 = &PTR_LAB_106adb68;
      }
    }
    iVar6 = iVar6 + 1;
  }
  (**(code **)(_PrivateStaticClass + 0x88))(local_70);
  local_8 = local_8 & 0xffffff00;
  FArchive::~FArchive(local_70);
  ExceptionList = local_10;
  return;
}


// ======== 0x10321fa0  StaticConfigName  @ 10321fa0 ========
/* protected: static unsigned short const * __cdecl UInput::StaticConfigName(void) */

ushort * __cdecl UInput::StaticConfigName(void)

{
                    /* 0x21fa0  7524  ?StaticConfigName@UInput@@KAPBGXZ */
  return (ushort *)L"User";
}


// ======== 0x10469af0  ResetInput  @ 10469af0 ========
/* public: virtual void __thiscall UInput::ResetInput(void) */

void __thiscall UInput::ResetInput(UInput *this)

{
  int iVar1;
  UClass *pUVar2;
  int local_20;
  void *local_10;
  undefined1 *puStack_c;
  undefined4 local_8;
  
                    /* 0x169af0  6876  ?ResetInput@UInput@@UAEXXZ */
  puStack_c = &LAB_1065b6a0;
  local_10 = ExceptionList;
  local_8 = 0;
  ExceptionList = &local_10;
  if (*(int *)(this + 0xf54) == 0) {
    ExceptionList = &local_10;
    appFailAssert("Viewport",".\\UnIn.cpp",0x379);
  }
  for (iVar1 = 0; iVar1 < 0xff; iVar1 = iVar1 + 1) {
    this[iVar1 + 0xf6c] = (UInput)0x0;
  }
  pUVar2 = UObject::GetClass(*(UObject **)(*(int *)(this + 0xf54) + 0x34));
  if (pUVar2 == (UClass *)0x0) {
    local_20 = 0;
  }
  else {
    local_20 = *(int *)(pUVar2 + 0x40);
  }
  while( true ) {
    FUN_10467380();
    if (local_20 == 0) break;
    if ((*(byte *)(local_20 + 0x40) & 4) != 0) {
      *(undefined1 *)(*(int *)(*(int *)(this + 0xf54) + 0x34) + *(int *)(local_20 + 0x4c)) = 0;
    }
    local_20 = *(int *)(local_20 + 0x30);
  }
  pUVar2 = UObject::GetClass(*(UObject **)(*(int *)(this + 0xf54) + 0x34));
  if (pUVar2 == (UClass *)0x0) {
    local_20 = 0;
  }
  else {
    local_20 = *(int *)(pUVar2 + 0x40);
  }
  while( true ) {
    FUN_104673f0();
    if (local_20 == 0) break;
    if ((*(byte *)(local_20 + 0x40) & 4) != 0) {
      *(undefined4 *)(*(int *)(*(int *)(this + 0xf54) + 0x34) + *(int *)(local_20 + 0x4c)) = 0;
    }
    local_20 = *(int *)(local_20 + 0x30);
  }
  *(undefined4 *)(this + 0xf64) = 0;
  *(undefined4 *)(this + 0xf68) = 0;
  (**(code **)(**(int **)(this + 0xf54) + 0x9c))(1,0);
  ExceptionList = local_10;
  return;
}


