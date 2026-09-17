#!/usr/bin/env node
//
// Sets an account's permission level (accounts.account_level).
//
// The level is sent as an ASCII digit at body offset 0 of DefaultInfo_SN
// 0x00210101; ZNetwork.dll 0x107c0d40 atoi()s it into Account_UserType_Set.
// Client script (ZNetwork_DJ.uc m_MyAccountLevel) reads it as
// 0 = normal, 1 = spectator, 2 = MC, 3 = operator, 4 = developer, and
// My_Account_Spectator_Check() is level >= 1. When that is true,
// LevelInfo.GetLocalPlayerController() binds the GM/spectator keys
// (OptionAll.ApplyGMControl: no Fire, mouse = switch view, 1-0 = view player)
// instead of the normal ones. See docs/journal/2026-09-17-08-*.
//
// Usage:
//   node tools/set-account-level.js <username> <level 0-4>

const db = require('../database/db');

const [, , username, levelArg] = process.argv;
const level = Number(levelArg);

(async () => {
    if (!username || !Number.isInteger(level) || level < 0 || level > 4) {
        console.error('usage: node tools/set-account-level.js <username> <level 0-4>');
        process.exit(1);
    }
    const account = await db.getAccountByUsername(username);
    if (!account) {
        console.error(`no account named ${username}`);
        process.exit(1);
    }
    await db.pool.query('UPDATE accounts SET account_level = ? WHERE id = ?', [level, account.id]);
    console.log(`${username}: account_level ${account.account_level} -> ${level}`);
    process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
