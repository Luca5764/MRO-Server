# Item names (Cache.Bin → 客戶端顯示名稱)

由 `tools/item-names.py --regen-doc` 產生，來源與偏移見該檔案開頭的註解與
`docs/journal/2026-09-18-19-item-names.md`。只列 HighGroup 1–6（機體／主武器／
副武器／推進器／駕駛員／塗裝）的**代表項**（`RepresentIndex == ItemIndex`），
期限變體（如 `22100102`..`22100108`）已省略；查完整清單/期限變體/其他 HighGroup
（消耗品、卡片等）用 `tools/item-names.py <id>` 或 `tools/item-names.py <文字片段>`。

重新產生：`cd "Metal Rage Online Server" && python3 tools/item-names.py --regen-doc`

## HighGroup 1（機體）

| ItemIndex | 名稱 | ClassName |
|---|---|---|
| `11100101` | 鐵鬼 | `ZMechanic.SA01m` |
| `11200101` | RAVEN | `ZMechanic.SA02m` |
| `12100101` | 鋼牙 | `ZMechanic.AA01m` |
| `12200101` | CRUAL MASSACRE | `ZMechanic.AA02m` |
| `13100101` | 劍虎 | `ZMechanic.HA01m` |
| `13200101` | VALKYRIE | `ZMechanic.HA02m` |
| `14200101` | 判官 | `ZMechanic.NB01m` |
| `14300101` | PHANTOM | `ZMechanic.NB02m` |
| `15200101` | 聖戰士 | `ZMechanic.TB01m` |
| `15300101` | ZODIAC | `Zmechanic.TB02m` |
| `16200101` | 雷霆 | `ZMechanic.BB01m` |
| `16300101` | ROXANNE | `ZMechanic.BB02m` |
| `17100101` | 智多星 | `ZMechanic.EA01m` |
| `17200101` | FENRIS | `ZMechanic.EA02m` |
| `18100101` | 觀星者 | `ZMechanic.OA01m` |
| `18200101` | SPECTOR" | `ZMechanic.OA02m` |

## HighGroup 2（主武器）

| ItemIndex | 名稱 | ClassName |
|---|---|---|
| `21100101` | 鷹式榴彈砲 | `Zweapon.MOC_a` |
| `21200101` | 無偏差加農砲 | `Zweapon.MNC_a` |
| `21200201` | 多指向加農砲 | `Zweapon.MNC_b` |
| `21200301` | 無偏差重型加農砲 | `Zweapon.MNC_c` |
| `21200401` | 多管加農砲 | `Zweapon.MNC_d` |
| `21200501` | 強化主動式加農砲 | `Zweapon.MNC_e` |
| `21300101` | 重型強化迫擊砲 | `Zweapon.MMC_a` |
| `21300201` | 重型火力強化迫擊砲 | `Zweapon.MMC_b` |
| `21300301` | 文森重型加農砲 | `Zweapon.MMC_I` |
| `21500101` | 雷音加農砲 | `Zweapon.MRC_a` |
| `22100101` | 輕量型來福機槍 | `Zweapon.MOM_a` |
| `22100201` | 重型來福機槍 | `Zweapon.MOM_b` |
| `22100301` | 自動機槍 | `Zweapon.MOM_c` |
| `22200101` | 高速格林機槍 | `Zweapon.MOV_a` |
| `22200201` | 重裝型格林機槍 | `Zweapon.MNV_a` |
| `22200301` | 高級格林機槍砲 | `Zweapon.MOV_b` |
| `22300201` | 颶風迫擊砲 | `Zweapon.MOS_a` |
| `22500101` | 暴風式連發機槍 | `Zweapon.MAM_a` |
| `22600101` | 量子雷射砲 | `Zweapon.MOL_a` |
| `23100201` | 穿甲火箭筒 | `Zweapon.MOR_b` |
| `23200101` | 特級微型火箭彈 | `Zweapon.MNR_a` |
| `23200201` | 怒火微型飛彈 | `Zweapon.MNR_I` |
| `24100101` | 高階即時火力狙擊砲 | `Zweapon.MSC_a` |
| `24100201` | 即時火力狙擊砲 | `Zweapon.MSC_b` |
| `24100301` | 進階即時火力狙擊砲 | `Zweapon.MSC_c` |
| `24100501` | 閻黑進階版即時火力狙擊砲 | `Zweapon.MSC_J` |
| `24300101` | 絕對武力狙擊砲 | `Zweapon.MSG_a` |
| `25100101` | 遠距支援型曲射砲 | `Zweapon.MLH_a` |
| `25200101` | 死亡暴風榴彈砲 | `Zweapon.MNH_a` |
| `25300101` | 輕型彈跳爆裂彈 | `Zweapon.MTE_a` |
| `25300201` | 重型彈跳爆裂彈 | `Zweapon.MTE_b` |
| `25300301` | 進階型彈跳爆裂彈 | `Zweapon.MTE_c` |
| `25300401` | 戰錘彈跳爆裂彈 | `Zweapon.MTE_d` |
| `25300501` | 九頭蛇彈跳爆裂彈 | `Zweapon.MTE_I` |
| `26300101` | 奪魂鋸 | `Zweapon.MSA_a` |
| `26300201` | 絕殺電擊鋸 | `Zweapon.MSA_b` |
| `26500101` | 虎克迫擊砲 | `Zweapon.MHA_a` |
| `26500201` | 輕型火焰發射器 | `Zweapon.MFF_a` |
| `26500301` | 中型火焰發射器 | `Zweapon.MFF_b` |
| `28100101` | 自動防禦機槍塔 | `Zweapon.MAT_a` |
| `28200101` | 雷射自動防禦砲塔 | `Zweapon.MLT_a` |
| `28200201` | 高速防禦機槍砲塔 | `Zweapon.MAT_b` |
| `28200301` | 死光自動防禦砲塔 | `Zweapon.MLT_b` |
| `28300101` | 大天使無人偵察機 | `Zweapon.MPF_a` |
| `28300201` | 天鷹無人攻擊型偵察機 | `Zweapon.MPF_b` |
| `28300301` | 二代天使偵察機 | `Zweapon.MPF_c` |
| `28400101` | 飛彈防禦砲塔 | `Zweapon.MMT_a` |

