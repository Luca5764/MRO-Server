/*
 * BRIDGE-SPIKE 階段 1：最小 32 位元測試 exe，只做靜態驗證用。
 * import 了 5 個目標符號其中 2 個（GetFileVersionInfoSizeW、VerQueryValueA），
 * 用來確認 proxy VERSION.dll 的 export 表格式跟一支真的會 implicit-link
 * 這兩個符號的行程對得上。沒有做執行期測試（WSL 沒有 wine）。
 */
#include <windows.h>
#include <stdio.h>

int main(void) {
    DWORD handle = 0;
    DWORD size = GetFileVersionInfoSizeW(L"C:\\Windows\\System32\\kernel32.dll", &handle);

    LPVOID buf = NULL;
    UINT len = 0;
    VerQueryValueA(NULL, "\\", &buf, &len);

    printf("size=%lu buf=%p len=%u\n", (unsigned long)size, buf, len);
    return 0;
}
