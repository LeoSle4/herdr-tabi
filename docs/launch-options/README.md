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

## Limits

- It is for **starting** an agent. It does not change a session that is already running: for that, `/model` and `/effort` inside
  Claude Code. (Resuming the same conversation with another model, `claude --resume <id> --model …`, would need the session id,
  which the hooks do not record yet.)
- Only this computer: the list of Codex models is read from here.
- A value that could be taken for a flag or a shell (anything but letters, digits, dot, dash and underscore) is dropped when the file
  is read.