(15 個 ItemIndex 在 GameItemRecord 中屬於這個 HighGroup 且是代表項，但對應的 Spec*Record 表沒有這筆資料，猜測是未上線/保留的道具位：`21100201`, `21200601`, `21200701`, `21200801`, `21500201`, `22100401`, `22100501`, `22500201`, `23100101`, `23100301`, `24100401`, `24300201`, `25200201`, `25300601`, `26500401`)

## HighGroup 3（副武器）

| ItemIndex | 名稱 | ClassName |
|---|---|---|
| `31100101` | 輕型主動式加農砲 | `Zweapon.AOC_a` |
| `31100201` | 動力輔助型加農砲 | `Zweapon.AOC_b` |
| `32100101` | 簡易機槍 | `Zweapon.AOM_a` |
| `32100201` | 輕型機槍 | `Zweapon.AOM_b` |
| `33100101` | 輔助火箭發射器 | `Zweapon.AOR_a` |
| `33300101` | 多重輔助火箭發射器 | `Zweapon.ANR_a` |
| `33300201` | 感熱式火箭發射器 | `Zweapon.AOG_a` |
| `33300301` | 多重感熱式火箭發射器 | `Zweapon.ANG_a` |
| `33300401` | 多重火箭發射器 | `Zweapon.ANR_I` |
| `33500101` | 多頭火箭發射器 | `Zweapon.AMR_a` |
| `33500201` | 網式火箭發射器 | `Zweapon.ATR_a` |
| `33800101` | 進階多重火箭發射器 | `Zweapon.ANR_z` |
| `33800201` | 進階多頭火箭發射器 | `Zweapon.AMR_z` |
| `35100101` | 火狐榴彈砲 | `Zweapon.ACH_a` |
| `35100201` | 強力虎式榴彈砲 | `Zweapon.ACH_b` |
| `38500101` | 地雷設置器 | `Zweapon.AFM_a` |
| `38500201` | 魔鬼地雷設置器 | `Zweapon.ARM_a` |
| `38500301` | 獵人陷阱裝置器 | `Zweapon.ATA_a` |
| `38500401` | 蝮蛇陷阱誘捕器 | `Zweapon.ATA_I` |
| `39100101` | EMP | `Zweapon.AEF_a` |
| `39400101` | 煙霧彈 | `Zweapon.AIF_a` |
| `39500101` | 閃光彈 | `Zweapon.AGF_a` |
| `39700101` | 電子干擾彈 | `Zweapon.ANF_a` |

(1 個 ItemIndex 在 GameItemRecord 中屬於這個 HighGroup 且是代表項，但對應的 Spec*Record 表沒有這筆資料，猜測是未上線/保留的道具位：`33500301`)

## HighGroup 4（推進器）

