/*
 * BRIDGE-SPIKE 階段 1：VERSION.dll proxy。
 *
 * 這支 DLL 冒充 System/VERSION.dll。真正的轉發（GetFileVersionInfoA/W、
 * GetFileVersionInfoSizeA/W、VerQueryValueA、VerQueryValueW）是用
 * version_proxy.def 裡的 PE forwarder RVA 做的（EXPORTS 段的
 * `Foo=VERSION_ORIG.Foo` 語法），**這支 .c 檔完全不用寫轉呼叫函式**——
 * forwarder 是 export table 裡的一個字串，由 Windows loader 在
 * GetProcAddress/隱含 import 時自動解析到 VERSION_ORIG.dll，不經過這支
 * DLL 的程式碼。詳見 tools/bridge/stage1-plan.md 與
 * docs/research/2026-09-22-bridge-spike/proxy-dll-candidates.md。
 *
 * 這支 .c 檔只做兩件事，都在 DllMain 的 DLL_PROCESS_ATTACH：
 *   a) 往 bridge.log 寫一行 pid/時間/自己的完整路徑；
 *   b) LoadLibraryW 載入同目錄的 frida-gadget-*.dll，把回傳值與
 *      GetLastError 也寫進 log。
 * 不做任何重活（不開執行緒、不等待），照 AGENTS.md 與任務契約的限制。
 *
 * 編譯（WSL，i686-w64-mingw32-gcc 10-win32 20220113）：
 *   見同目錄 build.sh。
 */

#include <windows.h>
#include <stdio.h>
#include <stdarg.h>
#include <wchar.h>

/* log 路徑可用環境變數 MRO_BRIDGE_LOG 覆蓋；預設寫到 DLL 自己所在目錄下的
 * bridge.log（GetModuleFileNameW 用 hinstDLL 取得自己的路徑，換副檔名）。 */
static void get_default_log_path(HMODULE self, wchar_t *out, DWORD out_chars) {
    wchar_t self_path[MAX_PATH];
    DWORD len = GetModuleFileNameW(self, self_path, MAX_PATH);
    if (len == 0 || len >= MAX_PATH) {
        wcsncpy(out, L"bridge.log", out_chars - 1);
        out[out_chars - 1] = L'\0';
        return;
    }
    /* 找最後一個反斜線，換成 bridge.log */
    wchar_t *slash = wcsrchr(self_path, L'\\');
    if (slash) {
        *(slash + 1) = L'\0';
        _snwprintf(out, out_chars - 1, L"%sbridge.log", self_path);
    } else {
        wcsncpy(out, L"bridge.log", out_chars - 1);
    }
    out[out_chars - 1] = L'\0';
}

static void get_log_path(HMODULE self, wchar_t *out, DWORD out_chars) {
    DWORD n = GetEnvironmentVariableW(L"MRO_BRIDGE_LOG", out, out_chars);
    if (n > 0 && n < out_chars) {
        return; /* 環境變數有設就用它 */
    }
    get_default_log_path(self, out, out_chars);
}

static void log_line(HMODULE self, const char *fmt, ...) {
    wchar_t log_path[MAX_PATH * 2];
    get_log_path(self, log_path, MAX_PATH * 2);

    FILE *f = _wfopen(log_path, L"a");
    if (!f) {
        return; /* 寫不了就放棄，不要讓 DllMain 崩潰 */
    }

    SYSTEMTIME st;
    GetLocalTime(&st);
    fprintf(f, "[%04d-%02d-%02d %02d:%02d:%02d] pid=%lu ",
            st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond,
            (unsigned long)GetCurrentProcessId());

    va_list args;
    va_start(args, fmt);
    vfprintf(f, fmt, args);
    va_end(args);

    fprintf(f, "\n");
    fclose(f);
}

BOOL WINAPI DllMain(HMODULE hinstDLL, DWORD fdwReason, LPVOID lpReserved) {
    (void)lpReserved;

    if (fdwReason == DLL_PROCESS_ATTACH) {
        wchar_t self_path[MAX_PATH];
        DWORD len = GetModuleFileNameW(hinstDLL, self_path, MAX_PATH);
        if (len == 0) {
            self_path[0] = L'\0';
        }
        log_line(hinstDLL, "VERSION.dll proxy attached, self=%ls", self_path);

        /* 同目錄的 gadget 檔名；階段 1 先寫死 17.18.0，之後換版本再改。
         * 用相對於自己模組路徑的絕對路徑組出來，避免 CWD 不確定造成載入失敗。 */
        wchar_t gadget_path[MAX_PATH];
        wcsncpy(gadget_path, self_path, MAX_PATH - 1);
        gadget_path[MAX_PATH - 1] = L'\0';
        wchar_t *slash = wcsrchr(gadget_path, L'\\');
        if (slash) {
            *(slash + 1) = L'\0';
            wcsncat(gadget_path, L"frida-gadget-17.18.0-windows-x86.dll",
                    MAX_PATH - wcslen(gadget_path) - 1);

            HMODULE gadget = LoadLibraryW(gadget_path);
            DWORD err = GetLastError();
            if (gadget) {
                log_line(hinstDLL, "gadget LoadLibraryW OK, handle=%p path=%ls",
                         (void *)gadget, gadget_path);
            } else {
                log_line(hinstDLL,
                         "gadget LoadLibraryW FAILED, GetLastError=%lu path=%ls",
                         (unsigned long)err, gadget_path);
            }
        } else {
            log_line(hinstDLL, "gadget load skipped: could not derive directory from self_path");
        }
    }

    return TRUE;
}
