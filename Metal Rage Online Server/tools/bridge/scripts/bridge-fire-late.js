'use strict';

// BRIDGE-SPIKE 收窄版 —— 方案 C（PM 2026-09-22 中途加的補充任務）：不改用別的函式，
// 仍在 AActor::ProcessRemoteFunction 本體內，但把 Interceptor.attach 的位址**往後移到
// 「非網路函式已經提早返回」之後**，讓 trampoline 只在真正的 RPC 呼叫時才觸發，而不是
// 每個 script 事件（RenderOverlays、PlayerMove…）都要付一次代價。跟 bridge-fire.js／
// bridge-fire-narrow.js 一起用於 FPS 對照（見 tools/bridge/README.md「四組對照」）。
// 這支腳本刻意保留 bridge-fire.js 那套「每次呼叫都解名字、做完整普查」的邏輯不變，
// **只改掛鉤位址**，這樣才能把「掛點變晚」這個變數跟 bridge-fire-narrow.js 的「onEnter
// 改成指標比對」這個變數分開量，不要混在一起。
//
// ── 位址是怎麼訂出來的（這次任務用 tools/disasm.py 直接反組譯 Engine.dll 驗證，
//    不是沿用 decompile 偽碼；Engine.dll sha256 fc51fe1240ee34111fc1a483e74a1b131d4b6
//    9f2b2a0940adbb4a860a138d24e，跟 stage2-addresses.txt 記的一致）──
//
// `disasm.py at 0x105234b0 400 Engine.dll` 讀出 ProcessRemoteFunction 本體的真實組語
// （這次任務範圍限定只能動 tools/bridge/、tools/pico/experiments/，沒有另存 research
// 檔案；要覆核就直接重跑這條指令，Engine.dll sha256 見上，同一份安裝重跑會拿到一樣的
// 輸出）。函式一開頭到 0x10523562 之間有三段「不合條件就直接跳到共用的 return-0／
// return-local_18
// 出口」的檢查，跟這次要濾掉的「非網路函式」直接相關的是最後一段：
//
//   0x1052355b  test  byte ptr [ebx+0x84], 0x40   ; ebx = UFunction*，flags & FUNC_Net(0x40)？
//   0x10523562  je    0x10523521                  ; 沒有這個 flag -> 提早返回（非 RPC）
//   0x10523564  mov   edx, dword ptr [edi]         ; ← 這裡才是「確定是 RPC」之後的第一條指令
//
// `param_1[0x84] & 0x40` 這個 flags 欄位跟 decompile（ProcessRemoteFunction-decompile.txt
// 第 36 行 `(*(uint*)(param_1+0x84) & 0x2000)`、第 55 行 `((byte)param_1[0x84] & 0x40)`）
// 用的是同一個偏移，跟 PM 補充任務裡引用的「非網路函式在函式開頭就提早返回」完全對應：
// PlayerMove/RenderOverlays 這類非 RPC 的 simulated function 沒有這個 flag bit，會在
// 0x10523562 這一跳直接離開，永遠不會走到 0x10523564。
//
// 這個掛點选在 0x10523564 而不是 0x10523597（PM 補充任務原先給的候選之一）的原因：
// 0x10523597 那一段（`test eax, 0xc00000`）是**已經確定是 RPC 之後**再往下選
// 「單一連線 vs 廣播」哪條路徑，ServerFire（client -> server，單一連線）用的是單一連線
// 那條路（見 FUN_10522560 兩個呼叫點，docs/research/2026-09-20-toall-dispatch/
// FUN_10522560-per-connection-send-decompile.txt），如果只掛廣播分支會漏掉 ServerFire。
// 0x10523564 在兩條路徑分岔之前，兩種呼叫都會經過，不會漏。
//
// 為什麼用 `this.context.ebx`／`this.context.edi` 而不是 `args[0]`：這是**函式中段**，
// 不是函式進入點，esp 這時候不再指著「呼叫端的返回位址」，Frida 的 `args[]`（假設
// esp+4/8/... 是 stack 參數）在這裡讀出來的值沒有意義。改成直接讀暫存器：`ebx` 從
// 0x105234cc（`mov ebx,[ebp+8]`）之後到這裡全程沒被覆寫，就是 UFunction*；`edi` 從
// 0x105234df（`mov edi,ecx`）之後全程沒被覆寫，就是 AActor* this（跨越中間唯一一次
// call — 0x10523542 呼叫 ProcessDemoRecFunction — ebx/edi 在 x86 標準呼叫慣例下是
// callee-saved，呼叫前後不變；這條路徑本身也可能整段跳過那次 call，見上面反組譯）。
//
// 這段推論是這次任務的反組譯結果，**尚未經高階審查，標🟡**；下一位接手務必先重跑
// `disasm.py at 0x105234b0 400 Engine.dll` 逐行核對是否跟這裡的引用一致，再信任這個
// 位址。
//
// 這支腳本**只讀**，不改任何暫存器/記憶體/回傳值。

