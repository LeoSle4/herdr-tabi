// Pure helpers for the tabi-party mod (testable with `node --test`).

/** Kanji, accent and Spanish label of an agent status. blocked = needs the person. */
export function statusInfo(status) {
  if (status === "working") return { kanji: "働", accent: "solid", label: "trabajando", busy: true };
  if (status === "blocked") return { kanji: "待", accent: "blocked", label: "te espera", busy: false };
  return { kanji: "済", accent: "idle", label: status === "done" ? "terminó" : "en reposo", busy: false };
}

/** The character of a portrait: its file name without the image extension ("Mai.jpg" -> "Mai"); null when there is none. */
export function characterName(file) {
  const name = String(file ?? "").replace(/\.(png|jpe?g)$/i, "").trim();
  return name || null;
}

/** What a card calls its agent: the character of its portrait, or the account (claude, claude2, codex) without one. */
export function cardName(file, account) {
  return characterName(file) ?? account;
}

/** The portrait names to look for, most specific first: ~/Documents/retratos/<name>.png. */
export function portraitNames(agent) {
  const names = [agent.program?.key, agent.app, agent.program?.name]
    .filter(Boolean)
    .map((n) => String(n).toLowerCase().replace(/\s+/g, "-"));
  return [...new Set(names)];
}

/** The one-line task: the terminal's title, else what the status says. */
export function taskLine(agent) {
  const t = (agent.title ?? "").replace(/\s+/g, " ").trim();
  return t || statusInfo(agent.status).label;
}

/**
 * The account of every agent, by address. `detected` maps an address to the account its process runs under (see
 * accountOf); without it, or for a program that is not Claude, it is the program's own name ("claude", "codex").
 * Two agents of the same account are both named after it ("claude", "claude").
 */
export function accountNames(list, detected = {}) {
  const out = {};
  for (const a of list) {
    const base = String(a.program?.key ?? a.app ?? "agente").toLowerCase().replace(/-code$/, "");
    out[a.address] = (base === "claude" && detected[a.address]) || base;
  }
  return out;
}

/** The CLAUDE_CONFIG_DIR value in the text `ps eww` prints for a process (its command line and environment); null if none. */
export function configDirOf(psText) {
  const m = /(?:^|\s)CLAUDE_CONFIG_DIR=(\S+)/.exec(psText ?? "");
  return m ? m[1].replace(/\/+$/, "") : null;
}

/** The account a Claude process runs under: the one whose config dir it has, "claude" (the default) when it sets none. */
export function accountOf(psText, accounts) {
  const dir = configDirOf(psText);
  if (!dir) return accounts.find((a) => a.default)?.name ?? "claude";
  return accounts.find((a) => a.dir.replace(/\/+$/, "") === dir)?.name ?? "claude";
}

/** The second line of a card: "space · task". */
export function subtitle(agent) {
  return `${agent.space_name || "sin space"} · ${taskLine(agent)}`;
}

/** The folder where Herdr puts worktrees (the "worktrees.directory" setting, `~` expanded; default ~/.herdr/worktrees), no trailing slash. */
export function worktreesRoot(settings, home) {
  const dir = settings?.worktrees?.directory;
  const raw = typeof dir === "string" && dir.trim() ? dir.trim() : "~/.herdr/worktrees";
  return (raw.startsWith("~") ? home + raw.slice(1) : raw).replace(/[\\/]+$/, "");
}

