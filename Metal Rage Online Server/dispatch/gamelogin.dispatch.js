const NetworkClient = require("../client");
const db = require('../database/db');
const session = require('../session.js');
const { clampMoney, moneyBigInt } = require('./money');
// P3 step 1 (docs/design/p3-step1-writeback.md §0): shared RecordInfo_SN
// body builder, also used by account.dispatch.js (9211).
const { writeRecordInfoBody } = require('./record-info.builder');
const authTokens = require('../auth-tokens');
const packetlog = require('../packetlog');
const whitelist = require('../config/whitelist.js');
// LOBBY-LIST-LOGIN (docs/backlog.md D1-4 follow-up): a client that logs in
// after a room already exists never got Room_List_SN on channel enter --
// only the Leave-back-to-lobby path (room.dispatch.js) sent it. Reuse the
// same helper and buffer style as that path.
const rooms = require('../rooms.js');
const { sendFullRoomList } = require('./room/room-list.sender');
const { resolveRealMapIds, sendMapInfoSN } = require('./map-info.sender');

// Game server login handler
// After connecting to the game server (port 30907), the client sends
// 0x00110124 (CQ) to authenticate/enter. We respond with 0x00110125 (SA).
// Then replay account data from the database.

const CQ_GAME_LOGIN = 0x00110124;
const SA_GAME_LOGIN = 0x00110125;

const SN_DEFAULT_INFO  = 0x00210101;
const SN_RECORD_INFO   = 0x00210103;
const SN_MECH_LEVEL    = 0x00210104;
const SN_GRADE_INFO    = 0x00510101;   // ZDispatchCommunity::Grade_Info_SN → Account_Grade_Set → account grade (0 normal … 4 dev)
const SN_WEAR_INFO     = 0x00210113;   // DLL: WearInfo_SN (0x210112 = ExpirationItem_SN)
const SN_COMPLETE      = 0x00210121;
const SA_LOBBY_ENTER   = 0x00230112;
const SN_LICENSE_INFO  = 0x00260101;   // must be sent before SN_COMPLETE / lobby enter
const { MAX_MECH_COUNT, MAX_SLOT_COUNT } = require('../datatypes/enums');

// H7-MAPINFO-30907 (docs/backlog.md; docs/journal/2026-09-19-1000-maplist-
// single-entry.md): 9211's MapInfo_SN 0x00210115 is only sent once, on
// login (dispatch/account.dispatch.js). But the client's post-9211-login
// level travel (Browse Index.tzp / Store_01) appears to reset ZNetwork_DJ's
// default-object data — the room map selector then finds m_MapInfoList
// empty, even with RoomType==2 correctly drawn on screen. Data sent on this
// 30907 login (ItemInfo/WearInfo below) survives that travel, so trigger:
// 30907 game-server login (Login_Again_CQ 0x00110124) — resend MapInfo_SN
// here too when this switch is on. Verified ✅ together with
// mapInfoRealIdMode: the map-select popup lists all 4 PvE maps
// (docs/state.md H7 row, docs/journal/2026-09-19-1000-maplist-single-entry.md,
// 未經跨公司審查). SWITCH-CONVERGE: default flipped to 'enabled'.
let mapInfoOnGameLoginMode = 'enabled'; // 'disabled' | 'enabled'

function _setMapInfoOnGameLoginModeForTests(mode) {
    mapInfoOnGameLoginMode = mode;
}

// Same helper as room.dispatch.js's sendLobbyBootstrapAfterRoomLeave --
// Room_List_SN's own sender (room-list.sender.js) takes a
// getExactMessageBuffer-shaped callback, and the Leave path uses the exact
// (non-16-byte-padded) buffer, not client.getMessageBuffer.
function getExactMessageBuffer(type, bodySize) {
    const msg = Buffer.alloc(0x10 + bodySize);
    msg.writeUint16BE(msg.length, 0x6);
    msg.writeUint32BE(type, 0xC);
    return [msg, msg.subarray(0x10)];
}

