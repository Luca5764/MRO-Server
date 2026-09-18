const mysql = require('mysql2/promise');
const path = require('path');

// Load DB config from config.json (editable per-machine)
let dbConfig = { host: '127.0.0.1', port: 3306, user: 'root', password: '', database: 'mro' };
try {
    const loaded = require('./config.json');
    dbConfig = { ...dbConfig, ...loaded };
} catch (e) {
    console.log('[DB] No config.json found, using defaults (root@localhost, no password, database: mro)');
}

console.log(`[DB] Connecting to ${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);

const pool = mysql.createPool({
    ...dbConfig,
    waitForConnections: true,
    connectionLimit: 10,
});

/**
 * Find an account by username. Returns null if not found.
 * @param {string} username
 * @returns {Promise<object|null>}
 */
async function getAccountByUsername(username)
{
    const [rows] = await pool.execute(
        'SELECT * FROM accounts WHERE username = ?', [username]
    );
    return rows.length > 0 ? rows[0] : null;
}

/**
 * Find an account by nickname. Returns null if not found.
 * @param {string} nickname
 * @returns {Promise<object|null>}
 */
async function getAccountByNickname(nickname)
{
    const [rows] = await pool.execute(
        'SELECT * FROM accounts WHERE nickname = ?', [nickname]
    );
    return rows.length > 0 ? rows[0] : null;
}

/**
 * Find an account by id. Returns null if not found.
 * D1 step 0 (auth-tokens.js): 30907's Login_Again_CQ handler resolves the
 * connection's account by id via the Gate-issued token instead of guessing
 * the most-recently-logged-in row.
 * @param {number} accountId
 * @returns {Promise<object|null>}
 */
async function getAccountById(accountId)
{
    const [rows] = await pool.execute(
        'SELECT * FROM accounts WHERE id = ?', [accountId]
    );
    return rows.length > 0 ? rows[0] : null;
}

/**
 * Get player record (level, W/L/K/D stats).
 * @param {number} accountId
 * @returns {Promise<object|null>}
 */
async function getRecord(accountId)
{
    const [rows] = await pool.execute(
        'SELECT * FROM records WHERE account_id = ?', [accountId]
    );
    return rows.length > 0 ? rows[0] : null;
}

/**
 * Get all mech levels for an account.
 * @param {number} accountId
 * @returns {Promise<object[]>}
 */
async function getMechLevels(accountId)
{
    const [rows] = await pool.execute(
        'SELECT * FROM mech_levels WHERE account_id = ? ORDER BY mech_type', [accountId]
    );
    return rows;
}

/**
 * Get all mech licenses for an account.
 * @param {number} accountId
 * @returns {Promise<object[]>}
 */
async function getMechLicenses(accountId)
{
    const [rows] = await pool.execute(
        'SELECT * FROM mech_licenses WHERE account_id = ? ORDER BY slot', [accountId]
    );
    return rows;
}

/**
 * Get unlocked maps for an account.
 * @param {number} accountId
 * @returns {Promise<object[]>}
 */
async function getMaps(accountId)
{
    const [rows] = await pool.execute(
        'SELECT * FROM maps WHERE account_id = ? ORDER BY map_id', [accountId]
    );
    return rows;
}

/**
 * Get tutorials for an account.
 * @param {number} accountId
 * @returns {Promise<object[]>}
 */
async function getTutorials(accountId)
{
    const [rows] = await pool.execute(
        'SELECT * FROM tutorials WHERE account_id = ? ORDER BY tutorial_id', [accountId]
    );
    return rows;
}

/**
 * Get items for an account.
 * @param {number} accountId
 * @returns {Promise<object[]>}
 */
async function getItems(accountId)
{
    const [rows] = await pool.execute(
        'SELECT * FROM items WHERE account_id = ? ORDER BY id', [accountId]
    );
    return rows;
}

/**
 * Save one hangar slot's six equipped item serials.
 *
 * The client sends item serials (the `items.id` values), not catalog item IDs.
 * A zero serial means that part is empty. The whole update is transactional so
 * a malformed or unknown serial cannot leave the target mech half-cleared.
 *
 * @param {number} accountId
 * @param {number} mechType 1..8, the client's 1-based hangar slot
 * @param {number[]} serials [body, main, left, right, equipment, skin]
 */
async function saveEquippedLoadout(accountId, mechType, serials)
{
    if (!Number.isInteger(Number(accountId)) || Number(accountId) <= 0) {
        throw new Error('invalid account id');
    }
    if (!Number.isInteger(Number(mechType)) || Number(mechType) < 1 || Number(mechType) > 8) {
        throw new Error(`invalid mech slot: ${mechType}`);
    }
    if (!Array.isArray(serials) || serials.length !== 6 || serials.some(serial =>
        !Number.isInteger(Number(serial)) || Number(serial) < 0 || Number(serial) > 0xFFFFFFFF
    )) {
        throw new Error('invalid equipped serial list');
    }

    const selectedSerials = serials.filter(serial => Number(serial) !== 0).map(Number);
    const uniqueSerials = [...new Set(selectedSerials)];
    if (uniqueSerials.length !== selectedSerials.length) {
        throw new Error('duplicate equipped serial');
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        if (uniqueSerials.length > 0) {
            const placeholders = uniqueSerials.map(() => '?').join(', ');
            const [rows] = await conn.execute(
                `SELECT id FROM items WHERE account_id = ? AND id IN (${placeholders})`,
                [accountId, ...uniqueSerials]
            );
            const found = new Set(rows.map(row => Number(row.id)));
            if (uniqueSerials.some(serial => !found.has(serial))) {
                throw new Error('equipped serial is not owned by account');
            }
        }

        // Clear the complete target slot first; zero serials intentionally
        // leave the corresponding part empty.
        await conn.execute(
            'UPDATE items SET equipped = 0 WHERE account_id = ? AND mech_type = ? AND part_slot BETWEEN 0 AND 5',
            [accountId, mechType]
        );

        // An item serial can only be equipped in one place at a time.
        if (uniqueSerials.length > 0) {
            const placeholders = uniqueSerials.map(() => '?').join(', ');
            await conn.execute(
                `UPDATE items SET equipped = 0 WHERE account_id = ? AND id IN (${placeholders})`,
                [accountId, ...uniqueSerials]
            );
        }

        for (let partSlot = 0; partSlot < serials.length; partSlot++) {
            const serial = Number(serials[partSlot]);
            if (serial === 0) continue;
            await conn.execute(
                'UPDATE items SET equipped = 1, mech_type = ?, part_slot = ? WHERE account_id = ? AND id = ?',
                [mechType, partSlot, accountId, serial]
            );
        }

        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * Create a new player account with all default data.
 * @param {string} username
 * @param {string} nickname
 * @param {number} pilot - 101 or 102
 * @returns {Promise<number>} - The new account ID
 */
async function createAccount(username, nickname, pilot)
{
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [result] = await conn.execute(
            'INSERT INTO accounts (username, nickname, pilot, account_level) VALUES (?, ?, ?, 4)',
            [username, nickname, pilot]
        );
        const accountId = result.insertId;

        // Initialize player record
        await conn.execute(
            'INSERT INTO records (account_id) VALUES (?)', [accountId]
        );

        // Initialize all 8 mech levels
        for (let i = 1; i <= 8; i++) {
            await conn.execute(
                'INSERT INTO mech_levels (account_id, mech_type) VALUES (?, ?)',
                [accountId, i]
            );
        }

        // Give all 8 mech licenses (license_type=0 = permanent/purchased)
        for (let i = 0; i < 8; i++) {
            await conn.execute(
                'INSERT INTO mech_licenses (account_id, slot, mech_type, license_type) VALUES (?, ?, ?, 1)',
                [accountId, i, i + 1]
            );
        }

        // Unlock all 6 maps
        for (let i = 0; i < 6; i++) {
            await conn.execute(
                'INSERT INTO maps (account_id, map_id) VALUES (?, ?)',
                [accountId, i]
            );
        }

        // Initialize 4 tutorials (not completed)
        for (let i = 1; i <= 4; i++) {
            await conn.execute(
                'INSERT INTO tutorials (account_id, tutorial_id) VALUES (?, ?)',
                [accountId, i]
            );
        }

        // Give starter equipment for all 8 mechs using REAL item IDs
        // extracted from Cache.Bin. ID format: XXYYZZ01
        //   2XXXXXXX = Main Weapons, 3XXXXXXX = Assist Weapons,
        //   4XXXXXXX = Boosters/Support
        //
        // Part slots: 0=Body, 1=Primary, 2=Sub-left, 3=Sub-right, 4=Booster, 5=Equipment
        //
        // Mech types: 1=Light(SA), 2=Assault(AA), 3=Medium(HA), 4=Sniper(NB),
        //   5=Firepower(TB), 6=Engineer(BB), 7=Maintenance(EA), 8=Observation(OA)
        // Official default loadouts from Cache.Bin Table 4 (DefaultSetList)
        // [mech_type, part_slot, item_id]
        // Inventory equipment slots: 0=body, 1=main, 2=sub, 4=booster
        const starterLoadouts = [
            // Mech 1 - Light / Vanguard (SA01m)
            [1, 0, 11100101], // Body: SA01m Vanguard
            [1, 1, 22100101], // Main: MOM_a Light rifle
            [1, 2, 32100101], // SubLeft: AOM_a Secondary machine gun
            [1, 4, 41100101], // Booster: BPE_a Plasma thruster

            // Mech 2 - Assault / Dual (AA01m)
            [2, 0, 12100101], // Body: AA01m Dual
            [2, 1, 26300101], // Main: Dual main weapon
            [2, 2, 32100101], // SubLeft: AOM_a
            [2, 4, 41100101], // Booster: BPE_a

            // Mech 3 - Medium / 劍虎 (HA01m)
            [3, 0, 13100101], // Body: HA01m
            [3, 1, 21200101], // Main: MNC_a Multi-column smoothbore
            [3, 2, 32100101], // SubLeft: AOM_a
            [3, 4, 41100101], // Booster: BPE_a

            // Mech 4 - Sniper / 判官 (NB01m)
            [4, 0, 14200101], // Body: NB01m
            [4, 1, 24100201], // Main: Sniper rifle
            [4, 2, 32100101], // SubLeft: AOM_a
            [4, 4, 41100101], // Booster: BPE_a

            // Mech 5 - Firepower / 聖戰士 (TB01m)
            [5, 0, 15200101], // Body: TB01m
            [5, 1, 22200201], // Main: Firepower cannon
            [5, 2, 32100101], // SubLeft: AOM_a
            [5, 4, 41200101], // Booster: BHE_a

            // Mech 6 - Engineer / 雷霆 (BB01m)
            [6, 0, 16200101], // Body: BB01m
            [6, 1, 25300101], // Main: BB01m main
            [6, 2, 38500101], // SubLeft: ATA_a
            [6, 4, 43100101], // Booster: ABA_a

            // Mech 7 - Maintenance / 智多星 (EA01m)
            [7, 0, 17100101], // Body: EA01m
            [7, 1, 28100101], // Main: Repair/beam
            [7, 2, 31100101], // SubLeft: AOC_a
            [7, 4, 42100101], // Booster: ADA_a

            // Mech 8 - Observation / 觀星者 (OA01m)
            [8, 0, 18100101], // Body: OA01m
            [8, 1, 28300101], // Main: MPF_a Remote detection
            [8, 2, 39100101], // SubLeft: AEF_a EMP
            [8, 4, 41100101], // Booster: BPE_a
        ];

        for (const [mechType, partSlot, itemId] of starterLoadouts) {
            await conn.execute(
                'INSERT INTO items (account_id, item_id, slot, mech_type, part_slot, quantity, equipped) VALUES (?, ?, ?, ?, ?, 1, 1)',
                [accountId, itemId, partSlot, mechType, partSlot]
            );
        }

        await conn.commit();
        return accountId;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
}

/**
 * Mark a tutorial as completed.
 * @param {number} accountId
 * @param {number} tutorialId
 */
async function completeTutorial(accountId, tutorialId)
{
    await pool.execute(
        'UPDATE tutorials SET completed = 1, completed_at = NOW() WHERE account_id = ? AND tutorial_id = ?',
        [accountId, tutorialId]
    );
}

/**
 * Update last_login timestamp.
 * @param {number} accountId
 */
async function updateLastLogin(accountId)
{
    await pool.execute(
        'UPDATE accounts SET last_login = NOW() WHERE id = ?', [accountId]
    );
}

async function getItemCatalog()
{
    const [rows] = await pool.execute(
        `SELECT
            c.item_id,
            c.category_type,
            c.mech_type,
            COALESCE(NULLIF(ic.price, 0), NULLIF(c.price, 0), 1000) AS price,
            COALESCE(NULLIF(ic.discount_price, 0), NULLIF(ic.price, 0), NULLIF(c.price, 0), 1000) AS discount_price,
            COALESCE(ic.is_show, 1) AS is_show,
            COALESCE(ic.is_new, 0) AS is_new,
            COALESCE(ic.is_hot, 0) AS is_hot,
            COALESCE(ic.category, '') AS category
         FROM catalog c
         LEFT JOIN item_catalog ic ON ic.item_id = c.item_id
         ORDER BY c.item_id`
    );
    return rows;
}

module.exports = {
    pool,
    getAccountByUsername,
    getAccountByNickname,
    getAccountById,
    getRecord,
    getMechLevels,
    getMechLicenses,
    getMaps,
    getTutorials,
    getItems,
    getItemCatalog,
    createAccount,
    saveEquippedLoadout,
    completeTutorial,
    updateLastLogin,
};
