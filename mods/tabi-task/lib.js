// Pure helpers for the tabi-task dialog ("Asignar tarea…"): no Herdr calls, so they can be tested with `node --test`.

/**
 * The agents a task can be given to, from knownAgents() and the extra Claude accounts tabi-usage publishes:
 * the installed ones, then one "Claude Code · <account>" per extra account. [{ key, name, argv }]
 */
export function agentChoices(known, accounts) {
  const installed = (known ?? []).filter((a) => a?.installed && Array.isArray(a.run) && a.run.length)
    .map((a) => ({ key: a.key, name: a.name, argv: a.run }));
  const extra = (accounts ?? []).filter((a) => a && !a.default && a.name && a.bin)
    .map((a) => ({ key: `account-${a.name}`, name: `Claude Code · ${a.name}`, argv: [a.bin] }));
  return [...installed, ...extra];
}

/** The characters (portraits tabi-party published), by name: [{ file, name, thumb }]. */
export function characterChoices(portraits) {
  return (portraits ?? []).filter((p) => p?.file && p.name)
    .map((p) => ({ file: p.file, name: p.name, thumb: p.thumb ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Splits a list in rows of at most `size`, so chips can be laid out without wrapping support. */
export function rows(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Rows of the same length where possible: 7 characters with room for 7 are one row; 7 with room for 5 are 4 + 3, never 5 + 2; four
 * agents with room for 3 are a 2 x 2 grid. The caller pads a short row so the cells keep their width.
 */
export function balancedRows(items, max) {
  if (!items.length) return [];
  const count = Math.ceil(items.length / max);
  return rows(items, Math.ceil(items.length / count));
}

/**
 * What to run when the person confirms: the tab.new command (a tab named after the character, or the agent, with the agent
 * running and the task as its first message) and the portrait to give to the agent that appears. null without an agent.
 */
export function buildLaunch({ task, agent, character, space, folder }) {
  if (!agent) return null;
  const args = { name: character?.name ?? agent.name, argv: agent.argv };
  if (space) args.space = space;
  if (folder) args.folder = folder;
  const text = String(task ?? "").trim();
  if (text) args.task = text;
  return { command: "tab.new", args, portrait: character?.file ?? null };
}

/** A safe lowercase word for a branch name: no accents, no symbols, at most 24 characters. "tarea" when nothing is left. */
export function slugName(name) {
  const slug = String(name ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24).replace(/-+$/g, "");
  return slug || "tarea";
}

/** The branch of a task in its own worktree: tabi/<character or agent>-<id>. */
/** The first words of a task as a piece of a branch name: "di hola en una línea" -> "di-hola-en-una" ("" when there is nothing to say). */
export function slugWords(task, words = 4, max = 28) {
  const parts = String(task ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return parts.slice(0, words).join("-").slice(0, max).replace(/-+$/g, "");
}

/**
 * The branch of a task: tabi/<character or agent>-<what the task says>, readable at a glance in the list of spaces. A number is added
 * only when that branch already exists (`taken` has the names of the branches there are), and it is the first free one.
 */
export function branchFor(character, agent, task, taken = []) {
  const who = slugName(character?.name ?? agent?.name);
  const what = slugWords(task);
  const base = `tabi/${what ? `${who}-${what}` : who}`;
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** The agents that take their first message as the last argument of the command (`claude "<prompt>"`, `codex "<prompt>"`). */
export function acceptsPrompt(agent) {
  return Boolean(agent) && (agent.key === "claude" || String(agent.key).startsWith("account-") || agent.key === "codex");
}

/**
 * The task as an argument of the agent's command. The command line has no shell here, but the agent parses its own options, so a
 * task that starts with a dash ("--dangerously-skip-permissions") would become one: a space in front makes it text.
 */
export function promptArg(task) {
  const text = String(task ?? "").trim();
  return text.startsWith("-") ? ` ${text}` : text;
}

/**
 * A worktree for the task needs git on this computer and a Unix command line. On Windows an agent started through a `.cmd` wrapper
 * would run the `&` or `|` of a task as commands, and on another machine nothing here knows its folders: neither is offered.
 */
export function worktreeAvailable({ platform, machine }) {
  if (machine) return { ok: false, reason: "Solo en espacios de este equipo (el worktree se crea aquí)" };
  if (platform !== "macos" && platform !== "linux") return { ok: false, reason: "Solo en macOS y Linux: en Windows el texto pasaría por un .cmd" };
  return { ok: true, reason: "" };
}

/**
 * What to open for a task in its own worktree: Herdr's worktree dialog with the branch (it creates the checkout by itself), a first
 * tab named after the character and the agent, with the task as its last argument when the agent takes it that way.
 * `taskSent` says whether the task went along. null without an agent or a branch.
 */
export function buildWorktree({ task, agent, character, space, folder, machine, branch }) {
  if (!agent || !branch) return null;
  const text = promptArg(task);
  const taskSent = Boolean(text) && acceptsPrompt(agent);
  const props = { space, folder, machine: machine ?? null, branch, tab: character?.name ?? agent.name, argv: taskSent ? [...agent.argv, text] : [...agent.argv] };
  return { overlay: { mod: "worktree", kind: "dialog", width: 460, height: 150, props }, portrait: character?.file ?? null, taskSent };
}
