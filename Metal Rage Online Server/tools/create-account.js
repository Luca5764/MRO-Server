#!/usr/bin/env node
//
// Creates a playable account. There is no registration flow in the protocol —
// the client sends a username and the server either finds it or does not — so
// accounts have to be made out of band, and doing it by hand means writing
// rows into seven tables in the right order.
//
// db.createAccount() already does all of that in one transaction (record,
// 8 mech levels, 8 licenses, 6 maps, 4 tutorials, starter loadouts). This is
// the missing front door to it.
//
// Usage:
//   node tools/create-account.js <username> <nickname> [pilot]
//
//   pilot   101 (default) or 102
//
// Note: the accounts table has no password column. Logging in needs only a
// username that exists. That is the server's current design, not an oversight
// here — do not expose this server to a network you do not control.

const db = require('../database/db');

const [, , username, nickname, pilotArg] = process.argv;

function usage(msg)
{
    if (msg) console.error(`\n  ${msg}`);
    console.error(`
  Usage: node tools/create-account.js <username> <nickname> [pilot]

    username   login name sent by the client   (1-25 chars)
    nickname   in-game display name            (1-25 chars, must be unique)
    pilot      101 or 102                      (default 101)
`);
    process.exit(1);
}

if (!username || !nickname)
    usage();

if (username.length > 25 || nickname.length > 25)
    usage('username and nickname are limited to 25 characters by the schema.');

const pilot = pilotArg === undefined ? 101 : Number(pilotArg);
if (pilot !== 101 && pilot !== 102)
    usage(`pilot must be 101 or 102 (got ${pilotArg}).`);

(async () => {
    try
    {
        if (await db.getAccountByUsername(username))
        {
            console.error(`\n  Username "${username}" already exists. Nothing was changed.\n`);
            process.exit(1);
        }

        if (await db.getAccountByNickname(nickname))
        {
            console.error(`\n  Nickname "${nickname}" is taken. Nothing was changed.\n`);
            process.exit(1);
        }

        const id = await db.createAccount(username, nickname, pilot);

        console.log(`
  Created account #${id}
    username : ${username}
    nickname : ${nickname}
    pilot    : ${pilot}
    level    : 4 (Dev) — set by db.createAccount()

  Seeded: record, 8 mech levels, 8 licenses, 6 maps, 4 tutorials,
  starter loadouts for all 8 mechs.

  Log in from the client with the username above. There is no password.
`);
    }
    catch (err)
    {
        if (err.code === 'ECONNREFUSED')
        {
            console.error(`
  Cannot reach MySQL. Nothing was changed.

  Checked: ${err.address || '127.0.0.1'}:${err.port || 3306}
  Settings come from database/config.json.

  If MySQL is not installed yet:
      sudo apt install -y mysql-server
      sudo service mysql start
`);
        }
        else if (err.code === 'ER_BAD_DB_ERROR')
        {
            console.error(`
  MySQL is running but the database does not exist yet. Nothing was changed.

      sudo mysql -e "CREATE DATABASE mro CHARACTER SET utf8mb4;"
      sudo mysql mro < metalrageserver.sql
`);
        }
        else if (err.code === 'ER_NO_SUCH_TABLE')
        {
            console.error(`
  Database "mro" exists but the tables are missing. Nothing was changed.

      sudo mysql mro < metalrageserver.sql

  Use metalrageserver.sql, not database/schema.sql — schema.sql is missing
  the catalog and item_catalog tables that the shop query joins.
`);
        }
        else
        {
            console.error(`\n  Failed: ${err.code || ''} ${err.message}\n`);
        }
        process.exitCode = 1;
    }
    finally
    {
        await db.pool.end();   // the pool keeps the process alive otherwise
    }
})();
