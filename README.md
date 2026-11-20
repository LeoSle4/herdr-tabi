# herdr-tabi

The "tabi" layout and mods for [Herdr](https://github.com/ogulcancelik/herdr): sessions panel, usage meters,
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

## Tests

```bash
sh test/tabi.test.sh
```

They run the macOS and Linux command against a throwaway local repository.

## A second Claude Code account on Windows

See [docs/claude2-windows](docs/claude2-windows/README.md).
