// tabi-spaces: "空間 · espacios". One-line rows (28 px): icon, name and, on the right, the branch as a small truncated
// tag plus a dot with the number of agents. A repeated name gets a discreet suffix (PitLane ²); the full path is only
// in the tooltip. Order: the shown space, then those with agents, then the rest. At most 5 rows: with more, the list
// moves by whole rows (wheel) and a soft fade at the edge says there is more. The title folds with ▾/▸ (folded: only
// the shown space); the choice is remembered in data/tabi/spaces-ui.json. The block takes the height it needs.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import * as fs from "fs/promises";
import { spaces, panes, agents, home, run, openOverlay, appHome, theme, layout, checking } from "herdr";
import { displayName, isHome, dotKey, tildePath, ordinals, suffix, orderSpaces, rowWindow, rowsHeight } from "./lib.js";

const AMBER = "#d9a441";
const ROW_H = 28;
const HEADER_H = 38;
const MAX_ROWS = 5;
const FADE_STEPS = 6;
const uiFile = () => `${appHome()}/data/tabi/spaces-ui.json`;

function sizeOf(node, id) {
  if (node?.id === id) return node.size?.px ?? null;
  for (const c of node?.children ?? []) { const r = sizeOf(c, id); if (r !== undefined) return r; }
  return undefined;
}

/** "#161a20" + 0.5 -> "#161a2080" (the fade is the sidebar color with a falling opacity). */
function withAlpha(hex, alpha) {
  return `${hex.slice(0, 7)}${Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, "0")}`;
}

export default class TabiSpaces extends View {
  init(_props, cx) {
    this.open = true;
    this.offset = 0;
    this.acc = 0;
    if (checking()) return;
    cx.spawn(async (cx) => {
      try { this.open = JSON.parse(await fs.readFile(uiFile(), "utf8")).open !== false; } catch { /* first run: open */ }
      cx.notify();
    });
  }

  setOpen(open, cx) {
    this.open = open;
    this.offset = 0;
    cx.notify();
    cx.spawn(async () => {
      try {
        await fs.mkdir(`${appHome()}/data/tabi`, { recursive: true });
        await fs.writeFile(uiFile(), JSON.stringify({ open }));
      } catch { /* the choice is only not remembered */ }
    });
  }

  /** Where the space is now: the folder of its first terminal (its name follows that), else the folder it was made in. */
  where(s) {
    const tabs = new Set((s.tabs ?? []).map((t) => t.id));
    return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd ?? s.folder;
  }

  /** The block takes the height its rows need (layout.resize). Called when the rows are measured, never from render. */
  fit(rows) {
    const px = rowsHeight(rows, ROW_H, HEADER_H);
    const now = sizeOf(layout(), "spaces");
    if (now === undefined || now === px) return; // no such block here, or already that size
    run("layout.resize", { id: "spaces", px });
  }

  /** The wheel moves the list a whole row at a time (a notch, or about 28 px of a smooth swipe). */
  wheel(e, total, cx) {
    const w = rowWindow(total, this.offset, !this.open, MAX_ROWS);
    if (w.rows >= total) return;
    this.acc += e.delta_lines ? e.delta_lines.y * ROW_H : e.delta?.y ?? 0;
    const steps = Math.trunc(this.acc / ROW_H);
    if (!steps) return;
    this.acc -= steps * ROW_H;
    const next = Math.min(Math.max(0, total - w.rows), Math.max(0, this.offset - steps));
    if (next !== this.offset) { this.offset = next; cx.notify(); }
  }

