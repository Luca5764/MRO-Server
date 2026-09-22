const NetworkClient = require("../client");
const packetlog = require("../packetlog.js");
const db = require('../database/db');
const { getShareType, getUseTimeSeconds } = require('../database/item-share-type');
const ZCommunityDispatch = require('./community.dispatch');
const { sendRoomStatePackets } = require('./room/room-state.sender');
const { sendRoomUserPackets, scheduleSelfRecordResend } = require('./room/room-user.sender');
const { sendRoomMapPackets, sendCampaignBootstrap, ROOM_MAP_SYNC_MODE } = require('./room/room-map.sender');
const { sendGameUserBootstrap } = require('./room/room-game-user.sender');
// D1-4 (docs/backlog.md): real Room_List_SN alongside the existing
// (client-ignored) 0x00230103 empty list sent below, on returning to the
// lobby after Leave_CQ.
const rooms = require('../rooms.js');
const { sendFullRoomList } = require('./room/room-list.sender');
const { MAX_SLOT_COUNT } = require('../datatypes/enums');
const { clampMoney, moneyBigInt } = require('./money');
const fs = require('fs');
const path = require('path');

// ZDispatchRoom - Handles room operations
//
// Confirmed message ID range: 0x00240101 through 0x00240711 (70 IDs total)
// All 0x24XXXX messages belong to this dispatch.
//
// Known methods from ZNetwork.dll strings:
//   Game_Ready_CN/SN, Game_Start_CN/SN, Game_Wait_SN
//   Leave_CQ/SA/SN, Leave_Timeout_CQ, Kickout_CQ/SA
//   Team_Change_CQ/SA/SN, Team_Change_All_SN
//   Map_Change_All_CQ/SA/SN, Map_Change_One_CQ/SA/SN
//   Master_Change_CQ/SA, Name_Change_CQ/SA, Password_Change_CQ/SA
//   Option_Change_CQ/SA, MaxUser_Change_CQ/SA
//   Matching_Start_CN/SN, Matching_Break_CN/SN, Matching_Complete_SN
//   Invite_Open_CQ/SA, Invite_User_Default_SN, Invite_User_Clan_SN
//   Room_Default_SN, Room_Boundary_SN, Room_Name_SN, Room_Option_SN, Room_State_SN
//   User_Default_SN, User_Master_SN, User_Name_SN, User_State_SN
//   User_Score_SN, User_Pilot_SN, User_Levelup_SN
//   Reward_Coupon_SN, Reward_Record_User_SN, Reward_Record_Mech_SN
//   Reward_Levelup_User_SN, Reward_Levelup_Mech_SN, Reward_FirstReceiveExp_User_SN
//   Rotate_Next_SN, Rotate_Stop_CQ/SA/SN
//
// Message ID mapping:
//   0x240101/02 = Enter_CQ/SA (or Room_Info request)
//   0x240103/04 = Member_List or Room_Detail
//   0x240111/12 = Leave_CQ/SA
//   0x240201/02 = Game_Ready_CN/SN
//   0x240301/02 = Game_Start_CN/SN
//   0x240501    = Room_Default_SN
//   0x240509    = Room_State_SN
//   0x240601    = User_Default_SN
//   0x240603    = User_Master_SN

// Room SN opcodes are routed by ZDispatchRoom's switch in znetwork.
// These are not the 0x2405xx/0x2406xx descriptor/opcode-array values:
//   0x220203 Room_Default_SN
//   0x220213 Room_Boundary_SN
//   0x220214 Room_State_SN
//   0x220217 Room_Option_SN
//   0x22021A Room_Name_SN
//   0x220233 User_Default_SN
//   0x220319 User_Master_SN
//   0x220401 User_State_SN
//   0x220402 User_Pilot_SN
//   0x220421 User_Name_SN
// Hangar package opcodes are mapped through the client SN dispatch table:
// 0x240131 Packege_Item_SN, 0x240132 Packege_Point_SN, 0x240133 Packege_Coupon_SN.
// The 0x2405xx descriptors exist elsewhere, but the received SN dispatcher
// does not route 0x240521 to Packege_Item_SN.
// Valid User SN IDs: 0x240601, 0x240602, 0x240603, 0x240611, 0x240612, ...
const SN_ROOM_DEFAULT  = 0x00220203;
const SN_ROOM_BOUNDARY = 0x00220213;
const SN_ROOM_STATE    = 0x00220214;
const SN_ROOM_OPTION   = 0x00220217;
const SN_ROOM_NAME     = 0x0022021A;
const SN_MAP_CHANGE_ALL = 0x00220226;
const SN_MAP_CHANGE_ONE = 0x00220223;
const SN_CAMPAIGN      = 0x0023013A;
const SN_USER_DEFAULT  = 0x00220233;
const SN_USER_STATE    = 0x00220401;
const SN_USER_MASTER   = 0x00220319;
const SN_USER_NAME     = 0x00220421;
const SN_USER_PILOT    = 0x00220402;
const SN_ITEM_INFO     = 0x00210111;
const SN_WEAR_INFO     = 0x00210113;
const SN_PACKAGE_ITEM  = 0x00240131;
const SN_PACKAGE_POINT = 0x00240132;
const SN_PACKAGE_COUPON = 0x00240133;
const SN_SHOP_LIST     = 0x00240241;
const SN_CASH_SHOP     = 0x00240242;
// M1 verified [DLL][LOG][DB][OBS]: accounts.point/cash/coupon persist across
// login; see docs/journal/2026-09-18-16-money-persistence.md.
// G6 equipment persistence passed change -> DB -> relog verification.
// Evidence: docs/journal/2026-09-18-06-g6-equip-save-verified.md.
const EQUIP_SAVE_MODE = 'enabled'; // 'disabled' | 'enabled'
const SLOT_CHANGE_PART_NAMES = ['body', 'main', 'left', 'right', 'equipment', 'skin'];
// G6 shop/inventory unblock is opt-in until the client is tested with the
// corrected ShopList fields and post-purchase ItemInfo refresh.
const SHOP_UNBLOCK_MODE = 'disabled'; // 'disabled' | 'enabled'
// G6e: purchased inventory classification passed W1 and G6f/W2 follow-up.
// Evidence: docs/journal/2026-09-18-04-g6e-purchase-inventory-classification.md.
const PURCHASE_MECH_SLOT_MODE = 'enabled'; // 'disabled' | 'enabled'
// G6e: post-purchase chunked ItemInfo refresh passed W1 and G6f/W2 follow-up.
// Evidence: docs/journal/2026-09-18-04-g6e-purchase-inventory-classification.md.
const PURCHASE_ITEMINFO_REFRESH = 'enabled'; // 'disabled' | 'enabled'
// G6c: item_catalog.mech_type is actually the weapon family, not the mech
// that can equip it. Slot 1 (Small) cannot use the 21x main-weapon family
// that the catalog filter selects for it; Cache.Bin's DefaultSetList shows
// the Small mech's default main weapon is 22100101. See
// docs/journal/2026-09-18-01-g6b-shop-list-filter-root-cause.md. When
// enabled, this swaps ONLY the first 21100101 entry in the slot-1 general
// ShopList_SN (0x00240241) main-weapon tab to 22100101; CashShopList_SN
// (0x00240242) and every other field/order/timing stay untouched.
const SHOP_COMPAT_EXPERIMENT = 'disabled'; // 'disabled' | 'enabled'
// G6d: full catalog path passed the high-level shop display test; the client
// owns mech/item compatibility filtering. Evidence: docs/journal/2026-09-18-03-g6d-shop-full-catalog.md.
const SHOP_FULL_CATALOG_MODE = 'enabled'; // 'disabled' | 'enabled'
// G6g: verified—keep every period variant in ShopList, but only show
// Cache.Bin's RepresentIndex entry in the main shop list.
// Evidence: docs/journal/2026-09-18-07-shop-period-variants.md.
const SHOP_PERIOD_REPRESENTATIVE_MODE = 'enabled'; // 'disabled' | 'enabled'
// M3a verified [DLL][SRC][LOG][OBS]: resend of Slot_Change_SA 0x00240108
// after a successful hangar shop purchase (client action:
// Buy_PointItem_CQ 0x00240201 success branch), sent after every existing
// post-purchase packet including ItemInfo. ItemInfo_SN does not fire a
// client UI event but Slot_Change_SA drives ZPage_Hangar.SlotChangeRecv()
// -> InvenUpdate(), making a purchased item show up in the hangar
// inventory without a manual mech switch. See
// docs/journal/2026-09-18-19-m3-inventory-refresh.md.
// Cache.Bin inspection:
//   entry 6  -> Map_C06
//   entry 8  -> Map_C01
//   entry 30 -> Map_C03
//   entry 34 -> Map_C04
//   entry 37 -> Map_C02
//   entry 43 -> Map_C05
// Campaign room map packets and Room_Default_SN map-entry tables should use
// cache-entry indexes, not body/item cache indexes.
const CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID = {
    1: 8,   // Map_C01
    2: 37,  // Map_C02
    3: 30,  // Map_C03
    4: 34,  // Map_C04
    5: 58,  // Map_PC01 (C05 대응 / maps to C05)
    6: 6,   // Map_C06
    7: 2,   // Map_C08
    8: 26,  // Map_C09
    9: 36,  // Map_C18
    10: 43, // Map_C19
    11: 16, // Map_C20
    12: 24, // Map_C21
    13: 45, // Map_C22
    14: 47, // Map_C25
    15: 49, // Map_C30
    16: 14, // Map_N01
    17: 10, // Map_N05
    18: 22, // Map_N07
    19: 52, // Map_N11
    20: 30, // Map_N13
    21: 18, // Map_N17
    22: 58, // Map_PC01
    23: 70, // Map_PC02
    24: 64, // Map_PC03
    25: 77, // Map_PC04
};
// Campaign map cache indices for SN_MAP_CHANGE_ALL (campaign-only, no PvP PC-maps)
// The client looks a map up in Cache.Bin table 1 by MAP ID, not by any index
// we invent. ZNetwork.dll's Game_Info_URL_Get walks the table comparing
// entry[0] against the id it was given, and on a miss logs "Failed - MapIndex
// : %d" and leaves the travel URL empty — at which point ZPage_Room falls back
// to the level already loaded (Store_01), its GameInfo (HangarGameInfo) and
// team 255, and the engine crashes reloading the hangar on top of itself.
//
// The old list below was invented cache indexes, so every lookup missed:
//   [8, 37, 30, 34, 43, 6, 2, 26, 36, 43, 16, 24, 45, 47, 49, 14, 10, 22, 52, 30, 18]
//
// These are real ids, read out of Cache.Bin and checked: for each one the map
// name appears within 220 bytes of the id's own bytes (14/14 verified,
// including 9001/9002/9003 sitting on the three Map_PC01 records, which are
// the 易/中/難 the campaign screen offers).
const MAP_IDS_PVE = [9001, 9002, 9003, 9004, 9005, 9006, 9007, 9008, 9009, 9010, 9011, 9012];
const MAP_IDS_PVP = [1011, 1021, 1031, 1041, 1051, 1061, 1071, 1081];
const MAP_ID_DEFAULT_PVE = 9001;   // Map_PC01, 動力奪取戰(易), ZModePve.ZModePve
const MAP_ID_DEFAULT_PVP = 1011;   // Map_C08, 十字路口, Zgame.ZTeamDM

