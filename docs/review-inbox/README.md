# Review inbox (審)

When an agent finishes a task you gave with **Asignar tarea…** (`docs/assign-task`), the task waits for you to look at it. The panel says
so under **今 · ahora**: **"3 tareas por revisar ›"**. Click it to open **審 · Revisión**, the inbox of the tasks that ended and that
nobody has marked as reviewed (the last week, newest first, up to 8).

The tasks come in groups, by what their check said, so you know where to look first:

- **✗ Necesitan atención**: the check failed. Look at these first.
- **✓ Listas para revisar**: the check passed; what is left is reading the changes.
- **Comprobando**: the check is still running.
- **Sin comprobación**: no check was asked for, so nothing proves it works.

A group with nothing in it is not shown, and the chips next to the title count each one. Each row has:

- what you asked (as the title), who did it (the character and the agent) and how long ago it ended;
- what the agent said last (if the hooks recorded it, `docs/subagents`) and what its check printed;
- **what changed in its folder**: files, `+lines −lines` (green and red), and files git does not follow yet, with the branch if it has
  one. For a worktree task it is looked at where its branch lives. It is read with git, **read-only** (nothing is written under `.git`).

And three buttons, each with its icon:

- **Ver agente**: focuses the agent's tab (it says so when the agent is no longer open).
- **Copiar PR**: copies a description already written for a pull request: the task as the title, what the agent said, the check and
  the changes with the branch. macOS and Linux (`pbcopy`, or `wl-copy` / `xclip`).
- **Revisada**: marks the task as reviewed (`reviewed: true` in its record in `data/tabi/tasks/`) and it leaves the inbox.

## What it does not do

It **never commits, pushes or opens a pull request.** Publishing stays with the script you run: copy the description, and use it in
the body of your PR. (A button that pushes would be an action outside your machine; if you want one, it should ask first and make a
draft.)

## Limits

- Only tasks that have a record, that is, the ones given with **Asignar tarea…** or continued with **継** (`docs/launch-options`).
- The changes are those of the working folder against `HEAD`: they say nothing of commits already made on the branch.
- A task on another machine shows "sin información de git": it is read from this computer.
