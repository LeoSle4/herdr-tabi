import test from "node:test";
import assert from "node:assert/strict";
import { agentOf, look, subline, parseSaid, saidFor, FRESH_MS } from "./lib.js";

const agents = [
  { address: "t1d", pane: "p1", space_name: "herdr-tabi", status: "done" },
  { address: "msi-casa/t5", pane: "msi-casa/p3", space_name: "PitLane", status: "blocked" },
];

test("agentOf: finds the agent by the terminal or pane its click action targets", () => {
  assert.equal(agentOf({ name: "agent.focus", args: { terminal: "t1d" } }, agents), agents[0]);
  assert.equal(agentOf({ name: "pane.focus", args: { pane: "msi-casa/p3" } }, agents), agents[1]);
  assert.equal(agentOf({ name: "pane.focus", args: { pane: "nope", terminal: "msi-casa/t5" } }, agents), agents[1]);
});

test("agentOf: no action, no target or an unknown agent means a plain notification", () => {
  assert.equal(agentOf(undefined, agents), null);
  assert.equal(agentOf({ name: "space.select", args: { id: "s1" } }, agents), null);
  assert.equal(agentOf({ name: "agent.focus", args: { terminal: "t99" } }, agents), null);
  assert.equal(agentOf({ name: "agent.focus", args: "t1d" }, agents), null);
  assert.equal(agentOf({ name: "agent.focus", args: { terminal: "t1d" } }, []), null);
});

test("look: finished 済 and waiting 待 have their own colors", () => {
  assert.deepEqual(look("done"), { kanji: "済", label: "terminó", color: "done" });
  assert.deepEqual(look("blocked"), { kanji: "待", label: "te espera", color: "blocked" });
  assert.equal(look("working").kanji, "働");
  assert.equal(look("idle").label, "en reposo");
});

test("subline: reads like a bot message when there is something to say", () => {
  assert.equal(subline("terminó", "Arreglé el CI"), "terminó: Arreglé el CI");
  assert.equal(subline("te espera", ""), "te espera");
  assert.equal(subline("terminó", undefined), "terminó");
});

test("parseSaid: a hook file becomes { text, at }", () => {
  assert.deepEqual(parseSaid('{"text":"Listo.","at":5}'), { text: "Listo.", at: 5 });
  for (const bad of ["not json", "null", "{}", '{"text":"","at":5}', '{"text":"x"}', '{"text":"x","at":"5"}', '{"text":4,"at":5}']) assert.equal(parseSaid(bad), null, bad);
});

test("saidFor: the end of the turn for a finished agent, the question for a blocked one", () => {
  const stop = { text: "Listo.", at: 1000 };
  const notification = { text: "Claude needs your permission to use Bash", at: 1000 };
  assert.equal(saidFor("done", stop, notification, 2000), "Listo.");
  assert.equal(saidFor("blocked", stop, notification, 2000), "Claude needs your permission to use Bash");
  assert.equal(saidFor("working", stop, notification, 2000), "");
  assert.equal(saidFor("idle", stop, notification, 2000), "");
});

test("saidFor: a text from another moment is never shown", () => {
  const stop = { text: "old turn", at: 1000 };
  assert.equal(saidFor("done", stop, null, 1000 + FRESH_MS), "old turn"); // right at the edge
  assert.equal(saidFor("done", stop, null, 1000 + FRESH_MS + 1), "");
  assert.equal(saidFor("done", stop, null, 1000 - FRESH_MS), "old turn"); // the hook may run after the toast opens
  assert.equal(saidFor("done", stop, null, 1000 - FRESH_MS - 1), "");
  assert.equal(saidFor("done", null, null, 1000), "");
});
