// tabi-task: "Asignar tarea…" of the "+" menu. A dialog to give a task to an agent: what to do, which agent runs it (Claude Code, a
// second account, Codex...) and which character it is. Confirming opens a tab named after the character, in the current folder,
// with the agent running and the task as its first message (tab.new {name, space, folder, argv, task}). The character is passed
// to tabi-party (shared "tabi.next-portrait") so the agent that appears wears that portrait.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { run, props, closeOverlay, theme, knownAgents, shared, setShared, checking } from "herdr";
import { agentChoices, characterChoices, rows, buildLaunch } from "./lib.js";

const PORTRAIT = 34;
const PER_ROW = 5;

export default class TabiTask extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.task = "";
    this.agent = null; // the chosen agent's key; the first one until the person picks
    this.character = null; // the chosen portrait's file; null = whoever comes (automatic)
    this.known = [];
    this.failed = false;
    this.input = InputState.new({ value: "" });
    this.input.on("change", (_e, cx) => { this.task = this.input.value(); cx.notify(); });
    this.input.on("submit", () => this.submit());
    this.inputFocused = true;
    this.input.on("focus", (_e, cx) => { this.inputFocused = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.inputFocused = false; cx.notify(); });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
    if (checking()) return;
    cx.spawn(async (cx) => {
      try { this.known = await knownAgents({ on: p.machine ?? null }); } catch { this.failed = true; }
      cx.notify();
    });
  }

  choices() {
    return agentChoices(this.known, shared("tabi.accounts"));
  }

  submit() {
    const p = props() ?? {};
    const choices = this.choices();
    const agent = choices.find((a) => a.key === this.agent) ?? choices[0];
    const character = characterChoices(shared("tabi.portraits")).find((c) => c.file === this.character) ?? null;
    const launch = buildLaunch({ task: this.task, agent, character, space: p.space, folder: p.folder });
    if (!launch) return;
    if (launch.portrait) setShared("tabi.next-portrait", { file: launch.portrait, at: Date.now() });
    closeOverlay(p.overlay);
    run(launch.command, launch.args);
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay((props() ?? {}).overlay); cx.stop_propagation(); }
  }

  chip(id, label, selected, onClick, t) {
    return h_flex().id(id).h(28).px(11).items_center().rounded(14).flex_none().cursor_pointer()
      .border_1().border_color(selected ? t.accent : t.input).bg(selected ? t.selected : t.raised)
      .text_size(12).text_color(selected ? t.foreground : t.muted)
      .hover((s) => s.opacity(0.88)).on_click(onClick).child(label);
  }

  /** A character: its round portrait over a name; the selected one has a ring and a brighter name. */
  face(c, selected, t, onClick) {
    const portrait = div().relative().w(PORTRAIT).h(PORTRAIT).flex_none().rounded_full().bg(t.raised)
      .flex().items_center().justify_center()
      .border_1().border_color(selected ? t.accent : t.popover)
      .child(c.thumb ? image(c.thumb).w(PORTRAIT).h(PORTRAIT) : svg("mods/tabi-party/person.svg").size(18).text_color(t.dim))
      .when(Boolean(c.thumb), (el) => el.child(svg("mods/tabi-party/circle-mask.svg").absolute().top(0).left(0).w(PORTRAIT).h(PORTRAIT).text_color(t.popover)));
    return v_flex().id(`face-${c.file ?? "auto"}`).items_center().gap(4).w(64).flex_none().cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(onClick)
      .child(portrait)
      .child(div().w_full().truncate().text_size(11).text_color(selected ? t.foreground : t.dim).child(c.name));
  }

  button(id, text, primary, action, t) {
    return h_flex().id(id).h(32).px(14).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(action).child(text);
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    const label = (text) => div().pt(14).pb(6).text_size(11.5).text_color(t.dim).child(text);
    const choices = this.choices();
    const chosen = choices.find((a) => a.key === this.agent) ?? choices[0];
    const characters = characterChoices(shared("tabi.portraits"));
    const where = String(p.folder ?? "").split(/[\\/]/).filter(Boolean).pop();
    const faces = [{ file: null, name: "Al azar", thumb: null }, ...characters];
    const agentRows = rows(choices, 3);
    const faceRows = rows(faces, PER_ROW);
    return v_flex().id("tabi-task").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().min_h(0).p(18).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center()
        .child(div().flex_1().text_size(15).font_semibold().child("Asignar tarea"))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(label("¿Qué hay que hacer?"))
      .child(Input.new(this.input).h(36).px(10).rounded(9).border_1().border_color(this.inputFocused ? t.accent : t.input).bg(t.background).text_size(12.8).text_color(t.foreground))
      .child(div().pt(6).text_size(11.5).text_color(t.dim).child(where ? `Se abre en «${where}». Sin texto, solo abre el agente.` : "Sin texto, solo abre el agente."))
      .child(label("Agente"))
      .children(choices.length
        ? agentRows.map((row, r) => h_flex().gap(8).pb(r < agentRows.length - 1 ? 8 : 0)
          .children(row.map((a) => this.chip(`agent-${a.key}`, a.name, chosen?.key === a.key, (_e, cx) => { this.agent = a.key; cx.notify(); }, t))))
        : [div().text_size(11.5).text_color(t.dim).child(this.failed ? "No se pudo comprobar qué agentes hay instalados" : "Buscando agentes…")])
      .child(label("Personaje"))
      .children(faceRows.map((row, r) => h_flex().gap(4).pb(r < faceRows.length - 1 ? 8 : 0)
        .children(row.map((c) => this.face(c, (c.file ?? null) === this.character, t, (_e, cx) => { this.character = c.file ?? null; cx.notify(); })))))
      .child(h_flex().pt(20).gap(8).justify_end()
        .child(this.button("task-cancel", "Cancelar", false, () => closeOverlay(p.overlay), t))
        .child(this.button("task-go", "Lanzar", true, () => this.submit(), t)));
  }
}
