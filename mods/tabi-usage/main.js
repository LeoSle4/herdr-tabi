// tabi-usage: plan usage (5-hour and weekly windows) of the Claude accounts and Codex on this computer.
//   Accounts: "claude" (config dir ~/.claude) plus one per wrapper script ~/.local/bin/claude* that sets CLAUDE_CONFIG_DIR
//           (e.g. claude2; on Windows only .cmd, .bat or .ps1 wrappers count, never claude.exe). They are published to every mod as shared("tabi.accounts"): [{ name, dir, default, bin }].
//   Claude: GET https://api.anthropic.com/api/oauth/usage with the Claude Code login of each account. The login is read
//           ONCE per account (macOS Keychain item "Claude Code-credentials", or "Claude Code-credentials-<sha256(dir)[:8]>"
//           for another config dir; elsewhere <dir>/.credentials.json), kept only in memory (`credential` below), sent only
//           to api.anthropic.com, never written or logged, never refreshed here. If the person denies the Keychain prompt
//           the meter says "sin acceso" and does not ask again until Herdr restarts.
//           A second account's token is NOT read until the person allows it: create data/tabi/allow-token-<name> (the
//           existence of its Keychain item is checked with metadata only, never with -w); until then it says "permiso pendiente".
//   Codex:  codex_usage.py asks the official `codex app-server`; no token passes through this mod.
// At most one reading per agent every 5 minutes (failures count), cached in data/tabi/usage.json. A failed
// reading keeps the last numbers and flags them "desactualizado".
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import * as fs from "fs/promises";
import { exec, appHome, home, notify, theme, shared, setShared, checking, window as herdrWindow } from "herdr";
import { mayRead, minutesUntilNext, canReread, pickCredential, keychainOutcome, tokenExpired, parseClaudeUsage, afterReading,
  windowView, usageLevel, ageLabel, renewShort, renewTooltip, ringFile, buildAccounts, buildWindowsAccounts, windowsWrapperName, keychainService, displayName,
  RATE_LIMIT_BACKOFF_MS, MIN_INTERVAL_MS } from "./lib.js";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const allowFile = (acc) => `${appHome()}/data/tabi/allow-token-${acc.name}`;
const cacheFile = () => `${appHome()}/data/tabi/usage.json`;

// Module scope is shared by every copy of this mod, which is what "once per Herdr session" needs.
const creds = new Map(); // account name -> promise of its login
const rereadFor = new Map(); // account name -> { expiresAt, at } of the last re-read after an expiry (see canReread)
const hashes = new Map(); // config dir -> first 8 hex digits of its SHA-256 (the Keychain service suffix)
let accounts = null; // [{ name, dir, default }], found by scanAccounts
let cache = null; // { claude: entry, claude2: entry, codex: entry }, loaded once from disk
let busy = null;

/** Windows: the wrapper scripts in ~/.local/bin (claude2.cmd, claude2.ps1...) that set CLAUDE_CONFIG_DIR, plus the default account. */
async function scanWindowsAccounts(bin) {
  let names;
  try { names = await fs.readdir(bin); } catch { return buildWindowsAccounts([], home()); }
  const files = [];
  for (const file of names.filter((n) => windowsWrapperName(n))) {
    try {
      const text = await fs.readFile(`${bin}/${file}`, "utf8");
      if (text.length <= 65536) files.push({ file, text }); // a wrapper is a few lines; anything big is not one
    } catch { /* unreadable: not an account */ }
  }
  return buildWindowsAccounts(files, home());
}

/** Finds the accounts: the default one plus a wrapper in ~/.local/bin that sets CLAUDE_CONFIG_DIR, and tells every mod. */
async function scanAccounts() {
  const bin = `${home()}/.local/bin`;
  const script = 'for f in "$1"/claude*; do n=${f##*/}; [ "$n" = claude ] && continue; [ -f "$f" ] || continue; l=$(grep -a -m1 "CLAUDE_CONFIG_DIR=" "$f" 2>/dev/null) || continue; printf "%s\\t%s\\n" "$n" "$l"; done';
  let found = accounts ?? buildAccounts("", home());
  if (herdrWindow()?.platform === "windows") {
    // No shell, no grep: the wrapper scripts (.cmd, .bat, .ps1) are read here. A binary such as claude.exe never counts.
    try { found = await scanWindowsAccounts(bin); } catch { /* keep what was found */ }
  } else {
    try {
      const r = await exec("sh", ["-c", script, "accounts", bin], { timeout: 10000 });
      if (r.code === 0) found = buildAccounts(r.stdout, home());
    } catch { /* no shell: only the default account */ }
  }
  accounts = found;
  const shown = found.map((a) => ({ name: a.name, dir: a.dir, default: a.default, bin: a.default ? "claude" : `${bin}/${a.file ?? a.name}` }));
  if (JSON.stringify(shared("tabi.accounts")) !== JSON.stringify(shown)) setShared("tabi.accounts", shown);
  return found;
}

