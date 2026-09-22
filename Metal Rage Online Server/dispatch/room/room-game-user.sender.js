const db = require('../../database/db');
const serverConfig = require('../../config/server.js');
const { CANONICAL_LOADOUTS } = require('../../database/default-loadouts');

// 0x00222112, read straight out of ZDispatchGame::Dispatch — the chain does
// sub edx,0x222111 / dec edx and lands on Game_User_SN. The old 0x00230111 was
// a guess and matches no handler in the client at all.
//
// This is the packet that fills the array Game_User_Team_Get searches, at
// [this+0x1034] with stride 0x80, written by Game_User_Add. User_Default_SN
// fills a different array — [this+0xf88], stride 0x50 — which is why fixing
// that one put the player in the room and still left team=255.
const SN_GAME_USER = 0x00222112;
const GAME_USER_RECORD_SIZE = 0x01E5;
const GAME_USER_HEADER_SIZE = 0x02;
// rec+0x6C = slotCount, rec+0x6D = first slot (stride 0x2F, 8 slots = 0x1E5 tail)
const GAME_USER_SOCKET_OFFSET = 0x6D;
const GAME_USER_SOCKET_SIZE = 0x2F;

// Canonical default loadouts from Cache.Bin Table 4 (DefaultSetList).
// P1B-IMPL: moved to database/default-loadouts.js (require above) so
// tools/p1b-remove-default-items.js reads the exact same table instead of a
// second hand-copied one.

// The record layout below is read out of the real handler at 0x107d8ae0, from
// the assembly rather than the decompiler — Ghidra mislabels two of the stack
// slots. The record buffer sits at esp+0xA8 in that frame; every offset here
// is an instruction that touches it.
//
//   rec+0x00 u16      -> Game_User_Add p1, the user index every other call keys on
//   rec+0x02 u16      -> Game_User_Add p7 -> entry+0x34, THE TEAM
//   rec+0x04 u32      -> Game_User_Add p3 -> entry+0x14
//   rec+0x08 u32      -> Game_Item_Add p2
//   rec+0x0C u32         unread here
//   rec+0x10 u32      -> Game_Slot_Selected_Set, 1..7 mapped to 0..6, else 7
//   rec+0x14 u32      -> Game_User_Clan_Set p3
//   rec+0x18 u32      -> Game_User_Clan_Set p2
//   rec+0x1C char[2]  -> atoi -> Game_User_Add p2 -> entry+0x10, level
//   rec+0x1E char[25] -> widened -> Game_User_Add p6 -> entry+0x04, nickname
//   rec+0x37 char[25] -> widened -> Game_User_Clan_Set p4, clan name
//   rec+0x50..0x68    -> seven u32 into Game_Item_Add p6,p5,p7,p3,p4,p8,p9
//   rec+0x6C u8          slot count
//   rec+0x6D + n*0x2F    slot records
//
// The struct is packed with no alignment holes, which is the check that the
// reading is right: 0x6D + 8 * 0x2F is 0x1E5 exactly, the record size.
//
// Per slot, again from the assembly (esi walks the slot at slot+0x04):
//   slot+0x00 u32 -> slot index, 1..7 mapped to 0..6, else 7
//   slot+0x04 u32 -> Game_Slot_Set p3 -> row+0x0C
//   slot+0x08 u8     unread here (this is why the u32s below are unaligned)
//   slot+0x09 u32 -> Game_UserSocket_Set p3
//   slot+0x0D u32 -> Game_UserSocket_Set p4
//   slot+0x11 u32 -> Game_UserSocket_Set p5
//   slot+0x15 u32 -> Game_Slot_Set p4 -> row+0x10
//   slot+0x19 u32 -> Game_Slot_Set p5 -> row+0x14
//   slot+0x1D u32 -> Game_Slot_Set p6 -> row+0x18
//   slot+0x21 u32 -> Game_Slot_Set p7 -> row+0x1C
//   slot+0x25 u32 -> Game_Slot_Set p8 -> row+0x20

function writeCString(body, text, offset, maxBytes) {
    const value = String(text || '').slice(0, Math.max(maxBytes - 1, 0));
    body.write(value + '\0', offset, Math.max(maxBytes, 0), 'ascii');
}

function equippedBySlot(items, mechType, partSlot) {
    return items.find(item =>
        Number(item.equipped) === 1 &&
        Number(item.mech_type) === Number(mechType) &&
        Number(item.part_slot) === Number(partSlot)
    );
}

