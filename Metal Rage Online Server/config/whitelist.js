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
//
// D1-6-IMPL (docs/backlog.md, docs/design/d1-step6-battle-broadcast.md §3.1,
// §5 step 5): `users` entries may now be a plain string (old format,
// unchanged behaviour, no hostAddress) or an object `{ name, hostAddress }`
// -- the account that battle-starts a 2+ member PvE room as host needs a
// configured LAN/VPN address to hand to the room's other members
// (Ready_Host_SN 0x00420115, community.dispatch.js's 0x00420114 handler).
// `cached` is now a Map<lowercaseName, { hostAddress: string|null }> instead
// of a Set, so isAllowed()'s `.has()` behaviour is unchanged either way; the
// new getHostAddress() reads the same entry.
//
// ISTEST-WIRE (docs/backlog.md, docs/design/p3-step1-writeback.md §5 step
// 3): the same object-format entry may also carry an optional boolean
// `isTest` (default false when absent, matching plain-string entries). It
// is read at login (account.dispatch.js's CQ_LOGIN_WASABII and
// gamelogin.dispatch.js's Login_Again_CQ) into a connection-local
// `client.isTestAccount_`, which dispatch/room/match-stats.js's
// emitMatchSummary() already reads defensively (always false until this
// wiring existed). No format/length validation needed -- unlike
// hostAddress this never goes on the wire, it only gates whether a match
// summary marker is flagged `is_test`.

const CONFIG_PATH = path.join(__dirname, 'allowed-users.json');
// Ready_Host_SN's ip field is "hostAddress/MapName" -- see
// dispatch/gate.game.dispatch.js's READY_HOST_SN_URL_MODE='fixed_0x13'
// comment (16 bytes total for that combined field in the old fixed-size
// mode) and config/server.js's own publicHost precedent (same 15-char limit,
// same SN_SERVER_ADD-sized reasoning) -- reused here per the design doc's
// "apply the same length check/warning style as config/server.js" note, not
// a re-derivation of a new number.
const HOST_ADDRESS_MAX_CHARS = 15;

// SOL-REVIEW-2 point/new-doubt (docs/research/2026-09-19-sol-review/
// batch2.md, "新疑點"): hostAddress only had a length check, not a format
// check -- a typo'd value would go straight into Ready_Host_SN's
// "hostAddress/MapName" ANSI string unvalidated, and the joining client
// would silently try to ClientTravel to garbage. Requires four dot-separated
// decimal octets, each 0-255, no leading/trailing/extra content (`^...$`,
// not a substring match). Deliberately IPv4-only -- hostAddress feeds a
// fixed "IP/Map" ANSI string format (battle-host.md), and this project has
// no IPv6 evidence anywhere else (config/server.js's publicHost has the same
// implicit assumption).
const IPV4_LITERAL_RE = /^(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])){3}$/;

function isDottedIpv4Literal(value)
{
    return IPV4_LITERAL_RE.test(value);
}

// undefined = not loaded yet; null = load failed/missing (whitelist off,
// matches pre-W1 behaviour); Map = loaded and on.
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
        const map = new Map();
        for (const entry of users) {
            let name;
            let hostAddress = null;
            let isTest = false;
            if (entry && typeof entry === 'object') {
                name = String(entry.name || '').toLowerCase();
                if (!name) {
                    console.warn(`[whitelist] skipping a config/allowed-users.json entry with no "name": ${JSON.stringify(entry)}`);
                    continue;
                }
                isTest = entry.isTest === true;
                if (typeof entry.hostAddress === 'string' && entry.hostAddress.trim().length > 0) {
                    const trimmed = entry.hostAddress.trim();
                    if (trimmed.length > HOST_ADDRESS_MAX_CHARS) {
                        console.warn(
                            `[whitelist] hostAddress "${trimmed}" for user "${entry.name}" is longer than `
                            + `${HOST_ADDRESS_MAX_CHARS} chars -- ignoring (battle start as host in a room `
                            + `with other members will be refused for this account until it is shortened)`
                        );
                    } else if (!isDottedIpv4Literal(trimmed)) {
                        console.warn(
                            `[whitelist] hostAddress "${trimmed}" for user "${entry.name}" is not a dotted `
                            + `IPv4 literal (e.g. "192.168.0.42") -- ignoring (battle start as host in a room `
                            + `with other members will be refused for this account until it is fixed)`
                        );
                    } else {
                        hostAddress = trimmed;
                    }
                }
            } else {
                name = String(entry).toLowerCase();
            }
            map.set(name, { hostAddress, isTest });
        }
        cached = map;
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
    const map = load();
    if (map === null)
        return true;
    return map.has(String(username).toLowerCase());
}

/**
 * @returns {string} 'off' or 'on(<n> users)', for packetlog's build event.
 */
function status()
{
    const map = load();
    return map === null ? 'off' : `on(${map.size} users)`;
}

/**
 * D1-6-IMPL (docs/design/d1-step6-battle-broadcast.md §3.1, §5 step 5): the
 * configured hostAddress for an account, used by gate.game.dispatch.js's
 * HOST_ADDRESS_REQUIRE_MODE check and community.dispatch.js's non-host
 * Ready_Host_SN send.
 * @param {string} username
 * @returns {string|null} the configured hostAddress, or null if the
 *   whitelist is off, the username is not in it, or it has no hostAddress
 *   set (old string-format entries always fall in this last case).
 */
function getHostAddress(username)
{
    const map = load();
    if (map === null)
        return null;
    const entry = map.get(String(username).toLowerCase());
    return entry ? entry.hostAddress : null;
}

/**
 * ISTEST-WIRE (docs/design/p3-step1-writeback.md §5 step 3): whether this
 * account is the dedicated test account, per its `isTest` flag in
 * config/allowed-users.json. Set on the client at login
 * (account.dispatch.js / gamelogin.dispatch.js) as `client.isTestAccount_`,
 * read by dispatch/room/match-stats.js's emitMatchSummary().
 * @param {string} username
 * @returns {boolean} false if the whitelist is off, the username is not in
 *   it, or its entry has no `isTest: true` (old string-format entries and
 *   entries that omit the field both fall in this last case).
 */
function isTestAccount(username)
{
    const map = load();
    if (map === null)
        return false;
    const entry = map.get(String(username).toLowerCase());
    return !!(entry && entry.isTest);
}

module.exports = { isAllowed, status, getHostAddress, isTestAccount };