const LOG_PATH = 'C:\\Games\\MetalRage Online 3\\data\\System\\bridge-fire-late.log';
// Engine.dll + 0x223564（= 0x2234b0 + 0xb4，即 VA 0x10523564，見上方推導）。
const PROCESS_REMOTE_FUNCTION_LATE_OFFSET = 0x223564;
const UOBJECT_NAME_OFFSET = 0x24;
const FNAME_NAMES_OFFSET = 0x1ca6fc;
const FNAME_ENTRY_STRING_OFFSET = 0xc;
const FLUSH_MS = 5000;

// ---- 以下到分隔線為止，是 bridge-lib.js 的複本（跟 bridge-fire.js 同一份，腳本要能單獨載入）----

function nowIso() {
  try {
    return new Date().toISOString();
  } catch (e) {
    return '?';
  }
}

function appendLines(lines) {
  // 只有 flush 的時候才會呼叫這個函式；onEnter 絕對不能碰檔案 I/O。
  try {
    const f = new File(LOG_PATH, 'a');
    for (let i = 0; i < lines.length; i++) {
      f.write(lines[i] + '\n');
    }
    f.flush();
    f.close();
  } catch (e) {
    // 寫不了就算了，不要讓腳本把遊戲弄掛
  }
}

function appendLine(msg) {
  appendLines(['[' + nowIso() + '] pid=' + Process.id + ' ' + msg]);
}

// Frida 17 拿掉了 Module.findBaseAddress（[TEST] 2026-09-22 實機回報
// "TypeError: not a function"），改用 Process.findModuleByName。這裡三種寫法都試，
// 讓腳本跨 Frida 版本都能動，不要為了版本差異再燒一輪實跑。
function resolveModuleBase(name) {
  const lower = name.toLowerCase();
  try {
    if (typeof Process !== 'undefined' && typeof Process.findModuleByName === 'function') {
      const m = Process.findModuleByName(name);
      if (m !== null && m !== undefined) return m.base;
    }
  } catch (e) { /* 換下一種 */ }
  try {
    if (typeof Module !== 'undefined' && typeof Module.findBaseAddress === 'function') {
      const base = Module.findBaseAddress(name);
      if (base !== null && base !== undefined) return base;
    }
  } catch (e) { /* 換下一種 */ }
  try {
    const mods = Process.enumerateModules();
    for (let i = 0; i < mods.length; i += 1) {
      if (String(mods[i].name).toLowerCase() === lower) return mods[i].base;
    }
  } catch (e) { /* 三種都失敗 */ }
  return null;
}

// 模組是延遲載入的（見 bridge-fire.js 同一段註解），所以不能一次找不到就放棄，
// 要輪詢等它出現。等到就執行 onReady，逾時才真的放棄。
function whenModuleLoaded(name, timeoutMs, intervalMs, onReady) {
  const deadline = Date.now() + timeoutMs;
  let reported = false;
  const timer = setInterval(function () {
    let base = null;
    try { base = resolveModuleBase(name); } catch (e) { base = null; }
    if (base !== null) {
      clearInterval(timer);
      appendLine('module ' + name + ' appeared, base=' + base);
      try { onReady(base); } catch (e) { appendLine('FATAL onReady(' + name + ') threw: ' + e); }
      return;
    }
    if (!reported) {
      reported = true;
      appendLine('waiting for ' + name + ' to load (delay-loaded; will poll)');
    }
    if (Date.now() > deadline) {
      clearInterval(timer);
      appendLine('giving up: ' + name + ' never loaded within ' + timeoutMs + 'ms');
    }
  }, intervalMs);
}

// ---------------------------------------------------------------------------

// UFunction 指標 -> 名字（或 null＝解不出來）的快取（跟 bridge-fire.js 一樣跨視窗保留）。
const nameCache = new Map();

