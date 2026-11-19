// tabi-space-menu: what the "+" of the spaces list opens. "~ inicio", the 6 most recently modified projects of
// ~/Documents/Projects and "Elegir carpeta…" (the system's folder picker). A folder that already has a space is not
// duplicated: that space is shown and a short note says so.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, home, run, exec, notify, pickFolder, closeOverlay, props, theme, checking } from "herdr";
import { findSpaceByFolder, recentFromLs } from "./lib.js";

const projectsDir = () => `${home()}/Documents/Projects`;

/** Where a space is now: the folder of its first terminal, else the folder it was made in. */
function whereOf(s) {
  const tabs = new Set((s.tabs ?? []).map((t) => t.id));
  return panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd ?? s.folder;
}

export default class TabiSpaceMenu extends View {
  init(_props, cx) {
    this.recent = [];
    this.picking = false;
    if (checking()) return;
    cx.spawn(async (cx) => {
      try {
        // `ls -t` already sorts by modification time, newest first, and marks folders with "/".
        const r = await exec("ls", ["-1tp", projectsDir()], { timeout: 10000 });
        if (r.code === 0) this.recent = recentFromLs(r.stdout, projectsDir(), 6);
      } catch { /* no projects folder: only the other two entries */ }
      cx.notify();
    });
  }

  /** Opens the folder as a space, or shows the one that already has it. */
  open(folder) {
    const existing = findSpaceByFolder(spaces(), whereOf, folder);
    closeOverlay(props().overlay);
    if (existing) {
      run("space.select", { id: existing.id });
      notify({ title: "Ya existe un espacio con esa carpeta", body: `Te llevé a «${existing.name}»`, level: "info", timeout: 3500 });
    } else {
      run("space.new", { folder });
    }
  }

  choose(cx) {
    if (this.picking) return;
    this.picking = true;
    cx.spawn(async () => {
      let folder = null;
      try { folder = await pickFolder({ prompt: "Abrir como espacio" }); } catch { /* cancelled */ }
      this.picking = false;
      if (folder) this.open(folder);
      else closeOverlay(props().overlay);
    });
  }

  item(id, icon, label, onClick, t, hint) {
    return h_flex().id(id).h(28).flex_none().items_center().gap(8).px(12).cursor_pointer().hover((x) => x.bg(t.hover)).on_click(onClick)
      .child(svg(icon).size(13).flex_none().text_color(t.muted))
      .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.foreground).child(label))
      .when(Boolean(hint), (el) => el.child(div().flex_none().text_size(10.5).font_light().text_color(t.dim).child(hint)));
  }

  render() {
    const t = theme();
    const label = (text) => div().px(12).pt(8).pb(2).text_size(10.5).font_light().text_color(t.dim).child(text);
    return v_flex().id("tabi-space-menu").size_full().py(4)
      .child(this.item("menu-home", "mods/tabi-spaces/house.svg", "~ inicio", () => this.open(home()), t))
      .child(label("Proyectos recientes"))
      .children(this.recent.map((r) => this.item(`menu-${r.name}`, "mods/tabi-spaces/folder.svg", r.name, () => this.open(r.path), t)))
      .when(!this.recent.length, (el) => el.child(div().px(12).py(4).text_size(11.5).font_light().text_color(t.dim).child("Sin proyectos.")))
      .child(div().h(0.5).mx(8).my(6).bg(t.border))
      .child(this.item("menu-pick", "mods/tabi-spaces/folder.svg", "Elegir carpeta…", (_e, cx) => this.choose(cx), t));
  }
}
