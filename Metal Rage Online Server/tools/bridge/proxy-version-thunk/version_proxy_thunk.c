/*
 * BRIDGE-SPIKE 階段 1：VERSION.dll proxy —— 手寫 thunk 版本（備案）。
 *
 * 與 proxy-version/version_proxy.c 的差別：**不用** .def 的 PE forwarder
 * RVA（那個已經驗證 mingw ld 支援，見 proxy-version/），這份是契約要求的
 * 「兩種都試」的另一半，走 GetProcAddress + 手動轉呼叫 stub，不依賴
 * forwarder RVA 這個機制本身。
 *
 * DllMain 用絕對路徑 LoadLibraryW(L"C:\\Windows\\SysWOW64\\version.dll")
 * 載入真正的系統 DLL（⚠️ 不是 LoadLibraryW(L"version.dll")，那會遞迴載到
 * 自己），GetProcAddress 拿到 5 個函式指標，每個 export 是一個轉呼叫 stub。
 *
 * 這份是階段 1「兩種都試」的對照組，實際安裝建議用 proxy-version/
 * （forwarder 版，已驗證可行、程式碼更短、沒有手寫函式簽章打錯的風險）。
 */

#include <windows.h>
#include <stdio.h>
#include <stdarg.h>
#include <wchar.h>

/* ---- 與 proxy-version/version_proxy.c 相同的 log 邏輯（故意重複，
 * 兩個 proxy 是各自獨立的候選，不共用程式碼，方便單獨拿掉其中一個）。 ---- */

static void get_default_log_path(HMODULE self, wchar_t *out, DWORD out_chars) {
    wchar_t self_path[MAX_PATH];
    DWORD len = GetModuleFileNameW(self, self_path, MAX_PATH);
    if (len == 0 || len >= MAX_PATH) {
        wcsncpy(out, L"bridge.log", out_chars - 1);
        out[out_chars - 1] = L'\0';
        return;
    }
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
        return;
    }
    get_default_log_path(self, out, out_chars);
}

