// tabi-task: "Asignar tarea…" of the "+" menu. A dialog to give a task to an agent: what to do, which agent runs it (Claude Code, a
// second account, Codex...), which character it is and, optionally, a worktree of its own. Confirming opens a tab named after the
// character, in the current folder, with the agent running and the task as its first message (tab.new {name, space, folder, argv,
// task}); with the worktree box, Herdr's worktree dialog creates a branch and a checkout and opens the agent there with the task as
// the last argument of its command. The character is passed to tabi-party (shared "tabi.next-portrait") so the agent that appears
// wears that portrait.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { run, props, closeOverlay, openOverlay, theme, knownAgents, shared, setShared, spaces, checking, window as herdrWindow } from "herdr";
import { agentChoices, characterChoices, balancedRows, buildLaunch, branchFor, worktreeAvailable, buildWorktree, acceptsPrompt } from "./lib.js";

const PORTRAIT = 40; // the picture of a character; its ring makes it 48
const FACE_W = 64; // one character: ring, name
const FACES_PER_ROW = 7; // 484 px of room: all the characters on one row while they fit
const AGENTS_PER_ROW = 3;

export default class TabiTask extends View {
  init(_props, cx) {
    const p = props() ?? {};
    this.task = "";
    this.agent = null; // the chosen agent's key; the first one until the person picks
    this.character = null; // the chosen portrait's file; null = whoever comes (automatic)
    this.worktree = false; // the box "En un worktree nuevo"
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

  /** The branches the spaces are on now: a new one never takes a name already in use. */
  takenBranches() {
    try { return spaces().map((x) => x.branch).filter(Boolean); } catch { return []; }
  }

  submit() {
    const p = props() ?? {};
    const choices = this.choices();
    const agent = choices.find((a) => a.key === this.agent) ?? choices[0];
    const character = characterChoices(shared("tabi.portraits")).find((c) => c.file === this.character) ?? null;
    if (this.worktree && worktreeAvailable({ platform: herdrWindow()?.platform, machine: p.machine }).ok) {
      const branch = branchFor(character, agent, this.task, this.takenBranches());
      const wt = buildWorktree({ task: this.task, agent, character, space: p.space, folder: p.folder, machine: p.machine, branch });
      if (!wt) return;
      if (wt.portrait) setShared("tabi.next-portrait", { file: wt.portrait, at: Date.now() });
      closeOverlay(p.overlay);
      openOverlay(wt.overlay);
      return;
    }
    const launch = buildLaunch({ task: this.task, agent, character, space: p.space, folder: p.folder });
    if (!launch) return;
    if (launch.portrait) setShared("tabi.next-portrait", { file: launch.portrait, at: Date.now() });
    closeOverlay(p.overlay);
    run(launch.command, launch.args);
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay((props() ?? {}).overlay); cx.stop_propagation(); }
  }

  /** The small heading of a section, in the tone of the cards of the panel: a kanji, then what it is ("使者 · agentes"). */
  section(kanji, text, t) {
    return h_flex().pt(18).pb(8).gap(6).items_baseline()
      .child(div().text_size(12).text_color(t.muted).child(kanji))
      .child(div().text_size(12).font_light().text_color(t.dim).child(`· ${text}`));
  }

  /** An agent: all the same width, so the grid is the same on both sides. */
  chip(id, label, selected, onClick, t) {
    return h_flex().id(id).flex_1().min_w(0).h(34).px(10).items_center().justify_center().rounded(9).cursor_pointer()
      .border_1().border_color(selected ? t.accent : t.border).bg(selected ? t.selected : t.surface)
      .text_size(12.5).text_color(selected ? t.foreground : t.muted)
      .hover((s) => s.opacity(0.88)).on_click(onClick)
      .child(div().truncate().child(label));
  }

  /** A character: its round portrait in a ring, and its name centered under it; the chosen one has an accent ring and a bright name. */
  face(c, selected, t, onClick) {
    const picture = div().relative().w(PORTRAIT).h(PORTRAIT).flex_none().rounded_full().bg(t.raised)
      .flex().items_center().justify_center()
      .child(c.thumb ? image(c.thumb).w(PORTRAIT).h(PORTRAIT) : svg("mods/tabi-party/person.svg").size(20).text_color(t.dim))
      .when(Boolean(c.thumb), (el) => el.child(svg("mods/tabi-party/circle-mask.svg").absolute().top(0).left(0).w(PORTRAIT).h(PORTRAIT).text_color(selected ? t.selected : t.popover)));
    const ring = div().w(PORTRAIT + 8).h(PORTRAIT + 8).flex_none().rounded_full().flex().items_center().justify_center()
      .border_1().border_color(selected ? t.accent : t.border).bg(selected ? t.selected : t.popover).child(picture);
    return v_flex().id(`face-${c.file ?? "auto"}`).w(FACE_W).flex_none().items_center().gap(6).cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(onClick)
      .child(ring)
      .child(h_flex().w_full().justify_center().child(div().truncate().text_size(11).text_color(selected ? t.foreground : t.dim).child(c.name)));
  }