/** Every meter, in the order shown: the Claude accounts, then Codex. */
function meters() {
  return [...(accounts ?? buildAccounts("", home())).map((a) => ({ id: a.name, label: displayName(a.name), account: a })), { id: "codex", label: "Codex" }];
}

async function dirHash(dir) {
  if (!hashes.has(dir)) {
    const r = await exec("sh", ["-c", 'printf %s "$1" | shasum -a 256 | cut -c1-8', "hash", dir], { timeout: 10000 });
    hashes.set(dir, r.stdout.trim());
  }
  return hashes.get(dir);
}

/**
 * Reads the Claude Code login: once per Herdr session, plus ONE more read when that login has expired
 * (the person sees the Keychain prompt again). Resolves to { state: "ok", token, expiresAt } or
 * { state: "denied" | "nologin" | "unreadable" }. Never written to disk, never refreshed here.
 */
async function credential(acc) {
  let p = creds.get(acc.name);
  if (!p) { p = loadCredential(acc); creds.set(acc.name, p); }
  const c = await p;
  // "waiting for permission" and "no login yet" are not remembered: the next reading looks again.
  if (c.state === "gated" || c.state === "nologin") creds.delete(acc.name);
  return c;
}

/** After an expiry or a 401: read the Keychain again, once for this login. Returns the new (or the same) login. */
async function reread(acc, old) {
  if (!canReread(old, rereadFor.get(acc.name), Date.now())) return old;
  rereadFor.set(acc.name, { expiresAt: String(old.expiresAt), at: Date.now() });
  const p = loadCredential(acc);
  creds.set(acc.name, p);
  return p;
}

function loadCredential(acc) {
  return (async () => {
    let text;
    if (herdrWindow().platform === "macos") {
      let r;
      const service = keychainService(acc, acc.default ? "" : await dirHash(acc.dir));
      if (!acc.default) {
        // Metadata only (no -w): does this account have a Keychain item at all? That needs no permission.
        let meta;
        try { meta = await exec("security", ["find-generic-password", "-s", service], { timeout: 15000 }); } catch { return { state: "nologin" }; }
        if (meta.code !== 0) return { state: "nologin" };
        // The token itself is read only once the person has allowed it (that read makes macOS ask for permission).
        if (!(await fs.exists(allowFile(acc)))) return { state: "gated" };
      }
      try {
        // 2 minutes: macOS waits for the person to answer the permission dialog. A timeout counts as a denial.
        r = await exec("security", ["find-generic-password", "-s", service, "-w"], { timeout: 120000 });
      } catch {
        return { state: "denied" };
      }
      const outcome = keychainOutcome(r.code);
      if (outcome !== "ok") return { state: outcome };
      text = r.stdout;
    } else {
      try {
        text = await fs.readFile(`${acc.dir}/.credentials.json`, "utf8");
      } catch {
        return { state: "nologin" };
      }
    }
    try {
      return { state: "ok", ...pickCredential(text) };
    } catch {
      return { state: "unreadable" };
    }
  })();
}

async function claudeEmail(acc) {
  // The default account keeps its file next to the home folder, the others inside their config dir.
  const file = acc.default ? `${home()}/.claude.json` : `${acc.dir}/.claude.json`;
  try {
    return JSON.parse(await fs.readFile(file, "utf8"))?.oauthAccount?.emailAddress ?? null;
  } catch {
    return null;
  }
}

