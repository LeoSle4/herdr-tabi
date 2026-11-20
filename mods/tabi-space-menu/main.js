// tabi-space-menu: what the "+" of the spaces list opens. "~ inicio", the 6 most recently modified projects of the
// project folders and "Elegir carpeta…" (the system's folder picker). A folder that already has a space can still get
// another one (tabi-spaces tells repeated names apart with a suffix); those entries carry a dim "abierto" note.
// Project folders: the "projectFolders" list of <app home>/tabi.json, e.g. { "projectFolders": ["~/Projects", "D:\\Code"] }
// ("~" and %USERPROFILE% work at the start). Without it: ~/Projects, then ~/Documents/Projects (on Windows also the real,
// possibly OneDrive-redirected, Documents). Only the ones that exist count, and a folder that is a symlink or junction
// to an earlier one is skipped, so no project shows twice.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, home, appHome, run, exec, readTextFile, pickFolder, closeOverlay, props, theme, checking, window as herdrWindow } from "herdr";
import { findSpaceByFolder, recentFromPaths, shellQuote, projectFolders, usableFolders } from "./lib.js";

const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;
const run10s = { timeout: 10000 };

// Windows PowerShell writes to a pipe in the OEM code page, which garbles names like "Música" or "Año": ask for UTF-8.
const PS_UTF8 = "[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false; ";
const powershell = (script) => exec("powershell", ["-NoProfile", "-NonInteractive", "-Command", PS_UTF8 + script], run10s);

let documents = null; // the answer for this session: where Documents is does not change
/** The real Documents folder (OneDrive moves it on many Windows installs), or null. */
function windowsDocuments() {
  documents ??= powershell("[Environment]::GetFolderPath('MyDocuments')")
    .then((r) => (r.code === 0 ? r.stdout.trim() || null : null))
    .catch(() => null);
  return documents;
}

/** "<index>\t<real path>" for each folder that exists, so a symlink or junction to another folder can be told apart. */
async function resolveFolders(folders, windows) {
  const r = windows
    ? await powershell(
        `$i = 0; foreach ($p in @(${folders.map(psQuote).join(",")})) { $i++; ` +
        "if (Test-Path -LiteralPath $p -PathType Container) { $it = Get-Item -LiteralPath $p; " +
        "$t = if ($it.LinkType) { @($it.Target)[0] } else { $null }; " +
        "if ($t -and -not [System.IO.Path]::IsPathRooted($t)) { $t = Join-Path $it.Parent.FullName $t }; " + // relative link target
        "[string]$i + [char]9 + $(if ($t) { $t } else { $it.FullName }) } }")
    : await exec("sh", ["-c",
        `i=0; for r in "$@"; do i=$((i+1)); [ -d "$r" ] && printf '%s\\t%s\\n' "$i" "$(cd "$r" && pwd -P)"; done`, "sh", ...folders], run10s);
  return r.stdout;
}

/** The newest projects across the project folders: [{ name, path }]. */
async function loadRecent() {
  const windows = herdrWindow()?.platform === "windows";
  const config = await readTextFile(`${appHome()}/tabi.json`).catch(() => null);
  const wanted = projectFolders(config, home(), windows ? await windowsDocuments() : null);
  const roots = usableFolders(wanted, await resolveFolders(wanted, windows));
  if (!roots.length) return [];
  // One listing for all the folders, so the order is by modification time across them.
  const r = windows
    ? await powershell(
        `Get-ChildItem -Directory -LiteralPath @(${roots.map(psQuote).join(",")}) -ErrorAction SilentlyContinue | ` +
        "Sort-Object LastWriteTime -Descending | ForEach-Object { $_.FullName }")
    : await exec("sh", ["-c", `ls -1tpd -- ${roots.map((d) => `${shellQuote(d)}/*/`).join(" ")} 2>/dev/null`], run10s);
  return recentFromPaths(r.stdout, 6);
}

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
        this.recent = await loadRecent();
      } catch { /* no projects folder: only the other two entries */ }
      cx.notify();
    });
  }

  /** Opens the folder as a new space, even when another space already has it. */
  open(folder) {
    closeOverlay(props().overlay);
    run("space.new", { folder });
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

  /** "abierto" when a space already has the folder, so a second click is a choice and not an accident. */
  openHint(folder) {
    return findSpaceByFolder(spaces(), whereOf, folder) ? "abierto" : "";
  }

  render() {
    const t = theme();
    const label = (text) => div().px(12).pt(8).pb(2).text_size(10.5).font_light().text_color(t.dim).child(text);
    return v_flex().id("tabi-space-menu").size_full().py(4)
      .child(this.item("menu-home", "mods/tabi-spaces/house.svg", "~ inicio", () => this.open(home()), t, this.openHint(home())))
      .child(label("Proyectos recientes"))
      .children(this.recent.map((r) => this.item(`menu-${r.name}`, "mods/tabi-spaces/folder.svg", r.name, () => this.open(r.path), t, this.openHint(r.path))))
      .when(!this.recent.length, (el) => el.child(div().px(12).py(4).text_size(11.5).font_light().text_color(t.dim).child("Sin proyectos.")))
      .child(div().h(0.5).mx(8).my(6).bg(t.border))
      .child(this.item("menu-pick", "mods/tabi-spaces/folder.svg", "Elegir carpeta…", (_e, cx) => this.choose(cx), t));
  }
}
