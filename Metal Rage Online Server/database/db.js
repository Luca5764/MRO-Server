const mysql = require('mysql2/promise');
const path = require('path');
const { getShareType } = require('./item-share-type');

// E1 (docs/design/e1-item-ownership.md, docs/backlog.md): ownership
// (`items`) vs. equipped-where (`item_equips`) split, so a ShareType=1
// item (副武器/裝備) can be equipped on more than one mech at once instead
// of only the mech its `items.mech_type` column happens to point at.
// 'disabled' = every read/write path below is byte-identical to pre-E1
// behaviour; saveEquippedLoadout() never touches item_equips and still
// rewrites items.mech_type the old way. 🟡 未經跨公司審查. The real `mro`
// database has already been migrated and the 23 duplicate-serial merge
// applied (docs/journal/2026-09-19-1710-e1-migration-run.md, backup at
// ~/mro-backups/mro-before-e1-20260919-170807.sql). SWITCH-CONVERGE:
// default flipped to 'enabled' to match the test server, which has been
// running this way since that migration.
// `let`, not `const`: test/item-equips.js needs to flip this at runtime (via
// _setItemEquipsModeForTests below) to exercise the 'disabled' path without
// changing the default every other test/golden sample runs against. Every
// production code path only ever reads it, never writes it.
let ITEM_EQUIPS_MODE = 'enabled'; // 'disabled' | 'enabled'

// Test-only: see test/item-equips.js. Not used by any production code path.
function _setItemEquipsModeForTests(mode)
{
    ITEM_EQUIPS_MODE = mode === 'enabled' ? 'enabled' : 'disabled';
}

// P1B-IMPL (docs/backlog.md P1b, 🟡 未經跨公司審查): createAccount's
// starterLoadouts issues every mech's DefaultSetList items as real owned
// items+item_equips rows, so the client inventory shows five identical
// copies of the same booster (one per mech that defaults to it) instead of
// the one the client already synthesizes at SerialIndex=0
// (ZPanel_InvenItems.uc:338-383). 'disabled' (default) = createAccount
// unchanged. 'enabled' = createAccount skips the whole starterLoadouts
// insert loop; the parts stay empty, WearInfo_SN sends serial 0 for them
// (itemIndex 0 too, see below), and Game_User_SN's CANONICAL_LOADOUTS
// fallback (dispatch/room/room-game-user.sender.js, via
// database/default-loadouts.js) fills in the same default item IDs the
// client would have shown anyway.
let P1B_NO_DEFAULT_ITEMS = 'disabled'; // 'disabled' | 'enabled'

// Test-only, same pattern as _setItemEquipsModeForTests above.
function _setP1bNoDefaultItemsForTests(mode)
{
    P1B_NO_DEFAULT_ITEMS = mode === 'enabled' ? 'enabled' : 'disabled';
}

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
    // Sol batch6 review (docs/research/2026-09-20-sol-review/p3.md, "疑點 --
    // 時間欄位"): mysql2's own `timezone` option (client-side JS Date <->
    // SQL string conversion -- NOT a `SET time_zone` on the MySQL session,
    // and NOT what NOW()/CURRENT_TIMESTAMP use, those stay server-side)
    // defaults to 'local', i.e. whatever OS timezone the Node process
    // happens to run under. Pinned to 'Z' (UTC) so a JS `Date` bound as a
    // DATETIME parameter (currently only database/db.js's
    // recordMatchWithAccumulation(), P3 step 3's matches/match_rounds
    // started_at/ended_at) always converts the same way regardless of what
    // machine the server runs on -- see docs/design/
    // p3-step3-writeback-impl.md §2.1 for what this means for those
    // columns. grep confirms nothing else in this codebase currently reads
    // a TIMESTAMP/DATETIME column back into application logic (accounts.
    // created_at/last_login, tutorials.completed_at are written via SQL
    // NOW() and never read anywhere outside database/db.js itself), so this
    // has no observable effect on any existing wire-facing behaviour.
    timezone: 'Z',
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
 * E1: get this account's item_equips rows (which serial is equipped on
 * which mech/part slot). Empty when ITEM_EQUIPS_MODE is 'disabled' -- the
 * table is only ever written by saveEquippedLoadout() in that mode.
 * @param {number} accountId
 * @returns {Promise<object[]>} rows of {id, account_id, item_id, mech_slot, part_slot}
 */
