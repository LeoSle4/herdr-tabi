import test from "node:test";
import assert from "node:assert/strict";
import { agentOf, look, subline } from "./lib.js";

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

test("subline: space and status", () => {
  assert.equal(subline(agents[0], "terminó"), "herdr-tabi · terminó");
  assert.equal(subline({ space_name: "" }, "te espera"), "sin space · te espera");
});
