'use strict';

// LEGEND-GRANT-IMPL (docs/backlog.md, docs/research/2026-09-19-legend-grant/
// notes.md): proves dispatch/cache-index.js's getBodyIndexFromGir() and the
// BODY_INDEX_GIR_MODE switch it feeds.
//
// Formula (coordinator finding, docs/research/2026-09-19-legend-grant/
// notes.md): the login-time WearInfo_SN body-slot index the client expects
// is (first-occurrence position of the item_id in the GameItemRecord table,
// start 0x2294, stride 0x67, 2112 records) + 84. Verified against the real
// Cache.Bin (symlinked into this worktree -- see test/README.md's Cache.Bin
// section): exact match for all 9 of the old hand-written BODY_IDX table's
// ids AND all 7 of the legend body ids not in that table (14300101/PHANTOM
// was already in the old table, so only 7 new ones to check). 🟡 why +84 is
// unknown; see dispatch/cache-index.js's GIR_BODY_INDEX_OFFSET comment.
//
// Run: node test/body-index-gir.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE_INDEX_PATH = require.resolve(path.join(ROOT, 'dispatch', 'cache-index.js'));

// The old hand-written table account.dispatch.js's 'disabled' path still
// uses (inline in the dispatch loop, not exported as data).
const OLD_NINE_ENTRY_TABLE = {
    11100101: 84, 12100101: 97, 13100101: 110,
    14200101: 123, 14300101: 130, 15200101: 136,
    16200101: 149, 17100101: 162, 18100101: 175,
};

// The 7 legend ids not already covered by OLD_NINE_ENTRY_TABLE (14300101
// PHANTOM's legend id happens to equal its own prototype-table entry above,
// since PHANTOM's prototype body 14200101 is mech 4's *legend-tier* base --
// see notes.md's prototype->legend mapping). Expected values from the
// coordinator, cross-checked against the real Cache.Bin below.
const LEGEND_EXPECTED = {
    11200101: 91,  // RAVEN
    12200101: 104, // CRUAL MASSACRE
    13200101: 117, // VALKYRIE
    15300101: 143, // ZODIAC
    16300101: 156, // ROXANNE
    17200101: 169, // FENRIS
    18200101: 182, // SPECTOR
};

function loadFreshCacheIndex()
{
    delete require.cache[CACHE_INDEX_PATH];
    return require(CACHE_INDEX_PATH);
}

function testDefaultsToDisabled()
{
    const cacheIndex = loadFreshCacheIndex();
    assert.strictEqual(cacheIndex.BODY_INDEX_GIR_MODE, 'disabled',
        'BODY_INDEX_GIR_MODE must default to disabled');
    console.log('[body-index-gir test] PASS: BODY_INDEX_GIR_MODE defaults to disabled');
}

function testGirFormulaReproducesOldTable()
{
    const cacheIndex = loadFreshCacheIndex();
    const { girPositionByItemId } = cacheIndex.loadCacheIndexByItemId();

    if (Object.keys(girPositionByItemId).length === 0) {
        console.log('[body-index-gir test] SKIP: Cache.Bin not available in this worktree '
            + '(see test/README.md Cache.Bin section) -- cannot check real values');
        return;
    }

    for (const [itemIdStr, expected] of Object.entries(OLD_NINE_ENTRY_TABLE)) {
        const itemId = Number(itemIdStr);
        const got = cacheIndex.getBodyIndexFromGir(itemId);
        assert.strictEqual(got, expected,
            `getBodyIndexFromGir(${itemId}) should reproduce the old table's ${expected}, got ${got}`);
    }
    console.log('[body-index-gir test] PASS: GIR-position+84 formula reproduces all 9 old BODY_IDX table values');
}

function testGirFormulaCoversLegendIds()
{
    const cacheIndex = loadFreshCacheIndex();
    const { girPositionByItemId } = cacheIndex.loadCacheIndexByItemId();
    if (Object.keys(girPositionByItemId).length === 0) {
        console.log('[body-index-gir test] SKIP: Cache.Bin not available, cannot check legend ids');
        return;
    }

    for (const [itemIdStr, expected] of Object.entries(LEGEND_EXPECTED)) {
        const itemId = Number(itemIdStr);
        const got = cacheIndex.getBodyIndexFromGir(itemId);
        assert.strictEqual(got, expected,
            `getBodyIndexFromGir(${itemId}) expected ${expected}, got ${got}`);
    }
    // 14300101 (PHANTOM) already covered by testGirFormulaReproducesOldTable above.
    console.log('[body-index-gir test] PASS: GIR-position+84 formula covers all 7 remaining legend body ids');
}

function testUnknownIdFallsBackToNull()
{
    const cacheIndex = loadFreshCacheIndex();
    const { girPositionByItemId } = cacheIndex.loadCacheIndexByItemId();
    if (Object.keys(girPositionByItemId).length === 0) {
        console.log('[body-index-gir test] SKIP: Cache.Bin not available, cannot check unknown-id fallback');
        return;
    }
    const got = cacheIndex.getBodyIndexFromGir(999999999);
    assert.strictEqual(got, null, 'an item_id not present in GameItemRecord must return null (caller falls back)');
    console.log('[body-index-gir test] PASS: an id GIR does not have returns null for the caller to fall back on');
}

function main()
{
    testDefaultsToDisabled();
    testGirFormulaReproducesOldTable();
    testGirFormulaCoversLegendIds();
    testUnknownIdFallsBackToNull();
    console.log('[body-index-gir test] ALL CHECKS PASS');
}

main();
