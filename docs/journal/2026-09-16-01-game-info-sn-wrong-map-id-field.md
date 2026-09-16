# ★★★ 崩潰的真正原因：`Game_Info_SN` 的地圖 ID 寫錯欄位

> 從 docs/opcode-ledger.md 第 813–859 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-16。**從頭到尾都是同一個欄位錯位。**

### 因果鏈（全部反組譯確認）

1. `Game_Info_URL_Get`（`0x10733cf0`）以 `[esi+0xfc8]` 的值走訪 Cache.Bin table 1（stride `0xBC`）比對 `entry[0]`。查不到就記錄 `Failed - MapIndex : %d` 並留下空 URL。
2. 全 DLL **只有一處**寫入 `[esi+0xfc8]`：`Game_Info_Set`（`?Game_Info_Set@UZNetwork_DJ@@QAEXH_N0HHHHHHH@Z`，`0x1072cca0`）的 **第 6 個參數**。
3. `Game_Info_Set` 只有兩個呼叫點，其一在 `ZDispatchWaiting::Game_Info_SN`（`0x107f0949`，opcode **`0x00222111`**）。
4. 該 handler 的第 6 個參數來自 `ebx`，而 `ebx` 來自 `movzx ebx, word ptr [eax + 0x21]` —— 即 **body+0x11**。

### `0x00222111` Game_Info_SN body 結構

| body | 型別 | 用途 |
|---|---|---|
| `0x00` | uint32 LE | → `[this+0xfc0]` |
| `0x04` | uint16 LE | 未知（推測紅隊索引） |
| `0x06` | uint16 LE | 未知（推測藍隊索引） |
| `0x0A` | uint16 LE | 未知 |
| `0x0C` | uint16 LE | 未知 |
| `0x0E` | uint8 | 未知（clan flag？） |
| `0x0F` | uint16 LE | **必須等於 2**（`cmp word ptr [eax+0x1f], 2` + `sete`） |
| **`0x11`** | **uint16 LE** | **地圖 ID** → `[this+0xfc8]` |
| `0x13` | uint16 LE | 未知 |
| `0x15` | uint8 | 未知 |
| `0x16` | uint16 LE | 未知 |
| `0x18` | uint16 LE | 未知 |

body 總長 `0x1A`，與我方既有實作一致。

### 我方的錯誤

```js
body.writeUInt16LE(mapId,     0x0A);   // 地圖 ID 寫在無關欄位
body.writeUInt16LE(userIndex, 0x11);   // 地圖 ID 的欄位被塞進 userIndex (=1)
```

客戶端於是拿 **1** 去查 Cache.Bin。合法 Map ID 是 `0, 101, 102, 1011, ... 9012`，沒有 1。查表失敗 → `ZPage_Room` 退回目前關卡 `Store_01` + `ZModeHangar.HangarGameInfo` + `team=255` → `ClientTravel` 到已載入的關卡 → `DestroyActor(HangarPlayerController)` 崩潰。

**已修**：地圖 ID 改寫於 `0x11`。`[TEST]` 逐欄驗證輸出，`body+0x11` 讀回 9001、`body+0x0F` 讀回 2。

> 這也解釋了為什麼先前所有修正都沒能阻止崩潰：真實 Map ID、房主、使用者陣列、地圖清單 header——那些都是真實且必要的修正，但**這一個欄位一直是錯的**，而它單獨就足以觸發整條 fallback。

⬜ `m_MapInfoList` 為 0 是另一個獨立問題（地圖選單清單），與崩潰無關。

---