async function getItemEquips(accountId)
{
    const [rows] = await pool.execute(
        'SELECT * FROM item_equips WHERE account_id = ? ORDER BY id', [accountId]
    );
    return rows;
}

/**
 * E1: `getItems()` rows, but with one synthetic view row per item_equips
 * entry instead of relying on items.mech_type/equipped. A ShareType=1
 * serial equipped on two mechs therefore appears twice (same `id`, two
 * different `mech_type`), which is what lets it show up in both mechs'
 * WearInfo/Game_User_SN/Slot_Change_SA output -- the three read paths that
 * already filter `items` by `item.equipped && item.mech_type === X &&
 * item.part_slot === Y` work unmodified against this list.
 *
 * ITEM_EQUIPS_MODE 'disabled': returns getItems(accountId) unchanged
 * (byte-identical to pre-E1 behaviour). Ownership-only readers (shop,
 * package/inventory list, ItemInfo_SN's per-serial rows) must keep calling
 * getItems() directly -- this function's rows are not 1:1 with owned
 * serials once a serial is equipped on more than one mech.
 * @param {number} accountId
 * @returns {Promise<object[]>}
 */
async function getItemsWithEquipViews(accountId)
{
    const items = await getItems(accountId);
    if (ITEM_EQUIPS_MODE !== 'enabled') {
        return items;
    }
    const equips = await getItemEquips(accountId);
    const byId = new Map(items.map(item => [Number(item.id), item]));
    const views = items.map(item => ({ ...item, equipped: 0 }));
    for (const equip of equips) {
        const base = byId.get(Number(equip.item_id));
        if (!base) continue; // stale row (serial no longer owned) -- migration/manual DB edit, not expected in normal play
        views.push({
            ...base,
            mech_type: Number(equip.mech_slot),
            part_slot: Number(equip.part_slot),
            equipped: 1,
        });
    }
    return views;
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

        // E1: also fetch item_id here (not just id) so the item_equips block
        // below can look up ShareType per serial without a second query.
        const itemIdBySerial = new Map();
        if (uniqueSerials.length > 0) {
            const placeholders = uniqueSerials.map(() => '?').join(', ');
            const [rows] = await conn.execute(
                `SELECT id, item_id FROM items WHERE account_id = ? AND id IN (${placeholders})`,
                [accountId, ...uniqueSerials]
            );
            const found = new Set(rows.map(row => Number(row.id)));
            if (uniqueSerials.some(serial => !found.has(serial))) {
                throw new Error('equipped serial is not owned by account');
            }
            for (const row of rows) itemIdBySerial.set(Number(row.id), Number(row.item_id));
        }

        // E1 fix round (Sol batch4 (5), coordinator decision 2026-09-19):
        // with ITEM_EQUIPS_MODE 'enabled', item_equips is the *only* source
        // of truth for what's equipped where -- items.equipped/items.mech_type
        // are legacy columns that stop being touched entirely (no clear, no
        // set) so they can never look authoritative-but-stale to a reader or
        // a migration rerun. items.part_slot is part of that same "where is
        // this equipped" concept, so it is left alone here too. Disabled
        // (default) mode is completely unchanged below.
        if (ITEM_EQUIPS_MODE !== 'enabled') {
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
        }

        // E1 item_equips write (ITEM_EQUIPS_MODE 'enabled' only): clear this
        // mech's rows, then for each newly-equipped serial, drop its rows on
        // every other mech first when ShareType==0 (ZPage_Hangar.uc:917-924
        // ItemFree() -- equipping on B unequips A), before inserting. A
        // ShareType==1 serial keeps whatever rows it already had on other
        // mechs, so it can show up equipped on several at once.
        if (ITEM_EQUIPS_MODE === 'enabled') {
            await conn.execute(
                'DELETE FROM item_equips WHERE account_id = ? AND mech_slot = ?',
                [accountId, mechType]
            );
            for (let partSlot = 0; partSlot < serials.length; partSlot++) {
                const serial = Number(serials[partSlot]);
                if (serial === 0) continue;
                const itemId = itemIdBySerial.get(serial);
                if (getShareType(itemId) === 0) {
                    await conn.execute(
                        'DELETE FROM item_equips WHERE account_id = ? AND item_id = ?',
                        [accountId, serial]
                    );
                }
                await conn.execute(
                    'INSERT INTO item_equips (account_id, item_id, mech_slot, part_slot) VALUES (?, ?, ?, ?)',
                    [accountId, serial, mechType, partSlot]
                );
            }
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
            // No booster row: Table 4 DefaultSetList has Booster=0 for this
            // mech (docs/journal/2026-09-16-33-weapon-model-true-root-cause-verified.md),
            // matching CANONICAL_LOADOUTS[4].booster in room-game-user.sender.js.

            // Mech 5 - Firepower / 聖戰士 (TB01m)
            [5, 0, 15200101], // Body: TB01m
            [5, 1, 22200201], // Main: Firepower cannon
            [5, 2, 32100101], // SubLeft: AOM_a
            // No booster row: Table 4 DefaultSetList has Booster=0 for this
            // mech too, same source as above.

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

        // P1B_NO_DEFAULT_ITEMS 'enabled': skip issuing DefaultSetList items
        // entirely. Every part stays empty, so the reads that fill in a
        // default (WearInfo_SN's per-slot 0/0 -> client-side synthesized
        // entry, Game_User_SN's CANONICAL_LOADOUTS fallback) take over
        // instead of the account owning a real duplicate-prone copy.
        if (P1B_NO_DEFAULT_ITEMS !== 'enabled') {
            for (const [mechType, partSlot, itemId] of starterLoadouts) {
                const [result] = await conn.execute(
                    'INSERT INTO items (account_id, item_id, slot, mech_type, part_slot, quantity, equipped) VALUES (?, ?, ?, ?, ?, 1, 1)',
                    [accountId, itemId, partSlot, mechType, partSlot]
                );
                // E1: keep item_equips in sync so a fresh account's first
                // WearInfo_SN/Game_User_SN looks identical whether
                // ITEM_EQUIPS_MODE is on or off (see saveEquippedLoadout's own
                // item_equips write for the general case).
                if (ITEM_EQUIPS_MODE === 'enabled') {
                    await conn.execute(
                        'INSERT INTO item_equips (account_id, item_id, mech_slot, part_slot) VALUES (?, ?, ?, ?)',
                        [accountId, result.insertId, mechType, partSlot]
                    );
                }
            }
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

// Sol batch6 review (docs/research/2026-09-20-sol-review/p3.md, "需修改 --
// 整場寫回不是原子操作" / "需修改 -- UPDATE 靜默零列"): recordMatch() and
// applyMatchAccumulation() used to be two separate functions, each opening
// its own pool.getConnection()/transaction -- match-stats.js's
// scheduleMatchWriteback() called recordMatch() once, then looped calling
// applyMatchAccumulation() per participant, so a mid-loop failure left
// matches/match_rounds/match_participants committed with only some
// participants' records/mech_levels updated ("不接受逐玩家部分成功", Sol's
// own words on the design doc). These have been merged into
// recordMatchWithAccumulation() below, which does the matches/rounds/
// participants inserts AND every accumulation UPDATE on the same
// connection inside one transaction -- any failure (including an
// affectedRows mismatch, see insertAccumulation below) rolls back
// everything, not just the accumulation loop.
//
// insertMatchRow/insertRoundRows/insertParticipantRows/insertAccumulation
// below are private helpers (not exported) that take an already-open `conn`
// -- factored out of the single function so the SQL text/param order is
// identical to what test/p3-db-recordmatch.js already asserted before this
// restructuring, not because anything else calls them independently.

async function insertMatchRow(conn, match)
{
    const [result] = await conn.execute(
        `INSERT INTO matches
            (room_id, map_id, difficulty, round_target, host_account_id,
             started_at, ended_at, result, win_team_rank, is_test, suspicious)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            match.roomId ?? null,
            match.mapId,
            match.difficulty || 0,
            match.roundTarget,
            match.hostAccountId ?? null,
            new Date(match.startedAtMs),
            match.endedAtMs != null ? new Date(match.endedAtMs) : null,
            match.result || 0,
            match.winTeamRank || 0,
            match.isTest ? 1 : 0,
            match.suspicious ? 1 : 0,
        ]
    );
    return result.insertId;
}

async function insertRoundRows(conn, matchId, rounds)
{
    for (const round of rounds) {
        await conn.execute(
            `INSERT INTO match_rounds
                (match_id, round_number, started_at, duration_seconds, death_cn_count, suspicious)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                matchId,
                round.roundNumber,
                new Date(round.startedAtMs),
                Math.max(0, Math.round(round.durationSeconds || 0)),
                round.deathCnCount || 0,
                round.suspicious ? 1 : 0,
            ]
        );
    }
}

async function insertParticipantRows(conn, matchId, participants)
{
    for (const participant of participants) {
        await conn.execute(
            `INSERT INTO match_participants
                (match_id, account_id, team, kills, deaths, exp_gained, point_gained, result)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                matchId,
                participant.accountId,
                participant.team || 0,
                participant.kills || 0,
                participant.deaths || 0,
                participant.expGained || 0,
                participant.pointGained || 0,
                participant.result || 0,
            ]
        );
    }
}

// Sol batch6 review point 4 ("需修改 -- UPDATE 靜默零列"): the UPDATE ...
// WHERE account_id = ? must affect exactly one row -- an unknown/deleted
// account, or a typo'd mechType with no matching mech_levels row, used to
// commit silently and report success. Now throws (which the caller's
// transaction rolls back on) when affectedRows is anything other than 1.
async function insertAccumulation(conn, accountId, delta)
{
    const [recordsResult] = await conn.execute(
        `UPDATE records
            SET exp = exp + ?, wins = wins + ?, losses = losses + ?, draws = draws + ?,
                kills = kills + ?, deaths = deaths + ?
          WHERE account_id = ?`,
        [
            delta.exp || 0,
            delta.wins || 0,
            delta.losses || 0,
            delta.draws || 0,
            delta.kills || 0,
            delta.deaths || 0,
            accountId,
        ]
    );
    if (recordsResult.affectedRows !== 1) {
        throw new Error(`applyMatchAccumulation: expected UPDATE records to affect 1 row for account_id=${accountId}, affected ${recordsResult.affectedRows}`);
    }

    if (delta.mechType) {
        const [mechResult] = await conn.execute(
            `UPDATE mech_levels
                SET exp = exp + ?, kills = kills + ?, deaths = deaths + ?, sorties = sorties + ?
              WHERE account_id = ? AND mech_type = ?`,
            [
                delta.mechExp || 0,
                delta.mechKills || 0,
                delta.mechDeaths || 0,
                delta.mechSorties || 0,
                accountId,
                delta.mechType,
            ]
        );
        if (mechResult.affectedRows !== 1) {
            throw new Error(`applyMatchAccumulation: expected UPDATE mech_levels to affect 1 row for account_id=${accountId} mech_type=${delta.mechType}, affected ${mechResult.affectedRows}`);
        }
    }
}

/**
 * P3 step 3 (docs/design/p3-step1-writeback.md §2.2/§3, docs/design/
 * p3-step3-writeback-impl.md; Sol batch6 review points 3/4): insert one
 * finished match + its rounds + participants, AND every accumulation delta
 * in `accumulations`, all in a single transaction. Requires the `matches`/
 * `match_rounds`/`match_participants` tables from
 * tools/migrate-p3-match-tables.js to already exist.
 *
 * Only ever called for a match that reached EndGame_SN -- never for an
 * aborted match (dispatch/room/match-stats.js's
 * ABORTED_MATCHES_ARE_NOT_PERSISTED; the caller there simply never calls
 * this for that case, this function does not itself special-case anything).
 *
 * `accumulations` is a separate array from `participants`, not derived from
 * it here -- match-stats.js's caller passes an empty array for an is_test
 * match (matches/rounds/participants rows are still written, is_test=1,
 * but nothing accumulates into records/mech_levels -- Lead decision
 * 2026-09-20, unchanged by this restructuring).
 *
 * @param {object} match
 * @param {number|null} match.roomId
 * @param {number} match.mapId
 * @param {number} match.difficulty
 * @param {number} match.roundTarget
 * @param {number|null} match.hostAccountId
 * @param {number} match.startedAtMs - Date.now()-style ms epoch
 * @param {number|null} match.endedAtMs
 * @param {number} match.result - Campaign_CN action byte: 1 win, 2 fail
 * @param {number} [match.winTeamRank]
 * @param {boolean} [match.isTest]
 * @param {boolean} [match.suspicious]
 * @param {Array<{roundNumber: number, startedAtMs: number, durationSeconds: number, deathCnCount: number, suspicious?: boolean}>} rounds
 * @param {Array<{accountId: number, team?: number, kills?: number, deaths?: number, expGained?: number, pointGained?: number, result?: number}>} participants
 * @param {Array<{accountId: number, exp?: number, wins?: number, losses?: number, draws?: number, kills?: number, deaths?: number, mechType?: number, mechExp?: number, mechKills?: number, mechDeaths?: number, mechSorties?: number}>} accumulations
 * @returns {Promise<number>} the new matches.id
 */
async function recordMatchWithAccumulation(match, rounds, participants, accumulations)
{
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const matchId = await insertMatchRow(conn, match);
        await insertRoundRows(conn, matchId, rounds);
        await insertParticipantRows(conn, matchId, participants);

        for (const delta of accumulations) {
            await insertAccumulation(conn, delta.accountId, delta);
        }

        await conn.commit();
        return matchId;
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }
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
    getItemEquips,
    getItemsWithEquipViews,
    getItemCatalog,
    createAccount,
    saveEquippedLoadout,
    completeTutorial,
    updateLastLogin,
    recordMatchWithAccumulation,
    _setItemEquipsModeForTests,
    _setP1bNoDefaultItemsForTests,
};

// Live getter, not a plain property: ITEM_EQUIPS_MODE is a `let` (see its
// declaration above) that test/item-equips.js flips at runtime, and every
// dispatch/*.js call site reads it as `db.ITEM_EQUIPS_MODE` on demand -- a
// plain `ITEM_EQUIPS_MODE,` shorthand here would freeze in the value from
// when this module first loaded instead of tracking later test changes.
Object.defineProperty(module.exports, 'ITEM_EQUIPS_MODE', {
    enumerable: true,
    get() { return ITEM_EQUIPS_MODE; },
});

// Same reasoning as ITEM_EQUIPS_MODE's getter above, for
// _setP1bNoDefaultItemsForTests.
Object.defineProperty(module.exports, 'P1B_NO_DEFAULT_ITEMS', {
    enumerable: true,
    get() { return P1B_NO_DEFAULT_ITEMS; },
});
