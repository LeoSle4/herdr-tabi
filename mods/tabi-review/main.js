// tabi-review: the inbox of finished tasks. "N tareas por revisar ›" in the panel (今 · ahora) opens it. Each task that has ended and that
// nobody has looked at is a row: who did it, what was asked, what the agent said, what its check found and what changed in its folder (read
// with git, read-only). Three actions: see the agent, copy the description of a pull request already written, and mark it as reviewed. It
// never commits, pushes or opens a pull request: that stays with the script you run.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import * as fs from "fs/promises";
import { props, closeOverlay, theme, appHome, agents, spaces, exec, run, notify, checking, window as herdrWindow } from "herdr";
import { parseTask, pendingReview, markReviewed, folderFor, diffStat, prText, copyCommand, agentOf, agoLabel } from "./lib.js";

const PASS = "#6fbf8a";
const FAIL = "#e0646a";
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"]; // reads write nothing under .git
const MAX_ROWS = 8;
const tasksDir = () => `${appHome()}/data/tabi/tasks`;

export default class TabiReview extends View {
  init(_p, cx) {
    this.list = []; // the tasks waiting for a review, newest first
    this.stats = {}; // task id -> { files, add, del, untracked } | null (no git) ; absent while it is read
    this.loaded = false;
    this.handle = cx.focus_handle();
    if (checking()) return;
    cx.spawn(async (cx) => {
      await this.load();
      this.loaded = true;
      cx.notify();
      await this.readStats(cx);
    });
  }

  async load() {
    let names = [];
    try { names = (await fs.readdir(tasksDir())).filter((n) => n.endsWith(".json")); } catch { /* no tasks yet */ }
    const records = [];
    for (const name of names) {
      try {
        const rec = parseTask(await fs.readFile(`${tasksDir()}/${name}`, "utf8"));
        if (rec) records.push(rec);
      } catch { /* removed while reading */ }
    }
    this.list = pendingReview(records, Date.now()).slice(0, MAX_ROWS);
  }

  /** What changed in the folder of each task, one after the other. */
  async readStats(cx) {
    for (const rec of this.list) {
      const dir = folderFor(rec, spaces());
      let stat = null;
      if (dir && !rec.machine) {
        try {
          const numstat = await exec("git", [...READ, "diff", "--numstat", "HEAD"], { cwd: dir, timeout: 15000 });
          const status = await exec("git", [...READ, "status", "--porcelain"], { cwd: dir, timeout: 15000 });
          if (numstat.code === 0 && status.code === 0) stat = diffStat(numstat.stdout, status.stdout);
        } catch { /* not a repository, or no git */ }
      }
      this.stats[rec.id] = stat;
      cx.notify();
    }
  }

  machineOf(a) {
    return spaces().find((s) => s.id === a.space)?.machine ?? null;
  }

  see(rec) {
    const a = agentOf(rec, agents(), (x) => this.machineOf(x));
    if (!a) return notify({ title: "Ese agente ya no está abierto", body: rec.task, level: "info" });
    closeOverlay((props() ?? {}).overlay);
    run("pane.focus", { pane: a.pane });
  }

  copy(rec) {
    const stat = this.stats[rec.id] ?? { files: 0, add: 0, del: 0, untracked: 0 };
    const c = copyCommand(herdrWindow()?.platform, prText(rec, stat));
    if (!c) return notify({ title: "No puedo copiar en esta plataforma", level: "error" });
    exec(c.command, c.args, { timeout: 10000 }).then(
      () => notify({ title: "Descripción del PR copiada", body: rec.task, level: "success" }),
      (e) => notify({ title: "No pude copiar", body: String(e?.message ?? e), level: "error" }));
  }

