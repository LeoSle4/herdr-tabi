# Sub-agents on the agent cards

When a Claude Code session starts sub-agents (the orchestrator of gentle-ai does it all the time), Herdr does not see them:
they are not terminals. A small Claude Code hook records them, and the card of their agent shows them underneath:

```
┌─────────────────────────────┐
│ (Mai)  Mai                働 │   the agent's card
│        herdr-tabi · ...      │
├─────────────────────────────┤
│ 働 Explore          12 s     │   running: how long
│ 働 general-purpose  3 s      │
│ 済 web-fetch   Encontré 3…   │   finished: what it reported (stays two minutes)
└─────────────────────────────┘
```

## How it works

1. Claude Code runs `tools/tabi_subagents.py` on `SubagentStart`, `SubagentStop`, `Stop`, `Notification` and `SessionEnd`.
2. Herdr puts the id of the terminal in `HC_TERMINAL_ID`, so the hook knows which card the event belongs to.
3. The hook writes one small file per sub-agent in `~/.local/state/tabi/subagents/<terminal id>/`. One file each, so parallel
   sub-agents never overwrite each other.
4. The `tabi-party` mod reads those folders every 3 seconds and draws up to four rows (`+N más` for the rest).

The hook runs in the background (`async`), prints nothing and always exits 0: it cannot slow Claude down or break it.

## Install

```bash
python3 tools/tabi_subagents.py install      # Windows: python tools\tabi_subagents.py install
python3 tools/tabi_subagents.py status       # all five should say ok
```

It adds five entries to `~/.claude/settings.json` and keeps everything else (the first time it saves a copy as
`settings.json.tabi-backup`). Running it again changes nothing. For another account:
`python3 tools/tabi_subagents.py install --config-dir ~/.claude-cuenta2`. To undo it: `... uninstall`.

`gentle-ai sync` manages `settings.json` too. Whether it keeps hooks of yours was **not tested**: after a sync, run `status`,
and `install` again if it reports something missing.

## See it work without waiting for a real sub-agent

On the terminal of an agent (its id is in `echo $HC_TERMINAL_ID`):

```bash
printf '%s' '{"hook_event_name":"SubagentStart","agent_id":"demo","agent_type":"Explore"}' | python3 tools/tabi_subagents.py hook
printf '%s' '{"hook_event_name":"SubagentStop","agent_id":"demo","agent_type":"Explore","last_assistant_message":"Done."}' | python3 tools/tabi_subagents.py hook
```

A finished row shows on the card for two minutes. A running one only shows while its agent is working or waiting: if the
agent is idle, a "running" record is what a crash left behind and is hidden.

## What an agent says, in its notification

The same hook also listens to `Stop` (a turn ended) and `Notification` (Claude asks for something). It keeps the first line, 140
characters at most, in `_stop.json` and `_notification.json` next to the sub-agent files. The notification that `tabi-toast`
draws as the agent's card then reads like a bot message:

- finished: `済  terminó: Listo, el PR quedó publicado.`
- waiting: `待  te espera: Claude needs your permission to use Bash`

Only a text recorded within 30 seconds of the notification is shown, so an old answer never appears under a new one. The hooks
are not ordered with Herdr's status change, so the toast looks for the text for about 12 seconds; a permission prompt is
reported by Claude Code about 6 seconds after it appears and can still be late. Without the text, the card shows just the status.
`idle_prompt` reminders are ignored. Codex agents have no hook here, so they show just the status.

If you installed the hooks before this existed, run `install` again: `status` will say `Stop` and `Notification` are missing.
The text stays on this machine and is not sent to ntfy.

## Limits

- **Only this machine's agents.** An agent on another machine (its address starts with `msi-casa/`...) is covered by the hook
  of that machine, and its card is drawn by that machine's Herdr, not by this one.
- **Claude Code's own sub-agents only.** Helpers started with `hc run` are real terminals and Herdr already lists them. Codex
  has no equivalent hook here.
- **No task text.** The hooks give the sub-agent's type and, when it ends, its last message; not what it was asked to do. The
  row shows the type, the time while it runs, and the first line of its last message when it ends.
- **Privacy.** That first line (100 characters at most) is stored only on this machine, under `~/.local/state/tabi`. Folders are
  deleted when the session ends, finished records after 10 minutes, and nothing is ever committed or sent anywhere.
