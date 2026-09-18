// A minimal stand-in for client.js's NetworkClient, built only for the
// replay harness. Dispatch handlers never check `instanceof NetworkClient`
// (confirmed by grep before writing this), so a plain object with the same
// methods and ad-hoc fields is enough -- handlers set/read fields like
// `client.accountId_` dynamically either way.
//
// getMessageBuffer() reproduces client.js's real padding/header logic
// exactly (see client.js NetworkClient.getMessageBuffer) because several
// senders rely on the 16-byte alignment it performs; a divergent
// implementation here would make every packet size wrong instead of
// catching real regressions.

const MSG_HEADER_SIZE = 0x10;

function getMessageBuffer(type, size)
{
    size += MSG_HEADER_SIZE;
    if (size % 0x10 != 0)
        size += 0x10 - (size % 0x10);

    const msg = Buffer.alloc(size);
    msg.writeUint16BE(size, 0x6);
    msg.writeUint32BE(type, 0xC);

    return [msg, msg.subarray(MSG_HEADER_SIZE)];
}

/**
 * Creates a fake client for one connection.
 * @param {number} connId - matches packetlog conn ids so context reads the same
 * @param {number} port - 9211 (dispatch server) or 30907 (game server)
 * @returns {object}
 */
function makeFakeClient(connId, port)
{
    const sent = [];

    const client = {
        connId_: connId,
        socket_: { localPort: port, remoteAddress: '127.0.0.1', remotePort: 0 },

        getMessageBuffer,

        send(data)
        {
            if (data.length < MSG_HEADER_SIZE)
                throw new Error(`fake-client: send() called with a buffer shorter than the header (${data.length} bytes)`);

            const op = data.readUInt32BE(0xC);
            const body = data.subarray(MSG_HEADER_SIZE);
            sent.push({
                op: '0x' + (op >>> 0).toString(16).padStart(8, '0'),
                len: body.length,
                hex: Buffer.from(body).toString('hex'),
            });
        },

        disconnect()
        {
            client.disconnected_ = true;
        },

        _sent: sent,
    };

    return client;
}

module.exports = { makeFakeClient, getMessageBuffer, MSG_HEADER_SIZE };
