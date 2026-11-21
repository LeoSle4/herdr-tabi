// tabi-review: the inbox of finished tasks. "N tareas por revisar ›" in the panel (今 · ahora) opens it. Each task that has ended and that
// nobody has looked at is a row: who did it, what was asked, what the agent said, what its check found and what changed in its folder (read
// with git, read-only). Three actions: see the agent, copy the description of a pull request already written, and mark it as reviewed. It
// never commits, pushes or opens a pull request: that stays with the script you run.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import * as fs from "fs/promises";
import { props, closeOverlay, theme, appHome, agents, spaces, exec, run, notify, checking, window as herdrWindow } from "herdr";
import { parseTask, pendingReview, markReviewed, folderFor, diffStat, prText, copyCommand, agentOf, agoLabel, reviewState, groupReview } from "./lib.js";

const PASS = "#6fbf8a";
const FAIL = "#e0646a";
const WAIT = "#d9a441";
const ICON = (name) => `mods/tabi-review/${name}.svg`;
// What each group looks like: its icon and its color. The tint is the same color with a little opacity.
const LOOK = {
  fail: { icon: "circle-x", color: FAIL },
  pass: { icon: "circle-check", color: PASS },
  running: { icon: "clock", color: WAIT },
  none: { icon: "circle-minus", color: null },
};
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

  /** A button with its icon: "primary" is the one that closes the task. */
  action(id, icon, label, onClick, t, primary = false) {
    return h_flex().id(id).flex_1().min_w(0).h(30).px(8).gap(6).items_center().justify_center().rounded(8).cursor_pointer()
      .border_1().border_color(primary ? PASS : t.input).bg(primary ? `${PASS}26` : t.raised)
      .text_size(11.5).text_color(primary ? PASS : t.foreground)
      .hover((s) => s.opacity(0.85)).on_click(onClick)
      .child(svg(ICON(icon)).size(13).flex_none())
      .child(div().truncate().child(label));
  }

  /** A line of small print that starts with an icon. */
  note(icon, color, ...parts) {
    return h_flex().gap(6).items_center().min_w(0)
      .child(svg(ICON(icon)).size(12).flex_none().text_color(color))
      .child(h_flex().gap(6).min_w(0).overflow_hidden().text_size(11).font_light().children(parts));
  }

  row(rec, t, now, last) {
    const state = reviewState(rec);
    const look = LOOK[state];
    const color = look.color ?? t.dim;
    const c = rec.check;
    const stat = this.stats[rec.id];
    const who = [rec.character ?? rec.agent, rec.agentKey && rec.character ? rec.agent : null, agoLabel(rec.finishedAt, now)].filter(Boolean).join(" · ");
    const changes = !(rec.id in this.stats) ? div().text_color(t.dim).child("leyendo cambios…")
      : stat === null ? div().text_color(t.dim).child("sin información de git")
      : stat.files || stat.untracked ? h_flex().gap(8)
        .child(div().text_color(t.muted).child(`${stat.files} ${stat.files === 1 ? "archivo" : "archivos"}`))
        .child(div().text_color(PASS).child(`+${stat.add}`))
        .child(div().text_color(FAIL).child(`−${stat.del}`))
        .when(Boolean(stat.untracked), (el) => el.child(div().text_color(t.dim).child(`${stat.untracked} sin seguimiento`)))
      : div().text_color(t.dim).child("sin cambios");
    return v_flex().id(`review-${rec.id}`).w_full().flex_none().gap(8).p(12).border_color(t.border)
      .when(!last, (el) => el.border_b(0.5))
      .child(h_flex().gap(10).items_start()
        .child(h_flex().flex_none().size(28).items_center().justify_center().rounded(8).bg(`${color}26`)
          .child(svg(ICON(look.icon)).size(16).text_color(color)))
        .child(v_flex().flex_1().min_w(0).gap(3)
          .child(div().max_h(36).overflow_hidden().text_size(13).font_semibold().text_color(t.foreground).child(rec.task))
          .child(div().truncate().text_size(11).font_light().text_color(t.dim).child(who))
          .when(Boolean(rec.result), (el) => el.child(div().max_h(32).overflow_hidden().text_size(11.5).font_light().text_color(t.muted).child(rec.result)))))
      .child(v_flex().gap(4).pl(38)
        .when(Boolean(rec.verify && (state === "pass" || state === "fail")), (el) =>
          el.child(this.note(LOOK[state].icon, color, div().truncate().text_color(color).child(`${rec.verify}${c?.tail ? `: ${c.tail}` : ""}`))))
        .child(this.note("file-diff", t.dim, changes))
        .when(Boolean(rec.branch), (el) => el.child(this.note("git-branch", t.dim, div().truncate().text_color(t.muted).child(rec.branch)))))
      .child(h_flex().pt(2).pl(38).gap(8)
        .child(this.action(`see-${rec.id}`, "eye", "Ver agente", () => this.see(rec), t))
        .child(this.action(`copy-${rec.id}`, "copy", "Copiar PR", () => this.copy(rec), t))
        .child(this.action(`done-${rec.id}`, "check", "Revisada", (_e, cx) => this.reviewed(rec, cx), t, true)));
  }

  /** A group: what it is, how many, and what to do about it; its tasks in one panel. */
  group(g, t, now) {
    const look = LOOK[g.key];
    const color = look.color ?? t.dim;
    return v_flex().w_full().flex_none().gap(8)
      .child(h_flex().gap(8).items_center().px(2)
        .child(svg(ICON(look.icon)).size(14).flex_none().text_color(color))
        .child(div().text_size(12).font_semibold().text_color(color).child(g.label))
        .child(div().text_size(11.5).text_color(t.dim).child(String(g.items.length)))
        .child(div().flex_1().min_w(0).truncate().text_size(11).font_light().text_color(t.dim).child(`· ${g.hint}`)))
      .child(v_flex().w_full().rounded(10).border_1().border_color(t.border).bg(t.surface).overflow_hidden()
        .children(g.items.map((rec, i) => this.row(rec, t, now, i === g.items.length - 1))));
  }

  /** The counts at the top: one chip per group that has something in it. */
  summary(groups, t) {
    return h_flex().gap(8).items_center()
      .children(groups.map((g) => {
        const look = LOOK[g.key];
        const color = look.color ?? t.dim;
        return h_flex().gap(5).items_center().h(22).px(8).rounded(11).bg(`${color}26`)
          .child(svg(ICON(look.icon)).size(12).flex_none().text_color(color))
          .child(div().text_size(11.5).text_color(color).child(String(g.items.length)));
      }));
  }

  render() {
    const t = theme();
    const now = Date.now();
    const groups = groupReview(this.list);
    return v_flex().id("tabi-review").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().h_full().min_h(0).px(20).pt(18).pb(20).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center().gap(12)
        .child(h_flex().flex_1().min_w(0).gap(10).items_center()
          .child(svg(ICON("inbox")).size(18).flex_none().text_color(t.muted))
          .child(div().text_size(15).font_semibold().child("Revisión"))
          .child(this.summary(groups, t)))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(v_flex().pt(12).pb(12).child(div().h(0.5).w_full().bg(t.border)))
      .child(div().id("review-list").flex_1().min_h(0).overflow_y_scrollbar()
        .child(v_flex().gap(16).w_full()
          .when(!this.loaded, (el) => el.child(div().text_size(11.5).font_light().text_color(t.dim).child("Leyendo…")))
          .when(this.loaded && !this.list.length, (el) => el.child(v_flex().gap(6).items_center().pt(40)
            .child(svg(ICON("circle-check")).size(28).text_color(PASS))
            .child(div().text_size(13).text_color(t.muted).child("Nada por revisar"))
            .child(div().text_size(11.5).font_light().text_color(t.dim).child("Las tareas que terminen aparecerán aquí."))))
          .children(groups.map((g) => this.group(g, t, now)))))
      .child(div().pt(12).text_size(11).font_light().text_color(t.dim).child("Esto no hace commit, push ni PR: copia la descripción y publica con tu script."));
  }
}