| ItemIndex | 名稱 | ClassName |
|---|---|---|
| `41100101` | 電漿推進器 | `Zweapon.BPE_a` |
| `41200101` | 氫氣推進器 | `Zweapon.BHE_a` |
| `41200201` | 高壓氫氣推進器 | `Zweapon.BHE_i` |
| `41300101` | 奈米推進器 | `Zweapon.BNE_a` |
| `42100101` | 修復用機械手臂 | `Zweapon.ADA_a` |
| `43100101` | 防護機械手臂 | `ZWeapon.ABA_a` |
| `43100201` | 建設裝備2號 | `Zweapon.ABA_b` |

(2 個 ItemIndex 在 GameItemRecord 中屬於這個 HighGroup 且是代表項，但對應的 Spec*Record 表沒有這筆資料，猜測是未上線/保留的道具位：`41100201`, `41300201`)

## HighGroup 5（駕駛員）

| ItemIndex | 名稱 | ClassName |
|---|---|---|
| `51100101` | 瓦昆．貝斯 | `` |
| `51100201` | 魯卡斯．韋恩 | `` |
| `51100501` | 傑佛瑞．卡迪隆 | `` |
| `51100601` | 丹．維德 | `` |
| `51100701` | 詹姆士．布萊德 | `` |
| `51100801` | 亞歷山大．羅培茲 | `` |
| `51100901` | Rashid Tyron | `` |
| `51500101` | 基本駕駛員 | `` |
| `51600101` | 基本駕駛員 | `` |
| `51800101` | 魯卡斯+10%EXP | `` |
| `51800201` | 傑佛瑞+10%EXP | `` |
| `51800301` | 丹．維德+10%EXP | `` |
| `51800401` | 詹姆士+10%EXP | `` |
| `51800501` | 亞歷山大+10%EXP | `` |
| `52100101` | Tae Lim Lee | `` |
| `52100201` | 凱拉．摩根 | `` |
| `52100401` | 瑞秋．貝斯 | `` |
| `52100501` | Rebecca Moceanu | `` |
| `52100601` | Tae Lim Lee | `` |
| `52100701` | Tae Lim Lee + 10% | `` |
| `52100801` | Tae Lim Lee + 10% | `` |
| `52800101` | 瑞秋+10%EXP | `` |

## HighGroup 6（塗裝）

