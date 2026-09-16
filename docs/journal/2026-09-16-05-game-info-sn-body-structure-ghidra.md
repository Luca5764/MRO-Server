# ✅ `0x00222111` Game_Info_SN body 結構（Ghidra 反編譯確認）

> 從 docs/opcode-ledger.md 第 950–1002 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-16。已安裝 Ghidra 12.1.3，`ZDispatchWaiting::Game_Info_SN`（`0x107f0910`）反編譯結果：

```c
iVar9  = *(int    *)(pkt + 0x10);   // body+0x00
uVar7  = *(ushort *)(pkt + 0x14);   // body+0x04
uVar8  = *(ushort *)(pkt + 0x16);   // body+0x06
uVar2  = *(ushort *)(pkt + 0x1a);   // body+0x0A
uVar3  = *(ushort *)(pkt + 0x1c);   // body+0x0C
uVar10 = *(byte   *)(pkt + 0x1e);   // body+0x0E
local_10 = (*(short *)(pkt + 0x1f) == 2);   // body+0x0F，與 2 比較後的布林
uVar6  = *(ushort *)(pkt + 0x21);   // body+0x11
uVar4  = *(ushort *)(pkt + 0x23);   // body+0x13
uVar5  = *(ushort *)(pkt + 0x26);   // body+0x16

Game_Info_Set(this, iVar9, uVar3, uVar10, ?, uVar2, uVar6, local_10, uVar4, uVar5, arg3);
Game_Info_Team_Set(this, uVar7, uVar8);
```

而 `Game_Info_Set`（`0x1072cca0`）的寫入：

```c
*(this + 0xfc0) = param_2;   // ← body+0x00
*(this + 0xfc8) = param_7;   // ← body+0x11  地圖 ID
*(this + 0xfc4) = 由 param_3/param_4 組成的旗標位元
*(this + 0xfe0) = param_5;
*(this + 0xfe4) = param_6;   // ← body+0x0A
*(this + 0xfd4) = param_8;   // ← (body+0x0F == 2) 的布林值
*(this + 0xfd8) = param_9;   // ← body+0x13
*(this + 0xfdc) = param_10;  // ← body+0x16
*(this + 0xfd0) = param_11;
```

| body | 型別 | 去向 |
|---|---|---|
| `0x00` | uint32 | `[0xfc0]` |
| `0x04` | uint16 | `Game_Info_Team_Set` 第 1 參數（**紅隊**） |
| `0x06` | uint16 | `Game_Info_Team_Set` 第 2 參數（**藍隊**） |
| `0x0A` | uint16 | `[0xfe4]` |
| `0x0C` | uint16→byte | `[0xfc4]` 旗標 bit 0 |
| `0x0E` | uint8 | `[0xfc4]` 旗標 bit 1 |
| `0x0F` | uint16 | **與 2 比較**，結果的布林寫進 `[0xfd4]` |
| **`0x11`** | **uint16** | **`[0xfc8]` 地圖 ID** ✅ |
| `0x13` | uint16 | `[0xfd8]` |
| `0x16` | uint16 | `[0xfdc]` |

**確認我方 2026-09-16 的修正正確**：地圖 ID 改寫於 `0x11`、紅藍隊在 `0x04`／`0x06`。

⚠️ **更正先前引用的說法**：`[0xfd4]` / `[0xfd8]` / `[0xfdc]` 對應 MaxPlayers / GoalScore / TimeLimit 是 Gemini 的推測，反編譯**不支持**——`[0xfd4]` 收到的是一個布林值。URL 裡的 `MaxPlayers=1` 很可能就是我方送 `body+0x0F = 2` 造成布林為真。

---

