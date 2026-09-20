# 投射物的可見外觀是怎麼產生的（2026-09-20，explorer）

## 結論
- 投射物**本體的模型／DrawType 在腳本裡設不到**：父類 `W_DefaultWeaponProjectile` 沒有對應的 .uc（只有編譯後的版本），`ZBaseWeapon/`、`ZBase/` 下 grep `DrawType=`／`Mesh=` 都是零。⬜ 要看二進位的預設屬性才知道。
- 腳本裡確認的額外特效：`StartProj()` 生成 SmokeTrail（[SRC] `ZBaseWeapon/BaseProjectile_Proj.uc:14-28`）、`StartProjTwo()` 生成第二段拖尾（`:38-87`）。兩者只受 `Level.NetMode != NM_DedicatedServer` 限制，任何真實客戶端都會跑。
- **飛行中的投射物沒有任何依觀看者而定的隱藏條件**（沒有 relevance／LOD／`bHidden`／`LastRenderTime` 判斷包住 `Spawn()` 或那兩個特效）。→「有生成但某一台看不到」這個說法在腳本層找不到支持（本體模型仍 ⬜）。
- **唯一確認的觀看者相關條件在爆炸特效**：`Explode()` 的傷害計算在 `if (bMyProj)` 內、不受相關性影響（`:312-317`），但 `SpawnExpEffectNDecal()` 開頭就是 `if (!EffectIsRelevant(HitLocation,false)) return;`（`:473,586`）。`EffectIsRelevant`（[SRC] `Engine/Actor.uc:2434-2460`）會看本地玩家的視角、距離、`LastRenderTime`。
  - → **看向別處或距離遠的人，可能看不到爆炸特效，但傷害照樣成立**。爆炸音效不在這個判斷裡（`:487,493`）。
- 開槍者的音效、動畫、彈藥扣減都是本機預測，在 RPC 來回之前就發生（韓文註解 [SRC] `ZBase/W_DefaultMechForWeapon.uc:912,1298,1326,1404,1435`）。→ **開槍者無法用「有沒有聲音／彈藥有沒有扣」分辨自己那顆有沒有生成。**

## 對測試的意義
- 被打的一方如果「掉血但完全沒有爆炸特效」，那是上面那個 `EffectIsRelevant` 條件，正常現象、嚴重度低。
- 飛行中的投射物完全看不到，就不是這個機制，要回到「沒生成」那條線（H-SPAWN-FAIL／H-RPC-DROP）。

## 附註
2026-09-20 深夜的新假設 H-SPAWN-FAIL（生成點卡在自己機體裡）還沒查：投射物的碰撞設定、`Spawn()` 回 None 時腳本怎麼走、前推距離 `fBetweenProjNWep` 的值。留給下一輪。
