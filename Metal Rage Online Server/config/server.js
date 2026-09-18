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

const CONFIG_PATH = path.join(__dirname, 'server.json');
const DEFAULT_PUBLIC_HOST = '127.0.0.1';

// undefined = not loaded yet; string = loaded (either the configured host or
// the default, if the file/field is missing or invalid).
let cachedPublicHost = undefined;

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
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.warn(`[config/server] failed to read config/server.json (${err.message}) -- using ${DEFAULT_PUBLIC_HOST}`);
        }
        cachedPublicHost = DEFAULT_PUBLIC_HOST;
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

module.exports = { getPublicHost };
