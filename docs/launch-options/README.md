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

## Limits

- The ⚙ is for **starting** an agent; for one that is running use the ⇄ above (or `/model` and `/effort` yourself).
- Only this computer: the list of Codex models is read from here.
- A value that could be taken for a flag or a shell (anything but letters, digits, dot, dash and underscore) is dropped when the file
  is read, and the command typed into an agent is only ever `/model <name>` or `/effort <level>`.
