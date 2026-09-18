// A deterministic, in-memory stand-in for database/db.js used by the golden
// replay harness (test/replay-golden.js). Never touches MySQL.
//
// Design decision (see A6 report in the commit this file was added by): the
// harness has no credentials for the operator's real `mro` database in this
// sandbox, and the task contract forbids writing to it regardless. So a
// golden sample's "expected" send bytes are not the bytes the original
// session log recorded -- the original log's sends reflect DB state (money,
// items, record) that has since drifted and cannot be reconstructed byte-for-
// byte from the log alone. Instead, "expected" is a snapshot captured once
// against this fixture at a known-good commit (`--record`, see
// replay-golden.js). Replaying the same recv bytes through the same fixture
// must reproduce the same send bytes forever after, or dispatch logic
// changed. That is the regression this tool actually catches; it does not
// prove the original historical session replays byte-identical.
//
// Only the DB entry points actually exercised by the golden samples in
// test/golden/ are filled in below. Anything else throws a clearly-labelled
// "not mocked" error instead of returning a guessed shape, so a golden
// sample that needs it fails loudly at the exact call site instead of
// silently producing wrong bytes.

const fs = require('fs');
const path = require('path');

// getItemCatalog() (database/db.js) is a static join of `catalog` and
// `item_catalog` -- both seeded once from metalrageserver.sql and never
// written to by any handler (grep confirms no INSERT/UPDATE against either
// table outside that seed file and the account-creation stored procedure,
// which only touches `accounts`/`records`/`mech_levels`/`items`). So instead
// of hand-typing a second copy of ~2100 rows (guessing at content the task
// explicitly says not to guess), this parses the same SQL file the real
// schema ships from and reproduces db.js's exact LEFT JOIN + COALESCE/NULLIF
// logic. If metalrageserver.sql's seed data changes, the golden shop sample
// needs re-recording -- same category as any other schema/data migration,
// not a hidden guess.
let cachedCatalog = null;

function nullIfZero(value)
{
    const n = Number(value);
    return n === 0 ? null : n;
}

function loadCatalogFromSql()
{
    if (cachedCatalog) return cachedCatalog;

    const sqlPath = path.join(__dirname, '..', '..', 'metalrageserver.sql');
    const text = fs.readFileSync(sqlPath, 'utf-8');

    function extractBlock(insertPrefix)
    {
        const start = text.indexOf(insertPrefix);
        if (start === -1) throw new Error(`fake-db: could not find "${insertPrefix}" in metalrageserver.sql`);
        const end = text.indexOf(';', start);
        return text.slice(start + insertPrefix.length, end);
    }

    // item_catalog: (item_id, 'code', 'name', 'category') -- only these four
    // columns are ever inserted; every other column (price, discount_price,
    // is_show, is_new, is_hot, category_type) takes the CREATE TABLE default,
    // matched below rather than re-typed.
    const itemCatalogByItemId = new Map();
    const icBlock = extractBlock("INSERT INTO `item_catalog` (`item_id`, `code`, `name`, `category`) VALUES");
    const icRe = /\((\d+),\s*'([^']*)',\s*'([^']*)',\s*'([^']*)'\)/g;
    let m;
    while ((m = icRe.exec(icBlock)) !== null)
    {
        itemCatalogByItemId.set(Number(m[1]), {
            code: m[2], name: m[3], category: m[4],
            price: 1000, discount_price: 1000, is_show: 1, is_new: 0, is_hot: 0,
        });
    }

    // catalog: (item_id, category_type, mech_type, price), many tuples per line.
    const catalogRows = [];
    const cBlock = extractBlock("INSERT INTO `catalog` (`item_id`, `category_type`, `mech_type`, `price`) VALUES");
    const cRe = /\((\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)/g;
    while ((m = cRe.exec(cBlock)) !== null)
    {
        catalogRows.push({
            item_id: Number(m[1]),
            category_type: Number(m[2]),
            mech_type: Number(m[3]),
            price: Number(m[4]),
        });
    }

    // Same shape as db.js's SELECT ... FROM catalog c LEFT JOIN item_catalog
    // ic ... ORDER BY c.item_id.
    catalogRows.sort((a, b) => a.item_id - b.item_id);
    cachedCatalog = catalogRows.map((c) => {
        const ic = itemCatalogByItemId.get(c.item_id) || {};
        const price = nullIfZero(ic.price) ?? nullIfZero(c.price) ?? 1000;
        const discount_price = nullIfZero(ic.discount_price) ?? nullIfZero(ic.price) ?? nullIfZero(c.price) ?? 1000;
        return {
            item_id: c.item_id,
            category_type: c.category_type,
            mech_type: c.mech_type,
            price,
            discount_price,
            is_show: ic.is_show ?? 1,
            is_new: ic.is_new ?? 0,
            is_hot: ic.is_hot ?? 0,
            category: ic.category ?? '',
        };
    });

    return cachedCatalog;
}

