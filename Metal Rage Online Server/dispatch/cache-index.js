// Cache.Bin item-id -> table-1 index lookup, shared by room.dispatch.js's
// WearInfo/EquipInfo body-slot conversion (slot===0) and, behind
// BODY_INDEX_GIR_MODE, account.dispatch.js / gamelogin.dispatch.js's
// login-time WearInfo_SN body slot (LEGEND-GRANT-IMPL).
//
// Extracted verbatim from room.dispatch.js's original loadCacheIndexByItemId
// (same scan, same header/entry offsets, same GameItemRecord sanity check).
// Memoized so requiring this from multiple dispatch files only reads
// Cache.Bin once per process.
const fs = require('fs');
const path = require('path');

const GAME_ITEM_RECORD_TABLE_START = 0x2294;
const GAME_ITEM_RECORD_ENTRY_SIZE = 0x67;
const GAME_ITEM_RECORD_COUNT = 2112;

// LEGEND-GRANT-IMPL, coordinator finding (docs/research/2026-09-19-legend-
// grant/notes.md): the login-time WearInfo_SN body-slot index the client
// actually expects is (first-occurrence position of the item_id in the
// GameItemRecord table above) + 84 -- verified against all 9 of the old
// hand-written BODY_IDX table's ids AND the 8 legend ids
// (11200101/12200101/13200101/14300101/15300101/16300101/17200101/18200101).
// [CACHE][TEST] exact match for all 9+8, real Cache.Bin, this worktree.
// 🟡 why +84 is unknown -- possibly a fixed count of some other
// client-side prefix list merged ahead of GameItemRecord. Do not assume
// it generalizes to non-body items without separately checking.
const GIR_BODY_INDEX_OFFSET = 84;

let cached = null;

// LEGEND-GRANT-IMPL (docs/backlog.md, docs/research/2026-09-19-legend-grant/
// notes.md): account.dispatch.js and gamelogin.dispatch.js's login-time
// WearInfo_SN body-slot (slot 0) conversion used a hand-written 9-entry
// BODY_IDX table (account.dispatch.js only -- gamelogin.dispatch.js applied
// no conversion at all, see the notes update this task appended). That
// missed the 7 legend bodies and anything else not in the 9-entry list.
// Behind this switch, both call sites use getBodyIndexFromGir() below
// (GameItemRecord position + 84) instead. Default 'disabled': behavior
// unchanged until verified against a real login.
let BODY_INDEX_GIR_MODE = 'disabled'; // 'disabled' | 'enabled'

function _setBodyIndexGirModeForTests(mode) {
    BODY_INDEX_GIR_MODE = mode === 'enabled' ? 'enabled' : 'disabled';
}

