# Review inbox (審)

When an agent finishes a task you gave with **Asignar tarea…** (`docs/assign-task`), the task waits for you to look at it. The panel says
so under **今 · ahora**: **"3 tareas por revisar ›"**. Click it to open **審 · Revisión**, the inbox of the tasks that ended and that
nobody has marked as reviewed (the last week, newest first, up to 8).

Each row has:

- who did it (the character, or the agent), **✓** or **✗** if the task had a check (`docs/assign-task`), and how long ago it ended;
- what you asked, what the agent said last (if the hooks recorded it, `docs/subagents`) and what its check printed;
- **what changed in its folder**: files, `+lines −lines`, and files git does not follow yet. For a worktree task it is looked at where
  its branch lives. It is read with git, **read-only** (nothing is written under `.git`).

And three buttons:

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