async function readClaude(acc) {
  let c = await credential(acc);
  const expired = { ok: false, error: "sesión caducada: abre Claude Code y haz clic aquí" };
  // An expired login is read from the Keychain again (once); the person may be asked for permission again.
  if (c.state === "ok" && tokenExpired(c, Date.now())) c = await reread(acc, c);
  if (c.state === "denied") return { ok: false, denied: true, error: "sin acceso" };
  if (c.state === "gated") return { ok: false, gated: true, error: "permiso pendiente" };
  if (c.state === "nologin") return { ok: false, error: acc.default ? "sin sesión de Claude Code" : `sin sesión en ${acc.name}` };
  if (c.state !== "ok") return { ok: false, error: "credencial ilegible" };
  if (tokenExpired(c, Date.now())) return expired;
  const ask = (token) => fetch(USAGE_URL, { headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" } });
  let res;
  try {
    res = await ask(c.token);
    if (res.status === 401) {
      // The server refused a login we thought valid: same single re-read, then one more try.
      const again = await reread(acc, c);
      if (again.state === "denied") return { ok: false, denied: true, error: "sin acceso" };
      if (again.state !== "ok" || again.token === c.token) return expired;
      c = again;
      res = await ask(c.token);
    }
  } catch {
    return { ok: false, error: "sin conexión" };
  }
  if (res.status === 401) return expired;
  if (res.status === 429) return { ok: false, error: "límite de lecturas (429)", extraWaitMs: RATE_LIMIT_BACKOFF_MS - MIN_INTERVAL_MS };
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  try {
    return { ok: true, windows: parseClaudeUsage(await res.json()), email: await claudeEmail(acc) };
  } catch {
    return { ok: false, error: "respuesta ilegible" };
  }
}

async function readCodex() {
  const py = herdrWindow().platform === "windows" ? "python" : "python3";
  try {
    const r = await exec(py, ["-X", "utf8", `${appHome()}/mods/tabi-usage/codex_usage.py`], { timeout: 60000 });
    if (r.code !== 0) return { ok: false, error: (r.stderr || "").trim().split("\n").pop() || `python exited with ${r.code}` };
    const d = JSON.parse(r.stdout);
    return d.error ? { ok: false, error: d.error } : { ok: true, windows: d.windows, email: d.email, plan: d.plan };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

async function loadCache() {
  if (cache) return cache;
  try {
    const d = JSON.parse(await fs.readFile(cacheFile(), "utf8"));
    cache = { claude: d.claude ?? null, codex: d.codex ?? null };
  } catch {
    cache = { claude: null, codex: null };
  }
  return cache;
}

/** Reads every agent that is due. Returns how many readings ran. One run at a time, whatever the number of copies. */
function refresh() {
  busy ??= (async () => {
    await loadCache();
    await scanAccounts();
    let ran = 0;
    for (const m of meters()) {
      const now = Date.now();
      if (!mayRead(now, cache[m.id]?.checkedAt)) continue;
      const outcome = m.account ? await readClaude(m.account) : await readCodex();
      if (outcome.gated) {
        // Waiting for the person's permission: show it, but don't count it as a reading (it is looked at again next tick).
        if (!cache[m.id]?.gated) { cache[m.id] = { windows: [], gated: true, error: null }; ran += 1; }
        continue;
      }
      cache[m.id] = afterReading(cache[m.id], Date.now(), outcome);
      ran += 1;
    }
    if (ran) {
      try {
        await fs.mkdir(`${appHome()}/data/tabi`, { recursive: true });
        await fs.writeFile(cacheFile(), JSON.stringify(cache));
      } catch { /* the meter still works without its cache file */ }
      setShared("tabi.usage.rev", (shared("tabi.usage.rev") ?? 0) + 1);
    }
    return ran;
  })().finally(() => { busy = null; });
  return busy;
}

// One line, 34 px: "旅 tabi", then per account its name and two rings (22 px) with their %: "5 h 46 % · renueva 14:40"
// and "semana 25 % · lun" (local time). Hovering a measurement shows "se renueva en 4 h 05 min (14:40)". Thin dividers
// separate the accounts; on the right "hace N min" (amber when a reading failed). Rings and % are neutral, amber from
// 50 %, soft red from 85 %; a stale reading is gray.
const LEVEL_COLOR = { ok: "#8fa0b6", warn: "#d9a441", high: "#cf7a72" };
const STALE_COLOR = "#6b7684";
const AMBER = "#d9a441";
const RING = 22;

export default class TabiUsage extends View {
  init(_props, cx) {
    this.ready = false;
    if (checking()) return;
    this.tick(cx);
    cx.timer.every(30000, (cx) => this.tick(cx));
  }

  tick(cx) {
    cx.spawn(async (cx) => {
      await refresh();
      this.ready = true;
      cx.notify();
    });
  }

  manual(cx) {
    const ids = meters().map((m) => m.id);
    const due = ids.some((a) => mayRead(Date.now(), cache?.[a]?.checkedAt));
    if (!due) {
      const next = Math.min(...ids.map((a) => minutesUntilNext(Date.now(), cache?.[a]?.checkedAt ?? 0)));
      return notify({ title: "Uso actualizado hace poco", body: `Próxima lectura en ${next} min`, level: "info" });
    }
    // A click on an expired Claude meter is the person asking again: allow one more Keychain read.
    for (const m of meters()) if (m.account && cache?.[m.id]?.error?.startsWith("sesión caducada")) rereadFor.delete(m.id);
    this.tick(cx);
  }

  /** One measurement: a 22 px ring, its label and %, and (from the renewal time) when it resets, with a tooltip. */
  measure(id, w, name, stale, now, t) {
    const color = stale ? STALE_COLOR : LEVEL_COLOR[usageLevel(w.used ?? 0)];
    const short = renewShort(w.label, w.resets);
    const tip = renewTooltip(w.resets, now);
    return h_flex().id(id).items_center().gap(8).flex_none()
      .when(Boolean(tip), (el) => el.tooltip(tip))
      .child(div().relative().w(RING).h(RING).flex_none()
        .child(svg("mods/tabi-usage/rings/track.svg").absolute().top(0).left(0).w(RING).h(RING).text_color(t.input))
        .when(w.used != null, (el) => el.child(svg(ringFile(w.used)).absolute().top(0).left(0).w(RING).h(RING).text_color(color))))
      .child(h_flex().items_baseline().gap(6)
        .child(div().text_size(11).font_light().text_color(t.muted).child(name))
        .child(div().text_size(12).text_color(color).child(w.used == null ? "—" : `${w.used} %`))
        .when(Boolean(short), (el) => el.child(div().text_size(10.5).font_light().text_color(t.dim).child(`· ${short}`))));
  }

  account(agent, name, now, t) {
    const e = cache?.[agent];
    const row = h_flex().id(`usage-${agent}`).items_center().gap(14).flex_none()
      .child(div().text_size(12).text_color(t.foreground).child(name));
    if (!e) return row.child(div().text_size(11).font_light().text_color(t.dim).child(this.ready ? "sin datos" : "leyendo…"));
    if (e.denied) return row.child(div().text_size(11).font_light().text_color(t.muted).child("sin acceso"));
    if (e.gated) return row.child(div().text_size(11).font_light().text_color(AMBER).child("permiso pendiente"));
    const stale = !!e.error;
    const windows = (e.windows ?? []).map((w) => windowView(w, e, now));
    if (!windows.length) return row.child(div().text_size(11).font_light().text_color(t.dim).child(e.error ?? "sin datos"));
    const five = windows.find((w) => w.label !== "weekly") ?? windows[0];
    const week = windows.find((w) => w.label === "weekly");
    row.child(this.measure(`usage-${agent}-5h`, five, "5 h", stale, now, t));
    if (week) row.child(this.measure(`usage-${agent}-week`, week, "semana", stale, now, t));
    return row;
  }

  render(cx) {
    shared("tabi.usage.rev"); // reading it re-renders this copy when another copy ran a reading
    const t = theme();
    const now = Date.now();
    const list = meters();
    // Only meters that have (or had) numbers count for the age: one waiting for permission or with no login would hide it.
    const entries = list.map((m) => cache?.[m.id]).filter((e) => e && !e.denied && !e.gated && (e.windows?.length || e.okAt != null));
    const stale = entries.some((e) => e.error);
    const oldest = entries.length && entries.every((e) => e.okAt != null) ? Math.min(...entries.map((e) => e.okAt)) : null;
    const age = ageLabel(oldest, now);
    // macOS keeps room for its traffic lights; elsewhere the window buttons are on the right, so start at the edge.
    const leftPad = herdrWindow()?.platform === "macos" ? 84 : 14;
    const bar = h_flex().id("tabi-usage").size_full().items_center().gap(18).pl(leftPad).pr(16).bg(t.chrome)
      .on_click((_e, cx) => this.manual(cx))
      .child(h_flex().items_baseline().gap(8).flex_none()
        .child(div().text_size(15).text_color(t.foreground).child("旅"))
        .child(div().text_size(12).font_light().text_color(t.muted).child("tabi")));
    for (const m of list) {
      bar.child(div().w(0.5).h(16).flex_none().bg(t.input));
      bar.child(this.account(m.id, m.label, now, t));
    }
    return bar.child(div().flex_1())
      .when(age, (el) => el.child(div().text_size(10.5).font_light().text_color(stale ? AMBER : t.dim).child(age)));
  }
}