  reviewed(rec, cx) {
    this.list = this.list.filter((r) => r.id !== rec.id);
    cx.notify();
    (async () => {
      try { await fs.writeFile(`${tasksDir()}/${rec.id}.json`, JSON.stringify(markReviewed(rec, Date.now()))); } catch { /* it comes back next time */ }
    })();
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay((props() ?? {}).overlay); cx.stop_propagation(); }
  }

  action(id, label, onClick, t) {
    return h_flex().id(id).flex_1().min_w(0).h(30).px(8).items_center().justify_center().rounded(8).cursor_pointer()
      .border_1().border_color(t.input).bg(t.raised).text_size(11.5).text_color(t.foreground)
      .hover((s) => s.opacity(0.88)).on_click(onClick).child(div().truncate().child(label));
  }

  row(rec, t, now) {
    const c = rec.check;
    const mark = !rec.verify ? "" : !c || c.state === "running" ? "…" : c.state === "pass" ? "✓" : "✗";
    const color = mark === "✓" ? PASS : mark === "✗" ? FAIL : t.dim;
    const stat = this.stats[rec.id];
    const where = rec.branch ? ` · ${rec.branch}` : "";
    const changes = !(rec.id in this.stats) ? "leyendo cambios…"
      : stat === null ? "sin información de git"
      : stat.files || stat.untracked ? `${stat.files} archivos  +${stat.add} −${stat.del}${stat.untracked ? `  ${stat.untracked} sin seguimiento` : ""}${where}`
      : `sin cambios${where}`;
    return v_flex().id(`review-${rec.id}`).w_full().flex_none().gap(6).p(12).rounded(9).border_1().border_color(t.border).bg(t.surface)
      .child(h_flex().items_baseline().gap(8)
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.foreground).child(rec.character ?? rec.agent))
        .when(Boolean(mark), (el) => el.child(div().text_size(12).text_color(color).child(mark)))
        .child(div().flex_none().text_size(11).font_light().text_color(t.dim).child(agoLabel(rec.finishedAt, now))))
      .child(div().max_h(34).overflow_hidden().text_size(12).text_color(t.muted).child(rec.task))
      .when(Boolean(rec.result), (el) => el.child(div().max_h(32).overflow_hidden().text_size(11).font_light().text_color(t.dim).child(rec.result)))
      .when(Boolean(rec.verify && c && c.state !== "running" && c.tail), (el) => el.child(div().truncate().text_size(11).font_light().text_color(color).child(`${rec.verify}: ${c.tail}`)))
      .child(div().truncate().text_size(11).font_light().text_color(t.muted).child(changes))
      .child(h_flex().pt(4).gap(8)
        .child(this.action(`see-${rec.id}`, "Ver agente", () => this.see(rec), t))
        .child(this.action(`copy-${rec.id}`, "Copiar PR", () => this.copy(rec), t))
        .child(this.action(`done-${rec.id}`, "Revisada", (_e, cx) => this.reviewed(rec, cx), t)));
  }

  render() {
    const t = theme();
    const now = Date.now();
    return v_flex().id("tabi-review").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().h_full().min_h(0).px(20).pt(18).pb(20).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center()
        .child(h_flex().flex_1().gap(10).items_baseline()
          .child(div().text_size(18).text_color(t.muted).child("審"))
          .child(div().text_size(15).font_semibold().child("Revisión"))
          .child(div().text_size(12).font_light().text_color(t.dim).child(this.list.length ? `· ${this.list.length} por revisar` : "")))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(v_flex().pt(12).pb(12).child(div().h(0.5).w_full().bg(t.border)))
      .child(div().id("review-list").flex_1().min_h(0).overflow_y_scrollbar()
        .child(v_flex().gap(10).w_full()
          .when(!this.loaded, (el) => el.child(div().text_size(11.5).font_light().text_color(t.dim).child("Leyendo…")))
          .when(this.loaded && !this.list.length, (el) => el.child(div().text_size(12).font_light().text_color(t.dim).child("Nada por revisar. Las tareas que terminen aparecerán aquí.")))
          .children(this.list.map((rec) => this.row(rec, t, now)))))
      .child(div().pt(12).text_size(11).font_light().text_color(t.dim).child("Esto no hace commit, push ni PR: copia la descripción y publica con tu script."));
  }
}