// 'real' sends the ids above; 'legacy' restores the invented indexes.
const MAP_ID_MODE = 'real'; // 'real' | 'legacy'

const LEGACY_CAMPAIGN_MAP_ALL_HINTS = [8, 37, 30, 34, 43, 6, 2, 26, 36, 43, 16, 24, 45, 47, 49, 14, 10, 22, 52, 30, 18];
const CAMPAIGN_MAP_ALL_HINTS = MAP_ID_MODE === 'real'
    ? MAP_IDS_PVE
    : LEGACY_CAMPAIGN_MAP_ALL_HINTS;
const ROOM_DEFAULT_ENTRY_HINTS = [8, 37, 30, 34, 6, 2]; // mech slot entries for SN_ROOM_DEFAULT
// Off here on purpose. Game_User_SN is handled by ZDispatchGame, which checks
// the scene byte first and returns without reading a thing unless the client is
// in scene 6. Room state goes out in scene 5, so this call site could only ever
// have sent the packet into a discard. The live send is in
// gate.game.dispatch.js, after Game_Wait_SN has moved the client to scene 6.
const CAMPAIGN_GAME_USER_BOOTSTRAP_MODE = 'disabled'; // 'disabled' | 'enabled'
// GameItemRecord table: static scan from Cache.Bin and
// docs/research/2026-09-18-subordination/README.md. This is separate from
// the 1268-entry body-index scan below; do not change that scan's parameters.
// The last record starts at 0x373ed; the known DefaultSetList follows at 0x37456.
// LEGEND-GRANT-IMPL: the Cache.Bin scan itself (loadCacheIndexByItemId) moved
// verbatim to dispatch/cache-index.js so account.dispatch.js and
// gamelogin.dispatch.js can share it (BODY_INDEX_GIR_MODE) instead of
// duplicating a hand-written 9-entry table. No behavior change here.
const { loadCacheIndexByItemId } = require('./cache-index');
const CACHE_INDEX_DATA = loadCacheIndexByItemId();
const CACHE_INDEX_BY_ITEM_ID = CACHE_INDEX_DATA.indexByItemId;
const CACHE_REPRESENT_INDEX_BY_ITEM_ID = CACHE_INDEX_DATA.representByItemId;

function getExactMessageBuffer(type, bodySize) {
    const msg = Buffer.alloc(0x10 + bodySize);
    msg.writeUint16BE(msg.length, 0x6);
    msg.writeUint32BE(type, 0xC);
    return [msg, msg.subarray(0x10)];
}

function resetRoomSessionState(client) {
    client.roomIndex_ = 0;
    client.createdRoomIndex_ = null;
    client.roomType_ = 0;
    client.rawRoomType_ = 0;
    client.mapId_ = 0;
    client.createdMapId_ = 0;
    client.maxPlayers_ = 0;
    client.gameMode_ = 0;
    client.campaignRoom_ = false;
    client.battleStartSequenceArmed_ = false;
    client.gameStarted_ = false;
    client.readyHostHandshakeSent_ = false;
    client.gameUserBootstrapSent_ = false;
    client.waitingGameInfoExperimentSent_ = false;
}

function sendLobbyBootstrapAfterRoomLeave(client) {
    // Same connection stays alive when returning from room to lobby, so push the
    // minimal lobby-enter success + empty room list that the client already accepts
    // during game login / lobby refresh.
    {
        const [msg, respBody] = getExactMessageBuffer(0x00230112, 0x6);
        respBody.writeUint16LE(0x0000, 0);
        respBody.writeUint32LE(0x0000, 2);
        client.send(msg);
        console.log(`[ZRoomDispatch] >> Sent Lobby Enter SA 0x230112 after room leave`);
    }

    {
        // D1-4: kept as-is even though the client ignores this opcode (see
        // lobby.dispatch.js's sendEmptyRoomList for the same note) -- the
        // real list is Room_List_SN 0x00220204, sent below when enabled.
        const [msg, body] = getExactMessageBuffer(0x00230103, 0x4);
        body.writeUint8(0, 0);
        body.writeUint8(0, 1);
        body.writeUint16LE(0, 2);
        client.send(msg);
        console.log(`[ZRoomDispatch] >> Sent Lobby Room_List_SN 0x230103 after room leave`);
    }

    // D1-4 PM contract: gated by LOBBY_ROOM_LIST_MODE, not ROOM_JOIN_MODE --
    // this opcode has its own switch (rooms.js), same reasoning as
    // lobby.dispatch.js's sendEmptyRoomList.
    if (rooms.isLobbyRoomListEnabled()) {
        sendFullRoomList(client, rooms.listRooms(), getExactMessageBuffer);
    }
}

function writeShopListBody(body, shopItems, currencyCode) {
    const ENTRY_SIZE = 20;
    body.writeUint8(1, 0);
    body.writeUint8(0, 1);
    body.writeUint8(shopItems.length, 2);

    for (let i = 0; i < shopItems.length; i++) {
        const off = 3 + i * ENTRY_SIZE;
        const { item, index } = shopItems[i];
        const gold = catalogGoldPrice(item);
        const discRaw = Number(item.discount_price);
        const disc = (Number.isFinite(discRaw) && discRaw > 0) ? (discRaw >>> 0) : gold;
        const itemId = Number(item.item_id) || 0;
        const itemIndex = itemId;
        const representIndex = CACHE_REPRESENT_INDEX_BY_ITEM_ID[itemIndex];
        const isShow = SHOP_PERIOD_REPRESENTATIVE_MODE !== 'enabled' || representIndex == null
            ? 1
            : (Number(representIndex) === itemIndex ? 1 : 0);
        const isNew = item.is_new == null ? 0 : (Number(item.is_new) ? 1 : 0);
        const isHot = item.is_hot == null ? 0 : (Number(item.is_hot) ? 1 : 0);

        body.writeInt32LE(itemIndex, off + 0x00);
        body.writeInt32LE(disc,      off + 0x04);
        body.writeInt32LE(gold,      off + 0x08);
        if (SHOP_UNBLOCK_MODE === 'enabled') {
            // ZNetwork_DJ::SHOP_ITEM_INFO: IsShow/IsNew/IsHot/IsSale follow
            // the three 4-byte fields. The old path shifted all four flags
            // by one byte, leaving IsShow false in the client ListLoad().
            body.writeUint8(isShow,      off + 0x0C);
            body.writeUint8(isNew,       off + 0x0D);
            body.writeUint8(isHot,       off + 0x0E);
            body.writeUint8(0,           off + 0x0F);
        } else {
            body.writeUint8(0,           off + 0x0C);
            body.writeUint8(isShow,      off + 0x0D);
            body.writeUint8(isNew,       off + 0x0E);
            body.writeUint8(isHot,       off + 0x0F);
        }
        body.writeUint8(1,           off + 0x10);
        body.writeUint8(currencyCode.charCodeAt(0), off + 0x11);
        body.writeUint8(0,           off + 0x12);
        body.writeUint8(0,           off + 0x13);
    }
}

// Cache.Bin item nCategory (Engine UCacheManager) ??shop tabs filter on this
const SHOP_CATEGORY_TYPE = {
    MainWeapon: 2,
    AssistWeapon: 3,
    Booster: 7,
    Support: 8,
};

function catalogCategoryType(row)
{
    const fromDb = Number(row.category_type);
    if (Number.isFinite(fromDb) && fromDb > 0)
        return fromDb >>> 0;
    const key = String(row.category || '').trim();
    return (SHOP_CATEGORY_TYPE[key] || 2) >>> 0;
}

