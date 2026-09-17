// ======== 0x10466fe0  PreProcess  @ 10466fe0 ========
/* public: virtual int __thiscall UInput::PreProcess(enum EInputKey,enum EInputAction,float) */

int __thiscall UInput::PreProcess(UInput *this,EInputKey param_1,EInputAction param_2,float param_3)

{
                    /* 0x166fe0  6364  ?PreProcess@UInput@@UAEHW4EInputKey@@W4EInputAction@@M@Z */
  if (param_2 == 1) {
    if (this[param_1 + 0xf6c] == (UInput)0x0) {
      this[param_1 + 0xf6c] = (UInput)0x1;
      return 1;
    }
  }
  else {
    if (param_2 != 3) {
      return 1;
    }
    if (this[param_1 + 0xf6c] != (UInput)0x0) {
      this[param_1 + 0xf6c] = (UInput)0x0;
      return 1;
    }
  }
  return 0;
}


