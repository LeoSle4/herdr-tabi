// Pure helpers for the sub-agent rows under a card of tabi-party: no Herdr calls, so they can be tested with `node --test`.
// The records come from tools/tabi_subagents.py (a Claude Code hook): one JSON file per sub-agent.

export const KEEP_DONE_MS = 120000; // a finished sub-agent stays on the card for two minutes
export const MAX_ROWS = 4;

/** The text of one record file as a record, or null when it is not one. */
export function parseRecord(text) {
  let r;
  try { r = JSON.parse(text); } catch { return null; }
  if (!r || typeof r !== "object") return null;
  if ((r.status !== "running" && r.status !== "done") || typeof r.started !== "number") return null;
  return {
    type: typeof r.type === "string" && r.type ? r.type : "agent",
    status: r.status,
    started: r.started,
    ended: typeof r.ended === "number" ? r.ended : null,
    summary: typeof r.summary === "string" ? r.summary : "",
  };
}

/**
 * The rows to draw and how many more there are. Running ones come first in the order they started (so rows do not jump), then
 * the finished ones, newest first. A "running" record only counts while its agent is working or waiting: if the agent is idle
 * or done, it is what a crash left behind. Finished ones disappear after KEEP_DONE_MS.
 */
export function visibleRows(records, parentStatus, now) {
  const alive = parentStatus === "working" || parentStatus === "blocked";
  const shown = records.filter((r) => (r.status === "done" ? now - (r.ended ?? r.started) < KEEP_DONE_MS : alive));
  shown.sort((a, b) => {
    if (a.status !== b.status) return a.status === "running" ? -1 : 1;
    return a.status === "running" ? a.started - b.started : (b.ended ?? b.started) - (a.ended ?? a.started);
  });
  return { rows: shown.slice(0, MAX_ROWS), more: Math.max(0, shown.length - MAX_ROWS) };
}

/** "12 s", "3 min", "2 h". */
export function elapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  return `${Math.floor(s / 3600)} h`;
}

/** The kanji and the detail of a row: how long a running one has been going, what a finished one reported. */
export function rowInfo(r, now) {
  if (r.status === "running") return { kanji: "働", detail: elapsed(now - r.started), busy: true };
  return { kanji: "済", detail: r.summary || elapsed((r.ended ?? now) - r.started), busy: false };
}