// Client action: hangar Open_SA / DefaultSlot_Change_SA / shop tab load
// trigger sendShopList(). Under SHOP_COMPAT_EXPERIMENT this patches only the
// general ShopList_SN (0x00240241) payload for the slot-1 main-weapon tab;
// the caller must NOT reuse the returned array for CashShopList_SN.
function applyShopCompatExperiment(sendItems, cat, selectedSlot)
{
    if (SHOP_COMPAT_EXPERIMENT !== 'enabled') return sendItems;
    if (Number(selectedSlot) !== 1 || Number(cat) !== SHOP_CATEGORY_TYPE.MainWeapon) return sendItems;

    const idx = sendItems.findIndex(({ item }) => Number(item.item_id) === 21100101);
    if (idx === -1) {
        console.log(`[ZRoomDispatch] >> SHOP_COMPAT_EXPERIMENT: no 21100101 entry found in slot=1 main-weapon list, no swap`);
        return sendItems;
    }

    const patched = sendItems.slice();
    patched[idx] = { ...patched[idx], item: { ...patched[idx].item, item_id: 22100101 } };
    console.log(`[ZRoomDispatch] >> SHOP_COMPAT_EXPERIMENT: swapped ShopList_SN entry[${idx}] item_id 21100101 -> 22100101`);
    return patched;
}

function catalogGoldPrice(row)
{
    const p = Number(row.price);
    if (Number.isFinite(p) && p > 0)
        return p >>> 0;
    return 1000;
}

function interleaveShopFamilies(shopItems)
{
    const groups = new Map();
    for (const entry of dedupeShopModels(shopItems)) {
        const family = Math.floor((Number(entry.item.item_id) || 0) / 100000);
        if (!groups.has(family)) {
            groups.set(family, []);
        }
        groups.get(family).push(entry);
    }

    const queues = [...groups.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, entries]) => entries);
    const result = [];
    let added = true;
    while (added) {
        added = false;
        for (const queue of queues) {
            if (queue.length > 0) {
                result.push(queue.shift());
                added = true;
            }
        }
    }
    return result;
}

function dedupeShopModels(shopItems)
{
    const byModel = new Map();
    for (const entry of shopItems) {
        const itemId = Number(entry.item.item_id) || 0;
        const modelKey = Math.floor(itemId / 100);
        const previous = byModel.get(modelKey);
        if (!previous || preferShopRepresentative(entry.item, previous.item)) {
            byModel.set(modelKey, entry);
        }
    }
    return [...byModel.values()].sort((a, b) => Number(a.item.item_id) - Number(b.item.item_id));
}

function preferShopRepresentative(candidate, current)
{
    const candidateId = Number(candidate.item_id) || 0;
    const currentId = Number(current.item_id) || 0;
    const candidateLevel = candidateId % 100;
    const currentLevel = currentId % 100;

    if (candidateLevel === 1 && currentLevel !== 1) return true;
    if (candidateLevel !== 1 && currentLevel === 1) return false;

    const candidatePrice = catalogGoldPrice(candidate);
    const currentPrice = catalogGoldPrice(current);
    if (candidatePrice !== currentPrice) return candidatePrice < currentPrice;

    return candidateId < currentId;
}

function needsPostSelectShopRefresh(slot)
{
    return false;
}

function readSlotChangeSerials(body)
{
    return Array.from({ length: 7 }, (_, index) => body.readUInt32LE(index * 4));
}

