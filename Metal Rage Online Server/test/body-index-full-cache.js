'use strict';

// LEGEND-GRANT-IMPL (docs/backlog.md, docs/research/2026-09-19-legend-grant/
// notes.md): dispatch/cache-index.js's BODY_INDEX_FULL_CACHE_MODE switch.
//
// IMPORTANT -- this does NOT assert the parity the original task contract
// assumed ("each of the 9 existing ids must give the same value as before").
// That assumption was checked against the real Cache.Bin (symlinked into
// this worktree) and is false: the account.dispatch.js hand-written 9-entry
// BODY_IDX table (11100101->84, 12100101->97, ...) does not match
// loadCacheIndexByItemId()'s 1268-entry scan for ANY of the 9 ids (4 of the
// 9 aren't even present in that scan's result at all -- 13100101, 14300101,
// 17100101, 18100101). See the notes.md entry this task appended for the
// raw numbers. Writing a passing equality assertion here would have been
// false, so instead this test:
//   1. confirms the switch defaults to 'disabled' (no behavior change);
//   2. confirms 'disabled' mode reproduces the exact old 9-entry table
//      (this direction genuinely holds -- it's the literal old code, just
//      moved);
//   3. when Cache.Bin is available (see test/README.md's Cache.Bin section),
//      documents the current mismatch as a canary: if this test ever starts
//      failing because the numbers now match, that's a signal the
//      discrepancy was resolved and this test (plus the notes.md flag)
//      should be revisited, not deleted blindly.
//
// Run: node test/body-index-full-cache.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CACHE_INDEX_PATH = require.resolve(path.join(ROOT, 'dispatch', 'cache-index.js'));

// The literal old table from account.dispatch.js (pre-LEGEND-GRANT-IMPL),
// kept here only to check 'disabled' mode still matches it -- not imported
// from account.dispatch.js since that file no longer exports it as data
// (it's inline in the dispatch loop).
const OLD_NINE_ENTRY_TABLE = {
    11100101: 84, 12100101: 97, 13100101: 110,
    14200101: 123, 14300101: 130, 15200101: 136,
    16200101: 149, 17100101: 162, 18100101: 175,
};

function testDefaultsToDisabled()
{
    delete require.cache[CACHE_INDEX_PATH];
    const cacheIndex = require(CACHE_INDEX_PATH);
    assert.strictEqual(cacheIndex.BODY_INDEX_FULL_CACHE_MODE, 'disabled',
        'BODY_INDEX_FULL_CACHE_MODE must default to disabled');
    console.log('[body-index-full-cache test] PASS: BODY_INDEX_FULL_CACHE_MODE defaults to disabled');
}

// account.dispatch.js's 'disabled' branch is the OLD_NINE_ENTRY_TABLE
// literal, inline in the dispatch loop -- this just re-checks that literal
// against itself as a change-detector (a future edit to that inline literal
// that silently drops/changes an id would fail this).
function testDisabledModeMatchesOldTableLiteral()
{
    const accountDispatchSrc = require('fs').readFileSync(
        path.join(ROOT, 'dispatch', 'account.dispatch.js'), 'utf8'
    );
    for (const [itemId, index] of Object.entries(OLD_NINE_ENTRY_TABLE)) {
        assert.ok(
            accountDispatchSrc.includes(`${itemId}:${index}`) || accountDispatchSrc.includes(`${itemId}: ${index}`),
            `account.dispatch.js's inline BODY_IDX table must still map ${itemId} -> ${index}`
        );
    }
    console.log('[body-index-full-cache test] PASS: disabled-mode 9-entry table unchanged in account.dispatch.js');
}

function testFullCacheDoesNotYetMatchOldTable()
{
    delete require.cache[CACHE_INDEX_PATH];
    const cacheIndex = require(CACHE_INDEX_PATH);
    const { indexByItemId } = cacheIndex.loadCacheIndexByItemId();

    if (Object.keys(indexByItemId).length === 0) {
        console.log('[body-index-full-cache test] SKIP: Cache.Bin not available in this worktree '
            + '(see test/README.md Cache.Bin section) -- cannot check real values, only structural checks ran');
        return;
    }

    const mismatches = [];
    for (const [itemIdStr, oldIndex] of Object.entries(OLD_NINE_ENTRY_TABLE)) {
        const itemId = Number(itemIdStr);
        const fullIndex = indexByItemId[itemId];
        if (fullIndex !== oldIndex) {
            mismatches.push({ itemId, oldIndex, fullIndex: fullIndex ?? 'not found' });
        }
    }

    for (const m of mismatches) {
        console.log(`[body-index-full-cache test] 🟡 mismatch: item=${m.itemId} old=${m.oldIndex} full-cache=${m.fullIndex}`);
    }

    // Canary, not a design goal: today ALL 9 differ. If this count ever
    // drops, the discrepancy this test's header describes may have been
    // resolved -- re-read docs/research/2026-09-19-legend-grant/notes.md
    // before assuming it's safe to flip BODY_INDEX_FULL_CACHE_MODE on.
    assert.strictEqual(mismatches.length, 9,
        `expected all 9 old-table ids to currently mismatch the full Cache.Bin index (found ${mismatches.length} `
        + `mismatches) -- if this changed, see this file's header comment before treating it as a fix`);

    console.log('[body-index-full-cache test] PASS (canary): full-cache index still does not reproduce the old '
        + '9-entry table for any of the 9 ids -- 🟡 unresolved, see notes.md');
}

function main()
{
    testDefaultsToDisabled();
    testDisabledModeMatchesOldTableLiteral();
    testFullCacheDoesNotYetMatchOldTable();
    console.log('[body-index-full-cache test] ALL CHECKS PASS');
}

main();
