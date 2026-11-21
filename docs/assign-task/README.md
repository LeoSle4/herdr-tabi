# Asignar tarea

The "+" menu has an **Asignar tarea…** entry. It opens a dialog to give a task to an agent:

- **¿Qué hay que hacer?** The task, which becomes the agent's first message. Empty: the agent just opens.
- **Agente.** Claude Code, a second Claude account (the wrappers `tabi-usage` finds, like `claude2`), Codex, and any other agent Herdr
  knows is installed on that machine.
- **Personaje.** One of the portraits in `~/Documents/retratos` (`Mai.jpg` is Mai), or "Al azar".

Confirming opens a tab named after the character, in the folder you were in, with the agent running and the task sent as its
first message. That is Herdr's own `tab.new {name, space, folder, argv, task}`; nothing else is started or installed.

## In a worktree of its own

The box **En un worktree nuevo** gives the task its own branch and folder, so the agent cannot step on what you are doing in the project:

- Herdr's own worktree dialog does the work: it creates the branch `tabi/<character or agent>-<first words of the task>` (for example `tabi/koyun-di-hola-en-una`; a number is added only if that branch already exists) from where you are and a
  checkout in `~/Projects/worktrees/<repo>/<branch>` (the folder of the `worktrees.directory` setting), and opens a space there with a
  first tab named after the character and the agent running.
- The task is not sent as a message: Herdr's dialog does not forward one. It goes as the **last argument of the agent's command**
  (`claude "<task>"`, `codex "<task>"`; a second Claude account forwards it too). Other agents open in the worktree **without** the
  task and the dialog says so: write it in their tab. A task that starts with `-` gets a space in front, so it can never become an
  option of the agent.
- It is offered only for spaces of **this computer on macOS or Linux**. On Windows the agent starts through a `.cmd` wrapper, which
  would run the `&` or `|` of a task as commands; on another machine nothing here knows its folders. There the box is dim and says why.
- It is a checkout without your untracked or ignored files (`.pr/`, `data/`...). To remove it: `git worktree remove <folder>` from
  the main checkout (not from inside the worktree), then `git branch -d <branch>`, then close its space.

## The character

The card of an agent wears the portrait it was given when it appeared. The dialog names the new tab after the character and tells
`tabi-party` which one you picked (`shared("tabi.next-portrait")`). `tabi-party` gives it to the agent **in the tab with that
name** that has no portrait yet, and to no other:

- The choice is valid for 30 seconds and is used once.
- It is tied to the tab, not to "the next agent that appears": an agent of another machine that reconnects at that moment also
  has no portrait, and with the first version of this it took the one you chose.
- If the character is already on another live agent, or the agent takes longer than that to appear, it gets a random one like
  any other.
- With "Al azar" nothing changes: the agent gets a portrait nobody wears, as before.

With the hooks installed (`docs/subagents/README.md`), the card shows the character's sub-agents and its notification says what it
did, so the task you assign can be followed from the cards.

## The cover

The dialog opens with a cover: the picture of the space you are in (the same one behind the window; `docs` of tabi-backdrop), the
title over it and a fade into the dialog. With no pictures there is no cover.

## The record of a task

When you give a task (the field is not empty), a file is saved in `data/tabi/tasks/<date>-<time>-<4 characters>.json`: what you asked,
the agent, the character, the branch (with a worktree), the folder and the machine. It outlives the session.

- **The card shows it.** Hover the card of the agent: "Encargo: <what you asked>", and when it ends, "Resultado: <the first line of its
  last answer>" (that line comes from the hooks, `docs/subagents/README.md`; without them it only says "Terminó").
- **It is tied to the tab by its name** (the character's, or the agent's), on that machine, and only for 24 hours: a tab you open
  tomorrow with the same name is not about this task.
- **It ends when the agent does**: when it is "terminó", or at rest after being seen working. It never ends in the first 20 seconds,
  and if two tabs share the name it waits for all of them, so a task is closed late rather than too soon.
- Only the last 60 records are read. Delete a file to delete its record.

## Check it when it ends (optional)

The field **確 · comprobar al terminar** takes one command, for example `node --test` or `python3 -m unittest`. When the agent ends, tabi
runs it in the agent's folder (the worktree's checkout, or the folder where you gave the task) and records what it found:

- **✓** it exited with 0, **✗** it did not (or it could not run, or took more than 5 minutes). The card shows it before the status
  kanji and its tooltip says "Comprobación (<command>): ✓ <last line it printed>". A toast says it too.
- It is **one command with no shell**: no pipes, no `&&`, no variables. Quotes group an argument with spaces. For something longer,
  put it in a script and run that.
- Only for this computer: with a remote machine's space the field is not offered.
- "Terminó de responder" is not "pasó los tests": that is what this is for.

## Limits

- The task is one line (the dialog has a single-line field). Paste a longer one, or put it in a file and say so in the task.
- It starts an agent in the **current space's machine**: on a remote machine's space the agent runs there.
- It does not report back by itself: you see it through the card, the notification and the sounds, as for any agent.
