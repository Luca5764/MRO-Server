const packetlog = require('./packetlog.js');

// Session state that outlives a TCP connection.
//
// The client does not hold one connection for a play session. When it travels
// to a game map it drops the socket and logs in again from scratch — observed
// 2026-09-15: connection 2 received the game-start request, closed, and the
// scene-entry notification that followed arrived on connection 4.
//
// Everything the dispatch handlers know about a player lives on the
// NetworkClient, so all of it died at that close. gameStarted_ in particular:
// game.dispatch.js only begins the ready/round sequence when it is true, and
// after the reconnect it is undefined, so the server answers the scene-entry
// notification with a lobby ACK and combat never starts. The operator died
// in-game during that window and the server received nothing at all.
//
// This keeps that state keyed by account instead, so it survives the gap.
//
// Nothing here changes what the server sends. It changes where the state
// lives, and that is all it should ever do.

// Carried across reconnects: what the player intends and where they are.
const CARRIED = [
    'gameStarted_',
    'battleStartSequenceArmed_',
    'isTrueCampaign_',
    'roomIndex_',
    'roomType_',
    'rawRoomType_',
    'roomName_',
    'mapId_',
    'playRound_',
    'mapSeed_',
    'gameMode_',
    'maxPlayers_',
    'campaignRoom_',
    'campaignMapCacheKey_',
    'currentHangarSlot_',
    'mapChangeOneTime_',
];

// Deliberately NOT carried, and the reason matters:
//
//   roomMasterSent_, roomEnterAcked_, gameUserBootstrapSent_,
//   readyHostHandshakeSent_, postGameWaitReadyHostSent_,
//   waitingGameInfoExperimentSent_, gameWaitExperimentSent_
//       "this connection already sent that" flags. A fresh connection has sent
//       nothing, and carrying these would suppress bootstrap packets the new
//       connection still needs.
//
//   roomStateRetryTimers_
//       holds live timer handles belonging to the old connection.
//
//   accountId_, nickname_, pilot_, username_
//       re-established from the database on re-auth; not ours to restore.

/** @type {Map<number, object>} accountId -> carried state */
const store = new Map();

/**
 * Copies the carried fields off a client into its account's session.
 * Only defined values are stored, so a connection that never knew about a room
 * cannot erase what another one recorded.
 * @param {object} client
 */
function save(client)
{
    const id = client.accountId_;
    if (id === undefined || id === null)
        return;

    let state = store.get(id);
    if (state === undefined)
    {
        state = {};
        store.set(id, state);
    }

    for (const field of CARRIED)
    {
        const value = client[field];
        if (value === undefined)
            continue;

        if (field === 'gameStarted_' && value === true && state[field] !== true)
            packetlog.marker('gameStarted_ false -> true', 'auto');

        state[field] = value;
    }
}

/**
 * Applies a stored session onto a freshly connected client.
 * Fields the new connection has already set for itself win, so a genuine
 * change on this connection is never overwritten by a stale one.
 * @param {object} client
 */
function restore(client)
{
    const id = client.accountId_;
    if (id === undefined || id === null)
        return;

    const state = store.get(id);
    if (state === undefined)
        return;

    const applied = [];
    for (const field of CARRIED)
    {
        if (state[field] === undefined || client[field] !== undefined)
            continue;

        client[field] = state[field];
        applied.push(`${field.replace(/_$/, '')}=${state[field]}`);
    }

    if (applied.length > 0)
    {
        console.log(`[session] Restored account #${id} across reconnect: ${applied.join(' ')}`);
        packetlog.marker(`session restored across reconnect: ${applied.join(' ')}`, 'auto');
    }
}

/**
 * Forgets an account's session. Not called anywhere yet — kept so that
 * clearing state is an explicit act rather than something that happens by
 * accident when a socket drops, which is the bug this module exists to fix.
 * @param {number} accountId
 */
function clear(accountId)
{
    store.delete(accountId);
}

module.exports = { save, restore, clear, CARRIED };
