// tabi-backdrop: one picture per space, fixed. A space gets a random picture when it first shows up (one no other open
// space has; they repeat only when all are in use) and keeps it, saved in data/tabi/space-backdrops.json. Switching
// space switches the picture; `tabi-backdrop.next` (cmd-shift-g) gives the active space another one and saves it.
// No rotation by time. The engine has one background for the whole layout, so a switch paints it by rewriting
// layouts/tabi.json (a straight cut, no fade). That file is written back with the sizes, folds and panel choice the
// window already shows (mergeLive), so a switch never undoes a drag or a fold. The "fondo 4/10" tag is drawn by tabi-status.
// Pictures: backgrounds/tabi/ and data/tabi/backdrops.json, both made by prepare.py from ~/Documents/fondos/optimizados.
import { View, div } from "gpui-kit";
import * as fs from "fs/promises";
import { exec, appHome, spaces, layout, setShared, shared, nextCommand, checking, window as herdrWindow } from "herdr";
import { darkness, pickUnused, pruneSpaces, tagLabel, mergeLive, patchLayout } from "./lib.js";

const SETTLE_MS = 450; // after a switch other mods restore their per-space state (the side panel): let them finish first
const listFile = () => `${appHome()}/data/tabi/backdrops.json`;
const assignFile = () => `${appHome()}/data/tabi/space-backdrops.json`;
const layoutFile = () => `${appHome()}/layouts/tabi.json`;

async function loadImages() {
  const read = async () => JSON.parse(await fs.readFile(listFile(), "utf8")).images ?? [];
  try {
    return await read();
  } catch {
    const py = herdrWindow().platform === "windows" ? "python" : "python3";
    try {
      await exec(py, ["-X", "utf8", `${appHome()}/mods/tabi-backdrop/prepare.py`, appHome()], { timeout: 120000 });
      return await read();
    } catch {
      return [];
    }
  }
}

export default class TabiBackdrop extends View {
  init(_props, cx) {
    this.images = [];
    this.map = {}; // space id -> picture file
    this.seen = null; // the active space the picture was last asked for
    this.ready = false;
    this.token = 0;
    if (checking()) return;
    cx.spawn(async (cx) => {
      this.images = await loadImages();
      try { this.map = JSON.parse(await fs.readFile(assignFile(), "utf8")).spaces ?? {}; } catch { /* first run */ }
      this.ready = true;
      this.sync(cx);
    });
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (c === "next" && this.ready) this.change(cx);
      }
    });
  }

  active() {
    return spaces().find((s) => s.active)?.id ?? null;
  }

  files() {
    return this.images.map((i) => i.file);
  }

  save(cx) {
    cx.spawn(async () => {
      try {
        await fs.mkdir(`${appHome()}/data/tabi`, { recursive: true });
        await fs.writeFile(assignFile(), JSON.stringify({ spaces: this.map }));
      } catch { /* the pictures are only not remembered */ }
    });
  }

  /** Gives every open space a picture (forgetting closed ones), then paints the active one. */
  sync(cx) {
    const open = spaces().map((s) => s.id);
    if (!this.images.length || !open.length) return;
    const files = this.files();
    const next = pruneSpaces(this.map, open);
    for (const id of open) {
      if (next[id] && files.includes(next[id])) continue;
      next[id] = pickUnused(files, open.filter((x) => x !== id && next[x]).map((x) => next[x]));
    }
    if (JSON.stringify(next) !== JSON.stringify(this.map)) { this.map = next; this.save(cx); }
    this.show(cx);
  }

  /** ⌘⇧G: another picture for the active space only, one no other space has when there is one. */
  change(cx) {
    const id = this.active();
    if (!id || !this.images.length) return;
    const files = this.files();
    const others = Object.entries(this.map).filter(([k]) => k !== id).map(([, f]) => f);
    const current = this.map[id];
    const pool = files.filter((f) => f !== current);
    this.map = { ...this.map, [id]: pickUnused(pool.length ? pool : files, others) };
    this.save(cx);
    this.show(cx);
  }

  /** Publishes the tag and paints the active space's picture once the other mods have settled. */
  show(cx) {
    const file = this.map[this.active()];
    if (!file) return;
    const tag = { index: this.files().indexOf(file), total: this.images.length };
    const old = shared("tabi.backdrop");
    if (old?.index !== tag.index || old?.total !== tag.total) setShared("tabi.backdrop", tag);
    const token = ++this.token;
    cx.timer.after(SETTLE_MS, (cx) => cx.spawn(async () => { if (token === this.token) await this.apply(file); }));
  }

  /** Writes the picture and its dark layer into layouts/tabi.json (with the window's current sizes), only if it changes. */
  async apply(file) {
    const pic = this.images.find((i) => i.file === file);
    if (!pic) return;
    try {
      const before = await fs.readFile(layoutFile(), "utf8");
      const merged = mergeLive(JSON.parse(before), layout());
      const after = `${JSON.stringify(patchLayout(merged, pic.file, darkness(pic.brightness)), null, 2)}\n`;
      if (after !== before) await fs.writeFile(layoutFile(), after);
    } catch { /* the layout file is not there: nothing to paint */ }
  }

  // Switching space (or opening one) re-renders every mod: that is the cue to paint the new space's picture.
  render(cx) {
    const id = this.active();
    if (this.ready && id && id !== this.seen) { this.seen = id; this.sync(cx); }
    return div().w(0).h(0);
  }
}
