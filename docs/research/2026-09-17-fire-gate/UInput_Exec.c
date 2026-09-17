// ======== 0x104683c0  Exec  @ 104683c0 ========
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
/* public: virtual int __thiscall UInput::Exec(unsigned short const *,class FOutputDevice &) */

int __thiscall UInput::Exec(UInput *this,ushort *param_1,FOutputDevice *param_2)

{
  FString *this_00;
  undefined4 uVar1;
  bool bVar2;
  int iVar3;
  int iVar4;
  char *pcVar5;
  byte *pbVar6;
  float *pfVar7;
  ushort *puVar8;
  FString *this_01;
  FOutputDevice *extraout_ECX;
  FOutputDevice *extraout_ECX_00;
  FOutputDevice *extraout_ECX_01;
  FOutputDevice *this_02;
  float fVar9;
  code *pcVar10;
  code *pcVar11;
  uint uVar12;
  float10 fVar13;
  wchar_t *pwVar14;
  ushort local_248 [256];
  FString local_48 [24];
  FString local_30 [12];
  int local_24;
  UInput *local_20;
  float local_1c;
  float local_18;
  undefined1 *local_14;
  void *local_10;
  undefined1 *puStack_c;
  int local_8;
  
                    /* 0x1683c0  4600  ?Exec@UInput@@UAEHPBGAAVFOutputDevice@@@Z */
  pcVar11 = ParseCommand_exref;
  puStack_c = &LAB_1065b5ac;
  local_10 = ExceptionList;
  local_14 = &stack0xfffffdac;
  local_1c = 0.0;
  local_8 = 0;
  ExceptionList = &local_10;
  local_20 = this;
  iVar3 = ParseCommand(&param_1,(ushort *)L"setinput_BD");
  pcVar10 = ParseToken_exref;
  if ((iVar3 != 0) && (iVar3 = ParseToken(&param_1,local_248,0x100,0), iVar3 != 0)) {
    local_18 = (float)appAtoi(local_248);
    if ((-1 < (int)local_18) && ((int)local_18 < 0xff)) {
      FStringNoInit::operator=((FStringNoInit *)(this + (int)local_18 * 0xc + 0x334),param_1);
    }
    for (fVar9 = 0.0; pcVar10 = ParseToken_exref, (int)fVar9 < 0xff; fVar9 = (float)((int)fVar9 + 1)
        ) {
      iVar3 = FString::operator==((FString *)(this + (int)fVar9 * 0xc + 0x334),param_1);
      if ((iVar3 != 0) && (fVar9 != local_18)) {
        FStringNoInit::operator=
                  ((FStringNoInit *)(this + (int)fVar9 * 0xc + 0x334),(ushort *)&DAT_1067da2c);
      }
      pcVar11 = ParseCommand_exref;
    }
  }
  iVar3 = (*pcVar11)(&param_1,L"ALTMODE");
  if (iVar3 == 0) {
    iVar3 = (*pcVar11)(&param_1,L"BUTTON");
    if (iVar3 == 0) {
      iVar3 = (*pcVar11)(&param_1,L"PULSE");
      if (iVar3 == 0) {
        iVar3 = (*pcVar11)(&param_1,L"TOGGLE");
        if (iVar3 == 0) {
          iVar3 = (*pcVar11)(&param_1,L"AXIS");
          if (iVar3 != 0) {
            if (((*(int *)(*(int *)(this + 0xf28) + 0x34) == 0) ||
                (iVar3 = (*pcVar10)(&param_1,local_248,0x100,0), iVar3 == 0)) ||
               (pfVar7 = (float *)(**(code **)(*(int *)(this + -0x2c) + 0xa4))
                                            (*(undefined4 *)(*(int *)(this + 0xf28) + 0x34),
                                             local_248), pfVar7 == (float *)0x0)) {
              FOutputDevice::Logf(param_2,(ushort *)param_2,L"%s Bad Axis command",param_1);
              ExceptionList = local_10;
              return 1;
            }
            param_2 = (FOutputDevice *)0x3f800000;
            local_18 = 0.0;
            local_1c = 0.0;
            local_24 = 1;
            Parse(param_1,(ushort *)L"SPEED=",(float *)&param_2);
            Parse(param_1,(ushort *)L"SPEEDBASE=",&local_18);
            Parse(param_1,(ushort *)L"INVERT=",&local_24);
            Parse(param_1,(ushort *)L"DEADZONE=",&local_1c);
            if (_DAT_10679f38 < local_18) {
              fVar13 = (float10)FUN_10338600(param_2);
              if (fVar13 <= (float10)local_1c) {
                ExceptionList = local_10;
                return 1;
              }
              if ((float)param_2 <= _DAT_10679f38) {
                fVar9 = -((-(float)param_2 - local_1c) / (_DAT_1067d620 - local_1c));
              }
              else {
                fVar9 = ((float)param_2 - local_1c) / (_DAT_1067d620 - local_1c);
              }
              *pfVar7 = (float)local_24 * *(float *)(local_20 + 0xf3c) * local_18 * fVar9 + *pfVar7;
              ExceptionList = local_10;
              return 1;
            }
            if (*(int *)(this + 0xf38) == 4) {
              *pfVar7 = (float)local_24 * *(float *)(this + 0xf3c) * (float)param_2 * _DAT_1067eb28
                        + *pfVar7;
              ExceptionList = local_10;
              return 1;
            }
            if (*(int *)(this + 0xf38) != 2) {
              ExceptionList = local_10;
              return 1;
            }
            *pfVar7 = (float)local_24 * *(float *)(local_20 + 0xf3c) * (float)param_2 + *pfVar7;
            ExceptionList = local_10;
            return 1;
          }
          iVar3 = (*pcVar11)(&param_1,L"COUNT");
          if (iVar3 != 0) {
            if (((*(int *)(*(int *)(this + 0xf28) + 0x34) != 0) &&
                (iVar3 = (*pcVar10)(&param_1,local_248,0x100,0), iVar3 != 0)) &&
               (pcVar5 = (char *)(**(code **)(*(int *)(this + -0x2c) + 0xa0))
                                           (*(undefined4 *)(*(int *)(this + 0xf28) + 0x34),local_248
                                           ), pcVar5 != (char *)0x0)) {
              *pcVar5 = *pcVar5 + '\x01';
              ExceptionList = local_10;
              return 1;
            }
            FOutputDevice::Logf(param_2,(ushort *)param_2,L"%s Bad Count command",param_1);
            ExceptionList = local_10;
            return 1;
          }
          iVar3 = (*pcVar11)(&param_1,L"KEYNUMBER");
          if (iVar3 == 0) {
            iVar3 = (*pcVar11)(&param_1,L"KEYNAME");
            if (iVar3 == 0) {
              iVar3 = (*pcVar11)(&param_1,L"LOCALIZEDKEYNAME");
              if (iVar3 == 0) {
                iVar3 = (*pcVar11)(&param_1,L"KEYBINDING");
                if (iVar3 == 0) {
                  iVar3 = (*pcVar11)(&param_1,L"COUNTBINDINGTOKEY");
                  if (iVar3 != 0) {
                    iVar3 = (*pcVar10)(&param_1,local_248,0x100,0);
                    if (iVar3 == 0) {
                      ExceptionList = local_10;
                      return 1;
                    }
                    local_18 = 0.0;
                    this_02 = extraout_ECX;
                    for (iVar3 = 0; iVar3 < 0xff; iVar3 = iVar3 + 1) {
                      iVar4 = FString::Len((FString *)(this + iVar3 * 0xc + 0x334));
                      this_02 = extraout_ECX_00;
                      if (iVar4 != 0) {
                        puVar8 = FString::operator*((FString *)(this + iVar3 * 0xc + 0x334));
                        iVar4 = appStricmp(local_248,puVar8);
                        this_02 = extraout_ECX_01;
                        if (iVar4 == 0) {
                          local_18 = (float)((int)local_18 + 1);
                        }
                      }
                    }
                    FOutputDevice::Logf(this_02,(ushort *)param_2,&DAT_106a7dc8,local_18);
                    ExceptionList = local_10;
                    return 1;
                  }
                  iVar3 = (*pcVar11)(&param_1,L"FINDKEYBINDS");
                  if (iVar3 == 0) {
                    iVar3 = (*pcVar11)(&param_1,L"BINDINGTOKEY");
                    if (iVar3 == 0) {
                      if (DAT_10843a4c != 0) {
                        ExceptionList = local_10;
                        return 0;
                      }
                      iVar3 = (*pcVar10)(&param_1,local_248,0x100,0);
                      if (iVar3 == 0) {
                        ExceptionList = local_10;
                        return 0;
                      }
                      FName::FName((FName *)&local_20,local_248,0);
                      FName::FName((FName *)&local_18,0);
                      iVar3 = FName::operator!=((FName *)&local_20,(FName *)&local_18);
                      if (iVar3 == 0) {
                        ExceptionList = local_10;
                        return 0;
                      }
                      uVar12 = 0;
                      while( true ) {
                        if (0x32 < uVar12) {
                          ExceptionList = local_10;
                          return 0;
                        }
                        iVar3 = FName::operator==((FName *)(this + uVar12 * 0x10 + 4),
                                                  (FName *)&local_20);
                        if (iVar3 != 0) break;
                        uVar12 = uVar12 + 1;
                      }
                      uVar1 = *(undefined4 *)(this + 0xf30);
                      local_8 = CONCAT31(local_8._1_3_,4);
                      *(undefined4 *)(this + 0xf30) = 0;
                      DAT_10843a4c = 1;
                      puVar8 = FString::operator*((FString *)(this + uVar12 * 0x10 + 8));
                      (**(code **)(*(int *)(this + -0x2c) + 0xa8))(puVar8,param_2);
                      DAT_10843a4c = 0;
                      *(undefined4 *)(this + 0xf30) = uVar1;
                      ExceptionList = local_10;
                      return 1;
                    }
                    iVar3 = (*pcVar10)(&param_1,local_248,0x100,0);
                    if (iVar3 == 0) {
                      ExceptionList = local_10;
                      return 1;
                    }
                    FString::FString(local_30);
                    local_8._0_1_ = 3;
                    for (iVar3 = 0; iVar3 < 0xff; iVar3 = iVar3 + 1) {
                      iVar4 = FString::Len((FString *)(this + iVar3 * 0xc + 0x334));
                      if (iVar4 != 0) {
                        puVar8 = FString::operator*((FString *)(this + iVar3 * 0xc + 0x334));
                        iVar4 = appStricmp(local_248,puVar8);
                        if (iVar4 == 0) {
                          iVar4 = FString::Len(local_30);
                          if (iVar4 != 0) {
                            FString::operator+=(local_30,(ushort *)&DAT_1069ba88);
                          }
                          puVar8 = (ushort *)(**(code **)(*(int *)(this + -0x2c) + 0x8c))(iVar3);
                          FString::operator+=(local_30,puVar8);
                        }
                      }
                    }
                  }
                  else {
                    iVar3 = (*pcVar10)(&param_1,local_248,0x100,0);
                    if (iVar3 == 0) {
                      ExceptionList = local_10;
                      return 1;
                    }
                    FString::FString(local_30);
                    local_8._0_1_ = 1;
                    for (iVar3 = 0; iVar3 < 0xff; iVar3 = iVar3 + 1) {
                      appStrlen(local_248);
                      this_00 = (FString *)(this + iVar3 * 0xc + 0x334);
                      this_01 = (FString *)FString::Left(this_00,(int)local_48);
                      local_1c = (float)((uint)local_1c | 1);
                      local_8 = CONCAT31(local_8._1_3_,2);
                      iVar4 = FString::operator==(this_01,local_248);
                      if ((iVar4 == 0) || (iVar4 = FString::InStr(local_30,this_00,0), iVar4 != -1))
                      {
                        bVar2 = false;
                      }
                      else {
                        bVar2 = true;
                      }
                      local_8._0_1_ = 1;
                      local_8._1_3_ = 0;
                      if (((uint)local_1c & 1) != 0) {
                        local_1c = (float)((uint)local_1c & 0xfffffffe);
                        FString::~FString(local_48);
                      }
                      if (bVar2) {
                        iVar4 = FString::operator!=(local_30,(ushort *)&DAT_1067da2c);
                        if (iVar4 != 0) {
                          FString::operator+=(local_30,(ushort *)&DAT_1069ba88);
                        }
                        FString::operator+=(local_30,this_00);
                      }
                      this = local_20;
                    }
                  }
                  puVar8 = FString::operator*(local_30);
                  FOutputDevice::Log(param_2,puVar8);
                  local_8 = (uint)local_8._1_3_ << 8;
                  FString::~FString(local_30);
                  ExceptionList = local_10;
                  return 1;
                }
                iVar3 = (**(code **)(*(int *)(this + -0x2c) + 0x94))(param_1,&local_20);
                if (iVar3 == 0) {
                  ExceptionList = local_10;
                  return 1;
                }
                iVar3 = FString::Len((FString *)(this + (int)local_20 * 0xc + 0x334));
                if (iVar3 == 0) {
                  ExceptionList = local_10;
                  return 1;
                }
                pwVar14 = (wchar_t *)
                          FString::operator*((FString *)(this + (int)local_20 * 0xc + 0x334));
              }
              else {
                iVar3 = appAtoi(param_1);
                pwVar14 = (wchar_t *)(**(code **)(*(int *)(this + -0x2c) + 0x90))(iVar3);
              }
            }
            else {
              iVar3 = appAtoi(param_1);
              pwVar14 = (wchar_t *)(**(code **)(*(int *)(this + -0x2c) + 0x8c))(iVar3);
            }
          }
          else {
            iVar3 = (**(code **)(*(int *)(this + -0x2c) + 0x94))(param_1,&local_20);
            if (iVar3 == 0) {
              ExceptionList = local_10;
              return 0;
            }
            pwVar14 = (wchar_t *)appItoa((int)local_20);
          }
        }
        else {
          if (((*(int *)(*(int *)(this + 0xf28) + 0x34) != 0) &&
              (iVar3 = (*pcVar10)(&param_1,local_248,0x100,0), iVar3 != 0)) &&
             (pbVar6 = (byte *)(**(code **)(*(int *)(this + -0x2c) + 0xa0))
                                         (*(undefined4 *)(*(int *)(this + 0xf28) + 0x34),local_248),
             pbVar6 != (byte *)0x0)) {
            if (*(int *)(this + 0xf38) != 1) {
              ExceptionList = local_10;
              return 1;
            }
            *pbVar6 = *pbVar6 ^ 0x80;
            ExceptionList = local_10;
            return 1;
          }
          pwVar14 = L"Bad Toggle command";
        }
        goto LAB_10468961;
      }
      if ((*(int *)(*(int *)(this + 0xf28) + 0x34) != 0) &&
         (iVar3 = (*pcVar10)(&param_1,local_248,0x100,0), iVar3 != 0)) {
        pcVar5 = (char *)(**(code **)(*(int *)(this + -0x2c) + 0xa0))
                                   (*(undefined4 *)(*(int *)(this + 0xf28) + 0x34),local_248);
        if ((pcVar5 != (char *)0x0) ||
           ((iVar3 = *(int *)(*(int *)(*(int *)(this + 0xf28) + 0x34) + 0x3c0), iVar3 != 0 &&
            (pcVar5 = (char *)(**(code **)(*(int *)(this + -0x2c) + 0xa0))(iVar3,local_248),
            pcVar5 != (char *)0x0)))) {
          if (*(int *)(this + 0xf38) != 1) {
            ExceptionList = local_10;
            return 1;
          }
          goto LAB_10468674;
        }
      }
    }
    else if ((*(int *)(*(int *)(this + 0xf28) + 0x34) != 0) &&
            (iVar3 = (*pcVar10)(&param_1,local_248,0x100,0), iVar3 != 0)) {
      pcVar5 = (char *)(**(code **)(*(int *)(this + -0x2c) + 0xa0))
                                 (*(undefined4 *)(*(int *)(this + 0xf28) + 0x34),local_248);
      if ((pcVar5 != (char *)0x0) ||
         ((iVar3 = *(int *)(*(int *)(*(int *)(this + 0xf28) + 0x34) + 0x3c0), iVar3 != 0 &&
          (pcVar5 = (char *)(**(code **)(*(int *)(this + -0x2c) + 0xa0))(iVar3,local_248),
          pcVar5 != (char *)0x0)))) {
        if (*(int *)(this + 0xf38) != 1) {
          if (*(int *)(this + 0xf38) != 3) {
            ExceptionList = local_10;
            return 1;
          }
          if (*pcVar5 == '\0') {
            ExceptionList = local_10;
            return 1;
          }
          *pcVar5 = '\0';
          ExceptionList = local_10;
          return 1;
        }
LAB_10468674:
        *pcVar5 = '\x01';
        ExceptionList = local_10;
        return 1;
      }
    }
    pwVar14 = L"Bad Button command";
  }
  else {
    iVar3 = (*pcVar11)(&param_1,L"PRESS");
    iVar4 = (*pcVar11)(&param_1,L"HOLD");
    if ((iVar3 != 0) || (iVar4 != 0)) {
      if (*(int *)(this + 0xf38) != 1) {
        if (*(int *)(this + 0xf38) != 3) {
          ExceptionList = local_10;
          return 1;
        }
        if (iVar4 == 0) {
          ExceptionList = local_10;
          return 1;
        }
      }
      *(uint *)(this + 0xf2c) = (uint)(*(int *)(this + 0xf2c) == 0);
      ExceptionList = local_10;
      return 1;
    }
    pwVar14 = L"Bad AltMode command";
  }
LAB_10468961:
  FOutputDevice::Log(param_2,(ushort *)pwVar14);
  ExceptionList = local_10;
  return 1;
}


