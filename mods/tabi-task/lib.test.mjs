import test from "node:test";
import * as party from "../tabi-party/lib.js";
import assert from "node:assert/strict";
import { agentChoices, characterChoices, rows, buildLaunch, slugName, slugWords, tabName, taskId, newTaskRecord, coverFor, fadeSteps, usageIdFor, quotaWarning, quotaNote, QUOTA_LIMIT, balancedRows, branchFor, acceptsPrompt, promptArg, worktreeAvailable, buildWorktree, newQueueEntry, queueNote } from "./lib.js";

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

test("balancedRows: rows of the same length where possible, never a lonely last one", () => {
  const n = (k) => Array.from({ length: k }, (_, i) => i);
  assert.deepEqual(balancedRows(n(7), 7).map((r) => r.length), [7]); // all the characters on one row
  assert.deepEqual(balancedRows(n(7), 5).map((r) => r.length), [4, 3]); // not 5 + 2
  assert.deepEqual(balancedRows(n(4), 3).map((r) => r.length), [2, 2]); // four agents as a 2 x 2 grid
  assert.deepEqual(balancedRows(n(3), 3).map((r) => r.length), [3]);
  assert.deepEqual(balancedRows(n(5), 3).map((r) => r.length), [3, 2]);
  assert.deepEqual(balancedRows(n(1), 3).map((r) => r.length), [1]);
  assert.deepEqual(balancedRows([], 3), []);
  assert.deepEqual(balancedRows(n(8), 7).map((r) => r.length), [4, 4]);
});

test("slugWords: the first words of a task as a readable piece of a branch name", () => {
  assert.equal(slugWords("di hola en una línea"), "di-hola-en-una");
  assert.equal(slugWords("  Arregla el LOGIN, por favor!  "), "arregla-el-login-por");
  assert.equal(slugWords("Revisa ñandú y añade tests"), "revisa-nandu-y-anade");
  assert.equal(slugWords("--dangerously-skip-permissions"), "dangerously-skip-permissions");
  assert.equal(slugWords("¿¿¿???"), "");
  assert.equal(slugWords(""), "");
  assert.equal(slugWords(undefined), "");
  assert.ok(slugWords("a".repeat(80)).length <= 28);
  assert.equal(slugWords("uno-dos tres cuatro cinco seis"), "uno-dos-tres-cuatro");
});

test("branchFor: tabi/<character or agent>-<what the task says>, readable", () => {
  assert.equal(branchFor({ name: "Koyun" }, { name: "Claude Code" }, "di hola en una línea"), "tabi/koyun-di-hola-en-una");
  assert.equal(branchFor(null, { name: "Codex" }, "Arregla el login"), "tabi/codex-arregla-el-login");
  assert.equal(branchFor({ name: "Mai" }, null, ""), "tabi/mai"); // no task: just the name
  assert.equal(branchFor(null, null, undefined), "tabi/tarea");
});

test("branchFor: a number is added only when the branch already exists, and only the first free one", () => {
  const taken = ["main", "tabi/koyun-di-hola-en-una"];
  assert.equal(branchFor({ name: "Koyun" }, null, "di hola en una línea", taken), "tabi/koyun-di-hola-en-una-2");
  assert.equal(branchFor({ name: "Koyun" }, null, "di hola en una línea", [...taken, "tabi/koyun-di-hola-en-una-2"]), "tabi/koyun-di-hola-en-una-3");
  assert.equal(branchFor({ name: "Koyun" }, null, "otra cosa", taken), "tabi/koyun-otra-cosa"); // no clash: no number
  assert.equal(branchFor({ name: "Mai" }, null, "", ["tabi/mai"]), "tabi/mai-2");
});

test("branchFor: an existing branch of somebody else never decides the name by prefix", () => {
  assert.equal(branchFor({ name: "Mai" }, null, "arregla", ["tabi/mai-arregla-todo"]), "tabi/mai-arregla"); // different branch, same start
});

const claude = { key: "claude", name: "Claude Code", argv: ["claude"] };

test("tabName: the character when there is one, else the agent: the name Herdr gives the tab", () => {
  assert.equal(tabName({ name: "Koyun" }, claude), "Koyun");
  assert.equal(tabName(null, claude), "Claude Code");
});

test("taskId: a file name that sorts by time and cannot escape its folder", () => {
  const id = taskId(Date.UTC(2026, 10, 21, 14, 5, 9), "a1b2");
  assert.equal(id, "20261121-140509-a1b2");
  assert.match(id, /^[0-9a-z-]+$/);
  assert.match(taskId(0, "../x"), /^[0-9a-z-]+$/);
});

