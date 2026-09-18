const crypto = require('crypto');

// D1 step 0: identity chain between the dispatch server (9211) and the game
// server (30907). See docs/design/d1-multiplayer-room.md §4 and
// docs/journal/2026-09-18-2350-game-login-token-chain.md for the DLL trace.
//
// [DLL] ZDispatchGate::Leave_SA body (thunk 0x107dc823, body starts
// 0x107dc7d3) reads body+0x06 and body+0x0A as u32 on success (`[esi+0x16]`,
// `[esi+0x1a]`) and passes them to Certify_Away_Set (0x10715f70, call site
// 0x107dc846), which stores them at singleton+0x311c / +0x3120 (absolute
// 0x108e5504 / 0x108e5508). ZDispatchAccount::Login_Again_CQ (thunk
// 0x10708adf, body 0x107c3e70) reads those same addresses back
// (0x107c3ef5 / 0x107c3f00) and sends them verbatim in body+0 / body+4 on
// every 30907 connection on this login, including reconnects caused by a
// map travel — the client never clears the stored pair itself.
//
// Server-side: Gate Leave_SA (dispatch/gate.dispatch.js CQ_LEAVE, triggered
// when the client leaves the Gate to connect to the game server) calls
// issueKey() and writes (accountId, key) into the response body. 30907's
// Login_Again_CQ handler (dispatch/gamelogin.dispatch.js) calls lookup() to
// turn that pair back into an accountId instead of guessing the most-
// recently-logged-in row.
//
// Deliberately NOT under dispatch/ — server.js's reloadServices() (/reload)
// only clears require.cache for dispatch/, dispatch.js and game.js, so a
// table living here survives a hot reload. It is still memory-only and
// resets on a full process restart, same as rooms.js will (D1 §7: no
// persistence).

/** @type {Map<number, number>} accountId -> the key issued at that account's
 * most recent Gate login. Not one-time: valid until the same account logs in
 * at the Gate again (task contract condition 2 — a map-travel reconnect
 * reuses the same key, only a fresh Gate login rotates it). */
const keyByAccount = new Map();

// Every distinct accountId that has ever produced a key since this process
// started. Only grows. Backs the ≤1-account fallback rule below — never
// shrinks, because "an account has logged in from the Gate this run" cannot
// become false again while the process is alive.
const seenAccountIds = new Set();

// Test-only injection point (task contract condition 3). Production always
// goes through the default generator below (crypto.randomInt, never 0).
// Tests can call setKeyGenerator() for a reproducible key; nothing in the
// production dispatch code ever calls it.
let keyGenerator = defaultKeyGenerator;

function defaultKeyGenerator()
{
    // randomInt(1, 0xFFFFFFFF) is inclusive-exclusive, so the result is in
    // [1, 0xFFFFFFFE] — never 0, and fits a u32 for body+0x0A.
    return crypto.randomInt(1, 0xFFFFFFFF);
}

/** Test-only: replace the key generator. See test/login-token.js. */
function setKeyGenerator(fn)
{
    keyGenerator = fn;
}

/** Test-only: restore the production generator. */
function resetKeyGenerator()
{
    keyGenerator = defaultKeyGenerator;
}

/** Test-only: forget every issued key and seen account, so a test file can
 * start from a clean process-lifetime state without actually restarting the
 * process. Never called from production dispatch code. */
function resetForTest()
{
    keyByAccount.clear();
    seenAccountIds.clear();
}

/**
 * Issues a fresh key for accountId, overwriting any key issued at a
 * previous Gate login for the same account. Called from
 * dispatch/gate.dispatch.js when Leave_SA 0x00220132 is about to be sent
 * with success status.
 * @param {number} accountId
 * @returns {number} key (u32, never 0)
 */
function issueKey(accountId)
{
    let key = keyGenerator() >>> 0;
    if (key === 0) key = 1; // guard: 0 means "no token" to lookup()
    keyByAccount.set(accountId, key);
    seenAccountIds.add(accountId);
    return key;
}

/**
 * Called from dispatch/gamelogin.dispatch.js on Login_Again_CQ 0x00110124.
 * @param {number} accountId - body+0
 * @param {number} key - body+4
 * @returns {number|null} accountId if the pair matches the most recently
 *   issued key for that account, otherwise null (covers both an all-zero
 *   body and a stale/unknown key).
 */
function lookup(accountId, key)
{
    if (!accountId || !key) return null;
    const current = keyByAccount.get(accountId);
    if (current === undefined) return null;
    return current === key ? accountId : null;
}

/** How many distinct accounts have completed a Gate login since this
 * process started. Backs the fallback-safety check in gamelogin.dispatch.js
 * (task contract condition 1). */
function seenAccountCount()
{
    return seenAccountIds.size;
}

module.exports = {
    issueKey,
    lookup,
    seenAccountCount,
    setKeyGenerator,
    resetKeyGenerator,
    resetForTest,
};