| ItemIndex | 名稱 | ClassName |
|---|---|---|
| `61100101` | 鋼牙基本塗裝 | `` |
| `61100201` | RAVEN基本塗裝 | `` |
| `61100301` | CRUAL MASSACRE塗裝 | `` |
| `61100401` | VALKYRIE基本塗裝 | `` |
| `61100501` | PHANTOM基本塗裝 | `` |
| `61100601` | ZODIAC基本塗裝 | `` |
| `61100701` | ROXANNE基本塗裝 | `` |
| `61100801` | FENRIS基本塗裝 | `` |
| `61100901` | SPECTOR基本塗裝 | `` |
| `61101001` | 鐵鬼基本塗裝 | `` |
| `61101101` | 觀星者基本塗裝 | `` |
| `61101201` | 判官基本塗裝 | `` |
| `61101301` | 聖戰士基本塗裝 | `` |
| `61101401` | 智多星基本塗裝 | `` |
| `61101501` | 雷霆基本塗裝 | `` |
| `61101601` | 劍虎基本塗裝 | `` |
| `61200101` | 迷彩藍 | `camoTBE` |
| `61200201` | 迷彩棕 | `camoTBN` |
| `61200301` | 迷彩淡綠 | `camoTGN` |
| `61200401` | 迷彩深綠 | `camoTGN2` |
| `61200501` | 迷彩銀 | `camoTGY` |
| `61200601` | 迷彩紅 | `camoTRD` |
| `61200701` | 淡藍 | `camoTBE2` |
| `61200801` | 迷彩灰 | `camoTGY2` |
| `61200901` | 豹紋藍 | `leopardTBE` |
| `61201001` | 豹紋棕 | `leopardTBN` |
| `61201101` | 豹紋淡綠 | `leopardTGN` |
| `61201201` | 豹紋深綠 | `leopardTGN2` |
| `61201301` | 豹紋銀 | `leopardTGY` |
| `61201401` | 豹紋紅 | `leopardTRD` |
| `61300101` | 小藍圓點 | `dotTBE` |
| `61300201` | 小棕圓點 | `dotTBN` |
| `61300301` | 小淡綠圓點 | `dotTGN` |
| `61300401` | 小深綠圓點 | `dotTGN2` |
| `61300501` | 小銀圓點 | `dotTGY` |
| `61300601` | 小紅圓點 | `dotTRD` |
| `61300701` | 斑馬藍 | `zbraTBE` |
| `61300801` | 斑馬棕 | `zbraTBN` |
| `61300901` | 斑馬淡綠 | `zbraTGN` |
| `61301001` | 斑馬深綠 | `zbraTGN2` |
| `61301101` | 斑馬銀 | `zbraTGY` |
| `61301201` | 斑馬紅 | `zbraTRD` |
| `61301301` | 藍白相間 | `whiteotherTBE` |
| `61301401` | 棕白相間 | `whiteotherTBN` |
| `61301501` | 淡藍白相間 | `whiteotherTGN` |
| `61301601` | 深藍白相間 | `whiteotherTGN2` |
| `61301701` | 銀白相間 | `whiteotherTGY` |
| `61301801` | 紅白相間 | `whiteotherTRD` |
| `61301901` | 虎斑藍 | `tigerTBE` |
| `61302001` | 虎斑棕 | `tigerTBN` |
| `61302101` | 虎斑淡綠 | `tigerTGN` |
| `61302201` | 虎斑深綠 | `tigerTGN2` |
| `61302301` | 虎斑銀 | `tigerTGY` |
| `61302401` | 虎斑紅 | `tigerTRD` |
| `61302501` | 迷彩金 | `camoTGD02` |
| `61302601` | 環形紅 | `circleTRD01` |
| `61302801` | 黑線條 | `lineTBK01` |
| `61302901` | 綠線條 | `lineTGN01` |
| `61303001` | 淡綠線條 | `lineTGN02` |
| `61303101` | 深綠線條 | `lineTGN03` |
| `61303201` | 灰線條 | `lineTGY01` |
| `61303301` | 紅線條 | `lineTRD01` |
| `61303401` | 棕線條 | `lineTRD02` |
| `61303501` | 黃線條 | `lineTYW01` |
| `61303601` | 金屬金 | `MetalTGD01` |
| `61303701` | 金屬銀 | `MetalTGY01` |
| `61303801` | 斑點白 | `SpotTBE01` |
| `61303901` | 斑點黃 | `SpotTGY01` |
| `61304001` | 斑點紅 | `SpotTRD01` |
| `61304101` | 斑馬紅 | `zbraTBE01` |
| `61304201` | 斑馬綠 | `zbraTGN01` |
| `61304301` | 斑點藍 | `SpotTBE01` |
| `61400101` | 藍線條EXP15% | `lineTBE01` |
| `61400201` | 迷彩卡其 | `camoTBN01` |
| `61400301` | 斑點黑 | `SpotTBK01` |
| `61400401` | 斑點血 | `SpotTRD01` |
| `61800101` | 豹紋藍EXP10% | `leopardTBE` |
| `61800201` | 豹紋紅EXP10% | `leopardTRD` |
| `61800301` | 豹紋棕EXP10% | `leopardTBN` |
| `61800401` | 豹紋淡綠EXP10% | `leopardTGN` |
| `61800501` | 迷彩藍EXP10% | `camoTBE` |
| `61800601` | 迷彩紅EXP10% | `camoTRD` |
| `61800701` | 迷彩深綠EXP10% | `camoTGN2` |
| `61800801` | 迷彩灰EXP10% | `camoTGY2` |
| `61800901` | 斑馬紅EXP10% | `zbraTRD` |
| `61801001` | 虎斑藍EXP10% | `tigerTBE` |
| `61801101` | 斑馬銀EXP10% | `zbraTGY` |
| `61801201` | 豹紋銀EXP10% | `leopardTGY` |
| `61801301` | 虎斑紅EXP10% | `tigerTRD` |
| `61801401` | 迷彩淡藍EXP10% | `camoTBE2` |
| `61801601` | 紅線條EXP10% | `lineTRD01` |
| `61801701` | 黃線條EXP%10 | `lineTYW01` |
| `61801801` | 藍線條EXP%10 | `lineTBE01` |
| `62100101` | 黃金塗裝EXP10% | `GD` |
| `62100201` | 골드스킨EXP10% | `GD` |

## 其他 HighGroup

HighGroup 8（卡片）在 `CacheManager.GetSpecItemName`（Engine/CacheManager.uc:1289-1309）的 `case 8` 是註解掉的，所以客戶端對卡片一律拿不到名稱（本表也一樣，代表項全部 unnamed，略過不列）。HighGroup 7、9（消耗品/禮包等）落在 `default` 分支，會查 SpecEtcRecord，本工具已一併解析，可用 `tools/item-names.py <id>` 或關鍵字查。