const ACCOUNT_LEVEL_STR = { 0: '0\0', 1: '1\0', 2: '2\0', 3: '3\0', 4: '4\0' };
// LEGEND-GRANT-IMPL: GameItemRecord-position-derived index for the WearInfo
// body slot, shared with room.dispatch.js / account.dispatch.js. See
// dispatch/cache-index.js for the switch (BODY_INDEX_GIR_MODE) this feeds
// below. Note: unlike account.dispatch.js's 9-id BODY_IDX table, this file's
// WearInfo body slot previously applied NO conversion at all (see notes
// update) -- 'disabled' preserves that raw-item_id behavior.
const cacheIndex = require('./cache-index');

module.exports =
class ZGameLoginDispatch
{
    dispatch(client, type, body)
    {
        //Handle known messages
        if (type !== CQ_GAME_LOGIN && type !== 0x00220111)
            return false;

        console.log(`[ZGameLoginDispatch] Message 0x${type.toString(16).padStart(8, '0')} (${body.length} bytes)`);
        if (body.length > 0)
            console.log(`[ZGameLoginDispatch] Body:`, body.toString('hex'));

        switch (type)
        {
            case CQ_GAME_LOGIN:
                this.handleGameLogin(client, body);
                return true;

            case 0x00220111:
                this.handleChannelEnter(client, body);
                return true;

            default:
                return false;
        }
    }

