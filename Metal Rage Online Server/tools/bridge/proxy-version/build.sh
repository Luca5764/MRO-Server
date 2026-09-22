#!/bin/bash
# 編譯 forwarder 版 proxy VERSION.dll（BRIDGE-SPIKE 階段 1，第一候選）。
# 編譯器：i686-w64-mingw32-gcc (GCC) 10-win32 20220113（WSL 已裝，見
# tools/bridge/README.md 的「32 位元工具鏈」一節）。
set -euo pipefail
cd "$(dirname "$0")"

i686-w64-mingw32-gcc -shared -O2 -o VERSION.dll \
    version_proxy.c version_proxy.def \
    -Wl,--enable-stdcall-fixup -static-libgcc

echo "built: VERSION.dll"
i686-w64-mingw32-objdump -p VERSION.dll | sed -n '/Ordinal\/Name Pointer/,/^$/p'