function loadCacheIndexByItemId() {
    if (cached) return cached;

    const indexByItemId = {};
    const representByItemId = {};
    const periodByItemId = {};
    const girPositionByItemId = {};
    try {
        // Cache.Bin 탐색: 상위 디렉토리 순회 + 절대경로 폴백 (Cache.Bin search: traverse parent directories + absolute path fallback)
        let cachePath = null;
        // 1. __dirname 기준 상위 10단계까지 탐색 (search up to 10 levels above __dirname)
        let searchDir = __dirname;
        for (let i = 0; i < 10; i++) {
            const parent = path.dirname(searchDir);
            if (parent === searchDir) break; // 루트 도달 (root reached)
            searchDir = parent;
            const candidate = path.join(searchDir, 'MetalRage', 'Data', 'System', 'Cache.Bin');
            if (fs.existsSync(candidate)) { cachePath = candidate; break; }
        }
        // 2. process.cwd() 기준도 탐색 (also search from process.cwd())
        if (!cachePath) {
            let cwdDir = process.cwd();
            for (let i = 0; i < 10; i++) {
                const candidate = path.join(cwdDir, 'MetalRage', 'Data', 'System', 'Cache.Bin');
                if (fs.existsSync(candidate)) { cachePath = candidate; break; }
                const parent = path.dirname(cwdDir);
                if (parent === cwdDir) break;
                cwdDir = parent;
            }
        }
        if (!cachePath) cachePath = path.resolve(__dirname, '..', '..', 'MetalRage', 'Data', 'System', 'Cache.Bin');
        // Desktop 직접 경로 추가 (add direct Desktop path)
        if (!cachePath || !fs.existsSync(cachePath)) {
            const homeDir = require("os").homedir();
            const desktopCand = path.join(homeDir, "Desktop", "MetalRage", "Data", "System", "Cache.Bin");
            if (fs.existsSync(desktopCand)) cachePath = desktopCand;
        }
        console.log();
        const bytes = fs.readFileSync(cachePath);
        const headerSize = 82;
        const entrySize = 103;
        const itemIdOffset = 96;
        // This original scan feeds CACHE_INDEX_BY_ITEM_ID for slot===0 body
        // conversion. Its 1268-entry result is intentionally preserved.
        for (let i = 0; headerSize + (i * entrySize) + itemIdOffset + 4 <= bytes.length; i++) {
            const itemId = bytes.readInt32LE(headerSize + (i * entrySize) + itemIdOffset);
            if (itemId > 0 && indexByItemId[itemId] == null) {
                indexByItemId[itemId] = i;
            }
        }
        console.log(`[CacheIndex] Loaded ${Object.keys(indexByItemId).length} Cache.Bin item indexes`);
        const firstRecordItemId = bytes.readInt32LE(GAME_ITEM_RECORD_TABLE_START);
        const tableEnd = GAME_ITEM_RECORD_TABLE_START
            + (GAME_ITEM_RECORD_COUNT * GAME_ITEM_RECORD_ENTRY_SIZE);
        if (firstRecordItemId !== 11100101 || tableEnd > bytes.length) {
            console.warn(
                `[CacheIndex] Cache.Bin GameItemRecord table sanity failed: `
                + `first=${firstRecordItemId} expected=11100101 end=0x${tableEnd.toString(16)} `
                + `size=0x${bytes.length.toString(16)}`
            );
        } else {
            for (let i = 0; i < GAME_ITEM_RECORD_COUNT; i++) {
                const recordOffset = GAME_ITEM_RECORD_TABLE_START + (i * GAME_ITEM_RECORD_ENTRY_SIZE);
                const itemId = bytes.readInt32LE(recordOffset);
                const representIndex = bytes.readInt32LE(recordOffset + 0x04);
                const periodSeconds = bytes.readInt32LE(recordOffset + 0x43);
                if (itemId > 0) {
                    if (representIndex > 0 && representByItemId[itemId] == null) {
                        representByItemId[itemId] = representIndex;
                    }
                    periodByItemId[itemId] = periodSeconds;
                    if (girPositionByItemId[itemId] == null) {
                        girPositionByItemId[itemId] = i;
                    }
                }
            }
        }
        const sampleIds = [22100101, 22100102, 22100103, 22100104, 22100105, 22100106, 22100107, 22100108];
        const samples = sampleIds.map(itemId =>
            `${itemId}->rep ${representByItemId[itemId] ?? 'unknown'} period ${periodByItemId[itemId] ?? 'unknown'}`
        ).join(', ');
        console.log(`[CacheIndex] Cache.Bin represent samples: ${samples}`);
    } catch (err) {
        console.warn(`[CacheIndex] Cache.Bin index load failed: ${err.message}`);
    }

    cached = { indexByItemId, representByItemId, girPositionByItemId };
    return cached;
}

/**
 * LEGEND-GRANT-IMPL: login-time WearInfo_SN body-slot index, per the
 * coordinator's GameItemRecord-position formula above.
 * @param {number} itemId
 * @returns {number|null} GameItemRecord first-occurrence position + 84, or
 *   null if itemId is not in that table (or Cache.Bin failed to load).
 */
function getBodyIndexFromGir(itemId) {
    const { girPositionByItemId } = loadCacheIndexByItemId();
    const pos = girPositionByItemId[Number(itemId)];
    return pos != null ? pos + GIR_BODY_INDEX_OFFSET : null;
}

module.exports = {
    loadCacheIndexByItemId,
    getBodyIndexFromGir,
    _setBodyIndexGirModeForTests,
};

// Live getter, not a plain property: BODY_INDEX_GIR_MODE is a `let` (see
// database/db.js's ITEM_EQUIPS_MODE for the same pattern/reasoning) -- call
// sites read it as `cacheIndex.BODY_INDEX_GIR_MODE` on demand.
Object.defineProperty(module.exports, 'BODY_INDEX_GIR_MODE', {
    enumerable: true,
    get() { return BODY_INDEX_GIR_MODE; },
});