    async handleGameLogin(client, body)
    {
        try {
            console.log(`[ZGameLoginDispatch] >> Game server login request`);

            // SA_GAME_LOGIN - success
            {
                const [msg, respBody] = client.getMessageBuffer(SA_GAME_LOGIN, 0x6);
                respBody.writeUint16LE(0x0000, 0);
                respBody.writeUint32LE(0x0000, 2);
                client.send(msg);
            }

            // D1 step 0: Login_Again_CQ body+0 (accountId) / +4 (key) is the pair
            // the client got from Gate Leave_SA 0x00220132 and echoes back
            // verbatim on this connection, including reconnects caused by a map
            // travel. See auth-tokens.js for the DLL chain and
            // docs/journal/2026-09-18-2350-game-login-token-chain.md.
            const tokenAccountIdInBody = body.length >= 4 ? body.readUInt32LE(0) : 0;
            const tokenKeyInBody = body.length >= 8 ? body.readUInt32LE(4) : 0;
            const tokenAccountId = authTokens.lookup(tokenAccountIdInBody, tokenKeyInBody);

            let account = null;
            let tutorials = [];   // declared here so SN_COMPLETE can always access it

            if (tokenAccountId !== null) {
                account = await db.getAccountById(tokenAccountId);
                if (!account) {
                    console.error(`[ZGameLoginDispatch] Token named accountId #${tokenAccountId} but no such account row exists`);
                }
            } else {
                // No usable token (all-zero body from a client that has not been
                // through the patched Gate yet, or a stale/mismatched key). Falling
                // back to "most recently logged-in account" only tells players
                // apart correctly while at most one distinct account has ever
                // completed a Gate login this process run — with two or more it
                // silently hands someone the wrong account (the exact bug D1 step 0
                // exists to remove; docs/design/d1-multiplayer-room.md §4). Refuse
                // rather than guess once that stops being true.
                const seenAccounts = authTokens.seenAccountCount();
                if (seenAccounts <= 1) {
                    console.warn(`[ZGameLoginDispatch] No valid Login_Again_CQ token (body=${body.toString('hex')}), falling back to last_login (${seenAccounts} distinct account(s) seen this run)`);
                    packetlog.marker(`WARNING: Login_Again_CQ token missing/invalid (body=${body.toString('hex')}); falling back to ORDER BY last_login because only ${seenAccounts} distinct account(s) have logged in via Gate this run`, 'auto');
                    const [rows] = await db.pool.execute(
                        'SELECT * FROM accounts ORDER BY last_login DESC LIMIT 1'
                    );
                    if (rows.length > 0) account = rows[0];
                } else {
                    console.error(`[ZGameLoginDispatch] !!! REFUSING Login_Again_CQ: no valid token (body=${body.toString('hex')}) and ${seenAccounts} distinct accounts have logged in via Gate this run -- cannot guess identity. Closing connection.`);
                    packetlog.marker(`!!! REFUSING Login_Again_CQ conn=${client.connId_}: no valid token (body=${body.toString('hex')}), ${seenAccounts} distinct accounts seen this run -- connection closed rather than guessing identity`, 'auto');
                    client.socket_.destroy();
                    return;
                }
            }

            if (account) {
                // Store account info on the client for other dispatchers
                client.accountId_ = account.id;
                client.nickname_ = account.nickname;
                // D1-6: whitelist.getHostAddress() is keyed by username; only the
                // 9211 connection set this before, so on 30907 it was undefined.
                client.username_ = account.username;
                // ISTEST-WIRE (docs/design/p3-step1-writeback.md §5 step 3):
                // same reasoning as the username_ line above -- this 30907
                // connection is the one that later drives a room/match
                // (dispatch/room/match-stats.js's emitMatchSummary()), so it
                // needs its own isTestAccount_, not just the 9211 one.
                client.isTestAccount_ = whitelist.isTestAccount(account.username);
                client.pilot_ = Number(account.pilot) || 101;
                client.point_ = clampMoney(account.point, 100000);
                client.cash_ = clampMoney(account.cash, 0);
                client.coupon_ = clampMoney(account.coupon, 0);

                // This is the first moment this connection knows who it is, so
                // it is the moment to bring back what the previous connection
                // knew. The client re-logs-in like this when it travels to a
                // game map, and without this the game-start intent set before
                // the travel is gone.
                session.restore(client);

                const [record, mechLevels, dbItems, licenses, tutorialsResult] = await Promise.all([
                    db.getRecord(account.id),
                    db.getMechLevels(account.id),
                    db.getItems(account.id),
                    db.getMechLicenses(account.id),
                    db.getTutorials(account.id),
                ]);
                tutorials = tutorialsResult || [];
                const items = dbItems;
                const equipmentItems = dbItems.filter(item => Number(item.part_slot) !== 0);

                const levelStr = ACCOUNT_LEVEL_STR[account.account_level] || '1\0';

                // SN_DEFAULT_INFO
                {
                    const [msg, respBody] = client.getMessageBuffer(SN_DEFAULT_INFO, 0x1b);
                    respBody.write(levelStr, 0);
                    respBody.write(account.nickname + '\0', 2);
                    client.send(msg);
                }

                // SN_PLAY_INFO (critical for room creation)
                {
                    const [msg, respBody] = client.getMessageBuffer(0x00210102, 0x16);
                    respBody.writeUint32LE(0, 0);
                    respBody.writeUint32LE(0, 4);
                    respBody.writeUint8(0, 8);
                    respBody.writeUint8(1, 9);
                    respBody.writeInt32LE(1, 0x0A);
                    respBody.writeUint16LE(1, 0x0E);
                    respBody.writeUint16LE(0, 0x10);
                    respBody.writeInt32LE(0, 0x12);
                    client.send(msg);
                }

                // SN_RECORD_INFO — corrected field layout from DLL analysis
                // (P3 step 1: shared builder, dispatch/record-info.builder.js
                // -- see its header comment for the full offset table).
                if (record) {
                    const [msg, respBody] = client.getMessageBuffer(SN_RECORD_INFO, 0x60);
                    writeRecordInfoBody(respBody, {
                        level: record.level,
                        coupon: account.coupon,
                        point: account.point,
                        wins: record.wins,
                        draws: record.draws,
                        losses: record.losses,
                        kills: record.kills,
                        deaths: record.deaths,
                        exp: record.exp,
                    });
                    client.send(msg);
                }

                // SN_GRADE_INFO: account grade (m_MyAccountLevel); 0 = normal player
                {
                    const [msg, respBody] = client.getMessageBuffer(SN_GRADE_INFO, 4);
                    respBody.writeUInt32LE(0, 0); // Grade_Info_SN: 0xb→4 dev,0xc→3,0xd→1,0xe→2, else 0 normal (ZNetwork 0x107cf3e7); 11 made client apply GM keys
                    client.send(msg);
                }

                // SN_MECH_LEVEL — DLL reads u8 count, then 28-byte entries
                if (mechLevels.length > 0) {
                    const MECH_RECORD_SIZE = 0x1c;
                    const [msg, respBody] = client.getMessageBuffer(SN_MECH_LEVEL, 1 + (MECH_RECORD_SIZE * mechLevels.length));
                    respBody.writeUint8(mechLevels.length, 0);
                    let offset = 1;
                    for (const mech of mechLevels) {
                        respBody.writeUint32LE(mech.mech_type, offset);
                        respBody.writeUint32LE(mech.level, offset + 4);
                        respBody.writeBigUint64LE(BigInt(mech.exp), offset + 8);
                        respBody.writeUint32LE(mech.kills, offset + 16);
                        respBody.writeUint32LE(mech.deaths, offset + 20);
                        respBody.writeUint32LE(mech.sorties, offset + 24);
                        offset += MECH_RECORD_SIZE;
                    }
                    client.send(msg);
                }


                // SN_ITEM_INFO — see dispatch/item-info.sender.js (chunked, ≤0x400 per frame).
                await require('./item-info.sender').sendItemInfo(client, items, account.id, 'gamelogin');

                // SN_WEAR_INFO (0x210113) — DLL: WearInfo_SN
                // Header: [u8 suc][u8 cnt][u32 pilotSerialIndex][u32 pilotItemIndex][u32 selectedMechType]
                // Entry (52 bytes): [u32 mechType] + 6 x [u32 itemIndex, u32 serialIndex]
                // Slot 0=Mech(body), 1=MainWeapon, 2=LeftWeapon, 3=RightWeapon, 4=Equipment, 5=Skin
                {
                    const ENTRY_SIZE = 52;
                    const HEADER_SIZE = 14;
                    const defaultMech = 1;

                    const mechSlots = {};
                    for (let m = 1; m <= MAX_MECH_COUNT; m++) {
                        mechSlots[m] = Array.from({length: 6}, () => ({uniqueKey: 0, itemIndex: 0}));
                    }

                    // E1 (docs/design/e1-item-ownership.md): item_equips
                    // per-mech view -- `items` unchanged when db.ITEM_EQUIPS_MODE
                    // is 'disabled'.
                    const wearItems = await db.getItemsWithEquipViews(account.id);

                    // LEGEND-GRANT-IMPL: BODY_INDEX_GIR_MODE 'enabled' converts
                    // the body slot (slot 0) item_id to
                    // cacheIndex.getBodyIndexFromGir() (GameItemRecord
                    // position + 84) the same way room.dispatch.js /
                    // account.dispatch.js do. Default 'disabled' keeps the
                    // raw item_id (this file's prior, unconverted behavior);
                    // an id GIR doesn't have also falls back to raw item_id.
                    const girModeEnabled = cacheIndex.BODY_INDEX_GIR_MODE === 'enabled';

                    // All items: slot 0 = body/chassis, slots 1-5 = weapons/equipment
                    for (const item of wearItems) {
                        if (item.equipped && item.mech_type >= 1 && item.mech_type <= MAX_MECH_COUNT) {
                            const slot = Number(item.part_slot);
                            if (slot >= 0 && slot < 6 && mechSlots[item.mech_type]) {
                                const rawId = Number(item.item_id) || 0;
                                const girIndex = (slot === 0 && girModeEnabled) ? cacheIndex.getBodyIndexFromGir(rawId) : null;
                                const itemIndex = girIndex != null ? girIndex : rawId;
                                mechSlots[item.mech_type][slot] = {
                                    uniqueKey: item.id || 0,
                                    itemIndex: itemIndex,
                                };
                            }
                        }
                    }

                    const mechEntries = [];
                    for (let m = 1; m <= MAX_MECH_COUNT; m++) {
                        mechEntries.push({mechType: m, slots: mechSlots[m]});
                    }

                    {
                        const [msg, respBody] = client.getMessageBuffer(SN_WEAR_INFO,
                            HEADER_SIZE + (ENTRY_SIZE * mechEntries.length));
                        respBody.writeUint8(1, 0);
                        respBody.writeUint8(mechEntries.length, 1);
                        respBody.writeUint32LE(0, 2);           // pilotSerialIndex
                        respBody.writeUint32LE(client.pilot_, 6); // pilotItemIndex
                        respBody.writeUint32LE(defaultMech, 10); // selectedMechType (1-based)

                        let offset = HEADER_SIZE;
                        for (const entry of mechEntries) {
                            respBody.writeUint32LE(entry.mechType, offset);
                            for (let s = 0; s < 6; s++) {
                                // WearInfo_SN reads entry+0x08+n*8 as the Item_Add unique key.
                                respBody.writeUint32LE(entry.slots[s].itemIndex, offset + 4 + s * 8);
                                respBody.writeUint32LE(entry.slots[s].uniqueKey, offset + 8 + s * 8);
                            }
                            offset += ENTRY_SIZE;
                        }
                        client.send(msg);
                        const bodySlotCount = mechEntries.filter(e => e.slots[0].itemIndex !== 0).length;
                        console.log(`[ZGameLoginDispatch] >> Sent SN_WEAR_INFO: ${mechEntries.length} mechs, default=${defaultMech}, pilot=${client.pilot_}, bodySlots=${bodySlotCount}`);
                    }
                }

                // SN_LICENSE_INFO — DLL: [u8 hdr][u8 count] + 9-byte entries [u32 mech][u8 pad][u32 type]
                // type: 1=permanent, 2=timed
                {
                    const licList = licenses.length > 0
                        ? licenses
                        : Array.from({length: MAX_SLOT_COUNT}, (_, i) => ({mech_type: i+1, license_type: 0}));
                    const [msg, respBody] = client.getMessageBuffer(SN_LICENSE_INFO, 0x2 + (9 * licList.length));
                    let offset = 0;
                    respBody[offset++] = 0x00;
                    respBody[offset++] = licList.length;
                    for (const lic of licList) {
                        respBody.writeUint32LE(lic.mech_type, offset);
                        respBody.writeUint8(0, offset + 4);
                        respBody.writeUint32LE(lic.license_type || 1, offset + 5);
                        offset += 9;
                    }
                    client.send(msg);
                    console.log(`[ZGameLoginDispatch] >> Sent SN_LICENSE_INFO: ${licList.length} licenses`);
                }

                // SN_MAP_INFO (0x00210115) resend — trigger: 30907 game-server
                // login (Login_Again_CQ 0x00110124). See mapInfoOnGameLoginMode
                // comment above for why.
                if (mapInfoOnGameLoginMode === 'enabled') {
                    const dbMaps = await db.getMaps(account.id);
                    const fallbackIds = dbMaps.map((map) => map.map_id);
                    sendMapInfoSN(client, resolveRealMapIds() || fallbackIds);
                    console.log(`[ZGameLoginDispatch] >> Sent SN_MAP_INFO (mapInfoOnGameLoginMode): ${(resolveRealMapIds() || fallbackIds).length} maps`);
                }

                console.log(`[ZGameLoginDispatch] >> Sent DB account data for "${account.nickname}"`);

            } else {
                // No DB record — fallback to minimal data so the client doesn't hang
                console.log(`[ZGameLoginDispatch] >> No DB account found, sending defaults`);
                client.nickname_ = 'Player';
                client.point_ = 100000;
                client.cash_ = 0;
                client.coupon_ = 0;

                {
                    const [msg, respBody] = client.getMessageBuffer(SN_DEFAULT_INFO, 0x1b);
                    respBody.write('4\0', 0);
                    respBody.write('Player\0', 2);
                    client.send(msg);
                }

                // SN_PLAY_INFO (critical for room creation)
                {
                    const [msg, respBody] = client.getMessageBuffer(0x00210102, 0x16);
                    respBody.writeUint32LE(0, 0); respBody.writeUint32LE(0, 4);
                    respBody.writeUint8(0, 8); respBody.writeUint8(1, 9);
                    respBody.writeInt32LE(1, 0x0A); respBody.writeUint16LE(1, 0x0E);
                    respBody.writeUint16LE(0, 0x10); respBody.writeInt32LE(0, 0x12);
                    client.send(msg);
                }

                {
                    const [msg, respBody] = client.getMessageBuffer(SN_RECORD_INFO, 0x60);
                    respBody.writeUint32LE(1, 0);
                    respBody.writeBigUint64LE(moneyBigInt(client.coupon_, 0), 0x14);
                    respBody.writeBigUint64LE(moneyBigInt(client.point_, 100000), 0x48);
                    client.send(msg);
                }

                // SN_GRADE_INFO: account grade (m_MyAccountLevel); 0 = normal player
                {
                    const [msg, respBody] = client.getMessageBuffer(SN_GRADE_INFO, 4);
                    respBody.writeUInt32LE(0, 0); // Grade_Info_SN: 0xb→4 dev,0xc→3,0xd→1,0xe→2, else 0 normal (ZNetwork 0x107cf3e7); 11 made client apply GM keys
                    client.send(msg);
                }

                {
                    const MAX_NUM_MECHS = 8;
                    const MECH_RECORD_SIZE = 0x1c;
                    const [msg, respBody] = client.getMessageBuffer(SN_MECH_LEVEL, 1 + (MECH_RECORD_SIZE * MAX_NUM_MECHS));
                    respBody.writeUint8(MAX_NUM_MECHS, 0);
                    let offset = 1;
                    for (let i = 0; i < MAX_NUM_MECHS; ++i) {
                        respBody.writeUint32LE(i + 1, offset);
                        respBody.writeUint32LE(1, offset + 4);
                        offset += MECH_RECORD_SIZE;
                    }
                    client.send(msg);
                }

                // SN_ITEM_INFO (empty inventory — correct header format)
                {
                    const [msg, respBody] = client.getMessageBuffer(0x00210111, 0x6);
                    respBody.writeUint8(1, 0);      // SuccessFlag
                    respBody.writeUint8(0, 1);      // ItemCount = 0
                    respBody.writeUint32LE(0, 2);   // AccountKey
                    client.send(msg);
                }
            }

            // SN_COMPLETE
            {
                const done = (tutorials || []).filter(t => t.completed).map(t => t.tutorial_id);
                let bitmask = 0;
                for (const id of done) bitmask |= (1 << (id - 1));
                const [msg, respBody] = client.getMessageBuffer(SN_COMPLETE, 0x100);
                respBody.writeUint16LE(0x0000, 0);
                respBody.writeInt32LE(0x0000, 2);
                respBody.writeUint8(bitmask, 6);
                client.send(msg);
                console.log(`[ZGameLoginDispatch] >> Sent SN_COMPLETE: tutorials bitmask=0x${bitmask.toString(16)} done=[${done.join(',')}]`);
            }

            // Lobby Enter
            {
                const [msg, respBody] = client.getMessageBuffer(SA_LOBBY_ENTER, 0x6);
                respBody.writeUint16LE(0x0000, 0);
                respBody.writeUint32LE(0x0000, 2);
                client.send(msg);
            }

            console.log(`[ZGameLoginDispatch] >> Sent account data + lobby enter`);

        } catch (err) {
            console.error(`[ZGameLoginDispatch] >> DB Error:`, err.message);
            //Send minimal hardcoded data to prevent crash
            client.point_ = 100000;
            client.cash_ = 0;
            client.coupon_ = 0;
            {
                const [msg, respBody] = client.getMessageBuffer(SN_DEFAULT_INFO, 0x1b);
                respBody.write('4\0', 0);
                respBody.write('Player\0', 2);
                client.send(msg);
            }
            {
                const [msg, respBody] = client.getMessageBuffer(0x00210102, 0x16);
                respBody.writeUint32LE(0, 0); respBody.writeUint32LE(0, 4);
                respBody.writeUint8(0, 8); respBody.writeUint8(1, 9);
                respBody.writeInt32LE(1, 0x0A); respBody.writeUint16LE(1, 0x0E);
                respBody.writeUint16LE(0, 0x10); respBody.writeInt32LE(0, 0x12);
                client.send(msg);
            }
            {
                const [msg, respBody] = client.getMessageBuffer(SN_RECORD_INFO, 0x60);
                respBody.writeUint32LE(1, 0);
                respBody.writeBigUint64LE(moneyBigInt(client.coupon_, 0), 0x14);
                respBody.writeBigUint64LE(moneyBigInt(client.point_, 100000), 0x48);
                client.send(msg);
            }
            // SN_GRADE_INFO: account grade (m_MyAccountLevel); 0 = normal player
            {
                const [msg, respBody] = client.getMessageBuffer(SN_GRADE_INFO, 4);
                respBody.writeUInt32LE(0, 0); // Grade_Info_SN: 0xb→4 dev,0xc→3,0xd→1,0xe→2, else 0 normal (ZNetwork 0x107cf3e7); 11 made client apply GM keys
                client.send(msg);
            }
            {
                const [msg, respBody] = client.getMessageBuffer(0x00210111, 0x6);
                respBody.writeUint8(1, 0);      // SuccessFlag
                respBody.writeUint8(0, 1);      // ItemCount = 0
                respBody.writeUint32LE(0, 2);   // AccountKey
                client.send(msg);
            }
            {
                const [msg, respBody] = client.getMessageBuffer(SN_COMPLETE, 0x100);
                respBody.writeUint16LE(0x0000, 0);
                respBody.writeInt32LE(0x0000, 2);
                client.send(msg);
            }
            {
                const [msg, respBody] = client.getMessageBuffer(SA_LOBBY_ENTER, 0x6);
                respBody.writeUint16LE(0x0000, 0);
                respBody.writeUint32LE(0x0000, 2);
                client.send(msg);
            }
        }
    }

