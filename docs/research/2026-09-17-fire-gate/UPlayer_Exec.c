// ======== 0x104d8120  Exec  @ 104d8120 ========
/* public: virtual int __thiscall UPlayer::Exec(unsigned short const *,class FOutputDevice &) */

int __thiscall UPlayer::Exec(UPlayer *this,ushort *param_1,FOutputDevice *param_2)

{
  int *piVar1;
  int iVar2;
  int iVar3;
  void *local_10;
  undefined1 *puStack_c;
  undefined4 local_8;
  
                    /* 0x1d8120  4606  ?Exec@UPlayer@@UAEHPBGAAVFOutputDevice@@@Z */
  puStack_c = &LAB_1065e670;
  local_10 = ExceptionList;
  local_8 = 0;
  if (*(int *)(this + 4) == 0) {
    return 0;
  }
  ExceptionList = &local_10;
  iVar2 = (**(code **)(**(int **)(*(int *)(this + 4) + 0xa0) + 0x94))(param_1,param_2);
  if (((((iVar2 == 0) &&
        ((((*(int *)(*(int *)(this + 4) + 0x9c) == 0 ||
           (*(int *)(*(int *)(*(int *)(this + 4) + 0x9c) + 0x630) == 0)) ||
          (iVar2 = (**(code **)(**(int **)(*(int *)(*(int *)(this + 4) + 0x9c) + 0x630) + 0x58))
                             (param_1,param_2,*(undefined4 *)(*(int *)(this + 4) + 0x3c0)),
          iVar2 == 0)) &&
         ((iVar2 = *(int *)(this + 4), *(int *)(iVar2 + 0x740) == 0 ||
          (iVar2 = (**(code **)(**(int **)(iVar2 + 0x740) + 0x58))
                             (param_1,param_2,*(undefined4 *)(iVar2 + 0x3c0)), iVar2 == 0)))))) &&
       ((iVar2 = *(int *)(this + 4), *(int *)(iVar2 + 0x8dc) == 0 ||
        (iVar2 = (**(code **)(**(int **)(iVar2 + 0x8dc) + 0x58))
                           (param_1,param_2,*(undefined4 *)(iVar2 + 0x3c0)), iVar2 == 0)))) &&
      (((iVar2 = *(int *)(this + 4), *(int *)(iVar2 + 0x8ec) == 0 ||
        (iVar2 = (**(code **)(**(int **)(iVar2 + 0x8ec) + 0x58))
                           (param_1,param_2,*(undefined4 *)(iVar2 + 0x3c0)), iVar2 == 0)) &&
       ((iVar2 = (**(code **)(**(int **)(this + 4) + 0x58))
                           (param_1,param_2,(*(int **)(this + 4))[0xf0]), iVar2 == 0 &&
        ((iVar2 = *(int *)(this + 4), *(int *)(iVar2 + 0x8e4) == 0 ||
         (iVar2 = (**(code **)(**(int **)(iVar2 + 0x8e4) + 0x58))
                            (param_1,param_2,*(undefined4 *)(iVar2 + 0x3c0)), iVar2 == 0)))))))) &&
     ((*(int *)(*(int *)(this + 4) + 0x3c0) == 0 ||
      (((piVar1 = *(int **)(*(int *)(this + 4) + 0x3c0),
        iVar2 = (**(code **)(*piVar1 + 0x58))(param_1,param_2,piVar1), iVar2 == 0 &&
        ((*(int *)(*(int *)(*(int *)(this + 4) + 0x3c0) + 0x494) == 0 ||
         (iVar2 = *(int *)(*(int *)(this + 4) + 0x3c0),
         iVar2 = (**(code **)(**(int **)(iVar2 + 0x494) + 0x58))(param_1,param_2,iVar2), iVar2 == 0)
         ))) && ((*(int *)(*(int *)(*(int *)(this + 4) + 0x3c0) + 0x49c) == 0 ||
                 (iVar2 = (**(code **)(**(int **)(*(int *)(*(int *)(this + 4) + 0x3c0) + 0x49c) +
                                      0x58))(param_1,param_2,*(int *)(*(int *)(this + 4) + 0x3c0)),
                 iVar2 == 0)))))))) {
    iVar3 = (*(code *)**(undefined4 **)(*(int *)(*(int *)(*(int *)(this + 4) + 0xa0) + 0x44) + 0x2c)
            )(param_1,param_2);
    iVar2 = 0;
    if (iVar3 == 0) {
      while( true ) {
        if (*(int *)(this + 0x38) <= iVar2) {
          ExceptionList = local_10;
          return 0;
        }
        piVar1 = *(int **)(*(int *)(this + 0x34) + iVar2 * 4);
        if ((piVar1 != (int *)0x0) &&
           (iVar3 = (**(code **)(*piVar1 + 0x58))
                              (param_1,param_2,*(undefined4 *)(*(int *)(this + 4) + 0x3c0)),
           iVar3 != 0)) break;
        iVar2 = iVar2 + 1;
      }
      ExceptionList = local_10;
      return 1;
    }
  }
  ExceptionList = local_10;
  return 1;
}


