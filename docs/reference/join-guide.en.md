# Joining guide (for a remote tester over VPN)

Server emulator for Metal Rage Online (Taiwanese client). This is a **private, invite-only
test server** — there is no password authentication, so access is gated entirely by (a) being
on the operator's VPN network and (b) your account name being on the server's whitelist. Ask
the operator for the VPN network name/password directly; don't share them further (not written
here on purpose).

## 1. Install the client

1. Download and unpack the game client: `MetalRage Online.rar` from
   https://archive.org/download/metal-rage-online-client/MetalRage%20Online/MetalRage%20Online.rar
2. **Windows 11:** apply shanzenos' compatibility fix —
   https://github.com/shanzenos/Metal-Rage-Online-Win11-Fix. The archive above already ships
   with the patched `MetalRage.exe` in `data\System\`, so on Win11 you don't need to swap
   anything.
3. **Windows 10:** you must use the *original* exe instead, or the game crashes on launch.
   Copy `data\System\_original_backup\MetalRage.exe` over `data\System\MetalRage.exe`. (Yes,
   that's the opposite of what the folder name suggests — `_original_backup` holds the
   unpatched exe Win10 needs; the top-level exe is the Win11-patched one.)

## 2. Join the VPN (Radmin VPN)

1. Install Radmin VPN: https://www.radmin-vpn.com/
2. Ask the operator for the network name and password, and join that network.
3. Radmin assigns you a virtual IP in the `26.x.x.x` range. Find it in the Radmin VPN window
   and send it to the operator, along with the account name you want to log in with.
4. Wait for the operator to confirm your account is whitelisted and the firewall rule covers
   your IP. **The server has to be restarted** for a new whitelist entry to take effect, so
   don't expect to connect the instant you send your IP.

## 3. Point the client at the server

The operator will give you the actual server address (looks like `26.x.x.x`). Treat
`<SERVER_VPN_IP>` below as a placeholder for it; do not guess it. Edit three places, all to
`<SERVER_VPN_IP>`:

- `data\System\MetalRage.ini` — the `ServerIP=` line
- `data\System\Default.ini` — the `ServerIP=` line
- The launcher, e.g. `Play Metal Rage Online.bat` — the `ip=` parameter on the command line
  that runs `MetalRage.exe` (looks like `...-globalid=TW&ip=127.0.0.1&port=9211&age=30`;
  change only the `ip=` part)

## 4. Firewall (only needed if you host a battle)

Battles are peer-to-peer: whoever creates the room and starts the match runs a listen server on
**UDP 30907**, and everyone else connects to that host. Only needed if *you* might host; skip
it if you'll always be joining. As Administrator, in PowerShell (only allows the Radmin VPN
subnet, Private profile — nothing opens to the public internet):

```powershell
New-NetFirewallRule -DisplayName "MRO-P2P-UDP-30907" -Direction Inbound -Protocol UDP `
  -LocalPort 30907 -Profile Private -RemoteAddress 26.0.0.0/8 -Action Allow
```

## 5. Stutter fix (recommended, do this once)

On some machines, Windows writes a ~29 MB crash dump every time the game's protection layer
throws an internal exception, freezing the game for ~0.25s each time — random stutter, and if
you're hosting, other players see monsters teleport and shots land without damage.

**Check first:** open `%LOCALAPPDATA%\CrashDumps`. New `MetalRage.exe*.dmp` files keep
appearing while you play → you have this problem.

**Fix** (Administrator PowerShell, paste once — reversible via deleting the registry key,
only touches crash-dump collection for `MetalRage.exe`):

```powershell
New-Item -Path 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\MetalRage.exe' -Force | Out-Null
New-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\Windows Error Reporting\LocalDumps\MetalRage.exe' -Name DumpCount -Value 0 -PropertyType DWord -Force | Out-Null
Remove-Item "$env:LOCALAPPDATA\CrashDumps\MetalRage.exe*.dmp" -Force -ErrorAction SilentlyContinue
```

## 6. What works and what doesn't

Working, verified with real clients: login/account creation, hangar (mech selection,
equipping, loadout), basic shop, lobby (room list/creation/options), a full PvE (Campaign)
match including round advance, death/respawn, end-of-match results, two clients in one room
over LAN. Battle networking is peer-to-peer as described above.

Not yet implemented: PvP modes, the real progression economy (match results aren't written
back to your account yet), Boss/TwoBoss/Tutorial PvE modes, friends/whispers/guilds/mail/gifts,
card system, cash shop.

**Known open issue we specifically want your help testing:** when the host's client stutters,
other players have reported monsters teleporting and their own shots not dealing damage. A fix
for the underlying stutter (step 5) went in 2026-09-20, but whether it actually resolves the
no-damage symptom for non-host players hasn't been confirmed with a second person yet — that's
part of what this session is for.

## 7. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Crashes immediately on launch | Wrong exe for your Windows version — see step 1. |
| Stuck on loading after start | UDP 30907 blocked, or wrong ini/bat address — recheck steps 3–4. |
| Can't see a room someone just created | Known client behavior: the room list only refreshes on certain actions, not live. Try leaving and re-entering the lobby; if still missing, tell the operator. |
| Login rejected | Your account isn't (yet) whitelisted, or the server hasn't restarted since it was added — tell the operator. |
