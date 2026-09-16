# ✅ `0x00220226` Map_Change_All_SN — body 結構已由反組譯確認

> 從 docs/opcode-ledger.md 第 773–804 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-15。先前依「與 `User_Default_SN` 慣例一致」的推論把記錄起點從 `0x06` 改到 `0x02`，現已反組譯 `ZDispatchRoom::Map_Change_All_SN`（`0x107ebab0`）確認**推論正確**：

```x86
movzx ecx, byte ptr [eax + 0x10]   ; body+0x00  旗標 → [edi+0x24]
movzx edx, byte ptr [eax + 0x11]   ; body+0x01  筆數 → [edi+0x2c]
lea   esi, [eax + 0x16]            ; 記錄游標 = body+0x06
...
movzx ecx, word  ptr [esi - 4]     ; 記錄+0x00 (uint16) → mapId
movzx edx, word  ptr [esi - 2]     ; 記錄+0x02 (uint16)
movzx eax, byte  ptr [esi]         ; 記錄+0x04 (uint8)   ← 選中旗標
movzx ecx, word  ptr [esi + 1]     ; 記錄+0x05 (uint16)
movzx edx, word  ptr [esi + 3]     ; 記錄+0x07 (uint16)
```

`esi` 指向記錄的第 4 個 byte，故**第一筆記錄始於 `body+0x02`**，每筆 **9 bytes**。

| body | 型別 | 欄位 |
|---|---|---|
| `0x00` | uint8 | 旗標 |
| `0x01` | uint8 | 筆數 |
| `0x02 + i*9` | uint16 LE | **Map ID** |
| `+0x02` | uint16 LE | 未知 |
| `+0x04` | uint8 | 選中 |
| `+0x05` | uint16 LE | 未知 |
| `+0x07` | uint16 LE | 未知 |

緊接其後的 `cmp [ecx], ebx` / `add ecx, 0xbc` 是 Cache.Bin table 1 的查表（stride `0xBC`），比對記錄中的值與 `entry[0]`——**再次確認該欄位是 Map ID，不是任何自訂索引**。

---

