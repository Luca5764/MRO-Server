'use strict';

const readline = require('readline');
const { pool } = require('../database/db');

const RESERVED_SERIAL_LIMIT = 100000;
const SERIAL_OFFSET = 100000;
const AUTO_INCREMENT_FLOOR = 200000;
const UINT32_MAX = 0xFFFFFFFF;
const TEMPORARY_ID_MARGIN = 1000000;

function numberValue(value)
{
    return value === null || value === undefined ? null : Number(value);
}

async function readStats(connection)
{
    const [rows] = await connection.execute(
        `SELECT MIN(id) AS min_id,
                MAX(id) AS max_id,
                COUNT(*) AS row_count,
                SUM(id < ?) AS low_count
           FROM items`,
        [RESERVED_SERIAL_LIMIT]
    );
    const row = rows[0];
    return {
        min: numberValue(row.min_id),
        max: numberValue(row.max_id),
        count: numberValue(row.row_count) || 0,
        lowCount: numberValue(row.low_count) || 0,
    };
}

function printStats(label, stats)
{
    console.log(`[renumber-item-serials] ${label}: min=${stats.min ?? 'NULL'} max=${stats.max ?? 'NULL'} rows=${stats.count} below-100000=${stats.lowCount}`);
}

function confirm()
{
    const input = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise(resolve => {
        input.question(
            '[renumber-item-serials] Type RENNUMBER to continue, anything else to abort: ',
            answer => {
                input.close();
                resolve(answer.trim() === 'RENNUMBER');
            }
        );
    });
}

async function remapCollidingRows(connection, stats)
{
    const [lowRows] = await connection.execute(
        'SELECT id FROM items WHERE id < ? ORDER BY id',
        [RESERVED_SERIAL_LIMIT]
    );
    const temporaryBase = Math.max(
        1000000000,
        (stats.max || 0) + TEMPORARY_ID_MARGIN
    );
    if (temporaryBase + lowRows.length + 1 > UINT32_MAX) {
        throw new Error('no safe temporary INT UNSIGNED serial range is available');
    }

    // This path is only for an existing collision with id + 100000. The
    // preflight reference scan confirmed that items.id has no child references.
    for (let index = 0; index < lowRows.length; index++) {
        await connection.execute(
            'UPDATE items SET id = ? WHERE id = ?',
            [temporaryBase + index, Number(lowRows[index].id)]
        );
    }

    const firstNewId = Math.max(RESERVED_SERIAL_LIMIT, (stats.max || 0) + 1);
    if (firstNewId + lowRows.length > UINT32_MAX) {
        throw new Error('no safe final INT UNSIGNED serial range is available');
    }
    for (let index = 0; index < lowRows.length; index++) {
        await connection.execute(
            'UPDATE items SET id = ? WHERE id = ?',
            [firstNewId + index, temporaryBase + index]
        );
    }
    console.log(`[renumber-item-serials] collision-safe remap assigned ${lowRows.length} fresh serials from ${firstNewId}`);
}

async function main()
{
    let connection;
    try {
        connection = await pool.getConnection();
        const before = await readStats(connection);
        printStats('before', before);

        if (before.lowCount === 0) {
            console.log('[renumber-item-serials] no reserved-range rows found; migration is already idempotently complete');
        }

        console.log('[renumber-item-serials] This changes the items primary keys and AUTO_INCREMENT.');
        if (!(await confirm())) {
            console.log('[renumber-item-serials] aborted without changes');
            return;
        }

        await connection.beginTransaction();
        try {
            if (before.lowCount > 0) {
                const [collisionRows] = await connection.execute(
                    `SELECT COUNT(*) AS collision_count
                       FROM items low_item
                       JOIN items existing_item
                         ON existing_item.id = low_item.id + ?
                      WHERE low_item.id < ?`,
                    [SERIAL_OFFSET, RESERVED_SERIAL_LIMIT]
                );
                const collisions = numberValue(collisionRows[0].collision_count) || 0;
                if (collisions === 0) {
                    await connection.execute(
                        'UPDATE items SET id = id + 100000 WHERE id < 100000'
                    );
                    console.log('[renumber-item-serials] moved reserved-range rows with id + 100000');
                } else {
                    console.log(`[renumber-item-serials] found ${collisions} id + 100000 collision(s); using temporary IDs`);
                    await remapCollidingRows(connection, before);
                }
            }
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        }

        // MySQL keeps AUTO_INCREMENT above the current maximum if this floor
        // is lower, so this is safe for both the direct and collision paths.
        await connection.execute(`ALTER TABLE items AUTO_INCREMENT = ${AUTO_INCREMENT_FLOOR}`);
        const after = await readStats(connection);
        printStats('after', after);
    } finally {
        if (connection) connection.release();
        await pool.end();
    }
}

main().catch(error => {
    console.error(`[renumber-item-serials] failed: ${error.message}`);
    process.exitCode = 1;
});
