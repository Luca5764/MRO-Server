#!/bin/bash
# 編譯手寫 thunk 版 proxy VERSION.dll（BRIDGE-SPIKE 階段 1，備案/對照組）。
# 編譯器：i686-w64-mingw32-gcc (GCC) 10-win32 20220113。
#
# ⚠️ 一定要加 -Wl,--kill-at：GNU ld 對 __declspec(dllexport) 的 __stdcall
# 函式預設會把 export 表名字寫成 "GetFileVersionInfoSizeW@8" 這種帶
# @N 尾巴的形式，跟真正的系統 version.dll（plain "GetFileVersionInfoSizeW"，
# 已用 /usr/i686-w64-mingw32/lib/libversion.a 對照確認）對不上，
# implicit link 的呼叫端會在載入時解析失敗。--kill-at 只影響 DLL 自己
# export 表寫出的名字，不影響函式內部呼叫慣例，是正確且必要的修法。
set -euo pipefail
cd "$(dirname "$0")"

i686-w64-mingw32-gcc -shared -O2 -o VERSION.dll \
    version_proxy_thunk.c \
    -Wl,--kill-at -Wl,--enable-stdcall-fixup -static-libgcc

echo "built: VERSION.dll"
i686-w64-mingw32-objdump -p VERSION.dll | sed -n '/Ordinal\/Name Pointer/,/^$/p'
