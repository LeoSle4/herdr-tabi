// tabi-status: the bottom bar. Arrow-shaped segments (SVG triangles; the engine has no clip-path), each with a
// subtle fill, a 0.5 px border and an icon: este equipo › rama › agentes N. On the right: the background tag
// ("fondo 4/10", click for another picture for this space) and the command palette key.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, spaces, focused, theme, shared, machines, run } from "herdr";

const H = 28;
const TIP = 10;

export default class TabiStatus extends View {
  init(_props, cx) {
    cx.timer.every(30000, (cx) => cx.notify()); // the minutes until the next background change
  }

  /** One arrow: a filled body with a 0.5 px top and bottom border, then the point (fill + edge line). */
  segment(icon, text, t, first) {
    const fill = t.surface;
    const edge = t.input;
    return h_flex().h(H).items_center().flex_none().when(!first, (el) => el.ml(2))
      .child(h_flex().h(H).items_center().gap(6).pl(first ? 14 : 12).pr(2).bg(fill)
        .border_t(0.5).border_b(0.5).border_color(edge)
        .when(first, (el) => el.border_l(0.5))
        .child(svg(icon).size(13).flex_none().text_color(t.muted))
        .child(div().text_size(11).font_light().text_color(t.muted).child(text)))
      .child(div().relative().w(TIP).h(H).flex_none()
        .child(svg("mods/tabi-status/arrow.svg").absolute().top(0).left(0).w(TIP).h(H).text_color(fill))
        .child(svg("mods/tabi-status/arrow-line.svg").absolute().top(0).left(0).w(TIP).h(H).text_color(edge)));
  }

  render() {
    const t = theme();
    const f = focused();
    const space = spaces().find((s) => s.id === f?.space);
    const machine = space?.machine ? (machines().find((m) => m.name === space.machine)?.name ?? space.machine) : "este equipo";
    const branch = space?.branch || "sin rama";
    const bd = shared("tabi.backdrop");
    const tag = bd?.total && bd.index >= 0 ? `fondo ${bd.index + 1}/${bd.total}` : "sin fondos";
    return h_flex().id("tabi-status").size_full().items_center().justify_between().bg(t.chrome).border_t(0.5).border_color(t.border)
      .child(h_flex().h(H).items_center().pl(6)
        .child(this.segment("mods/tabi-status/icon-equipo.svg", machine, t, true))
        .child(this.segment("mods/tabi-status/icon-rama.svg", branch, t, false))
        .child(this.segment("mods/tabi-status/icon-agentes.svg", `agentes ${agents().length}`, t, false)))
      .child(h_flex().items_center().gap(18).pr(16)
        .child(div().id("tabi-backdrop-tag").text_size(11).font_light().text_color(t.muted).hover((s) => s.text_color(t.foreground))
          .on_click(() => run("tabi-backdrop.next")).child(tag))
        .child(div().text_size(11).font_light().text_color(t.dim).child("⌘⇧P comandos")));
  }
}
