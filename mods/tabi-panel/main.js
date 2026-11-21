// tabi-panel: what is left of the sidebar under the sessions. Three small blocks with 0.5 px borders:
//   今 · ahora      agents that are blocked (need the person), with a "responder ›" link that focuses their tab.
//                   Herdr gives no question text for an agent, so none is shown. Amber border while something is pending.
//   道 · proyecto   read-only git of the active space: branch, changed files, +/- lines, last commit, commits not pushed.
//                   Refreshes when the space changes and every 60 s.
//   始 · iniciar    "+ claude" and "+ codex" (new tab in the active space) and "cambios" (opens the Changes panel).
// It also shares the sidebar's height with the sessions (this copy is the controller; the sessions publish what they need):
//   room for both -> sessions take their natural height and this panel gets the rest, anchored to the bottom;
//   not enough    -> the sessions shrink first (they scroll inside); only then this panel becomes one 34 px row
//                    ("今 0 · 道 15 +94 −22 · 始 +claude +codex") that opens the full panel in a popup when clicked.
// Spaces and agents are never resized here.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import * as fs from "fs/promises";
import { agents, spaces, panes, focused, exec, run, openOverlay, props, shared, layout, appHome, settings, theme, checking, window as herdrWindow } from "herdr";
import { accountNames, pending, agoShort, changeSummary, parseLastCommit, parseAhead, filesLabel, parsePrefs, launchArgv, summary } from "./lib.js";

const AMBER = "#d9a441";
const AMBER_SOFT = "#d9a44166";
// Reads write nothing under .git (no index refresh or lock): the folder watchers of other panels would see them.
const COMPACT_H = 34;
const MIN_SESSIONS = 70; // two folded headers
const SECTION_MIN = 35;
const ROOM_MARGIN = 4; // measured: the blocks add up to the window minus this
function nodeSize(node, id) {
  if (node?.id === id) return node.size ?? {};
  for (const c of node?.children ?? []) { const r = nodeSize(c, id); if (r) return r; }
  return null;
}
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];

function location() {
  const space = spaces().find((s) => s.active);
  const f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  return { space: space?.id ?? null, machine: space?.machine ?? null, cwd: pane?.cwd || f?.cwd || space?.folder || null };
}
const keyOf = () => JSON.stringify(location());

export default class TabiPanel extends View {
  init(_props, cx) {
    this.prefs = {}; // the model and effort each agent starts with (data/tabi/launch.json, chosen with the gear)
    this.prefsRev = null;
    this.git = null; // null: not read yet; { repo: false } or { repo: true, branch, files, add, del, last, ahead }
    this.key = null;
    this.loading = false;
    this.popup = Boolean(props()?.popup); // the full panel opened from the compact row: no sizing, no timers
    this.compact = false;
    this.natural = 0; // the full panel's own height, measured while it is shown
    this.windowH = 0;
    this.outerH = 0; // this block's own current height (Windows sizing, see control)
    if (checking()) return;
    this.refresh(cx);
    cx.timer.every(60000, (cx) => this.refresh(cx));
    if (!this.popup) {
      cx.timer.every(700, (cx) => cx.spawn(async (cx) => { await this.readWindow(); this.control(cx); }));
    }
  }

  /** The window's height in px, from the file Herdr keeps (window.json). Measuring this block would not do: when
   *  there is no room it is squeezed out and reports nothing useful, which is exactly when this has to decide. */
  async readWindow() {
    try {
      const h = JSON.parse(await fs.readFile(`${appHome()}/window.json`, "utf8"))?.bounds?.[3];
      if (h > 0) this.windowH = h / (Number(settings().zoom) || 1);
    } catch { /* keep the last height */ }
  }