function resolveFunctionName(coreBase, ufunctionPtr) {
  const key = ufunctionPtr.toString();
  if (nameCache.has(key)) {
    return nameCache.get(key);
  }
  let name = null;
  try {
    const nameIndex = ufunctionPtr.add(UOBJECT_NAME_OFFSET).readU32();
    const namesArrayPtr = coreBase.add(FNAME_NAMES_OFFSET);
    const namesData = namesArrayPtr.readPointer();
    if (!namesData.isNull()) {
      const entryPtr = namesData.add(nameIndex * 4).readPointer();
      if (!entryPtr.isNull()) {
        name = entryPtr.add(FNAME_ENTRY_STRING_OFFSET).readUtf16String();
      }
    }
  } catch (e) {
    name = null; // 指標無效或讀取失敗，當作「解不出來」，不要往外丟例外
  }
  nameCache.set(key, name);
  return name;
}

appendLine('script loaded; waiting for Engine.dll / Core.dll');

whenModuleLoaded('Engine.dll', 300000, 2000, function (engineBase) {
  const coreBase = resolveModuleBase('Core.dll');
  if (coreBase === null) {
    appendLine('giving up: Core.dll not found even though Engine.dll is loaded');
    return;
  }
  const hookAddr = engineBase.add(PROCESS_REMOTE_FUNCTION_LATE_OFFSET);
  appendLine(
    'script loaded, Engine.dll base=' + engineBase + ' Core.dll base=' + coreBase +
    ' ProcessRemoteFunction+late@' + hookAddr + ' (post early-return branch, see file header)'
  );

  // 本視窗（兩次 flush 之間）的計數，flush 完會歸零。
  let censusCounts = new Map(); // 函式名字 -> 這個視窗內的呼叫次數
  let unresolvedCount = 0;      // 解不出名字的呼叫次數
  let serverFireCount = 0;      // 名字含 "ServerFire" 的呼叫次數（加入者端送出）
  let clientFireCount = 0;      // 名字含 "ClientFire" 的呼叫次數（加入者端收到）
  let windowCallTotal = 0;
  let windowStart = Date.now();

  try {
    Interceptor.attach(hookAddr, {
      // 只用 onEnter。這裡是函式中段，不是進入點，UFunction* 要從暫存器讀（ebx），
      // 不能用 args[0]（見檔頭「為什麼用 context.ebx」一節）。
      onEnter: function (args) {
        // 觸發來源：跟 bridge-fire.js 一樣，這是所有 RPC-like UFunction 呼叫的必經之路
        // （不是單一玩家操作），差別是這個掛點在「確認 FunctionFlags 帶 FUNC_Net(0x40)」
        // 之後，非網路的 script 事件（PlayerMove、RenderOverlays 等）已經在更早的分支
        // 提早返回，理論上不會再到這裡。
        try {
          const ufunctionPtr = this.context.ebx;
          if (ufunctionPtr.isNull()) return;
          const name = resolveFunctionName(coreBase, ufunctionPtr);
          windowCallTotal += 1;
          if (name === null) {
            unresolvedCount += 1;
            return;
          }
          censusCounts.set(name, (censusCounts.get(name) || 0) + 1);
          if (name.indexOf('ServerFire') !== -1) {
            serverFireCount += 1;
          }
          if (name.indexOf('ClientFire') !== -1) {
            clientFireCount += 1;
          }
        } catch (e) {
          // 讀取失敗就放棄這一筆，不要讓 onEnter 丟例外
        }
      }
    });
  } catch (e) {
    appendLine('FATAL Interceptor.attach failed: ' + e);
  }

  function flush() {
    try {
      const windowMs = Date.now() - windowStart;
      const lines = [];
      lines.push(
        '[' + nowIso() + '] pid=' + Process.id +
        ' window_ms=' + windowMs +
        ' calls=' + windowCallTotal +
        ' ServerFire=' + serverFireCount +
        ' ClientFire=' + clientFireCount +
        ' unresolved=' + unresolvedCount +
        ' distinct_names=' + censusCounts.size
      );
      // 名字普查，依次數由大到小，方便一眼看出量最大的是什麼，也方便對照
      // bridge-fire.js 的普查結果（同一場戰鬥兩支腳本理論上應該只差在「非 RPC 事件
      // 有沒有出現」，出現的 RPC 名單跟各自次數應該吻合）。
      const sorted = Array.from(censusCounts.entries()).sort(function (a, b) {
        return b[1] - a[1];
      });
      for (let i = 0; i < sorted.length; i++) {
        lines.push('  census ' + sorted[i][0] + '=' + sorted[i][1]);
      }
      appendLines(lines);
    } catch (e) {
      // flush 本身失敗也不要往外丟，下一輪再試
    } finally {
      censusCounts = new Map();
      unresolvedCount = 0;
      serverFireCount = 0;
      clientFireCount = 0;
      windowCallTotal = 0;
      windowStart = Date.now();
    }
  }

  setInterval(flush, FLUSH_MS);
});
