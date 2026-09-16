const NetworkClient = require("../client");
const packetlog = require("../packetlog.js");

// ZDispatchLobby - Handles lobby operations after entering a channel
//
// Known methods from ZNetwork.dll:
//   Enter_CQ/SA        - Enter lobby
//   Leave_CQ/SA        - Leave lobby
//   Create_CQ/SA       - Create a room
//   Request_CQ/SA      - Request room/channel list
//   Room_List_SN       - Room list notification
//   Channel_Add_SN     - Channel add notification
//   Server_Add_SN      - Server add notification
//   User_Add_SN        - User joined lobby notification
//   User_Delete_SN     - User left lobby notification
//   User_Nick_Change_SN
//   User_Clan_Info_SN
//   User_Clan_Clear_SN
//
// Confirmed message ID range: 0x00230101 through 0x00230152 (30 IDs total)
// All 0x23XXXX messages belong to this dispatch.

// All known lobby message IDs from the dispatch table in ZNetwork.dll
const LOBBY_IDS = [
    0x00230101, 0x00230102, 0x00230103, 0x00230104, 0x00230105,
    0x00230106, 0x00230107, 0x00230108, 0x00230109, 0x0023010A,
    0x00230111, 0x00230112, 0x00230121, 0x00230122, 0x00230131,
    0x00230132, 0x00230141, 0x00230142, 0x00230143, 0x00230144,
    0x00230145, 0x00230146, 0x00230147, 0x00230148, 0x00230149,
    0x0023014A, 0x00230151, 0x00230152,
];

//Possible message IDs:
// Gate: 0x220101=SN_SERVER_ADD, 0x220102=SN_CHANNEL_ADD, 0x220131=CQ_LEAVE, 0x220132=SA_LEAVE
// Following the same structure for Lobby (0x23):
//   0x230101 = Room_List_SN or Enter-related
//   0x230111/12 = Enter_CQ/SA
//   0x230121/22 = Leave_CQ/SA
//   0x230131/32 = Create_CQ/SA
//   0x230141/42 = Request_CQ/SA

