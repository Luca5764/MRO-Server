#!/usr/bin/env node
//
// DUAL-PICO P2 (docs/research/2026-09-20-dual-pico/design.md §6 P2):
// creates a SECOND test account for same-machine dual-client automation.
// The design's CLIENTS table has a "host" instance and a "joiner" instance
// (joiner already uses `mrotest`) -- the host needs its own account so the
// two clients never share a session/room identity.
//
// Why hostAddress is required: `HOST_ADDRESS_REQUIRE` (config/whitelist.js)
// refuses to start a battle in any room that has a non-host member if the
// host's whitelist entry has no `hostAddress` (Ready_Host_SN 0x00420115
// path, community.dispatch.js's 0x00420114 handler). The design's role
// assignment (§1) has the new "host" account always be the one that starts
// the battle, with `mrotest` as the joiner -- so the new account MUST carry
// a valid hostAddress or battle start will be silently refused the moment a
// second member (mrotest) is in the room.
//
// This script does NOT invent an IP. It looks up the existing `mrotest`
// entry in config/allowed-users.json and reuses its hostAddress verbatim.
// That value is confirmed to work as a host address on this machine --
// the "Lucas" whitelist entry uses the same value and has hosted a real
// cross-network battle with it (docs/journal/2026-09-20-1530-m3r-vpn-
// rehearsal.md). Picking anything else risks guessing wrong, and
// HOST_ADDRESS_REQUIRE would only reveal that as a silent battle-start
// refusal much later.
//
// Usage:
//   node tools/create-second-test-account.js               # dry-run (default)
//   node tools/create-second-test-account.js --dry-run     # same, explicit
//   node tools/create-second-test-account.js --apply       # actually writes
//
// Dry-run prints the plan and writes nothing -- no backup, no account, no
// config file change. It still connects to the database read-only (via
// db.getAccountByUsername/getAccountByNickname) to report whether the
// account already exists; that is unavoidable if the printed plan is
// supposed to be accurate (see docs/backlog.md P2 task contract, which
// accepts this and asks it to be called out rather than avoided).
//
// --apply, in order:
//   1. dumps a full mysqldump backup to ~/mro-backups/ (same naming
//      convention as the mrotest backup, docs/journal/2026-09-20-1130-sp-
//      bind-test.md: `mro-before-<slug>-<timestamp>.sql`). Aborts before
//      touching the database if the dump command fails or produces empty
//      output.
//   2. creates the account via db.createAccount() -- the exact same
//      function tools/create-account.js and the auto-create-on-login path
//      (account.dispatch.js) use, so it gets the same record, 8 mech
//      levels, 8 licenses, 6 maps, 4 tutorials, and starter loadouts as
//      every other account, `mrotest` included. Skipped if the account
//      already exists.
//   3. adds/updates a `config/allowed-users.json` entry
//      { name, hostAddress, isTest: true }. Skipped (with a note) if that
//      file does not exist yet -- a missing file means the whitelist is
//      currently OFF (everyone allowed, see config/whitelist.js), and
//      creating the file here would flip the server into "only these
//      accounts" mode, which is a behavior change this script has no
//      business making on its own.
//
// Idempotent: rerunning (dry-run or --apply) detects the account and/or
// whitelist entry already existing and reports "nothing to do" for that
// step instead of erroring or duplicating anything. --apply still takes a
// fresh backup every time regardless of whether anything else changes --
// backups are cheap, and skipping the dump on a run that turns out to be a
// no-op isn't worth the risk of forgetting one on a run that isn't.
//
// AFTER --apply succeeds, config/allowed-users.json changed on disk, so:
//   - the server needs a FULL RESTART, not `/reload` (`/reload` only
//     covers dispatch/; config/ is outside it -- AGENTS.md 協作與紀錄規則,
//     "改到 dispatch/ 以外的檔案才要完整重啟").
//   - BEFORE restarting, run `/conns` on the server console and confirm no
//     one is online -- a restart drops every connection.
//
// Hard constraints this script enforces on itself (P2 task contract):
//   - never invents an IP; aborts if the reference (`mrotest`) entry's
//     hostAddress can't be found;
//   - never writes a real IP into anything under version control -- the
//     only real IP this script touches lives in config/allowed-users.json,
//     which is gitignored (see .gitignore), and this file's own source
//     contains no IP literal;
//   - dumps a full DB backup before any write, and aborts if the dump
//     fails;
//   - default is dry-run; --apply is required to write anything;
//   - will not create config/allowed-users.json if it doesn't already
//     exist.
//
// Not done here (out of scope for this script): does NOT restart the
// server, does NOT check /conns, does NOT touch the database beyond
// createAccount()'s own transaction. Those are manual follow-up steps
// printed at the end of a successful --apply run.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const db = require('../database/db');