  /** The box "En un worktree nuevo", as a card like those of the panel: the task gets its own branch and folder. Dim and inert where it cannot be offered. */
  worktreeBox(t, available, note) {
    const on = this.worktree && available.ok;
    const box = div().w(18).h(18).flex_none().rounded(5).border_1().border_color(on ? t.accent : t.input).bg(on ? t.accent : t.background)
      .flex().items_center().justify_center().text_size(12).text_color(t.solid_foreground).child(on ? "✓" : "");
    return h_flex().id("task-worktree").w_full().px(14).py(12).gap(12).items_center().rounded(9)
      .border_1().border_color(on ? t.accent : t.border).bg(t.surface)
      .when(!available.ok, (el) => el.opacity(0.5))
      .when(available.ok, (el) => el.cursor_pointer().hover((x) => x.opacity(0.88)).on_click((_e, cx) => { this.worktree = !this.worktree; cx.notify(); }))
      .child(box)
      .child(v_flex().flex_1().min_w(0).gap(2)
        .child(div().text_size(12.5).text_color(t.foreground).child("En un worktree nuevo"))
        .child(div().text_size(11).font_light().text_color(t.dim).child(available.ok ? note : available.reason)))
      .child(div().text_size(15).text_color(t.dim).child("道"));
  }

  /** Cancel and Launch: the same width, side by side. */
  button(id, text, primary, action, t) {
    return h_flex().id(id).flex_1().h(38).items_center().justify_center().rounded(9)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(action).child(text);
  }

  render() {
    const t = theme();
    const p = props() ?? {};
    const choices = this.choices();
    const chosen = choices.find((a) => a.key === this.agent) ?? choices[0];
    const characters = characterChoices(shared("tabi.portraits"));
    const where = String(p.folder ?? "").split(/[\\/]/).filter(Boolean).pop();
    const available = worktreeAvailable({ platform: herdrWindow()?.platform, machine: p.machine });
    const picked = characters.find((c) => c.file === this.character) ?? null;
    const branch = branchFor(picked, chosen, this.task, this.takenBranches());
    const note = !this.worktree ? "Su propia rama y carpeta, para que no pise tu trabajo"
      : `Rama ${branch}${this.task.trim() && chosen && !acceptsPrompt(chosen) ? ". Este agente no recibe la tarea solo: escríbela en su pestaña" : ""}`;
    const faces = balancedRows([{ file: null, name: "Al azar", thumb: null }, ...characters], FACES_PER_ROW);
    const agentRows = balancedRows(choices, AGENTS_PER_ROW);
    // A short row is filled with empty cells (null), so every cell keeps its width and the grid stays even.
    const pad = (row, size) => [...row, ...Array.from({ length: size - row.length }, () => null)];
    return v_flex().id("tabi-task").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().min_h(0).px(20).pt(18).pb(20).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center()
        .child(h_flex().flex_1().gap(10).items_baseline()
          .child(div().text_size(18).text_color(t.muted).child("任務"))
          .child(div().text_size(15).font_semibold().child("Asignar tarea")))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(v_flex().pt(14).child(div().h(0.5).w_full().bg(t.border)))
      .child(this.section("内容", "qué hay que hacer", t))
      .child(Input.new(this.input).h(38).px(12).rounded(9).border_1().border_color(this.inputFocused ? t.accent : t.border).bg(t.background).text_size(12.8).text_color(t.foreground))
      .child(div().pt(6).text_size(11).font_light().text_color(t.dim).child(where ? `Se abre en «${where}». Sin texto, solo abre el agente.` : "Sin texto, solo abre el agente."))
      .child(this.section("道", "dónde", t))
      .child(this.worktreeBox(t, available, note))
      .child(this.section("使者", "agente", t))
      .child(choices.length
        ? v_flex().gap(8).children(agentRows.map((row) => h_flex().gap(8)
          .children(pad(row, agentRows[0].length).map((a) => a
            ? this.chip(`agent-${a.key}`, a.name, chosen?.key === a.key, (_e, cx) => { this.agent = a.key; cx.notify(); }, t) : div().flex_1()))))
        : div().text_size(11.5).font_light().text_color(t.dim).child(this.failed ? "No se pudo comprobar qué agentes hay instalados" : "Buscando agentes…"))
      .child(this.section("人物", "personaje", t))
      .child(v_flex().gap(10).children(faces.map((row) => h_flex().w_full().justify_between()
        .children(pad(row, faces[0].length).map((c) => c
          ? this.face(c, (c.file ?? null) === this.character, t, (_e, cx) => { this.character = c.file ?? null; cx.notify(); }) : div().w(FACE_W).flex_none())))))
      .child(h_flex().pt(22).gap(10)
        .child(this.button("task-cancel", "Cancelar", false, () => closeOverlay(p.overlay), t))
        .child(this.button("task-go", "Lanzar", true, () => this.submit(), t)));
  }
}
