'use strict';

// BRIDGE-SPIKE 階段 2：開火計數 —— 掛 AActor::ProcessRemoteFunction，數 ServerFire/ClientFire
// 呼叫次數，順便對所有經過的 UFunction 名字做普查（用來確認 FName 解析鏈真的走對，也順便看
// 還有什麼東西在跑）。給 NETSPEED-BUDGET 的 A/B 用：量法照 Moon 的做法，比「加入者端送出
// (ServerFire) vs 收到 (ClientFire)」。
//
// 觸發來源：不是單一玩家操作，是任何一次 RPC-like UFunction 呼叫（例如開火、位置同步等）
// 都會先經過這個入口，是整個 remote function dispatch 的必經之路。
//
// 位址（組語核對，非猜測，見 docs/research/2026-09-22-bridge-spike/stage2-addresses.txt 段落 B）：
//   Engine.dll + 0x2234b0   AActor::ProcessRemoteFunction 本體
//                           __thiscall，ecx = AActor* this
//                           args[0]（第一個 stack 參數）= UFunction* Function
//   obj + 0x24              UObject::Name 索引（單一 4-byte 值，不是 index+number）
//   Core.dll + 0x1ca6fc     FName::Names（TArray），這個位址本身就是 TArray 物件，
//                           第一個欄位是 Data 指標，readPointer() 一次即可拿到 Data
//   entry + 0xc             FNameEntry 字串起點，UTF-16LE
//
// ⚠️ 效能是這支腳本的頭號風險：ProcessRemoteFunction 每秒會被呼叫非常多次。
//   - onEnter 只做「查快取表 + 數字加一」，絕對不做 I/O。
//   - 同一個 UFunction 指標只解析一次名字（nameCache，Map，key=指標的 hex 字串），
//     解析結果（含失敗＝null）都會快取，不會對同一個位址重複走 FName 解析鏈。
//   - 所有計數留在記憶體，每 FLUSH_MS（預設 5000ms）才寫一次檔，寫完歸零（視窗計數，
//     不是從開始到現在的累計總數；累計要靠加總 log 裡每一行自己做）。
//
// 這支腳本**只讀**，不改任何暫存器/記憶體/回傳值。

const LOG_PATH = 'C:\\Games\\MetalRage Online 3\\data\\System\\bridge-fire.log';
const PROCESS_REMOTE_FUNCTION_OFFSET = 0x2234b0;
const UOBJECT_NAME_OFFSET = 0x24;
const FNAME_NAMES_OFFSET = 0x1ca6fc;
const FNAME_ENTRY_STRING_OFFSET = 0xc;
const FLUSH_MS = 5000;

// 逐筆記錄開關：預設關閉（效能／log 體積考量）。要打開就把下面這行手動改成 true 再重新
// 部署到 gadget 的 .config 指的路徑。沒有走環境變數——gadget script 環境能不能讀到宿主行程
// 的環境變數未經驗證（見 README「還沒驗證的事」），與其猜不如直接改常數，比較不會出意外。
const MRO_FIRE_VERBOSE = false;
// 逐筆記錄也只是塞進下一次 flush 的 buffer，onEnter 裡一樣不做 I/O。設個上限避免
// verbose 開著時單一視窗內記憶體無限成長。
const VERBOSE_MAX_LINES_PER_WINDOW = 2000;

// ---- 以下到分隔線為止，是 bridge-lib.js 的複本（腳本要能單獨載入，不依賴 require）----

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

function resolveModuleBase(name) {
  try {
    const base = Module.findBaseAddress(name);
    if (base === null) {
      appendLine('FATAL module not found: ' + name);
    }
    return base;
  } catch (e) {
    appendLine('FATAL findBaseAddress(' + name + ') threw: ' + e);
    return null;
  }
}

// ---------------------------------------------------------------------------

// UFunction 指標 -> 名字（或 null＝解不出來）的快取。指標的 hex 字串當 key（NativePointer
// 不能直接當 Map key 比對身分，同一個位址每次 toString() 出來的字串一樣，可以拿來比對）。
// 這個快取跨視窗（flush）保留，不會被 flush 清空——名字對應在整個行程生命週期內不變。
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

const engineBase = resolveModuleBase('Engine.dll');
const coreBase = resolveModuleBase('Core.dll');

if (engineBase === null || coreBase === null) {
  appendLine('giving up: Engine.dll or Core.dll not loaded, fire counting disabled');
} else {
  const hookAddr = engineBase.add(PROCESS_REMOTE_FUNCTION_OFFSET);
  appendLine(
    'script loaded, Engine.dll base=' + engineBase + ' Core.dll base=' + coreBase +
    ' ProcessRemoteFunction@' + hookAddr + ' verbose=' + MRO_FIRE_VERBOSE
  );

  // 本視窗（兩次 flush 之間）的計數，flush 完會歸零。
  let censusCounts = new Map(); // 函式名字 -> 這個視窗內的呼叫次數
  let unresolvedCount = 0;      // 解不出名字的呼叫次數
  let serverFireCount = 0;      // 名字含 "ServerFire" 的呼叫次數（加入者端送出）
  let clientFireCount = 0;      // 名字含 "ClientFire" 的呼叫次數（加入者端收到）
  let windowCallTotal = 0;
  let windowStart = Date.now();
  let verboseLines = [];
  let verboseOverflow = 0;

  try {
    Interceptor.attach(hookAddr, {
      // 只用 onEnter：不需要回傳值，也不改任何參數/回傳值。這裡是熱路徑，邏輯要越薄越好。
      onEnter: function (args) {
        // 觸發來源：任一次 RPC-like UFunction 呼叫（客戶端送出/收到的 remote function，
        // 例如開火、位置同步）都會先進這個入口；ecx=AActor* this，args[0]=UFunction*。
        try {
          const ufunctionPtr = args[0];
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
          if (MRO_FIRE_VERBOSE) {
            if (verboseLines.length < VERBOSE_MAX_LINES_PER_WINDOW) {
              verboseLines.push(nowIso() + ' ' + name);
            } else {
              verboseOverflow += 1;
            }
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
      // 名字普查，依次數由大到小，方便一眼看出量最大的是什麼。
      const sorted = Array.from(censusCounts.entries()).sort(function (a, b) {
        return b[1] - a[1];
      });
      for (let i = 0; i < sorted.length; i++) {
        lines.push('  census ' + sorted[i][0] + '=' + sorted[i][1]);
      }
      if (MRO_FIRE_VERBOSE) {
        for (let i = 0; i < verboseLines.length; i++) {
          lines.push('  verbose ' + verboseLines[i]);
        }
        if (verboseOverflow > 0) {
          lines.push('  verbose_overflow=' + verboseOverflow);
        }
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
      verboseLines = [];
      verboseOverflow = 0;
      windowStart = Date.now();
    }
  }

  setInterval(flush, FLUSH_MS);
}