function makeFixtureDb(overrides = {})
{
    const account = Object.assign({
        id: 1,
        username: 'replaybot',
        nickname: 'ReplayBot',
        pilot: 101,
        account_level: 1,
        gender: 1,
        point: 100000,
        cash: 0,
        coupon: 0,
        last_login: null,
    }, overrides.account);

    const record = Object.assign({
        account_id: account.id,
        level: 5,
        exp: 12345,
        exp_max: 20000,
        wins: 3,
        losses: 1,
        draws: 0,
        kills: 10,
        deaths: 4,
    }, overrides.record);

    const mechLevels = overrides.mechLevels || [
        { account_id: account.id, mech_type: 1, level: 3, exp: 500, kills: 5, deaths: 2, sorties: 6 },
    ];

    const licenses = overrides.licenses || [
        { account_id: account.id, slot: 1, mech_type: 1, license_type: 1 },
    ];

    const maps = overrides.maps || [
        { account_id: account.id, map_id: 1 },
        { account_id: account.id, map_id: 2 },
    ];

    const tutorials = overrides.tutorials || [
        { account_id: account.id, tutorial_id: 1, completed: 1, completed_at: null },
    ];

    const items = overrides.items || [
        { id: 100001, account_id: account.id, item_id: 11100101, slot: 0, mech_type: 1, part_slot: 0, quantity: 1, equipped: 1 },
    ];
    // items.id is AUTO_INCREMENT in the real schema, starting at 100001
    // (metalrageserver.sql, and see the SerialIndex 101-999 client-reserved-
    // range comment on the `items` table). Next id picks up after whatever
    // the fixture already seeded, so a purchase in a golden sample gets a
    // deterministic, non-colliding serial every run.
    let nextItemId = items.reduce((max, item) => Math.max(max, Number(item.id) || 0), 100000) + 1;

    // Diagnostic call log, surfaced in the harness report so a "not mocked"
    // failure can say exactly what was asked for and in what order.
    const calls = [];
    const logCall = (name, args) => calls.push({ name, args });

    // Tiny SQL matcher for the handful of raw db.pool.execute() calls
    // dispatch handlers make directly instead of going through a named
    // db.js function. Matched by a normalized prefix, not a real parser --
    // good enough for the known call sites in gamelogin.dispatch.js /
    // account.dispatch.js. Add a case here (with a comment pointing at the
    // call site) before adding a new golden sample that needs one.
    async function poolExecute(sql, params = [])
    {
        logCall('pool.execute', { sql, params });
        const norm = sql.replace(/\s+/g, ' ').trim();

        // gamelogin.dispatch.js handleGameLogin(): finds who just logged in
        // on the dispatch server, since the game-server connection carries
        // no account id of its own yet.
        if (norm.startsWith('SELECT * FROM accounts ORDER BY last_login DESC LIMIT 1'))
            return [[account]];

        throw new Error(`fake-db: unmocked pool.execute query: ${norm}`);
    }

    return {
        _fixture: { account, record, mechLevels, licenses, maps, tutorials, items },
        _calls: calls,

        pool: {
            execute: poolExecute,
            // Backs the transactional path in room.dispatch.js
            // handleShopPurchase(): a
            // SELECT ... FOR UPDATE, then either an UPDATE+INSERT+commit or a
            // rollback if funds are short. This fixture has no real
            // transaction isolation -- there is only ever one caller in a
            // replay, and the handler only calls rollback() before any write
            // has happened (right after the balance check), never after, so
            // "no real undo" and "real rollback" are indistinguishable for
            // every call site that exists today. If a future call site
            // writes-then-rolls-back, this will need actual undo logic; note
            // it here rather than silently getting it wrong.
            async getConnection()
            {
                logCall('pool.getConnection', {});
                let released = false;
                return {
                    async beginTransaction() { logCall('conn.beginTransaction', {}); },
                    async commit() { logCall('conn.commit', {}); },
                    async rollback() { logCall('conn.rollback', {}); },
                    release() { released = true; logCall('conn.release', { released }); },
                    async execute(sql, params = [])
                    {
                        logCall('conn.execute', { sql, params });
                        const norm = sql.replace(/\s+/g, ' ').trim();

                        if (norm.startsWith('SELECT point FROM accounts WHERE id = ?'))
                        {
                            const [id] = params;
                            return [Number(id) === account.id ? [{ point: account.point }] : []];
                        }
                        if (norm.startsWith('UPDATE accounts SET point = ? WHERE id = ?'))
                        {
                            const [newPoint, id] = params;
                            if (Number(id) === account.id) account.point = Number(newPoint);
                            return [{ affectedRows: Number(id) === account.id ? 1 : 0 }];
                        }
                        if (norm.startsWith('INSERT INTO items (account_id, item_id, slot, mech_type, part_slot, quantity, equipped) VALUES'))
                        {
                            const [accountId, itemId, slot, mechType, partSlot] = params;
                            const id = nextItemId++;
                            items.push({
                                id, account_id: Number(accountId), item_id: Number(itemId),
                                slot: Number(slot), mech_type: Number(mechType), part_slot: Number(partSlot),
                                quantity: 1, equipped: 0,
                            });
                            return [{ insertId: id, affectedRows: 1 }];
                        }

                        throw new Error(`fake-db: unmocked conn.execute query: ${norm}`);
                    },
                };
            },
        },

        async getAccountByUsername(username)
        {
            logCall('getAccountByUsername', { username });
            // This fixture only ever models one account, and the golden
            // samples' recv packets carry whatever username the operator was
            // actually logged in as when the session was recorded (real
            // client bytes, replayed as-is -- see replay-golden.js header).
            // Matching that exactly would make every sample either need its
            // own fixture account or fall through to account.dispatch.js's
            // "no DB row" hardcoded-defaults branch instead of exercising
            // the real DB-backed send path. Answering for any username here
            // keeps the fixture account single and the golden samples
            // exercising the code that actually reads it.
            return account;
        },
        async getAccountByNickname(nickname)
        {
            logCall('getAccountByNickname', { nickname });
            return nickname === account.nickname ? account : null;
        },
        async getRecord(accountId)
        {
            logCall('getRecord', { accountId });
            return Number(accountId) === account.id ? record : null;
        },
        async getMechLevels(accountId)
        {
            logCall('getMechLevels', { accountId });
            return Number(accountId) === account.id ? mechLevels : [];
        },
        async getMechLicenses(accountId)
        {
            logCall('getMechLicenses', { accountId });
            return Number(accountId) === account.id ? licenses : [];
        },
        async getMaps(accountId)
        {
            logCall('getMaps', { accountId });
            return Number(accountId) === account.id ? maps : [];
        },
        async getTutorials(accountId)
        {
            logCall('getTutorials', { accountId });
            return Number(accountId) === account.id ? tutorials : [];
        },
        async getItems(accountId)
        {
            logCall('getItems', { accountId });
            return Number(accountId) === account.id ? items : [];
        },
        async getItemCatalog()
        {
            logCall('getItemCatalog', {});
            return loadCatalogFromSql();
        },
        async createAccount(username, nickname, pilot)
        {
            logCall('createAccount', { username, nickname, pilot });
            throw new Error('fake-db: createAccount not mocked -- golden samples must log in as a pre-existing fixture account, not trigger auto-create');
        },
        async saveEquippedLoadout(accountId, mechType, serials)
        {
            logCall('saveEquippedLoadout', { accountId, mechType, serials });
            throw new Error('fake-db: saveEquippedLoadout not mocked yet (hangar loadout save -- not exercised by the current golden samples)');
        },
        async completeTutorial(accountId, tutorialId)
        {
            logCall('completeTutorial', { accountId, tutorialId });
            const t = tutorials.find(t => t.tutorial_id === tutorialId);
            if (t) t.completed = 1;
        },
        async updateLastLogin(accountId)
        {
            logCall('updateLastLogin', { accountId });
        },
    };
}

module.exports = { makeFixtureDb };
