'use strict';

// P3 step 3 (docs/design/p3-step1-writeback.md §3, docs/design/
// p3-step3-writeback-impl.md): tools/migrate-p3-match-tables.js against an
// in-memory fake pool -- never a real MySQL connection.
//
// Cases:
//   1. Fresh DB: all three tables get created, in matches -> match_rounds ->
//      match_participants order (FK dependency order).
//   2. Idempotent rerun: second run creates nothing.
//   3. --dry-run: never issues CREATE TABLE (a fake connection that throws
//      on any unmocked SQL would fail the test if it tried), before/after
//      state identical, created=[].
//
// Run: node test/p3-match-tables-migration.js  (exit 0 = pass, exit 1 = fail)

const assert = require('assert');
const path = require('path');

const { runMigration, TABLE_DEFS } = require(path.join(__dirname, '..', 'tools', 'migrate-p3-match-tables.js'));

const ALL_TABLE_NAMES = TABLE_DEFS.map((t) => t.name);

/**
 * @param {Set<string>} existingTables - which of ALL_TABLE_NAMES already
 *   "exist" at the start.
 * @returns {{pool: object, createdOrder: string[], existing: Set<string>}}
 */
function makeFakePool(existingTables)
{
    const existing = new Set(existingTables);
    const createdOrder = [];

    async function execute(sql, params = [])
    {
        const norm = sql.replace(/\s+/g, ' ').trim();

        if (norm.startsWith('SELECT TABLE_NAME FROM information_schema.TABLES')) {
            const requested = params; // TABLE_NAME IN (?, ?, ?)
            const rows = requested.filter((name) => existing.has(name)).map((name) => ({ TABLE_NAME: name }));
            return [rows];
        }

        for (const table of TABLE_DEFS) {
            if (norm.includes(`CREATE TABLE IF NOT EXISTS \`${table.name}\``)) {
                if (existing.has(table.name)) {
                    // Real MySQL would also no-op here (IF NOT EXISTS) --
                    // the migration script itself should never even issue
                    // this for an already-existing table (see the `skip`
                    // branch in runMigration), so reaching this branch in a
                    // test would indicate that guard regressed.
                    throw new Error(`fake pool: CREATE TABLE issued for already-existing table ${table.name}`);
                }
                existing.add(table.name);
                createdOrder.push(table.name);
                return [{}];
            }
        }

        throw new Error(`p3-match-tables-migration test fake pool: unmocked SQL: ${norm}`);
    }

    return {
        pool: {
            async getConnection()
            {
                return { execute, release() {} };
            },
        },
        createdOrder,
        existing,
    };
}

async function testFreshDbCreatesAllThreeInOrder()
{
    const { pool, createdOrder, existing } = makeFakePool([]);
    const silent = () => {};

    const result = await runMigration(pool, { log: silent });

    assert.deepStrictEqual(result.created, ALL_TABLE_NAMES, `expected all three tables created in FK order, got [${result.created.join(', ')}]`);
    assert.deepStrictEqual(createdOrder, ['matches', 'match_rounds', 'match_participants'], 'matches must be created before match_rounds/match_participants (FK dependency)');
    for (const name of ALL_TABLE_NAMES) {
        assert.strictEqual(result.before[name], false, `${name} must be reported missing in "before" state`);
        assert.strictEqual(result.after[name], true, `${name} must be reported present in "after" state`);
    }
    assert.strictEqual(existing.size, 3, 'fake pool should now have all three tables');

    console.log('[p3-match-tables-migration test] PASS: fresh DB creates matches -> match_rounds -> match_participants in order');
}

async function testIdempotentRerunCreatesNothing()
{
    const { pool } = makeFakePool([]);
    const silent = () => {};

    const first = await runMigration(pool, { log: silent });
    assert.strictEqual(first.created.length, 3, 'first run should create all three tables');

    const second = await runMigration(pool, { log: silent });
    assert.strictEqual(second.created.length, 0, `second run should create nothing (idempotent), got [${second.created.join(', ')}]`);
    for (const name of ALL_TABLE_NAMES) {
        assert.strictEqual(second.before[name], true, `${name} should already be reported present before the second run`);
    }

    console.log('[p3-match-tables-migration test] PASS: a second run is idempotent (creates nothing)');
}

async function testPartiallyMigratedOnlyCreatesMissing()
{
    // `matches` already exists (e.g. a previous run got interrupted after
    // creating it); the other two do not yet.
    const { pool, createdOrder } = makeFakePool(['matches']);
    const silent = () => {};

    const result = await runMigration(pool, { log: silent });
    assert.deepStrictEqual(result.created, ['match_rounds', 'match_participants'], `expected only the two missing tables to be created, got [${result.created.join(', ')}]`);
    assert.deepStrictEqual(createdOrder, ['match_rounds', 'match_participants']);

    console.log('[p3-match-tables-migration test] PASS: a partially-migrated DB only creates the missing tables');
}

async function testDryRunMakesNoChanges()
{
    const { pool, createdOrder, existing } = makeFakePool([]);
    const silent = () => {};

    const result = await runMigration(pool, { log: silent, dryRun: true });

    assert.strictEqual(result.created.length, 0, '--dry-run must report nothing created');
    assert.deepStrictEqual(result.before, result.after, '--dry-run must report identical before/after state');
    for (const name of ALL_TABLE_NAMES) {
        assert.strictEqual(result.before[name], false, `${name} should still be reported missing`);
    }
    assert.strictEqual(createdOrder.length, 0, '--dry-run must never call CREATE TABLE (fake pool would have recorded it)');
    assert.strictEqual(existing.size, 0, '--dry-run must not mutate the fake pool\'s table state');

    console.log('[p3-match-tables-migration test] PASS: --dry-run computes state without creating anything');
}

async function main()
{
    await testFreshDbCreatesAllThreeInOrder();
    await testIdempotentRerunCreatesNothing();
    await testPartiallyMigratedOnlyCreatesMissing();
    await testDryRunMakesNoChanges();
    console.log('[p3-match-tables-migration test] ALL CHECKS PASS');
    process.exit(0);
}

main().catch((err) => {
    console.error('[p3-match-tables-migration test] FAIL:', err);
    process.exit(1);
});
