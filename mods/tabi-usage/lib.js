// Pure helpers for the tabi-usage mod: no Herdr calls, so they can be tested with `node --test`.

export const MIN_INTERVAL_MS = 5 * 60 * 1000;
/** After a 429 the server is left alone for twice the normal interval (fetch can't read Retry-After). */
export const RATE_LIMIT_BACKOFF_MS = 2 * MIN_INTERVAL_MS;

/** True when a reading is allowed: never more often than every 5 minutes, failures included. */
export function mayRead(now, checkedAt) {
  return !checkedAt || now - checkedAt >= MIN_INTERVAL_MS;
}

/** Whole minutes until the next allowed reading (at least 1 while waiting). */
export function minutesUntilNext(now, checkedAt) {
  return Math.max(1, Math.ceil((checkedAt + MIN_INTERVAL_MS - now) / 60000));
}

/**
 * From what `security find-generic-password -w` printed (or .credentials.json), only the access token
 * and its expiry. The refresh token and everything else in the entry are dropped here and never kept.
 */
export function pickCredential(text) {
  const oauth = JSON.parse(text)?.claudeAiOauth;
  if (!oauth || typeof oauth.accessToken !== "string" || !oauth.accessToken) throw new Error("no accessToken in the entry");
  return { token: oauth.accessToken, expiresAt: typeof oauth.expiresAt === "number" ? oauth.expiresAt : null };
}

/** The Keychain's exit code: 0 read, 44 no such item (nobody logged in), anything else = no access. */
export function keychainOutcome(code) {
  return code === 0 ? "ok" : code === 44 ? "nologin" : "denied";
}

/**
 * An expired (or refused, 401) login may be read from the Keychain again, but only once per login:
 * `rereadFor` is the expiry of the login that was already re-read. A re-read that brings back the same
 * login (Claude Code hasn't renewed it yet) is not repeated, so the prompt can't loop.
 */
export function canReread(cred, rereadFor) {
  return cred.state === "ok" && String(cred.expiresAt) !== rereadFor;
}

export function tokenExpired(cred, now) {
  return cred.expiresAt != null && now >= cred.expiresAt;
}

/** The two windows Claude's usage endpoint reports. */
export function parseClaudeUsage(data) {
  const ms = (v) => (v ? new Date(v).getTime() : null);
  return [["5h", data?.five_hour], ["weekly", data?.seven_day]]
    .filter(([, w]) => w && w.utilization != null)
    .map(([label, w]) => ({ label, used: Math.round(w.utilization), resets: ms(w.resets_at) }));
}

/**
 * The cache entry after a reading. A failure keeps the last good windows and marks them stale, so the
 * meter shows the last value with a "desactualizado" flag instead of going blank.
 */
export function afterReading(prev, now, outcome) {
  if (outcome.ok) {
    return { windows: outcome.windows, email: outcome.email ?? prev?.email ?? null, plan: outcome.plan ?? prev?.plan ?? null,
      okAt: now, checkedAt: now, error: null };
  }
  return { windows: prev?.windows ?? [], email: prev?.email ?? null, plan: prev?.plan ?? null, okAt: prev?.okAt ?? null,
    checkedAt: now + (outcome.extraWaitMs ?? 0), error: outcome.error, denied: !!outcome.denied };
}

/** A window that has reset since the last good reading no longer says what it said. */
export function windowView(w, entry, now) {
  const gone = entry.error && w.resets != null && w.resets <= now;
  return { label: w.label, used: gone ? null : w.used, resets: gone ? null : w.resets };
}

export function untilReset(resets, now) {
  if (resets == null) return "";
  const m = Math.max(0, Math.round((resets - now) / 60000));
  if (m < 60) return `${m} min`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}

export function windowName(label) {
  return label === "weekly" ? "sem" : label;
}

/** "ok" up to 50 %, "warn" (amber) from 50 %, "high" (soft red) from 85 %. */
export function usageLevel(used) {
  return used >= 85 ? "high" : used >= 50 ? "warn" : "ok";
}

/** "↺ 4h17": hours and minutes stuck together; "17m" under an hour; "2d5h" from a day. */
export function compactReset(resets, now) {
  if (resets == null) return "";
  const m = Math.max(0, Math.round((resets - now) / 60000));
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  return `${Math.floor(m / 1440)}d${Math.floor((m % 1440) / 60)}h`;
}

/** "hace 3 min", for the age of the oldest good reading shown; null when there is none. */
export function ageLabel(okAt, now) {
  if (okAt == null) return null;
  const m = Math.max(0, Math.floor((now - okAt) / 60000));
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  return `hace ${Math.floor(m / 60)} h`;
}

const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** Local clock time of a timestamp: "14:40". */
export function clock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Local abbreviated weekday: "lun". */
export function dayAbbr(ms) {
  return DAYS[new Date(ms).getDay()];
}

/** The short renewal text next to a ring: "renueva 14:40" for the 5 h window, "lun" for the weekly one. */
export function renewShort(label, resets) {
  if (resets == null) return "";
  return label === "weekly" ? dayAbbr(resets) : `renueva ${clock(resets)}`;
}

/** The time left with the minutes padded: "4 h 05 min", "17 min", "5 d 14 h". */
export function inTime(resets, now) {
  const m = Math.max(0, Math.round((resets - now) / 60000));
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
  return `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`;
}

