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
