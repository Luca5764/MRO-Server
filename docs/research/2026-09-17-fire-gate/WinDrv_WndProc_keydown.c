// ======== 0x11114bdf  ViewportWndProc  @ 11114190 ========
/* WARNING: Type propagation algorithm not settling */
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */
/* WARNING: Restarted to delay deadcode elimination for space: stack */
/* public: long __thiscall UWindowsViewport::ViewportWndProc(unsigned int,unsigned int,long) */

long __thiscall
UWindowsViewport::ViewportWndProc(UWindowsViewport *this,uint param_1,uint param_2,long param_3)

{
  bool bVar1;
  float fVar2;
  undefined3 uVar3;
  uchar uVar4;
  SHORT SVar5;
  UObject *pUVar6;
  int iVar7;
  ushort *puVar8;
  DWORD DVar9;
  LRESULT LVar10;
  uint uVar11;
  HWND pHVar12;
  UObject *pUVar13;
  int iVar14;
  FString *pFVar15;
  HIMC pHVar16;
  FOutputDevice *this_00;
  FOutputDevice *this_01;
  int iVar17;
  int iVar18;
  short sVar19;
  long lVar20;
  FCameraSceneNode local_434 [88];
  WCHAR local_3dc [262];
  FCanvasUtil local_1d0 [84];
  float local_17c;
  float local_178;
  float local_174;
  float local_170;
  float local_16c;
  float local_168;
  float local_164;
  float local_160;
  float local_15c;
  float local_158;
  float local_154;
  float local_150;
  float local_14c;
  float local_148;
  float local_144;
  float local_140;
  tagMSG tStack_124;
  FString aFStack_108 [12];
  FString aFStack_fc [12];
  FString aFStack_f0 [12];
  float local_e4;
  float local_e0;
  undefined4 local_dc;
  undefined4 local_d8;
  int iStack_d4;
  tagPOINT local_c0;
  undefined4 uStack_b8;
  undefined4 uStack_b4;
  tagRECT atStack_b0 [5];
  int iStack_58;
  float local_48;
  float local_44;
  tagPOINT local_40;
  float *local_38;
  undefined4 local_34;
  UObject *local_30;
  float local_2c;
  float local_28;
  float fStack_24;
  undefined4 uStack_20;
  tagPOINT tStack_1c;
  undefined1 *local_14;
  void *local_10;
  undefined1 *puStack_c;
  undefined4 local_8;
  
                    /* 0x14190  149  ?ViewportWndProc@UWindowsViewport@@QAEJIIJ@Z */
  uVar11 = param_1;
  puStack_c = &LAB_11127d59;
  local_10 = ExceptionList;
  local_14 = &stack0xfffffbc0;
  local_8._0_1_ = 0;
  local_8._1_3_ = 0;
  ExceptionList = &local_10;
  pUVar6 = UObject::GetOuter((UObject *)this);
  lVar20 = param_3;
  local_30 = pUVar6;
  if (*(int *)(this + 0x1b4) != 0) {
LAB_11116375:
    if (*(int *)GUnicodeOS_exref != 0) {
LAB_1111516a:
      pHVar12 = *(HWND *)(*(int *)(this + 0x1a4) + 4);
LAB_11115174:
      LVar10 = DefWindowProcW(pHVar12,param_1,param_2,param_3);
      ExceptionList = local_10;
      return LVar10;
    }
    pHVar12 = *(HWND *)(*(int *)(this + 0x1a4) + 4);
LAB_111151a0:
    LVar10 = DefWindowProcA(pHVar12,param_1,param_2,param_3);
    ExceptionList = local_10;
    return LVar10;
  }
  iVar7 = 0;
LAB_111141e0:
  if (iVar7 < *(int *)(pUVar6 + 0x34)) {
    if (*(UWindowsViewport **)(*(FOutputDevice **)(pUVar6 + 0x30) + iVar7 * 4) != this)
    goto code_r0x111141f1;
    if ((iVar7 != -1) && (*(int *)(this + 0x34) != 0)) {
      if (param_1 != *(uint *)WindowMessageMouseWheel_exref) {
        if (param_1 < 0x15) {
          if (param_1 == 0x14) {
            ExceptionList = local_10;
            return 0;
          }
          switch(param_1) {
          case 1:
            local_8 = CONCAT31(local_8._1_3_,1);
            *(undefined4 *)(this + 0x1a8) = 1;
            pUVar6 = UObject::GetOuter((UObject *)this);
            (**(code **)(*(int *)pUVar6 + 0x94))();
            ImmAssociateContext(*(HWND *)(*(int *)(this + 0x1a4) + 4),(HIMC)0x0);
            if (*(int *)GIsEditor_exref == 0) {
              SetFocus(*(HWND *)(*(int *)(this + 0x1a4) + 4));
            }
            ExceptionList = local_10;
            return 0;
          case 2:
            DAT_11165a74 = (UWindowsViewport *)0x0;
            local_8 = 3;
            if ((*(int *)GIsEditor_exref == 0) &&
               (*(UBaseGUIController **)(this + 0x70) != (UBaseGUIController *)0x0)) {
              UBaseGUIController::eventCloseAll(*(UBaseGUIController **)(this + 0x70),1,1);
            }
            if (((byte)this[0x1bc] & 1) != 0) {
              EndFullscreen(this);
            }
            param_3 = 0;
            puVar8 = appCmdLine();
            Parse(puVar8,(ushort *)L"HWND=",(ulong *)&param_3);
            if (param_3 != 0) {
              SetParent(*(HWND *)(*(int *)(this + 0x1a4) + 4),(HWND)0x0);
              SetFocus((HWND)param_3);
            }
            (**(code **)(*(int *)this + 0x80))();
            if (*(int *)(this + 0x1a8) == 1) {
              *(undefined4 *)(this + 0x1a8) = 2;
              (**(code **)(*(int *)this + 0xc))();
            }
            FOutputDevice::Logf(*(FOutputDevice **)GLog_exref,(EName)*(FOutputDevice **)GLog_exref,
                                (ushort *)0x2f8);
            if (DAT_11165a70 != (HMODULE)0x0) {
              FreeLibrary(DAT_11165a70);
            }
            ExceptionList = local_10;
            return 0;
          default:
switchD_1111424e_caseD_3:
            goto switchD_111153c6_caseD_206;
          case 5:
            uVar11 = param_3 & 0xffff;
            param_3 = (uint)param_3 >> 0x10;
            local_8 = 0x23;
            if (param_2 == 2) {
              (**(code **)(*(int *)this + 0xac))();
            }
            if (param_2 == 1) {
              (**(code **)(*(int *)this + 0xac))();
            }
            if ((*(uint *)(this + 0x1bc) & 1) != 0) {
              if (param_2 == 0) {
                *(int *)(this + 0x1b4) = *(int *)(this + 0x1b4) + 1;
                WWindow::MoveWindow(*(WWindow **)(this + 0x1a4),*(undefined4 *)(this + 0x1e8));
                *(int *)(this + 0x1b4) = *(int *)(this + 0x1b4) + -1;
              }
              if (*(int **)(this + 0x70) != (int *)0x0) {
                (**(code **)(**(int **)(this + 0x70) + 0x98))();
              }
              ExceptionList = local_10;
              return 0;
            }
            if ((*(int **)(this + 0x7c) == (int *)0x0) || ((*(uint *)(this + 0x1bc) & 0x90) == 0)) {
              (**(code **)(*(int *)this + 0x88))();
            }
            else {
              (**(code **)(**(int **)(this + 0x7c) + 0xa4))(this,uVar11);
            }
            if (*(int *)GIsEditor_exref != 0) {
              *(undefined4 *)(this + 0x90) = 0xffffffff;
            }
            if (((*(int **)(this + 0x70) != (int *)0x0) && (param_2 != 1)) && (param_2 != 0)) {
              (**(code **)(**(int **)(this + 0x70) + 0x98))(uVar11,param_3);
            }
            ExceptionList = local_10;
            return 0;
          case 6:
            goto switchD_1111424e_caseD_6;
          case 7:
            local_8._0_1_ = 0x27;
            local_8._1_3_ = 0;
            appBaseDir();
            (**(code **)(**(int **)GFileManager_exref + 0x34))();
            if (((*(int *)GIsEditor_exref == 0) &&
                (*(uint *)(this + 0x1c4) == (*(uint *)(this + 0x40) >> 1 & 1))) &&
               (*(int *)(this + 0xb4) == 0)) {
              (**(code **)(*(int *)this + 0xac))();
            }
            if (*(int **)(this + 0x70) != (int *)0x0) {
              (**(code **)(**(int **)(this + 0x70) + 0x9c))();
            }
            if (*(int **)(this + 0x78) != (int *)0x0) {
              (**(code **)(**(int **)(this + 0x78) + 0x88))();
            }
            if (Mouse != (IDirectInputDevice8W *)0x0) {
              (**(code **)(*(int *)Mouse + 0x1c))();
            }
            if (Joystick != (IDirectInputDevice8W *)0x0) {
              (**(code **)(*(int *)Joystick + 0x1c))();
            }
            pUVar6 = UObject::GetOuter((UObject *)this);
            (**(code **)(*(int *)pUVar6 + 0x94))();
            (**(code **)(*(int *)this + 0x8c))();
            ImmAssociateContext(*(HWND *)(*(int *)(this + 0x1a4) + 4),(HIMC)0x0);
            if (*(int **)(this + 0x7c) != (int *)0x0) {
              (**(code **)(**(int **)(this + 0x7c) + 0xb8))();
            }
            if (*(int *)GIsEditor_exref != 0) {
              ExceptionList = local_10;
              return 0;
            }
            if (DAT_11165a70 != (HMODULE)0x0) {
              DAT_11165a74 = this;
              ExceptionList = local_10;
              return 0;
            }
            DAT_11165a74 = this;
            DAT_11165a70 = LoadLibraryW(L"InputProcess.dll");
            if (DAT_11165a70 != (HMODULE)0x0) {
              DAT_11165a78 = GetProcAddress(DAT_11165a70,"CreateTSFInputProcess");
              DAT_11165a7c = GetProcAddress(DAT_11165a70,"RegisterInputFunction");
              DAT_11165a80 = GetProcAddress(DAT_11165a70,"InputWndProc");
              DAT_11165a84 = GetProcAddress(DAT_11165a70,"GetLangCodePage_BD");
              if (DAT_11165a78 != (FARPROC)0x0) {
                _DAT_11165a6c = (*DAT_11165a78)();
              }
              if (DAT_11165a7c != (FARPROC)0x0) {
                (*DAT_11165a7c)(&LAB_11112910,&LAB_1110fbe0,&LAB_11112920,&LAB_11112930,
                                &LAB_11112950,&LAB_11112970);
              }
              if (DAT_11165a84 == (FARPROC)0x0) {
                ExceptionList = local_10;
                return 0;
              }
              iVar7 = (*DAT_11165a84)();
              *(int *)(this + 0x318) = iVar7;
              *(int *)GLangCodePage_BD_exref = iVar7;
              ExceptionList = local_10;
              return 0;
            }
            GetLastError();
            FOutputDevice::Logf(this_00,*(ushort **)GWarn_exref);
            FOutputDevice::Log(*(FOutputDevice **)GWarn_exref,(ushort *)L"InputProcess.dll");
            FOutputDevice::Logf(this_01,*(ushort **)GWarn_exref);
            ExceptionList = local_10;
            return 0;
          case 8:
            local_8 = 0x25;
            appBaseDir();
            (**(code **)(**(int **)GFileManager_exref + 0x34))();
            if (((*(int *)GIsOpenGL_exref != 0) || (*(int *)GIsPixomatic_exref != 0)) &&
               (iVar7 = (**(code **)(*(int *)this + 0x84))(), iVar7 != 0)) {
              EndFullscreen(this);
            }
            if (param_2 == 0) {
              param_2 = (uint)GetForegroundWindow();
            }
            GetWindowThreadProcessId((HWND)param_2,(LPDWORD)&param_3);
            DVar9 = GetCurrentProcessId();
            if ((param_3 != DVar9) && (*(int **)(this + 0x7c) != (int *)0x0)) {
              (**(code **)(**(int **)(this + 0x7c) + 0xbc))();
            }
            (**(code **)(*(int *)this + 0xac))();
            (**(code **)(*(int *)this + 0x80))(0);
            if (*(int *)GIsEditor_exref == 0) {
              if (*(int **)(this + 0x70) != (int *)0x0) {
                (**(code **)(**(int **)(this + 0x70) + 0x9c))();
              }
              if (*(int **)(this + 0x78) != (int *)0x0) {
                (**(code **)(**(int **)(this + 0x78) + 0x88))();
              }
              if ((*(int *)GZNetworkManager_exref != 0) &&
                 (iVar7 = (**(code **)(*(int *)this + 0x84))(), iVar7 != 0)) {
                (**(code **)(**(int **)GZNetworkManager_exref + 0x38))();
              }
            }
            ExceptionList = local_10;
            return 0;
          case 0xf:
            *(undefined4 *)(this + 0x90) = 1;
            ValidateRect(*(HWND *)(*(int *)(this + 0x1a4) + 4),(RECT *)0x0);
            ExceptionList = local_10;
            return 0;
          }
        }
        if (0x112 < param_1) {
          if (param_1 < 0x282) {
            if (param_1 != 0x281) goto LAB_111153b0;
          }
          else {
            if (param_1 != 0x282) {
              if (param_1 == 0x4be) {
                uStack_b8 = 0;
                uStack_b4 = 0;
                atStack_b0[0].left = 0;
                atStack_b0[0].top = 0;
                atStack_b0[0].right = 0;
                atStack_b0[0].bottom = 0;
                local_8._0_1_ = 0x30;
                local_8._1_3_ = 0;
                while (iVar7 = FUN_1110fea0(&uStack_b8,*(int **)(SpeechRecognition + 4)), iVar7 == 0
                      ) {
                  if ((short)uStack_b8 == 0x26) {
                    FString::FString((FString *)&local_28,(ushort *)&DAT_11129d64);
                    local_8._0_1_ = 0x31;
                    FString::FString((FString *)&local_44,(ushort *)&DAT_11129d64);
                    local_8 = CONCAT31(local_8._1_3_,0x32);
                    iVar7 = (**(code **)(*(int *)atStack_b0[0].bottom + 0xc))();
                    if (-1 < iVar7) {
                      iVar7 = *(int *)(param_2 + 0x4c);
                      bVar1 = true;
                      while (iVar7 != 0) {
                        if (bVar1) {
                          pFVar15 = (FString *)FString::Printf((ushort *)aFStack_fc);
                          local_8._0_1_ = 0x33;
                          FString::operator+=((FString *)&local_28,pFVar15);
                          local_8 = CONCAT31(local_8._1_3_,0x32);
                          FString::~FString(aFStack_fc);
                          iVar7 = *(int *)(iVar7 + 0x28);
                          bVar1 = false;
                        }
                        else {
                          pFVar15 = (FString *)FString::Printf((ushort *)aFStack_f0);
                          local_8._0_1_ = 0x34;
                          FString::operator+=((FString *)&local_28,pFVar15);
                          local_8 = CONCAT31(local_8._1_3_,0x32);
                          FString::~FString(aFStack_f0);
                          iVar7 = *(int *)(iVar7 + 0x28);
                          bVar1 = false;
                        }
                      }
                    }
                    param_3 = 0;
                    iVar7 = (**(code **)(*(int *)atStack_b0[0].bottom + 0x14))
                                      (atStack_b0[0].bottom,0xffffffff,0xffffffff,1);
                    if (-1 < iVar7) {
                      pFVar15 = (FString *)FString::Printf((ushort *)aFStack_108);
                      local_8._0_1_ = 0x35;
                      FString::operator=((FString *)&local_44,pFVar15);
                      local_8 = CONCAT31(local_8._1_3_,0x32);
                      FString::~FString(aFStack_108);
                      CoTaskMemFree((LPVOID)param_3);
                    }
                    if (*(APlayerController **)(this + 0x34) != (APlayerController *)0x0) {
                      APlayerController::eventVoiceCommand
                                (*(APlayerController **)(this + 0x34),(FString *)&local_28,
                                 (FString *)&local_44);
                    }
                    local_8._0_1_ = 0x31;
                    FString::~FString((FString *)&local_44);
                    local_8._0_1_ = 0x30;
                    FString::~FString((FString *)&local_28);
                  }
                }
                local_8 = CONCAT31(local_8._1_3_,0x2f);
                FUN_1110fe50(&uStack_b8);
                ExceptionList = local_10;
                return 0;
              }
              goto switchD_1111424e_caseD_3;
            }
            if (((param_2 == 6) && (*(int *)(this + 0x318) != 0x3a8)) &&
               (*(int *)(this + 0x318) != 0x3b6)) {
LAB_111162dc:
              pHVar16 = ImmGetContext(*(HWND *)(*(int *)(this + 0x1a4) + 4));
              if (pHVar16 != (HIMC)0x0) {
                ImmSetConversionStatus(pHVar16,0,0);
                ImmReleaseContext(*(HWND *)(*(int *)(this + 0x1a4) + 4),pHVar16);
              }
              ExceptionList = local_10;
              return 0;
            }
          }
switchD_11114993_caseD_10d:
          if (DAT_11165a80 != (FARPROC)0x0) {
            iVar7 = (*DAT_11165a80)();
            ExceptionList = local_10;
            return iVar7;
          }
LAB_1111634f:
          FOutputDevice::Logf(*(FOutputDevice **)GWarn_exref,
                              (ushort *)*(FOutputDevice **)GWarn_exref);
          ExceptionList = local_10;
          return 0;
        }
        if (param_1 == 0x112) {
          uVar11 = param_2 & 0xfff0;
          local_8._1_3_ = 0;
          uVar3 = local_8._1_3_;
          local_8._0_1_ = 0x29;
          local_8._1_3_ = 0;
          if (uVar11 == 0xf140) {
            ExceptionList = local_10;
            return 0;
          }
          if (uVar11 == 0xf170) {
            ExceptionList = local_10;
            return 0;
          }
          if (uVar11 == 0xf030) {
            ToggleFullscreen(this);
            ExceptionList = local_10;
            return 0;
          }
          if (((byte)this[0x1bc] & 1) != 0) {
            if (uVar11 == 0xf040) {
              ExceptionList = local_10;
              return 0;
            }
            if (uVar11 == 0xf050) {
              ExceptionList = local_10;
              return 0;
            }
            if (uVar11 == 0xf130) {
              ExceptionList = local_10;
              return 0;
            }
            if (uVar11 == 0xf150) {
              ExceptionList = local_10;
              return 0;
            }
          }
          iVar7 = *(int *)GUnicodeOS_exref;
          pHVar12 = *(HWND *)(*(int *)(this + 0x1a4) + 4);
          param_1 = 0x112;
          local_8._1_3_ = uVar3;
          goto joined_r0x11115390;
        }
        switch(param_1) {
        case 0x1f:
          local_8 = 0x1d;
          (**(code **)(*(int *)this + 0x80))();
          ExceptionList = local_10;
          return 0;
        case 0x20:
          local_8._0_1_ = 0xf;
          if (((short)param_3 == 1) || (*(int *)GIsSlowTask_exref != 0)) goto LAB_11114c59;
          iVar7 = *(int *)GUnicodeOS_exref;
          pHVar12 = *(HWND *)(*(int *)(this + 0x1a4) + 4);
          goto joined_r0x11115390;
        case 0x21:
          local_8 = 0;
          if ((((*(int *)GIsEditor_exref == 0) && (*(int *)(this + 0x1c4) == 0)) &&
              (((byte)this[0x40] & 2) == 0)) &&
             ((*(int *)(this + 0x70) == 0 || ((*(byte *)(*(int *)(this + 0x70) + 0x2c) & 1) == 0))))
          {
            GetCursorPos(&local_40);
            pHVar12 = (HWND)(**(code **)(*(int *)this + 0xa0))();
            ScreenToClient(pHVar12,&local_40);
            if (local_40.y < 0) {
              *(undefined4 *)(this + 0xb4) = 1;
            }
          }
          ExceptionList = local_10;
          return 1;
        default:
          goto switchD_1111424e_caseD_3;
        case 0x48:
          local_8._0_1_ = 0x2b;
          local_8._1_3_ = 0;
          if (param_2 == 0) {
            ExceptionList = local_10;
            return 0;
          }
          if (param_2 == 1) {
            FOutputDevice::Logf(*(FOutputDevice **)(pUVar6 + 0x30),*(EName *)GLog_exref,
                                (ushort *)0x2f8);
            ExceptionList = local_10;
            return -1;
          }
          FOutputDevice::Logf((FOutputDevice *)GLog_exref,*(EName *)GLog_exref,(ushort *)0x2f8);
          goto LAB_11115157;
        case 0x4a:
          local_8._0_1_ = 0;
          local_8._1_3_ = 0;
          if (*(int **)(this + 0x7c) == (int *)0x0) {
            ExceptionList = local_10;
            return 0;
          }
          (**(code **)(**(int **)(this + 0x7c) + 0x10c))();
          ExceptionList = local_10;
          return 0;
        case 0x51:
          local_8._0_1_ = 0;
          local_8._1_3_ = 0;
          if (DAT_11165a80 != (FARPROC)0x0) {
            (*DAT_11165a80)();
            if (DAT_11165a84 != (FARPROC)0x0) {
              iVar7 = (*DAT_11165a84)();
              *(int *)(this + 0x318) = iVar7;
              *(int *)GLangCodePage_BD_exref = iVar7;
              if ((*(int *)(this + 0x318) != 0x3a8) && (*(int *)(this + 0x318) != 0x3b6))
              goto LAB_111162dc;
            }
            ImmGetIMEFileNameW((HKL)lVar20,local_3dc,0x209);
            *(undefined4 *)(this + 0x308) = 0;
            puVar8 = appStrstr((ushort *)local_3dc,(ushort *)L"LIUNT.IME");
            *(uint *)(this + 0x308) = (uint)(puVar8 != (ushort *)0x0);
            ExceptionList = local_10;
            return 0;
          }
          goto LAB_1111634f;
        case 0x7e:
          local_8 = 0x2d;
          appBaseDir();
          (**(code **)(**(int **)GFileManager_exref + 0x34))();
          (**(code **)(*(int *)this + 0xac))();
          if (*(HWND *)(this + 0x31c) != (HWND)0x0) {
            SetForegroundWindow(*(HWND *)(this + 0x31c));
            SetActiveWindow(*(HWND *)(this + 0x31c));
            ExceptionList = local_10;
            return 0;
          }
          if (*(int *)(this + 0x328) != 0) {
            pHVar12 = (HWND)FUN_11125ba0(*(int *)(this + 0x328));
            SetForegroundWindow(pHVar12);
            pHVar12 = (HWND)FUN_11125ba0(*(int *)(this + 0x328));
            SetActiveWindow(pHVar12);
          }
          ExceptionList = local_10;
          return 0;
        case 0x100:
        case 0x104:
          local_8._0_1_ = 7;
          local_8._1_3_ = 0;
          param_1 = param_2;
          if (param_2 == 0xd) {
            SVar5 = GetKeyState(0x11);
            if (-1 < SVar5) {
LAB_11114a24:
              lVar20 = param_3;
              iVar7 = CauseInputEvent(this,param_2,1,0.0,param_3);
              if (((iVar7 != 0) && (*(int *)GIsEditor_exref != 0)) &&
                 (iVar7 = UViewport::IsRealtime((UViewport *)this), iVar7 == 0)) {
                (**(code **)(*(int *)this + 0xb0))();
              }
              goto LAB_11114a63;
            }
            lVar20 = param_3;
            if (*(int *)(*(int *)(this + 0x34) + 0x3c0) != 0) {
              (*(code *)**(undefined4 **)(this + 0x30))();
              lVar20 = param_3;
            }
          }
          else {
            if ((-1 < (int)param_2) && ((int)param_2 < 0xff)) goto LAB_11114a24;
LAB_11114a63:
            if ((param_2 == 0xe5) && (lVar20 != 0)) {
              param_1 = MapVirtualKeyW(lVar20 >> 0x10,3);
            }
          }
          if (*(int *)GIsEditor_exref == 0) {
            switch(param_1) {
            case 0x30:
            case 0x60:
              break;
            case 0x31:
            case 0x61:
              break;
            case 0x32:
            case 0x62:
              break;
            case 0x33:
            case 99:
              break;
            case 0x34:
            case 100:
              break;
            case 0x35:
            case 0x65:
              break;
            case 0x36:
            case 0x66:
              break;
            case 0x37:
            case 0x67:
              break;
            case 0x38:
            case 0x68:
              break;
            case 0x39:
            case 0x69:
              break;
            default:
              goto switchD_11114a12_caseD_3a;
            }
            (*(code *)**(undefined4 **)(this + 0x30))();
          }
switchD_11114a12_caseD_3a:
          pHVar12 = *(HWND *)(this + 0x1ac);
          if (pHVar12 == (HWND)0x0) goto LAB_11114c59;
          if (*(int *)GIsEditor_exref == 0) {
            ExceptionList = local_10;
            return 0;
          }
          if (param_1 == 0x70) {
            param_2 = 0x71;
            if (*(int *)GUnicodeOS_exref != 0) {
              PostMessageW(pHVar12,uVar11,0x71,lVar20);
              goto LAB_11114c59;
            }
          }
          else {
            if (((param_1 == 9) || (param_1 == 0xd)) || (param_1 == 0x12)) goto LAB_11114c59;
            if (*(int *)GUnicodeOS_exref != 0) {
              PostMessageW(pHVar12,uVar11,param_2,lVar20);
              goto LAB_11114c59;
            }
          }
          break;
        case 0x101:
        case 0x105:
          local_8._0_1_ = 9;
          local_8._1_3_ = 0;
          if (param_2 == 0x2c) {
            (*(code *)**(undefined4 **)(this + 0x30))();
          }
          if ((((int)param_2 < 0) || (0xfe < (int)param_2)) ||
             (iVar7 = CauseInputEvent(this,param_2,3,0.0,0), iVar7 == 0)) {
LAB_11114d0e:
            if (*(int *)GIsEditor_exref == 0) goto LAB_11114d18;
          }
          else {
            if (*(int *)GIsEditor_exref != 0) {
              iVar7 = UViewport::IsRealtime((UViewport *)this);
              if (iVar7 == 0) {
                (**(code **)(*(int *)this + 0xb0))();
              }
              goto LAB_11114d0e;
            }
LAB_11114d18:
            if (*(uint *)(this + 0x1c4) == (*(uint *)(this + 0x40) >> 1 & 1)) {
              (**(code **)(*(int *)this + 0xac))();
            }
          }
          pHVar12 = *(HWND *)(this + 0x1ac);
          if (pHVar12 == (HWND)0x0) goto LAB_11114c59;
          if (*(int *)GIsEditor_exref == 0) {
            ExceptionList = local_10;
            return 0;
          }
          lVar20 = param_3;
          if (param_2 == 0x70) {
            param_2 = 0x71;
            if (*(int *)GUnicodeOS_exref != 0) {
              PostMessageW(pHVar12,param_1,0x71,param_3);
              goto LAB_11114c59;
            }
          }
          else {
            if (((param_2 == 9) || (param_2 == 0xd)) || (param_2 == 0x12)) goto LAB_11114c59;
            if (*(int *)GUnicodeOS_exref != 0) {
              PostMessageW(pHVar12,param_1,param_2,param_3);
              goto LAB_11114c59;
            }
          }
          break;
        case 0x102:
          local_8._0_1_ = 0xd;
          local_8._1_3_ = 0;
          if (param_2 == 0xd) {
            if (*(int *)(this + 0x308) != 1) {
              ExceptionList = local_10;
              return 0;
            }
            if (*(int *)(this + 0x304) < 1) {
              ExceptionList = local_10;
              return 0;
            }
            InitImeInfo_BD(this);
            pHVar16 = ImmGetContext(*(HWND *)(*(int *)(this + 0x1a4) + 4));
            if (pHVar16 == (HIMC)0x0) {
              ExceptionList = local_10;
              return 0;
            }
            ImmNotifyIME(pHVar16,0x15,4,0);
            ImmReleaseContext(*(HWND *)(*(int *)(this + 0x1a4) + 4),pHVar16);
            ExceptionList = local_10;
            return 0;
          }
          iVar7 = (**(code **)(**(int **)(pUVar6 + 0x2c) + 0x88))();
          if (iVar7 == 0) {
            ExceptionList = local_10;
            return 0;
          }
          if (*(int *)GIsEditor_exref == 0) {
            ExceptionList = local_10;
            return 0;
          }
          iVar7 = UViewport::IsRealtime((UViewport *)this);
          if (iVar7 != 0) {
            ExceptionList = local_10;
            return 0;
          }
          (**(code **)(*(int *)this + 0xb0))();
          (**(code **)(*(int *)this + 0x8c))();
          ExceptionList = local_10;
          return 0;
        case 0x106:
          if (param_1 != 0x106) {
            ExceptionList = local_10;
            return 0;
          }
          if (*(int *)GUnicodeOS_exref == 0) {
            param_1 = 0x106;
            goto LAB_11115196;
          }
          goto LAB_1111516a;
        case 0x10d:
        case 0x10e:
        case 0x10f:
          goto switchD_11114993_caseD_10d;
        }
        PostMessageA(pHVar12,uVar11,param_2,lVar20);
LAB_11114c59:
        if (*(int *)GIsEditor_exref == 0) {
          ExceptionList = local_10;
          return 0;
        }
        (**(code **)(*(int *)this + 0x8c))();
        ExceptionList = local_10;
        return 0;
      }
      param_2 = param_2 << 0x10;
      param_1 = 0x20a;
LAB_111153b0:
      switch(param_1) {
      case 0x200:
        local_8._1_3_ = 0;
        local_8._0_1_ = 0x21;
        if (*(int *)GIsEditor_exref == 0) {
          (**(code **)(*(int *)this + 0xa8))();
          ExceptionList = local_10;
          return 0;
        }
        if (*(int *)(pUVar6 + 0xd0) == 0) {
          GetClientRect(*(HWND *)(*(int *)(this + 0x1a4) + 4),atStack_b0);
          if (*(int *)GIsEditor_exref != 0) {
            GetCursorPos(&tStack_1c);
            fStack_24 = (float)tStack_1c.y;
            local_28 = (float)tStack_1c.x;
            uStack_20 = 0;
            *(float *)(this + 0xec) = local_28;
            *(float *)(this + 0xf0) = fStack_24;
            *(undefined4 *)(this + 0xf4) = 0;
            pHVar12 = (HWND)(**(code **)(*(int *)this + 0xa0))();
            ScreenToClient(pHVar12,&tStack_1c);
            fStack_24 = (float)tStack_1c.y;
            local_28 = (float)tStack_1c.x;
            uStack_20 = 0;
            *(float *)(this + 0xf8) = local_28;
            *(float *)(this + 0xfc) = fStack_24;
            *(undefined4 *)(this + 0x100) = 0;
          }
          if ((((byte)this[0x1bc] & 1) != 0) || (*(int *)(this + 0x1e0) != -1)) {
            pUVar13 = UObject::GetOuter((UObject *)this);
            iVar7 = (**(code **)(**(int **)(pUVar13 + 0x2c) + 0xdc))();
            if (iVar7 != 1) {
              iVar17 = (atStack_b0[0].left + atStack_b0[0].right) / 2;
              iVar7 = (atStack_b0[0].top + atStack_b0[0].bottom) / 2;
              local_38 = (float *)0x0;
              iStack_58 = 0;
              param_1 = 0;
              local_2c = 0.0;
              local_40.x = iVar17;
              local_40.y = iVar7;
              while( true ) {
                local_34 = (float)param_3;
                iVar17 = (short)param_3 - iVar17;
                iVar7 = param_3._2_2_ - iVar7;
                iVar18 = iVar17;
                if (iVar17 < 0) {
                  iVar18 = -iVar17;
                }
                iVar14 = iVar7;
                if (iVar7 < 0) {
                  iVar14 = -iVar7;
                }
                iStack_58 = iStack_58 + iVar14 + iVar18;
                param_1 = param_1 + iVar17;
                local_2c = (float)((int)local_2c + iVar7);
                param_3 = (long)((param_2 & 1) != 0);
                if ((param_2 & 2) != 0) {
                  param_3 = param_3 | 2;
                }
                if ((param_2 & 0x10) != 0) {
                  param_3 = param_3 | 4;
                }
                iStack_d4 = iVar7;
                tStack_1c.y = iVar17;
                uVar4 = UInput::KeyDown(*(UInput **)(this + 0x78),0x10);
                if (uVar4 != '\0') {
                  param_3 = param_3 | 0x100;
                }
                uVar4 = UInput::KeyDown(*(UInput **)(this + 0x78),0x11);
                if (uVar4 != '\0') {
                  param_3 = param_3 | 0x80;
                }
                uVar4 = UInput::KeyDown(*(UInput **)(this + 0x78),0x12);
                if (uVar4 != '\0') {
                  param_3 = param_3 | 0x200;
                }
                if ((iVar17 != 0) || (iVar7 != 0)) {
                  local_38 = (float *)0x1;
                  (**(code **)(**(int **)(local_30 + 0x2c) + 0xa8))();
                }
                if (*(int *)GUnicodeOS_exref == 0) {
                  iVar7 = PeekMessageA(&tStack_124,*(HWND *)(*(int *)(this + 0x1a4) + 4),0x200,0x200
                                       ,1);
                }
                else {
                  iVar7 = PeekMessageW(&tStack_124,*(HWND *)(*(int *)(this + 0x1a4) + 4),0x200,0x200
                                       ,1);
                }
                if (iVar7 == 0) break;
                param_3 = tStack_124.lParam;
                param_2 = tStack_124.wParam;
                iVar17 = (int)(short)local_34;
                iVar7 = (int)local_34._2_2_;
              }
              if (4 < iStack_58) {
                if ((param_2 & 1) != 0) {
                  DAT_11166018 = 1;
                }
                if ((param_2 & 2) != 0) {
                  DAT_11166010 = 1;
                }
                if ((param_2 & 0x10) != 0) {
                  DAT_11166008 = 1;
                }
              }
              if (param_1 != 0) {
                CauseInputEvent(this,0xe4,4,(float)(int)param_1,0);
              }
              fVar2 = local_2c;
              if (local_2c != 0.0) {
                param_3 = -(int)local_2c;
                CauseInputEvent(this,0xe5,4,(float)param_3,0);
              }
              if ((param_1 != 0) || (fVar2 != 0.0)) {
                pUVar6 = UObject::GetOuter((UObject *)this);
                iVar7 = (**(code **)(**(int **)(pUVar6 + 0x2c) + 0xdc))();
                if (iVar7 == 0) {
                  ClientToScreen(*(HWND *)(*(int *)(this + 0x1a4) + 4),&local_40);
                  SetCursorPos(local_40.x,local_40.y);
                }
              }
              if ((local_38 != (float *)0x0) &&
                 (iVar7 = UViewport::IsRealtime((UViewport *)this), iVar7 == 0)) {
                uVar4 = UInput::KeyDown(*(UInput **)(this + 0x78),0x20);
                pUVar6 = local_30;
                if (uVar4 == '\0') {
                  (**(code **)(*(int *)this + 0xb0))();
                }
                else {
                  for (iVar7 = 0; iVar7 < *(int *)(pUVar6 + 0x34); iVar7 = iVar7 + 1) {
                    (**(code **)(**(int **)(*(int *)(pUVar6 + 0x30) + iVar7 * 4) + 0xb0))();
                  }
                }
              }
              while( true ) {
                if (*(int *)GUnicodeOS_exref == 0) {
                  iVar7 = PeekMessageA(&tStack_124,(HWND)0x0,0x100,0x108,1);
                }
                else {
                  iVar7 = PeekMessageW(&tStack_124,(HWND)0x0,0x100,0x108,1);
                }
                if (iVar7 == 0) break;
                TranslateMessage(&tStack_124);
                if (*(int *)GUnicodeOS_exref == 0) {
                  DispatchMessageA(&tStack_124);
                }
                else {
                  DispatchMessageW(&tStack_124);
                }
              }
              ExceptionList = local_10;
              return 0;
            }
          }
          uVar11 = (uint)((param_2 & 1) != 0);
          if ((param_2 & 2) != 0) {
            uVar11 = uVar11 | 2;
          }
          if ((param_2 & 0x10) != 0) {
            uVar11 = uVar11 | 4;
          }
          uVar4 = UInput::KeyDown(*(UInput **)(this + 0x78),0x10);
          if (uVar4 != '\0') {
            uVar11 = uVar11 | 0x100;
          }
          uVar4 = UInput::KeyDown(*(UInput **)(this + 0x78),0x11);
          if (uVar4 != '\0') {
            uVar11 = uVar11 | 0x80;
          }
          uVar4 = UInput::KeyDown(*(UInput **)(this + 0x78),0x12);
          if (uVar4 != '\0') {
            uVar11 = uVar11 | 0x200;
          }
          param_3 = (short)param_3 - atStack_b0[0].left;
          (**(code **)(**(int **)(pUVar6 + 0x2c) + 0xac))();
          pUVar13 = UObject::GetOuter((UObject *)this);
          iVar7 = (**(code **)(**(int **)(pUVar13 + 0x2c) + 0xdc))(this);
          if (iVar7 == 1) {
            (**(code **)(**(int **)(pUVar6 + 0x2c) + 0xa8))(this,uVar11,0,0);
          }
          if ((((byte)this[0x40] & 2) != 0) && ((byte)this[0x5c] < 7)) {
            SetCursor(*(HCURSOR *)(this + (uint)(byte)this[0x5c] * 4 + 0x1fc));
            ExceptionList = local_10;
            return 0;
          }
        }
        break;
      case 0x201:
      case 0x204:
      case 0x207:
        local_8._0_1_ = 0x11;
        if ((*(int *)GIsEditor_exref != 0) && (*(int *)(pUVar6 + 0xd0) == 0)) {
          iVar7 = *(int *)(this + 0x34);
          FCameraSceneNode::FCameraSceneNode
                    (local_434,this,(FRenderTarget *)(this + 0xdc),iVar7,
                     *(undefined4 *)(iVar7 + 0x150),*(undefined4 *)(iVar7 + 0x154),
                     *(undefined4 *)(iVar7 + 0x158));
          local_8._0_1_ = 0x12;
          FCanvasUtil::FCanvasUtil(local_1d0,(FRenderTarget *)(this + 0xdc),(FRenderInterface *)0x0)
          ;
          uVar11 = (uint)param_3 >> 0x10;
          local_e4 = (float)(param_3 & 0xffff);
          local_38 = &local_e4;
          param_3 = (long)&local_17c;
          local_e0 = (float)uVar11;
          local_8._0_1_ = 0x13;
          local_dc = 0;
          local_d8 = 0x3f800000;
          local_48 = local_14c * 1.0 + local_15c * 0.0 + local_e0 * local_16c + local_e4 * local_17c
          ;
          local_40.x = (LONG)(local_144 * 1.0 +
                             local_154 * 0.0 + local_e0 * local_164 + local_e4 * local_174);
          local_44 = local_148 * 1.0 + local_158 * 0.0 + local_e0 * local_168 + local_e4 * local_178
          ;
          local_40.y = (LONG)(local_140 * 1.0 +
                             local_150 * 0.0 + local_e0 * local_160 + local_e4 * local_170);
          local_34 = local_e0;
          local_2c = local_e4;
          FSceneNode::Deproject((FSceneNode *)local_434,&local_28);
          pUVar6 = local_30;
          (**(code **)(**(int **)(local_30 + 0x2c) + 0xcc))();
          local_8._0_1_ = 0x12;
          FCanvasUtil::~FCanvasUtil(local_1d0);
          local_8 = CONCAT31(local_8._1_3_,0x11);
          FCameraSceneNode::~FCameraSceneNode(local_434);
          pHVar12 = GetParent(*(HWND *)(this + 0x1ac));
          pHVar12 = GetParent(pHVar12);
          pHVar12 = GetParent(pHVar12);
          if (*(int *)GUnicodeOS_exref == 0) {
            SendMessageA(pHVar12,0x111,0x8010,0);
          }
          else {
            SendMessageW(pHVar12,0x111,0x8010,0);
          }
          GetViewportButtonFlags(this,param_2);
          (**(code **)(**(int **)(pUVar6 + 0x2c) + 0xb4))(this);
          if (param_1 == 0x201) {
            DAT_11166018 = 0;
            _DAT_11166014 = GetMessageTime();
            iVar7 = 1;
          }
          else if (param_1 == 0x204) {
            DAT_11166010 = 0;
            _DAT_1116600c = GetMessageTime();
            iVar7 = 2;
          }
          else {
            if (param_1 != 0x207) goto LAB_111156d5;
            DAT_11166008 = 0;
            _DAT_11166004 = GetMessageTime();
            iVar7 = 4;
          }
          CauseInputEvent(this,iVar7,1,0.0,0);
LAB_111156d5:
          (**(code **)(*(int *)this + 0x80))(1);
          ExceptionList = local_10;
          return 0;
        }
        iVar7 = *(int *)GUnicodeOS_exref;
        pHVar12 = *(HWND *)(*(int *)(this + 0x1a4) + 4);
        goto joined_r0x11115390;
      case 0x202:
      case 0x205:
      case 0x208:
        local_8._1_3_ = 0;
        local_8._0_1_ = 0x17;
        if (*(int *)GIsEditor_exref == 0) {
          if (*(int *)(this + 0xb4) != 0) {
            *(undefined4 *)(this + 0xb4) = 0;
          }
          if (*(uint *)(this + 0x1c4) == (*(uint *)(this + 0x40) >> 1 & 1)) {
            (**(code **)(*(int *)this + 0xac))();
          }
          if (*(int *)GIsEditor_exref != 0) goto LAB_11115799;
        }
        else {
LAB_11115799:
          if (*(int *)(pUVar6 + 0xd0) == 0) {
            local_c0.x = 0;
            local_c0.y = 0;
            ClientToScreen(*(HWND *)(*(int *)(this + 0x1a4) + 4),&local_c0);
            if (param_1 == 0x202) {
              GetMessageTime();
              iVar7 = 1;
            }
            else if (param_1 == 0x208) {
              GetMessageTime();
              iVar7 = 4;
            }
            else {
              GetMessageTime();
              iVar7 = 2;
            }
            CauseInputEvent(this,iVar7,3,0.0,0);
            uVar4 = UInput::KeyDown(*(UInput **)(this + 0x78),1);
            if (((uVar4 == '\0') &&
                (uVar4 = UInput::KeyDown(*(UInput **)(this + 0x78),4), uVar4 == '\0')) &&
               (uVar4 = UInput::KeyDown(*(UInput **)(this + 0x78),2), uVar4 == '\0')) {
              if (((byte)this[0x1bc] & 1) != 0) goto LAB_111158f7;
              (**(code **)(*(int *)this + 0x80))();
            }
            if (((((byte)this[0x1bc] & 1) == 0) && (*(int *)(this + 0x94) != 0)) &&
               ((*(int *)(this + 0x98) != 0 &&
                (((DAT_11166018 == 0 && (DAT_11166010 == 0)) && (DAT_11166008 == 0)))))) {
              (**(code **)(**(int **)(local_30 + 0x2c) + 0xb8))();
              iVar7 = UViewport::IsRealtime((UViewport *)this);
              if (iVar7 == 0) {
                (**(code **)(*(int *)this + 0xb0))(1);
              }
            }
LAB_111158f7:
            if (param_1 == 0x202) {
              DAT_11166018 = 0;
              ExceptionList = local_10;
              return 0;
            }
            if (param_1 == 0x205) {
              DAT_11166010 = 0;
              ExceptionList = local_10;
              return 0;
            }
            if (param_1 == 0x208) {
              DAT_11166008 = 0;
            }
            ExceptionList = local_10;
            return 0;
          }
        }
        iVar7 = *(int *)GUnicodeOS_exref;
        goto LAB_11115992;
      case 0x203:
        local_8 = 0;
        if ((((*(int *)GIsEditor_exref != 0) && (*(int *)(this + 0x94) != 0)) &&
            (*(int *)(this + 0x98) != 0)) && (((byte)this[0x1bc] & 1) == 0)) {
          param_3 = param_3 & 0xffff;
          (**(code **)(**(int **)(pUVar6 + 0x2c) + 0xb4))();
        }
        ExceptionList = local_10;
        return 0;
      default:
switchD_111153c6_caseD_206:
        iVar7 = *(int *)GUnicodeOS_exref;
LAB_11115992:
        pHVar12 = *(HWND *)(*(int *)(this + 0x1a4) + 4);
joined_r0x11115390:
        if (iVar7 != 0) goto LAB_11115174;
        goto LAB_111151a0;
      case 0x20a:
        local_8._1_3_ = 0;
        local_8._0_1_ = 0x1f;
        if (*(int *)GIsEditor_exref == 0) {
          ExceptionList = local_10;
          return 0;
        }
        sVar19 = (short)(param_2 >> 0x10);
        if (sVar19 == 0) {
          ExceptionList = local_10;
          return 0;
        }
        param_3 = (long)sVar19;
        CauseInputEvent(this,0xe7,4,(float)param_3,0);
        if ((int)param_2 < 0) {
          CauseInputEvent(this,0xed,1,0.0,0);
          iVar7 = 0xed;
LAB_11115b1c:
          CauseInputEvent(this,iVar7,3,0.0,0);
        }
        else if (sVar19 != 0) {
          CauseInputEvent(this,0xec,1,0.0,0);
          iVar7 = 0xec;
          goto LAB_11115b1c;
        }
        if (*(int *)GIsEditor_exref != 0) {
          GetViewportButtonFlags(this,param_2);
          (**(code **)(**(int **)(local_30 + 0x2c) + 0xb0))();
          ExceptionList = local_10;
          return 0;
        }
        break;
      case 0x211:
        *(undefined4 *)(pUVar6 + 0xd0) = 1;
        local_8 = 0x19;
        (**(code **)(*(int *)this + 0x80))();
        (**(code **)(*(int *)this + 0x90))();
        if (Mouse != (IDirectInputDevice8W *)0x0) {
          (**(code **)(*(int *)Mouse + 0x20))();
        }
        if (Joystick != (IDirectInputDevice8W *)0x0) {
          (**(code **)(*(int *)Joystick + 0x20))();
        }
        ExceptionList = local_10;
        return 0;
      case 0x212:
        *(undefined4 *)(pUVar6 + 0xd0) = 0;
        local_8._1_3_ = 0;
        local_8._0_1_ = 0x1b;
        if (Mouse != (IDirectInputDevice8W *)0x0) {
          (**(code **)(*(int *)Mouse + 0x1c))();
        }
        if (Joystick != (IDirectInputDevice8W *)0x0) {
          (**(code **)(*(int *)Joystick + 0x1c))();
          ExceptionList = local_10;
          return 0;
        }
      }
      ExceptionList = local_10;
      return 0;
    }
  }
  goto LAB_11116375;
code_r0x111141f1:
  iVar7 = iVar7 + 1;
  goto LAB_111141e0;
switchD_1111424e_caseD_6:
  local_8._0_1_ = 0x15;
  if (param_2 == 0) {
    (**(code **)(*(int *)this + 0x80))();
  }
LAB_11115157:
  if (*(int *)GUnicodeOS_exref != 0) goto LAB_1111516a;
LAB_11115196:
  pHVar12 = *(HWND *)(*(int *)(this + 0x1a4) + 4);
  goto LAB_111151a0;
}