static void log_line(HMODULE self, const char *fmt, ...) {
    wchar_t log_path[MAX_PATH * 2];
    get_log_path(self, log_path, MAX_PATH * 2);

    FILE *f = _wfopen(log_path, L"a");
    if (!f) {
        return;
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

/* ---- 轉呼叫 stub：5 個真正用到的符號，函式指標型別照 winver.h。 ---- */

typedef BOOL(WINAPI *PFN_GetFileVersionInfoA)(LPCSTR, DWORD, DWORD, LPVOID);
typedef BOOL(WINAPI *PFN_GetFileVersionInfoW)(LPCWSTR, DWORD, DWORD, LPVOID);
typedef DWORD(WINAPI *PFN_GetFileVersionInfoSizeA)(LPCSTR, LPDWORD);
typedef DWORD(WINAPI *PFN_GetFileVersionInfoSizeW)(LPCWSTR, LPDWORD);
typedef BOOL(WINAPI *PFN_VerQueryValueA)(LPCVOID, LPCSTR, LPVOID *, PUINT);
typedef BOOL(WINAPI *PFN_VerQueryValueW)(LPCVOID, LPCWSTR, LPVOID *, PUINT);

static HMODULE g_real_version = NULL;
static PFN_GetFileVersionInfoA g_GetFileVersionInfoA = NULL;
static PFN_GetFileVersionInfoW g_GetFileVersionInfoW = NULL;
static PFN_GetFileVersionInfoSizeA g_GetFileVersionInfoSizeA = NULL;
static PFN_GetFileVersionInfoSizeW g_GetFileVersionInfoSizeW = NULL;
static PFN_VerQueryValueA g_VerQueryValueA = NULL;
static PFN_VerQueryValueW g_VerQueryValueW = NULL;

__declspec(dllexport) BOOL WINAPI GetFileVersionInfoA(LPCSTR a, DWORD b, DWORD c, LPVOID d) {
    if (!g_GetFileVersionInfoA) { SetLastError(ERROR_PROC_NOT_FOUND); return FALSE; }
    return g_GetFileVersionInfoA(a, b, c, d);
}

__declspec(dllexport) BOOL WINAPI GetFileVersionInfoW(LPCWSTR a, DWORD b, DWORD c, LPVOID d) {
    if (!g_GetFileVersionInfoW) { SetLastError(ERROR_PROC_NOT_FOUND); return FALSE; }
    return g_GetFileVersionInfoW(a, b, c, d);
}

__declspec(dllexport) DWORD WINAPI GetFileVersionInfoSizeA(LPCSTR a, LPDWORD b) {
    if (!g_GetFileVersionInfoSizeA) { SetLastError(ERROR_PROC_NOT_FOUND); return 0; }
    return g_GetFileVersionInfoSizeA(a, b);
}

__declspec(dllexport) DWORD WINAPI GetFileVersionInfoSizeW(LPCWSTR a, LPDWORD b) {
    if (!g_GetFileVersionInfoSizeW) { SetLastError(ERROR_PROC_NOT_FOUND); return 0; }
    return g_GetFileVersionInfoSizeW(a, b);
}

__declspec(dllexport) BOOL WINAPI VerQueryValueA(LPCVOID a, LPCSTR b, LPVOID *c, PUINT d) {
    if (!g_VerQueryValueA) { SetLastError(ERROR_PROC_NOT_FOUND); return FALSE; }
    return g_VerQueryValueA(a, b, c, d);
}

__declspec(dllexport) BOOL WINAPI VerQueryValueW(LPCVOID a, LPCWSTR b, LPVOID *c, PUINT d) {
    if (!g_VerQueryValueW) { SetLastError(ERROR_PROC_NOT_FOUND); return FALSE; }
    return g_VerQueryValueW(a, b, c, d);
}

BOOL WINAPI DllMain(HMODULE hinstDLL, DWORD fdwReason, LPVOID lpReserved) {
    (void)lpReserved;

    if (fdwReason == DLL_PROCESS_ATTACH) {
        wchar_t self_path[MAX_PATH];
        DWORD len = GetModuleFileNameW(hinstDLL, self_path, MAX_PATH);
        if (len == 0) {
            self_path[0] = L'\0';
        }
        log_line(hinstDLL, "VERSION.dll proxy (thunk) attached, self=%ls", self_path);

        /* ⚠️ 絕對路徑，不能寫 LoadLibraryW(L"version.dll")，
         * 那會被 Windows 找回我們自己（無窮遞迴/直接失敗）。 */
        g_real_version = LoadLibraryW(L"C:\\Windows\\SysWOW64\\version.dll");
        DWORD err = GetLastError();
        if (!g_real_version) {
            log_line(hinstDLL,
                     "FATAL: LoadLibraryW(SysWOW64\\version.dll) failed, GetLastError=%lu",
                     (unsigned long)err);
        } else {
            g_GetFileVersionInfoA = (PFN_GetFileVersionInfoA)
                GetProcAddress(g_real_version, "GetFileVersionInfoA");
            g_GetFileVersionInfoW = (PFN_GetFileVersionInfoW)
                GetProcAddress(g_real_version, "GetFileVersionInfoW");
            g_GetFileVersionInfoSizeA = (PFN_GetFileVersionInfoSizeA)
                GetProcAddress(g_real_version, "GetFileVersionInfoSizeA");
            g_GetFileVersionInfoSizeW = (PFN_GetFileVersionInfoSizeW)
                GetProcAddress(g_real_version, "GetFileVersionInfoSizeW");
            g_VerQueryValueA = (PFN_VerQueryValueA)
                GetProcAddress(g_real_version, "VerQueryValueA");
            g_VerQueryValueW = (PFN_VerQueryValueW)
                GetProcAddress(g_real_version, "VerQueryValueW");

            log_line(hinstDLL,
                     "GetProcAddress results: A=%p AW=%p SizeA=%p SizeW=%p QA=%p QW=%p",
                     (void *)g_GetFileVersionInfoA, (void *)g_GetFileVersionInfoW,
                     (void *)g_GetFileVersionInfoSizeA, (void *)g_GetFileVersionInfoSizeW,
                     (void *)g_VerQueryValueA, (void *)g_VerQueryValueW);
        }

        /* gadget 載入邏輯與 proxy-version/version_proxy.c 相同。 */
        wchar_t gadget_path[MAX_PATH];
        wcsncpy(gadget_path, self_path, MAX_PATH - 1);
        gadget_path[MAX_PATH - 1] = L'\0';
        wchar_t *slash = wcsrchr(gadget_path, L'\\');
        if (slash) {
            *(slash + 1) = L'\0';
            wcsncat(gadget_path, L"frida-gadget-17.18.0-windows-x86.dll",
                    MAX_PATH - wcslen(gadget_path) - 1);

            HMODULE gadget = LoadLibraryW(gadget_path);
            DWORD gerr = GetLastError();
            if (gadget) {
                log_line(hinstDLL, "gadget LoadLibraryW OK, handle=%p path=%ls",
                         (void *)gadget, gadget_path);
            } else {
                log_line(hinstDLL,
                         "gadget LoadLibraryW FAILED, GetLastError=%lu path=%ls",
                         (unsigned long)gerr, gadget_path);
            }
        } else {
            log_line(hinstDLL, "gadget load skipped: could not derive directory from self_path");
        }
    }

    return TRUE;
}