module.exports =
class ZRoomDispatch
{
    dispatch(client, type, body)
    {
        // Catch ALL messages in the 0x0024XXXX range
        if ((type & 0x00FF0000) !== 0x00240000)
            return false;

        console.log(`[ZRoomDispatch] Message 0x${type.toString(16).padStart(8, '0')} (${body.length} bytes)`);
        if (body.length > 0) {
            console.log(`[ZRoomDispatch] Body:`, body.toString('hex'));
            const ascii = body.toString('ascii').replace(/[^\x20-\x7e]/g, '.');
            if (ascii.replace(/\./g, '').length > 2) {
                console.log(`[ZRoomDispatch] ASCII:`, ascii);
            }
        }

        switch (type)
        {
            // ==========================================
            // Room Enter / Room Info request
            // Client sends this when entering or refreshing room state
            // ==========================================
            case 0x00240101:
            {
                if (client.campaignRoom_ && client.createdRoomIndex_ != null) {
                    const [msg, respBody] = getExactMessageBuffer(0x00240102, 0x0E);
                    respBody.writeUint16LE(0x0000, 0);
                    respBody.writeUint32LE(0x00000000, 0x02);
                    respBody.writeBigUint64LE(moneyBigInt(client.cash_, 0), 0x06);
                    client.send(msg);
                    console.log(`[ZRoomDispatch] >> Suppressed Hangar bootstrap in campaign room (sent minimal 0x240102 only)`);
                    return true;
                }

                if (!client.roomIndex_) {
                    client.roomIndex_ = 1;
                    client.roomType_ = 2;
                    client.mapId_ = 1;
                }

                // Hangar Open_SA. The client handler reads 14 body bytes:
                // u16 status + u32 result + u32 point + u32 cash.
                {
                    const [msg, respBody] = getExactMessageBuffer(0x00240102, 0x0E);
                    respBody.writeUint16LE(0x0000, 0);
                    respBody.writeUint32LE(0x00000000, 0x02);
                    // The client displays offsets 0x06/0x0A as one 64-bit cash
                    // value in this path.
                    respBody.writeBigUint64LE(moneyBigInt(client.cash_, 0), 0x06);
                    client.send(msg);
                    console.log(`[ZRoomDispatch] >> Sent Hangar Open_SA 0x240102 (14 bytes)`);
                }

                setTimeout(async () => {
                    this.sendPackageMoney(client);
                    await this.sendPackageItems(client);
                    await this.sendHangarWearInfo(client);

                    // 기본 슬롯 1번 지정 — 새 계정에서 클라가 슬롯을 모를 때 트리거 (assign default slot 1 — triggers when the client doesn't know the slot for a new account)
                    {
                        const [msg, respBody] = getExactMessageBuffer(0x00240113, 0x0A);
                        respBody.writeUInt16LE(0, 0x00);
                        respBody.writeUInt32LE(0, 0x02);
                        respBody.writeUInt32LE(1, 0x06); // slot=1
                        client.send(msg);
                        console.log(`[ZRoomDispatch] >> Sent DefaultSlot_Change_SA 0x240113: slot=1`);
                    }

                    await this.sendShopList(client, 1);
                    this.scheduleShopListRefresh(client, 1, 150, 'initial default');
                    this.scheduleShopListRefresh(client, 1, 500, 'initial default');
                }, 50);

                // Slot_Change_SA 딜레이 전송 — 클라가 0x240107 CQ를 안 보낼 경우 강제 렌더링 (delayed Slot_Change_SA send — force render if the client does not send 0x240107 CQ)
                setTimeout(async () => {
                    try {
                        // 클라가 이미 슬롯 선택했으면 스킵 (skip if the client has already selected a slot)
                        if (client.currentHangarSlot_) return;
                        const slotPayload = await this.buildSlotChangePayload(client, Buffer.alloc(0x1C));
                        slotPayload.writeUInt32LE(1, 0);
                        const [msg, respBody] = getExactMessageBuffer(0x00240108, 0x22);
                        respBody.writeUInt16LE(0, 0x00);
                        respBody.writeUInt32LE(0, 0x02);
                        slotPayload.copy(respBody, 0x06, 0x00, 0x1C);
                        client.send(msg);
                        client.currentHangarSlot_ = 1;
                        console.log(`[ZRoomDispatch] >> Sent initial Slot_Change_SA 0x240108: slot=1`);
                    } catch (err) {
                        console.error(`[ZRoomDispatch] >> Initial slot change error:`, err.message);
                    }
                }, 800);
                return true;
            }

            // ==========================================
            // Room Member List / Room Detail request
            // ==========================================
            case 0x00240103:
            {
                console.log(`[ZRoomDispatch] >> Room Member/Detail CQ`);
                // SA ?묐떟
                {
                    const [msg, respBody] = getExactMessageBuffer(0x00240104, 0x6);
                    respBody.writeUint16LE(0x0000, 0);
                    respBody.writeUint32LE(0x0000, 2);
                    client.send(msg);
                    console.log(`[ZRoomDispatch] >> Sent Room Member/Detail SA 0x240104 (6 bytes)`);
                }
                return true;
            }

            // ==========================================
            // Game Ready (CN - client notification)
            // Player toggled ready state
            // ==========================================
            case 0x00240201:
            {
                if (body.length >= 5) {
                    const purchaseItemId = body.readUInt32LE(1);
                    if (purchaseItemId >= 10000000) {
                        (async () => {
                            await this.handleShopPurchase(client, purchaseItemId, body);
                        })().catch(err => {
                            console.error(`[ZRoomDispatch] >> Shop purchase error:`, err.message);
                        });
                        return true;
                    }
                }

                console.log(`[ZRoomDispatch] >> Game Ready CN`);

                // Echo back as SN so the client sees the state change
                {
                    const [msg, respBody] = client.getMessageBuffer(0x00240202, 0x10);
                    respBody.writeUint32LE(0, 0);   // Slot index
                    respBody.writeUint8(1, 4);      // Ready = true
                    client.send(msg);
                }

                return true;
            }

            // ==========================================
            // Game Start (CN - client notification)
            // Host pressed start
            // ==========================================
            case 0x00240301:
            {
                console.log(`[ZRoomDispatch] >> Game Start CN - HOST WANTS TO START!`);
                console.log(`[ZRoomDispatch] >> Body: ${body.toString('hex')}`);

                client.gameStarted_ = true;
                // PVP-START rename only (no formula change here): this case
                // is dead code -- 0x00240301 is actually
                // ZDispatchHangar::Item_Expiration_SN, a server->client
                // opcode the client never sends as this "CN" (see
                // docs/client-dispatch-map.md:161,497,
                // docs/reference/multiplayer-audit.md:29). Real Game_Start_CN
                // is 0x00222103 in gate.game.dispatch.js. Not adding the
                // PVP_START_FLOW_MODE OR-clause here (that switch lives in
                // gate.game.dispatch.js/map-info.sender.js) since this path
                // never runs; renamed only so it does not silently diverge.
                client.battleStartSequenceArmed_ = (Number(client.rawRoomType_) === 1) ||
                    (Number(client.gameMode_) === 4 || Number(client.gameMode_) === 5);
                if (client.battleStartSequenceArmed_) {
                    console.log(`[ZRoomDispatch] >> Campaign solo start armed: room=${client.roomIndex_ || 0}, map=${client.mapId_ || 0}`);
                }

                // Game Start SA
                {
                    const [msg, respBody] = client.getMessageBuffer(0x00240302, 0x6);
                    respBody.writeUint16LE(0x0000, 0);
                    respBody.writeUint32LE(0x0000, 2);
                    client.send(msg);
                    console.log(`[ZRoomDispatch] >> Sent 0x00240302 (Game Start SA)`);
                }

                // BeginRound_SN (0x00230152) - start round after ready ack
                setTimeout(() => {
                    try {
                        // Ready_Success_SN
                        {
                            const [msg, respBody] = client.getMessageBuffer(0x00420116, 0x6);
                            respBody.writeUint16LE(0x0000, 0);
                            respBody.writeUint32LE(0x0000, 2);
                            client.send(msg);
                            console.log(`[ZRoomDispatch] >> Sent 0x00420116 (Ready_Success_SN)`);
                        }
                        // BeginRound_SN
                        {
                            const [msg, respBody] = client.getMessageBuffer(0x00230152, 0x6);
                            respBody.writeUint16LE(0x0000, 0);
                            respBody.writeUint32LE(0x0000, 2);
                            client.send(msg);
                            console.log(`[ZRoomDispatch] >> Sent 0x00230152 (BeginRound_SN)`);
                        }
                    } catch(e) {
                        console.error(`[ZRoomDispatch] >> Game start error:`, e.message);
                    }
                }, 1000);

                return true;
            }

            // ==========================================
            // Room Leave
            // ==========================================
            case 0x00240111:
            {
                console.log(`[ZRoomDispatch] >> Room Leave CQ`);
                const [msg, respBody] = client.getMessageBuffer(0x00240112, 0x6);
                respBody.writeUint16LE(0x0000, 0);
                respBody.writeUint32LE(0x0000, 2);
                client.send(msg);
                resetRoomSessionState(client);
                setTimeout(() => {
                    try {
                        sendLobbyBootstrapAfterRoomLeave(client);
                    } catch (err) {
                        console.error(`[ZRoomDispatch] >> Room leave lobby bootstrap error:`, err.message);
                    }
                }, 80);
                return true;
            }

            // ==========================================
            // Hangar default slot select request.
            // execHangar_Slot_Select -> DefaultSlot_Change_CQ sends 0x240112.
            // The CQ buffer carries a 1-based slot number. The SA uses the
            // standard u16 origin + u32 result header, followed by the slot.
            // ==========================================
            case 0x00240112:
            {
                const requestedSlot = body.length >= 4 ? body.readUInt32LE(0) : 1;
                const slot = Math.min(Math.max(requestedSlot, 1), 8);
                const [msg, respBody] = getExactMessageBuffer(0x00240113, 0x0A);
                respBody.writeUInt16LE(0, 0x00);
                respBody.writeUInt32LE(0, 0x02);
                respBody.writeUInt32LE(slot, 0x06);
                client.send(msg);
                console.log(`[ZRoomDispatch] >> Sent DefaultSlot_Change_SA 0x240113: defaultMech=${slot}`);
                return true;
            }

            // ==========================================
            // Hangar slot change request.
            // The client CQ sends 7 dwords:
            //   slot, body/mech, main, left, right, equipment, skin.
            // ZDispatchHangar::Slot_Change_SA expects the normal SA header
            // before the same 7 dwords: u16 origin + u32 result + payload.
            // ==========================================
            case 0x00240107:
            {
                if (body.length >= 0x1C) {
                    const serials = readSlotChangeSerials(body);
                    const slot = serials[0];
                    client.currentHangarSlot_ = slot; // 현재 선택 슬롯 기억 (remember current selected slot)
                    (async () => {
                        let saveSucceeded = true;
                        if (EQUIP_SAVE_MODE === 'enabled') {
                            try {
                                await db.saveEquippedLoadout(client.accountId_, slot, serials.slice(1));
                                console.log(
                                    `[ZRoomDispatch] >> Saved Slot_Change_CQ 0x00240107: ` +
                                    `slot=${slot} ${SLOT_CHANGE_PART_NAMES.map((name, index) => `${name}=${serials[index + 1]}`).join(' ')}`
                                );
                            } catch (err) {
                                saveSucceeded = false;
                                console.error(`[ZRoomDispatch] >> Slot_Change_CQ save failed:`, err.message);
                            }
                        }

                        const slotPayload = await this.buildSlotChangePayload(client, body);
                        const [msg, respBody] = getExactMessageBuffer(0x00240108, 0x22);
                        respBody.writeUInt16LE(saveSucceeded ? 0 : 1, 0x00);
                        respBody.writeUInt32LE(saveSucceeded ? 0 : 1, 0x02);
                        slotPayload.copy(respBody, 0x06, 0x00, 0x1C);
                        if (needsPostSelectShopRefresh(slot)) {
                            client.send(msg);
                            console.log(`[ZRoomDispatch] >> Sent Slot_Change_SA 0x240108 before shop refresh: slot=${slot}`);
                            this.scheduleShopListRefresh(client, slot, 30, 'post select prime');
                            this.scheduleShopListRefresh(client, slot, 180, 'post select repaint');
                            this.scheduleShopListRefresh(client, slot, 500, 'post select repaint');
                        } else {
                            await this.sendShopList(client, slot);
                            client.send(msg);
                            console.log(`[ZRoomDispatch] >> Sent Slot_Change_SA 0x240108 after preloaded shop: slot=${slot}`);
                            this.scheduleShopListRefresh(client, slot, 80, 'post slot change');
                        }
                    })().catch(err => {
                        console.error(`[ZRoomDispatch] >> Slot shop preload error:`, err.message);
                    });
                } else {
                    const [msg, respBody] = client.getMessageBuffer(0x00240108, 0x6);
                    respBody.writeUint16LE(0x0000, 0);
                    respBody.writeUint32LE(0x0000, 2);
                    client.send(msg);
                    console.log(`[ZRoomDispatch] >> Sent Slot_Change_SA 0x240108 fallback`);
                }
                return true;
            }

            default:
            {
                packetlog.fallback(client, 'ZRoomDispatch', type, body,
                    (type % 2 === 1) ? type + 1 : null);

                // Auto-respond to CQ messages with OK
                if (type % 2 === 1) {
                    const responseType = type + 1;
                    console.log(`[ZRoomDispatch] >> Auto-responding with 0x${responseType.toString(16).padStart(8, '0')}`);
                    const [msg, respBody] = client.getMessageBuffer(responseType, 0x6);
                    respBody.writeUint16LE(0x0000, 0);
                    respBody.writeUint32LE(0x0000, 2);
                    client.send(msg);
                }
                return true;
            }
        }
    }

    async buildSlotChangePayload(client, requestBody)
    {
        const payload = Buffer.alloc(0x1C);
        requestBody.copy(payload, 0, 0, Math.min(requestBody.length, payload.length));

        const slot = payload.readUInt32LE(0);
        if (!client.accountId_ || slot < 1 || slot > 8) {
            return payload;
        }

        try {
            // E1 (docs/design/e1-item-ownership.md): item_equips per-mech
            // view -- `items` unchanged when db.ITEM_EQUIPS_MODE is
            // 'disabled', so the filter below is byte-identical to before.
            const items = await db.getItemsWithEquipViews(client.accountId_);
            const equipped = new Map();
            for (const item of items) {
                if (Number(item.mech_type) !== Number(slot) || Number(item.equipped) !== 1) {
                    continue;
                }
                const part = Number(item.part_slot);
                if (part >= 0 && part <= 5 && !equipped.has(part)) {
                    equipped.set(part, Number(item.id) || 0);
                }
            }

            // Slot_Change_SA payload: slot, body, main, left, right, equipment/booster, skin.
            for (let part = 0; part <= 5; part++) {
                const serial = equipped.get(part);
                if (serial) {
                    payload.writeUInt32LE(serial >>> 0, 4 + part * 4);
                }
            }

            console.log(`[ZRoomDispatch] >> Slot_Change_SA payload fill: slot=${slot} body=${payload.readUInt32LE(4)} main=${payload.readUInt32LE(8)} left=${payload.readUInt32LE(12)} right=${payload.readUInt32LE(16)} equip=${payload.readUInt32LE(20)} skin=${payload.readUInt32LE(24)}`);
        } catch (err) {
            console.error(`[ZRoomDispatch] >> buildSlotChangePayload error:`, err.message);
        }

        return payload;
    }