// On, and this is the packet that decides whether the player gets a mech.
//
// Game_Info_URL_Get builds the travel URL's team=%d from
// Game_User_Team_Get(myAccountIndex), which searches the array at
// [this+0x1034] and answers 255 when it finds nothing. Game_User_Add is the
// only thing that ever writes that array, and this packet is the only thing
// that calls Game_User_Add. With it off the array was empty, the URL carried
// team=255, and the client loaded the map as a spectator — camera, no pawn.
//
// Two things had to be true before turning it on. The layout is one: it is
// now read out of the handler rather than assumed. The other is the scene:
// Game_User_SN is a ZDispatchGame handler and returns immediately unless the
// client is in scene 6, so sending it while the player sat in the room, as
// this used to, could never have worked. It goes out after Game_Wait_SN.
const GAME_USER_BOOTSTRAP_MODE = 'enabled'; // 'disabled' | 'enabled'

// D1-6-IMPL (docs/backlog.md, docs/design/d1-step6-battle-broadcast.md §2/§5
// step 1): `opts` is new and optional -- every existing 3-arg call site
// (test/extra-lives.js, gate.game.dispatch.js's own single-target
// sendGameUserSn(), room.dispatch.js:1551) is unaffected, since `opts.sendTo`
// defaults to `client` and `opts.itemsAccountId` defaults to
// `client.accountId_`, exactly the old behaviour. The room-broadcast path
// (gate.game.dispatch.js's sendGameUserSnRoomBroadcast()) passes a
// `sendTo` that differs from the record's *subject* connection (whoever the
// DB items/loadout belong to) -- design §2's "每個連線各收 N 包" loop sends
// one member's own record to every other room member's connection.
async function sendGameUserBootstrap(client, ctx, getExactMessageBuffer, opts) {
    if (GAME_USER_BOOTSTRAP_MODE !== 'enabled') {
        return;
    }
    // No once-per-connection guard. User_Master_SN had one and the room state
    // re-sends silently undid it; anything the client rebuilds has to be sent
    // again every time.

    const {
        accountIndex,
        nickname,
        userLevelText,
        teamIndex,
        selectedMech,
        pilotId,
    } = ctx;

    // PVP-TEAM T1 hard rule (docs/design/d2-pvp-tdm.md §6 rule 2): rec+0x02
    // TeamIndex only ever means red (0) or blue (1) to Game_User_Team_Get --
    // any other value there is a bug in whatever built `ctx`, not a
    // legitimate state. Assertion, not a comment: log loudly and refuse to
    // send this one packet rather than let a bad value reach the client (or
    // crash the whole process).
    if (teamIndex !== 0 && teamIndex !== 1) {
        console.error(`[ZRoomDispatch] !! Game_User_SN assertion failed: teamIndex=${teamIndex} is not 0/1 (accountIndex=${accountIndex}) -- refusing to send`);
        return;
    }

    const targetClient = (opts && opts.sendTo) || client;
    const itemsAccountId = (opts && opts.itemsAccountId !== undefined) ? opts.itemsAccountId : client.accountId_;

    let items = [];
    if (itemsAccountId) {
        try {
            // E1 (docs/design/e1-item-ownership.md): item_equips per-mech
            // view -- byte-identical to db.getItems() when db.ITEM_EQUIPS_MODE
            // is 'disabled', so equippedBySlot() below is unchanged.
            items = await db.getItemsWithEquipViews(itemsAccountId);
        } catch (err) {
            console.error(`[ZRoomDispatch] >> Game_User_SN item lookup failed: ${err.message}`);
        }
    }

    const mechType = Math.max(Number(selectedMech) || 1, 1);

    const [msg, body] = getExactMessageBuffer(SN_GAME_USER, GAME_USER_HEADER_SIZE + GAME_USER_RECORD_SIZE);
    body.writeUint8(0, 0x00);
    body.writeUint8(1, 0x01);

    const rec = GAME_USER_HEADER_SIZE;
    // rec+0x00: u16 userIndex
    body.writeUint16LE(accountIndex, rec + 0x00);
    // rec+0x02: u16 teamIndex
    body.writeUint16LE(teamIndex, rec + 0x02);
    // rec+0x04: u32 Game_User_Add field — pass accountIndex as the key for 0x81c array lookup
    body.writeUint32LE(accountIndex, rec + 0x04);
    // rec+0x08: u32 pilotCode → Game_Item_Add param2, stored as GAME_ITEM_INFO.PilotCode
    body.writeUint32LE(Number(pilotId) || 101, rec + 0x08);
    // rec+0x0C: unknown
    body.writeUint32LE(0, rec + 0x0C);
    // rec+0x10: u32 selectedSlotRaw (1..7 → slot 0..6; mechType=1 → slot 0)
    body.writeUint32LE(mechType, rec + 0x10);
    // rec+0x14: u32 clan/emblem
    body.writeUint32LE(0, rec + 0x14);
    // rec+0x18: u32 clan/emblem
    body.writeUint32LE(0, rec + 0x18);
    // rec+0x1C: ascii[2] level text (2 bytes, parsed via atoi)
    writeCString(body, userLevelText || '1', rec + 0x1C, 0x02);
    // rec+0x1E: asciiz[0x19] nickname
    writeCString(body, nickname || 'Player', rec + 0x1E, 0x19);
    // rec+0x37: asciiz[0x19] clan name
    writeCString(body, '', rec + 0x37, 0x19);

    // rec+0x50-0x68: the seven u32 Game_Item_Add reads (all 0 = no bonus,
    // except rec+0x64 below).
    //
    // LIVES (test mode): rec+0x64 -> Game_Item_Add param_8 -> GAME_ITEM_INFO
    // +0xe0 = PveRespawnAddCount (0x107029ff: `*(int*)(iVar1+0xe0+base) =
    // param_8`). Confirmed against the caller's real push sequence at
    // 0x107d8d63/0x107d8d9f (0x107d8ae0 == this handler), not just Ghidra's
    // decompiled param names -- the field order matches
    // ~/mro-decrypted/src/ZNetwork/ZNetwork_DJ.uc:469-486 GAME_ITEM_INFO.
    // Client adds this on top of the map's DefNumLive
    // (ZModePve.uc:473-474 SetNumLive(DefNumLive + ItemInfo.PveRespawnAddCount)).
    // Triggered the same way as the rest of this packet: server-side game
    // start (F5 / BeginRound flow), not a direct client request. Default 0 =
    // byte-identical to before this change; config/server.json's
    // pveExtraLives sets it (see config/server.js).
    const pveExtraLives = serverConfig.getPveExtraLives();
    body.writeUint32LE(pveExtraLives, rec + 0x64);

    // rec+0x6C: slot count. Send all eight mech slots: the in-battle slot
    // select page (ZSlotSelectPage -> ChangeSlot_CN) can pick any of them, and
    // ChangeSlot_SN / Respawn only switch to a slot whose Game_Slot_Set row
    // came from this packet. With just the selected slot, picking another one
    // spawned nothing (docs/journal/2026-09-17-22-pve-mech-slot-selection.md).
    const SLOT_COUNT = 8;
    const SLOT_RECORD_SIZE = 0x2F;
    body.writeUint8(SLOT_COUNT, rec + 0x6C);

    const summary = [];
    for (let slotNo = 1; slotNo <= SLOT_COUNT; slotNo++) {
        const socket = rec + GAME_USER_SOCKET_OFFSET + (slotNo - 1) * SLOT_RECORD_SIZE;
        const def = CANONICAL_LOADOUTS[slotNo] || CANONICAL_LOADOUTS[1];
        const bodyItem = equippedBySlot(items, slotNo, 0);
        const mainItem = equippedBySlot(items, slotNo, 1);
        const leftItem = equippedBySlot(items, slotNo, 2);
        const rightItem = equippedBySlot(items, slotNo, 3);
        const equipmentItem = equippedBySlot(items, slotNo, 4);
        const skinItem = equippedBySlot(items, slotNo, 5);
        const bodyId = Number(bodyItem && bodyItem.item_id) || def.body;
        const mainId = Number(mainItem && mainItem.item_id) || def.main;
        const leftId = Number(leftItem && leftItem.item_id) || def.left;
        // right/booster/skin may legitimately be 0 in Table 4, so only a missing
        // row falls back; a present row is used as-is (NaN writes as 0).
        const rightId = rightItem ? Number(rightItem.item_id) || 0 : def.right;
        const boosterId = equipmentItem ? Number(equipmentItem.item_id) || 0 : def.booster;
        const skinId = skinItem ? Number(skinItem.item_id) || 0 : def.skin;

        // slot+0x00: u32 raw slot (1..7 -> 0..6, anything else -> 7)
        body.writeUint32LE(slotNo, socket + 0x00);
        // slot+0x04: u32 body item
        body.writeUint32LE(bodyId, socket + 0x04);
        // slot+0x08: u8, unread by the handler (the byte that unaligns the rest)
        body.writeUint8(0, socket + 0x08);
        // slot+0x09/0x0D/0x11: the three Game_UserSocket_Set values (zeros for now)
        body.writeUint32LE(mainId, socket + 0x15);
        body.writeUint32LE(leftId, socket + 0x19);
        body.writeUint32LE(rightId, socket + 0x1D);
        body.writeUint32LE(boosterId, socket + 0x21);
        body.writeUint32LE(skinId, socket + 0x25);
        summary.push(`${slotNo}:${bodyId}/${mainId}`);
    }

    targetClient.send(msg);
    targetClient.gameUserBootstrapSent_ = true;
    console.log(
        `[ZRoomDispatch] >> Sent Game_User_SN 0x00222112 ` +
        `(userIndex=${accountIndex}, team=${teamIndex}, selectedMech=${mechType}, slots=${summary.join(' ')})` +
        (pveExtraLives !== 0 ? ` pveExtraLives=${pveExtraLives}` : '') +
        (targetClient !== client ? ` -> conn=${targetClient.connId_}` : '')
    );
}

module.exports = {
    sendGameUserBootstrap,
};
