// tabi-party: "使者 · agentes". One card per agent: accent strip by state (cream working, amber waiting, gray idle),
// round portrait, the portrait's character name (Mai, Kazuto...; the account, claude/claude2/codex, without a portrait and in the tooltip), status kanji, "space · task" and a 2 px bar. The right edge is cut on a diagonal with two SVG
// shapes (the engine has no clip-path): a triangle in the sidebar's color and a hairline on its edge.
// Under the card of an agent that runs on this machine, its Claude Code sub-agents (see subagents.js and tools/tabi_subagents.py).
// Portraits: every png/jpg in ~/Documents/retratos/ (any name; also files without extension whose content is a png or jpeg;
// anything else is named in a notification and ignored). Each agent gets one at random when it appears, by the unique id of
// its pane (not by its account), and keeps it while it lives (data/tabi/portraits.json); a new agent gets one that no
// visible agent has, they repeat only when there are more agents than images, and a closed agent frees its portrait. New images are found on their own (every 15 s). Each is cut to a centered square thumbnail
// (data/tabi/portraits/, with macOS `sips`, or portraits.ps1 on Windows) and the card clips it in a circle. No images: a neutral figure.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import * as fs from "fs/promises";
import { agents, spaces, settings, home, run, theme, checking, layout, appHome, exec, shared, setShared, notify, window as herdrWindow } from "herdr";
import { parseRecord, visibleRows, rowInfo } from "./subagents.js";
import { statusInfo, accountNames, cardName, characterName, subtitle, taskLine, worktreesRoot, groupAgents, parseTask, taskFor, finishTask, taskTooltip, parseStop, taskEnded, isImage, reconcilePortraits, thumbName, cropSide, parseFolder, accountOf } from "./lib.js";

