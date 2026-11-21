// Pure helpers for the notifications of tabi-status that leave Herdr (the phone through ntfy, the desktop through the system):
// no Herdr calls, so they can be tested with `node --test`. Everything is opt-in: it stays off until
// <app home>/data/tabi/notify.json exists and is valid.

const EVENTS = ["blocked", "done", "check"];
const NAMES = { "claude-code": "Claude Code", codex: "Codex", pi: "Pi", opencode: "OpenCode", gemini: "Gemini" };
const VERB = { blocked: "te necesita", done: "terminó" };
const KANJI = { blocked: "待", done: "済" };
const LABEL = { blocked: "te espera", done: "terminó" };

/** How far from the moment of the change a recorded text may be to still be about it (the hook and Herdr are not ordered). */
export const FRESH_MS = 30000;
/** One try a second: a permission prompt is reported by Claude Code about 6 s after it appears. */
export const WAIT_TRIES = 8;

/**
 * Reads notify.json:
 *   { "desktop": true,                       a system notification when Herdr is not the active window
 *     "topic": "tabi-<random>",              a push to the phone through ntfy (the topic is the only secret on ntfy.sh)
 *     "server": "https://ntfy.sh",           your own ntfy server (https only)
 *     "on": ["blocked", "done", "check"],   check: the result of the command of a task (Asignar tarea…, "comprobar al terminar")
 *     "details": false,                      true: the push carries the character and the first line of what it said
 *     "notifier": "auto",                    "osascript": never use terminal-notifier on macOS (text only, no portrait)
 *     "debug": false }                       true: writes what happens to data/tabi/notify.log (to find out why nothing shows)
 * Returns null (everything off) when the file is not JSON, has neither `desktop` nor a good topic, or the topic is too
 * guessable or the server is not https: a typo must never send the messages somewhere else.
 */
export function parseConfig(text) {
  let c;
  try { c = JSON.parse(text); } catch { return null; }
  if (!c || typeof c !== "object") return null;
  const desktop = c.desktop === true;
  let topic = null;
  let server = "https://ntfy.sh";
  if (c.topic !== undefined) {
    if (typeof c.topic !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(c.topic)) return null;
    topic = c.topic;
    if (c.server !== undefined) {
      if (typeof c.server !== "string" || !/^https:\/\/[A-Za-z0-9.-]+(:\d+)?\/?$/.test(c.server)) return null;
      server = c.server.replace(/\/$/, "");
    }
  }
  if (!topic && !desktop) return null;
  const on = Array.isArray(c.on) ? c.on.filter((e) => EVENTS.includes(e)) : EVENTS;
  return { server, topic, desktop, on, details: c.details === true, notifier: c.notifier === "osascript" ? "osascript" : "auto", debug: c.debug === true };
}

/** Address -> status, for the agents of one reading. */
export function snapshot(agents) {
  return new Map(agents.map((a) => [a.address, a.status]));
}

/**
 * The agents that just changed to a status in `on`. An agent seen for the first time never counts (a machine that
 * connects later brings agents that were already blocked or done), and neither does the very first reading (prev null).
 */
export function changes(prev, agents, on) {
  if (!prev) return [];
  return agents.filter((a) => prev.has(a.address) && prev.get(a.address) !== a.status && on.includes(a.status));
}

/** A `_stop.json` / `_notification.json` file (see tools/tabi_subagents.py) as { text, at }, or null when it is not one. */
export function parseSaid(text) {
  let r;
  try { r = JSON.parse(text); } catch { return null; }
  if (!r || typeof r.text !== "string" || !r.text || typeof r.at !== "number") return null;
  return { text: r.text, at: r.at };
}

/** What the agent said that this change is about: the end of its turn when it finished, what it waits for when blocked. */
export function saidFor(status, stop, notification, at) {
  const rec = status === "done" ? stop : status === "blocked" ? notification : null;
  if (!rec || Math.abs(at - rec.at) > FRESH_MS) return "";
  return rec.text;
}

/** The agent's character (what tabi-party published) or, failing that, the program's name. */
export function nameOf(agent, party) {
  return party?.[agent.address]?.name ?? NAMES[agent.app] ?? "Un agente";
}

/** The notification as a bot would say it: "Mai terminó" over the first line of its answer (or the space when there is none). */
export function localMessage(agent, name, said) {
  return { title: `${name} ${VERB[agent.status]}`, body: said || agent.space_name || "" };
}

/**
 * The JSON to publish on ntfy. With `details` it is the same message as on the desktop; without it, nothing but the program
 * and the status leaves the machine (the server belongs to somebody else).
 */
