// Pure helpers of tabi-launch: the model and the effort an agent starts with. No Herdr calls, so they can be tested with `node --test`.
// What is chosen is kept per agent in data/tabi/launch.json ({ "<agent key>": { model, effort } }); an agent with no entry starts with
// its own defaults. tabi-panel and tabi-task carry a copy of parsePrefs and launchArgv (mods do not import each other): keep them equal.

/** Claude Code takes an alias or a full name for --model; these are the aliases its --help names. */
export const CLAUDE_MODELS = [{ id: "fable", name: "Fable" }, { id: "opus", name: "Opus" }, { id: "sonnet", name: "Sonnet" }];
/** The levels of `claude --effort`. */
export const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"];

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

/**
 * The models Codex lists (its own ~/.codex/models_cache.json): [{ id, name, efforts, defaultEffort }]. A model it hides, or that has
 * no name of its own to start with (slug), is left out. Empty when the text is not that file.
 */
export function parseCodexModels(text) {
  let d;
  try { d = JSON.parse(text); } catch { return []; }
  const out = [];
  for (const m of Array.isArray(d?.models) ? d.models : []) {
    if (!m || typeof m.slug !== "string" || m.visibility !== "list") continue;
    const efforts = (m.supported_reasoning_levels ?? []).map((l) => l?.effort).filter((e) => typeof e === "string");
    if (!efforts.length) continue;
    out.push({ id: m.slug, name: m.display_name || m.slug, efforts, defaultEffort: m.default_reasoning_level ?? null });
  }
  return out;
}

/**
 * What can be chosen for an agent: its models and, for a model (or none), its levels. With no model chosen only what every model
 * supports is offered. Null when the agent has no options.
 */
