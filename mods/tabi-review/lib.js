// Pure helpers of tabi-review: the inbox of finished tasks (what the agent said, what the check found, what changed) and what is done with
// each one. No Herdr calls, so they can be tested with `node --test`. The records are those of data/tabi/tasks (tabi-task writes them,
// tabi-party closes them); here they only gain `reviewed`.

/** A task finished more than this long ago is not asked about any more. */
export const REVIEW_WINDOW_MS = 7 * 24 * 3600 * 1000;

// --- A copy of tabi-party/lib.js (mods do not import each other; this file's test checks that they behave the same) ---
/** A record of data/tabi/tasks/<id>.json (written by tabi-task), or null when the text is not a usable one. */
export function parseTask(text) {
  let r;
  try { r = JSON.parse(text); } catch { return null; }
  if (!r || typeof r !== "object" || Array.isArray(r)) return null;
  if (typeof r.id !== "string" || !r.task || typeof r.task !== "string" || typeof r.tab !== "string" || !r.tab || typeof r.startedAt !== "number") return null;
  return { ...r, status: r.status === "done" ? "done" : "running", result: typeof r.result === "string" ? r.result : null };
}

/** The finished tasks nobody has marked as reviewed, newest first, of the last week. One that has no time recorded goes after. */
export function pendingReview(records, now) {
  return (records ?? [])
    .filter((r) => r.status === "done" && !r.reviewed && (r.finishedAt == null || now - r.finishedAt <= REVIEW_WINDOW_MS))
    .sort((a, b) => (b.finishedAt ?? -Infinity) - (a.finishedAt ?? -Infinity));
}

/** The record as it is saved once the person has looked at it. */
export function markReviewed(rec, now) {
  return { ...rec, reviewed: true, reviewedAt: now };
}

/** Where to look at what a task changed: the space of its branch for a worktree, else the folder it was given in. */
export function folderFor(rec, spaces) {
  if (rec.branch) {
    const space = (spaces ?? []).find((s) => s.branch === rec.branch);
    if (space?.folder) return space.folder;
  }
  return rec.folder ?? null;
}

/** What `git diff --numstat HEAD` and `git status --porcelain` say: files and lines changed, and files git does not follow yet. */
export function diffStat(numstat, status) {
  let files = 0;
  let add = 0;
  let del = 0;
  for (const line of String(numstat ?? "").split("\n")) {
    const [a, d, ...path] = line.split("\t");
    if (!path.length) continue;
    files += 1;
    if (/^\d+$/.test(a)) add += Number(a); // a binary file shows "-"
    if (/^\d+$/.test(d)) del += Number(d);
  }
  const untracked = String(status ?? "").split("\n").filter((l) => l.startsWith("??")).length;
  return { files, add, del, untracked };
}

/** A description of the task to paste in a pull request: what was asked, what the agent said, the check and the changes. */
export function prText(rec, stat) {
  const lines = [`## ${rec.task}`, ""];
  if (rec.result) lines.push(`Resultado del agente: ${rec.result}`, "");
  if (rec.verify) {
    const c = rec.check;
    const found = !c || c.state === "running" ? "comprobando…" : `${c.state === "pass" ? "✓" : "✗"}${c.tail ? ` ${c.tail}` : ""}`;
    lines.push(`Comprobación (\`${rec.verify}\`): ${found}`, "");
  }
  const changed = stat.files || stat.untracked
    ? `${stat.files} archivos, +${stat.add} −${stat.del}${stat.untracked ? `, ${stat.untracked} sin seguimiento` : ""}`
    : "sin cambios";
  lines.push(`Cambios: ${changed}${rec.branch ? ` · rama \`${rec.branch}\`` : ""}`);
  return lines.join("\n");
}

/** The program that puts a text in the clipboard (text as an argument, never in a shell line), or null when there is no tool for it here. */
export function copyCommand(platform, text) {
  if (platform === "macos") return { command: "sh", args: ["-c", 'printf %s "$1" | pbcopy', "sh", text] };
  if (platform === "linux") return { command: "sh", args: ["-c", 'if command -v wl-copy >/dev/null 2>&1; then printf %s "$1" | wl-copy; else printf %s "$1" | xclip -selection clipboard; fi', "sh", text] };
  return null;
}

/** The agent a task belongs to: the one whose tab has the name it was given, on its machine (null = this computer). Null when it has gone. */
export function agentOf(rec, agents, machineOf) {
  return (agents ?? []).find((a) => a.tab_name === rec.tab && (machineOf(a) ?? null) === (rec.machine ?? null)) ?? null;
}

/** How long ago a task finished: "ahora", "hace 5 min", "hace 3 h", "hace 2 d"; "" when its time was not recorded. */
export function agoLabel(at, now) {
  if (at == null) return "";
  const s = Math.max(0, Math.floor((now - at) / 1000));
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

/** What the check of a task says: "pass", "fail", "running" (it has one and no answer yet) or "none" (no check was asked for). */
export function reviewState(rec) {
  if (!rec.verify) return "none";
  const c = rec.check;
  if (!c || c.state === "running") return "running";
  return c.state === "pass" ? "pass" : "fail";
}

const GROUPS = [
  { key: "fail", label: "Necesitan atención", hint: "La comprobación falló: míralas primero" },
  { key: "pass", label: "Listas para revisar", hint: "La comprobación pasó: queda leer los cambios" },
  { key: "running", label: "Comprobando", hint: "La comprobación sigue en marcha" },
  { key: "none", label: "Sin comprobación", hint: "No se pidió comprobar: no hay prueba de que funcione" },
];

/** The tasks to review in groups by what their check says, urgent ones first; a group with nothing in it is left out. */
export function groupReview(list) {
  const items = list ?? [];
  return GROUPS.map((g) => ({ ...g, items: items.filter((r) => reviewState(r) === g.key) })).filter((g) => g.items.length);
}
