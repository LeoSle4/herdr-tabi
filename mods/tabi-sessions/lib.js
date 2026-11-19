// Pure helpers for the tabi-sessions mod: no Herdr calls, so they can be tested with `node --test`.

const DAY = 24 * 60 * 60 * 1000;

/** The command that continues a session in its own folder. A session of another Claude account continues with that
 *  account's wrapper (`bin`, e.g. ~/.local/bin/claude2), so it finds the transcript in that account's config dir. */
export function resumeArgv(agent, id, bin = null) {
  if (agent === "codex") return ["codex", "resume", id];
  return [bin ?? "claude", "--resume", id];
}

/** The small tag of a session's account: none for the default one, "c2" for claude2. */
export function accountTag(account) {
  if (!account || account === "claude") return "";
  const m = /^claude(\d+)$/.exec(account);
  return m ? `c${m[1]}` : account.slice(0, 3);
}

/** The arguments that tell sessions.py about the extra accounts: ["claude2=/Users/me/.claude-cuenta2", ...]. */
export function accountArgs(accounts) {
  return (accounts ?? []).filter((a) => !a.default && a.name && a.dir).map((a) => `${a.name}=${a.dir}`);
}

/** Sessions whose title or folder contains every word of the query (case and accent blind). */
export function filterSessions(list, query) {
  const fold = (s) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return list;
  return list.filter((s) => {
    const hay = fold(`${s.title} ${s.cwd}`);
    return words.every((w) => hay.includes(w));
  });
}

/**
 * Pinned first, then Hoy (since local midnight), Últimos 7 días, Anteriores. A session appears once.
 * `pins` is the set of ids pinned here; a session Codex itself pinned counts too.
 */
export function groupSessions(list, pins, now = Date.now()) {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const today = midnight.getTime();
  const week = today - 6 * DAY;
  const groups = [
    { key: "pinned", label: "Fijadas", items: [] },
    { key: "today", label: "Hoy", items: [] },
    { key: "week", label: "Últimos 7 días", items: [] },
    { key: "older", label: "Anteriores", items: [] },
  ];
  const pinned = pins instanceof Set ? pins : new Set(pins ?? []);
  const sorted = [...list].sort((a, b) => (b.last ?? 0) - (a.last ?? 0));
  for (const s of sorted) {
    const g = pinned.has(s.id) || s.native_pin ? 0 : s.last >= today ? 1 : s.last >= week ? 2 : 3;
    groups[g].items.push(s);
  }
  return groups.filter((g) => g.items.length);
}

/** "now", "5 min", "3 h", "2 d": how long ago, as short as it can be. */
export function ago(last, now = Date.now()) {
  const m = Math.max(0, Math.round((now - last) / 60000));
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / (60 * 24))} d`;
}

/**
 * The folder a session lives in, for its second line. Usually the last name of the path; when that name is
 * very short (Codex makes chat folders such as ".../Codex/2026-11-17/ti"), the one above comes with it,
 * so "ti" reads "2026-11-17/ti".
 */
export function folderName(cwd) {
  const parts = (cwd ?? "").split(/[\\/]+/).filter(Boolean);
  if (!parts.length) return cwd ?? "";
  const last = parts[parts.length - 1];
  return last.length <= 3 && parts.length >= 2 ? `${parts[parts.length - 2]}/${last}` : last;
}

/** Groups that start open: Fijadas and Hoy. The older ones start closed. */
export const DEFAULT_OPEN = { pinned: true, today: true, week: false, older: false };

/** Whether a whole section ("claude" | "codex") is open. Open by default. */
export function sectionOpen(ui, agent) {
  return ui?.sections?.[agent] ?? true;
}

/** Whether a group of a section is open. A search opens every group so no result stays hidden. */
export function groupOpen(ui, agent, key, searching) {
  return searching || (ui?.groups?.[`${agent}.${key}`] ?? DEFAULT_OPEN[key] ?? true);
}

/** The UI state after folding or unfolding; the input is not mutated. */
export function withSection(ui, agent, open) {
  return { ...ui, sections: { ...(ui?.sections ?? {}), [agent]: open } };
}

export function withGroup(ui, agent, key, open) {
  return { ...ui, groups: { ...(ui?.groups ?? {}), [`${agent}.${key}`]: open } };
}
