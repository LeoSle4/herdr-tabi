# Restarting the Windows host without signing in

The Windows laptop is the 24/7 host: the Mac and the phone reach its `herdr-core` over Tailscale and SSH. This page is the
test for "what happens after it restarts and nobody has signed in", and the fallback if the core does not come back.

## What to expect, from Herdr's own docs

- **Programs do not survive a restart.** A terminal lost to a reboot gets a plain shell in its last folder, with the same
  address; its original command (Claude Code, Codex) is never run again. Resume an agent from the sessions panel or
  with `claude --continue`.
- **A headless Windows machine can start its core over SSH.** So a connection from the Mac or the phone may be enough, and
  no autostart is needed.
- **Elevation can get in the way.** If your Windows account is an administrator, an SSH login is elevated. A core started
  that way can block your own desktop session later. Herdr's advice: open Herdr on that machine, or run `hc server start`
  in a normal (not administrator) terminal, then reconnect.

Already set up, per `ECOSISTEMA.md`: Tailscale with **Run unattended**, and `sshd` on automatic start.

## The test

Do it when you can walk away from the laptop for a few minutes.

**1. Before.** On the Mac, note what is there:

```bash
hc machine ls
hc ls
```

On Windows, in a normal PowerShell: `Get-Service sshd, Tailscale` (both `Running`, `sshd` on `Automatic`).

**2. Restart, and do not sign in.** In PowerShell on Windows: `Restart-Computer`. Leave it on the lock screen. If you use a
BitLocker PIN, the machine waits at the pre-boot screen and nothing below can work until someone types it.

**3. From the phone on mobile data (Wi-Fi off), or from the Mac, after about two minutes:**

| Check | How | Expected |
|---|---|---|
| The machine is back on the tailnet | `tailscale status` on the Mac, or the Tailscale app | `leosle` shows as connected |
| SSH answers | `ssh msi-casa hostname` | prints the hostname, no password |
| The core is reachable | `hc machine ls` on the Mac | `msi-casa` is `connected` (give it a minute; a failed login retries up to every 10 min, `hc machine login msi-casa` reconnects now) |
| The terminals came back | `hc ls` | the `msi-casa/t…` addresses are listed, now as shells |
| The phone sees it | Herdr Mobile | the machine and its terminals appear |

**4. Later, sign in at the laptop** and open Herdr. It should load normally. In a normal terminal, `hc server status` should
say the core is running. If Herdr cannot connect to the core, an elevated core is probably holding it: restart it from a
normal terminal with `hc server restart`.

## If the core did not come back

Work out which row failed:

- **Not on the tailnet:** Tailscale is not running unattended. In its settings, turn on "Run unattended".
- **SSH does not answer:** `Set-Service -Name sshd -StartupType Automatic; Start-Service sshd` (administrator PowerShell).
- **SSH works but `hc machine ls` shows `needs_login`:** `hc machine login msi-casa` from a terminal on the Mac.
- **SSH works and the core never starts:** use the fallback below.

## Fallback: start the core at boot

`autostart-core.ps1` registers a scheduled task that runs `hc server start` at startup, as your user and **not elevated**,
so it avoids the elevation problem above. It needs your Windows password, because the task has to run before you sign in;
the password is stored by Windows Task Scheduler, never by the script. It is untested on a headless boot, which is why it is
a fallback and not the default.

```powershell
# Administrator PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -File docs\windows-host\autostart-core.ps1            # shows the plan, changes nothing
powershell -NoProfile -ExecutionPolicy Bypass -File docs\windows-host\autostart-core.ps1 -Apply     # asks for the password and registers
powershell -NoProfile -ExecutionPolicy Bypass -File docs\windows-host\autostart-core.ps1 -Remove    # takes it away again
```

If you change your Windows password, run it again with `-Apply`. Then repeat the test from step 2.