/** { repo, checkout } of a folder that lives in the worktrees folder (<root>/<repo>/<checkout>), null for any other folder. */
export function worktreeOf(folder, root) {
  const f = String(folder ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  const r = String(root ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  if (!f || !r || !f.startsWith(`${r}/`)) return null;
  const [repo, checkout, ...more] = f.slice(r.length + 1).split("/");
  return repo && checkout && more.length === 0 ? { repo, checkout } : null;
}

/** { repo, checkout, branch } of a space that is a worktree, null for any other. The checkout names the branch while it is unknown. */
export function worktreeInfo(space, root) {
  const worktree = worktreeOf(space?.folder, root);
  return worktree ? { ...worktree, branch: space.branch || worktree.checkout } : null;
}

/** The last part of a folder, with slashes of either kind and a trailing one ("" when there is none). */
export function baseName(folder) {
  return String(folder ?? "").split(/[\\/]/).filter(Boolean).pop() ?? "";
}

/**
 * The project a space belongs to. Herdr calls an unnamed space after where its terminal is NOW (the repo), while its `folder` is where
 * it started and can be anywhere else: so the name is the better answer. A space somebody renamed says nothing about its repo: its folder does.
 */
export function projectName(space) {
  if (!space) return "";
  return space.named ? baseName(space.folder) : (space.name || baseName(space.folder));
}

/**
 * The agents as a tree. A worktree agent hangs from the first agent of its project (the same repo name on the same machine: two
 * computers never share a tree), and keeps the order of the list among its brothers. Everything else, in the order of the list:
 * [{ agent, wt: null, children: [{ agent, wt }] }]. A worktree whose project has no agent stands alone where it comes, with its
 * `wt` and `orphan: true`, and is drawn compact all the same. `spaceOf(agent)` gives its space, or undefined.
 */
export function groupAgents(list, spaceOf, root) {
  const items = list.map((agent) => {
    const space = spaceOf(agent);
    return { agent, wt: worktreeInfo(space, root), key: `${space?.machine ?? ""}|${projectName(space)}`, named: projectName(space) !== "" };
  });
  const parents = new Map(); // project -> the node of its first agent
  const nodes = items.map((x) => (x.wt ? null : { agent: x.agent, wt: null, children: [] }));
  items.forEach((x, i) => { if (nodes[i] && x.named && !parents.has(x.key)) parents.set(x.key, nodes[i]); });
  const out = [];
  items.forEach((x, i) => {
    if (nodes[i]) { out.push(nodes[i]); return; }
    const parent = parents.get(`${x.key.split("|")[0]}|${x.wt.repo}`);
    if (parent) parent.children.push({ agent: x.agent, wt: x.wt });
    else out.push({ agent: x.agent, wt: x.wt, children: [], orphan: true });
  });
  return out;
}

/** Image files a portrait can come from: png, jpg, jpeg (any case). */
export function isImage(name) {
  return /\.(png|jpe?g)$/i.test(name);
}

/**
 * A portrait for a new agent: random among those no visible agent has; when all are taken, random among the
 * least used ones, so they repeat only after every portrait is in use. `inUse` lists the file of each visible agent.
 */
export function pickPortrait(files, inUse, random = Math.random) {
  if (!files.length) return null;
  const count = (f) => inUse.filter((x) => x === f).length;
  const least = Math.min(...files.map(count));
  const pool = files.filter((f) => count(f) === least);
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}

/** Name of the cached square thumbnail of a source image: stable per file and modification time. */
export function thumbName(file, mtimeMs) {
  const slug = file.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "retrato";
  return `${slug}-${Math.floor(mtimeMs / 1000)}.png`;
}

/** The side of the centered square crop of a width x height image. */
export function cropSide(width, height) {
  return Math.max(1, Math.min(width, height));
}

/** Mime types accepted for a file without extension (what `file -b --mime-type` prints). */
const EXTENSIONLESS_OK = new Set(["image/png", "image/jpeg"]);

/**
 * Parses "<mtime>\t<file name>\t<mime type>" lines (one per regular file) into the portraits and the ignored files.
 * A file counts when its extension is png/jpg/jpeg, or when it has none and its content is a png or jpeg.
 * Everything else is ignored and reported by name. Images come sorted by name.
 */
export function parseFolder(out) {
  const images = [];
  const ignored = [];
  for (const line of out.split("\n")) {
    const [mtime, file, mime = ""] = line.split("\t");
    if (!file) continue;
    const hasExt = /\.[^./]+$/.test(file);
    if (isImage(file) || (!hasExt && EXTENSIONLESS_OK.has(mime.trim()))) images.push({ mtime: (Number(mtime) || 0) * 1000, file });
    else ignored.push(file);
  }
  images.sort((a, b) => a.file.localeCompare(b.file));
  ignored.sort((a, b) => a.localeCompare(b));
  return { images, ignored };
}

/**
 * Who gets which portrait, one agent at a time and without repeats. `liveIds` are the visible agents' unique ids (their
 * pane), in display order; `current` is what was assigned before. An agent keeps its portrait unless an earlier agent
 * holds the same one (the later one is given another); agents without one (new ones) take a portrait no other agent has.
 * Portraits repeat only when there are more agents than images. Agents that are gone are dropped, which frees theirs.
 */
export function reconcilePortraits(files, liveIds, current, random = Math.random, prefer = null) {
  const next = {};
  if (!files.length) return next;
  const firstHolder = new Map();
  for (const id of liveIds) {
    const f = current[id];
    if (files.includes(f) && !firstHolder.has(f)) firstHolder.set(f, id);
  }
  for (const [f, id] of firstHolder) next[id] = f;
  // The character picked in "Asignar tarea…" is for one agent, named by `prefer.id`: never for "whoever has none", or an agent of
  // another machine that has just reconnected would take it. It only counts if that agent has none yet and nobody wears the file.
  if (prefer && files.includes(prefer.file) && liveIds.includes(prefer.id) && !next[prefer.id] && !Object.values(next).includes(prefer.file)) {
    next[prefer.id] = prefer.file;
  }
  for (const id of liveIds) {
    if (next[id]) continue;
    next[id] = pickPortrait(files, Object.values(next), random);
  }
  return next;
}