module.exports =
class ZLobbyDispatch
{
    /**
     * @param {NetworkClient} client
     * @param {number} type
     * @param {Buffer} body
     * @returns {boolean}
     */
    dispatch(client, type, body)
    {
        // Catch ALL messages in the 0x0023XXXX range
        if ((type & 0x00FF0000) !== 0x00230000)
            return false;

        console.log(`[ZLobbyDispatch] Message 0x${type.toString(16).padStart(8, '0')} (${body.length} bytes)`);
        if (body.length > 0) {
            console.log(`[ZLobbyDispatch] Body:`, body.toString('hex'));
            // Try to extract readable strings from the body
            const ascii = body.toString('ascii').replace(/[^\x20-\x7e]/g, '.');
            if (ascii.replace(/\./g, '').length > 2) {
                console.log(`[ZLobbyDispatch] ASCII:`, ascii);
            }
        }

        switch (type)
        {
            // Lobby Enter - the first message a client sends after connecting to game server
            // Trying 0x00230111 based on the CQ/SA pattern (X111/X112)
            case 0x00230111:
            {
                // Only a lobby-enter while actually in the lobby. Once the
                // player is in a game (gameStarted_), the client sends 0x230111
                // once a second as an in-map poll, and answering it with a
                // lobby-enter SA + empty room list is nonsense to a client
                // sitting at the mission briefing — it was looping that pair
                // for minutes. In-game, leave it to the fallback (which logs it)
                // until its real in-map meaning is known.
                if (client.gameStarted_) {
                    console.log(`[ZLobbyDispatch] >> 0x230111 while in game — not treating as Lobby Enter`);
                    return false;
                }

                console.log(`[ZLobbyDispatch] >> Lobby Enter CQ (guessed)`);
                {
                    const [msg, respBody] = client.getMessageBuffer(0x00230112, 0x6);
                    respBody.writeUint16LE(0x0000, 0); // EventMessage = OK
                    respBody.writeUint32LE(0x0000, 2); // ErrorMessage = OK
                    client.send(msg);
                }
                this.sendEmptyRoomList(client);
                return true;
            }

            //Enter might be 0x00230101/02 ?
            case 0x00230101:
            {
                console.log(`[ZLobbyDispatch] >> Possible Lobby Enter/Request CQ (0x230101)`);

                {
                    const [msg, respBody] = client.getMessageBuffer(0x00230102, 0x6);
                    respBody.writeUint16LE(0x0000, 0);
                    respBody.writeUint32LE(0x0000, 2);
                    client.send(msg);
                }

                this.sendEmptyRoomList(client);
                return true;
            }

            // Lobby Leave
            case 0x00230121:
            {
                console.log(`[ZLobbyDispatch] >> Lobby Leave CQ (guessed)`);
                const [msg, respBody] = client.getMessageBuffer(0x00230122, 0x6);
                respBody.writeUint16LE(0x0000, 0);
                respBody.writeUint32LE(0x0000, 2);
                client.send(msg);
                return true;
            }

            // BeginRound_CN. Despite this file's historical name, the client
            // dispatch map assigns the in-game 0x23xxxx range to ZDispatchGame.
            // Once the listen host reports that its round has started, confirm
            // the round and then revive the already-selected slot. The latter
            // is the native path that calls AGameInfo::SelectUnitSlot_BD.
            case 0x00230151:
            {
                const [beginMsg, beginBody] = client.getMessageBuffer(0x00230152, 0x06);
                beginBody.writeUint16LE(0, 0);
                beginBody.writeUint32LE(0, 2);
                client.send(beginMsg);
                console.log(`[ZLobbyDispatch] >> Sent BeginRound_SN 0x00230152`);

                setTimeout(() => {
                    if (!client.gameStarted_)
                        return;

                    // ZDispatchGame::Respawn_SN reads:
                    //   body+0x00 u16 EventMessage
                    //   body+0x02 u32 ErrorMessage
                    //   body+0x0A u16 user/account index
                    // On success it takes the selected slot already installed
                    // by Game_User_SN and calls Game_Action_Revive("SUCCESS"),
                    // which reaches AGameInfo::eventSelectUnitSlot_BD.
                    const [respawnMsg, respawnBody] = client.getMessageBuffer(0x00230104, 0x0C);
                    respawnBody.writeUint16LE(0, 0x00);
                    respawnBody.writeUint32LE(0, 0x02);
                    respawnBody.writeUint32LE(0, 0x06);
                    respawnBody.writeUint16LE(Number(client.accountIndex_ || client.accountId_ || 1), 0x0A);
                    client.send(respawnMsg);
                    console.log(
                        `[ZLobbyDispatch] >> Sent Respawn_SN 0x00230104 ` +
                        `(userIndex=${Number(client.accountIndex_ || client.accountId_ || 1)})`
                    );
                }, 250);
                return true;
            }

            // Death_CN. The client body is:
            //   +0x00 attacker user index (u16)
            //   +0x02 victim user index (u16)
            //   +0x04 encoded death type (u8)
            //   +0x05 special flag (u8)
            //   +0x06 weapon/part byte (u8)
            //   +0x07 auxiliary value (u32)
            // Death_SN has two score snapshots after the event fields. They
            // may be zero while the score service is still unimplemented, but
            // the victim index must be present: Death_SN uses it to move the
            // game user from alive (2) to respawnable (1).
            case 0x00230123:
            {
                const attackerIndex = body.length >= 2 ? body.readUint16LE(0x00) : 0;
                const victimIndex = body.length >= 4
                    ? body.readUint16LE(0x02)
                    : Number(client.accountIndex_ || client.accountId_ || 1);
                const deathType = body.length >= 5 ? body[0x04] : 0x03;
                const specialFlag = body.length >= 6 ? body[0x05] : 0;
                const weaponPart = body.length >= 7 ? body[0x06] : 0;
                const auxiliaryValue = body.length >= 11 ? body.readUint32LE(0x07) : 0;

                // Last field consumed by Death_SN is a u32 at body+0x4d.
                const [deathMsg, deathBody] = client.getMessageBuffer(0x00230124, 0x51);
                deathBody.writeUint16LE(0, 0x00);
                deathBody.writeUint32LE(0, 0x02);
                deathBody.writeUint32LE(0, 0x06);
                deathBody.writeUint16LE(attackerIndex, 0x0A);
                deathBody.writeUint16LE(victimIndex, 0x0C);
                deathBody[0x0E] = deathType;
                deathBody[0x0F] = specialFlag;
                deathBody[0x10] = weaponPart;
                deathBody.writeUint32LE(auxiliaryValue, 0x11);
                client.send(deathMsg);
                console.log(
                    `[ZLobbyDispatch] >> Sent Death_SN 0x00230124 ` +
                    `(attacker=${attackerIndex}, victim=${victimIndex}, type=${deathType})`
                );

                // Some builds do not emit Respawn_CN after an environmental
                // death. Match the visible respawn countdown, then revive the
                // victim unless a client request has already done so.
                client.respawnGeneration_ = (client.respawnGeneration_ || 0) + 1;
                const generation = client.respawnGeneration_;
                setTimeout(() => {
                    if (!client.gameStarted_ || client.respawnGeneration_ !== generation)
                        return;
                    this.sendRespawn(client, victimIndex, 'death countdown');
                }, 5000);
                return true;
            }

            // Respawn_CN. Its payload is not needed by Respawn_SN; the server
            // identifies the player from the connection.
            case 0x00230103:
            {
                client.respawnGeneration_ = (client.respawnGeneration_ || 0) + 1;
                this.sendRespawn(
                    client,
                    Number(client.accountIndex_ || client.accountId_ || 1),
                    'Respawn_CN'
                );
                return true;
            }

            // Lobby Room Create
            case 0x00230131:
            {
                console.log(`[ZLobbyDispatch] >> Lobby Room Create CQ (guessed)`);
                const roomType = body.length > 0 ? body[0] : 0;
                const mapSeed = body.length >= 6 ? body.readUint32LE(2) : 0;
                const mapId = body.length >= 10 ? body.readUint32LE(6) : (mapSeed || 1);
                const requestedMaxPlayers = body.length > 0x0B ? body[0x0B] : 8;
                const gameMode = body.length > 0x0C ? body[0x0C] : 0;
                const isCampaignLike = roomType === 2 || gameMode === 5 || (roomType === 1 && gameMode === 4);
                const isTrueCampaign = isCampaignLike;  // 로비 경로에서는 campaignLike=trueCampaign (in the lobby path, campaignLike=trueCampaign)
                const effectiveRoomType = isCampaignLike ? 2 : roomType;
                client.roomIndex_ = client.roomIndex_ || 1;
                client.roomType_ = effectiveRoomType;
                client.rawRoomType_ = roomType;
                client.mapId_ = mapId;
                client.mapSeed_ = mapSeed;
                client.maxPlayers_ = isCampaignLike
                    ? Math.min(Math.max(requestedMaxPlayers || 4, 1), 4)
                    : Math.min(Math.max(requestedMaxPlayers || 8, 1), 8);
                client.gameMode_ = gameMode;
                client.campaignRoom_ = isCampaignLike;
                client.isTrueCampaign_ = isTrueCampaign;

                const [msg, respBody] = client.getMessageBuffer(0x00230132, 0x6);
                respBody.writeUint16LE(0x0000, 0);
                respBody.writeUint32LE(0x0000, 2);
                client.send(msg);

                setTimeout(() => {
                    try {
                        const ZRoomDispatch = require('./room.dispatch');
                        new ZRoomDispatch().sendRoomState(client);
                        console.log(`[ZLobbyDispatch] >> Sent room state after Lobby Create CQ`);
                    } catch (err) {
                        console.error(`[ZLobbyDispatch] >> Lobby Create room state error:`, err.message);
                    }
                }, 250);
                return true;
            }

            // Lobby Request (room list)
            case 0x00230141:
            {
                console.log(`[ZLobbyDispatch] >> Lobby Request CQ (guessed)`);
                const [msg, respBody] = client.getMessageBuffer(0x00230142, 0x6);
                respBody.writeUint16LE(0x0000, 0);
                respBody.writeUint32LE(0x0000, 2);
                client.send(msg);

                this.sendEmptyRoomList(client);
                return true;
            }

            default:
            {
                packetlog.fallback(client, 'ZLobbyDispatch', type, body, type + 1);

                //Generic OK Response to keep client from crashing / hanging
                const responseType = type + 1;
                console.log(`[ZLobbyDispatch] >> Auto-responding with 0x${responseType.toString(16).padStart(8, '0')}`);
                const [msg, respBody] = client.getMessageBuffer(responseType, 0x6);
                respBody.writeUint16LE(0x0000, 0);
                respBody.writeUint32LE(0x0000, 2);
                client.send(msg);
                return true;
            }
        }
    }

    /**
     * Sends an empty room list to the client
     * @param {NetworkClient} client
     */
    sendEmptyRoomList(client)
    {
        //Possibly 0x220101 = SN_SERVER_ADD, lobby might use 0x230103 or similar.
        //Test 0x00230103 as Room_List_SN.
        const [msg, body] = client.getMessageBuffer(0x00230103, 0x4);
        body[0] = 0x00; // No more messages following
        body[1] = 0x00; // Room count = 0
        body.writeUint16LE(0, 2);
        client.send(msg);
    }

    sendRespawn(client, userIndex, sourceTag)
    {
        const [msg, body] = client.getMessageBuffer(0x00230104, 0x0C);
        body.writeUint16LE(0, 0x00);
        body.writeUint32LE(0, 0x02);
        body.writeUint32LE(0, 0x06);
        body.writeUint16LE(userIndex, 0x0A);
        client.send(msg);
        console.log(
            `[ZLobbyDispatch] >> Sent Respawn_SN 0x00230104 ` +
            `(userIndex=${userIndex}, source=${sourceTag})`
        );
    }
};