  /** Shares the height left under the spaces and agents between the sessions and this block: see the header.
   *  The room is the window, minus the usage bar, spaces and agents (their sizes come from the layout). */
  control(cx) {
    const need = shared("tabi.sessions.need");
    const root = layout();
    let room;
    if (herdrWindow()?.platform === "windows") {
      // window.json keeps the restored bounds while the window is maximized, so it cannot be trusted here. The room the
      // sessions and this block share is constant, whatever the split: their two current heights add up to it.
      const sessionsH = shared("tabi.sessions.h");
      if (!(need > 0 && this.natural > 0 && sessionsH > 0 && this.outerH > 0)) return;
      room = sessionsH + this.outerH;
    } else {
      const fixed = ["usage", "spaces", "party"].map((id) => nodeSize(root, id)?.px);
      if (!(need > 0 && this.windowH > 0 && this.natural > 0) || fixed.some((v) => !(v >= 0))) return;
      room = this.windowH - fixed.reduce((a, b) => a + b, 0) - ROOM_MARGIN;
    }
    let sessions, panel, compact = false;
    if (need + this.natural <= room) { sessions = { px: need }; panel = { weight: 1 }; }
    else if (MIN_SESSIONS + this.natural <= room) { sessions = { px: Math.floor(room - this.natural) }; panel = { px: this.natural }; }
    else { sessions = { px: Math.max(SECTION_MIN, Math.floor(room - COMPACT_H)) }; panel = { px: COMPACT_H }; compact = true; }
    const apply = (id, want) => {
      const now = nodeSize(root, id);
      if (!now) return;
      const same = want.px != null ? now.px === want.px : now.weight === want.weight && now.px == null;
      if (!same) run("layout.resize", { id, ...want });
    };
    apply("sessions", sessions);
    apply("now", panel);
    if (compact !== this.compact) { this.compact = compact; cx.notify(); }
  }

  openFull(e) {
    openOverlay({ mod: "tabi-panel", kind: "popup", width: 240, height: this.natural + 4, props: { popup: true } });
  }

