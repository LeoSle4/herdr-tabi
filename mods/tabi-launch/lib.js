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
