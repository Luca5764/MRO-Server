// ItemInfo_SN 0x00210111, shared by the two login paths.
//
// ZNetwork.dll ZDispatchAccount::ItemInfo_SN (0x107095c0):
//   header 6 bytes: u8 SuccessFlag, u8 ItemCount, u32 AccountKey (skipped)
//   record 35 bytes each (0x23)
//
// The client drops any frame larger than 0x400 bytes and stalls the connection
// after it (ZNetwork.dll 0x107f8fad), so one packet holds at most
// (0x400 - 16 - 6) / 35 = 28 records. Records from later packets are added to
// the inventory, not swapped in: a new instance key appends, the same key
// replaces that one entry (0x10732616 / 0x1073262d / 0x1073263e,
// docs/journal/2026-09-17-03-iteminfo-accumulation.md). The inventory is only
// cleared on disconnect-complete / initialisation, so every chunk has to go out
// on the same connection.

// Records per packet. 28 is the hard ceiling; smaller values are only for
// testing that chunking itself works.
const ITEM_INFO_CHUNK = 12;
// Include mech body rows (part_slot 0). Off until chunking is confirmed alone.
const ITEM_INFO_INCLUDE_BODY = false;

const SN_ITEM_INFO = 0x00210111;
const ITEM_RECORD_SIZE = 35;
const HEADER_SIZE = 6;

function sendItemInfo(client, items, accountId, tag)
{
    const rows = ITEM_INFO_INCLUDE_BODY
        ? items
        : items.filter(item => Number(item.part_slot) !== 0);
    const chunkSize = Math.max(1, Math.min(ITEM_INFO_CHUNK, 28));

    for (let start = 0; start < rows.length; start += chunkSize) {
        const chunk = rows.slice(start, start + chunkSize);
        const [msg, body] = client.getMessageBuffer(SN_ITEM_INFO, HEADER_SIZE + (ITEM_RECORD_SIZE * chunk.length));
        body.writeUint8(1, 0);                      // SuccessFlag
        body.writeUint8(chunk.length, 1);           // ItemCount
        body.writeUint32LE(accountId || 0, 2);      // AccountKey
        let offset = HEADER_SIZE;
        for (const item of chunk) {
            body.writeUint32LE(item.id || 0, offset);
            body.writeUint32LE(item.item_id, offset + 0x04);
            body.writeUint32LE(item.equipped ? 1 : 0, offset + 0x08);
            body.writeUint32LE(0, offset + 0x0C);
            body.writeUint16LE(item.mech_type || 0, offset + 0x10);
            body.writeUint32LE(item.part_slot || 0, offset + 0x12);
            body.writeUint8(item.equipped ? 2 : 0, offset + 0x16);   // use type: 2 = equipment
            body.writeUint32LE(item.quantity || 1, offset + 0x17);
            body.writeUint32LE(0xFFFFFFFF, offset + 0x1B);           // expiration = permanent
            body.writeUint32LE(0xFFFFFFFF, offset + 0x1F);           // expiration2 = permanent
            offset += ITEM_RECORD_SIZE;
        }
        client.send(msg);
    }

    const packets = Math.ceil(rows.length / chunkSize);
    console.log(`[ItemInfo] >> Sent SN_ITEM_INFO [${tag}]: ${rows.length} items in ${packets} packet(s) (chunk=${chunkSize}, body rows ${ITEM_INFO_INCLUDE_BODY ? 'included' : 'excluded'})`);
}

module.exports = { sendItemInfo };