    async handleShopPurchase(client, itemId, requestBody)
    {
        console.log(`[ZRoomDispatch] >> Shop Buy CQ 0x240201: item_id=${itemId} body=${requestBody.toString('hex')}`);

        let result = 0;
        let responsePoint = clampMoney(client.point_, 100000);
        if (!client.accountId_) {
            result = 1;
        } else {
            let connection;
            try {
                const catalog = await db.getItemCatalog();
                const item = catalog.find(row => Number(row.item_id) === Number(itemId));
                if (!item) {
                    result = 1;
                } else {
                    const price = clampMoney(item.price || item.discount_price || 0, 0);
                    connection = await db.pool.getConnection();
                    await connection.beginTransaction();

                    const [accountRows] = await connection.execute(
                        'SELECT point FROM accounts WHERE id = ? FOR UPDATE',
                        [client.accountId_]
                    );
                    if (accountRows.length === 0) {
                        result = 1;
                        await connection.rollback();
                    } else {
                        const currentPoint = clampMoney(accountRows[0].point, 100000);
                        responsePoint = currentPoint;
                        if (currentPoint < price) {
                            result = 1;
                            await connection.rollback();
                            console.log(`[ZRoomDispatch] >> Shop Buy failed: insufficient point (has ${currentPoint}, needs ${price})`);
                        } else {
                            const newPoint = currentPoint - price;
                            const catType = catalogCategoryType(item);
                            const partSlotMap = { 2: 1, 3: 2, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4 };
                            const partSlot = partSlotMap[catType] ?? 1;
                            const mechType = PURCHASE_MECH_SLOT_MODE === 'enabled'
                                ? (Number(client.currentHangarSlot_) || 1)
                                : (Number(item.mech_type) || 0);

                            // E1 (docs/design/e1-item-ownership.md): a
                            // ShareType==1 permanent item (UseTime==0, the
                            // already-anchored Cache.Bin offset +0x43 this
                            // codebase calls "period" -- room.dispatch.js's
                            // CACHE_INDEX_DATA) can be equipped on several
                            // mechs at once, so buying a second copy would
                            // just be a wasted duplicate row. UseType itself
                            // is not parsed anywhere in this codebase yet
                            // (no verified offset), so rentals (UseTime>0)
                            // are left alone and keep stacking as before --
                            // per task contract's explicit fallback for the
                            // "unclear" case.
                            let alreadyOwnedPermanentShared = false;
                            if (db.ITEM_EQUIPS_MODE === 'enabled'
                                && getShareType(itemId) === 1
                                && getUseTimeSeconds(itemId) === 0) {
                                const [ownedRows] = await connection.execute(
                                    'SELECT id FROM items WHERE account_id = ? AND item_id = ? LIMIT 1',
                                    [client.accountId_, itemId]
                                );
                                alreadyOwnedPermanentShared = ownedRows.length > 0;
                            }

                            await connection.execute(
                                'UPDATE accounts SET point = ? WHERE id = ?',
                                [newPoint, client.accountId_]
                            );
                            if (!alreadyOwnedPermanentShared) {
                                await connection.execute(
                                    'INSERT INTO items (account_id, item_id, slot, mech_type, part_slot, quantity, equipped) VALUES (?, ?, ?, ?, ?, 1, 0)',
                                    [client.accountId_, itemId, partSlot, mechType, partSlot]
                                );
                            }
                            await connection.commit();
                            client.point_ = newPoint;
                            responsePoint = newPoint;
                            if (alreadyOwnedPermanentShared) {
                                console.log(`[ZRoomDispatch] >> Shop Buy charged but reused existing serial (ShareType=1 permanent, already owned): account=${client.accountId_} point=${newPoint} item_id=${itemId}`);
                            } else {
                                console.log(`[ZRoomDispatch] >> Shop Buy persisted: account=${client.accountId_} point=${newPoint} item_id=${itemId} mech=${mechType} part=${partSlot}`);
                            }
                        }
                    }
                }
            } catch (err) {
                if (connection) {
                    try {
                        await connection.rollback();
                    } catch (rollbackErr) {
                        console.error(`[ZRoomDispatch] >> Shop Buy rollback error:`, rollbackErr.message);
                    }
                }
                result = 1;
                console.error(`[ZRoomDispatch] >> Shop Buy transaction error:`, err.message);
            } finally {
                if (connection) connection.release();
            }
        }

        if (result === 0 && (PURCHASE_ITEMINFO_REFRESH === 'enabled' || SHOP_UNBLOCK_MODE === 'enabled')) {
            try {
                const items = await db.getItems(client.accountId_);
                await require('./item-info.sender').sendItemInfo(
                    client,
                    items,
                    client.accountId_,
                    'shop-purchase'
                );
            } catch (err) {
                console.error(`[ZRoomDispatch] >> Shop purchase ItemInfo refresh error:`, err.message);
            }
        }

        const [msg, body] = getExactMessageBuffer(0x00240202, 0x0E);
        body.writeUInt16LE(0, 0x00);
        body.writeUInt32LE(result, 0x02);
        body.writeBigUint64LE(moneyBigInt(responsePoint, 100000), 0x06);
        client.send(msg);
        console.log(`[ZRoomDispatch] >> Sent Shop Buy SA 0x240202: result=${result} point=${responsePoint}`);

        if (result === 0) {
            this.sendPackageMoney(client);
            await this.sendPackageItems(client);
            await this.sendHangarWearInfo(client);  // 구매 후 슬롯 즉시 갱신 (immediately refresh slot after purchase)
            // 현재 슬롯 상점도 갱신해서 구매한 아이템 반영 (also refresh the current slot shop to reflect the purchased item)
            const currentSlot = client.currentHangarSlot_ || 1;
            this.scheduleShopListRepaint(client, currentSlot, 100, 'post purchase');

            // M3a: triggered by the same Buy_PointItem_CQ 0x00240201 success
            // branch as everything above; resend Slot_Change_SA for the
            // current slot after all other post-purchase packets (including
            // ItemInfo, sent earlier in this function) have gone out, so the
            // client's InvenUpdate() picks up the new item without a manual
            // mech switch. Reuses the same producer and wire format as the
            // 0x00240107 handler above (0x22 bytes: u16 0 + u32 0 + 0x1C
            // payload, payload leading u32 is the slot).
            try {
                const refreshSlot = Number(client.currentHangarSlot_) || 1;
                const slotRequest = Buffer.alloc(0x1C);
                slotRequest.writeUInt32LE(refreshSlot, 0);
                const slotPayload = await this.buildSlotChangePayload(client, slotRequest);
                const [msg, respBody] = getExactMessageBuffer(0x00240108, 0x22);
                respBody.writeUInt16LE(0, 0x00);
                respBody.writeUInt32LE(0, 0x02);
                slotPayload.copy(respBody, 0x06, 0x00, 0x1C);
                client.send(msg);
                console.log(`[ZRoomDispatch] >> Sent post-buy Slot_Change_SA 0x240108: slot=${refreshSlot}`);
            } catch (err) {
                console.error(`[ZRoomDispatch] >> Post-buy Slot_Change_SA resend error:`, err.message);
            }
        }
    }

    scheduleShopListRefresh(client, slot, delayMs, reason)
    {
        setTimeout(() => {
            this.sendShopList(client, slot)
                .then(() => {
                    console.log(`[ZRoomDispatch] >> Delayed ShopList refresh (${reason}) slot=${slot} after ${delayMs}ms`);
                })
                .catch(err => {
                    console.error(`[ZRoomDispatch] >> Delayed ShopList refresh error:`, err.message);
                });
        }, delayMs);
    }

    scheduleShopListRepaint(client, slot, delayMs, reason)
    {
        setTimeout(() => {
            try {
                this.sendEmptyShopList(client, `${reason} clear`);
                setTimeout(() => {
                    this.sendShopList(client, slot)
                        .then(() => {
                            console.log(`[ZRoomDispatch] >> Repaint ShopList fill (${reason}) slot=${slot} after ${delayMs}ms`);
                        })
                        .catch(err => {
                            console.error(`[ZRoomDispatch] >> Repaint ShopList fill error:`, err.message);
                        });
                }, 80);
            } catch (err) {
                console.error(`[ZRoomDispatch] >> Repaint ShopList clear error:`, err.message);
            }
        }, delayMs);
    }

    sendEmptyShopList(client, reason)
    {
        const [msg, body] = getExactMessageBuffer(SN_SHOP_LIST, 3);
        body.writeUint8(1, 0);
        body.writeUint8(0, 1);
        body.writeUint8(0, 2);
        client.send(msg);

        const [msg2, body2] = getExactMessageBuffer(SN_CASH_SHOP, 3);
        body2.writeUint8(1, 0);
        body2.writeUint8(0, 1);
        body2.writeUint8(0, 2);
        client.send(msg2);

        console.log(`[ZRoomDispatch] >> Sent empty ShopList/CashShopList (${reason})`);
    }

