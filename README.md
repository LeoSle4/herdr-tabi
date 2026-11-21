# herdr-tabi

The "tabi" layout and mods for [Herdr](https://github.com/herdrdev/herdr): sessions panel, usage meters,
spaces menu, backdrops and more. This repository is Herdr's config folder, so installing it is a clone into that
folder and updating it is a fast-forward pull. The `tabi` command does both.

## Install

Requires `git`. The sessions and backdrop mods also use Python 3.

**macOS and Linux (Homebrew)**

```bash
brew tap LeoSle4/tabi https://github.com/LeoSle4/herdr-tabi
brew install tabi
tabi install
```

**macOS and Linux (no Homebrew)**

```bash
curl -fsSL https://raw.githubusercontent.com/LeoSle4/herdr-tabi/main/install.sh | sh
```

**Windows (PowerShell)**

```powershell
irm https://raw.githubusercontent.com/LeoSle4/herdr-tabi/main/install.ps1 | iex
```

Open Herdr once before installing so its config folder exists, then restart Herdr after the install. At the end,
`tabi install` asks whether to install the terminal extras (see below).

## Update

```bash
tabi update
```

It fast-forwards to the latest version, refreshes the `tabi` command itself when it came from the one-line installer, and
tells you to restart Herdr. It refuses, without changing anything, if you
edited a tracked file or are on another branch. If you installed the command with Homebrew, `brew upgrade tabi` updates it.

## Commands

| Command | What it does |
|---|---|
| `tabi install` | Sets tabi up in the Herdr config folder. On an installed folder it behaves like `update`. |
| `tabi update` | Pulls the latest version. |
| `tabi shell` | Installs the terminal extras and wires your shell (see below). |
| `tabi memory` | `push`, `pull` or `status`: shares your Engram memories between machines (see below). |
| `tabi net-watch` | `run`, `install` or `remove`: keeps Tailscale up so the machines and the phone stay connected (see below). |
| `tabi status` | Shows the folder, the installed version and anything missing (git, Python). |
| `tabi version` | Prints the tool version. |

Pass `--dir <folder>` (`-Dir` on Windows) to use another folder. By default it is `$HERDR_APP_HOME`, else
`~/.config/herdr-app`; on Windows the first of `~\.config\herdr-app`, `%APPDATA%\herdr-app` and
`%LOCALAPPDATA%\herdr-app` that exists.

## Windows prompt and terminal extras

`tabi install` finishes by asking whether to install the terminal extras. Say yes there, or run it any time:

```powershell
tabi shell
```

(`tabi install -WithShell` accepts without asking, `-NoShell` skips the question.) It installs, with `winget`, what is
missing of: Starship, zoxide, fzf, eza, bat, PowerShell 7 and the JetBrainsMono Nerd Font; adds the PSFzf module; and adds
one block to your PowerShell profiles (Windows PowerShell and PowerShell 7). The block only loads `shell/profile.ps1`, so
a later `tabi update` changes the setup without touching the profile again. If a package cannot be installed it says so
and goes on.

It mirrors the macOS zsh setup:

- **Prompt:** the same Starship look (`shell/starship.toml`).
- **Autocompletion:** a gray suggestion from your history appears as you type; Right arrow accepts it. Tab opens a menu
  of matching files and folders (`cd her`, Tab). Predictions need PSReadLine 2.2 or newer, which PowerShell 7 includes;
  Windows PowerShell 5.1 does not have them, so run Herdr's shell with `pwsh`.
- **Smart cd:** `z her` jumps to the folder you visit most that matches "her".
- **Fuzzy finder:** Ctrl+R searches history, Ctrl+T picks a file.
- **`ls`, `ll` and `cat`** go through eza and bat when they are installed.

Herdr's terminal already uses JetBrains Mono, the same font as Ghostty. If the branch symbol shows as an empty box in
another terminal, set "JetBrainsMono Nerd Font" there.

## Terminal extras on macOS and Linux

```bash
tabi shell
```

(`tabi install --with-shell` accepts without asking, `--no-shell` skips the question, `tabi shell --no-install` only wires
the shell file.) With Homebrew it installs what is missing of Starship, zoxide, fzf, eza, bat, zsh-autosuggestions and
zsh-syntax-highlighting (and, on macOS, the JetBrainsMono Nerd Font), then adds one block to `~/.zshrc` or `~/.bashrc`.
Without Homebrew it lists what to install. The block loads `shell/profile.sh`, so `tabi update` changes the setup
without touching your rc file again; a copy of the original is kept as `<rc>.tabi-backup`.

It is the same setup as on Windows: the Starship prompt (a `~/.config/starship.toml` of your own wins), `z <part>`,
Ctrl+R and Ctrl+T with fzf, and `ls`, `ll` and `cat` through eza and bat. In zsh it adds history suggestions (Right arrow
accepts) and syntax highlighting; bash has no inline suggestions. Other shells get the two lines to add by hand.

## Engram memories between machines

Engram can sync through git: `engram sync` writes only the new memories, as compressed chunks, into `.engram/` of the folder
you run it in, and `engram sync --import` reads them on another machine. Prompts are left out unless you ask for them. Do not
copy `engram.db` itself: it is a live SQLite database. `tabi memory` wraps that flow.

Once per machine, create a **private** GitHub repository (for example `engram-memory`) and clone it as `~/engram-memory`
(or point `TABI_MEMORY_DIR` at another folder). Then:

```bash
tabi memory push     # export what is new here and send it
tabi memory pull     # fetch what the other machines sent and import it
tabi memory status   # Engram's own sync status
```

Memories hold everything you told your agents, so it is careful on purpose:

- It refuses the public `herdr-tabi` repository, and any repository `gh repo view` does not confirm as private. Without `gh`
  it refuses too, unless you set `TABI_MEMORY_TRUST=1`.
- It never exports prompts. Do not add `--include-prompts` yourself. `/.engram/` is ignored in this repository, so running
  `engram sync` inside it cannot publish anything.
- It is not live: pull before you start working and push when you finish. Use the same Engram version on every machine.

## Keeping the connection up

The Mac, the Windows laptop and the phone reach each other through Tailscale. When Tailscale loses its control server (after a
network change, for example) the machine shows as offline everywhere. `tabi net-watch` watches for that:

```bash
tabi net-watch install     # every 5 minutes: a launchd agent on macOS, a scheduled task (as your user) on Windows
tabi net-watch remove      # takes it away again
tabi net-watch run         # one check by hand
```

Each check does the following:

- Tailscale healthy: nothing. If it was offline before, the Herdr machines (`hc machine login`) are reconnected right away.
- Tailscale offline: `tailscale down` and `up`, once per check, up to **3 repairs**. If your Tailscale has settings that differ
  from the default (such as `--accept-routes`), the repair repeats exactly the command Tailscale suggests, so it never changes them.
- Still offline after 3 repairs: **one** push through the ntfy topic of `data/tabi/notify.json` (the same file the agent alerts
  use; without a topic there is no push). Then it stays quiet until Tailscale is back. The push names the machine only with
  `"details": true`.

Limits: it cannot fix a network without internet or a machine that is off, and it needs the machine to be awake. On Linux run
`tabi net-watch run` from cron or a systemd timer. On the Mac the log is `data/tabi/net-watch.log`. Also turn off key expiry for
your machines in the Tailscale admin console, and turn on "Run unattended" on Windows.

## What an install touches

Only the files this repository tracks. Your data, caches and anything the `.gitignore` lists are left alone. If a
tracked file already exists and differs (your own `settings.json`, for example), the old copy is saved in
`.tabi-backup-<date>/` before it is replaced.

## Notifications outside Herdr

Herdr already plays a sound and shows a toast **inside its window** when an agent needs you or finishes. To be told when you are
in another application, or away from the computer, create `data/tabi/notify.json` inside the Herdr config folder. It is off until
that file exists, and `data/` is never committed. Two channels, each optional:

- **Desktop** (`"desktop": true`): a notification of the system, shown only when Herdr is **not** the active window (inside it there
  is already its own). A system banner has a fixed shape (the icon of the app, a bold title, a text) and cannot be drawn like the
  card, so it is kept plain: **`Mai terminó · herdr-tabi`** in bold (who, what, where) and, below, the first line of what the
  agent said. The portrait is added where the system allows it.
  - **macOS:** with `terminal-notifier` (`brew install terminal-notifier`) the portrait shows on the right of the notification.
    Without it, or if macOS refuses it, `osascript` is used: same text, no portrait (it cannot show one). The icon on the left is
    always the one of the tool (a terminal, or Script Editor): macOS has no way to change it per notification. The first time, macOS asks
    to allow notifications for the tool: if nothing ever shows, open Script Editor once, run
    `display notification "hola" with title "tabi"` and allow it. `"notifier": "osascript"` skips `terminal-notifier` altogether.
  - **Windows:** a toast with the portrait cropped to a circle, through `tools/desktop-notify.ps1`.
  - **Linux:** `notify-send` with the portrait as the icon.
- **Phone** (`"topic": "..."`): a push through [ntfy](https://ntfy.sh), to its app on your phone.

Desktop only, macOS or Linux:

```bash
mkdir -p ~/.config/herdr-app/data/tabi
printf '{"desktop":true}\n' > ~/.config/herdr-app/data/tabi/notify.json
```

Desktop and phone, with a random topic:

```bash
mkdir -p ~/.config/herdr-app/data/tabi
printf '{"desktop":true,"topic":"tabi-%s","details":true}\n' "$(openssl rand -hex 8)" > ~/.config/herdr-app/data/tabi/notify.json
```

On Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force "$HOME\.config\herdr-app\data\tabi" | Out-Null
Set-Content "$HOME\.config\herdr-app\data\tabi\notify.json" ('{"desktop":true,"topic":"tabi-' + [guid]::NewGuid().ToString('N').Substring(0, 16) + '","details":true}')
```

Subscribe to the topic in the ntfy app. All the options:

| Key | Meaning | Default |
|---|---|---|
| `desktop` | `true`: a system notification when Herdr is not the active window | off |
| `topic` | The phone push: 8 to 64 letters, digits, `_` or `-`. On the public server the topic is the only secret, so keep it random | none (no push) |
| `server` | Your own ntfy server (`https://` only) | `https://ntfy.sh` |
| `on` | `["blocked", "done", "check"]`, or some of them. `check` is the result of the command of a task (*Asignar tarea…*, "comprobar al terminar"; `docs/assign-task`) | all three |
| `details` | `true`: the **phone** push carries the character and the first line of what the agent said. Off, it only says the program and the status | `false` |
| `notifier` | macOS: `"osascript"` never uses `terminal-notifier` (text only, no portrait) | `"auto"` |
| `debug` | `true`: writes what happens (a change noticed, whether the window was active, the exit code of the command) to `data/tabi/notify.log`, the last 80 lines. For finding out why nothing shows | `false` |

**Privacy.** The desktop notification never leaves your machine. With `details` on, the first line (140 characters) of the agent's
last answer is sent to the ntfy server, which on ntfy.sh belongs to somebody else: use your own server, or leave `details` off
(the push then says only "Claude Code terminó"). An invalid file, a topic that is too short or a `server` that is not `https` turn
everything off instead of sending anywhere.

**What the text is.** It comes from the Claude Code hook (`docs/subagents/README.md`, five events installed), so it needs
`python3 tools/tabi_subagents.py install`, and it is available for agents that run **on the machine that sends the notification**.
For an agent of another machine, or for Codex, the notification says the character and the space but not what it said. A change
waits up to 8 seconds for its text and goes without it after that.

If nothing shows, add `"debug": true` to `notify.json`, make an agent finish a turn while you are in another application, and read
`data/tabi/notify.log`: it says whether the change was seen, whether Herdr counted as the active window, and how each command ended
(for the phone, the HTTP status of ntfy and its answer, which says what it did not like).

Enable the **phone** on one machine only: every Herdr app sees every machine's agents, so two machines would send the same
alert twice. Messages go through `curl`, which Windows includes. To change the sounds themselves, see below.

## Alert sounds

Herdr plays a sound when an agent needs you (`blocked`) or finishes (`done`). This repository ships two of its own in
`sounds/`, and `settings.json` already points to them:

- `blocked.mp3`: a temple bell, one strike, 1.9 s.
- `done.mp3`: a softer wind chime, two taps, 1.3 s.

They are synthesized by `tools/make-sounds.py`, so they carry no third-party material (see `sounds/CREDITS.md`). To change
their pitch, length or decay, edit the numbers in that script and run it again (the command is in its header).
Hear them with `afplay sounds/blocked.mp3` on macOS.

To use other files, set them in `settings.json` (an absolute path, or one relative to the Herdr config folder; it applies
live):

```json
"sounds": { "enabled": true, "blocked": "sounds/blocked.mp3", "done": "sounds/done.mp3" }
```

Herdr's own sounds are MP3, so use MP3 to be safe (other formats were not checked). Keep them short, under two seconds,
and make the two clearly different: a sharper one for `blocked`, a softer one for `done`. Files in `sounds/` reach your
other machines with `tabi update`.

**Licences matter once the files go in a public repository.** Commit only sounds that are CC0 (public domain) or that you
made yourself, and list each one's source in `sounds/CREDITS.md`. Where to look:

| Source | Licence | Notes |
|---|---|---|
| [Freesound](https://freesound.org/browse/tags/japanese) | Per sound: filter by **CC0** | Temple bells (keisu, bonshō), shrine bells with a coin offering, single ceremonial strikes. Check the licence on each sound's page |
| [OpenGameArt](https://opengameart.org) | Per item: filter by **CC0** | Game audio; bell and instrument packs, including koto music |
| [Kenney](https://kenney.nl/assets?q=audio) | CC0 for every pack | Clean UI and interface sounds, but not Japanese in style |
| Your own recording or synthesis | Yours | The safest option |

Avoid for committed files: **Pixabay** (its licence forbids distributing a file on a standalone basis, which a public
repository probably counts as), and anything that asks for attribution you will not give.

Search terms that fit the tabi look: 鐘 *kane* or *bonshō* (temple bell), 鈴 *suzu* (shrine bell), 風鈴 *furin* (wind
chime), 尺八 *shakuhachi*, 琴 *koto*, 鹿威し *shishi-odoshi* (bamboo fountain), 拍子木 *hyōshigi* (wooden clappers),
木魚 *mokugyo*. A short bell for `blocked` and a soft chime for `done` is a good place to start.

## Tests

```bash
sh test/tabi.test.sh
```

They run the macOS and Linux command against a throwaway local repository. On Windows, `test/tabi.test.ps1` does the
same for `bin/tabi.ps1` and checks that every PowerShell script parses. GitHub Actions runs both, plus the mod tests,
on macOS, Linux and Windows (PowerShell 7 and Windows PowerShell 5.1) for every pull request.

## A second Claude Code account on Windows

See [docs/claude2-windows](docs/claude2-windows/README.md).

## Restarting the Windows host without signing in

See [docs/windows-host](docs/windows-host/README.md): a test for what happens after a restart, and a fallback that starts
`herdr-core` at boot.
