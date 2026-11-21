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

/** The name Herdr gives the tab of a task: the character, else the agent. tabi-party links the record to its agent by this name. */
export function tabName(character, agent) {
  return character?.name ?? agent?.name;
}

/** The name of a record's file: the time (so a listing sorts by it) and four random characters; never anything that is a path. */
export function taskId(now, rnd) {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  return `${stamp}-${String(rnd ?? "").toLowerCase().replace(/[^0-9a-z]/g, "").slice(0, 8) || "0000"}`;
}

/**
 * What is saved in data/tabi/tasks/<id>.json when a task is given: what was asked, who does it and where, and the command that checks
 * it when it is done (`verify`, optional). tabi-party finishes it (status, result) when the agent does and records what the check found. Null when nothing was asked (the dialog only opens the agent) or there is no agent.
 */
export function newTaskRecord({ task, agent, character, branch, folder, machine, now, rnd, verify }) {
  const text = String(task ?? "").trim().slice(0, 500);
  if (!text || !agent) return null;
  return { id: taskId(now, rnd), task: text, agent: agent.name, agentKey: agent.key, character: character?.name ?? null, tab: tabName(character, agent),
    branch: branch ?? null, folder: folder ?? null, machine: machine ?? null, startedAt: now, status: "running", finishedAt: null, result: null,
    verify: String(verify ?? "").trim().slice(0, 200) || null, check: null };
}

/**
 * The picture for the cover of the dialog: the one tabi-backdrop gave the space it opens in (`map`: space id -> file), else the first
 * one there is. Only a file of the list is ever used (`images`: [{ file }]); null when there are none.
 */
export function coverFor(map, images, space) {
  const files = (images ?? []).map((i) => i.file).filter((f) => typeof f === "string");
  const own = map?.[space];
  return files.includes(own) ? own : files[0] ?? null;
}

/**
 * Bands of one color, from almost clear to solid, to put at the bottom of a picture so it melts into the dialog (the engine has no
 * gradient for an element's background). `color` is "#rrggbb"; anything else gives no bands.
 */
export function fadeSteps(color, count) {
  if (!/^#[0-9a-fA-F]{6}$/.test(String(color ?? "")) || !(count > 0)) return [];
  return Array.from({ length: count }, (_, i) => {
    const alpha = Math.round(255 * ((i + 1) / count) ** 1.6);
    return `${color.toLowerCase()}${alpha.toString(16).padStart(2, "0")}`;
  });
}

/** Above this percent of its 5-hour window an account gets a warning in the dialog. */
export const QUOTA_LIMIT = 85;

/** The meter of tabi-usage (data/tabi/usage.json) that belongs to the agent chosen in the dialog, or null when it has none. */
export function usageIdFor(agentKey) {
  const key = String(agentKey ?? "");
  if (key.startsWith("account-")) return key.slice("account-".length) || null;
  if (key.startsWith("claude")) return "claude";
  if (key.startsWith("codex")) return "codex";
  return null;
}

/**
 * Is the 5-hour window of this account above the limit? `entry` is what tabi-usage keeps for it ({ windows, okAt, error }). Gives
 * { used, resets, stale } (stale: the last reading failed, so the number is old), or null: no reading, a window that has already
 * reset (what it said is gone), or one at or under the limit. Only the 5-hour window decides; the week has its own meter.
 */
export function quotaWarning(entry, now) {
  const w = (entry?.windows ?? []).find((x) => x.label !== "weekly");
  if (!w || typeof w.used !== "number") return null;
  if (w.resets != null && w.resets <= now) return null;
  if (w.used <= QUOTA_LIMIT) return null;
  return { used: w.used, resets: w.resets ?? null, stale: Boolean(entry.error) };
}

/** The line under the agents: which account, how much of its 5 hours it has used, when it renews. It does not stop anything. */
export function quotaNote(name, warning) {
  const at = warning.resets == null ? "" : new Date(warning.resets);
  const time = at === "" ? "" : ` · se renueva a las ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  return `${name} lleva el ${warning.used} % de su ventana de 5 h${time}${warning.stale ? " (dato antiguo)" : ""}`;
}

// --- A copy of tabi-launch/lib.js (mods do not import each other; tabi-launch/lib.test.mjs checks that they behave the same) ---
const SAFE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,59}$/;
const SAFE_EFFORT = /^[a-z]{2,10}$/;

/** "claude" for Claude Code and its extra accounts, "codex" for Codex, null for an agent that has no options here. */
export function familyOf(key) {
  const k = String(key ?? "");
  if (k.startsWith("claude") || k.startsWith("account-")) return "claude";
  if (k.startsWith("codex")) return "codex";
  return null;
}

/** The key a choice is kept under: the same for an agent whatever Herdr calls it ("claude" and "claude-code" are one). */
export function prefKey(key) {
  const k = String(key ?? "");
  if (k.startsWith("account-")) return k;
  const family = familyOf(k);
  return family ?? k;
}

/** data/tabi/launch.json as { key: { model?, effort? } }. Anything that could be taken for a flag or a shell is dropped. */
export function parsePrefs(text) {
  let d;
  try { d = JSON.parse(text); } catch { return {}; }
  if (!d || typeof d !== "object" || Array.isArray(d)) return {};
  const out = {};
  for (const [key, v] of Object.entries(d)) {
    if (!v || typeof v !== "object") continue;
    const choice = {};
    if (typeof v.model === "string" && SAFE_MODEL.test(v.model)) choice.model = v.model;
    if (typeof v.effort === "string" && SAFE_EFFORT.test(v.effort)) choice.effort = v.effort;
    if (Object.keys(choice).length) out[key] = choice;
  }
  return out;
}

/** The command of an agent with its model and effort, as flags: Claude `--model --effort`, Codex `-m -c model_reasoning_effort=`. */
export function launchArgv(key, argv, prefs) {
  const c = prefs?.[key];
  const family = familyOf(key);
  if (!c || !family) return [...argv];
  const out = [...argv];
  if (family === "claude") {
    if (c.model) out.push("--model", c.model);
    if (c.effort) out.push("--effort", c.effort);
  } else {
    if (c.model) out.push("-m", c.model);
    if (c.effort) out.push("-c", `model_reasoning_effort=${c.effort}`);
  }
  return out;
}

/** What is chosen, in a few words. */
export function summary(choice) {
  if (!choice?.model && !choice?.effort) return "por defecto";
  if (!choice.model) return `esfuerzo ${choice.effort}`;
  return choice.effort ? `${choice.model} · ${choice.effort}` : choice.model;
}
