# Model and effort of an agent (⚙)

The panel **始 · iniciar** has a ⚙ next to **+ claude**, **+ claude2** (each extra account) and **+ codex**. It opens **調 · Modelo y
esfuerzo** for that agent, so you do not type `--model` or `/model` to start an agent with the one you want.

- **Claude Code and its accounts:** the model (`fable`, `opus`, `sonnet`, or "Por defecto") and the effort (`low`, `medium`, `high`,
  `xhigh`, `max`). They go to the command as `--model` and `--effort`.
- **Codex:** the models and the levels each one supports come from Codex's own `~/.codex/models_cache.json` (the ones it lists, not the
  hidden ones), so a new model shows up without changing tabi. They go as `-m <model>` and `-c model_reasoning_effort=<level>`, the
  key of your `config.toml`. If the file is being rewritten when it is read, it is read again a couple of times.
- **"Por defecto"** adds no flag: the agent starts with its own settings.

What you choose is kept **per agent** in `data/tabi/launch.json` until you change it. It is used by the **+** buttons (and the one-row
version of the panel) and by **Asignar tarea…**, which shows it under the agents ("Modelo y esfuerzo: opus · high"). The gear is lit
when something is chosen, and the tooltip of the button says what.

## Changing a session that is already running (⇄)

Next to the status of the card of a **Claude Code** agent there is a **⇄**. It opens **調 · Cambiar en la sesión**: pick a model or an
effort and press **Escribir /model …** or **Escribir /effort …**. tabi **types the command into that agent** (`/model sonnet`,
`/effort high`) and you press **Enter** there: it cannot press it for you. So you can start with Opus to plan and move to Sonnet to
talk, in the same conversation, without typing the command yourself.

- It writes through the clipboard (`terminal.paste`), and **puts your clipboard back** as it was (its text; an image on the
  clipboard is not kept). If it cannot read the clipboard it does nothing.
- One command at a time: a model, then (after Enter) the effort. Two lines in one paste would be sent as a single message.
- Only **Claude Code**, only on **this macOS computer**, and only when the agent is **not working or waiting for you**: the dialog
  says why when it cannot. Codex has its own `/model` picker, which tabi does not drive.

## Going on with a task in another agent (継)

A card that has a task (one given with **Asignar tarea…**, see `docs/assign-task`) has a **継** next to its status. It opens **継 ·
Continuar con otro agente**: choose which agent goes on (Claude Code, an extra account, Codex…) and see exactly what it will be told.
It is for when the agent ran out of quota or got stuck.

- A tab opens **in the same space and folder** (in the checkout of the worktree if the task had one), with the agent you chose and
  the model and effort you set for it with the ⚙. The first message is one line: the original task, the last thing the previous agent
  said, and to look at the repository (`git status`, `git diff`) before going on without repeating what is done.
- The new task gets its own record (shown as "→ <task>"), with the **same check command**, so its card shows ✓ or ✗ too.
- **The previous agent is not touched**: it keeps running, if it still does. It is not a hand-over of the conversation (the new agent
  has no memory of it, only that message and the files), and the last thing it said is only there if the hooks recorded it
  (`docs/subagents`).

## Limits

- The ⚙ is for **starting** an agent; for one that is running use the ⇄ above (or `/model` and `/effort` yourself).
- Only this computer: the list of Codex models is read from here.
- A value that could be taken for a flag or a shell (anything but letters, digits, dot, dash and underscore) is dropped when the file
  is read, and the command typed into an agent is only ever `/model <name>` or `/effort <level>`.

## Asking another agent to review (審)

The inbox (`docs/review-inbox`) has a **Que otro revise** button that opens this same dialog, with the title **審 · Que otro agente
revise**. The agent you choose opens in the same space and folder, but it is told to *read* the work (the task, what the first agent said,
what the check found, `git status` and `git diff`) and to answer with a short list of findings, **without modifying any file**. It is a
request in the message, not a lock: the agent could still write if it decided to. Its record starts with **審**.
