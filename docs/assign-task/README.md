# Asignar tarea

The "+" menu has an **Asignar tarea…** entry. It opens a dialog to give a task to an agent:

- **¿Qué hay que hacer?** The task, which becomes the agent's first message. Empty: the agent just opens.
- **Agente.** Claude Code, a second Claude account (the wrappers `tabi-usage` finds, like `claude2`), Codex, and any other agent Herdr
  knows is installed on that machine.
- **Personaje.** One of the portraits in `~/Documents/retratos` (`Mai.jpg` is Mai), or "Al azar".

Confirming opens a tab named after the character, in the folder you were in, with the agent running and the task sent as its
first message. That is Herdr's own `tab.new {name, space, folder, argv, task}`; nothing else is started or installed.

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

## Limits

- The task is one line (the dialog has a single-line field). Paste a longer one, or put it in a file and say so in the task.
- It starts an agent in the **current space's machine**: on a remote machine's space the agent runs there.
- It does not report back by itself: you see it through the card, the notification and the sounds, as for any agent.
