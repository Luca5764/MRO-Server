# ✅ `0x00420115` Ready_Host_SN — ClientTravel URL 被截斷導致客戶端崩潰

> 從 docs/opcode-ledger.md 第 308–359 行原文搬遷（2026-09-17），內容未改動。之後的更正以追加方式寫在本檔末尾或新的日誌。

`[TEST]` 2026-09-15。**第一次讓客戶端真正執行 `ClientTravel`。**

戰役房按下「遊戲開始」後的完整序列：

```
371.557s  C-->S 0x00222103 (5b)   270a000000
371.558s  S-->C 0x00420113 (6b)   Ready_Host_SQ
371.909s  S-->C 0x00222111 (26b)
371.959s  S-->C 0x00222102 (6b)   Game_Ready_SN
372.060s  S-->C 0x00222104 (6b)   Game_Start_SN
372.060s  S-->C 0x00420111 (0b)   Game_Wait_SN
372.160s  S-->C 0x00420115 (19b)  ← ClientTravel 目標
372.222s  C-->S 0x00420114 (8b)   000000000000bb78
372.222s  S-->C 0x00420116 (16b)
378.225s  S-->C 0x00230152 (16b)  00000000 + "Map_PC01"
```

### body 結構

| Offset | 型別 | 內容 |
|---|---|---|
| 0x00 | uint16 **LE** | port（觀察值 `bb78` = 30907） |
| 0x02 | uint8 | 0 |
| 0x03 | ASCII | `IP/MapName`，以 `\0` 結尾 |

### 崩潰原因

body 寫死 `0x13`（19 bytes），扣掉前 3 bytes 只剩 16 給字串，而寫入又被 `Math.min(..., 0x10)` 再壓一次。`127.0.0.1/Map_PC01` 需要 19 bytes（含結尾），實際送出的是：

```
bb78003132372e302e302e312f4d61705f5043
          1 2 7 . 0 . 0 . 1 / M a p _ P C     ← 少了 "01"，且無結尾
```

客戶端拿著不存在的地圖名 `Map_PC` 執行 `ClientTravel`，`LoadMap` 失敗，崩在拆除機庫關卡時：

```
Actor not found: HangarPlayerController Store_01.HangarPlayerController
ULevel::DestroyActor <- DissociateViewports_BD <- UGameEngine::LoadMap
  <- LocalMapURL <- UGameEngine::Browse <- ClientTravel
```

**已修**：`READY_HOST_SN_URL_MODE = 'fit'` 依字串長度決定 body 大小（此例為 `0x16`）。`'fixed_0x13'` 可回退。

`[TEST]` 以 `fixed_0x13` 重建出的 hex 與上線觀察到的完全一致，確認重建忠實；`fit` 產生 `bb78003132372e302e302e312f4d61705f5043303100`，字串完整且有結尾。

⬜ **真實封包是否為變動長度仍屬未知。** 也可能原廠的字串欄位更大且固定，或 IP 與地圖名分屬不同封包——`0x00230152` 在 6 秒後才送出完整的 `Map_PC01`，順序上很可疑。若客戶端拒收變動長度，改回 `'fixed_0x13'` 並改試放大固定值。

---

