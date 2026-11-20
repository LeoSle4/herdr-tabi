// tabi-toast: how notifications look. When a notification is about an agent (its click action targets one), it is drawn as that
// agent's card: round portrait, the character's name and space, the status kanji (済 finished, 待 waiting) and a line like a bot
// message: "terminó: <first line of its final answer>" or "te espera: <what it asks>", with an accent strip in the status color.
// The text comes from the Claude Code hook (tools/tabi_subagents.py: Stop and Notification); Codex agents show just the status. Anything else (a login prompt, an error, a plain toast) keeps Herdr's own look.
// Chosen in layouts/tabi.json with "toast": "tabi-toast". The portrait and the name come from what tabi-party publishes.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import * as fs from "fs/promises";
import { props, closeOverlay, run, theme, agents, shared, home, checking } from "herdr";
import { agentOf, look, subline, parseSaid, saidFor } from "./lib.js";

const PORTRAIT = 34;
const TRIES = 12; // the text can land a few seconds after the toast opens (a permission prompt is reported about 6 s late)
const saidDir = (address) => `${home()}/.local/state/tabi/subagents/${address}`;
const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };

export default class TabiToast extends View {
  init(_props, cx) {
    this.said = "";
    this.tries = 0;
    this.openedAt = Date.now();
    if (checking()) return;
    const agent = agentOf((props() ?? {}).action, agents());
    if (!agent || agent.address.includes("/")) return; // another machine's hook writes on that machine
    this.address = agent.address;
    cx.spawn(async (cx) => { await this.loadSaid(cx); });
    cx.timer.every(1000, (cx) => { if (!this.said && ++this.tries <= TRIES) cx.spawn(async (cx) => { await this.loadSaid(cx); }); });
  }

  async readSaid(file) {
    try { return parseSaid(await fs.readFile(`${saidDir(this.address)}/${file}`, "utf8")); } catch { return null; }
  }

  async loadSaid(cx) {
    const [stop, notification] = await Promise.all([this.readSaid("_stop.json"), this.readSaid("_notification.json")]);
    const status = agents().find((a) => a.address === this.address)?.status;
    const said = saidFor(status, stop, notification, this.openedAt);
    if (said !== this.said) { this.said = said; cx.notify(); }
  }

  /** Clicking runs the notification's action (go to the agent) and dismisses it. */
  go(p) {
    if (p.action?.name) run(p.action.name, p.action.args ?? {});
    closeOverlay(p.overlay);
  }

  card(p, agent, t) {
    const who = shared("tabi.party")?.[agent.address];
    const name = who?.name ?? agent.program?.name ?? "agente";
    const l = look(agent.status);
    const accent = t[l.color] ?? t.accent;
    const portrait = div().relative().w(PORTRAIT).h(PORTRAIT).flex_none().rounded_full().bg(t.raised)
      .flex().items_center().justify_center()
      .child(who?.thumb ? image(who.thumb).w(PORTRAIT).h(PORTRAIT) : svg("mods/tabi-party/person.svg").size(20).text_color(t.dim))
      .when(Boolean(who?.thumb), (el) => el.child(svg("mods/tabi-party/circle-mask.svg").absolute().top(0).left(0).w(PORTRAIT).h(PORTRAIT).text_color(t.popover)));
    return div().id("toast").relative().size_full().bg(t.popover).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click(() => this.go(p))
      .child(div().absolute().top(0).left(0).w(3).h_full().bg(accent))
      .child(h_flex().h_full().items_center().gap(12).pl(17).pr(18)
        .child(portrait)
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(h_flex().justify_between().items_baseline().gap(8)
            .child(h_flex().flex_1().min_w(0).items_baseline().gap(6)
              .child(div().flex_none().font_semibold().text_size(13).text_color(t.foreground).child(name))
              .child(div().truncate().text_size(11).font_light().text_color(t.dim).child(agent.space_name ?? "")))
            .child(div().flex_none().text_size(14).text_color(accent).child(l.kanji)))
          .child(div().id("toast-said").truncate().text_size(11.5).font_light().text_color(t.muted)
            .when(Boolean(this.said), (el) => el.tooltip(this.said)).child(subline(l.label, this.said)))));
  }

  /** Herdr's own look, kept for everything that is not about an agent (including its "needs login" prompt with a copy button). */
  plain(p, t) {
    const login = /^([a-z0-9][a-z0-9_.-]{0,31}) needs login; run hc machine login \1$/.exec(p.body ?? "");
    const command = login ? `hc machine login ${login[1]}` : null;
    return h_flex().id("toast").size_full().px(18).gap(12).items_center().bg(t.popover).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click(() => this.go(p))
      .child(p.icon ? image(p.icon).w(18).h(18).flex_none() : div().size(8).rounded(4).flex_none().bg(t[DOT[p.level] ?? "accent"]))
      .child(v_flex().flex_1().overflow_hidden()
        .child(div().truncate().font_semibold().text_size(13).text_color(t.foreground).child(login ? `${login[1]} needs a login: run` : p.title ?? ""))
        .when(!login && Boolean(p.body), (el) => el.child(div().truncate().text_size(12).text_color(t.muted).child(p.body ?? "")))
        .when(Boolean(login), (el) => el.child(h_flex().gap(8).items_center()
          .child(div().flex_1().min_w(0).truncate().tooltip(command).text_size(12).text_color(t.muted).child(command))
          .child(div().id("toast-login-copy").flex_none().px(6).py(3).rounded(4).bg(t.raised)
            .text_size(12).text_color(t.foreground).cursor_pointer().hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => { cx.stop_propagation(); cx.write_to_clipboard(command); this.copied = true; cx.notify(); })
            .child(this.copied ? "Copied" : "Copy")))));
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    const agent = agentOf(p.action, agents());
    return agent ? this.card(p, agent, t) : this.plain(p, t);
  }
}
