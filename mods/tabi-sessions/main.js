// tabi-sessions: the Claude and Codex sessions in two sections that share the sidebar's height. Each section folds
// with ▾/▸ in its header, and so does each group (Fijadas and Hoy start open; Últimos 7 días and Anteriores closed).
// The folding is remembered in data/tabi/ui.json. The magnifier in a header shows or hides that section's search.
// Data: sessions.py (read-only). Pins are this mod's own list (data/tabi/pins.json), shown with an amber ★.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import * as fs from "fs/promises";
import { exec, appHome, run, notify, theme, props, shared, setShared, checking, watchFolder, window as herdrWindow } from "herdr";
import { accountTag, accountArgs, filterSessions, groupSessions, resumeArgv, ago, folderName, sectionOpen, groupOpen, withSection, withGroup } from "./lib.js";

const SECTION_H = 35; // a folded section: its 34 px header and the 1 px line above it
const SEARCH_H = 32; // the search box row of an open section
const TITLES = { claude: "Sesiones de Claude", codex: "Sesiones de Codex" };
const AMBER = "#d9a441";
const dataDir = () => `${appHome()}/data/tabi`;
const uiFile = () => `${dataDir()}/ui.json`;
const pinsFile = () => `${dataDir()}/pins.json`;

// One python run serves every copy of this mod.
let inflight = null;
let last = { at: 0, data: null };
function readSessions(force) {
  // The extra Claude accounts (published by tabi-usage) are read too; a change in them forces a new reading.
  const extra = accountArgs(shared("tabi.accounts"));
  const key = extra.join("|");
  if (!force && last.data && last.key === key && Date.now() - last.at < 5000) return Promise.resolve(last.data);
  if (inflight) return inflight;
  const py = herdrWindow().platform === "windows" ? "python" : "python3";
  inflight = exec(py, ["-X", "utf8", `${appHome()}/mods/tabi-sessions/sessions.py`, appHome(), ...extra], { timeout: 25000 })
    .then((r) => {
      if (r.code !== 0) throw new Error((r.stderr || "").trim().split("\n").pop() || `python exited with ${r.code}`);
      last = { at: Date.now(), key, data: JSON.parse(r.stdout) };
      return last.data;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return fallback; }
}
async function writeJson(file, value) {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value));
}
async function readPins() {
  const p = await readJson(pinsFile(), {});
  return { claude: Array.isArray(p.claude) ? p.claude : [], codex: Array.isArray(p.codex) ? p.codex : [] };
}

export default class TabiSessions extends View {
  init(_props, cx) {
    this.agents = props()?.agents ?? ["claude", "codex"];
    this.data = { claude: [], codex: [] };
    this.errors = { claude: null, codex: null };
    this.loading = true;
    this.ui = {};
    this.query = { claude: "", codex: "" };
    this.nat = {}; // natural list height of each open section
    this.searching = { claude: false, codex: false };
    this.inputs = {};
    for (const a of this.agents) this.makeInput(a);
    if (checking()) return;
    cx.spawn(async (cx) => { this.ui = await readJson(uiFile(), {}); this.publishNeed(); cx.notify(); });
    this.reload(cx, false);
    cx.timer.every(60000, (cx) => this.reload(cx, false));
    // The folding file may change from outside (another copy, or by hand): follow it.
    cx.spawn(async (cx) => {
      await fs.mkdir(dataDir(), { recursive: true });
      for (;;) {
        this.watch = watchFolder(dataDir());
        const changed = await this.watch;
        if (!changed.length) return; // cancelled on close
        if (changed.some((p) => p.endsWith("ui.json") || p === dataDir())) { this.ui = await readJson(uiFile(), {}); this.publishNeed(); cx.notify(); }
      }
    });
  }

  async close() {
    this.watch?.cancel();
  }

  makeInput(agent) {
    const input = InputState.new({ placeholder: "Buscar…" });
    input.on("change", (_e, cx) => { this.query[agent] = input.value(); cx.notify(); });
    this.inputs[agent] = input;
  }

