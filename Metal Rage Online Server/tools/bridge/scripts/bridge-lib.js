'use strict';

// BRIDGE-SPIKE 階段 2 — 共用工具（參考版本，不是可直接載入的 gadget 腳本）。
//
// ⚠️ gadget 的 script 模式是否支援 CommonJS `require()` 未經驗證（見 README「還沒驗證的事」），
// 為了不讓一次載入失敗連累兩支腳本，`bridge-scene.js` 與 `bridge-fire.js`
// 各自把下面這些函式**複製貼上**進檔案開頭，沒有互相 import。
// 這份檔案是「單一事實來源」，改邏輯要三份一起改（這裡 + 兩支腳本裡的複本），
// 這檔案本身不會被 frida-gadget 載入、也不用被載入。
//
// 位址與欄位依據：docs/research/2026-09-22-bridge-spike/stage2-addresses.txt
// （中階 explorer 唯讀反組譯，已用 tools/disasm.py 逐一核對，非猜測；但尚未經跨公司審查）。

// ---- 寫檔：全程 try/catch，讀取失敗或寫不了都不能讓腳本把遊戲弄掛 ----

function nowIso() {
  try {
    return new Date().toISOString();
  } catch (e) {
    return '?';
  }
}

// 一次開檔、寫多行、flush、關閉。呼叫端負責決定「什麼時候」呼叫這個函式——
// hook 的 onEnter 裡絕對不能直接呼叫，只能先把資料留在記憶體，靠 setInterval 定期 flush。
function appendLines(logPath, lines) {
  try {
    const f = new File(logPath, 'a');
    for (let i = 0; i < lines.length; i++) {
      f.write(lines[i] + '\n');
    }
    f.flush();
    f.close();
  } catch (e) {
    // 寫不了就算了，不要讓腳本把遊戲弄掛
  }
}

function appendLine(logPath, msg) {
  appendLines(logPath, ['[' + nowIso() + '] pid=' + Process.id + ' ' + msg]);
}

// ---- 模組基底：找不到就明確記錄並放棄（回傳 null），呼叫端要檢查 ----

function resolveModuleBase(logPath, name) {
  try {
    const base = Module.findBaseAddress(name);
    if (base === null) {
      appendLine(logPath, 'FATAL module not found: ' + name);
    }
    return base;
  } catch (e) {
    appendLine(logPath, 'FATAL findBaseAddress(' + name + ') threw: ' + e);
    return null;
  }
}

// ---- FName 解析鏈（stage2-addresses.txt 段落 B5，逐欄位組語核對過）----
//
// UObject::Name 欄位：obj + 0x24（單一 4-byte 索引，這個引擎版本沒有 index+number 雙欄位）。
// FName::Names（TArray<FNameEntry*>）：Core.dll + 0x1ca6fc，這個位址本身就是 TArray 物件，
//   它的第一個欄位就是 Data 指標，所以對這個位址 readPointer() 一次就拿到 Data。
// entry = Data[index]（4-byte 指標陣列）。
// entry + 0xc 開始是 UTF-16LE、NUL 結尾的字串（FNameEntry 其餘欄位語意未查）。

const FNAME_NAMES_OFFSET = 0x1ca6fc;       // Core.dll 相對 offset
const FNAME_ENTRY_STRING_OFFSET = 0xc;
const UOBJECT_NAME_OFFSET = 0x24;          // 任何 UObject 子類（含 UFunction）都適用

// coreBase：Module.findBaseAddress('Core.dll') 的結果，呼叫端自己快取，不在這裡重解一次。
function fnameIndexToString(coreBase, index) {
  try {
    const namesArrayPtr = coreBase.add(FNAME_NAMES_OFFSET);
    const namesData = namesArrayPtr.readPointer();
    if (namesData.isNull()) return null;
    const entryPtr = namesData.add(index * 4).readPointer();
    if (entryPtr.isNull()) return null;
    return entryPtr.add(FNAME_ENTRY_STRING_OFFSET).readUtf16String();
  } catch (e) {
    return null; // 指標無效就當作「解不出來」，不要往外丟例外
  }
}

function objectName(coreBase, objPtr) {
  try {
    if (objPtr.isNull()) return null;
    const index = objPtr.add(UOBJECT_NAME_OFFSET).readU32();
    return fnameIndexToString(coreBase, index);
  } catch (e) {
    return null;
  }
}

// 匯出（給人看／給未來真的能用 require 時用；目前兩支腳本不依賴這個）。
if (typeof module !== 'undefined') {
  module.exports = {
    nowIso: nowIso,
    appendLines: appendLines,
    appendLine: appendLine,
    resolveModuleBase: resolveModuleBase,
    fnameIndexToString: fnameIndexToString,
    objectName: objectName,
    FNAME_NAMES_OFFSET: FNAME_NAMES_OFFSET,
    FNAME_ENTRY_STRING_OFFSET: FNAME_ENTRY_STRING_OFFSET,
    UOBJECT_NAME_OFFSET: UOBJECT_NAME_OFFSET
  };
}
