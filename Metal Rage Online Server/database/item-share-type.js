// E1 (docs/design/e1-item-ownership.md, docs/backlog.md): GameItemRecord.ShareType
// decides whether an owned serial can be equipped on more than one mech at
// once (IsShare, ZPage_Hangar.uc:505-509 / :917-924 ItemFree()). This module
// loads it once from Cache.Bin, the same way dispatch/room.dispatch.js's
// loadCacheIndexByItemId() already loads GameItemRecord for the shop
// (GAME_ITEM_RECORD_TABLE_START/ENTRY_SIZE/COUNT are the same constants,
// cross-checked there against 2112/2112 records having a valid SellType
// length byte -- docs/research/2026-09-19-e1-item-ownership/output.txt).
// Kept as its own small module (not exported from room.dispatch.js) so
// database/db.js does not have to require a dispatch/ file.
//
// [CACHE] ShareType offset: GAME_ITEM_RECORD_TABLE_START + i*0x67 + 0x4F
// (docs/design/e1-item-ownership.md section 1). UseTime offset (+0x43) is
// not a new claim -- it is the same anchor room.dispatch.js's
// loadCacheIndexByItemId() already reads as "periodSeconds" for the shop's
// SHOP_PERIOD_REPRESENTATIVE_MODE (docs/research/2026-09-18-shop-item-period).
// 🟡 未經跨公司審查.

const fs = require('fs');
const path = require('path');

const GAME_ITEM_RECORD_TABLE_START = 0x2294;
const GAME_ITEM_RECORD_ENTRY_SIZE = 0x67;
const GAME_ITEM_RECORD_COUNT = 2112;
const SHARE_TYPE_OFFSET = 0x4F;
const USE_TIME_OFFSET = 0x43;

// null = not loaded yet; {} on load failure (getters then default to 0).
let shareTypeByItemId = null;
let useTimeByItemId = null;

function findCacheBinPath()
{
    let searchDir = __dirname;
    for (let i = 0; i < 10; i++) {
        const parent = path.dirname(searchDir);
        if (parent === searchDir) break;
        searchDir = parent;
        const candidate = path.join(searchDir, 'MetalRage', 'Data', 'System', 'Cache.Bin');
        if (fs.existsSync(candidate)) return candidate;
    }
    let cwdDir = process.cwd();
    for (let i = 0; i < 10; i++) {
        const candidate = path.join(cwdDir, 'MetalRage', 'Data', 'System', 'Cache.Bin');
        if (fs.existsSync(candidate)) return candidate;
        const parent = path.dirname(cwdDir);
        if (parent === cwdDir) break;
        cwdDir = parent;
    }
    const homeDir = require('os').homedir();
    const desktopCandidate = path.join(homeDir, 'Desktop', 'MetalRage', 'Data', 'System', 'Cache.Bin');
    if (fs.existsSync(desktopCandidate)) return desktopCandidate;
    return null;
}

function loadTables()
{
    shareTypeByItemId = {};
    useTimeByItemId = {};
    try {
        const cachePath = findCacheBinPath();
        if (!cachePath) {
            console.warn('[item-share-type] Cache.Bin not found -- ShareType/UseTime default to 0 for every item');
            return;
        }
        const bytes = fs.readFileSync(cachePath);
        const firstRecordItemId = bytes.readInt32LE(GAME_ITEM_RECORD_TABLE_START);
        const tableEnd = GAME_ITEM_RECORD_TABLE_START + (GAME_ITEM_RECORD_COUNT * GAME_ITEM_RECORD_ENTRY_SIZE);
        if (firstRecordItemId !== 11100101 || tableEnd > bytes.length) {
            console.warn(
                `[item-share-type] Cache.Bin GameItemRecord table sanity failed: `
                + `first=${firstRecordItemId} expected=11100101 end=0x${tableEnd.toString(16)} `
                + `size=0x${bytes.length.toString(16)}`
            );
            return;
        }
        for (let i = 0; i < GAME_ITEM_RECORD_COUNT; i++) {
            const recordOffset = GAME_ITEM_RECORD_TABLE_START + (i * GAME_ITEM_RECORD_ENTRY_SIZE);
            const itemId = bytes.readInt32LE(recordOffset);
            if (itemId <= 0) continue;
            const shareType = bytes.readInt32LE(recordOffset + SHARE_TYPE_OFFSET);
            shareTypeByItemId[itemId] = shareType === 1 ? 1 : 0;
            useTimeByItemId[itemId] = bytes.readInt32LE(recordOffset + USE_TIME_OFFSET);
        }
        console.log(`[item-share-type] Loaded ShareType/UseTime for ${Object.keys(shareTypeByItemId).length} Cache.Bin items`);
    } catch (err) {
        console.warn(`[item-share-type] Cache.Bin load failed: ${err.message} -- ShareType/UseTime default to 0 for every item`);
    }
}

/**
 * @param {number} itemId catalog item id (items.item_id / catalog.item_id)
 * @returns {number} 0 (not shared, ItemFree()s off other mechs on equip) or
 *   1 (shared, can be equipped on more than one mech at once). Unknown items
 *   default to 0 -- the safer (original, pre-E1) behaviour.
 */
function getShareType(itemId)
{
    if (shareTypeByItemId === null) loadTables();
    const value = shareTypeByItemId[Number(itemId)];
    return value === 1 ? 1 : 0;
}

/**
 * @param {number} itemId
 * @returns {number} GameItemRecord.UseTime in seconds; 0 = permanent (no
 *   expiry). Unknown items default to 0 (permanent) -- matches the
 *   overwhelming majority of the catalog and is the pre-E1 assumption
 *   everywhere else in this codebase (dispatch/item-info.sender.js always
 *   sends 0xFFFFFFFF/permanent expiration).
 */
function getUseTimeSeconds(itemId)
{
    if (useTimeByItemId === null) loadTables();
    const value = Number(useTimeByItemId[Number(itemId)]);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

// Test-only: force specific tables instead of reading Cache.Bin.
function _setTablesForTests(shareTable, useTimeTable)
{
    shareTypeByItemId = shareTable || {};
    useTimeByItemId = useTimeTable || {};
}

module.exports = { getShareType, getUseTimeSeconds, _setTablesForTests };
