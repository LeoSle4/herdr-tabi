// Pure helpers for the push notifications of tabi-status: no Herdr calls, so they can be tested with `node --test`.
// The feature is opt-in: it stays off until <app home>/data/tabi/notify.json exists and is valid.

const EVENTS = ["blocked", "done"];
const NAMES = { "claude-code": "Claude Code", codex: "Codex", pi: "Pi", opencode: "OpenCode", gemini: "Gemini" };

/**
 * Reads notify.json: { "topic": "tabi-<random>", "server": "https://ntfy.sh", "on": ["blocked","done"], "details": false }.
 * Returns null (feature off) when the file is not JSON, the topic is missing or too guessable, or the server is
 * given but is not an https address: a typo must never send the messages somewhere else.
 */
export function parseConfig(text) {
  let c;
  try { c = JSON.parse(text); } catch { return null; }
  if (!c || typeof c.topic !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(c.topic)) return null;
  let server = "https://ntfy.sh";
  if (c.server !== undefined) {
    if (typeof c.server !== "string" || !/^https:\/\/[A-Za-z0-9.-]+(:\d+)?\/?$/.test(c.server)) return null;
    server = c.server.replace(/\/$/, "");
  }
  const on = Array.isArray(c.on) ? c.on.filter((e) => EVENTS.includes(e)) : EVENTS;
  return { server, topic: c.topic, on, details: c.details === true };
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

function agentName(a) {
  return NAMES[a.app] ?? "Un agente";
}

/** Title, body and ntfy priority. The space name is sent only when `details` is on: the server is somebody else's. */
export function message(agent, details) {
  const who = details && agent.space_name ? `${agentName(agent)} en ${agent.space_name}` : agentName(agent);
  if (agent.status === "blocked") return { title: "Herdr: te necesita", body: `${who} necesita tu atención`, priority: "high" };
  return { title: "Herdr: terminó", body: `${who} terminó`, priority: "default" };
}

export function endpoint(cfg) {
  return `${cfg.server}/${cfg.topic}`;
}
