import test from "node:test";
import assert from "node:assert/strict";
import { agentChoices, characterChoices, rows, buildLaunch } from "./lib.js";

const known = [
  { key: "claude", name: "Claude Code", run: ["claude"], installed: true },
  { key: "codex", name: "Codex", run: ["codex"], installed: true },
  { key: "gemini", name: "Gemini", run: ["gemini"], installed: false },
  { key: "broken", name: "No command", run: [], installed: true },
];

test("agentChoices: installed agents with a command, then the extra Claude accounts", () => {
  const accounts = [{ name: "claude", default: true, bin: "/x/claude" }, { name: "claude2", default: false, bin: "/x/claude2" }];
  assert.deepEqual(agentChoices(known, accounts), [
    { key: "claude", name: "Claude Code", argv: ["claude"] },
    { key: "codex", name: "Codex", argv: ["codex"] },
    { key: "account-claude2", name: "Claude Code · claude2", argv: ["/x/claude2"] },
  ]);
});

test("agentChoices: missing data gives an empty list, not an error", () => {
  assert.deepEqual(agentChoices(undefined, undefined), []);
  assert.deepEqual(agentChoices([], [{ name: "claude2", default: false }]), []); // an account without its wrapper cannot start
});

test("characterChoices: sorted by name, unusable entries dropped", () => {
  const list = [{ file: "Mai.jpg", name: "Mai", thumb: "t/mai.png" }, { file: "Kazuto.jpg", name: "Kazuto" }, { file: "x.png" }, null];
  assert.deepEqual(characterChoices(list), [{ file: "Kazuto.jpg", name: "Kazuto", thumb: null }, { file: "Mai.jpg", name: "Mai", thumb: "t/mai.png" }]);
  assert.deepEqual(characterChoices(undefined), []);
});

test("rows: chunks of the asked size", () => {
  assert.deepEqual(rows([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(rows([], 3), []);
});

test("buildLaunch: a named tab, the agent, the task and where", () => {
  const agent = { key: "claude", name: "Claude Code", argv: ["claude"] };
  const mai = { file: "Mai.jpg", name: "Mai" };
  assert.deepEqual(buildLaunch({ task: "  arregla el login  ", agent, character: mai, space: "s1", folder: "/p/app" }), {
    command: "tab.new",
    args: { name: "Mai", argv: ["claude"], space: "s1", folder: "/p/app", task: "arregla el login" },
    portrait: "Mai.jpg",
  });
});

test("buildLaunch: no character names the tab after the agent and gives no portrait", () => {
  const launch = buildLaunch({ task: "x", agent: { name: "Codex", argv: ["codex"] }, character: null });
  assert.equal(launch.args.name, "Codex");
  assert.equal(launch.portrait, null);
});

test("buildLaunch: no task opens the agent with no first message; no agent launches nothing", () => {
  const agent = { name: "Claude Code", argv: ["claude"] };
  for (const task of ["", "   ", undefined]) assert.equal("task" in buildLaunch({ task, agent }).args, false);
  assert.equal(buildLaunch({ task: "x", agent: null }), null);
  assert.equal("space" in buildLaunch({ task: "x", agent }).args, false);
});
