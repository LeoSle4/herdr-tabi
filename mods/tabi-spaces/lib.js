// Pure helpers for the tabi-spaces mod (testable with `node --test`).

const sep = /[\\/]+/;

/** "/Users/a/Projects/x" -> "~/Projects/x" when it is inside the home folder. */
export function tildePath(path, homeDir) {
  if (!path) return "";
  if (homeDir && (path === homeDir || path.startsWith(`${homeDir}/`) || path.startsWith(`${homeDir}\\`))) return `~${path.slice(homeDir.length)}`.replace(/\\/g, "/");
  return path.replace(/\\/g, "/");
}

/** A path short enough for a small line: the last two folders after "…/" when it is long. */
export function shortPath(path, homeDir, max = 24) {
  const full = tildePath(path, homeDir);
  if (full.length <= max) return full;
  const parts = full.split(sep).filter(Boolean);
  return `…/${parts.slice(-2).join("/")}`;
}

/** The home folder is "~ inicio"; every other space keeps its name. */
export function isHome(space, where, homeDir) {
  return (where ?? space.folder) === homeDir || space.name === "~";
}

export function displayName(space, where, homeDir) {
  return isHome(space, where, homeDir) && (!space.named || space.name === "~") ? "~ inicio" : space.name;
}

/** Names used by more than one space: those rows also show their path so they can be told apart. */
export function duplicateNames(spaces) {
  const count = {};
  for (const s of spaces) count[s.name] = (count[s.name] ?? 0) + 1;
  return new Set(Object.keys(count).filter((n) => count[n] > 1));
}

/**
 * The small second line: the branch, or the path when there is none. Spaces that share a name show their path
 * and a number instead (the branch is usually the same), so they can be told apart: "…/Projects/PitLane · #2".
 */
export function subline(space, where, dupes, homeDir, ordinal = 1) {
  const path = shortPath(where ?? space.folder, homeDir);
  if (!dupes.has(space.name)) return space.branch || path;
  return `${path} · #${ordinal}`;
}

/** The theme color key of the dot for a space's most urgent agent status (null: no agents, no dot). */
export function dotKey(status) {
  return { blocked: "blocked", done: "done", working: "working", idle: "idle" }[status] ?? null;
}

/** Height the block needs: header, one row per space (or `header` already holding the measured rows), a little air.
 *  Capped so the sidebar keeps room for the other blocks. */
export function blockHeight(count, rowH = 42, header = 38, max = 240, min = 84) {
  return Math.min(max, Math.max(min, header + count * rowH + 8));
}

const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };

/** The place of every space among those with its name, in list order: { id: 1 | 2 | 3 … }. */
export function ordinals(spaces) {
  const seen = {};
  const out = {};
  for (const s of spaces) {
    seen[s.name] = (seen[s.name] ?? 0) + 1;
    out[s.id] = seen[s.name];
  }
  return out;
}

/** The discreet suffix of a repeated name: "" for the first one, "²" for the second, "¹⁰" for the tenth. */
export function suffix(ordinal) {
  return ordinal > 1 ? ` ${String(ordinal).replace(/\d/g, (d) => SUP[d])}` : "";
}

/** Active space first, then those with agents (more agents first), then the rest, each group in list order. */
export function orderSpaces(spaces, counts) {
  const rank = (s) => (s.active ? 0 : (counts[s.id] ?? 0) > 0 ? 1 : 2);
  return spaces
    .map((s, i) => ({ s, i }))
    .sort((a, b) => rank(a.s) - rank(b.s) || (rank(a.s) === 1 ? (counts[b.s.id] ?? 0) - (counts[a.s.id] ?? 0) : 0) || a.i - b.i)
    .map(({ s }) => s);
}

/** How many rows show and where they start: at most `max`, never a cut row; the offset is clamped. */
export function rowWindow(total, offset, folded, max = 5) {
  const rows = folded ? Math.min(1, total) : Math.min(max, total);
  const start = folded ? 0 : Math.min(Math.max(0, offset), Math.max(0, total - rows));
  return { rows, start, more: !folded && start + rows < total, less: !folded && start > 0 };
}

/** The block's height for `rows` rows of `rowH`: header, rows and a little air. */
export function rowsHeight(rows, rowH = 28, header = 38, air = 8) {
  return header + rows * rowH + air;
}
