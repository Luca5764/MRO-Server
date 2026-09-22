'use strict';

// BRIDGE-SPIKE 收窄版 —— 方案 B：仍掛 Engine.dll+0x2234b0（AActor::ProcessRemoteFunction
// 本體），但把 onEnter 的熱路徑壓到只剩「兩次指標比較」，不查 Map、不解名字、不普查。
// 背景與 bridge-fire.js 的效能疑慮見 docs/journal/2026-09-22-1900-bridge-stage2.md
// 「⚠️ 方法論風險」一節；跟 bridge-fire.js／bridge-fire-late.js 一起用於 FPS 對照
// （見 tools/bridge/README.md「四組對照」）。
//
// 為什麼不是「方案 A：直接掛 ServerFire/ClientFire 的 native 進入點」：
// docs/research/2026-09-20-toall-dispatch/ProcessRemoteFunction-decompile.txt
// 第 66-71 行顯示，這個引擎呼叫非 native UFunction 時走的是「讀 bytecode 第一個 opcode
// byte，再用這個 byte 去查一張共用的全域表 GNatives」，不是讀 UFunction 物件上某個
// 各自不同的 Func 指標欄位去直接 call；而且 docs/research/2026-09-22-bridge-spike/
// stage2-addresses.txt 段落 B6 已確認 ServerFireProjectileCenterLoc_MH／
// ClientFireProjectileCenterLoc_MH 是純 UnrealScript simulated function（Engine/
// Core/ZNetwork 三個 DLL 的 export 表都掃過，沒有對應符號），沒有各自獨立的 native
// 機器碼位址可以掛。方案 A 不成立，這裡採用方案 B。
//
// 收窄做法：先跑一段「暖機階段」，跟 bridge-fire.js 一樣用 FName 解析鏈把每個
// UFunction* 解成名字，直到同時看到 ServerFireProjectileCenterLoc_MH 和
// ClientFireProjectileCenterLoc_MH 各出現至少一次，就把這兩個 UFunction* 的值存下來
// （純變數指派，不是 I/O），之後 onEnter 只做「null 檢查 + 累計 + 至多兩次指標比較」，
// 不再查 Map、不再解名字、不再對其他事件做任何事。暖機沒有時間上限——寧可暖機晚一點
// 結束，也不要在還沒抓到兩個目標指標前就用猜的。
//
// 觸發來源：跟 bridge-fire.js 一樣，這個掛點是所有 RPC-like UFunction 呼叫的必經之路
// （不是單一玩家操作）；暖機階段要靠操作者實際開火（fire_burst）才能讓兩個目標函式各
// 出現一次。暖機完成後，只有「送出開火（ServerFire）／收到開火（ClientFire）」這兩種
// 呼叫才會被計數，其餘呼叫（PlayerMove、RenderOverlays…）在最多兩次指標比較後直接放行。
//
// 這支腳本**只讀**，不改任何暫存器/記憶體/回傳值。

const LOG_PATH = 'C:\\Games\\MetalRage Online 3\\data\\System\\bridge-fire-narrow.log';
const PROCESS_REMOTE_FUNCTION_OFFSET = 0x2234b0;
const UOBJECT_NAME_OFFSET = 0x24;
const FNAME_NAMES_OFFSET = 0x1ca6fc;
const FNAME_ENTRY_STRING_OFFSET = 0xc;
const FLUSH_MS = 5000;
const SERVER_FIRE_NAME = 'ServerFireProjectileCenterLoc_MH';
const CLIENT_FIRE_NAME = 'ClientFireProjectileCenterLoc_MH';

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

// UFunction 指標 -> 名字（或 null＝解不出來）的快取，**只在暖機階段使用**。
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
  const hookAddr = engineBase.add(PROCESS_REMOTE_FUNCTION_OFFSET);
  appendLine(
    'script loaded, Engine.dll base=' + engineBase + ' Core.dll base=' + coreBase +
    ' ProcessRemoteFunction@' + hookAddr + ' mode=warmup'
  );

  // 暖機階段找到的目標指標；找齊兩個就切換成 narrow 模式。純變數，onEnter 裡只做讀寫，
  // 不是 I/O。
  let narrowed = false;
  let targetA = null; // ServerFireProjectileCenterLoc_MH 的 UFunction*
  let targetB = null; // ClientFireProjectileCenterLoc_MH 的 UFunction*
  let narrowedAtIso = null;   // 暖機結束的時間戳，narrow 開始後在下一次 flush 補記一次
  let narrowedLogged = false; // 避免每次 flush 重複寫那一行
  let warmupCallsTotal = 0;   // 暖機期間解析過的呼叫數（累計，不隨 flush 歸零，只供那行 log 用）

  // 本視窗（兩次 flush 之間）的計數，flush 完會歸零。
  let serverFireCount = 0;
  let clientFireCount = 0;
  let totalCalls = 0; // narrow 模式下也持續累計，用來對照「掛鉤仍攔到多少次」
  let windowStart = Date.now();

  try {
    Interceptor.attach(hookAddr, {
      // 只用 onEnter；narrow 模式下的熱路徑：null 檢查 + 累計 + 至多兩次指標比較，
      // 不查 Map、不解字串、不普查、不做 I/O。
      onEnter: function (args) {
        try {
          const ptr = args[0];
          if (ptr.isNull()) return;

          if (narrowed) {
            totalCalls += 1;
            if (ptr.equals(targetA)) {
              serverFireCount += 1;
            } else if (ptr.equals(targetB)) {
              clientFireCount += 1;
            }
            return;
          }

          // 暖機階段：跟 bridge-fire.js 一樣的 FName 解析鏈，找齊兩個目標指標就收工。
          totalCalls += 1;
          warmupCallsTotal += 1;
          const name = resolveFunctionName(coreBase, ptr);
          if (name === null) return;
          if (targetA === null && name === SERVER_FIRE_NAME) {
            targetA = ptr;
          } else if (targetB === null && name === CLIENT_FIRE_NAME) {
            targetB = ptr;
          }
          if (targetA !== null && targetB !== null) {
            narrowed = true;
            narrowedAtIso = nowIso(); // 只是組字串，不是檔案 I/O
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
        ' mode=' + (narrowed ? 'narrow' : 'warmup') +
        ' calls=' + totalCalls +
        ' ServerFire=' + serverFireCount +
        ' ClientFire=' + clientFireCount +
        (narrowed ? '' : ' warmup_calls_total=' + warmupCallsTotal)
      );
      if (narrowed && !narrowedLogged) {
        narrowedLogged = true;
        lines.push(
          '[' + nowIso() + '] narrowed at ' + narrowedAtIso +
          ' targetA(ServerFire)=' + targetA + ' targetB(ClientFire)=' + targetB +
          ' warmup_calls_total=' + warmupCallsTotal
        );
      }
      appendLines(lines);
    } catch (e) {
      // flush 本身失敗也不要往外丟，下一輪再試
    } finally {
      serverFireCount = 0;
      clientFireCount = 0;
      totalCalls = 0;
      windowStart = Date.now();
    }
  }

  setInterval(flush, FLUSH_MS);
});
