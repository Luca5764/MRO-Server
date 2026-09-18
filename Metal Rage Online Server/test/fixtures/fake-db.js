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
            async getConnection()
            {
                throw new Error('fake-db: pool.getConnection() not mocked (needed for saveEquippedLoadout / shop purchase transactions -- not exercised by the current golden samples)');
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
            throw new Error('fake-db: getItemCatalog not mocked yet (shop / cash shop listing -- not exercised by the current golden samples)');
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
