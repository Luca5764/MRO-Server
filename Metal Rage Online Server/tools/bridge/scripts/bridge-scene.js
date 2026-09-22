'use strict';

// BRIDGE-SPIKE 階段 2：每秒寫一行「ZNetwork 目前場景編號」到 log。
//
// 觸發來源：不是單一玩家操作，是客戶端每次場景切換（登入完成進 Waiting、進房、開戰、
// 結算…）都會呼叫的 UZNetwork_DJ::Scene_Change(this, sceneId)。這個函式是整個場景切換的
// 必經之路（docs/research/2026-09-22-bridge-spike/stage2-addresses.txt 段落 A，21 個呼叫點）。
//
// 位址（組語核對，非猜測，見上述 research 檔）：
//   ZNetwork.dll + 0x38910  Scene_Change 本體，__thiscall，ecx = UZNetwork_DJ* this
//   this + 0x38c            場景編號，1 byte
// 第一個 stack 參數（Frida args[0]）= 呼叫端傳入的 sceneId（即將寫入 this+0x38c 的新值）。
//
// 已知場景值（互相印證過，語意見 stage2-addresses.txt）：
//   0=斷線/未登入 1=Waiting 4=房內某分支(語意⬜) 5=Room/結算 6=Game 戰鬥中
//
// 這支腳本**只讀**，不改任何暫存器/記憶體/回傳值。

const LOG_PATH = 'C:\\Games\\MetalRage Online 3\\data\\System\\bridge-scene.log';
const SCENE_CHANGE_OFFSET = 0x38910;
const SCENE_FIELD_OFFSET = 0x38c;
const TICK_MS = 1000;

// ---- 以下到分隔線為止，是 bridge-lib.js 的複本（腳本要能單獨載入，不依賴 require）----

function nowIso() {
  try {
    return new Date().toISOString();
  } catch (e) {
    return '?';
  }
}

function appendLine(msg) {
  // 只在這裡做 I/O；每次獨立開檔/寫/flush/關閉，不長期持有 handle。
  try {
    const f = new File(LOG_PATH, 'a');
    f.write('[' + nowIso() + '] pid=' + Process.id + ' ' + msg + '\n');
    f.flush();
    f.close();
  } catch (e) {
    // 寫不了就算了，不要讓腳本把遊戲弄掛
  }
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

// 模組是延遲載入的（[TEST] 2026-09-22：階段 1 的心跳看到模組數從 106 長到 117，
// 而腳本在行程剛起來時就執行，那時 ZNetwork.dll 還沒載入）。所以不能一次找不到就放棄，
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

let cachedThis = null; // UZNetwork_DJ* this，Scene_Change 第一次被呼叫時快取，之後不變（CDO）
let lastKnownScene = null; // 只用來在 Scene_Change 那一行印出「切換前」的值

appendLine('script loaded; waiting for ZNetwork.dll (delay-loaded)');

whenModuleLoaded('ZNetwork.dll', 300000, 2000, function (znetBase) {
  const sceneChangeAddr = znetBase.add(SCENE_CHANGE_OFFSET);
  appendLine('script loaded, ZNetwork.dll base=' + znetBase + ' Scene_Change@' + sceneChangeAddr);

  try {
    Interceptor.attach(sceneChangeAddr, {
      // 只用 onEnter：不需要回傳值，省一次 context 切換的開銷，也不改任何參數/回傳值。
      onEnter: function (args) {
        // 觸發來源：客戶端任一次場景切換（登入完成、進 waiting、進房、開戰、結算…）
        // 呼叫 UZNetwork_DJ::Scene_Change 時進到這裡；this 走 ecx（__thiscall）。
        try {
          if (cachedThis === null) {
            cachedThis = this.context.ecx;
            appendLine('cached UZNetwork_DJ this=' + cachedThis);
          }
          // args[0] = 第一個 stack 參數 = sceneId（呼叫端傳入，即將寫進 this+0x38c 的新值）。
          const newScene = args[0].toInt32() & 0xff;
          appendLine(
            'scene_change old=' + (lastKnownScene === null ? 'unknown' : lastKnownScene) +
            ' new=' + newScene
          );
          lastKnownScene = newScene;
        } catch (e) {
          appendLine('onEnter error: ' + e);
        }
      }
    });
  } catch (e) {
    // 掛不上就放棄追蹤，heartbeat 會一直印 unknown，不假裝有在追。
    appendLine('FATAL Interceptor.attach failed: ' + e);
  }

  // [TEST] 2026-09-22：只掛 Scene_Change 不夠——登入→大廳整段都沒有觸發它，
  // 所以那個函式不是場景切換的必經之路。改用 stage2-addresses.txt 給的另一條路：
  // 直接呼叫 Core.dll 的 GetDefaultObject 取得 UZNetwork_DJ 的 CDO，再讀 +0x38c。
  // 這同時驗證 explorer 標為不確定的那一點（ZNetwork.dll+0x1e9b70 到底是不是那個 UClass）。
  // 只呼叫一次並快取，不在每秒的 timer 裡重複呼叫（UE2 不是執行緒安全的，少碰為妙）。
  const GET_DEFAULT_OBJECT_OFFSET = 0x0ce20;   // Core.dll VA 0x1010ce20
  const UZNETWORK_UCLASS_OFFSET  = 0x1e9b70;   // ZNetwork.dll VA 0x108e9b70
  let cdoThis = null;
  let cdoTried = false;

  function tryCdo() {
    cdoTried = true;
    try {
      const coreBase = resolveModuleBase('Core.dll');
      if (coreBase === null) { appendLine('cdo: Core.dll not found'); return; }
      const fn = new NativeFunction(
        coreBase.add(GET_DEFAULT_OBJECT_OFFSET), 'pointer', ['pointer'], 'thiscall');
      const uclass = znetBase.add(UZNETWORK_UCLASS_OFFSET);
      const obj = fn(uclass);
      if (obj.isNull()) { appendLine('cdo: GetDefaultObject returned NULL'); return; }
      cdoThis = obj;
      appendLine('cdo: GetDefaultObject(ZNetwork+0x1e9b70) = ' + obj);
    } catch (e) {
      appendLine('cdo: threw ' + e);
    }
  }

  setInterval(function () {
    try {
      if (cachedThis === null && !cdoTried) tryCdo();
      const who = cachedThis !== null ? cachedThis : cdoThis;
      if (who === null) {
        appendLine('scene=unknown (Scene_Change never fired, cdo unavailable)');
        return;
      }
      if (cachedThis === null) {
        const sceneCdo = who.add(SCENE_FIELD_OFFSET).readU8();
        appendLine('scene=' + sceneCdo + ' (via cdo)');
        return;
      }
      const scene = cachedThis.add(SCENE_FIELD_OFFSET).readU8();
      appendLine('scene=' + scene);
    } catch (e) {
      appendLine('heartbeat read error: ' + e);
    }
  }, TICK_MS);
});
