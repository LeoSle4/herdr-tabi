// Pure helpers for the tabi-toast mod: no Herdr calls, so they can be tested with `node --test`.

/**
 * The agent a notification is about, from the target of its click action (agent.focus {terminal}, pane.focus {pane}...).
 * null when the action names no agent that is alive: the notification is then drawn the plain, original way.
 */
export function agentOf(action, agents) {
  const args = action?.args;
  if (!args || typeof args !== "object") return null;
  for (const key of [args.terminal, args.pane, args.agent, args.address]) {
    if (typeof key !== "string" || !key) continue;
    const hit = agents.find((a) => a.address === key || a.pane === key);
    if (hit) return hit;
  }
  return null;
}

/** Kanji, label and theme color of the status a card announces. The notification is about the agent's status right now. */
export function look(status) {
  if (status === "done") return { kanji: "済", label: "terminó", color: "done" };
  if (status === "blocked") return { kanji: "待", label: "te espera", color: "blocked" };
  if (status === "working") return { kanji: "働", label: "trabajando", color: "solid" };
  return { kanji: "済", label: "en reposo", color: "idle" };
}

/** How far from the moment the notification opened a recorded text may be to still be about it (the hook and Herdr's
 *  status change are not ordered: the text can arrive a few seconds before or after). */
export const FRESH_MS = 30000;

/** A `_stop.json` / `_notification.json` file (see tools/tabi_subagents.py) as { text, at }, or null when it is not one. */
export function parseSaid(text) {
  let r;
  try { r = JSON.parse(text); } catch { return null; }
  if (!r || typeof r.text !== "string" || !r.text || typeof r.at !== "number") return null;
  return { text: r.text, at: r.at };
}

/**
 * What the agent said that this notification is about: the end of its turn when it finished, what it waits for when it is
 * blocked. "" when there is nothing, or only something from another moment.
 */
export function saidFor(status, stop, notification, openedAt) {
  const rec = status === "done" ? stop : status === "blocked" ? notification : null;
  if (!rec || Math.abs(openedAt - rec.at) > FRESH_MS) return "";
  return rec.text;
}

/** The line under the name, like a bot message: "terminó: Arreglé el CI". Just the status when there is nothing to add. */
export function subline(label, said) {
  return said ? `${label}: ${said}` : label;
}
