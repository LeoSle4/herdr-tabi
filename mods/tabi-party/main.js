// tabi-party: "使者 · agentes". One card per agent: accent strip by state (cream working, amber waiting, gray idle),
// round portrait, account name (claude, claude2, codex), status kanji, "space · task" and a 2 px bar. The right edge is cut on a diagonal with two SVG
// shapes (the engine has no clip-path): a triangle in the sidebar's color and a hairline on its edge.
// Portraits: every png/jpg in ~/Documents/retratos/ (any name; also files without extension whose content is a png or jpeg;
// anything else is named in a notification and ignored). Each agent gets one at random when it appears, by the unique id of
// its pane (not by its account), and keeps it while it lives (data/tabi/portraits.json); a new agent gets one that no
// visible agent has, they repeat only when there are more agents than images, and a closed agent frees its portrait. New images are found on their own (every 15 s). Each is cut to a centered square thumbnail
// (data/tabi/portraits/, with macOS `sips`) and the card clips it in a circle. No images: a neutral figure.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import * as fs from "fs/promises";
import { agents, home, run, theme, checking, layout, appHome, exec, shared, notify } from "herdr";
import { statusInfo, accountNames, subtitle, isImage, reconcilePortraits, thumbName, cropSide, parseFolder, accountOf } from "./lib.js";

const THUMB = 96; // px of the cached thumbnail: sharp at the card's 34 px, also on a 2x screen
const srcDir = () => `${home()}/Documents/retratos`;
const thumbDir = () => `${appHome()}/data/tabi/portraits`;
const assignFile = () => `${appHome()}/data/tabi/portraits.json`;
const num = (text, key) => Number(new RegExp(`${key}:\\s*(\\d+)`).exec(text)?.[1]);

const W = 216;
const H = 64;
const TEXT_W = 141;
const PORTRAIT = 34;
const MAX_H = 360;

function sizeOf(node, id) {
  if (node?.id === id) return node.size?.px ?? null;
  for (const c of node?.children ?? []) { const r = sizeOf(c, id); if (r !== undefined) return r; }
  return undefined;
}


export default class TabiParty extends View {
  init(_props, cx) {
    this.thumbs = new Map(); // source file -> { path (relative to the app home), mtime }
    this.assign = {}; // agent id (its pane, unique) -> source file
    this.detected = {}; // agent address -> { pid, name }: the account its process runs under
    this.scanned = false;
    this.scanning = false; // one folder scan at a time
    this.sawAgents = false; // agents were seen at least once: an empty list afterwards means they all closed
    this.ignored = ""; // the ignored files last reported
    if (checking()) return;
    cx.spawn(async (cx) => {
      try { this.assign = JSON.parse(await fs.readFile(assignFile(), "utf8")); } catch { /* none yet */ }
      await this.scan();
      cx.notify();
    });
    cx.timer.every(15000, (cx) => cx.spawn(async (cx) => { if (await this.scan()) cx.notify(); }));
    cx.timer.every(6000, (cx) => cx.spawn(async (cx) => { if (await this.detect()) cx.notify(); }));
    cx.spawn(async (cx) => { if (await this.detect()) cx.notify(); });
  }

  /** Which account each Claude agent runs under: the CLAUDE_CONFIG_DIR in its process's environment (`ps eww`, own
   *  processes only), matched against the accounts tabi-usage publishes. Looked at again only when the process changes. */
  async detect() {
    const accounts = shared("tabi.accounts") ?? [];
    let changed = false;
    const live = agents().filter((a) => String(a.program?.key ?? a.app ?? "").toLowerCase().startsWith("claude"));
    for (const a of live) {
      try {
        const info = JSON.parse((await exec("hc", ["get", a.address], { timeout: 10000 })).stdout);
        const pid = info?.foreground?.pid ?? info?.pid;
        if (!pid) continue;
        const known = this.detected[a.address];
        if (known?.pid === pid && known.accounts === accounts.length) continue;
        const ps = (await exec("ps", ["eww", "-p", String(pid), "-o", "command="], { timeout: 10000 })).stdout;
        const name = accountOf(ps, accounts);
        if (known?.name !== name) changed = true;
        this.detected[a.address] = { pid, name, accounts: accounts.length };
      } catch { /* the terminal went away, or no ps: keep what we know */ }
    }
    return changed;
  }

