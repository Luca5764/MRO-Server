'use strict';

// P3 step 3 (docs/design/p3-step1-writeback.md §3, docs/design/
// p3-step3-writeback-impl.md): creates the three match-writeback tables
// (`matches`, `match_rounds`, `match_participants`) that
// database/db.js's recordMatch()/applyMatchAccumulation() and
// dispatch/room/match-stats.js's MATCH_WRITEBACK_MODE writeback depend on.
//
// DO NOT RUN THIS AGAINST THE REAL DATABASE without a high-tier review and a
// fresh, full-database backup first (see docs/backlog.md / AGENTS.md 協作與
// 紀錄規則). This script has only ever run against an in-memory mock pool
// (test/match-writeback.js) -- never database/config.json's real `mro`
// database.
//
// Unlike tools/migrate-e1-item-equips.js this migration moves no existing
// row data -- `matches`/`match_rounds`/`match_participants` are brand new
// tables with nothing to backfill (grep confirms no earlier equivalent
// table). So "idempotent" here just means: CREATE TABLE IF NOT EXISTS,
// safe to run any number of times, and a second real run is a no-op (every
// table already exists, nothing is re-created or altered). There is no
// --force flag because there is nothing a rerun could conflict with.
//
// Schema notes (docs/design/p3-step1-writeback.md §3, high-tier review
// 2026-09-20 point 5, applied here):
//   - `started_at`/`ended_at` are DATETIME, not TIMESTAMP (TIMESTAMP's
//     "first column with no default auto-updates" trap under strict mode).
//   - `matches.host_account_id` is nullable with ON DELETE SET NULL, so
//     deleting an account does not delete every match it ever hosted
//     (match_rounds/match_participants still cascade-delete from
//     `matches`, and match_participants.account_id still cascades from
//     `accounts` directly -- it is part of that table's composite PRIMARY
//     KEY, which MySQL requires to be NOT NULL, so ON DELETE SET NULL is
//     not an option there; CASCADE there means "this participant's own row
//     disappears with the account", a narrower blast radius than
//     `matches.host_account_id`'s CASCADE would have been).
//
// Usage:
//   node tools/migrate-p3-match-tables.js --dry-run
//     -- read-only (information_schema.TABLES only, never CREATE TABLE); no
//        env vars required (Sol batch6 review, docs/research/
//        2026-09-20-sol-review/p3.md, "疑點 -- --dry-run": relaxed from the
//        original tools/merge-e1-shared-duplicates.js precedent, which
//        required the guards even for --dry-run -- a pure read does not need
//        a backup-confirmation gate).
//   ALLOW_REAL_DB_WRITE=1 P3_BACKUP_CONFIRMED=1 node tools/migrate-p3-match-tables.js
//     -- once a high-tier has reviewed this and both env vars are set,
//        issues the actual CREATE TABLE statements.

const TABLE_DEFS = [
    {
        name: 'matches',
        ddl: `
            CREATE TABLE IF NOT EXISTS \`matches\` (
                \`id\`              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                \`room_id\`         INT UNSIGNED    NULL,
                \`map_id\`          INT UNSIGNED    NOT NULL,
                \`difficulty\`      TINYINT UNSIGNED NOT NULL DEFAULT 0,
                \`round_target\`    TINYINT UNSIGNED NOT NULL,
                \`host_account_id\` INT UNSIGNED    NULL,
                \`started_at\`      DATETIME        NOT NULL,
                \`ended_at\`        DATETIME        NULL,
                \`result\`          TINYINT UNSIGNED NOT NULL DEFAULT 0,
                \`win_team_rank\`   TINYINT UNSIGNED NOT NULL DEFAULT 0,
                \`is_test\`         TINYINT(1)      NOT NULL DEFAULT 0,
                \`suspicious\`      TINYINT(1)      NOT NULL DEFAULT 0,
                FOREIGN KEY (\`host_account_id\`) REFERENCES \`accounts\` (\`id\`) ON DELETE SET NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `,
    },
    {
        name: 'match_rounds',
        ddl: `
            CREATE TABLE IF NOT EXISTS \`match_rounds\` (
                \`match_id\`         BIGINT UNSIGNED NOT NULL,
                \`round_number\`     TINYINT UNSIGNED NOT NULL,
                \`started_at\`       DATETIME        NOT NULL,
                \`duration_seconds\` INT UNSIGNED    NOT NULL DEFAULT 0,
                \`death_cn_count\`   INT UNSIGNED    NOT NULL DEFAULT 0,
                \`suspicious\`       TINYINT(1)      NOT NULL DEFAULT 0,
                PRIMARY KEY (\`match_id\`, \`round_number\`),
                FOREIGN KEY (\`match_id\`) REFERENCES \`matches\` (\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `,
    },
    {
        name: 'match_participants',
        ddl: `
            CREATE TABLE IF NOT EXISTS \`match_participants\` (
                \`match_id\`     BIGINT UNSIGNED NOT NULL,
                \`account_id\`   INT UNSIGNED    NOT NULL,
                \`team\`         TINYINT UNSIGNED NOT NULL DEFAULT 0,
                \`kills\`        INT UNSIGNED    NOT NULL DEFAULT 0,
                \`deaths\`       INT UNSIGNED    NOT NULL DEFAULT 0,
                \`exp_gained\`   BIGINT UNSIGNED NOT NULL DEFAULT 0,
                \`point_gained\` BIGINT UNSIGNED NOT NULL DEFAULT 0,
                \`result\`       TINYINT UNSIGNED NOT NULL DEFAULT 0,
                PRIMARY KEY (\`match_id\`, \`account_id\`),
                FOREIGN KEY (\`match_id\`) REFERENCES \`matches\` (\`id\`) ON DELETE CASCADE,
                FOREIGN KEY (\`account_id\`) REFERENCES \`accounts\` (\`id\`) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `,
    },
];