  row(s, ord, t, homeDir, count) {
    const where = this.where(s);
    const dot = dotKey(s.status);
    const branch = s.branch;
    return h_flex().id(`space-${s.id}`).relative().h(ROW_H).flex_none().items_center().gap(8).pl(14).pr(10)
      .when(s.active, (el) => el.bg(t.hover))
      .hover((el) => el.bg(t.hover))
      .tooltip(tildePath(where ?? s.folder, homeDir) || displayName(s, where, homeDir))
      .on_click(() => run("space.select", { id: s.id }))
      .child(div().absolute().top(0).left(0).w(2).h(ROW_H).bg(s.active ? AMBER : "#00000000"))
      .child(svg(isHome(s, where, homeDir) ? "mods/tabi-spaces/house.svg" : "mods/tabi-spaces/folder.svg").size(13).flex_none().text_color(s.active ? t.foreground : t.muted))
      .child(h_flex().flex_1().min_w(0).items_baseline()
        .child(div().truncate().text_size(12.5).text_color(s.active ? t.foreground : t.muted).child(displayName(s, where, homeDir)))
        .when(ord > 1, (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(suffix(ord).trim()))))
      .when(Boolean(branch), (el) => el.child(div().max_w(74).flex_none().truncate().px(5).rounded(4).border(0.5).border_color(t.border).text_size(10).font_light().text_color(t.dim).child(branch)))
      .child(h_flex().items_center().gap(5).flex_none().w(count > 0 ? 24 : 6).justify_end()
        .when(dot, (el) => el.child(div().w(6).h(6).rounded_full().bg(t[dot])))
        .when(count > 0, (el) => el.child(div().text_size(10.5).font_light().text_color(t.dim).child(String(count)))));
  }

  /** A strip over the list's edge: the sidebar color fading out, so a row is never cut without a hint. */
  fade(top, t) {
    const strips = [];
    for (let i = 0; i < FADE_STEPS; i++) {
      strips.push(div().w_full().h(3).bg(withAlpha(t.chrome, top ? 0.95 - (i * 0.95) / FADE_STEPS : (i * 0.95) / FADE_STEPS + 0.12)));
    }
    return v_flex().absolute().left(0).right(0).when(top, (el) => el.top(0)).when(!top, (el) => el.bottom(0)).children(strips);
  }

  render(cx) {
    const t = theme();
    const list = spaces();
    const homeDir = home();
    const live = agents();
    const counts = {};
    for (const a of live) counts[a.space] = (counts[a.space] ?? 0) + 1;
    const ord = ordinals(list);
    const sorted = orderSpaces(list, counts);
    const w = rowWindow(sorted.length, this.offset, !this.open, MAX_ROWS);
    this.offset = w.start;
    const shown = sorted.slice(w.start, w.start + w.rows);
    const body = v_flex().id("tabi-spaces-rows").relative().w_full().h(w.rows * ROW_H).flex_none().overflow_hidden()
      .on_size_change((size) => this.fit(size.height / ROW_H))
      .on_scroll_wheel((e, cx) => this.wheel(e, sorted.length, cx))
      .children(shown.map((s) => this.row(s, ord[s.id], t, homeDir, counts[s.id] ?? 0)))
      .when(w.less, (el) => el.child(this.fade(true, t)))
      .when(w.more, (el) => el.child(this.fade(false, t)));
    return v_flex().id("tabi-spaces").size_full().bg(t.chrome).overflow_hidden()
      .child(h_flex().h(HEADER_H).flex_none().items_center().justify_between().pl(14).pr(10)
        .child(h_flex().id("tabi-spaces-fold").items_center().gap(6).cursor_pointer().on_click((_e, cx) => this.setOpen(!this.open, cx))
          .child(div().w(10).text_size(11).text_color(t.dim).child(this.open ? "▾" : "▸"))
          .child(div().text_size(12).font_light().text_color(t.muted).child("空間 · espacios"))
          .when(!this.open && sorted.length > 1, (el) => el.child(div().text_size(11).font_light().text_color(t.dim).child(String(sorted.length)))))
        .child(div().id("tabi-new-space").px(6).text_size(15).text_color(t.dim).hover((el) => el.text_color(t.foreground)).child("+")
          .on_click(() => openOverlay({ mod: "tabi-space-menu", kind: "popup", width: 250, height: 330 }))))
      .child(body);
  }
}