    async handleChannelEnter(client, body)
    {
        const channel = body.length > 0 ? body[0] : 0;
        console.log(`[ZGameLoginDispatch] >> Channel enter request (channel ${channel})`);

        {
            const [msg, respBody] = client.getMessageBuffer(0x00220112, 0x6);
            respBody.writeUint16LE(0x0000, 0);
            respBody.writeUint32LE(0x0000, 2);
            client.send(msg);
        }

        {
            const [msg, respBody] = client.getMessageBuffer(SA_LOBBY_ENTER, 0x6);
            respBody.writeUint16LE(0x0000, 0);
            respBody.writeUint32LE(0x0000, 2);
            client.send(msg);
        }

        {
            const [msg, respBody] = client.getMessageBuffer(SN_GRADE_INFO, 4);
            respBody.writeUInt32LE(0, 0); // Grade_Info_SN: 0xb→4 dev,0xc→3,0xd→1,0xe→2, else 0 normal (ZNetwork 0x107cf3e7); 11 made client apply GM keys
            client.send(msg);
            console.log(`[ZGameLoginDispatch] >> Sent SN_GRADE_INFO: value=11 (grade=1)`);
        }

        // LOBBY-LIST-LOGIN: 0x00220111 (Channel enter CQ) is the client's
        // first message on entering the lobby from channel select -- a room
        // created before this client logged in never reached it otherwise,
        // because the only other Room_List_SN send site is the
        // Leave_CQ-back-to-lobby path (room.dispatch.js
        // sendLobbyBootstrapAfterRoomLeave), which this client never hits
        // if it never joined a room. [LOG] session-20260919-122616.jsonl
        // conn4: 0x00220111 recv/0x00220112+0x00230112 send at ms 492276,
        // no 0x00220204 follows until another connection's room-list
        // broadcast at ms 537346/539206. Gated by the same switch as the
        // Leave path and lobby.dispatch.js's sendEmptyRoomList, so this is
        // a no-op while lobbyRoomListMode stays 'disabled'.
        if (rooms.isLobbyRoomListEnabled()) {
            sendFullRoomList(client, rooms.listRooms(), getExactMessageBuffer);
        }
    }
};

module.exports._setMapInfoOnGameLoginModeForTests = _setMapInfoOnGameLoginModeForTests;
