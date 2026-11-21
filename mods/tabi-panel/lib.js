// Pure helpers for the tabi-panel mod (testable with `node --test`).

/** Account name by address: program key ("claude", "codex"), numbered from the second one of the same program. */
export function accountNames(list) {
  const seen = {};
  const out = {};
  for (const a of list) {
    const base = String(a.program?.key ?? a.app ?? "agente").toLowerCase().replace(/-code$/, "");
    seen[base] = (seen[base] ?? 0) + 1;
    out[a.address] = seen[base] > 1 ? `${base}${seen[base]}` : base;
  }
  return out;
}

/** Agents waiting for the person (blocked), in the order the agents list shows them. */
export function pending(list) {
  return list.filter((a) => a.status === "blocked");
}

/** "hace 3 min", "hace 2 h", "hace 4 d". */
export function agoShort(seconds, now) {
  const m = Math.max(0, Math.floor((now - seconds * 1000) / 60000));
  if (m < 1) return "hace un momento";
  if (m < 60) return `hace ${m} min`;
  if (m < 1440) return `hace ${Math.floor(m / 60)} h`;
  return `hace ${Math.floor(m / 1440)} d`;
}

/** Changed files and added/removed lines from `git status --porcelain` and `git diff HEAD --numstat` output. */
export function changeSummary(statusOut, numstatOut) {
  const files = statusOut.split("\n").filter((l) => l.trim()).length;
  let add = 0;
  let del = 0;
  for (const line of numstatOut.split("\n")) {
    const [a, d] = line.split("\t");
    add += Number(a) || 0;
    del += Number(d) || 0;
  }
  return { files, add, del };
}

/** "<unix seconds>\t<subject>" from `git log -1 --format=%ct%x09%s`; null when the repo has no commit. */
export function parseLastCommit(out) {
  const line = out.trim();
  if (!line) return null;
  const [ts, ...rest] = line.split("\t");
  const at = Number(ts);
  return Number.isFinite(at) ? { at, subject: rest.join("\t") } : null;
}

/** Unpushed commits from `git rev-list --count @{u}..HEAD`: a number, or null without an upstream (failed command). */
export function parseAhead(code, out) {
  if (code !== 0) return null;
  const n = Number(out.trim());
  return Number.isFinite(n) ? n : null;
}

/** "3 archivos" / "1 archivo" / "sin cambios". */
export function filesLabel(n) {
  return n === 0 ? "sin cambios" : `${n} ${n === 1 ? "archivo" : "archivos"}`;
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