    async sendHangarWearInfo(client)
    {
        try {
            if (!client.accountId_) return;
            const { MAX_MECH_COUNT } = require('../datatypes/enums');
            const ENTRY_SIZE = 52;
            const HEADER_SIZE = 14;
            const defaultMech = 1;

            // E1 (docs/design/e1-item-ownership.md): item_equips per-mech
            // view -- byte-identical to db.getItems() when db.ITEM_EQUIPS_MODE
            // is 'disabled'.
            const items = await db.getItemsWithEquipViews(client.accountId_);
            const mechSlots = {};
            for (let m = 1; m <= MAX_MECH_COUNT; m++) {
                mechSlots[m] = Array.from({length: 6}, () => ({uniqueKey: 0, itemIndex: 0}));
            }
            for (const item of items) {
                if (item.equipped && item.mech_type >= 1 && item.mech_type <= MAX_MECH_COUNT) {
                    const slot = Number(item.part_slot);
                    if (slot >= 0 && slot < 6) {
                        mechSlots[item.mech_type][slot] = {
                            uniqueKey: item.id || 0,
                            itemIndex: slot === 0 ? (CACHE_INDEX_BY_ITEM_ID[Number(item.item_id)] ?? Number(item.item_id) ?? 0) : (Number(item.item_id) || 0),
                        };
                    }
                }
            }

            const [msg, body] = getExactMessageBuffer(SN_WEAR_INFO,
                HEADER_SIZE + ENTRY_SIZE * MAX_MECH_COUNT);
            body.writeUint8(1, 0);
            body.writeUint8(MAX_MECH_COUNT, 1);
            body.writeUint32LE(0, 2);            // pilotSerialIndex
            body.writeUint32LE(Number(client.pilot_) || 101, 6); // pilotItemIndex
            body.writeUint32LE(defaultMech, 10); // selectedMechType

            // Entry (52 bytes): [u32 mechType] + 6x[u32 itemIndex, u32 uniqueKey]
            // (DLL WearInfo_SN 0x107c4877/0x107c4a13 reads the second u32 at
            // rec+0x08 as the ItemInfo key, i.e. itemIndex first -- matches
            // account.dispatch.js and gamelogin.dispatch.js).
            let offset = HEADER_SIZE;
            for (let m = 1; m <= MAX_MECH_COUNT; m++) {
                body.writeUint32LE(m, offset);
                for (let s = 0; s < 6; s++) {
                    body.writeUint32LE(mechSlots[m][s].itemIndex, offset + 4 + s * 8);
                    body.writeUint32LE(mechSlots[m][s].uniqueKey, offset + 4 + s * 8 + 4);
                }
                offset += ENTRY_SIZE;
            }
            client.send(msg);
            const bodySlots = Object.values(mechSlots).filter(s => s[0].itemIndex !== 0).length;
            console.log(`[ZRoomDispatch] >> Sent SN_WEAR_INFO (hangar): ${MAX_MECH_COUNT} mechs, pilot=${Number(client.pilot_) || 101}, bodySlots=${bodySlots}`);
        } catch (err) {
            console.error(`[ZRoomDispatch] >> sendHangarWearInfo error:`, err.message);
        }
    }

    async sendShopList(client, selectedSlot = 0, categoryType = 2)
    {
        try {
            const catalog = await db.getItemCatalog();
            if (catalog.length === 0) return;

            const ENTRY_SIZE = 20;
            const HEADER_SIZE = 3;
            const CAT_LIMIT = { 2: 10, 3: 20, 4: 10, 5: 25, 6: 25 };

            const allItems = await this.buildShopItems(client, catalog, selectedSlot, categoryType);

            const groups = new Map();
            for (const entry of allItems) {
                const cat = Number(entry.item.category_type);
                if (!groups.has(cat)) groups.set(cat, []);
                groups.get(cat).push(entry);
            }

            for (const [cat, items] of [...groups.entries()].sort(([a],[b]) => a - b)) {
                if (SHOP_FULL_CATALOG_MODE !== 'enabled') {
                    const count = Math.min(items.length, CAT_LIMIT[cat] || 25);
                    const sendItems = items.slice(0, count);
                    const generalItems = applyShopCompatExperiment(sendItems, cat, selectedSlot);

                    const [msg, respBody] = getExactMessageBuffer(SN_SHOP_LIST,
                        HEADER_SIZE + (ENTRY_SIZE * count));
                    writeShopListBody(respBody, generalItems, 'P');
                    client.send(msg);

                    const [msg2, body2] = getExactMessageBuffer(SN_CASH_SHOP,
                        HEADER_SIZE + (ENTRY_SIZE * count));
                    writeShopListBody(body2, sendItems, 'C');
                    client.send(msg2);

                    console.log(`[ZRoomDispatch] >> Sent ShopList_SN cat=${cat}: ${count} items`);
                    continue;
                }

                const MAX_ENTRIES_PER_FRAME = 45;
                for (let start = 0; start < items.length; start += MAX_ENTRIES_PER_FRAME) {
                    const sendItems = items.slice(start, start + MAX_ENTRIES_PER_FRAME);
                    const count = sendItems.length;
                    const generalItems = applyShopCompatExperiment(sendItems, cat, selectedSlot);

                    const [msg, respBody] = getExactMessageBuffer(SN_SHOP_LIST,
                        HEADER_SIZE + (ENTRY_SIZE * count));
                    writeShopListBody(respBody, generalItems, 'P');
                    client.send(msg);

                    const [msg2, body2] = getExactMessageBuffer(SN_CASH_SHOP,
                        HEADER_SIZE + (ENTRY_SIZE * count));
                    writeShopListBody(body2, sendItems, 'C');
                    client.send(msg2);

                    console.log(
                        `[ZRoomDispatch] >> Sent ShopList_SN cat=${cat}: ` +
                        `${count} items (full catalog part ${Math.floor(start / MAX_ENTRIES_PER_FRAME) + 1})`
                    );
                }
            }

            console.log(`[ZRoomDispatch] >> Sent ShopList_SN 0x240241: ${allItems.length} total items in ${groups.size} tabs (rawItemId/show/P)`);
            console.log(`[ZRoomDispatch] >> Sent CashShopList_SN 0x240242: ${allItems.length} total items (rawItemId/show/C)`);
        } catch (err) {
            console.error(`[ZRoomDispatch] >> ShopList error:`, err.message);
        }
    }

    async buildShopItems(client, catalog, selectedSlot = 0, categoryType = 2)
    {
        const weaponItems = catalog
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => Number(item.category_type) >= 2 && Number(item.category_type) <= 6);

        if (SHOP_FULL_CATALOG_MODE === 'enabled') {
            const uniqueItems = new Map();
            for (const entry of weaponItems) {
                const itemId = Number(entry.item.item_id) || 0;
                if (!uniqueItems.has(itemId)) uniqueItems.set(itemId, entry);
            }
            return [...uniqueItems.values()].sort((a, b) =>
                (Number(a.item.item_id) || 0) - (Number(b.item.item_id) || 0)
            );
        }

        if (!selectedSlot || !client.accountId_) {
            return weaponItems;
        }

        try {
            // E1 fix round (Sol batch4 (6)): equippedMain below reads
            // "what's equipped on this mech" (account ownership state), not
            // the catalog -- must come from item_equips when the mode is on,
            // same as every other E1 reader. Byte-identical to
            // db.getItems() when db.ITEM_EQUIPS_MODE is 'disabled'.
            const items = await db.getItemsWithEquipViews(client.accountId_);
            const mechItems = weaponItems.filter(({ item }) => Number(item.mech_type) === Number(selectedSlot));
            if (mechItems.length > 0) {
                console.log(`[ZRoomDispatch] >> Shop refresh for slot=${selectedSlot}: catalogMech=${selectedSlot}, items=${mechItems.length}`);
                return interleaveShopFamilies(mechItems);
            }

            const equippedMain = items.find(item =>
                Number(item.mech_type) === Number(selectedSlot) &&
                Number(item.part_slot) === 1 &&
                Number(item.equipped) === 1
            );

            const mainItemId = Number(equippedMain && equippedMain.item_id) || 0;
            const mainFamily = mainItemId ? Math.floor(mainItemId / 100000) : 0;
            if (mainFamily) {
                const familyItems = weaponItems.filter(({ item }) =>
                    Math.floor((Number(item.item_id) || 0) / 100000) === mainFamily
                );
                if (familyItems.length > 0) {
                    console.log(`[ZRoomDispatch] >> Shop refresh for slot=${selectedSlot}: mainFamily=${mainFamily}, items=${familyItems.length}`);
                    return interleaveShopFamilies(familyItems);
                }
            }
        } catch (err) {
            console.error(`[ZRoomDispatch] >> buildShopItems error:`, err.message);
        }

