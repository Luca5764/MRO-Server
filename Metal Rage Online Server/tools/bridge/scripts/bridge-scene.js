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

let cachedThis = null; // UZNetwork_DJ* this，Scene_Change 第一次被呼叫時快取，之後不變（CDO）
let lastKnownScene = null; // 只用來在 Scene_Change 那一行印出「切換前」的值

const znetBase = resolveModuleBase('ZNetwork.dll');

if (znetBase === null) {
  appendLine('giving up: ZNetwork.dll not loaded, scene tracking disabled');
} else {
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

  setInterval(function () {
    try {
      if (cachedThis === null) {
        appendLine('scene=unknown (waiting for Scene_Change)');
        return;
      }
      const scene = cachedThis.add(SCENE_FIELD_OFFSET).readU8();
      appendLine('scene=' + scene);
    } catch (e) {
      appendLine('heartbeat read error: ' + e);
    }
  }, TICK_MS);
}
