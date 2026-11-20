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

## What an install touches

Only the files this repository tracks. Your data, caches and anything the `.gitignore` lists are left alone. If a
tracked file already exists and differs (your own `settings.json`, for example), the old copy is saved in
`.tabi-backup-<date>/` before it is replaced.

## Phone notifications

Herdr already plays a sound and shows a toast when an agent needs you or finishes. To also get a push on your phone
(or any device with the [ntfy](https://ntfy.sh) app), create `data/tabi/notify.json` inside the Herdr config folder.
It is off until that file exists, and `data/` is never committed.

macOS and Linux:

```bash
mkdir -p ~/.config/herdr-app/data/tabi
printf '{"topic":"tabi-%s"}\n' "$(openssl rand -hex 8)" > ~/.config/herdr-app/data/tabi/notify.json
```

Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force "$HOME\.config\herdr-app\data\tabi" | Out-Null
Set-Content "$HOME\.config\herdr-app\data\tabi\notify.json" ('{"topic":"tabi-' + [guid]::NewGuid().ToString('N').Substring(0, 16) + '"}')
```

Then subscribe to that topic in the ntfy app. All the options:

| Key | Meaning | Default |
|---|---|---|
| `topic` | Required: 8 to 64 letters, digits, `_` or `-`. On the public server the topic is the only secret, so keep it random | none (off) |
| `server` | Your own ntfy server (`https://` only) | `https://ntfy.sh` |
| `on` | `["blocked", "done"]`, or just one of them | both |
| `details` | `true` adds the space name to the message. Off by default because the server belongs to someone else | `false` |

Enable it on **one** machine only: every Herdr app sees every machine's agents, so two machines would send the same
alert twice. Messages go through `curl`, which Windows includes. If the file is invalid or the server is not `https`,
nothing is sent.

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
