// Pure helpers for the tabi-backdrop mod (testable with `node --test`).

/**
 * How opaque the dark layer over a picture is: the brighter the picture, the darker the layer, so terminal
 * text always reads. `brightness` is 0 (black) to 1 (white); null (unknown) gets the strongest layer.
 */
export function darkness(brightness) {
  if (brightness == null || Number.isNaN(brightness)) return 0.9;
  const b = Math.min(1, Math.max(0, brightness));
  return Math.round((0.62 + 0.3 * b) * 100) / 100;
}

/** "#0d1014" + 0.87 -> "#0d1014de". */
export function withAlpha(hex, alpha) {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex.slice(0, 7)}${a.toString(16).padStart(2, "0")}`;
}

/**
 * The picture for a new space: random among those no other open space has; when all are taken, random among the
 * least used ones, so pictures repeat only after every one is in use. `used` lists the picture of each other space.
 */
export function pickUnused(files, used, random = Math.random) {
  if (!files.length) return null;
  const count = (f) => used.filter((x) => x === f).length;
  const least = Math.min(...files.map(count));
  const pool = files.filter((f) => count(f) === least);
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

/** Keeps the pictures of the spaces that are still open. */
export function pruneSpaces(map, openIds) {
  const out = {};
  for (const [id, file] of Object.entries(map)) if (openIds.includes(id)) out[id] = file;
  return out;
}

/** The tag of the bottom bar: "fondo 4/10" (the position of a picture in the list). */
export function tagLabel(files, file) {
  const i = files.indexOf(file);
  return i < 0 ? "sin fondo" : `fondo ${i + 1}/${files.length}`;
}

/**
 * Copies what the person (or a mod) changed at run time from the live tree into the layout read from disk, by node id:
 * sizes, hidden nodes and the chosen child of a stack. Writing the file back with these means it says what the window
 * already shows, so a rewrite of the file can't undo a drag, a fold or a panel choice. Returns a copy.
 */
export function mergeLive(fileTree, liveTree) {
  const live = new Map();
  const index = (n) => { if (n?.id) live.set(n.id, n); (n?.children ?? []).forEach(index); };
  index(liveTree);
  const tree = JSON.parse(JSON.stringify(fileTree));
  const visit = (n) => {
    const l = live.get(n.id);
    if (l) {
      if (l.size !== undefined) n.size = JSON.parse(JSON.stringify(l.size));
      if (l.hidden !== undefined) n.hidden = l.hidden;
      if (l.active !== undefined && n.type === "stack") n.active = l.active;
    }
    (n.children ?? []).forEach(visit);
  };
  visit(tree);
  return tree;
}

/** Sets the picture and its dark layer on a layout tree (a copy): `work-body` paints it, the pane frame darkens it. */
export function patchLayout(layout, image, alpha) {
  const tree = JSON.parse(JSON.stringify(layout));
  const visit = (n) => {
    if (n.id === "work-body") n.background = { image, fit: "cover" };
    if (n.content?.tab && n.content.pane) n.content.pane.background = withAlpha("#0d1014", alpha);
    (n.children ?? []).forEach(visit);
  };
  visit(tree);
  return tree;
}