  /** The centered square thumbnail of a source image (sips on macOS); the original, uncropped, where sips is missing. */
  async makeThumb(file, mtime) {
    const src = `${srcDir()}/${file}`;
    const out = `${thumbDir()}/${thumbName(file, mtime)}`;
    try {
      await fs.mkdir(thumbDir(), { recursive: true });
      if (!(await fs.exists(out))) {
        const info = (await exec("sips", ["-g", "pixelWidth", "-g", "pixelHeight", src], { timeout: 20000 })).stdout;
        const side = cropSide(num(info, "pixelWidth"), num(info, "pixelHeight"));
        const tmp = `${out}.tmp.png`;
        await exec("sips", ["-s", "format", "png", "--cropToHeightWidth", String(side), String(side), src, "--out", tmp], { timeout: 20000 });
        await exec("sips", ["-Z", String(THUMB), tmp, "--out", out], { timeout: 20000 });
        try { await fs.unlink(tmp); } catch { /* already gone */ }
        if (!(await fs.exists(out))) throw new Error("no thumbnail");
      }
      return `data/tabi/portraits/${thumbName(file, mtime)}`;
    } catch {
      return `mods/tabi-party/retratos/${file}`;
    }
  }

  /** The usable images of the folder (png/jpg/jpeg, also without extension) with their modification time, and the names of
   *  the files that are ignored. One `stat` and one `file` per file through the shell (the engine's fs has neither);
   *  without a shell, the plain directory listing and no times. */
  async listFolder() {
    const script = 'for f in "$1"/*; do [ -f "$f" ] || continue; m=$(stat -f %m "$f" 2>/dev/null || stat -c %Y "$f" 2>/dev/null || echo 0); t=$(file -b --mime-type "$f" 2>/dev/null); printf "%s\\t%s\\t%s\\n" "$m" "${f##*/}" "$t"; done';
    try {
      const r = await exec("sh", ["-c", script, "retratos", srcDir()], { timeout: 20000 });
      if (r.code === 0) return parseFolder(r.stdout);
    } catch { /* no shell here */ }
    try {
      const names = (await fs.readdir(srcDir())).sort();
      return { images: names.filter(isImage).map((file) => ({ file, mtime: 0 })), ignored: names.filter((n) => !isImage(n)) };
    } catch { return { images: [], ignored: [] }; }
  }

  /** Reads the folder: new or changed images get a thumbnail, removed ones go. Resolves true when something changed.
   *  The thumbnails are built apart and swapped in at the end, so nobody is ever given a portrait from a half-read
   *  folder, and only one scan runs at a time. Files that are not usable images are named once in a notification. */
  async scan() {
    if (this.scanning) return false;
    this.scanning = true;
    try {
      const { images, ignored } = await this.listFolder();
      const next = new Map();
      for (const { file, mtime } of images) {
        const old = this.thumbs.get(file);
        next.set(file, old && old.mtime === mtime ? old : { path: await this.makeThumb(file, mtime), mtime });
      }
      const sameFiles = [...next.keys()].join("\n") === [...this.thumbs.keys()].join("\n");
      const samePaths = sameFiles && [...next].every(([f, v]) => v.path === this.thumbs.get(f)?.path);
      const first = !this.scanned;
      this.thumbs = next;
      this.scanned = true;
      const key = ignored.join("\n");
      if (key !== this.ignored) {
        this.ignored = key;
        if (ignored.length) notify({ title: "Retratos: archivos ignorados", body: `${ignored.join(", ")} (solo se usan png y jpg, también sin extensión)`, level: "warning", timeout: 8000 });
      }
      return first || !samePaths;
    } finally {
      this.scanning = false;
    }
  }

  /** The unique id of an agent's portrait slot: its pane (it dies with the tab); the terminal's address if there is none. */
  idOf(a) {
    return a.pane || a.address;
  }

  /** Gives portraits one agent at a time (reconcilePortraits), freeing those of agents that closed; saved when it changes.
   *  Nothing is assigned while the folder is being read. */
  assignPortraits(cx) {
    if (!this.scanned || this.scanning) return;
    const list = agents();
    if (list.length) this.sawAgents = true;
    // At start the list can be empty for a moment: the saved assignments are kept until agents have been seen.
    if (!list.length && !this.sawAgents) return;
    const next = reconcilePortraits([...this.thumbs.keys()], list.map((x) => this.idOf(x)), this.assign);
    if (JSON.stringify(next) === JSON.stringify(this.assign)) return;
    this.assign = next;
    cx.spawn(async () => {
      try {
        await fs.mkdir(`${appHome()}/data/tabi`, { recursive: true });
        await fs.writeFile(assignFile(), JSON.stringify(next));
      } catch { /* the portraits are only not remembered */ }
    });
  }

