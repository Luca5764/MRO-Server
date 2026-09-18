'use strict';

const { pool } = require('../database/db');

const MONEY_COLUMNS = [
    { name: 'point', definition: 'BIGINT NOT NULL DEFAULT 100000 AFTER `gender`' },
    { name: 'cash', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER `point`' },
    { name: 'coupon', definition: 'BIGINT NOT NULL DEFAULT 0 AFTER `cash`' },
];

async function readState(connection)
{
    const names = MONEY_COLUMNS.map(column => column.name);
    const placeholders = names.map(() => '?').join(', ');
    const [columns] = await connection.execute(
        `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, ORDINAL_POSITION
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'accounts'
            AND COLUMN_NAME IN (${placeholders})
          ORDER BY ORDINAL_POSITION`,
        names
    );
    const [counts] = await connection.execute(
        'SELECT COUNT(*) AS account_count FROM accounts'
    );
    return {
        columns,
        accountCount: Number(counts[0].account_count),
    };
}

function printState(label, state)
{
    const columns = state.columns.length === 0
        ? '(none)'
        : state.columns.map(column =>
            `${column.COLUMN_NAME}:${column.COLUMN_TYPE}:NULL=${column.IS_NULLABLE}:DEFAULT=${column.COLUMN_DEFAULT}`
        ).join(', ');
    console.log(`[add-account-money] ${label}: accounts=${state.accountCount} columns=${columns}`);
}

async function main()
{
    let connection;
    try {
        connection = await pool.getConnection();
        const before = await readState(connection);
        printState('before', before);

        const existing = new Set(before.columns.map(column => column.COLUMN_NAME));
        for (const column of MONEY_COLUMNS) {
            if (existing.has(column.name)) {
                console.log(`[add-account-money] column ${column.name} already exists; skip`);
                continue;
            }

            await connection.execute(
                `ALTER TABLE accounts ADD COLUMN \`${column.name}\` ${column.definition}`
            );
            console.log(`[add-account-money] added column ${column.name}`);
        }

        const [updated] = await connection.execute(
            'UPDATE accounts SET point = 100000 WHERE point = 0'
        );
        console.log(`[add-account-money] initialized ${updated.affectedRows} zero-point account(s)`);

        const after = await readState(connection);
        printState('after', after);
    } finally {
        if (connection) connection.release();
        await pool.end();
    }
}

main().catch(error => {
    console.error(`[add-account-money] failed: ${error.message}`);
    process.exitCode = 1;
});
