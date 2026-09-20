'use strict';

// P3 step 1 (docs/design/p3-step1-writeback.md §0, high-tier review point
// 6): single RecordInfo_SN 0x00210103 body builder shared by 9211's
// account.dispatch.js and 30907's gamelogin.dispatch.js. Before this, 9211
// used an old, wrong field layout (wins/draws written at +0x14/+0x18,
// overlapping Coupon; exp_max written at +0x48, which is actually Point)
// while 30907 had already been corrected (M1 money persistence,
// docs/journal/2026-09-18-16-money-persistence.md). This is the corrected
// layout only -- both call sites now produce byte-identical output for the
// same input.
//
// Layout confirmed against handler 0x107c0fa0 (docs/research/
// 2026-09-19-progression/notes.md; PM mechanical verification
// docs/research/2026-09-19-p3-writeback/verify-2026-09-20.md, 27/32 items
// matched):
//   +0x00        u32  Level
//   +0x04..+0x10 four u32, unconfirmed -- written 0 (⬜, not reverse
//                engineered by this task; both prior builders already left
//                these 0)
//   +0x14        i64  Coupon
//   +0x1c        u32  Win
//   +0x20        u32  Draw
//   +0x24        u32  Lose
//   +0x28        u32  Kill
//   +0x2c        u32  Death
//   +0x40        i64  LevelExp
//   +0x48        i64  Point
//   +0x50        8 bytes, unconfirmed -- written 0 (⬜, same as above)
// Body is 0x60 (96) bytes total. Every byte not listed above is written 0
// explicitly here (not just relied on from the caller's buffer already
// being zeroed) per this task's contract.

const { moneyBigInt } = require('./money');

/**
 * Writes the corrected RecordInfo_SN 0x00210103 body into `body` (expected
 * to be exactly 0x60 bytes, from getMessageBuffer(SN_RECORD_INFO, 0x60) or
 * equivalent).
 *
 * @param {Buffer} body
 * @param {{
 *   level: number,
 *   coupon: number,   // raw account.coupon (not pre-clamped) -- moneyBigInt
 *                      // applies the same clamp/fallback both prior
 *                      // builders already used
 *   point: number,    // raw account.point
 *   wins: number, draws: number, losses: number, kills: number, deaths: number,
 *   exp: number|string|bigint, // record.exp (LevelExp)
 * }} fields
 */
function writeRecordInfoBody(body, fields)
{
    for (let i = 0; i < 0x60; i += 4) body.writeUInt32LE(0, i);
    body.writeUInt32LE(fields.level, 0x00);
    body.writeBigUInt64LE(moneyBigInt(fields.coupon, 0), 0x14);
    body.writeUInt32LE(fields.wins, 0x1c);
    body.writeUInt32LE(fields.draws, 0x20);
    body.writeUInt32LE(fields.losses, 0x24);
    body.writeUInt32LE(fields.kills, 0x28);
    body.writeUInt32LE(fields.deaths, 0x2c);
    body.writeBigUInt64LE(BigInt(fields.exp), 0x40);
    body.writeBigUInt64LE(moneyBigInt(fields.point, 100000), 0x48);
}

module.exports = { writeRecordInfoBody };
