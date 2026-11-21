// tabi-launch: the model and the effort an agent starts with. The gear next to "+ claude", "+ claude2" and "+ codex" in the panel opens
// this dialog for that agent (props: { key, name }); what is chosen is kept per agent in data/tabi/launch.json, and the start buttons and
// "Asignar tarea…" launch with it (--model/--effort for Claude, -m/-c model_reasoning_effort for Codex). The models and levels of Codex come
// from its own ~/.codex/models_cache.json. With props.mode "switch" (the ⇄ on the card of a Claude agent) it instead types `/model <model>` or
// `/effort <level>` into that running agent (props: { key, name, pane }); the person presses Enter there. With props.mode "handoff" (the 継 of a
// card that has a task) it opens a tab with another agent in the same space and folder, told to go on with that task (props: { rec, from,
// space, folder, machine }). With props.mode "review" (the same props, opened from the inbox of tabi-review) the agent chosen is told to read
// the work and change nothing.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import * as fs from "fs/promises";
import { props, closeOverlay, theme, appHome, home, shared, setShared, checking, exec, run, notify, knownAgents, window as herdrWindow } from "herdr";
import { familyOf, optionsFor, parseCodexModels, parsePrefs, setChoice, summary, slashCommand, switchSession, canSwitch, agentChoices, handoffLaunch, handoffPrompt, reviewPrompt } from "./lib.js";

const MODELS_PER_ROW = 3;
const EFFORTS_PER_ROW = 4;

const rows = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
const prefsFile = () => `${appHome()}/data/tabi/launch.json`;

export default class TabiLaunch extends View {
  init(_p, cx) {
    const p = props() ?? {};
    this.key = p.key;
    this.switching = p.mode === "switch"; // type a command into a running agent instead of choosing what the next one starts with
    this.review = p.mode === "review"; // another agent reads the work of a task (it does not change anything)
    this.handoff = p.mode === "handoff" || this.review; // go on with a task in another agent
    this.rec = p.rec;
    this.from = p.from;
    this.space = p.space;
    this.folder = p.folder;
    this.machine = p.machine ?? null;
    this.known = [];
    this.picked = null; // the agent chosen to go on (its key)
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
      if (this.handoff) { try { this.known = await knownAgents({ on: this.machine }); } catch { /* none: the dialog says so */ } }
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

  /** Opens the tab of the agent chosen, told to go on with the task, and saves the record that goes with it. */
  launchHandoff(cx) {
    const agent = agentChoices(this.known, shared("tabi.accounts")).find((a) => a.key === this.picked);
    const r = handoffLaunch({ kind: this.review ? "review" : "handoff", rec: this.rec, from: this.from, agent, space: this.space, folder: this.folder, prefs: this.prefs, now: Date.now(), rnd: Math.random().toString(16).slice(2, 6) });
    if (!r) return;
    closeOverlay((props() ?? {}).overlay);
    run(r.command, r.args);
    (async () => {
      try {
        await fs.mkdir(`${appHome()}/data/tabi/tasks`, { recursive: true });
        await fs.writeFile(`${appHome()}/data/tabi/tasks/${r.record.id}.json`, JSON.stringify(r.record));
      } catch { /* the agent still goes on without its record */ }
    })();
  }

  /** The dialog of "Continuar con otro agente": the agents to choose from, what the next one will be told, and the button. */
  renderHandoff(t) {
    const choices = agentChoices(this.known, shared("tabi.accounts"));
    const picked = choices.find((a) => a.key === this.picked) ?? null;
    const message = this.review
      ? reviewPrompt({ task: this.rec?.task, result: this.rec?.result, from: this.from, verify: this.rec?.verify, check: this.rec?.check })
      : handoffPrompt({ task: this.rec?.task, result: this.rec?.result, from: this.from });
    const lines = rows(choices, 2);
    const pad = (row) => [...row, ...Array.from({ length: 2 - row.length }, () => null)];
    return v_flex().id("tabi-handoff").track_focus(this.handle).on_key_down((e, cx) => this.key_(e, cx))
      .w_full().min_h(0).px(20).pt(18).pb(20).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center()
        .child(h_flex().flex_1().gap(10).items_baseline()
          .child(div().text_size(18).text_color(t.muted).child(this.review ? "審" : "継"))
          .child(div().text_size(15).font_semibold().child(this.review ? "Que otro agente revise" : "Continuar con otro agente")))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(div().pt(6).truncate().text_size(11).font_light().text_color(t.dim).child(`${this.from ?? ""} · ${this.rec?.task ?? ""}`))
      .child(v_flex().pt(12).child(div().h(0.5).w_full().bg(t.border)))
      .child(this.section("使者", this.review ? "agente que revisa" : "agente que sigue", t))
      .child(choices.length
        ? v_flex().gap(8).children(lines.map((row) => h_flex().gap(8).children(pad(row).map((a) => a
          ? this.chip(`handoff-${a.key}`, a.name, this.picked === a.key, (_e, cx) => { this.picked = a.key; cx.notify(); }, t) : div().flex_1().min_w(0)))))
        : div().text_size(11.5).font_light().text_color(t.dim).child("Buscando agentes…"))
      .child(this.section("言", "lo que se le dirá", t))
      .child(div().max_h(96).overflow_hidden().text_size(11).font_light().text_color(t.muted).child(message))
      .child(div().pt(10).text_size(11).font_light().text_color(t.dim).child(this.review
        ? "Se abre en el mismo espacio y carpeta y solo lee: se le pide que no modifique nada. Usa el modelo que tengas elegido con el ⚙. El agente anterior no se toca."
        : "Se abre en el mismo espacio y carpeta, con la misma comprobación y el modelo que tengas elegido con el ⚙. El agente anterior no se toca."))
      .child(h_flex().pt(18).gap(10)
        .child(this.button("handoff-cancel", "Cancelar", false, () => closeOverlay((props() ?? {}).overlay), t))
        .child(this.button("handoff-go", picked ? (this.review ? `Que revise ${picked.name}` : `Continuar con ${picked.name}`) : "Elige un agente", Boolean(picked), (_e, cx) => this.launchHandoff(cx), t)));
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
    if (this.handoff) return this.renderHandoff(t);
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