const THUMB = 96; // px of the cached thumbnail: sharp at the card's 34 px, also on a 2x screen
const srcDir = () => `${home()}/Documents/retratos`;
const thumbDir = () => `${appHome()}/data/tabi/portraits`;
const assignFile = () => `${appHome()}/data/tabi/portraits.json`;
// Where the Claude Code hook (tools/tabi_subagents.py) writes one folder per terminal id, one JSON file per sub-agent.
const tasksDir = () => `${appHome()}/data/tabi/tasks`;
const subagentRoot = () => `${home()}/.local/state/tabi/subagents`;
const num = (text, key) => Number(new RegExp(`${key}:\\s*(\\d+)`).exec(text)?.[1]);
// Windows has no sips, stat or file: portraits.ps1 (PowerShell, System.Drawing) lists the folder and cuts the thumbnails.
const onWindows = () => herdrWindow()?.platform === "windows";
const powershell = (...args) =>
  exec("powershell", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", `${appHome()}/mods/tabi-party/portraits.ps1`, ...args], { timeout: 30000 });

const W = 216;
const H = 64;
const CH = 44; // a compact card: the agent of a worktree
const INDENT = 24; // what the tree takes on the left: its line and the branch into each card
const GAP = 4; // between the cards of a tree
const TEXT_W = 141;
const PORTRAIT = 34;
const CP = 26; // the portrait of a compact card
const MAX_H = 360;

function sizeOf(node, id) {
  if (node?.id === id) return node.size?.px ?? null;
  for (const c of node?.children ?? []) { const r = sizeOf(c, id); if (r !== undefined) return r; }
  return undefined;
}


export default class TabiParty extends View {
  init(_props, cx) {
    this.thumbs = new Map(); // source file -> { path (relative to the app home), mtime }
    this.assign = {}; // agent id (its pane, unique) -> source file
    this.detected = {}; // agent address -> { pid, name }: the account its process runs under
    this.scanned = false;
    this.scanning = false; // one folder scan at a time
    this.sawAgents = false; // agents were seen at least once: an empty list afterwards means they all closed
    this.ignored = ""; // the ignored files last reported
    this.subs = {}; // agent address (this machine's terminals only) -> the records of its sub-agents
    this.subsKey = "";
    this.tasks = []; // the records of data/tabi/tasks, newest first
    this.tasksKey = "";
    this.worked = new Set(); // ids of the tasks whose agent was seen working
    if (checking()) return;
    cx.spawn(async (cx) => {
      try { this.assign = JSON.parse(await fs.readFile(assignFile(), "utf8")); } catch { /* none yet */ }
      await this.scan();
      cx.notify();
    });
    cx.timer.every(15000, (cx) => cx.spawn(async (cx) => { if (await this.scan()) cx.notify(); }));
    cx.timer.every(6000, (cx) => cx.spawn(async (cx) => { if (await this.detect()) cx.notify(); }));
    // Sub-agents: re-read every 3 s; redraw when something changed or while one runs (its elapsed time moves).
    cx.timer.every(3000, (cx) => cx.spawn(async (cx) => { if ((await this.loadSubs()) || this.runningSubs()) cx.notify(); }));
    cx.timer.every(3000, (cx) => cx.spawn(async (cx) => { if (await this.loadTasks()) cx.notify(); }));
    cx.spawn(async (cx) => { if (await this.detect()) cx.notify(); });
  }

  /** Which account each Claude agent runs under: the CLAUDE_CONFIG_DIR in its process's environment (`ps eww`, own
   *  processes only), matched against the accounts tabi-usage publishes. Looked at again only when the process changes. */
  async detect() {
    const accounts = shared("tabi.accounts") ?? [];
    let changed = false;
    const live = agents().filter((a) => String(a.program?.key ?? a.app ?? "").toLowerCase().startsWith("claude"));
    for (const a of live) {
      try {
        const info = JSON.parse((await exec("hc", ["get", a.address], { timeout: 10000 })).stdout);
        const pid = info?.foreground?.pid ?? info?.pid;
        if (!pid) continue;
        const known = this.detected[a.address];
        if (known?.pid === pid && known.accounts === accounts.length) continue;
        const ps = (await exec("ps", ["eww", "-p", String(pid), "-o", "command="], { timeout: 10000 })).stdout;
        const name = accountOf(ps, accounts);
        if (known?.name !== name) changed = true;
        this.detected[a.address] = { pid, name, accounts: accounts.length };
      } catch { /* the terminal went away, or no ps: keep what we know */ }
    }
    return changed;
  }

  /** Reads the sub-agent records of the agents that run on this machine (another machine's hook writes on that machine).
   *  Resolves true when something changed. */
  async loadSubs() {
    const next = {};
    for (const a of agents()) {
      if (a.address.includes("/")) continue;
      let names;
      try { names = await fs.readdir(`${subagentRoot()}/${a.address}`); } catch { continue; }
      const records = [];
      for (const name of names) {
        if (!name.endsWith(".json")) continue;
        try {
          const rec = parseRecord(await fs.readFile(`${subagentRoot()}/${a.address}/${name}`, "utf8"));
          if (rec) records.push(rec);
        } catch { /* removed while reading */ }
      }
      if (records.length) next[a.address] = records;
    }
    const key = JSON.stringify(next);
    const changed = key !== this.subsKey;
    this.subs = next;
    this.subsKey = key;
    return changed;
  }

  /** Reads the task records and closes those whose agent has finished (done, with what it said last). Resolves true when something changed. */
  async loadTasks() {
    let names;
    try { names = (await fs.readdir(tasksDir())).filter((n) => n.endsWith(".json")).sort().reverse().slice(0, 60); } catch { return false; }
    const records = [];
    for (const name of names) {
      try {
        const rec = parseTask(await fs.readFile(`${tasksDir()}/${name}`, "utf8"));
        if (rec) records.push(rec);
      } catch { /* removed while reading */ }
    }
    const now = Date.now();
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      if (rec.status === "done") continue;
      // Two tabs can share a name: the task ends only when every agent with that name has ended (late, never too soon).
      const mine = agents().filter((x) => taskFor([rec], x.tab_name, this.machineOf(x), now));
      if (!mine.length) continue;
      if (mine.some((x) => x.status === "working")) this.worked.add(rec.id);
      if (!mine.every((x) => taskEnded(x.status, this.worked.has(rec.id), rec, now))) continue;
      const a = mine[0];
      let said = null;
      if (!a.address.includes("/")) {
        try { said = parseStop(await fs.readFile(`${subagentRoot()}/${a.address}/_stop.json`, "utf8")); } catch { /* the hook has not written it */ }
      }
      const done = finishTask(rec, said, now);
      if (!done) continue;
      try { await fs.writeFile(`${tasksDir()}/${rec.id}.json`, JSON.stringify(done)); records[i] = done; } catch { /* try again on the next round */ }
    }
    const key = JSON.stringify(records);
    const changed = key !== this.tasksKey;
    this.tasks = records;
    this.tasksKey = key;
    return changed;
  }

  /** The machine of an agent's space (null = this computer). */
  machineOf(a) {
    return this.spaceOf(a)?.machine ?? null;
  }

  /** The task given to the tab of this agent, or null. */
  taskOf(a) {
    return taskFor(this.tasks, a.tab_name, this.machineOf(a), Date.now());
  }

  runningSubs() {
    return Object.values(this.subs).some((records) => records.some((r) => r.status === "running"));
  }

  /** The strip under a card with its sub-agents: "働 Explore  12 s" while it runs, "済 Explore  <what it reported>" after. */
  subRows(a, t) {
    try { return this.buildSubRows(a, t); } catch { return null; } // the strip is a bonus: it must never take the cards down
  }

  buildSubRows(a, t) {
    const now = Date.now();
    const { rows, more } = visibleRows(this.subs[a.address] ?? [], a.status, now);
    if (!rows.length) return null;
    return v_flex().w(W).bg(t.surface).border_l(0.5).border_b(0.5).border_color(t.border).py(3)
      .children(rows.map((r, i) => {
        const info = rowInfo(r, now);
        return h_flex().id(`sub-${a.address}-${i}`).h(20).items_center().gap(6).pl(17).pr(14)
          .when(Boolean(r.summary), (el) => el.tooltip(r.summary))
          .child(div().w(12).flex_none().text_size(11).text_color(info.busy ? t.solid : t.idle).child(info.kanji))
          .child(div().flex_none().text_size(11.5).text_color(t.muted).child(r.type))
          .child(div().flex_1().min_w(0).truncate().text_size(10.5).font_light().text_color(t.dim).child(info.detail));
      }))
      .when(more > 0, (el) => el.child(div().pl(35).h(18).text_size(10.5).font_light().text_color(t.dim).child(`+${more} más`)));
  }

  /** The centered square thumbnail of a source image (sips on macOS); the original, uncropped, where sips is missing. */
  async makeThumb(file, mtime) {
    const src = `${srcDir()}/${file}`;
    const out = `${thumbDir()}/${thumbName(file, mtime)}`;
    try {
      await fs.mkdir(thumbDir(), { recursive: true });
      if (!(await fs.exists(out))) {
        if (onWindows()) {
          await powershell("-Mode", "thumb", "-Src", src, "-Out", out, "-Size", String(THUMB));
        } else {
          const info = (await exec("sips", ["-g", "pixelWidth", "-g", "pixelHeight", src], { timeout: 20000 })).stdout;
          const side = cropSide(num(info, "pixelWidth"), num(info, "pixelHeight"));
          const tmp = `${out}.tmp.png`;
          await exec("sips", ["-s", "format", "png", "--cropToHeightWidth", String(side), String(side), src, "--out", tmp], { timeout: 20000 });
          await exec("sips", ["-Z", String(THUMB), tmp, "--out", out], { timeout: 20000 });
          try { await fs.unlink(tmp); } catch { /* already gone */ }
        }
        if (!(await fs.exists(out))) throw new Error("no thumbnail");
      }
      return `data/tabi/portraits/${thumbName(file, mtime)}`;
    } catch {
      // Windows has no ~/Documents link inside the mod: no thumbnail means the neutral figure (and a new try on the next scan).
      return onWindows() ? null : `mods/tabi-party/retratos/${file}`;
    }
  }

  /** The usable images of the folder (png/jpg/jpeg, also without extension) with their modification time, and the names of
   *  the files that are ignored. One `stat` and one `file` per file through the shell (the engine's fs has neither);
   *  without a shell, the plain directory listing and no times. */
  async listFolder() {
    if (onWindows()) {
      // PowerShell lists the files with their times and, for those without extension, their png/jpeg signature.
      try {
        const r = await powershell("-Mode", "list", "-Dir", srcDir());
        if (r.code === 0) return parseFolder(r.stdout);
      } catch { /* no PowerShell: the plain listing below */ }
    }
    const script = 'for f in "$1"/*; do [ -f "$f" ] || continue; m=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0); t=$(file -b --mime-type "$f" 2>/dev/null); printf "%s\\t%s\\t%s\\n" "$m" "${f##*/}" "$t"; done';
    try {
      const r = await exec("sh", ["-c", script, "retratos", srcDir()], { timeout: 20000 });
      if (r.code === 0) return parseFolder(r.stdout);
    } catch { /* no shell here */ }
    try {
      const names = (await fs.readdir(srcDir())).sort();
      return { images: names.filter(isImage).map((file) => ({ file, mtime: 0 })), ignored: names.filter((n) => !isImage(n)) };
    } catch { return { images: [], ignored: [] }; }
  }

  /** Reads the folder: new or changed images get a thumbnail, removed ones go. Resolves true when something changed.
   *  The thumbnails are built apart and swapped in at the end, so nobody is ever given a portrait from a half-read
   *  folder, and only one scan runs at a time. Files that are not usable images are named once in a notification. */
  async scan() {
    if (this.scanning) return false;
    this.scanning = true;
    try {
      const { images, ignored } = await this.listFolder();
      const next = new Map();
      for (const { file, mtime } of images) {
        const old = this.thumbs.get(file);
        next.set(file, old && old.mtime === mtime && old.path ? old : { path: await this.makeThumb(file, mtime), mtime });
      }
      const sameFiles = [...next.keys()].join("\n") === [...this.thumbs.keys()].join("\n");
      const samePaths = sameFiles && [...next].every(([f, v]) => v.path === this.thumbs.get(f)?.path);
      const first = !this.scanned;
      this.thumbs = next;
      this.publishPortraits();
      this.scanned = true;
      const key = ignored.join("\n");
      if (key !== this.ignored) {
        this.ignored = key;
        if (ignored.length) notify({ title: "Retratos: archivos ignorados", body: `${ignored.join(", ")} (solo se usan png y jpg, también sin extensión)`, level: "warning", timeout: 8000 });
      }
      return first || !samePaths;
    } finally {
      this.scanning = false;
    }
  }

  /** The characters (portrait files) for the "Asignar tarea…" dialog, published only when the list changed. */
  publishPortraits() {
    const list = [...this.thumbs].map(([file, v]) => ({ file, name: characterName(file) ?? file, thumb: v.path }));
    const key = JSON.stringify(list);
    if (key === this.portraitsKey) return;
    this.portraitsKey = key;
    setShared("tabi.portraits", list);
  }

  /** The unique id of an agent's portrait slot: its pane (it dies with the tab); the terminal's address if there is none. */
  idOf(a) {
    return a.pane || a.address;
  }

  /** Gives portraits one agent at a time (reconcilePortraits), freeing those of agents that closed; saved when it changes.
   *  Nothing is assigned while the folder is being read. */
  assignPortraits(cx) {
    if (!this.scanned || this.scanning) return;
    const list = agents();
    if (list.length) this.sawAgents = true;
    // At start the list can be empty for a moment: the saved assignments are kept until agents have been seen.
    if (!list.length && !this.sawAgents) return;
    // "Asignar tarea…" asks for a character for the agent it is about to start. That agent is the one in the tab named like the
    // character (the dialog names the tab after it) that has no portrait yet: not "whoever has none", which could be an agent of
    // another machine that has just reconnected. Valid for 30 s and used once.
    const wish = shared("tabi.next-portrait");
    const fresh = wish && Date.now() - wish.at < 30000;
    const target = fresh ? list.find((x) => !this.assign[this.idOf(x)] && x.tab_name === characterName(wish.file)) : null;
    const prefer = target ? { file: wish.file, id: this.idOf(target) } : null;
    const next = reconcilePortraits([...this.thumbs.keys()], list.map((x) => this.idOf(x)), this.assign, Math.random, prefer);
    // The wish is spent when it was given, or when it expired. While the agent has not appeared yet it waits.
    if (wish && (!fresh || (prefer && next[prefer.id] === prefer.file))) {
      cx.spawn(async () => { setShared("tabi.next-portrait", null); });
    }
    if (JSON.stringify(next) === JSON.stringify(this.assign)) return;
    this.assign = next;
    cx.spawn(async () => {
      try {
        await fs.mkdir(`${appHome()}/data/tabi`, { recursive: true });
        await fs.writeFile(assignFile(), JSON.stringify(next));
      } catch { /* the portraits are only not remembered */ }
    });
  }

  /** The block takes the height its cards need (layout.resize), so no empty gap is left in the sidebar. */
  fit(height) {
    const px = Math.min(MAX_H, Math.ceil(height));
    if (px < 40 || sizeOf(layout(), "party") === px) return;
    run("layout.resize", { id: "party", px });
  }

  /** Publishes who each agent is (character, account, thumbnail) for tabi-toast, only when something changed. */
  publish(list, names, cx) {
    const out = {};
    for (const a of list) {
      const file = this.assign[this.idOf(a)];
      out[a.address] = { name: cardName(file, names[a.address]), account: names[a.address], thumb: this.thumbs.get(file)?.path ?? null };
    }
    const key = JSON.stringify(out);
    if (key === this.published) return;
    this.published = key;
    cx.spawn(async () => { setShared("tabi.party", out); });
  }

  spaceOf(a) {
    return spaces().find((x) => x.id === a.space);
  }

  card(a, t, name, account) {
    const s = statusInfo(a.status);
    const accent = t[s.accent];
    const thumb = this.thumbs.get(this.assign[this.idOf(a)])?.path;
    // The engine clips nothing to a circle: a square mask in the card's color, with a round hole, sits over the photo.
    const portrait = div().relative().w(PORTRAIT).h(PORTRAIT).flex_none().rounded_full().bg(t.raised)
      .flex().items_center().justify_center()
      .child(thumb
        ? image(thumb).w(PORTRAIT).h(PORTRAIT)
        : svg("mods/tabi-party/person.svg").size(20).text_color(t.dim))
      .when(Boolean(thumb), (el) => el.child(svg("mods/tabi-party/circle-mask.svg").absolute().top(0).left(0).w(PORTRAIT).h(PORTRAIT).text_color(t.surface)));
    const track = div().relative().w(TEXT_W).h(2).rounded(1).bg(t.raised).overflow_hidden();
    if (s.busy) track.child(div().absolute().top(0).left(0).w(52).h(2).rounded(1).bg(accent).loop("left", { from: 0, to: TEXT_W - 52, period: 1800 }));
    else if (a.status === "blocked") track.child(div().absolute().top(0).left(0).w(TEXT_W).h(2).rounded(1).bg(accent));
    return div().id(`card-${a.address}`).relative().w(W).h(H).flex_none().bg(t.surface)
      .border_1().border_color(t.border)
      .hover((x) => x.border_color(t.input))
      .when(Boolean(this.taskOf(a)), (el) => el.tooltip(taskTooltip(this.taskOf(a))))
      .on_click(() => run("pane.focus", { pane: a.pane }))
      .child(div().absolute().top(0).left(0).w(3).h(H).bg(accent))
      .child(h_flex().h_full().items_center().gap(10).pl(17)
        .child(portrait)
        .child(v_flex().w(TEXT_W).gap(3)
          .child(h_flex().justify_between().items_baseline()
            .child(div().id(`name-${a.address}`).truncate().text_size(12.5).text_color(a.focused ? t.foreground : t.muted)
              .when(name !== account, (el) => el.tooltip(`${name} · ${account}`)).child(name))
            .child(div().text_size(13).text_color(accent).child(s.kanji)))
          .child(div().truncate().text_size(11).font_light().text_color(t.dim).child(subtitle(a)))
          .child(track)))
      .child(svg("mods/tabi-party/cut.svg").absolute().top(0).right(0).w(14).h(H).text_color(t.chrome))
      .child(svg("mods/tabi-party/cut-line.svg").absolute().top(0).right(0).w(14).h(H).text_color(t.input));
  }

  /**
   * The agent of a worktree: smaller than a card. Round portrait, name, status kanji and, under the name, the icon of a branch and its
   * name; the task and the repo are in the tooltip. `width` is a card's, less what the tree takes on the left when it hangs from one.
   */
  compactCard(a, t, name, account, wt, width) {
    const s = statusInfo(a.status);
    const accent = t[s.accent];
    const thumb = this.thumbs.get(this.assign[this.idOf(a)])?.path;
    const portrait = div().relative().w(CP).h(CP).flex_none().rounded_full().bg(t.raised)
      .flex().items_center().justify_center()
      .child(thumb ? image(thumb).w(CP).h(CP) : svg("mods/tabi-party/person.svg").size(14).text_color(t.dim))
      .when(Boolean(thumb), (el) => el.child(svg("mods/tabi-party/circle-mask.svg").absolute().top(0).left(0).w(CP).h(CP).text_color(t.surface)));
    return div().id(`card-${a.address}`).relative().w(width).h(CH).flex_none().bg(t.surface)
      .border_1().border_color(t.border)
      .hover((x) => x.border_color(t.input))
      .tooltip([`${wt.repo} · ${wt.checkout} · ${taskLine(a)}${name !== account ? ` · ${account}` : ""}`, taskTooltip(this.taskOf(a))].filter(Boolean).join("\n"))
      .on_click(() => run("pane.focus", { pane: a.pane }))
      .child(div().absolute().top(0).left(0).w(2).h(CH).bg(accent))
      .child(h_flex().h_full().items_center().gap(8).pl(12).pr(10)
        .child(portrait)
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(h_flex().justify_between().items_baseline().gap(6)
            .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(a.focused ? t.foreground : t.muted).child(name))
            .child(div().flex_none().text_size(12).text_color(accent).child(s.kanji)))
          .child(h_flex().gap(4).items_center()
            .child(svg("mods/workspace-chrome/branch.svg").size(10).flex_none().text_color(t.accent))
            .child(div().flex_1().min_w(0).truncate().text_size(10).text_color(t.dim).child(wt.branch)))));
  }

  /** The worktree agents of a project, as a tree: a vertical line down the left and a short branch into each compact card. */
  branches(children, t, names) {
    const row = CH + GAP;
    return v_flex().w(W).children(children.map((c, i) => {
      const last = i === children.length - 1;
      const name = cardName(this.assign[this.idOf(c.agent)], names[c.agent.address]);
      return h_flex().w_full().h(row)
        .child(div().relative().w(INDENT).h(row).flex_none()
          .child(div().absolute().top(0).left(10).w(1).h(last ? GAP + CH / 2 : row).bg(t.input))
          .child(div().absolute().top(GAP + CH / 2).left(10).w(INDENT - 10).h(1).bg(t.input)))
        .child(v_flex().pt(GAP).flex_none().child(this.compactCard(c.agent, t, name, names[c.agent.address], c.wt, W - INDENT)));
    }));
  }

  render(cx) {
    const t = theme();
    const list = agents();
    this.assignPortraits(cx);
    const detected = Object.fromEntries(Object.entries(this.detected).map(([k, v]) => [k, v.name]));
    const names = accountNames(list, detected);
    const body = v_flex().gap(8).px(12).pb(12);
    this.publish(list, names, cx);
    // The tree: an agent of a worktree hangs from the first agent of its project (same repo, same machine).
    const nodes = groupAgents(list, (a) => this.spaceOf(a), worktreesRoot(settings(), home()));
    for (const node of nodes) {
      const a = node.agent;
      const name = cardName(this.assign[this.idOf(a)], names[a.address]);
      const tail = this.subRows(a, t);
      body.child(v_flex().id(`group-${a.address}`).flex_none()
        .child(node.wt ? this.compactCard(a, t, name, names[a.address], node.wt, W) : this.card(a, t, name, names[a.address]))
        .when(Boolean(tail), (el) => el.child(tail))
        .when(node.children.length > 0, (el) => el.child(this.branches(node.children, t, names))));
    }
    if (!list.length) body.child(div().py(8).text_size(11.5).font_light().text_color(t.dim).child("Ningún agente activo."));
    return v_flex().id("tabi-party").size_full().bg(t.chrome).overflow_hidden()
      .child(div().id("tabi-party-list").flex_1().min_h(0).overflow_y_scrollbar()
        .child(v_flex().id("tabi-party-fit").flex_none().w_full()
          .on_size_change((size, cx) => this.fit(size.height))
          .child(h_flex().items_baseline().justify_between().px(14).pt(14).pb(10)
            .child(div().text_size(12).font_light().text_color(t.muted).child("使者 · agentes"))
            .child(div().text_size(11).font_light().text_color(t.dim).child(`${list.length}`)))
          .child(body)));
  }
}