  /** The block takes the height its cards need (layout.resize), so no empty gap is left in the sidebar. */
  fit(height) {
    const px = Math.min(MAX_H, Math.ceil(height));
    if (px < 40 || sizeOf(layout(), "party") === px) return;
    run("layout.resize", { id: "party", px });
  }

  card(a, t, name) {
    const s = statusInfo(a.status);
    const accent = t[s.accent];
    const thumb = this.thumbs.get(this.assign[this.idOf(a)])?.path;
    // The engine clips nothing to a circle: a square mask in the card's color, with a round hole, sits over the photo.
    const portrait = div().relative().w(PORTRAIT).h(PORTRAIT).flex_none().rounded_full().bg(t.raised)
      .flex().items_center().justify_center()
      .child(thumb
        ? image(thumb).w(PORTRAIT).h(PORTRAIT)
        : svg("mods/tabi-party/person.svg").size(20).text_color(t.dim))
      .when(Boolean(thumb), (el) => el.child(svg("mods/tabi-party/circle-mask.svg").absolute().top(0).left(0).w(PORTRAIT).h(PORTRAIT).text_color(t.surface)));
    const track = div().relative().w(TEXT_W).h(2).rounded(1).bg(t.raised).overflow_hidden();
    if (s.busy) track.child(div().absolute().top(0).left(0).w(52).h(2).rounded(1).bg(accent).loop("left", { from: 0, to: TEXT_W - 52, period: 1800 }));
    else if (a.status === "blocked") track.child(div().absolute().top(0).left(0).w(TEXT_W).h(2).rounded(1).bg(accent));
    return div().id(`card-${a.address}`).relative().w(W).h(H).flex_none().bg(t.surface)
      .border_1().border_color(t.border)
      .hover((x) => x.border_color(t.input))
      .on_click(() => run("pane.focus", { pane: a.pane }))
      .child(div().absolute().top(0).left(0).w(3).h(H).bg(accent))
      .child(h_flex().h_full().items_center().gap(10).pl(17)
        .child(portrait)
        .child(v_flex().w(TEXT_W).gap(3)
          .child(h_flex().justify_between().items_baseline()
            .child(div().truncate().text_size(12.5).text_color(a.focused ? t.foreground : t.muted).child(name))
            .child(div().text_size(13).text_color(accent).child(s.kanji)))
          .child(div().truncate().text_size(11).font_light().text_color(t.dim).child(subtitle(a)))
          .child(track)))
      .child(svg("mods/tabi-party/cut.svg").absolute().top(0).right(0).w(14).h(H).text_color(t.chrome))
      .child(svg("mods/tabi-party/cut-line.svg").absolute().top(0).right(0).w(14).h(H).text_color(t.input));
  }

  render(cx) {
    const t = theme();
    const list = agents();
    this.assignPortraits(cx);
    const detected = Object.fromEntries(Object.entries(this.detected).map(([k, v]) => [k, v.name]));
    const names = accountNames(list, detected);
    const body = v_flex().gap(8).px(12).pb(12);
    for (const a of list) body.child(this.card(a, t, names[a.address]));
    if (!list.length) body.child(div().py(8).text_size(11.5).font_light().text_color(t.dim).child("Ningún agente activo."));
    return v_flex().id("tabi-party").size_full().bg(t.chrome).overflow_hidden()
      .child(div().id("tabi-party-list").flex_1().min_h(0).overflow_y_scrollbar()
        .child(v_flex().id("tabi-party-fit").flex_none().w_full()
          .on_size_change((size, cx) => this.fit(size.height))
          .child(h_flex().items_baseline().justify_between().px(14).pt(14).pb(10)
            .child(div().text_size(12).font_light().text_color(t.muted).child("使者 · agentes"))
            .child(div().text_size(11).font_light().text_color(t.dim).child(`${list.length}`)))
          .child(body)));
  }
}