test("newTaskRecord: what was asked, who does it and where, ready to be saved", () => {
  const r = newTaskRecord({ task: "  di hola en una línea  ", agent: claude, character: { name: "Koyun" }, branch: "tabi/koyun-di-hola", folder: "/h/p", machine: null, now: 5000, rnd: "ffff" });
  assert.equal(r.task, "di hola en una línea");
  assert.deepEqual([r.agent, r.agentKey, r.character, r.tab], ["Claude Code", "claude", "Koyun", "Koyun"]);
  assert.deepEqual([r.branch, r.folder, r.machine], ["tabi/koyun-di-hola", "/h/p", null]);
  assert.deepEqual([r.status, r.startedAt, r.finishedAt, r.result], ["running", 5000, null, null]);
  assert.equal(r.id, taskId(5000, "ffff"));
});

test("newTaskRecord: no record when nothing was asked or there is no agent", () => {
  assert.equal(newTaskRecord({ task: "   ", agent: claude, now: 1 }), null);
  assert.equal(newTaskRecord({ task: undefined, agent: claude, now: 1 }), null);
  assert.equal(newTaskRecord({ task: "x", agent: null, now: 1 }), null);
});

test("newTaskRecord: a very long task is cut, and without character or branch the record says so", () => {
  const r = newTaskRecord({ task: "a".repeat(2000), agent: claude, now: 1, rnd: "0000" });
  assert.equal(r.task.length, 500);
  assert.deepEqual([r.character, r.tab, r.branch, r.folder, r.machine], [null, "Claude Code", null, null, null]);
});

test("coverFor: the picture of the space the dialog opens in, else the first one there is", () => {
  const images = [{ file: "backgrounds/tabi/01.jpg" }, { file: "backgrounds/tabi/02.jpg" }];
  const map = { spA: "backgrounds/tabi/02.jpg" };
  assert.equal(coverFor(map, images, "spA"), "backgrounds/tabi/02.jpg");
  assert.equal(coverFor(map, images, "spB"), "backgrounds/tabi/01.jpg");
  assert.equal(coverFor(undefined, images, undefined), "backgrounds/tabi/01.jpg");
});

test("coverFor: no picture at all means no cover, and a path that is not in the list is never used", () => {
  assert.equal(coverFor({}, [], "spA"), null);
  assert.equal(coverFor(undefined, undefined, "spA"), null);
  assert.equal(coverFor({ spA: "../../etc/passwd" }, [{ file: "backgrounds/tabi/01.jpg" }], "spA"), "backgrounds/tabi/01.jpg");
});

