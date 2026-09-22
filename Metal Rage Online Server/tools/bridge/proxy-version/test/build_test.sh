#!/bin/bash
# 建置最小 32 位元測試 exe，並重建 libversion_test.a（靜態驗證用的假 import
# library，不隨安裝一起送，只給 WSL 端 objdump/pefile 比對用）。
#
# implib.def 用「裝飾過」的 stdcall 名字（Foo@N）餵給 dlltool，
# 配合 --kill-at：這樣產生的 .a 內部連結符號保留 @N（跟 gcc 呼叫 stdcall
# 函式時產生的 undefined reference 對得上），但寫進最終 exe import 表的
# Hint/Name 字串會是「不帶 @N 的原名」——跟系統真正的
# /usr/i686-w64-mingw32/lib/libversion.a 展開後的 .idata$6 內容逐 byte
# 比對過，一致。詳見 tools/bridge/stage1-plan.md「靜態驗證」一節。
set -euo pipefail
cd "$(dirname "$0")"

i686-w64-mingw32-dlltool --kill-at -d implib.def -l libversion_test.a --dllname VERSION.dll

i686-w64-mingw32-gcc -O2 -o test_import.exe test_import.c -L. -lversion_test

echo "built: test_import.exe"
i686-w64-mingw32-objdump -p test_import.exe | sed -n '/DLL Name: VERSION.dll/,/^$/p'
