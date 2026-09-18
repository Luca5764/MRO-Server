const fs = require('fs');
const path = require('path');

// Backlog W1: account whitelist. See AGENTS.md hard constraint #2 (do not
// expose the server to an untrusted network) -- there is no password check,
// so any unknown username currently auto-creates an account. This module is
// the gate in front of that. If config/allowed-users.json does not exist,
// behaviour is unchanged from before W1: every username is allowed.
//
// config/allowed-users.json is gitignored (per-operator, like
// database/config.json); config/allowed-users.example.json is the committed
// template.

const CONFIG_PATH = path.join(__dirname, 'allowed-users.json');

// undefined = not loaded yet; null = load failed/missing (whitelist off,
// matches pre-W1 behaviour); Set = loaded and on.
let cached = undefined;

function load()
{
    if (cached !== undefined)
        return cached;

    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        const users = Array.isArray(parsed.users) ? parsed.users : [];

        // Case-insensitive on purpose: metalrageserver.sql declares
        // `accounts`.`username` as `VARCHAR(25) ... DEFAULT CHARSET=utf8mb4`
        // with no explicit COLLATE, so it uses the table/connection default
        // collation. On this project's MySQL (8.0.46, confirmed via `mysql
        // --version` in this worktree) that default is utf8mb4_0900_ai_ci,
        // which is case-insensitive -- `db.getAccountByUsername()`'s
        // `WHERE username = ?` already matches "Lucas" and "lucas" as the
        // same account. If this whitelist compared case-sensitively, a name
        // whitelisted as "Lucas" could reject a login typed as "lucas" that
        // the DB would otherwise treat as the same account. Live collation
        // was not queried directly (no local MySQL socket in this worktree);
        // this is read from the schema + documented MySQL 8.0 default, not
        // a live SHOW TABLE STATUS.
        cached = new Set(users.map((u) => String(u).toLowerCase()));
        console.log(`[whitelist] Loaded ${cached.size} allowed user(s) from config/allowed-users.json`);
    } catch (err) {
        if (err.code === 'ENOENT') {
            console.warn(
                '[whitelist] !!!!! config/allowed-users.json not found -- '
                + 'login is OPEN, any username auto-creates an account !!!!!'
            );
        } else {
            console.warn(
                `[whitelist] !!!!! failed to read config/allowed-users.json (${err.message}) `
                + '-- login is OPEN, any username auto-creates an account !!!!!'
            );
        }
        cached = null;
    }
    return cached;
}

/**
 * @param {string} username
 * @returns {boolean} true if login should proceed -- always true when the
 *   whitelist is off (no config file), matching pre-W1 behaviour.
 */
function isAllowed(username)
{
    const set = load();
    if (set === null)
        return true;
    return set.has(String(username).toLowerCase());
}

/**
 * @returns {string} 'off' or 'on(<n> users)', for packetlog's build event.
 */
function status()
{
    const set = load();
    return set === null ? 'off' : `on(${set.size} users)`;
}

module.exports = { isAllowed, status };
