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

/** The line under the name: "space · what it says". */
export function subline(agent, label) {
  return `${agent.space_name || "sin space"} · ${label}`;
}
