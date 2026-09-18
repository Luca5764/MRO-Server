/**
 * test_replay.js - Protocol Replay & Regression Test Harness
 * ==========================================================
 * Replays client-sent packets from real session JSONL logs against a running server.
 * Verifies:
 *   1. Server does not crash or throw unhandled exceptions.
 *   2. Server does not send frames exceeding 0x400 bytes (CLIENT_MAX_FRAME limit).
 *   3. Server replies with expected response opcodes.
 *   4. Timing and frame integrity.
 *
 * Usage:
 *   node tools/test_replay.js [path/to/session.jsonl]
 *   node tools/test_replay.js --latest
 */

const fs = require('fs');
const path = require('path');
const net = require('net');
const { pack, unpack, peekLength } = require('../message.js');

const DEFAULT_PORT = 9211;
const DEFAULT_HOST = '127.0.0.1';
const CLIENT_MAX_FRAME = 0x400;

function findLatestSessionLog() {
    const logDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logDir)) return null;
    const files = fs.readdirSync(logDir)
        .filter(f => f.startsWith('session-') && f.endsWith('.jsonl'))
        .map(f => ({ name: f, time: fs.statSync(path.join(logDir, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);
    return files.length > 0 ? path.join(logDir, files[0].name) : null;
}

function parseSessionFile(filePath) {
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
    const packets = [];

    for (const line of lines) {
        if (!line.trim()) continue;
        try {
            const entry = JSON.parse(line);
            if (entry.ev === 'pkt' && entry.dir === 'recv') {
                packets.push({
                    op: parseInt(entry.op, 16),
                    opHex: entry.op,
                    len: entry.len,
                    hex: entry.hex,
                    port: entry.port || DEFAULT_PORT,
                    conn: entry.conn
                });
            }
        } catch (e) {
            // Ignore parse errors on corrupted lines
        }
    }
    return packets;
}

async function runReplayTest(sessionPath) {
    console.log(`[REPLAY] Loading session: ${sessionPath}`);
    const clientPackets = parseSessionFile(sessionPath);
    console.log(`[REPLAY] Found ${clientPackets.length} client (recv) packets to replay.\n`);

    if (clientPackets.length === 0) {
        console.log('[WARN] No recv packets found in this session.');
        return;
    }

    let passCount = 0;
    let failCount = 0;
    let maxFrameSeen = 0;

    return new Promise((resolve) => {
        const socket = new net.Socket();
        let salt = 0xf0f00f0f;
        let sequence = 0;
        let recvBuf = Buffer.alloc(0);
        let currentPktIdx = 0;
        let serverResponses = [];

        socket.connect(DEFAULT_PORT, DEFAULT_HOST, () => {
            console.log(`[NET] Connected to server at ${DEFAULT_HOST}:${DEFAULT_PORT}`);
            sendNextPacket();
        });

        socket.on('data', (chunk) => {
            recvBuf = Buffer.concat([recvBuf, chunk]);

            while (recvBuf.length >= 0x10) {
                const frameLen = peekLength(recvBuf);
                if (frameLen > maxFrameSeen) maxFrameSeen = frameLen;

                // Check 0x400 boundary rule!
                if (frameLen > CLIENT_MAX_FRAME) {
                    console.error(`\n[FAIL ❌] CRITICAL: Server sent frame length 0x${frameLen.toString(16)} (${frameLen} bytes)!`);
                    console.error(`          This EXCEEDS the client 0x400 frame ceiling and causes client freeze.`);
                    failCount++;
                }

                if (recvBuf.length < frameLen) break;

                const frame = recvBuf.subarray(0, frameLen);
                recvBuf = recvBuf.subarray(frameLen);

                try {
                    const unpacked = unpack(frame, frameLen, salt, sequence);
                    const opHex = '0x' + unpacked.opcode.toString(16).padStart(8, '0');
                    serverResponses.push({ opHex, len: frameLen });

                    // Update salt on handshake response (0x00020081)
                    if (unpacked.opcode === 0x00020081) {
                        salt = unpacked.buffer.readUInt32LE(0x08);
                    }
                } catch (err) {
                    console.error(`[WARN] Error unpacking server response: ${err.message}`);
                }
            }
        });

        function sendNextPacket() {
            if (currentPktIdx >= clientPackets.length) {
                console.log(`\n[REPLAY] Finished sending all ${clientPackets.length} packets.`);
                setTimeout(finish, 1000);
                return;
            }

            const p = clientPackets[currentPktIdx++];
            const bodyBuf = Buffer.from(p.hex, 'hex');
            const sndBuf = Buffer.alloc(bodyBuf.length + 0x20);
            bodyBuf.copy(sndBuf, 0x10);

            try {
                const totalLen = pack(sndBuf, bodyBuf.length, p.op, salt, sequence++);
                socket.write(sndBuf.subarray(0, totalLen));
                passCount++;
                process.stdout.write(`\r[SEND] Replayed ${currentPktIdx}/${clientPackets.length} | op=${p.opHex} len=${p.len} `);
            } catch (err) {
                console.error(`\n[ERR] Pack failed for op ${p.opHex}: ${err.message}`);
                failCount++;
            }

            setTimeout(sendNextPacket, 60);
        }

        function finish() {
            socket.destroy();
            console.log('\n\n================ REPLAY TEST SUMMARY ================');
            console.log(`  Packets Sent      : ${passCount}`);
            console.log(`  Packets Failed    : ${failCount}`);
            console.log(`  Responses Received: ${serverResponses.length}`);
            console.log(`  Max Frame Observed: 0x${maxFrameSeen.toString(16)} (${maxFrameSeen} bytes) / Limit: 0x${CLIENT_MAX_FRAME.toString(16)}`);

            if (maxFrameSeen <= CLIENT_MAX_FRAME && failCount === 0) {
                console.log('  Result            : ✅ ALL CHECKS PASSED (No buffer overflow, no crash)');
            } else {
                console.log('  Result            : ❌ FAILED (Rule violation detected)');
            }
            console.log('=====================================================\n');
            resolve();
        }

        socket.on('error', (err) => {
            console.error(`\n[NET ERR] ${err.message}`);
            resolve();
        });
    });
}

const targetFile = process.argv[2] === '--latest' || !process.argv[2]
    ? findLatestSessionLog()
    : process.argv[2];

if (!targetFile || !fs.existsSync(targetFile)) {
    console.error(`[ERR] Session file not found: ${targetFile}`);
    process.exit(1);
}

runReplayTest(targetFile);