test("fadeSteps: bands of the dialog's color that go from clear to solid, to melt a picture into it", () => {
  const f = fadeSteps("#1c2129", 4);
  assert.equal(f.length, 4);
  assert.match(f[0], /^#1c2129[0-9a-f]{2}$/);
  const alphas = f.map((c) => parseInt(c.slice(7), 16));
  assert.deepEqual([...alphas].sort((a, b) => a - b), alphas); // never gets clearer
  assert.equal(alphas[alphas.length - 1], 255); // the last one is the color itself
  assert.ok(alphas[0] > 0 && alphas[0] < 255);
});

test("fadeSteps: a color that is not #rrggbb gives no fade rather than a broken one", () => {
  assert.deepEqual(fadeSteps("red", 4), []);
  assert.deepEqual(fadeSteps(undefined, 4), []);
  assert.deepEqual(fadeSteps("#1c2129", 0), []);
});

test("newTaskRecord: the check command is saved trimmed, and null when there is none", () => {
  const r = newTaskRecord({ task: "x", agent: claude, now: 1, rnd: "0000", verify: "  node --test  " });
  assert.equal(r.verify, "node --test");
  assert.equal(r.check, null);
  assert.equal(newTaskRecord({ task: "x", agent: claude, now: 1, verify: "   " }).verify, null);
  assert.equal(newTaskRecord({ task: "x", agent: claude, now: 1 }).verify, null);
  assert.equal(newTaskRecord({ task: "x", agent: claude, now: 1, verify: "a".repeat(500) }).verify.length, 200);
});

test("usageIdFor: which meter of tabi-usage is the one of the agent chosen", () => {
  assert.equal(usageIdFor("claude"), "claude");
  assert.equal(usageIdFor("claude-code"), "claude");
  assert.equal(usageIdFor("codex"), "codex");
  assert.equal(usageIdFor("account-claude2"), "claude2");
  assert.equal(usageIdFor("gemini"), null);
  assert.equal(usageIdFor(undefined), null);
});

const NOW = 1_000_000;
const entry = (used, extra = {}) => ({ windows: [{ label: "5h", used, resets: NOW + 3600_000 }, { label: "weekly", used: 10, resets: NOW + 9e8 }], okAt: NOW - 1000, error: null, ...extra });

test("quotaWarning: the 5-hour window above the limit warns; at or under it does not", () => {
  assert.equal(QUOTA_LIMIT, 85);
  assert.deepEqual(quotaWarning(entry(92), NOW), { used: 92, resets: NOW + 3600_000, stale: false });
  assert.equal(quotaWarning(entry(86), NOW).used, 86);
  assert.equal(quotaWarning(entry(85), NOW), null);
  assert.equal(quotaWarning(entry(10), NOW), null);
});

test("quotaWarning: the week does not decide it, and a window that has already reset says nothing", () => {
  const week = { windows: [{ label: "weekly", used: 99, resets: NOW + 1e9 }], okAt: NOW, error: null };
  assert.equal(quotaWarning(week, NOW), null);
  assert.equal(quotaWarning({ windows: [{ label: "5h", used: 95, resets: NOW - 1 }], okAt: NOW - 9e6, error: null }, NOW), null);
});

test("quotaWarning: a reading that failed is still shown, marked as old; no reading, no warning", () => {
  assert.equal(quotaWarning(entry(90, { error: "sin conexión" }), NOW).stale, true);
  assert.equal(quotaWarning(undefined, NOW), null);
  assert.equal(quotaWarning({ windows: [], okAt: null, error: "x" }, NOW), null);
  assert.equal(quotaWarning({ windows: [{ label: "5h", used: null, resets: null }] }, NOW), null);
});

test("quotaNote: says which account, how much and when it renews; and that it is not stopping anything", () => {
  const at = new Date(2026, 10, 21, 14, 49).getTime();
  const note = quotaNote("Claude Code · claude2", { used: 92, resets: at, stale: false });
  assert.match(note, /Claude Code · claude2/);
  assert.match(note, /92 %/);
  assert.match(note, /14:49/);
  assert.match(quotaNote("Codex", { used: 90, resets: at, stale: true }), /dato antiguo/);
  assert.doesNotMatch(quotaNote("Codex", { used: 90, resets: at, stale: false }), /dato antiguo/);
  assert.match(quotaNote("Codex", { used: 90, resets: null, stale: false }), /90 %/);
});

const QAGENT = { key: "claude", name: "Claude Code", argv: ["claude"] };
const QNOW = 1_000_000_000_000;
const qlaunch = () => buildLaunch({ task: "arregla el login", agent: QAGENT, character: { name: "Koyun", file: "k.png" }, space: "spA", folder: "/p/repo" });
const qrecord = () => newTaskRecord({ task: "arregla el login", agent: QAGENT, character: { name: "Koyun", file: "k.png" }, branch: null, folder: "/p/repo", machine: null, now: QNOW, rnd: "ab12", verify: "node --test" });

test("newQueueEntry: what the scheduler needs to open the tab later, and nothing it could run that is not a tab.new", () => {
  const e = newQueueEntry({ launch: qlaunch(), record: qrecord(), agent: QAGENT, now: QNOW });
  assert.equal(e.id, qrecord().id);
  assert.deepEqual([e.createdAt, e.usageId, e.name, e.task, e.command], [QNOW, "claude", "Claude Code", "arregla el login", "tab.new"]);
  assert.deepEqual(e.args, qlaunch().args);
  assert.deepEqual(e.record, qrecord());
  assert.equal(e.portrait, "k.png");
  assert.equal(newQueueEntry({ launch: null, record: qrecord(), agent: QAGENT, now: QNOW }), null);
  assert.equal(newQueueEntry({ launch: qlaunch(), record: null, agent: QAGENT, now: QNOW }), null);
  // an agent with no meter of its own cannot wait for a quota
  assert.equal(newQueueEntry({ launch: qlaunch(), record: qrecord(), agent: { key: "shell", name: "Shell", argv: ["zsh"] }, now: QNOW }), null);
});

test("newQueueEntry: tabi-party reads it, and both agree on where the limit is", () => {
  const e = newQueueEntry({ launch: qlaunch(), record: qrecord(), agent: QAGENT, now: QNOW });
  assert.deepEqual(party.parseQueue(JSON.stringify(e)), e);
  const at = (used) => ({ claude: { windows: [{ label: "5h", used, resets: QNOW + 3600_000 }], okAt: QNOW - 1000, error: null } });
  for (const used of [0, 50, QUOTA_LIMIT, QUOTA_LIMIT + 1, 100]) {
    const goes = party.queueDue([e], at(used), QNOW, new Set(["spA"]), {}).launch.length === 1;
    assert.equal(goes, quotaWarning(at(used).claude, QNOW) === null, `at ${used} %`);
  }
});

test("queueNote: what the dialog says about a task that waits, with the renewal time when it is known", () => {
  assert.match(queueNote("Claude Code", { used: 92, resets: new Date(2026, 10, 21, 14, 40).getTime() }), /Claude Code.*92 %.*14:40/);
  assert.match(queueNote("Codex", { used: 90, resets: null }), /Codex.*90 %/);
  assert.match(queueNote("Codex", { used: 90, resets: null }), /baje del 85 %/);
});
