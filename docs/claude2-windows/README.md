# A second Claude Code account on Windows

A second account (`claude2`) that uses the same skills, agents, output styles, plugins, commands, `CLAUDE.md`,
`settings.json` and MCP servers as the main one (`~/.claude`), with its own login and history.
It is the Windows counterpart of the macOS setup. tabi picks it up on its own: the usage bar shows
"Claude2" and the new-agent menu gets "+ claude2" (see `mods/tabi-usage`, which reads `~/.local/bin/claude2.cmd`).

## Set it up

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File docs\claude2-windows\setup-claude2.ps1 -DryRun   # see what it would do
powershell -NoProfile -ExecutionPolicy Bypass -File docs\claude2-windows\setup-claude2.ps1           # do it
claude2                                                                                              # then type /login
```

It is safe to run again: each step checks first and skips what is done. Options: `-Name`, `-ConfigDir`, `-BinDir`,
`-Mcp`, `-Force` (replace a wrapper whose content differs), `-DryRun`.

## What is shared and how

| What | How | Why |
|---|---|---|
| `skills`, `agents`, `output-styles`, `plugins`, `commands` | junction (`mklink /J`) | Needs no administrator. One copy, both accounts see every change at once. |
| `CLAUDE.md`, `settings.json` | copied from `~/.claude` each time `claude2` starts | Symlinks need Developer Mode or administrator, and an editor or Claude Code that saves through a temporary file replaces a symlink with a plain file, silently. Hard links break the same way. |
| MCP servers (`engram`, `codegraph`, `context7`) | registered again with `claude mcp add --scope user`, same command and arguments | They live in `.claude.json`, which is account state and is not shared. |

The copy goes one way, main to second. Edits made to those two files from `claude2` are overwritten the next time it starts;
edit them in `~/.claude`. If you prefer symlinks, turn on Developer Mode and replace the two `copy` lines of the wrapper.

## What is never shared

`.credentials.json`, `.claude.json`, `history.jsonl`, `projects`, `sessions`, `file-history`, `session-env`,
`shell-snapshots`, `cache`, `backups`, `paste-cache`, `state`. The script only reads the `mcpServers` section of
`~/.claude.json`, and skips a server that has `env`, `headers` or a `url` (it may hold a key): add that one by hand.

## Good to know

- Remove a shared folder with `rmdir "%USERPROFILE%\.claude-cuenta2\skills"`, never with `del /s` or `rd /s`: through a junction
  they would delete the real files of the main account.
- Plugins are shared as a folder, so installing or updating one from either account affects both.
- Hooks in `settings.json` run in both accounts (for example the memory hooks write to the same place).

## Check it

```powershell
dir /AL %USERPROFILE%\.claude-cuenta2        # the five folders show as <JUNCTION>
claude2 mcp list                             # engram, codegraph and context7: Connected
```