  reload(cx, force) {
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        if (!shared("tabi.pins")) setShared("tabi.pins", await readPins());
        const data = await readSessions(force);
        for (const a of this.agents) { this.data[a] = data[a] ?? []; this.errors[a] = data[`${a}_error`]; }
      } catch (e) {
        for (const a of this.agents) this.errors[a] = String(e?.message ?? e);
      }
      this.loading = false;
      cx.notify();
    });
  }

  /** The height the block would like: every header plus, for open sections, their search row and natural list.
   *  Published for tabi-panel, which shares the sidebar's height between the sessions and itself. */
  publishNeed() {
    let need = 0;
    for (const a of this.agents) {
      need += SECTION_H;
      if (sectionOpen(this.ui, a)) need += (this.searching[a] ? SEARCH_H : 0) + (this.nat[a] ?? 0);
    }
    need = Math.ceil(need);
    if (shared("tabi.sessions.need") !== need) setShared("tabi.sessions.need", need);
  }

  /** A section's list was measured at its natural height (what it would take with no limit). */
  measure(agent, height, cx) {
    const h = Math.ceil(height);
    if (this.nat[agent] === h) return;
    this.nat[agent] = h;
    this.publishNeed();
    cx.notify();
  }

  setUi(ui, cx) {
    this.ui = ui;
    this.publishNeed();
    cx.notify();
    cx.spawn(async () => { try { await writeJson(uiFile(), ui); } catch (e) { notify({ title: "No se pudo guardar el plegado", body: String(e?.message ?? e), level: "error" }); } });
  }

  toggleSearch(agent, cx) {
    this.searching[agent] = !this.searching[agent];
    if (this.searching[agent]) cx.timer.after(60, () => this.inputs[agent].focus());
    else { this.query[agent] = ""; this.makeInput(agent); }
    this.publishNeed();
    cx.notify();
  }

  togglePin(agent, id, cx) {
    const all = { claude: [], codex: [], ...(shared("tabi.pins") ?? {}) };
    const mine = new Set(all[agent]);
    mine.has(id) ? mine.delete(id) : mine.add(id);
    all[agent] = [...mine];
    setShared("tabi.pins", all);
    cx.spawn(async () => { try { await writeJson(pinsFile(), all); } catch (e) { notify({ title: "No se pudo guardar la fijada", body: String(e?.message ?? e), level: "error" }); } });
  }

  resume(agent, s) {
    if (!s.folder) return notify({ title: "La carpeta ya no existe", body: s.cwd, level: "warning" });
    const acc = s.account ? (shared("tabi.accounts") ?? []).find((a) => a.name === s.account) : null;
    run("tab.new", { name: s.title.slice(0, 40), folder: s.cwd, argv: resumeArgv(agent, s.id, acc?.bin ?? null) });
  }

  row(agent, s, pinned, now, t) {
    const star = div().id(`pin-${agent}-${s.id}`).w(20).flex_none().text_size(13).text_color(pinned ? AMBER : t.dim).child(pinned ? "★" : "☆")
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => this.togglePin(agent, s.id, cx));
    return h_flex().id(`row-${agent}-${s.id}`).items_center().gap(4).pl(14).pr(10).py(4).flex_none()
      .hover((x) => x.bg(t.hover)).on_click(() => this.resume(agent, s))
      .child(star)
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().text_size(12.5).text_color(s.folder ? t.foreground : t.dim).child(s.title))
        .child(h_flex().items_center().gap(5).min_w(0)
          .when(Boolean(accountTag(s.account)), (el) => el.child(div().flex_none().px(4).rounded(3).border(0.5).border_color(t.input).text_size(9.5).text_color(t.muted).child(accountTag(s.account))))
          .child(div().flex_1().min_w(0).truncate().text_size(10.5).font_light().text_color(t.dim).child(`${folderName(s.cwd)} · ${ago(s.last, now)}${s.folder ? "" : " · carpeta no encontrada"}`))));
  }

  section(agent, t, now) {
    const open = sectionOpen(this.ui, agent);
    const total = this.data[agent].length;
    const icon = (id, child, onClick) => div().id(id).w(22).h(22).flex_none().items_center().justify_center()
      .hover((x) => x.bg(t.hover)).rounded(4)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click(onClick).child(child);
    const head = h_flex().id(`head-${agent}`).h(34).flex_none().items_center().gap(6).pl(12).pr(8)
      .hover((x) => x.bg(t.hover))
      .on_click((_e, cx) => this.setUi(withSection(this.ui, agent, !open), cx))
      .child(div().w(10).text_size(11).text_color(t.muted).child(open ? "▾" : "▸"))
      .child(div().flex_1().truncate().text_size(12).font_light().text_color(t.foreground).child(`${TITLES[agent]} · ${total}`))
      .when(open, (el) => el
        .child(icon(`find-${agent}`, svg("mods/tabi-sessions/search.svg").size(13).text_color(this.searching[agent] ? AMBER : t.dim), (_e, cx) => this.toggleSearch(agent, cx)))
        .child(icon(`reload-${agent}`, div().text_size(13).text_color(this.loading ? t.input : t.dim).child("↺"), (_e, cx) => this.reload(cx, true))));
    const box = v_flex().id(`section-${agent}`).border_t_1().border_color(t.border).overflow_hidden();
    if (!open) return box.flex_none().child(head);
    // Natural height when it fits (grow 0), shrinking with a scrolling list when the sidebar is short.
    box.flex_initial().min_h(SECTION_H).child(head);
    if (this.searching[agent]) {
      box.child(div().px(12).pb(6).flex_none()
        .child(Input.new(this.inputs[agent]).h(26).px(8).rounded(6).border_1().border_color(t.input).bg(t.background).text_size(12).text_color(t.foreground)));
    }
    const q = this.query[agent];
    const pins = new Set(shared("tabi.pins")?.[agent] ?? []);
    const groups = groupSessions(filterSessions(this.data[agent], q), pins, now);
    const list = v_flex().flex_none().w_full().pb(8).on_size_change((size, cx) => this.measure(agent, size.height, cx));
    for (const g of groups) {
      const gOpen = groupOpen(this.ui, agent, g.key, q.trim() !== "");
      list.child(h_flex().id(`group-${agent}-${g.key}`).h(26).flex_none().items_center().gap(6).pl(12).pr(10)
        .hover((x) => x.bg(t.hover))
        .on_click((_e, cx) => this.setUi(withGroup(this.ui, agent, g.key, !gOpen), cx))
        .child(div().w(10).text_size(10).text_color(t.dim).child(gOpen ? "▾" : "▸"))
        .child(div().text_size(11).text_color(g.key === "pinned" ? AMBER : t.muted).child(g.label))
        .child(div().text_size(11).font_light().text_color(t.dim).child(`· ${g.items.length}`)));
      if (gOpen) for (const s of g.items) list.child(this.row(agent, s, g.key === "pinned", now, t));
    }
    const note = this.errors[agent] ? `No se pudo leer: ${this.errors[agent]}`
      : this.loading && !total ? "Cargando…"
      : !groups.length ? (q.trim() ? "Sin resultados." : "No hay sesiones.") : null;
    if (note) list.child(div().px(14).py(8).text_size(12).text_color(this.errors[agent] ? t.blocked : t.muted).child(note));
    return box.child(div().id(`list-${agent}`).min_h(0).flex_shrink(1).when(this.nat[agent] > 0, (el) => el.h(this.nat[agent])).overflow_y_scrollbar().child(list));
  }

  render() {
    const t = theme();
    const now = Date.now();
    return v_flex().id("tabi-sessions").size_full().bg(t.chrome).overflow_hidden()
      .on_size_change((size) => { const h = Math.round(size.height); if (shared("tabi.sessions.h") !== h) setShared("tabi.sessions.h", h); })
      .children(this.agents.map((a) => this.section(a, t, now)));
  }
}
