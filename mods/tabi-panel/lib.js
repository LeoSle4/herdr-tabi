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