/**
 * @param {object} connection a mysql2/promise-shaped connection:
 *   {execute}. Same shape tools/add-account-money.js's `connection` uses.
 * @returns {Promise<Record<string, boolean>>} table name -> exists
 */
async function readTableState(connection)
{
    const names = TABLE_DEFS.map((t) => t.name);
    const placeholders = names.map(() => '?').join(', ');
    const [rows] = await connection.execute(
        `SELECT TABLE_NAME FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${placeholders})`,
        names
    );
    const present = new Set(rows.map((r) => r.TABLE_NAME));
    const state = {};
    for (const name of names) state[name] = present.has(name);
    return state;
}

function printState(log, label, state)
{
    const summary = Object.entries(state).map(([name, exists]) => `${name}=${exists ? 'exists' : 'missing'}`).join(', ');
    log(`[P3 match-tables migration] ${label}: ${summary}`);
}

/**
 * @param {object} pool a mysql2/promise-shaped pool: pool.getConnection()
 *   returns {execute, release}.
 * @param {object} [opts]
 * @param {(msg: string) => void} [opts.log]
 * @param {boolean} [opts.dryRun] only read information_schema and print,
 *   never issue CREATE TABLE. Default false.
 * @returns {Promise<{before: Record<string, boolean>, after: Record<string, boolean>, created: string[]}>}
 */
async function runMigration(pool, opts = {})
{
    const log = opts.log || console.log;
    const dryRun = !!opts.dryRun;

    const conn = await pool.getConnection();
    try {
        const before = await readTableState(conn);
        printState(log, 'Before', before);

        if (dryRun) {
            const missing = TABLE_DEFS.map((t) => t.name).filter((name) => !before[name]);
            log(`[P3 match-tables migration] --dry-run: would create ${missing.length} table(s): ${missing.join(', ') || '(none)'}`);
            return { before, after: before, created: [] };
        }

        // DDL only, no data to move, so this never needs a transaction --
        // CREATE TABLE IF NOT EXISTS is atomic and idempotent per statement.
        // Order matters: match_rounds/match_participants FK-reference
        // matches, which must exist first.
        const created = [];
        for (const table of TABLE_DEFS) {
            if (before[table.name]) {
                log(`[P3 match-tables migration] table ${table.name} already exists; skip`);
                continue;
            }
            await conn.execute(table.ddl);
            created.push(table.name);
            log(`[P3 match-tables migration] created table ${table.name}`);
        }

        const after = await readTableState(conn);
        printState(log, 'After', after);

        return { before, after, created };
    } finally {
        conn.release();
    }
}

// Sol batch6 review (docs/research/2026-09-20-sol-review/p3.md, "疑點 --
// --dry-run"; §6 open question 2, "可放寬"): --dry-run only ever reads
// information_schema.TABLES (see runMigration's own dryRun branch above) --
// it never issues a CREATE TABLE, so requiring a real-write confirmation for
// it was overly cautious, not a safety requirement. Pulled out as a pure
// function (env object passed in, not read directly) so a test can exercise
// every combination without needing a real `db.pool`/MySQL connection --
// this never touches the network itself.
//
// @param {boolean} dryRun
// @param {NodeJS.ProcessEnv} env
// @returns {string|null} a refusal message, or null if it is OK to proceed
function checkEnvGuards(dryRun, env)
{
    if (dryRun) return null; // read-only; no confirmation needed (see above)
    if (env.ALLOW_REAL_DB_WRITE !== '1') {
        return '[P3 match-tables migration] Refusing to run: set ALLOW_REAL_DB_WRITE=1 only after a high-tier '
            + 'has reviewed this script and you have a fresh, full-database backup (see the comment at the '
            + 'top of this file).';
    }
    if (env.P3_BACKUP_CONFIRMED !== '1') {
        return '[P3 match-tables migration] Refusing to run: take a full-database backup yourself first, then '
            + 'set P3_BACKUP_CONFIRMED=1 to confirm you have done so (in addition to ALLOW_REAL_DB_WRITE=1).';
    }
    return null;
}

async function main()
{
    const dryRun = process.argv.includes('--dry-run');

    const refusal = checkEnvGuards(dryRun, process.env);
    if (refusal) {
        console.error(refusal);
        process.exitCode = 1;
        return;
    }

    const db = require('../database/db');
    try {
        await runMigration(db.pool, { dryRun });
    } finally {
        await db.pool.end();
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error('[P3 match-tables migration] Failed:', err.message);
        process.exitCode = 1;
    });
}

module.exports = { runMigration, TABLE_DEFS, checkEnvGuards };