const USERNAME = 'mrotesthost';
const NICKNAME = 'mrotesthost';
const PILOT = 101;
const REFERENCE_WHITELIST_NAME = 'mrotest'; // whose hostAddress we reuse, see docstring above

const ALLOWED_USERS_PATH = path.join(__dirname, '..', 'config', 'allowed-users.json');
const DB_CONFIG_PATH = path.join(__dirname, '..', 'database', 'config.json');
const BACKUP_DIR = path.join(os.homedir(), 'mro-backups');

const args = process.argv.slice(2);
const wantsApply = args.includes('--apply');
const wantsDryRun = args.includes('--dry-run');
if (wantsApply && wantsDryRun) {
    console.error('--dry-run and --apply are mutually exclusive.');
    process.exit(1);
}
const apply = wantsApply; // default (neither flag, or --dry-run) is dry-run

function readAllowedUsers()
{
    if (!fs.existsSync(ALLOWED_USERS_PATH)) {
        return null; // whitelist off; see docstring -- this script will not create the file
    }
    const raw = fs.readFileSync(ALLOWED_USERS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.users)) {
        throw new Error(`${ALLOWED_USERS_PATH}: "users" is not an array`);
    }
    return parsed;
}

function findEntry(parsed, name)
{
    const lower = name.toLowerCase();
    return parsed.users.find(entry => {
        const entryName = typeof entry === 'object' && entry !== null ? entry.name : entry;
        return String(entryName || '').toLowerCase() === lower;
    });
}

function findEntryIndex(parsed, name)
{
    const lower = name.toLowerCase();
    return parsed.users.findIndex(entry => {
        const entryName = typeof entry === 'object' && entry !== null ? entry.name : entry;
        return String(entryName || '').toLowerCase() === lower;
    });
}

