const fs = require('fs');
const path = require('path');

// Backlog N1: game-server address advertised to clients in SN_SERVER_ADD
// (0x00220101, dispatch/account.dispatch.js sendGateInfo()). That handler
// used to hardcode '127.0.0.1', which only works when the client runs on
// the same host as the WSL2 server. A second host on the LAN needs the
// Windows-side portproxy address instead. config/server.json is per-operator
// (like database/config.json / config/allowed-users.json) and gitignored;
// config/server.example.json is the committed template. If the file or the
// publicHost field is missing, behaviour is unchanged from before N1:
// '127.0.0.1' is used.

// LIVES (test mode): pveExtraLives is an optional int added to
// GAME_ITEM_INFO.PveRespawnAddCount (Game_User_SN 0x00222112, rec+0x64,
// written via Game_Item_Add param_8 -- 0x107029ff, verified against the
// disassembly at 0x107d8ae0, see
// dispatch/room/room-game-user.sender.js). The client computes total lives
// as DefNumLive + PveRespawnAddCount (ZModePve.uc:473-474
// SetNumLive(DefNumLive + ItemInfo.PveRespawnAddCount)). Missing/0 =
// unchanged behaviour.

// RANK (docs/backlog.md, test mode): pveFixedRank is an optional int 1-11
// (1=F .. 11=SS, ZPage_PveResult.uc:113-165's m_Rank.Score = WinTeamRank-1)
// sent as User_Score_SN 0x00222221's WinTeamRank right before EndGame_SN on
// a successful PvE clear (dispatch/lobby.dispatch.js's Campaign_CN
// handler). Missing/absent = User_Score_SN is not sent at all, unchanged
// from before RANK. This is a fixed test value to prove the packet works,
// not the real rank formula -- see docs/research/2026-09-19-rank/notes.md.

const CONFIG_PATH = path.join(__dirname, 'server.json');
const DEFAULT_PUBLIC_HOST = '127.0.0.1';
const DEFAULT_PVE_EXTRA_LIVES = 0;
// No DEFAULT_PVE_FIXED_RANK: absent/invalid both mean "don't send".

// undefined = not loaded yet; string = loaded (either the configured host or
// the default, if the file/field is missing or invalid).
let cachedPublicHost = undefined;
// undefined = not loaded yet; number = loaded (either the configured value
// or the default, if the file/field is missing or invalid).
let cachedPveExtraLives = undefined;
// Always reset by load() (see cachedPublicHost's own loaded-check above,
// which load() is gated on): a number 1-11 when configured, undefined when
// absent/invalid/config file missing.
let cachedPveFixedRank = undefined;

function load()
{
    if (cachedPublicHost !== undefined)
        return cachedPublicHost;

    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        const host = typeof parsed.publicHost === 'string' ? parsed.publicHost.trim() : '';
        if (host.length === 0) {
            console.warn(
                `[config/server] config/server.json has no usable publicHost -- `
                + `falling back to ${DEFAULT_PUBLIC_HOST}`
            );
            cachedPublicHost = DEFAULT_PUBLIC_HOST;
        } else if (host.length > 15) {
            // SN_SERVER_ADD's address field is 0x10 (16) bytes wide,
            // dispatch/account.dispatch.js sendGateInfo(): body.write(...,
            // offset + 0x5), next field 'Developer Gate' starts at
            // offset + 0x15. 15 chars + NUL fits; longer would overwrite it.
            console.warn(
                `[config/server] publicHost "${host}" is longer than 15 chars, `
                + `would overflow the SN_SERVER_ADD address field -- `
                + `falling back to ${DEFAULT_PUBLIC_HOST}`
            );
            cachedPublicHost = DEFAULT_PUBLIC_HOST;
        } else {
            cachedPublicHost = host;
            console.log(`[config/server] Loaded publicHost=${host} from config/server.json`);
        }

        const rawLives = parsed.pveExtraLives;
        const lives = Number.isInteger(rawLives) ? rawLives : NaN;
        if (rawLives === undefined) {
            cachedPveExtraLives = DEFAULT_PVE_EXTRA_LIVES;
        } else if (!Number.isInteger(lives) || lives < 0) {
            console.warn(
                `[config/server] pveExtraLives "${rawLives}" is not a non-negative integer -- `
                + `falling back to ${DEFAULT_PVE_EXTRA_LIVES}`
            );
            cachedPveExtraLives = DEFAULT_PVE_EXTRA_LIVES;
        } else {
            cachedPveExtraLives = lives;
            console.log(`[config/server] Loaded pveExtraLives=${lives} from config/server.json`);
        }

        const rawRank = parsed.pveFixedRank;
        if (rawRank === undefined) {
            cachedPveFixedRank = undefined;
        } else if (!Number.isInteger(rawRank) || rawRank < 1 || rawRank > 11) {
            console.warn(
                `[config/server] pveFixedRank "${rawRank}" is not an integer 1-11 -- `
                + `not sending User_Score_SN`
            );
            cachedPveFixedRank = undefined;
        } else {
            cachedPveFixedRank = rawRank;
            console.log(`[config/server] Loaded pveFixedRank=${rawRank} from config/server.json`);
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.warn(`[config/server] failed to read config/server.json (${err.message}) -- using ${DEFAULT_PUBLIC_HOST}`);
        }
        cachedPublicHost = DEFAULT_PUBLIC_HOST;
        cachedPveExtraLives = DEFAULT_PVE_EXTRA_LIVES;
        cachedPveFixedRank = undefined;
    }
    return cachedPublicHost;
}

/**
 * @returns {string} the game-server address to advertise in SN_SERVER_ADD,
 *   '127.0.0.1' when config/server.json is absent (matches pre-N1 behaviour).
 */
function getPublicHost()
{
    return load();
}

/**
 * @returns {number} GAME_ITEM_INFO.PveRespawnAddCount bonus to add on top of
 *   the map's DefNumLive (test mode), 0 when config/server.json is absent or
 *   the field is missing (matches pre-LIVES behaviour).
 */
function getPveExtraLives()
{
    load();
    return cachedPveExtraLives;
}

/**
 * @returns {number|undefined} User_Score_SN 0x00222221 WinTeamRank to send
 *   before EndGame_SN on a successful PvE clear (test mode), undefined when
 *   config/server.json is absent or the field is missing/invalid -- in
 *   which case User_Score_SN is not sent at all (matches pre-RANK behaviour).
 */
function getPveFixedRank()
{
    load();
    return cachedPveFixedRank;
}

module.exports = { getPublicHost, getPveExtraLives, getPveFixedRank };
