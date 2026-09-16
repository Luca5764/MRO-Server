# 下一輪要測的:伺服器驅動開戰(server-driven start)

## 一句話
房主按 F5 直接 travel 走不通(結構上 `[0xfc8]` 在房間場景設不了,見 opcode-ledger)。
改由伺服器在收到開始請求後,先把客戶端推進場景 6、再送地圖。這是**試打**,不保證成功。

## 怎麼開啟
`Metal Rage Online Server/dispatch/gate.game.dispatch.js` 最上面:
```js
const SERVER_DRIVEN_START_MODE = 'disabled';  // 改成 'enabled'
```
改完**重啟伺服器**(舊的 node 要先關掉)。

## 怎麼測
1. 登入 → 建**戰役房**(協力模式) → 停在房間
2. 按 **遊戲開始(F5)**
3. 讓客戶端跑完(進遊戲 or 崩潰都可),**崩潰的話按 confirm 讓 log 寫完**

## 怎麼判斷
看客戶端 log `C:\Games\MetalRage Online\data\Log\MetalRage.log` 裡的:
```
ScriptLog: [ ZPage_Room ][ GameStart ]  start ???
```
- `start Map_PC01?...?Game=ZModePve.ZModePve`  → **成功**,地圖對了
- `start Store_01?...?ZModeHangar`             → 還是老樣子,伺服器沒搶贏客戶端的 F5 travel

不管哪個,把那行給 Claude(或直接說「測了」讓它自己讀)。

## 如果沒用
表示客戶端 F5 的同步 travel 搶在伺服器前面,伺服器端無解。
下一步會是:客戶端側(改 ini / 研究 ZPage_Room),或接受「房主開戰」這條路走不通、
改試別的進戰鬥方式。細節在 docs/opcode-ledger.md「開戰機制的完整靜態分析」那節。

## 回退
把 `SERVER_DRIVEN_START_MODE` 改回 `'disabled'`,重啟。房間功能不受影響。