/** The tooltip of a measurement: "se renueva en 4 h 05 min (14:40)"; with the weekday from a day away ("lun 18:00"). */
export function renewTooltip(resets, now) {
  if (resets == null) return "";
  const far = resets - now >= 24 * 3600000;
  return `se renueva en ${inTime(resets, now)} (${far ? `${dayAbbr(resets)} ` : ""}${clock(resets)})`;
}

/** The smallest arc drawn, in %, so a ring never looks empty (a reading of 0 % still shows a sliver). */
export const MIN_ARC = 6;

/** Path of the ring file for a percentage: rounded, clamped to MIN_ARC..100. */
export function ringFile(used) {
  const n = Math.min(100, Math.max(MIN_ARC, Math.round(used ?? 0)));
  return `mods/tabi-usage/rings/ring-${n}.svg`;
}

/**
 * The account a wrapper script makes: `parseWrapper("claude2", 'export CLAUDE_CONFIG_DIR="$HOME/.claude-cuenta2"', home)`
 * -> { name: "claude2", dir: "<home>/.claude-cuenta2" }; null when the line sets no CLAUDE_CONFIG_DIR.
 */
export function parseWrapper(name, line, home) {
  const m = /CLAUDE_CONFIG_DIR=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(line ?? "");
  if (!m) return null;
  const raw = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{HOME\}|\$HOME/g, home).replace(/^~(?=\/|$)/, home).replace(/\/+$/, "");
  return raw ? { name, dir: raw } : null;
}

/** The account a Windows wrapper (.cmd, .bat or .ps1) makes, from one line of it:
 *    set "CLAUDE_CONFIG_DIR=%USERPROFILE%\.claude2"      (cmd, bat)
 *    $env:CLAUDE_CONFIG_DIR = "$HOME\.claude2"            (ps1)
 *  -> { name, dir }. Null when the line sets no CLAUDE_CONFIG_DIR, or the folder uses a variable that is not resolved here. */
export function parseWindowsWrapper(name, line, home) {
  const m = /^\s*(?:@?set\s+"?CLAUDE_CONFIG_DIR=([^"\r\n]*)"?|\$env:CLAUDE_CONFIG_DIR\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))/i.exec(line ?? "");
  if (!m) return null;
  const raw = (m[1] ?? m[2] ?? m[3] ?? m[4] ?? "").trim()
    .replace(/%USERPROFILE%|%HOME%|\$\{?env:USERPROFILE\}?|\$\{?env:HOME\}?|\$\{HOME\}|\$HOME/gi, () => home)
    .replace(/^~(?=[\\/]|$)/, home)
    .replace(/[\\/]+$/, "");
  return raw && !/%|\$/.test(raw) ? { name, dir: raw } : null;
}

/** "claude2.cmd" -> "claude2". Only .cmd, .bat and .ps1 files whose name starts with "claude" are wrapper candidates:
 *  never a binary (claude.exe), and never plain "claude", which is the default account. Null for anything else. */
export function windowsWrapperName(file) {
  const m = /^(claude.*)\.(?:cmd|bat|ps1)$/i.exec(file ?? "");
  return m && m[1].toLowerCase() !== "claude" ? m[1] : null;
}

const withDefault = (wrappers, home) =>
  [{ name: "claude", dir: `${home}/.claude`, default: true }, ...wrappers.sort((a, b) => a.name.localeCompare(b.name)).map((w) => ({ ...w, default: false }))];

/** Output of the wrapper scan, "name<TAB>line" per file, into accounts: claude (the default) first, then the wrappers by name. */
export function buildAccounts(scanOut, home) {
  return withDefault((scanOut ?? "").split("\n")
    .map((l) => { const i = l.indexOf("\t"); return i < 0 ? null : parseWrapper(l.slice(0, i), l.slice(i + 1), home); })
    .filter(Boolean), home);
}

/** Windows: the wrapper files found in ~/.local/bin, [{ file, text }], into accounts. The first line of a file that sets
 *  CLAUDE_CONFIG_DIR decides; a name taken by two files (claude2.cmd and claude2.ps1) is one account, the first file by name.
 *  Each account keeps its `file`, which is what has to be run to start it. */
export function buildWindowsAccounts(files, home) {
  const byName = new Map();
  for (const { file, text } of [...(files ?? [])].sort((a, b) => a.file.localeCompare(b.file))) {
    const name = windowsWrapperName(file);
    if (!name || byName.has(name)) continue;
    for (const line of String(text ?? "").split(/\r?\n/)) {
      const w = parseWindowsWrapper(name, line, home);
      if (w) { byName.set(name, { ...w, file }); break; }
    }
  }
  return withDefault([...byName.values()], home);
}

/** Keychain service Claude Code uses for an account: the default has the plain name, others get a suffix made of
 *  the first 8 hex digits of the SHA-256 of the config dir (Claude Code's convention; checked against the Keychain). */
export function keychainService(account, dirHash8) {
  return account.default ? "Claude Code-credentials" : `Claude Code-credentials-${dirHash8}`;
}

/** "Claude", "Claude2", "Codex": the name shown in the bar. */
export function displayName(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Short tag of an account for small labels: "claude" -> "c1", "claude2" -> "c2", "codex" -> "cx". */
export function shortTag(name) {
  const m = /^claude(\d*)$/.exec(name);
  return m ? `c${m[1] || "1"}` : name.slice(0, 2);
}
