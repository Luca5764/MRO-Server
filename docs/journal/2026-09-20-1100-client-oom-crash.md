# 客戶端夜間當機：虛擬記憶體不足（2026-09-20）

- [OBS][SHOT] 操作者早上看到客戶端的「致命錯誤」對話框：
  - `虛擬記憶體耗不足。為避免此問題，需確保硬碟有充分的空間。`
  - 堆疊：`FMalloc Windows::Malloc ← FMalloc Windows::Realloc ← 7FE80000 67608 FArray ← FArray::Realloc ← 2817*24 ← FCanvasUtil::DrawTileInterface_ED ← UCanvas::Flush_BD ← FPlayerSceneNode::Render ← UGameEngine::Draw ← UWindowsViewport::Repaint ← UWindowsViewport::Tick ← ClientTick ← UGameEngine::Tick ← UpdateWorld ← MainLoop ← FMalloc Windows::Free`
  - Build MR_Build_[2009-12-10_09.30]，2047MB RAM（32 位元行程的位址空間上限）。
- 發生時間點：夜間無人跑完最後一場（護送 9007，`journal/2026-09-20-0110-escort-smoke.md`）之後。客戶端 log 末尾停在 EndGame → 回機庫（`Browse: Store_01?Game=ZModeHangar.HangarGameInfo`），之後就是崩潰對話框；log 沒有寫出致命錯誤（緩衝沒 flush）。證據存在 `tools/pico/logs/crash-20260920-110426-overnight-oom/`。
- 🟡 假設：這個客戶端是 32 位元行程，位址空間 2GB。夜間連續跑了 5 場以上（全場 PvE ×3、護送 ×2）＋商店切換，反覆載入／卸載關卡可能累積記憶體碎片或洩漏，最後在畫面繪製的配置上失敗。單場手動遊玩不會這麼快遇到。
- 對無人時段的影響：**每晚的套件要限制連續場次**，或每 N 場就計畫性重開一次客戶端。建議先設 N=3，實測後再調整。
- 待辦：
  - 量一下客戶端行程的記憶體用量隨場次增加的變化（`client_ctl status` 可以加印 WorkingSet／VirtualSize）；
  - runner 在每場結束後記錄一次記憶體數字，超過門檻就自己收尾、重開。