  refresh(cx) {
    const { cwd, machine } = location();
    const key = keyOf();
    if (key !== this.key) { this.key = key; this.git = null; }
    if (!cwd || this.loading) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const git = (args) => exec("git", [...READ, ...args], { cwd, on: machine });
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on: machine });
        if (keyOf() !== key) return;
        if (top.code !== 0) { this.git = { repo: false }; return; }
        const [branch, status, head] = await Promise.all([git(["rev-parse", "--abbrev-ref", "HEAD"]), git(["status", "--porcelain=v1", "--untracked-files=all"]), git(["rev-parse", "--verify", "HEAD"])]);
        const hasHead = head.code === 0;
        const [numstat, last, ahead] = hasHead
          ? await Promise.all([git(["diff", "HEAD", "--numstat", "--no-renames"]), git(["log", "-1", "--format=%ct%x09%s"]), git(["rev-list", "--count", "@{u}..HEAD"])])
          : [{ stdout: "" }, { stdout: "" }, { code: 1, stdout: "" }];
        if (keyOf() !== key) return;
        this.git = { repo: true, branch: branch.stdout.trim() || "sin rama", ...changeSummary(status.stdout, numstat.stdout ?? ""),
          last: parseLastCommit(last.stdout), ahead: parseAhead(ahead.code ?? 0, ahead.stdout) };
      } catch {
        if (keyOf() === key) this.git = { repo: false };
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  card(id, glyph, title, t, borderColor) {
    return v_flex().id(id).flex_none().w_full().gap(8).px(12).py(10).border(0.5).border_color(borderColor ?? t.border).bg(t.surface)
      .child(h_flex().items_baseline().gap(6)
        .child(div().text_size(12).text_color(t.muted).child(glyph))
        .child(div().text_size(11).font_light().text_color(t.dim).child(`· ${title}`)));
  }

  answer(a, names, t) {
    return h_flex().id(`answer-${a.address}`).items_center().gap(8).py(2).cursor_pointer()
      .hover((x) => x.bg(t.hover))
      .on_click(() => { run("space.select", { id: a.space }); run("tab.select", { id: a.tab }); run("pane.focus", { pane: a.pane }); })
      .child(div().w(6).h(6).flex_none().rounded_full().bg(AMBER))
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().text_size(12).text_color(t.foreground).child(names[a.address]))
        .child(div().truncate().text_size(10.5).font_light().text_color(t.dim).child(a.space_name || "sin space")))
      .child(div().flex_none().text_size(11).text_color(AMBER).child("responder ›"));
  }

  ahora(t) {
    const list = agents();
    const waiting = pending(list);
    const names = accountNames(list);
    const card = this.card("tabi-now", "今", "ahora", t, waiting.length ? AMBER_SOFT : t.border);
    const review = shared("tabi.review") ?? 0; // finished tasks nobody has looked at (tabi-party counts them)
    if (!waiting.length) card.child(div().text_size(11.5).font_light().text_color(t.dim).child("nada pendiente"));
    for (const a of waiting) card.child(this.answer(a, names, t));
    if (review > 0) {
      card.child(div().id("tabi-review-link").text_size(11.5).text_color(t.accent).cursor_pointer().hover((x) => x.opacity(0.8))
        .on_click(() => openOverlay({ mod: "tabi-review", kind: "dialog", width: 560, height: 640 }))
        .child(`${review} ${review === 1 ? "tarea por revisar" : "tareas por revisar"} ›`));
    }
    return card;
  }

  proyecto(t) {
    const card = this.card("tabi-project", "道", "proyecto", t);
    const g = this.git;
    const line = (text, color) => div().truncate().text_size(11.5).font_light().text_color(color ?? t.muted).child(text);
    if (!g) return card.child(line("leyendo…", t.dim));
    if (!g.repo) return card.child(line("no es un repositorio git", t.dim));
    const now = Date.now();
    card.child(h_flex().items_center().gap(6)
      .child(svg("mods/tabi-status/icon-rama.svg").size(13).flex_none().text_color(t.muted))
      .child(div().flex_1().min_w(0).truncate().text_size(12).text_color(t.foreground).child(g.branch)));
    card.child(h_flex().items_baseline().gap(8)
      .child(div().text_size(11.5).font_light().text_color(t.muted).child(filesLabel(g.files)))
      .when(g.files > 0, (el) => el.child(div().text_size(11).text_color(t.ansi2).child(`+${g.add}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${g.del}`))));
    card.child(line(g.last ? `último commit ${agoShort(g.last.at, now)}` : "sin commits", t.dim));
    card.child(g.ahead == null ? line("sin rama remota", t.dim)
      : g.ahead > 0 ? line(`↑ ${g.ahead} sin subir`, AMBER) : line("todo subido", t.dim));
    return card;
  }

  button(id, label, onClick, t) {
    return div().id(id).flex_1().min_w(64).h(28).flex().items_center().justify_center().border(0.5).border_color(t.input).bg(t.raised)
      .text_size(11.5).text_color(t.muted).cursor_pointer().hover((x) => x.bg(t.hover).text_color(t.foreground)).on_click(onClick).child(label);
  }

  /** Reads what the gear saved; called again when tabi-launch says it changed ("tabi.launch.rev"). */
  loadPrefs(cx) {
    cx.spawn(async (cx) => {
      try { this.prefs = parsePrefs(await fs.readFile(`${appHome()}/data/tabi/launch.json`, "utf8")); } catch { this.prefs = {}; }
      cx.notify();
    });
  }

  /** What "+ <agent>" runs: its command with the model and effort chosen for it. */
  argvFor(key, argv) {
    return launchArgv(key, argv, this.prefs);
  }

  /** A start button with its gear (model and effort); the gear is lit when something is chosen, and the tooltip says what. */
  startButton(id, key, name, argv, space, t) {
    const chosen = this.prefs[key];
    return h_flex().flex_1().min_w(0).gap(2)
      .child(div().id(id).flex_1().min_w(0).h(28).flex().items_center().justify_center().border(0.5).border_color(t.input).bg(t.raised)
        .text_size(11.5).text_color(t.muted).cursor_pointer().hover((x) => x.bg(t.hover).text_color(t.foreground))
        .tooltip(chosen ? `${name} · ${summary(chosen)}` : name)
        .on_click(() => run("tab.new", { space, argv: this.argvFor(key, argv) })).child(div().truncate().child(`+ ${name}`)))
      .child(div().id(`${id}-gear`).w(24).flex_none().h(28).flex().items_center().justify_center().border(0.5).border_color(chosen ? t.accent : t.input).bg(t.raised)
        .text_size(12).text_color(chosen ? t.accent : t.dim).cursor_pointer().hover((x) => x.bg(t.hover).text_color(t.foreground))
        .tooltip("Modelo y esfuerzo")
        .on_click(() => openOverlay({ mod: "tabi-launch", kind: "dialog", width: 460, height: 600, props: { key, name } })).child("⚙"));
  }

  /** Extra Claude accounts (wrappers that set CLAUDE_CONFIG_DIR), as tabi-usage publishes them. */
  extraAccounts() {
    return (shared("tabi.accounts") ?? []).filter((a) => !a.default);
  }

  iniciar(t) {
    const space = location().space;
    const cells = [
      this.startButton("start-claude", "claude", "claude", ["claude"], space, t),
      ...this.extraAccounts().map((a) => this.startButton(`start-${a.name}`, `account-${a.name}`, a.name, [a.bin], space, t)),
      this.startButton("start-codex", "codex", "codex", ["codex"], space, t),
      this.button("start-changes", "cambios", () => { run("layout.select", { stack: "panel-body", child: "changes" }); run("layout.show", { id: "panel" }); }, t),
    ];
    // Two cells a row, all the same width (an odd one out leaves an empty cell), so the grid is even whatever the number of accounts.
    const lines = Array.from({ length: Math.ceil(cells.length / 2) }, (_, i) => cells.slice(i * 2, i * 2 + 2));
    return this.card("tabi-start", "始", "iniciar", t)
      .child(v_flex().gap(6).children(lines.map((row) => h_flex().gap(6).children(row.length === 2 ? row : [...row, div().flex_1().min_w(0)]))));
  }

  /** The one-row version: counts and the two start buttons; the label opens the full panel in a popup. */
  compactRow(t) {
    const g = this.git;
    const waiting = pending(agents()).length;
    const space = location().space;
    const small = (text, color) => div().flex_none().text_size(10).text_color(color ?? t.muted).child(text);
    const mini = (id, label, key, argv) => div().id(id).flex_none().h(20).px(4).flex().items_center().border(0.5).border_color(t.input).bg(t.raised)
      .text_size(10).text_color(t.muted).cursor_pointer().hover((x) => x.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(() => run("tab.new", { space, argv: this.argvFor(key, argv) })).child(label);
    return h_flex().id("tabi-panel-compact").h(COMPACT_H).flex_none().items_center().gap(4).px(8).cursor_pointer()
      .hover((x) => x.bg(t.hover)).on_click(() => this.openFull())
      .child(h_flex().flex_1().min_w(0).items_center().gap(4).overflow_hidden()
        .child(small(`今 ${waiting}`, waiting ? AMBER : t.muted))
        .child(small("·", t.dim))
        .child(small(g?.repo ? `道 ${g.files}` : "道 —"))
        .when(g?.repo && g.files > 0, (el) => el.child(small(`+${g.add}`, t.ansi2)).child(small(`−${g.del}`, t.ansi1))))
      .child(small("始", t.muted))
      .child(mini("compact-claude", "+claude", "claude", ["claude"]))
      .children(this.extraAccounts().map((a) => mini(`compact-${a.name}`, `+${a.name.replace(/^claude/, "c")}`, `account-${a.name}`, [a.bin])))
      .child(mini("compact-codex", "+codex", "codex", ["codex"]));
  }

  render(cx) {
    if (keyOf() !== this.key) this.refresh(cx);
    const rev = shared("tabi.launch.rev") ?? 0; // reading it re-renders this copy when the gear saved something
    if (rev !== this.prefsRev) { this.prefsRev = rev; this.loadPrefs(cx); }
    const t = theme();
    const root = v_flex().id("tabi-panel").size_full().bg(t.chrome).border_t(0.5).border_color(t.border).overflow_hidden().justify_end()
      .on_size_change((size) => { this.outerH = Math.round(size.height); });
    if (this.compact && !this.popup) return root.child(this.compactRow(t));
    // Natural height measured here, so the controller knows how much room the full panel needs.
    return root.child(v_flex().id("tabi-panel-body").flex_none().w_full().gap(8).p(10)
      .on_size_change((size, cx) => { const h = Math.ceil(size.height); if (h !== this.natural) { this.natural = h; if (!this.popup) this.control(cx); } })
      .child(this.ahora(t)).child(this.proyecto(t)).child(this.iniciar(t)));
  }
}