export function optionsFor(key, codexModels) {
  const family = familyOf(key);
  if (family === "claude") return { family, models: CLAUDE_MODELS, effortsOf: () => CLAUDE_EFFORTS };
  if (family === "codex") {
    const models = (codexModels ?? []).map((m) => ({ id: m.id, name: m.name }));
    const effortsOf = (id) => {
      const list = codexModels ?? [];
      const one = list.find((m) => m.id === id);
      if (one) return one.efforts;
      return list.length ? list.map((m) => m.efforts).reduce((a, b) => a.filter((e) => b.includes(e))) : [];
    };
    return { family, models, effortsOf };
  }
  return null;
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

/** The preferences with the choice of one agent set ({ model, effort }, either may be null) or, with both null, removed. */
export function setChoice(prefs, key, { model, effort }) {
  const next = { ...prefs };
  const choice = {};
  if (model) choice.model = model;
  if (effort) choice.effort = effort;
  if (Object.keys(choice).length) next[key] = choice; else delete next[key];
  return next;
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

// --- Changing the model or the effort of an agent that is already running (only Claude Code, only on this macOS computer) ---
// Claude Code has `/model <model>` and `/effort <level>` inside the session. tabi cannot press Enter for you, so it types the command into
// the agent through the clipboard (terminal.paste) and you press Enter. The clipboard is put back as it was.

const SLASH = /^\/(model|effort) [A-Za-z0-9][A-Za-z0-9._-]{0,59}$/;

/** The command to type in Claude Code ("/model sonnet", "/effort high"), or null when the value could be anything but a name or a level. */
export function slashCommand(kind, value) {
  if (kind === "model") return SAFE_MODEL.test(String(value ?? "")) ? `/model ${value}` : null;
  if (kind === "effort") return CLAUDE_EFFORTS.includes(value) ? `/effort ${value}` : null;
  return null;
}

/** Can tabi type a command into this agent? { ok: true } or { ok: false, reason }. */
export function canSwitch({ key, platform, address, status }) {
  if (familyOf(key) !== "claude") return { ok: false, reason: "Solo para Claude Code (Codex cambia de modelo con su propio /model)" };
  if (platform !== "macos") return { ok: false, reason: "Por ahora solo en macOS" };
  if (String(address ?? "").includes("/")) return { ok: false, reason: "Solo en agentes de este equipo" };
  if (status === "working") return { ok: false, reason: "El agente está trabajando: espera a que termine" };
  if (status === "blocked") return { ok: false, reason: "El agente te espera: respóndele primero" };
  return { ok: true };
}

/**
 * Types `text` (a /model or /effort command) into the agent of `pane`: the clipboard is read, the command is put in it, the pane is
 * focused and pasted into, and the clipboard is put back, whatever happens in between. `deps` are Herdr's exec and run and a wait(ms), so
 * the order of the steps can be tested. Resolves { ok } or { ok: false, error }; it never rejects.
 */
export async function switchSession(deps, { pane, text, platform }) {
  if (platform !== "macos") return { ok: false, error: "sin herramientas de portapapeles en esta plataforma" };
  if (!SLASH.test(String(text ?? ""))) return { ok: false, error: "no es un comando /model o /effort" };
  const write = (value) => deps.exec("sh", ["-c", 'printf %s "$1" | pbcopy', "sh", value], { timeout: 10000 });
  let previous;
  try {
    previous = (await deps.exec("pbpaste", [], { timeout: 10000 })).stdout ?? "";
  } catch (e) {
    return { ok: false, error: `no pude leer el portapapeles: ${e?.message ?? e}` };
  }
  let error = null;
  try {
    await write(text);
    deps.run("pane.focus", { pane });
    await deps.wait(250);
    deps.run("terminal.paste");
    await deps.wait(300);
  } catch (e) {
    error = String(e?.message ?? e);
  }
  try { await write(previous.length > 200000 ? "" : previous); } catch { /* the clipboard keeps the command */ }
  return error ? { ok: false, error } : { ok: true };
}

// --- A copy of tabi-task/lib.js (mods do not import each other; this file's test checks that they behave the same) ---
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

// --- Continue a task with another agent (the 継 of a card that has a task) ---

const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

/**
 * What the next agent is told: the task, what the one before said last, and to look at the repository first. One line, because it goes in
 * as the first message of the agent.
 */
export function handoffPrompt({ task, result, from }) {
  const who = oneLine(from) || "otro agente";
  const last = oneLine(result).slice(0, 300);
  return `Continúa esta tarea, que empezó ${who} y quedó sin terminar. Tarea original: ${oneLine(task)}.`
    + `${last ? ` Lo último que dijo ${who}: ${last}` : ""} Revisa primero el estado del repositorio (git status y git diff) y sigue desde ahí, sin repetir lo que ya está hecho.`;
}

/**
 * What a reviewer is told: read the work of another agent without changing it, with the task, what that agent said and what its check
 * found. One line, because it goes in as the first message of the agent.
 */
export function reviewPrompt({ task, result, from, verify, check }) {
  const who = oneLine(from) || "otro agente";
  const last = oneLine(result).slice(0, 300);
  const ran = oneLine(verify);
  const found = !ran || !check || check.state === "running" ? ""
    : check.state === "pass" ? ` La comprobación (${ran}) pasó${check.tail ? `: ${oneLine(check.tail).slice(0, 120)}` : ""}.`
    : ` La comprobación (${ran}) falló${check.tail ? `: ${oneLine(check.tail).slice(0, 120)}` : ""}.`;
  return `Revisa el trabajo que hizo ${who} en esta tarea, sin modificar ningún archivo. Tarea original: ${oneLine(task)}.`
    + `${last ? ` Lo que dijo ${who}: ${last}` : ""}${found}`
    + " Mira git status y git diff, busca errores, casos sin cubrir y cambios que la tarea no pedía, y responde con una lista corta de hallazgos (archivo y línea) y si lo darías por bueno.";
}

/**
 * The tab to open and the record to save to go on with a task in another agent: the same space and folder (the checkout of the worktree
 * when there was one), the same check command, and the flags chosen for that agent with the gear. Null without a task or an agent.
 */
export function handoffLaunch({ kind, rec, from, agent, space, folder, prefs, now, rnd }) {
  if (!rec?.task || !agent) return null;
  const review = kind === "review"; // another agent reads the work instead of going on with it
  const task = review ? reviewPrompt({ task: rec.task, result: rec.result, from, verify: rec.verify, check: rec.check }) : handoffPrompt({ task: rec.task, result: rec.result, from });
  const args = { name: agent.name, argv: launchArgv(prefKey(agent.key), agent.argv, prefs), task };
  if (space) args.space = space;
  if (folder) args.folder = folder;
  const record = newTaskRecord({ task: `${review ? "審" : "→"} ${rec.task}`, agent, character: null, branch: rec.branch, folder: folder ?? rec.folder, machine: rec.machine, now, rnd, verify: review ? null : rec.verify });
  return { command: "tab.new", args, record };
}