export function pushPayload(cfg, agent, name, said) {
  // In a JSON message ntfy wants an integer from 1 to 5 (the words "high" and "default" only work in the X-Priority header).
  const priority = agent.status === "blocked" ? 4 : 3;
  if (cfg.details) {
    const m = cardMessage(agent, name, said);
    return { topic: cfg.topic, title: m.title, message: m.body || m.title, priority };
  }
  const who = NAMES[agent.app] ?? "Un agente";
  if (agent.status === "blocked") return { topic: cfg.topic, title: "Herdr: te necesita", message: `${who} necesita tu atención`, priority };
  return { topic: cfg.topic, title: "Herdr: terminó", message: `${who} terminó`, priority };
}

/**
 * The notification of the system. A banner has a fixed shape (the icon of the app, then a bold title, a bold subtitle and a
 * plain text) and two bold lines compete, so it is kept to one: "Kazuto terminó · herdr-tabi" and, below, what the agent said.
 * `image` is the portrait (an absolute path) or null.
 */
export function cardMessage(agent, name, said, image = null) {
  const space = agent.space_name || "sin space";
  return { title: `${name} ${VERB[agent.status] ?? ""} · ${space}`, subtitle: "", body: said || "", image };
}

/** The absolute path of an agent's portrait thumbnail (tabi-party publishes it relative to the app home), or null. */
export function portraitOf(party, address, appHome) {
  const thumb = party?.[address]?.thumb;
  return thumb ? `${appHome}/${thumb}` : null;
}

/**
 * The program that shows a system notification, and its arguments, for each platform. Text goes as arguments, never in a
 * shell line. macOS: terminal-notifier shows the portrait; osascript (always there) shows only text. An empty subtitle is
 * left out, so no blank line is drawn.
 */
export function desktopCommand(platform, card, options = {}) {
  const { title, subtitle, body, image } = card;
  if (platform === "macos") {
    if (options.terminalNotifier) {
      return { command: "terminal-notifier", args: ["-title", title, ...(subtitle ? ["-subtitle", subtitle] : []), "-message", body || " ", "-group", "tabi", ...(image ? ["-contentImage", image] : [])] };
    }
    const show = `display notification (item 2 of argv) with title (item 1 of argv)${subtitle ? " subtitle (item 3 of argv)" : ""}`;
    return { command: "osascript", args: ["-e", "on run argv", "-e", show, "-e", "end run", title, body || " ", ...(subtitle ? [subtitle] : [])] };
  }
  if (platform === "windows") {
    return { command: "powershell", args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", options.script, "-Title", title, ...(subtitle ? ["-Subtitle", subtitle] : []), "-Body", body, ...(image ? ["-Image", image] : [])] };
  }
  return { command: "notify-send", args: ["--app-name=Herdr", ...(image ? ["-i", image] : []), "--", title, [subtitle, body].filter(Boolean).join("\n")] };
}

/** The last `keep` lines of a log with `line` added, each stamped with the time. Newest last. */
export function appendLog(text, line, now, keep = 80) {
  const stamp = new Date(now).toISOString().slice(11, 19);
  const lines = String(text ?? "").split("\n").filter(Boolean);
  lines.push(`${stamp} ${String(line).replace(/\s+/g, " ").slice(0, 300)}`);
  return lines.slice(-keep).join("\n") + "\n";
}

/** What curl printed with `-w "\n%{http_code}"`: the body of the answer and the HTTP status (0 when there was none). */
export function parseCurl(stdout) {
  const lines = String(stdout ?? "").replace(/\s+$/, "").split("\n");
  const code = Number(lines.pop());
  return { code: Number.isInteger(code) ? code : 0, body: lines.join(" ").trim().slice(0, 200) };
}

/**
 * The result of a task's check that tabi-party published (shared "tabi.check") if it is news: newer than the last one seen (`seenAt`).
 * The first reading (seenAt null) never counts, so a Herdr that starts does not announce an old result. Null for anything else.
 */
export function freshCheck(seenAt, rec) {
  if (seenAt == null || !rec || typeof rec !== "object") return null;
  if (rec.state !== "pass" && rec.state !== "fail") return null;
  if (typeof rec.at !== "number" || typeof rec.name !== "string" || !rec.name) return null;
  return rec.at > seenAt ? rec : null;
}

/** The notice of the system for a check: who, whether it passed and the last thing the command printed. `image` is the portrait or null. */
export function checkCard(c, image = null) {
  const pass = c.state === "pass";
  return { title: `${c.name}: la comprobación ${pass ? "pasó ✓" : "falló ✗"}`, subtitle: "", body: [c.verify, c.tail].filter(Boolean).join(" · "), image };
}

/** The push for a check. Without `details` only the outcome leaves the machine (not the name, the command or its output). */
export function checkPush(cfg, c) {
  const pass = c.state === "pass";
  const priority = pass ? 3 : 4;
  if (cfg.details) {
    const m = checkCard(c);
    return { topic: cfg.topic, title: m.title, message: m.body || m.title, priority };
  }
  return { topic: cfg.topic, title: `Herdr: la comprobación ${pass ? "pasó" : "falló"}`, message: `Una comprobación ${pass ? "pasó" : "falló"}`, priority };
}
