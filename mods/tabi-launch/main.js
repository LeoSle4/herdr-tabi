// tabi-launch: the model and the effort an agent starts with. The gear next to "+ claude", "+ claude2" and "+ codex" in the panel opens
// this dialog for that agent (props: { key, name }); what is chosen is kept per agent in data/tabi/launch.json, and the start buttons and
// "Asignar tarea…" launch with it (--model/--effort for Claude, -m/-c model_reasoning_effort for Codex). The models and levels of Codex come
// from its own ~/.codex/models_cache.json. With props.mode "switch" (the ⇄ on the card of a Claude agent) it instead types `/model <model>` or
// `/effort <level>` into that running agent (props: { key, name, pane }); the person presses Enter there.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import * as fs from "fs/promises";
import { props, closeOverlay, theme, appHome, home, shared, setShared, checking, exec, run, notify, window as herdrWindow } from "herdr";
import { familyOf, optionsFor, parseCodexModels, parsePrefs, setChoice, summary, slashCommand, switchSession, canSwitch } from "./lib.js";

const MODELS_PER_ROW = 3;
const EFFORTS_PER_ROW = 4;

const rows = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
const prefsFile = () => `${appHome()}/data/tabi/launch.json`;

export default class TabiLaunch extends View {
  init(_p, cx) {
    const p = props() ?? {};
    this.key = p.key;
    this.switching = p.mode === "switch"; // type a command into a running agent instead of choosing what the next one starts with
    this.pane = p.pane;
    this.address = p.address;
    this.status = p.status;
    this.title = p.name ?? p.key;
    this.codex = [];
    this.prefs = {};
    this.model = null;
    this.effort = null;
    this.handle = cx.focus_handle();
    if (checking()) return;
    cx.spawn(async (cx) => {
      try { this.prefs = parsePrefs(await fs.readFile(prefsFile(), "utf8")); } catch { /* nothing saved yet */ }
      if (familyOf(this.key) === "codex") await this.loadCodex(cx);
      if (!this.switching) { // what the next agent starts with; a running one starts from nothing chosen
        this.model = this.prefs[this.key]?.model ?? null;
        this.effort = this.prefs[this.key]?.effort ?? null;
      }
      cx.notify();
    });
  }

  /**
   * Codex rewrites its models file now and then: a read in the middle of that gives half a JSON, so an empty list is tried again a
   * couple of times before giving up.
   */
  async loadCodex(cx) {
    for (let i = 0; i < 3; i++) {
      try { this.codex = parseCodexModels(await fs.readFile(`${home()}/.codex/models_cache.json`, "utf8")); } catch { this.codex = []; }
      if (this.codex.length) return;
      await new Promise((resolve) => cx.timer.after(700, resolve));
    }
  }

  options() {
    return optionsFor(this.key, this.codex);
  }

  /** Picking a model keeps the level only if that model supports it. */
  pickModel(id) {
    this.model = id;
    if (this.effort && !this.options()?.effortsOf(id).includes(this.effort)) this.effort = null;
  }

  save(cx) {
    const next = setChoice(this.prefs, this.key, { model: this.model, effort: this.effort });
    (async () => {
      try {
        await fs.mkdir(`${appHome()}/data/tabi`, { recursive: true });
        await fs.writeFile(prefsFile(), JSON.stringify(next));
        setShared("tabi.launch.rev", (shared("tabi.launch.rev") ?? 0) + 1); // the panel reads it again
      } catch { /* the choice is only kept for this window then */ }
    })();
    closeOverlay((props() ?? {}).overlay);
  }

  /** Types /model or /effort into the running agent (the dialog closes first, so the agent is what is in front). */
  apply(kind, cx) {
    const text = slashCommand(kind, kind === "model" ? this.model : this.effort);
    if (!text) return;
    const pane = this.pane;
    closeOverlay((props() ?? {}).overlay);
    const wait = (ms) => new Promise((resolve) => cx.timer.after(ms, resolve));
    cx.spawn(async () => {
      const r = await switchSession({ exec, run, wait }, { pane, text, platform: herdrWindow()?.platform });
      if (!r.ok) notify({ title: "No pude escribir en el agente", body: r.error, level: "error" });
    });
  }

  key_(e, cx) {
    if (e.key === "escape") { closeOverlay((props() ?? {}).overlay); cx.stop_propagation(); }
  }

  section(kanji, text, t) {
    return h_flex().pt(16).pb(8).gap(6).items_baseline()
      .child(div().text_size(12).text_color(t.muted).child(kanji))
      .child(div().text_size(12).font_light().text_color(t.dim).child(`· ${text}`));
  }

