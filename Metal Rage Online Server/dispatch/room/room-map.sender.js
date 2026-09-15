// Header size before the 9-byte map records.
//
// 'compact' puts them at 0x02, straight after the flag and count. That is the
// shape User_Default_SN turned out to have once it was disassembled — flag,
// count, then records with no gap — and Map_Change_One is a flag followed by
// a single 9-byte record, also with no gap. 'padded' restores the 0x06 the
// original code used, whose comment claimed it was what the client expects;
// the same author had User_Default_SN's layout wrong, so the claim is weak.
//
// Symptom that prompted this: the client logs
//   Accessed array 'm_MapInfoList' out of bounds (0/0)
// from ZPopup_MapSelect, i.e. it parsed our list into nothing.
const MAP_ALL_HEADER_MODE = 'compact'; // 'compact' | 'padded'
const MAP_ALL_ENTRY_OFFSET = MAP_ALL_HEADER_MODE === 'compact' ? 0x02 : 0x06;

const SN_MAP_CHANGE_ALL = 0x00220226;
const SN_MAP_CHANGE_ONE = 0x00220223;
const SN_CAMPAIGN = 0x0023013A;

function sendRoomMapPackets(client, ctx, getExactMessageBuffer) {
    if (!client.isTrueCampaign_) {  // isTrueCampaign_ → campaignRoom_
        return;
    }

    const { campaignMapCacheKey, campaignMapHints, roomDefaultEntryHints } = ctx;

    const mapList = (campaignMapHints && campaignMapHints.length > 0)
        ? campaignMapHints
        : (roomDefaultEntryHints || []);
    const count = mapList.length;
    if (count === 0) return;

    const selectedIdx = mapList.indexOf(Number(campaignMapCacheKey));
    const effectiveSelectedIdx = selectedIdx >= 0 ? selectedIdx : 0;

    const bodySize = MAP_ALL_ENTRY_OFFSET + count * 9;
    {
        const [msgAll, bodyAll] = getExactMessageBuffer(SN_MAP_CHANGE_ALL, bodySize);
        // byte[0]=0(flag), byte[1]=count — 클라이언트 파서 기대 포맷 (expected format by the client parser)
        bodyAll.writeUint8(0, 0x00);
        bodyAll.writeUint8(count, 0x01);
        if (MAP_ALL_ENTRY_OFFSET === 0x06)
            bodyAll.writeUint32LE(0, 0x02);
        for (let i = 0; i < count; i++) {
            const entryOffset = MAP_ALL_ENTRY_OFFSET + (i * 9);
            const cacheIndex = mapList[i] >>> 0;
            bodyAll.writeUint16LE(cacheIndex, entryOffset + 0x00);
            bodyAll.writeUint16LE(0, entryOffset + 0x02);
            bodyAll.writeUint8(i === effectiveSelectedIdx ? 1 : 0, entryOffset + 0x04);
            bodyAll.writeUint16LE(0, entryOffset + 0x05);
            bodyAll.writeUint16LE(0, entryOffset + 0x07);
        }
        client.send(msgAll);
        console.log(`[ZRoomDispatch] >> Sent SN_MAP_CHANGE_ALL 0x220226 (count=${count}, selectedIdx=${effectiveSelectedIdx}, mapId=${campaignMapCacheKey}, header=${MAP_ALL_HEADER_MODE}, body=0x${bodySize.toString(16)})`);
    }

    {
        const effectiveCacheKey = mapList[effectiveSelectedIdx] >>> 0;
        const [msg, respBody] = getExactMessageBuffer(SN_MAP_CHANGE_ONE, 0x0A);
        respBody.writeUint8(0, 0x00);
        respBody.writeUint16LE(effectiveCacheKey, 0x01);
        respBody.writeUint16LE(0, 0x03);
        respBody.writeUint8(1, 0x05);
        respBody.writeUint16LE(0, 0x06);
        respBody.writeUint16LE(0, 0x08);
        client.send(msg);
        console.log(`[ZRoomDispatch] >> Sent SN_MAP_CHANGE_ONE 0x220223 (slot=0, cacheKey=${effectiveCacheKey})`);
    }
}

function sendCampaignBootstrap(client, getExactMessageBuffer) {
    const [msg, body] = getExactMessageBuffer(SN_CAMPAIGN, 0x29);
    body.writeUint16LE(0, 0x00);
    body.writeUint32LE(0, 0x02);
    body.writeUint8(1, 0x0C);

    body.writeUint16LE(1, 0x0D);
    body.writeUint16LE(0, 0x0F);
    body.writeUint8(1, 0x11);
    body.writeUint8(1, 0x12);
    body.writeUint16LE(0, 0x13);
    body.writeUint16LE(0, 0x15);
    body.writeUint32LE(0, 0x17);

    body.writeUint16LE(2, 0x1B);
    body.writeUint16LE(0, 0x1D);
    body.writeUint8(1, 0x1F);
    body.writeUint8(0, 0x20);
    body.writeUint16LE(0, 0x21);
    body.writeUint16LE(0, 0x23);
    body.writeUint32LE(0, 0x25);
    client.send(msg);
    console.log(`[ZRoomDispatch] >> Sent Campaign_SN 0x23013A (action=1)`);
}

module.exports = {
    sendRoomMapPackets,
    sendCampaignBootstrap,
};