        return weaponItems;
    }

    async sendPackageItems(client)
    {
        try {
            if (!client.accountId_) {
                console.log(`[ZRoomDispatch] >> No accountId; skipping package items`);
                return;
            }

            const items = await db.getItems(client.accountId_);
            // Was capped at 63 (no DLL basis). [LOG] session-20260919-184235.jsonl
            // ms 3347413: Lucas owns 65 items, Packege_Item_SN carried 63, and
            // [OBS] the two last-inserted legend bodies (FENRIS 17200101, SPECTOR
            // 18200101) were missing in the hangar. Cap only by the 0x400 frame
            // limit instead: 0x10 header + 1 count byte + 8 per row -> 125 rows.
            const PACKAGE_ITEM_MAX = Math.floor((0x400 - 0x10 - 1) / 8);
            const count = Math.min(items.length, PACKAGE_ITEM_MAX);
            if (items.length > count) console.warn(`[ZRoomDispatch] !! Packege_Item_SN truncated: ${items.length} items, sent ${count}`);
            const [msg, body] = getExactMessageBuffer(SN_PACKAGE_ITEM, 1 + (count * 8));
            body.writeUint8(count, 0);

            let offset = 1;
            for (let i = 0; i < count; i++) {
                const item = items[i];
                const itemId = Number(item.item_id) || 0;
                const itemIndex = itemId;
                body.writeUint32LE(item.id || 0, offset);
                body.writeUint32LE(itemIndex, offset + 4);
                if (i < 10) {
                    console.log(`[ZRoomDispatch] >> Package item[${i}]: serial=${item.id || 0} item_id=${item.item_id} itemIndex=${itemIndex}`);
                }
                offset += 8;
            }

            client.send(msg);
            const bodyCount = items.slice(0, count).filter(item => Number(item.part_slot) === 0).length;
            console.log(`[ZRoomDispatch] >> Sent Packege_Item_SN 0x240131: ${count} items (${bodyCount} body rows, rawItemId)`);
        } catch (err) {
            console.error(`[ZRoomDispatch] >> Packege_Item_SN error:`, err.message);
        }
    }

    sendPackageMoney(client)
    {
        const point = clampMoney(client.point_, 100000);
        const coupon = clampMoney(client.coupon_, 0);

        {
            const [msg, body] = getExactMessageBuffer(SN_PACKAGE_POINT, 12);
            body.writeUint32LE(1, 0x00);
            body.writeBigUint64LE(moneyBigInt(point), 0x04);
            client.send(msg);
        }

        {
            const [msg, body] = getExactMessageBuffer(SN_PACKAGE_COUPON, 12);
            body.writeUint32LE(1, 0x00);
            body.writeBigUint64LE(moneyBigInt(coupon), 0x04);
            client.send(msg);
        }

        console.log(`[ZRoomDispatch] >> Sent Packege_Point_SN 0x240132: point=${point}`);
        console.log(`[ZRoomDispatch] >> Sent Packege_Coupon_SN 0x240133: coupon=${coupon}`);
    }

    // E1 fix round (Sol batch4 (6)): no call sites anywhere in this codebase
    // (confirmed by grep) -- bypasses E1 entirely (reads items.equipped/
    // items.mech_type directly) and must be migrated to
    // db.getItemsWithEquipViews()/item_equips before ever being wired up.
    async sendHangarItemInfo(client)
    {
        try {
            if (!client.accountId_) {
                console.log(`[ZRoomDispatch] >> No accountId; skipping hangar ItemInfo resend`);
                return;
            }

            const items = await db.getItems(client.accountId_);
            const bodyCount = items.filter(item => Number(item.part_slot) === 0).length;
            const ITEM_RECORD_SIZE = 35;
            const headerSize = 6;
            const [msg, body] = getExactMessageBuffer(SN_ITEM_INFO,
                headerSize + (ITEM_RECORD_SIZE * items.length));

            body.writeUint8(1, 0);
            body.writeUint8(items.length, 1);
            body.writeUint32LE(client.accountId_ || 0, 2);

            let offset = headerSize;
            for (const item of items) {
                body.writeUint32LE(item.id || 0, offset + 0x00);
                body.writeUint32LE(Number(item.item_id) || 0, offset + 0x04);
                body.writeUint32LE(item.equipped ? 1 : 0, offset + 0x08);
                body.writeUint32LE(0, offset + 0x0C);
                body.writeUint16LE(item.mech_type || 0, offset + 0x10);
                body.writeUint32LE(item.part_slot || 0, offset + 0x12);
                body.writeUint8(item.equipped ? 2 : 0, offset + 0x16);
                body.writeUint32LE(item.quantity || 1, offset + 0x17);
                body.writeUint32LE(0xFFFFFFFF, offset + 0x1B);
                body.writeUint32LE(0xFFFFFFFF, offset + 0x1F);
                offset += ITEM_RECORD_SIZE;
            }

            client.send(msg);
            console.log(`[ZRoomDispatch] >> Resent Account ItemInfo_SN 0x210111 after Hangar Open: ${items.length} items (${bodyCount} body rows, ItemInfo only)`);
        } catch (err) {
            console.error(`[ZRoomDispatch] >> Hangar ItemInfo resend error:`, err.message);
        }
    }

    // E1 fix round (Sol batch4 (6)): no call sites anywhere in this codebase
    // (confirmed by grep) -- bypasses E1 entirely (reads items.equipped/
    // items.mech_type directly) and must be migrated to
    // db.getItemsWithEquipViews()/item_equips before ever being wired up.
    // Also has a pre-existing, unrelated bug: the bodyItems loop below
    // references an undeclared `slot` variable (E1-IMPL journal entry,
    // 2026-09-19-1639-e1-item-equips.md) -- still not fixed here, still
    // out of scope, still dead code.
    async sendHangarAccountData(client)
    {
        try {
            if (!client.accountId_) {
                console.log(`[ZRoomDispatch] >> No accountId; skipping hangar account data`);
                return;
            }

            const [items, catalog] = await Promise.all([
                db.getItems(client.accountId_),
                db.getItemCatalog(),
            ]);
            const bodyItems = items.filter(item => Number(item.part_slot) === 0);
            const equipmentItems = items.filter(item => Number(item.part_slot) !== 0);
            const hangarItems = [...equipmentItems, ...bodyItems];

            // SN_ITEM_INFO registers owned items. The client debug string calls this
            // ItemIndex, but the login path only kept mech thumbnails stable with
            // raw item_id values, so keep inventory/wear on the same identifier.
            {
                const ITEM_RECORD_SIZE = 35;
                const headerSize = 6;
                const [msg, body] = getExactMessageBuffer(SN_ITEM_INFO,
                    headerSize + (ITEM_RECORD_SIZE * hangarItems.length));
                body.writeUint8(1, 0);
                body.writeUint8(hangarItems.length, 1);
                body.writeUint32LE(client.accountId_ || 0, 2);

                let offset = headerSize;
                for (const item of hangarItems) {
                    const isBodyItem = Number(item.part_slot) === 0;
                    body.writeUint32LE(item.id || 0, offset);
                    body.writeUint32LE(Number(item.item_id) || 0, offset + 0x04);
                    body.writeUint32LE(item.equipped ? 1 : 0, offset + 0x08);
                    body.writeUint32LE(0, offset + 0x0C);
                    body.writeUint16LE(item.mech_type || 0, offset + 0x10);
                    body.writeUint32LE(isBodyItem ? 1 : (item.part_slot || 0), offset + 0x12);
                    body.writeUint8(item.equipped ? 2 : 0, offset + 0x16);
                    body.writeUint32LE(item.quantity || 1, offset + 0x17);
                    body.writeUint32LE(0xFFFFFFFF, offset + 0x1B);
                    body.writeUint32LE(0xFFFFFFFF, offset + 0x1F);
                    offset += ITEM_RECORD_SIZE;
                }
                client.send(msg);
            }

            // SN_WEAR_INFO references the items registered above.
            let bodyWearSlot0 = 0;
            {
                const ENTRY_SIZE = 52;
                const HEADER_SIZE = 14;
                const defaultMech = 1;
                const mechSlots = {};
                for (let m = 1; m <= MAX_SLOT_COUNT; m++) {
                    mechSlots[m] = Array.from({length: 6}, () => ({uniqueKey: 0, itemIndex: 0}));
                }

                for (const item of bodyItems) {
                    const mechType = Number(item.mech_type);
                    if (item.equipped && mechType >= 1 && mechType <= MAX_SLOT_COUNT) {
                        mechSlots[mechType][0] = {
                            uniqueKey: item.id || 0,
                            itemIndex: slot === 0 ? (CACHE_INDEX_BY_ITEM_ID[Number(item.item_id)] ?? Number(item.item_id) ?? 0) : (Number(item.item_id) || 0),
                        };
                        bodyWearSlot0++;
                    }
                }
                for (const item of equipmentItems) {
                    if (item.equipped && item.mech_type >= 1 && item.mech_type <= MAX_SLOT_COUNT) {
                        const slot = Number(item.part_slot);
                        if (slot >= 0 && slot < 6 && mechSlots[item.mech_type]) {
                            const wearEntry = {
                                uniqueKey: item.id || 0,
                                itemIndex: slot === 0 ? (CACHE_INDEX_BY_ITEM_ID[Number(item.item_id)] ?? Number(item.item_id) ?? 0) : (Number(item.item_id) || 0),
                            };
                            mechSlots[item.mech_type][slot] = wearEntry;
                        }
                    }
                }

                const [msg, body] = getExactMessageBuffer(SN_WEAR_INFO,
                    HEADER_SIZE + (ENTRY_SIZE * MAX_SLOT_COUNT));
                body.writeUint8(1, 0);
                body.writeUint8(MAX_SLOT_COUNT, 1);
                body.writeUint32LE(0, 2);  // pilotItemIndex
                body.writeUint32LE(0, 6);  // pilotSerialIndex
                body.writeUint32LE(defaultMech, 10);

                let offset = HEADER_SIZE;
                for (let m = 1; m <= MAX_SLOT_COUNT; m++) {
                    body.writeUint32LE(m, offset);
                    for (let s = 0; s < 6; s++) {
                        body.writeUint32LE(mechSlots[m][s].uniqueKey, offset + 4 + s * 8);
                        body.writeUint32LE(mechSlots[m][s].itemIndex, offset + 4 + s * 8 + 4);
                    }
                    offset += ENTRY_SIZE;
                }
                client.send(msg);
            }

            console.log(`[ZRoomDispatch] >> Resent hangar account data: ${hangarItems.length} items (${bodyItems.length} body rows registered as part_slot=1, bodyWearSlot0=${bodyWearSlot0})`);
        } catch (err) {
            console.error(`[ZRoomDispatch] >> Hangar account data error:`, err.message);
        }
    }

    /**
     * Sends full room state to a client (room info + user info + master + state)
     * @param {NetworkClient} client
     *
     * Room_Default_SN body format (from ZNetwork.dll disassembly at 0x107EA3E0):
     *   [0x00] u16  RoomIndex
     *   [0x02] u16  RoomType (0=Normal, 1=ClanWar, 2=Campaign, 3=QuickMatch)
     *   [0x04] u8   MapIndex
     *   [0x05] u16  MapId (or sub-map)
     *   [0x07] u8   MaxPlayers
     *   [0x08] u8   GameMode
     *   [0x09] u8   RoundCount
     *   [0x0A] u8   TimeLimit
     *   [0x0B] u8   RespawnTime
     *   [0x0C] u8   TeamBalance
     *   [0x0D] u8   FriendlyFire
     *   [0x0E] u8   WeaponRestrict
     *   [0x10] u16  ScoreLimit
     *   [0x12] u16  Unknown
     *   [0x1C] u8   Password flag
     *   [0x1D] u8   Unknown
     *   [0x1E] u8   Unknown
     *   [0x1F] u8   Unknown
     *   Room name at some offset (variable length string)
     *   Total body: up to ~192 bytes
     */
    sendRoomState(client)
    {
        const roomIndex = client.roomIndex_ || 0;
        const accountIndex = client.accountIndex_ || client.accountId_ || 1;
        // Room_Default_SN raw type is not the same thing as the effective room type
        // chosen during CQ_CREATE handling. Static analysis shows:
        //   raw 1 -> internal 2
        //   raw 2 -> internal 0 (NORMAL_GAME)
        //   raw 3 -> internal 1
        //   raw 4 -> internal 0
        //   raw 5 -> internal 3
        //   raw 6 -> internal 4
        // 2026-09-22 correction: the old comment said "raw 2 -> internal 1",
        // which the jump table contradicts. Read directly out of ZNetwork.dll
        // at 0x107ea6d8 (indexed by raw-1, see 0x107ea4b5: movzx/dec/cmp 5/ja/
        // jmp [eax*4+0x107ea6d8]); the raw 2 slot points at 0x107ea4ea, the
        // `mov [esi+8], 0` arm. raw 6 -> internal 4 is a value we have seen in
        // real Create_CQ bodies but do not handle anywhere -- see
        // docs/research/2026-09-22-d2-tdm/pvp-start-gap.md Q6.
        // When we sent type=2 here, the client switched the room shell to a PvP
        // layout (Red/Blue team, team-balance options, broad map categories).
        // Campaign room creation still needs the raw create-type value here.
        const rawRoomType = typeof client.rawRoomType_ === 'number' ? client.rawRoomType_ : (client.roomType_ || 1);
        const roomType = rawRoomType === 0 ? 2 : rawRoomType;
        const mapId = client.mapId_ || 1;
        const maxPlayers = Math.max(client.maxPlayers_ || 1, 1);
        const currentUsers = 1;
        const gameMode = client.gameMode_ || 0;
        // Was: campaign rooms sent 1, everything else a value clamped to 1..6.
        // Neither is a real map id — the valid ones are 0, 101, 102, 1011,
        // 1021, ... 9012 — so the client's lookup never matched.
        const mapIndex = MAP_ID_MODE === 'real'
            ? (client.campaignRoom_ ? MAP_ID_DEFAULT_PVE : MAP_ID_DEFAULT_PVP)
            : (client.campaignRoom_ ? 1 : Math.min(Math.max(Number(mapId) || 1, 1), 6));
        const roomName = (client.roomName_ || client.nickname_ || 'Room').slice(0, 25);
        const nickname = (client.nickname_ || 'Player').slice(0, 25);
        const pilotId = client.pilot_ || 101;
        const userLevelText = '1';
        // record+0x10 is consumed separately from the textual level and feeds
        // the room-user classification path. Use raw 2 as the first explicit
        // non-default candidate instead of mirroring the display level "1".
        const userLevelType = 2;
        // Re-reading User_Default_SN shows the team word is forwarded directly
        // into Room_User_Add, unlike the separate mapped state fields.
        // team=0 for RED team (first slot); matches 2011 log team=0 URL param.
        // ROOM-TEAM-DISPLAY (docs/journal/2026-09-22-2230-pvp-2p-first.md
        // "房間畫面兩人都在紅隊", contract 2026-09-23): member.team (set by
        // gate.game.dispatch.js's addMember() call sites) is the single
        // source of truth for a member's team -- this must only read it
        // back, not recompute it. 'enabled' looks up this connection's own
        // Room membership and uses its stored team; falls back to 0 (the
        // old constant) if the room registry has nothing tracked for this
        // account yet (e.g. ROOM_JOIN_MODE off). Triggered by the same room
        // CREATE burst / host resend this whole sendRoomState() call already
        // runs for.
        const trackedRoomForTeam = rooms.isRoomMemberTeamEnabled()
            ? rooms.getRoomByAccount(Number(accountIndex))
            : undefined;
        const trackedMemberForTeam = trackedRoomForTeam && trackedRoomForTeam.members.get(Number(accountIndex));
        const teamIndex = trackedMemberForTeam ? trackedMemberForTeam.team : 0;
        // record+0x0C in User_Default_SN is a separate dword field, not the
        // visible room state printed from record+0x13. Keep it neutral.
        const userHiddenRaw = 0;
        // Keep the user state aligned with the room's waiting/idle state rather
        // than the old playing-ish value 2.
        const userStateRaw = 1;
        const packedIp = 0x0100007F;
        const selectedMech = 1;
        const primaryMapCacheIndex = CAMPAIGN_MAP_CACHE_INDEX_BY_MAP_ID[mapId] || ROOM_DEFAULT_ENTRY_HINTS[0] || 8;
        // Game_Info_SN already uses campaignMapCacheKey_ as the real Cache.Bin
        // MapIndex (9001..9012). Keep the old cache-entry fallback untouched
        // while allowing room status packets to opt into that same source.
        const selectedCampaignMapId = Number(client.campaignMapCacheKey_);
        const hasSelectedCampaignMapId = client.campaignRoom_ &&
            MAP_IDS_PVE.includes(selectedCampaignMapId);
        const campaignMapCacheKey = ROOM_MAP_SYNC_MODE === 'enabled' && hasSelectedCampaignMapId
            ? selectedCampaignMapId
            : primaryMapCacheIndex;
        const selectedRoomMapIndex = ROOM_MAP_SYNC_MODE === 'enabled' && hasSelectedCampaignMapId
            ? selectedCampaignMapId
            : null;
        const roomSettingGoal = client.campaignRoom_ ? 0 : currentUsers;
        const roomSettingTime = client.campaignRoom_ ? 0 : maxPlayers;
        const roomSettingRound = client.campaignRoom_ ? 1 : 0;
        const roomDefaultEntryCount = client.campaignRoom_
            ? ROOM_DEFAULT_ENTRY_HINTS.length
            : Math.min(Math.max(maxPlayers, 1), ROOM_DEFAULT_ENTRY_HINTS.length);
        const ctx = {
            roomIndex,
            accountIndex,
            roomType,
            mapId,
            maxPlayers,
            currentUsers,
            gameMode,
            mapIndex: selectedRoomMapIndex || mapIndex,
            roomName,
            nickname,
            pilotId,
            userLevelText,
            userLevelType,
            teamIndex,
            userHiddenRaw,
            userStateRaw,
            packedIp,
            selectedMech,
            primaryBodyCacheIndex: primaryMapCacheIndex,
            campaignMapCacheKey,
            roomSettingGoal,
            roomSettingTime,
            roomSettingRound,
            roomDefaultEntryCount,
            roomDefaultEntryHints: ROOM_DEFAULT_ENTRY_HINTS,
            campaignMapHints: CAMPAIGN_MAP_ALL_HINTS,
            // D1-4c: room-state.sender.js/room-map.sender.js now read these
            // off ctx instead of client.xxx_ directly (so the same senders
            // work for a joiner's Room-sourced ctx in gate.game.dispatch.js's
            // Enter_CQ handler). Same underlying client fields as before --
            // this creator/re-send path stays byte-for-byte identical.
            isCampaignRoom: client.campaignRoom_,
            optionMask: (client.createWord2_ || 0) >>> 0,
            // OPTIONMASK-FIX (docs/backlog.md, docs/research/
            // 2026-09-19-intrude/notes.md, 🟡 待審): the host's own resend
            // path, unlike a joiner's buildRoomCtxFromRoom() (gate.game.
            // dispatch.js), does not already have the tracked Room object in
            // scope -- look it up only when the switch is on, so this stays
            // a no-op call while it is off.
            roomOptions: rooms.isRoomOptionSourceEnabled()
                ? (rooms.getRoomByAccount(Number(accountIndex)) || {}).options
                : undefined,
            isTrueCampaign: client.isTrueCampaign_,
            mapChangeOneTime: client.mapChangeOneTime_,
            mapChangeOneRound: client.mapChangeOneRound_,
            playRound: client.playRound_,
            mapChangeOneKill: client.mapChangeOneKill_,
            mapChangeOneGoal: client.mapChangeOneGoal_,
        };
        console.log(`[ZRoomDispatch] >> sendRoomState 호출 (mapId=${mapId}, cacheIndex=${primaryMapCacheIndex})`);
        sendRoomStatePackets(client, ctx, getExactMessageBuffer);
        sendRoomMapPackets(client, ctx, getExactMessageBuffer);
        sendRoomUserPackets(client, ctx, getExactMessageBuffer);
        // SELF-AVATAR-EXP (docs/backlog.md): triggered by the same room
        // CREATE burst that just sent this client its own User_Default/Name/
        // Pilot/State/Master records (host path). Default off; see
        // room-user.sender.js for the switch and hypothesis.
        scheduleSelfRecordResend(client, ctx, getExactMessageBuffer, true, 'room create (host)');
        if (CAMPAIGN_GAME_USER_BOOTSTRAP_MODE === 'enabled' && client.campaignRoom_) {
            Promise.resolve(sendGameUserBootstrap(client, ctx, getExactMessageBuffer)).catch((err) => {
                console.error(`[ZRoomDispatch] >> Game_User_SN bootstrap error: ${err.message}`);
            });
        }
        if (client.campaignRoom_) {
            this.sendCampaignBootstrap(client);
        }

        console.log(`[ZRoomDispatch] >> sendRoomState 완료`);
    }

    sendCampaignBootstrap(client)
    {
        sendCampaignBootstrap(client, getExactMessageBuffer);
    }
};

module.exports.resetRoomSessionState = resetRoomSessionState;