  chip(id, label, selected, onClick, t) {
    return h_flex().id(id).flex_1().min_w(0).h(32).px(8).items_center().justify_center().rounded(9).cursor_pointer()
      .border_1().border_color(selected ? t.accent : t.border).bg(selected ? t.selected : t.surface)
      .text_size(12).text_color(selected ? t.foreground : t.muted)
      .hover((s) => s.opacity(0.88)).on_click(onClick)
      .child(div().truncate().child(label));
  }

  button(id, text, primary, action, t) {
    return h_flex().id(id).flex_1().h(36).items_center().justify_center().rounded(9)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(action).child(text);
  }

  /** A grid of chips: every row has the same number of cells, so they keep their width. */
  grid(prefix, items, perRow, isOn, pick, t) {
    const lines = rows(items, perRow);
    const pad = (row) => [...row, ...Array.from({ length: perRow - row.length }, () => null)];
    return v_flex().gap(8).children(lines.map((row) => h_flex().gap(8).children(pad(row).map((it) => it
      ? this.chip(`${prefix}-${it.id ?? "default"}`, it.name, isOn(it), (_e, cx) => { pick(it); cx.notify(); }, t) : div().flex_1().min_w(0)))));
  }

  render() {
    const t = theme();
    const o = this.options();
    const models = o ? (this.switching ? o.models : [{ id: null, name: "Por defecto" }, ...o.models]) : [];
    const gate = this.switching ? canSwitch({ key: this.key, platform: herdrWindow()?.platform, address: this.address, status: this.status }) : { ok: true };
    const levels = o ? o.effortsOf(this.model).map((e) => ({ id: e, name: e })) : [];
    const efforts = this.switching ? levels : o ? [{ id: null, name: "Por defecto" }, ...levels] : [];
    return v_flex().id("tabi-launch").track_focus(this.handle).on_key_down((e, cx) => this.key_(e, cx))
      .w_full().min_h(0).px(20).pt(18).pb(20).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center()
        .child(h_flex().flex_1().gap(10).items_baseline()
          .child(div().text_size(18).text_color(t.muted).child("調"))
          .child(div().text_size(15).font_semibold().child(this.switching ? "Cambiar en la sesión" : "Modelo y esfuerzo")))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(div().pt(6).text_size(11).font_light().text_color(t.dim).child(this.switching ? this.title : `${this.title} · ${summary({ model: this.model, effort: this.effort })}`))
      .child(v_flex().pt(12).child(div().h(0.5).w_full().bg(t.border)))
      .when(!o, (el) => el.child(div().pt(16).text_size(11.5).font_light().text_color(t.dim).child("Este agente no tiene opciones de modelo.")))
      .when(!gate.ok, (el) => el.child(div().pt(16).text_size(11.5).font_light().text_color("#d9a441").child(gate.reason)))
      .when(Boolean(o) && gate.ok, (el) => el
        .child(this.section("型", "modelo", t))
        .child(o.models.length
          ? this.grid("model", models, MODELS_PER_ROW, (m) => (m.id ?? null) === this.model, (m) => this.pickModel(m.id ?? null), t)
          : div().text_size(11.5).font_light().text_color(t.dim).child("No encontré la lista de modelos de Codex (~/.codex/models_cache.json)."))
        .child(this.section("力", "esfuerzo", t))
        .child(this.grid("effort", efforts, EFFORTS_PER_ROW, (e) => (e.id ?? null) === this.effort, (e) => { this.effort = e.id ?? null; }, t))
        .child(div().pt(12).text_size(11).font_light().text_color(t.dim).child(this.switching
          ? "Escribe el comando en el agente y tú pulsas Enter allí. Tu portapapeles se restaura."
          : "Vale para lo que inicies con «+» y con Asignar tarea…; para una sesión abierta usa el ⇄ de su carta.")))
      .child(this.switching && !gate.ok
        ? v_flex().pt(18).child(this.button("launch-cancel", "Cerrar", false, () => closeOverlay((props() ?? {}).overlay), t))
        : this.switching
        ? v_flex().pt(18).gap(10)
          .child(h_flex().gap(10)
            .child(this.button("launch-model", this.model ? `Escribir /model ${this.model}` : "Elige un modelo", Boolean(this.model), (_e, cx) => this.apply("model", cx), t))
            .child(this.button("launch-effort", this.effort ? `Escribir /effort ${this.effort}` : "Elige un esfuerzo", Boolean(this.effort), (_e, cx) => this.apply("effort", cx), t)))
          .child(this.button("launch-cancel", "Cancelar", false, () => closeOverlay((props() ?? {}).overlay), t))
        : h_flex().pt(18).gap(10)
          .child(this.button("launch-cancel", "Cancelar", false, () => closeOverlay((props() ?? {}).overlay), t))
          .child(this.button("launch-save", "Guardar", true, (_e, cx) => this.save(cx), t)));
  }
}
