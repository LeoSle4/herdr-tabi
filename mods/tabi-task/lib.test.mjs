import test from "node:test";
import assert from "node:assert/strict";
import { agentChoices, characterChoices, rows, buildLaunch, slugName, branchFor, acceptsPrompt, promptArg, worktreeAvailable, buildWorktree } from "./lib.js";

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

test("slugName: a safe lowercase word for a branch, without accents or symbols", () => {
  assert.equal(slugName("Koyun"), "koyun");
  assert.equal(slugName("Mai Sakurajima"), "mai-sakurajima");
  assert.equal(slugName("Ñandú Ó"), "nandu-o");
  assert.equal(slugName("Claude Code · claude2"), "claude-code-claude2");
  assert.equal(slugName("!!! ???"), "tarea");
  assert.equal(slugName(undefined), "tarea");
  assert.equal(slugName("a".repeat(60)).length, 24);
});

test("branchFor: tabi/<who>-<id>, named after the character or the agent", () => {
  assert.equal(branchFor({ name: "Koyun" }, { name: "Claude Code" }, "3f9a"), "tabi/koyun-3f9a");
  assert.equal(branchFor(null, { name: "Codex" }, "0001"), "tabi/codex-0001");
  assert.equal(branchFor(null, null, "ab12"), "tabi/tarea-ab12");
});

test("acceptsPrompt: only agents that take the first message as an argument", () => {
  assert.equal(acceptsPrompt({ key: "claude" }), true);
  assert.equal(acceptsPrompt({ key: "account-claude2" }), true);
  assert.equal(acceptsPrompt({ key: "codex" }), true);
  assert.equal(acceptsPrompt({ key: "gemini" }), false);
  assert.equal(acceptsPrompt(null), false);
});

test("promptArg: a task that starts with a dash can never become an option of the agent", () => {
  assert.equal(promptArg("  arregla el login  "), "arregla el login");
  assert.equal(promptArg("--dangerously-skip-permissions"), " --dangerously-skip-permissions");
  assert.equal(promptArg("-p hola"), " -p hola");
  assert.equal(promptArg("   "), "");
  assert.equal(promptArg(undefined), "");
});

test("worktreeAvailable: only on this computer and only on macOS or Linux", () => {
  assert.equal(worktreeAvailable({ platform: "macos", machine: null }).ok, true);
  assert.equal(worktreeAvailable({ platform: "linux", machine: "" }).ok, true);
  const win = worktreeAvailable({ platform: "windows", machine: null });
  assert.equal(win.ok, false);
  assert.match(win.reason, /macOS y Linux/);
  assert.equal(worktreeAvailable({ platform: "macos", machine: "msi-casa" }).ok, false); // another machine
  assert.equal(worktreeAvailable({ platform: undefined, machine: null }).ok, false);
});

test("buildWorktree: the worktree dialog of Herdr gets the branch, a tab named after the character and the agent with the task", () => {
  const agent = { key: "claude", name: "Claude Code", argv: ["claude"] };
  const launch = buildWorktree({ task: "  arregla el login ", agent, character: { name: "Koyun", file: "Koyun.jpg" }, space: "s1", folder: "/p/app", machine: null, branch: "tabi/koyun-3f9a" });
  assert.deepEqual(launch.overlay, { mod: "worktree", kind: "dialog", width: 460, height: 150,
    props: { space: "s1", folder: "/p/app", machine: null, branch: "tabi/koyun-3f9a", tab: "Koyun", argv: ["claude", "arregla el login"] } });
  assert.equal(launch.portrait, "Koyun.jpg");
  assert.equal(launch.taskSent, true);
});

test("buildWorktree: an agent that cannot take the task opens without it, and says so", () => {
  const launch = buildWorktree({ task: "haz algo", agent: { key: "gemini", name: "Gemini", argv: ["gemini"] }, character: null, space: "s1", branch: "tabi/gemini-0001" });
  assert.deepEqual(launch.overlay.props.argv, ["gemini"]);
  assert.equal(launch.overlay.props.tab, "Gemini");
  assert.equal(launch.taskSent, false);
  assert.equal(launch.portrait, null);
});

test("buildWorktree: no task is no first message; a dash in front is neutralized; no agent launches nothing", () => {
  const agent = { key: "account-claude2", name: "Claude Code · claude2", argv: ["/h/.local/bin/claude2"] };
  assert.deepEqual(buildWorktree({ task: "", agent, branch: "b" }).overlay.props.argv, ["/h/.local/bin/claude2"]);
  assert.equal(buildWorktree({ task: "", agent, branch: "b" }).taskSent, false);
  assert.deepEqual(buildWorktree({ task: "--help", agent, branch: "b" }).overlay.props.argv, ["/h/.local/bin/claude2", " --help"]);
  assert.equal(buildWorktree({ task: "x", agent: null, branch: "b" }), null);
  assert.equal(buildWorktree({ task: "x", agent, branch: "" }), null);
});