function entryHostAddress(entry)
{
    if (!entry || typeof entry !== 'object') return null;
    if (typeof entry.hostAddress !== 'string') return null;
    const trimmed = entry.hostAddress.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function backupTimestamp()
{
    // mro-before-testaccount-20260920-112553.sql style: YYYYMMDD-HHMMSS, local time.
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return `${date}-${time}`;
}

function dumpBackup()
{
    if (!fs.existsSync(DB_CONFIG_PATH)) {
        throw new Error(`cannot back up: ${DB_CONFIG_PATH} not found`);
    }
    const dbConfig = JSON.parse(fs.readFileSync(DB_CONFIG_PATH, 'utf8'));
    fs.mkdirSync(BACKUP_DIR, { recursive: true });

    const outPath = path.join(BACKUP_DIR, `mro-before-testaccount2-${backupTimestamp()}.sql`);

    const mysqldumpArgs = [
        `--host=${dbConfig.host || '127.0.0.1'}`,
        `--port=${dbConfig.port || 3306}`,
        `--user=${dbConfig.user || 'root'}`,
        '--single-transaction',
        '--no-tablespaces',
        dbConfig.database || 'mro',
    ];
    const env = Object.assign({}, process.env);
    if (dbConfig.password) env.MYSQL_PWD = dbConfig.password;

    console.log(`[backup] mysqldump --single-transaction --no-tablespaces ${dbConfig.database || 'mro'} -> ${outPath}`);
    let sql;
    try {
        sql = execFileSync('mysqldump', mysqldumpArgs, { env, maxBuffer: 1024 * 1024 * 512 });
    } catch (err) {
        throw new Error(`mysqldump failed: ${err.message}`);
    }
    if (!sql || sql.length === 0) {
        throw new Error('mysqldump produced empty output; aborting without writing a backup file');
    }
    fs.writeFileSync(outPath, sql);
    const size = fs.statSync(outPath).size;
    if (size === 0) {
        throw new Error(`${outPath} is empty after write; aborting`);
    }
    console.log(`[backup] wrote ${size} bytes to ${outPath}`);
    return outPath;
}

async function main()
{
    console.log(`[create-second-test-account] mode: ${apply ? 'APPLY (will write)' : 'DRY-RUN (no writes)'}`);

    // --- plan: account ---
    const existingAccount = await db.getAccountByUsername(USERNAME);
    if (existingAccount) {
        console.log(`[account] "${USERNAME}" already exists (id=${existingAccount.id}) -- nothing to create.`);
    } else {
        const nicknameTaken = await db.getAccountByNickname(NICKNAME);
        if (nicknameTaken) {
            throw new Error(
                `nickname "${NICKNAME}" is already taken by a different account (id=${nicknameTaken.id}); `
                + 'pick a different NICKNAME constant before running --apply'
            );
        }
        console.log(
            `[account] "${USERNAME}" does not exist yet -- would create via `
            + `db.createAccount("${USERNAME}", "${NICKNAME}", ${PILOT}) (record, 8 mech levels, `
            + '8 licenses, 6 maps, 4 tutorials, starter loadouts -- same path tools/create-account.js '
            + 'and the auto-create-on-login path both use).'
        );
    }

    // --- plan: whitelist ---
    const parsed = readAllowedUsers();
    let hostAddress = null;
    if (!parsed) {
        console.log(
            `[whitelist] ${ALLOWED_USERS_PATH} does not exist -- whitelist is currently OFF `
            + '(everyone allowed). This script will NOT create that file (see module docstring); '
            + `add the account to the whitelist by hand once the file exists, reusing "${REFERENCE_WHITELIST_NAME}"'s hostAddress.`
        );
    } else {
        const referenceEntry = findEntry(parsed, REFERENCE_WHITELIST_NAME);
        hostAddress = entryHostAddress(referenceEntry);
        if (!hostAddress) {
            throw new Error(
                `could not find a valid hostAddress on the "${REFERENCE_WHITELIST_NAME}" entry in `
                + `${ALLOWED_USERS_PATH} -- refusing to guess an IP. Fix that entry first.`
            );
        }
        console.log(
            `[whitelist] found a valid hostAddress on the "${REFERENCE_WHITELIST_NAME}" entry `
            + '(value intentionally not printed here -- see the file directly if you need to confirm it).'
        );

        const existingEntry = findEntry(parsed, USERNAME);
        if (existingEntry) {
            const matches = entryHostAddress(existingEntry) === hostAddress && existingEntry.isTest === true;
            if (matches) {
                console.log(`[whitelist] "${USERNAME}" entry already present with matching hostAddress and isTest=true -- nothing to change.`);
            } else {
                console.log(
                    `[whitelist] "${USERNAME}" entry already present but differs -- would overwrite it with `
                    + `{ name: "${USERNAME}", hostAddress: <same as "${REFERENCE_WHITELIST_NAME}">, isTest: true }.`
                );
            }
        } else {
            console.log(
                `[whitelist] would append { name: "${USERNAME}", hostAddress: <same as "${REFERENCE_WHITELIST_NAME}">, isTest: true } `
                + `to ${ALLOWED_USERS_PATH}.`
            );
        }
    }

    if (!apply) {
        console.log('\n[dry-run] no backup taken, no account created, no file written. Re-run with --apply to make these changes.');
        return;
    }

    // --- apply: backup first, unconditionally, before any write below ---
    dumpBackup();

    // --- apply: account ---
    let accountId;
    if (existingAccount) {
        accountId = existingAccount.id;
    } else {
        accountId = await db.createAccount(USERNAME, NICKNAME, PILOT);
        console.log(`[account] created "${USERNAME}" (id=${accountId}).`);
    }

    // --- apply: whitelist ---
    if (parsed) {
        const newEntry = { name: USERNAME, hostAddress, isTest: true };
        const existingIndex = findEntryIndex(parsed, USERNAME);
        if (existingIndex >= 0) {
            parsed.users[existingIndex] = newEntry;
            console.log(`[whitelist] updated existing "${USERNAME}" entry.`);
        } else {
            parsed.users.push(newEntry);
            console.log(`[whitelist] appended "${USERNAME}" entry.`);
        }
        fs.writeFileSync(ALLOWED_USERS_PATH, JSON.stringify(parsed, null, 4) + '\n');
        console.log(`[whitelist] wrote ${ALLOWED_USERS_PATH}.`);
    }

    console.log(`
[create-second-test-account] Done. account id=${accountId}, username="${USERNAME}".

  NEXT STEPS (manual -- this script does not touch the running server):
    1. On the server console, run /conns and confirm no one is online.
    2. Fully restart the server (config/ changes are not picked up by
       /reload -- AGENTS.md 協作與紀錄規則, "改到 dispatch/ 以外的檔案
       才要完整重啟").
    3. Confirm the startup log shows the updated whitelist count, e.g.
       "[whitelist] Loaded N allowed user(s)".
`);
}

main()
    .catch(err => {
        console.error(`\n[create-second-test-account] FAILED: ${err.message}\n`);
        process.exitCode = 1;
    })
    .finally(() => db.pool.end());
