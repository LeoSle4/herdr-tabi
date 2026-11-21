import test from "node:test";
import assert from "node:assert/strict";
import { statusInfo, worktreesRoot, worktreeOf, worktreeInfo, baseName, projectName, groupAgents, parseTask, taskFor, finishTask, taskTooltip, parseStop, taskEnded, parseCommand, verifyDir, checkResult, needsCheck, checkMark, checkNotice, CHECK_TIMEOUT_MS, characterName, cardName, portraitNames, taskLine, accountNames, subtitle, isImage, pickPortrait, thumbName, cropSide, parseFolder, reconcilePortraits, configDirOf, accountOf, worktreeIndex, parseQueue, queueDue, QUEUE_FRESH_MS } from "./lib.js";

test("status: working 働 cream, blocked 待 amber, idle and done 済 gray", () => {
  assert.deepEqual([statusInfo("working").kanji, statusInfo("working").accent], ["働", "solid"]);
  assert.deepEqual([statusInfo("blocked").kanji, statusInfo("blocked").accent], ["待", "blocked"]);
  for (const s of ["idle", "done", "unknown"]) assert.deepEqual([statusInfo(s).kanji, statusInfo(s).accent], ["済", "idle"]);
  assert.equal(statusInfo("working").busy, true);
  assert.equal(statusInfo("blocked").busy, false);
});

test("portrait names: program key, app and name, lower-cased without repeats", () => {
  assert.deepEqual(portraitNames({ program: { key: "claude", name: "Claude Code" }, app: "claude-code" }), ["claude", "claude-code"]);
  assert.deepEqual(portraitNames({ program: { key: "codex", name: "Codex" }, app: "codex" }), ["codex"]);
  assert.deepEqual(portraitNames({}), []);
});

test("task line: the title, or the status in Spanish when there is none", () => {
  assert.equal(taskLine({ title: "  Frieren   layout  ", status: "working" }), "Frieren layout");
  assert.equal(taskLine({ title: "", status: "blocked" }), "te espera");
});

test("account names: the real account of each agent, never numbered", () => {
  const list = [
    { address: "a", program: { key: "claude" } },
    { address: "b", program: { key: "claude" } },
    { address: "c", program: { key: "codex" } },
    { address: "d", app: "claude-code" },
  ];
  assert.deepEqual(accountNames(list), { a: "claude", b: "claude", c: "codex", d: "claude" });
});

test("subtitle: space and task", () => {
  assert.equal(subtitle({ space_name: "PitLane", title: "Fix rules", status: "working" }), "PitLane · Fix rules");
  assert.equal(subtitle({ space_name: "", title: "", status: "idle" }), "sin space · en reposo");
});

test("images: png, jpg and jpeg in any case", () => {
  assert.deepEqual(["a.png", "b.JPG", "c.jpeg", "d.gif", "e.txt", "f"].map(isImage), [true, true, true, false, false, false]);
});

test("portrait pick: one nobody has, then the least used, never a random repeat while others are free", () => {
  const files = ["a.png", "b.png", "c.png"];
  assert.equal(pickPortrait(files, ["a.png", "b.png"], () => 0), "c.png");
  assert.equal(pickPortrait(files, [], () => 0.99), "c.png");
  assert.equal(pickPortrait(files, ["a.png", "b.png", "c.png"], () => 0), "a.png"); // all used once: they repeat
  assert.equal(pickPortrait(files, ["a.png", "a.png", "b.png", "c.png"], () => 0), "b.png");
  assert.equal(pickPortrait([], [], () => 0), null);
  assert.equal(pickPortrait(["only.png"], ["only.png"], () => 0), "only.png");
});

test("thumb name is stable per file and time, and filesystem-safe", () => {
  assert.equal(thumbName("Katana Girl.JPG", 1795000123456), "katana-girl-1795000123.png");
  assert.equal(thumbName("áéí.png", 5000), "aei-5.png");
  assert.equal(thumbName("日本.png", 0), "retrato-0.png");
});

test("crop side is the shorter edge", () => {
  assert.equal(cropSide(1920, 1080), 1080);
  assert.equal(cropSide(300, 800), 300);
});

test("account of a process: its CLAUDE_CONFIG_DIR picks the account; none means the default one", () => {
  const accounts = [{ name: "claude", dir: "/h/.claude", default: true }, { name: "claude2", dir: "/h/.claude-cuenta2", default: false }];
  assert.equal(configDirOf("claude --resume x HOME=/h CLAUDE_CONFIG_DIR=/h/.claude-cuenta2/ PATH=/bin"), "/h/.claude-cuenta2");
  assert.equal(configDirOf("claude HOME=/h"), null);
  assert.equal(configDirOf("XCLAUDE_CONFIG_DIR=/nope"), null);
  assert.equal(accountOf("claude CLAUDE_CONFIG_DIR=/h/.claude-cuenta2 A=b", accounts), "claude2");
  assert.equal(accountOf("claude A=b", accounts), "claude");
  assert.equal(accountOf("claude CLAUDE_CONFIG_DIR=/h/otra A=b", accounts), "claude"); // a dir no wrapper makes: the default name
});

test("names: a detected account renames Claude agents only", () => {
  const list = [{ address: "a", program: { key: "claude" } }, { address: "b", program: { key: "claude" } }, { address: "c", program: { key: "codex" } }];
  assert.deepEqual(accountNames(list, { a: "claude", b: "claude2", c: "claude2" }), { a: "claude", b: "claude2", c: "codex" });
  assert.deepEqual(accountNames(list), { a: "claude", b: "claude", c: "codex" });
});

test("folder: png/jpg/jpeg by extension, extensionless png/jpeg by content, the rest ignored and named", () => {
  const out = [
    "1795000100\tb.PNG\timage/png", "1795000000\ta.jpg\timage/jpeg", "1795000300\tsin-extension\timage/jpeg",
    "1795000400\totra\timage/png", "1795000200\tnotas\ttext/plain", "1795000500\tanimada.gif\timage/gif", "1795000600\tfalso.jpg\timage/jpeg", "", "roto",
  ].join("\n");
  const r = parseFolder(out);
  assert.deepEqual(r.images.map((x) => x.file), ["a.jpg", "b.PNG", "falso.jpg", "otra", "sin-extension"]);
  assert.equal(r.images[0].mtime, 1795000000000);
  assert.deepEqual(r.ignored, ["animada.gif", "notas"]);
  assert.deepEqual(parseFolder(""), { images: [], ignored: [] });
});

const ids = (m, live) => live.map((i) => m[i]);
test("reconcile: two agents that share a portrait are given different ones when others are free", () => {
  const files = ["1", "2", "3", "4", "5", "6"];
  const next = reconcilePortraits(files, ["p1", "p2"], { p1: "2", p2: "2" }, () => 0);
  assert.equal(next.p1, "2"); // the first holder keeps it
  assert.notEqual(next.p2, "2");
  assert.equal(new Set(ids(next, ["p1", "p2"])).size, 2);
});

test("reconcile: distinct assignments are left alone, a new agent gets one nobody has", () => {
  const files = ["1", "2", "3"];
  const next = reconcilePortraits(files, ["p1", "p2", "p3"], { p1: "1", p2: "2" }, () => 0.99);
  assert.deepEqual([next.p1, next.p2, next.p3], ["1", "2", "3"]);
});

test("reconcile: they repeat only when there are more agents than images", () => {
  const files = ["1", "2"];
  const next = reconcilePortraits(files, ["a", "b", "c", "d"], {}, () => 0);
  const counts = {};
  for (const id of ["a", "b", "c", "d"]) counts[next[id]] = (counts[next[id]] ?? 0) + 1;
  assert.deepEqual(counts, { 1: 2, 2: 2 });
  const three = reconcilePortraits(["1", "2", "3"], ["a", "b", "c"], {}, () => 0.5);
  assert.equal(new Set(Object.values(three)).size, 3);
});

test("reconcile: a closed agent frees its portrait; a vanished image is replaced; no images means none", () => {
  const files = ["1", "2", "3"];
  const freed = reconcilePortraits(files, ["p2", "p3"], { p1: "1", p2: "2", p3: "3" }, () => 0);
  assert.deepEqual(freed, { p2: "2", p3: "3" });
  const again = reconcilePortraits(files, ["p2", "p3", "p4"], freed, () => 0);
  assert.equal(again.p4, "1"); // the freed one is available again
  assert.equal(reconcilePortraits(["1"], ["p1"], { p1: "gone" }, () => 0).p1, "1");
  assert.deepEqual(reconcilePortraits([], ["p1"], { p1: "1" }), {});
});

test("character: the portrait's file name without the image extension", () => {
  assert.equal(characterName("Mai.jpg"), "Mai");
  assert.equal(characterName("Shikimori.JPEG"), "Shikimori");
  assert.equal(characterName("Kazuto.png"), "Kazuto");
  assert.equal(characterName("Rusita"), "Rusita"); // a file without extension keeps its name
  assert.equal(characterName("Mai Sakurajima.jpg"), "Mai Sakurajima");
  assert.equal(characterName("foto.final.jpg"), "foto.final"); // only the last extension goes
  assert.equal(characterName(".jpg"), null);
  assert.equal(characterName(undefined), null);
});

test("card name: the character with a portrait, the account without one", () => {
  assert.equal(cardName("Mai.jpg", "claude"), "Mai");
  assert.equal(cardName(undefined, "claude2"), "claude2");
  assert.equal(cardName("", "codex"), "codex");
});


test("reconcilePortraits: the preferred character goes to the agent it was asked for", () => {
  const files = ["a.png", "b.png", "c.png"];
  const next = reconcilePortraits(files, ["old", "new"], { old: "a.png" }, () => 0, { file: "c.png", id: "new" });
  assert.deepEqual(next, { old: "a.png", new: "c.png" });
});

test("reconcilePortraits: another agent without a portrait never takes it (an agent of another machine that reconnects)", () => {
  const files = ["a.png", "b.png", "c.png"];
  // "remote" comes first in the list and has none: it must get a random one, and the asked character stays for "new"
  const next = reconcilePortraits(files, ["remote", "new"], {}, () => 0, { file: "c.png", id: "new" });
  assert.equal(next.new, "c.png");
  assert.notEqual(next.remote, "c.png");
});

test("reconcilePortraits: the preferred one is ignored when the agent is gone, has one already, somebody wears it, or it is no portrait", () => {
  const files = ["a.png", "b.png"];
  assert.notEqual(reconcilePortraits(files, ["x"], {}, () => 0, { file: "b.png", id: "gone" }).x, "b.png"); // that agent is not alive
  assert.equal(reconcilePortraits(files, ["x"], { x: "a.png" }, () => 0, { file: "b.png", id: "x" }).x, "a.png"); // it keeps its own
  assert.equal(reconcilePortraits(files, ["old", "new"], { old: "a.png" }, () => 0, { file: "a.png", id: "new" }).new, "b.png"); // worn
  assert.equal(reconcilePortraits(files, ["new"], {}, () => 0, { file: "zzz.png", id: "new" }).new, "a.png"); // not a portrait
});

test("worktreesRoot: the folder of the worktrees setting, with ~ expanded, or Herdr's default", () => {
  assert.equal(worktreesRoot({ worktrees: { directory: "~/Projects/worktrees" } }, "/Users/u"), "/Users/u/Projects/worktrees");
  assert.equal(worktreesRoot({ worktrees: { directory: "/srv/wt/" } }, "/Users/u"), "/srv/wt");
  assert.equal(worktreesRoot({}, "/Users/u"), "/Users/u/.herdr/worktrees");
  assert.equal(worktreesRoot(undefined, "/Users/u"), "/Users/u/.herdr/worktrees");
  assert.equal(worktreesRoot({ worktrees: { directory: "  " } }, "/Users/u"), "/Users/u/.herdr/worktrees");
  assert.equal(worktreesRoot({ worktrees: { directory: "C:\\wt\\" } }, "C:\\Users\\u"), "C:\\wt");
});

test("worktreeOf: <root>/<repo>/<checkout> gives the repo, anything else is not a worktree", () => {
  const root = "/Users/u/Projects/worktrees";
  assert.deepEqual(worktreeOf("/Users/u/Projects/worktrees/herdr-tabi/tabi-mai-f353", root), { repo: "herdr-tabi", checkout: "tabi-mai-f353" });
  assert.deepEqual(worktreeOf("/Users/u/Projects/worktrees/herdr-tabi/tabi-mai-f353/", root), { repo: "herdr-tabi", checkout: "tabi-mai-f353" });
  assert.deepEqual(worktreeOf("C:\\wt\\app\\fix-login", "C:\\wt"), { repo: "app", checkout: "fix-login" });
  assert.equal(worktreeOf("/Users/u/Projects/herdr-tabi", root), null);
  assert.equal(worktreeOf("/Users/u/Projects/worktrees/herdr-tabi", root), null); // the repo's folder, not a checkout
  assert.equal(worktreeOf("/Users/u/Projects/worktreesX/a/b", root), null); // only a prefix of the name
  assert.equal(worktreeOf(undefined, root), null);
  assert.equal(worktreeOf("/a/b/c", ""), null);
});

test("worktreeInfo: the repo, the checkout and the branch of a space in the worktrees folder", () => {
  const root = "/h/worktrees";
  const space = { name: "tabi-mai-f353", folder: "/h/worktrees/herdr-tabi/tabi-mai-f353", branch: "tabi/mai-f353" };
  assert.deepEqual(worktreeInfo(space, root), { repo: "herdr-tabi", checkout: "tabi-mai-f353", branch: "tabi/mai-f353" });
  // the branch of the first terminal can be unknown for a moment: the checkout stands in for it
  assert.equal(worktreeInfo({ ...space, branch: null }, root).branch, "tabi-mai-f353");
  assert.equal(worktreeInfo({ ...space, branch: "" }, root).branch, "tabi-mai-f353");
});

test("worktreeInfo: a space that is not a worktree, or no space at all, is null", () => {
  assert.equal(worktreeInfo({ name: "PitLane", folder: "/h/Projects/PitLane", branch: "main" }, "/h/worktrees"), null);
  assert.equal(worktreeInfo(undefined, "/h/worktrees"), null);
  assert.equal(worktreeInfo({ folder: "/h/worktrees/a/b" }, ""), null);
});

const ROOT = "/h/worktrees";
const sp = (id, folder, extra = {}) => ({ id, name: baseName(folder), named: false, folder, branch: "main", machine: null, ...extra });
const wtSpace = (id, repo, checkout, machine = null) => sp(id, `${ROOT}/${repo}/${checkout}`, { branch: `tabi/${checkout}`, machine });
const ag = (address, space) => ({ address, space });
const view = (nodes) => nodes.map((n) => [n.agent.address, n.children.map((c) => c.agent.address), n.orphan === true]);

test("baseName: the last part of a folder, with slashes of either kind and a trailing one", () => {
  assert.equal(baseName("/Users/u/Projects/herdr-tabi"), "herdr-tabi");
  assert.equal(baseName("/Users/u/Projects/herdr-tabi/"), "herdr-tabi");
  assert.equal(baseName("C:\\Projects\\PitLane"), "PitLane");
  assert.equal(baseName(""), "");
  assert.equal(baseName(undefined), "");
});

test("groupAgents: worktree agents hang under the first agent of their repo, in the order of the list", () => {
  const spaces = { s1: sp("s1", "/h/Projects/herdr-tabi"), w1: wtSpace("w1", "herdr-tabi", "tabi-mai-f353"), w2: wtSpace("w2", "herdr-tabi", "tabi-koyun-3f9a"), s2: sp("s2", "/h/Projects/PitLane") };
  const list = [ag("kazuto", "s1"), ag("susana", "s2"), ag("mai", "w1"), ag("koyun", "w2")];
  const nodes = groupAgents(list, (a) => spaces[a.space], ROOT);
  assert.deepEqual(view(nodes), [["kazuto", ["mai", "koyun"], false], ["susana", [], false]]);
  assert.deepEqual(nodes[0].children[0].wt, { repo: "herdr-tabi", checkout: "tabi-mai-f353", branch: "tabi/tabi-mai-f353" });
});

test("groupAgents: a worktree that comes before its project in the list still hangs from it", () => {
  const spaces = { s1: sp("s1", "/h/Projects/herdr-tabi"), w1: wtSpace("w1", "herdr-tabi", "x") };
  const nodes = groupAgents([ag("mai", "w1"), ag("kazuto", "s1")], (a) => spaces[a.space], ROOT);
  assert.deepEqual(view(nodes), [["kazuto", ["mai"], false]]);
});

test("groupAgents: with several agents in the repo, the worktrees hang from the first only", () => {
  const spaces = { s1: sp("s1", "/h/Projects/herdr-tabi"), s1b: sp("s1b", "/h/Projects/herdr-tabi"), w1: wtSpace("w1", "herdr-tabi", "x") };
  const nodes = groupAgents([ag("a", "s1"), ag("b", "s1b"), ag("mai", "w1")], (x) => spaces[x.space], ROOT);
  assert.deepEqual(view(nodes), [["a", ["mai"], false], ["b", [], false]]);
});

test("groupAgents: another machine never shares a tree, even with the same repo name", () => {
  const spaces = { local: sp("local", "/h/Projects/herdr-tabi"), remote: sp("remote", "C:\\Projects\\herdr-tabi", { machine: "msi-casa" }), w: wtSpace("w", "herdr-tabi", "x", "msi-casa") };
  const nodes = groupAgents([ag("kazuto", "local"), ag("t9", "remote"), ag("mai", "w")], (a) => spaces[a.space], ROOT);
  assert.deepEqual(view(nodes), [["kazuto", [], false], ["t9", ["mai"], false]]);
});

test("groupAgents: a worktree with no agent in its project stands alone, in its place, and is marked", () => {
  const spaces = { s2: sp("s2", "/h/Projects/PitLane"), w1: wtSpace("w1", "herdr-tabi", "x") };
  const nodes = groupAgents([ag("susana", "s2"), ag("mai", "w1")], (a) => spaces[a.space], ROOT);
  assert.deepEqual(view(nodes), [["susana", [], false], ["mai", [], true]]);
  assert.equal(nodes[1].wt.repo, "herdr-tabi");
});

test("groupAgents: without worktrees the list is the same, and an agent whose space is unknown stays", () => {
  const spaces = { s1: sp("s1", "/h/Projects/a"), s2: sp("s2", "/h/Projects/b") };
  assert.deepEqual(view(groupAgents([ag("x", "s1"), ag("y", "s2"), ag("z", "gone")], (a) => spaces[a.space], ROOT)), [["x", [], false], ["y", [], false], ["z", [], false]]);
  assert.deepEqual(groupAgents([], () => undefined, ROOT), []);
});

test("projectName: an unnamed space is called after where its terminal is now; a named one by its folder", () => {
  // the real case: the space started in Proyecto_futuro and its terminal moved to herdr-tabi, so Herdr calls it "herdr-tabi"
  assert.equal(projectName({ name: "herdr-tabi", named: false, folder: "/Users/u/Projects/Proyecto_futuro" }), "herdr-tabi");
  // somebody renamed it: the name says nothing about the repo, the folder does
  assert.equal(projectName({ name: "mi backend", named: true, folder: "/Users/u/Projects/api" }), "api");
  assert.equal(projectName(undefined), "");
});

test("groupAgents: the project is found by the name of the space, not by the folder it started in", () => {
  const spaces = {
    s1: { id: "s1", name: "herdr-tabi", named: false, folder: "/Users/u/Projects/Proyecto_futuro", machine: null, branch: null },
    w1: wtSpace("w1", "herdr-tabi", "tabi-koyun-3f9a"),
  };
  const nodes = groupAgents([ag("kazuto", "s1"), ag("koyun", "w1")], (a) => spaces[a.space], ROOT);
  assert.deepEqual(view(nodes), [["kazuto", ["koyun"], false]]);
});

test("groupAgents: a renamed space is matched by its folder", () => {
  const spaces = { s1: sp("s1", "/h/Projects/herdr-tabi", { name: "trabajo", named: true }), w1: wtSpace("w1", "herdr-tabi", "x") };
  assert.deepEqual(view(groupAgents([ag("a", "s1"), ag("mai", "w1")], (a) => spaces[a.space], ROOT)), [["a", ["mai"], false]]);
});

const rec = (extra = {}) => ({ id: "a", task: "di hola", agent: "Claude Code", agentKey: "claude", character: "Koyun", tab: "Koyun", branch: null, folder: "/p", machine: null, startedAt: 1000, status: "running", finishedAt: null, result: null, ...extra });
const H = 3600 * 1000;

test("parseTask: a saved record, or null when it is not one", () => {
  assert.deepEqual(parseTask(JSON.stringify(rec())), rec());
  assert.equal(parseTask("not json"), null);
  assert.equal(parseTask("[]"), null);
  assert.equal(parseTask(JSON.stringify({ ...rec(), task: "" })), null);
  assert.equal(parseTask(JSON.stringify({ ...rec(), tab: undefined })), null);
  assert.equal(parseTask(JSON.stringify({ ...rec(), startedAt: "yesterday" })), null);
});

test("parseTask: an unknown status is read as running, and a result that is not text is dropped", () => {
  assert.equal(parseTask(JSON.stringify({ ...rec(), status: "weird" })).status, "running");
  assert.equal(parseTask(JSON.stringify({ ...rec(), result: 5 })).result, null);
});

test("taskFor: the latest task of that tab on that machine, from the last day", () => {
  const list = [rec({ id: "old", startedAt: 1000 }), rec({ id: "new", startedAt: 5000 }), rec({ id: "other", tab: "Mai", startedAt: 9000 })];
  assert.equal(taskFor(list, "Koyun", null, 6000).id, "new");
  assert.equal(taskFor(list, "Mai", null, 6000).id, "other");
  assert.equal(taskFor(list, "Rusita", null, 6000), null);
});

test("taskFor: another machine does not share a tab name, and an old task no longer belongs to the tab", () => {
  const list = [rec({ machine: "msi-casa" })];
  assert.equal(taskFor(list, "Koyun", null, 2000), null);
  assert.equal(taskFor(list, "Koyun", "msi-casa", 2000).id, "a");
  assert.equal(taskFor([rec()], "Koyun", null, 1000 + 25 * H), null);
  assert.equal(taskFor([rec()], "Koyun", null, 1000 + 23 * H).id, "a");
  assert.equal(taskFor([], "Koyun", null, 1), null);
  assert.equal(taskFor(undefined, "Koyun", null, 1), null);
});

test("finishTask: a running task becomes done, with what the agent said if that was after it began", () => {
  const done = finishTask(rec(), { text: "Listo: saludé.", at: 4000 }, 30000);
  assert.deepEqual([done.status, done.finishedAt, done.result], ["done", 30000, "Listo: saludé."]);
  assert.equal(done.task, "di hola");
});

test("finishTask: what was said before the task began is not its result; nothing said still closes it", () => {
  assert.equal(finishTask(rec(), { text: "of the last task", at: 500 }, 30000).result, null);
  assert.deepEqual([finishTask(rec(), null, 30000).status, finishTask(rec(), null, 30000).result], ["done", null]);
});

test("finishTask: a task that is already done is left alone", () => {
  assert.equal(finishTask(rec({ status: "done", finishedAt: 2000, result: "x" }), { text: "y", at: 4000 }, 30000), null);
});

test("finishTask: a task that has just begun is not closed by another tab of the same name that was already done", () => {
  assert.equal(finishTask(rec(), null, 1000 + 5000), null);
  assert.equal(finishTask(rec(), null, 1000 + 20000).status, "done");
});

test("taskTooltip: what was asked, and what came of it once it is done", () => {
  assert.equal(taskTooltip(rec()), "Encargo: di hola");
  assert.equal(taskTooltip(rec({ status: "done", result: "Listo: saludé." })), "Encargo: di hola\nResultado: Listo: saludé.");
  assert.equal(taskTooltip(rec({ status: "done", result: null })), "Encargo: di hola\nTerminó");
  assert.equal(taskTooltip(null), "");
});

test("parseStop: what the hook recorded when the agent's turn ended, or null", () => {
  assert.deepEqual(parseStop('{"text":"Listo.","at":4000}'), { text: "Listo.", at: 4000 });
  assert.equal(parseStop('{"text":"","at":4000}'), null);
  assert.equal(parseStop('{"text":"x"}'), null);
  assert.equal(parseStop("nope"), null);
  assert.equal(parseStop(undefined), null);
});

test("taskEnded: done always ends it; idle only after the agent was seen working, or when it has been a long time", () => {
  const r = rec({ startedAt: 0 });
  assert.equal(taskEnded("done", false, r, 30000), true);
  assert.equal(taskEnded("idle", true, r, 30000), true); // seen working, now at rest: it finished and was looked at
  assert.equal(taskEnded("idle", false, r, 30000), false); // just launched: it has not started yet
  assert.equal(taskEnded("idle", false, r, 6 * 60000), true); // Herdr was restarted in the middle: nobody saw it work
});

test("taskEnded: an agent that works or waits for you has not ended", () => {
  const r = rec({ startedAt: 0 });
  assert.equal(taskEnded("working", true, r, 10 * 60000), false);
  assert.equal(taskEnded("blocked", true, r, 10 * 60000), false);
  assert.equal(taskEnded(undefined, true, r, 10 * 60000), false);
});

test("parseCommand: a command and its arguments, with quotes for the ones that have spaces, and nothing a shell would do", () => {
  assert.deepEqual(parseCommand("node --test"), { command: "node", args: ["--test"] });
  assert.deepEqual(parseCommand("  npm   run  lint "), { command: "npm", args: ["run", "lint"] });
  assert.deepEqual(parseCommand('python3 -m unittest "my tests"'), { command: "python3", args: ["-m", "unittest", "my tests"] });
  assert.deepEqual(parseCommand("pytest -k 'a b'"), { command: "pytest", args: ["-k", "a b"] });
  assert.equal(parseCommand(""), null);
  assert.equal(parseCommand("   "), null);
  assert.equal(parseCommand(undefined), null);
  assert.equal(parseCommand('node "unclosed'), null);
});

test("verifyDir: a worktree is checked where it lives; any other task where it was given", () => {
  assert.equal(verifyDir(rec({ branch: "tabi/x", folder: "/repo" }), "/worktrees/repo/x"), "/worktrees/repo/x");
  assert.equal(verifyDir(rec({ branch: null, folder: "/repo" }), "/elsewhere"), "/repo");
  assert.equal(verifyDir(rec({ branch: "tabi/x", folder: "/repo" }), undefined), "/repo");
  assert.equal(verifyDir(rec({ branch: null, folder: null }), undefined), null);
});

test("checkResult: the exit code says pass or fail, and the last line of the output is kept to explain it", () => {
  assert.deepEqual(checkResult(0, "ok\nall 12 passed\n", 9000), { state: "pass", code: 0, at: 9000, tail: "all 12 passed" });
  assert.deepEqual(checkResult(1, "x\n\nFAIL: 2 tests\n\n", 9000), { state: "fail", code: 1, at: 9000, tail: "FAIL: 2 tests" });
  assert.equal(checkResult(2, "", 1).tail, "");
  assert.equal(checkResult(0, "x".repeat(500), 1).tail.length, 140);
  assert.equal(checkResult(null, "boom", 1).state, "fail"); // it did not even run to the end (a timeout, no such command)
});

test("needsCheck: only a finished task with a command and no result yet", () => {
  assert.equal(needsCheck(rec({ status: "done", verify: "node --test", check: null })), true);
  assert.equal(needsCheck(rec({ status: "running", verify: "node --test" })), false);
  assert.equal(needsCheck(rec({ status: "done", verify: null })), false);
  assert.equal(needsCheck(rec({ status: "done", verify: "node --test", check: { state: "pass", at: 1 } })), false);
});

test("needsCheck: a check left 'running' by a Herdr that closed is tried again after the time it could have taken", () => {
  const stuck = rec({ status: "done", verify: "x", check: { state: "running", at: 1000 } });
  assert.equal(needsCheck(stuck, 1000 + 1000), false);
  assert.equal(needsCheck(stuck, 1000 + CHECK_TIMEOUT_MS + 1000), true);
});

test("checkMark: a tick, a cross or a wait for the card; nothing without a check", () => {
  assert.equal(checkMark(rec({ verify: "x", status: "done", check: { state: "pass" } })), "✓");
  assert.equal(checkMark(rec({ verify: "x", status: "done", check: { state: "fail" } })), "✗");
  assert.equal(checkMark(rec({ verify: "x", status: "done", check: { state: "running" } })), "…");
  assert.equal(checkMark(rec({ verify: "x", status: "done", check: null })), "…");
  assert.equal(checkMark(rec({ verify: "x", status: "running", check: null })), "");
  assert.equal(checkMark(rec({ verify: null })), "");
  assert.equal(checkMark(null), "");
});

test("taskTooltip: says what the check found", () => {
  const done = { status: "done", result: "Listo.", verify: "node --test" };
  assert.match(taskTooltip(rec({ ...done, check: { state: "pass", tail: "12 passed" } })), /Comprobación \(node --test\): ✓ 12 passed$/);
  assert.match(taskTooltip(rec({ ...done, check: { state: "fail", tail: "2 failed" } })), /✗ 2 failed$/);
  assert.match(taskTooltip(rec({ ...done, check: { state: "running" } })), /comprobando/);
});

test("checkNotice: who it is about, whether it passed, and what the command printed last", () => {
  const r = rec({ character: "Koyun", verify: "node --test" });
  assert.deepEqual(checkNotice(r, { state: "pass", tail: "12 passed" }), { title: "Koyun: la comprobación pasó ✓", body: "node --test · 12 passed", level: "success" });
  assert.deepEqual(checkNotice(r, { state: "fail", tail: "2 failed" }), { title: "Koyun: la comprobación falló ✗", body: "node --test · 2 failed", level: "error" });
  assert.equal(checkNotice(rec({ character: null, agent: "Codex", verify: "x" }), { state: "pass", tail: "" }).title, "Codex: la comprobación pasó ✓");
  assert.equal(checkNotice(r, { state: "pass", tail: "" }).body, "node --test");
});

test("worktreeInfo: a space that started elsewhere but is named after a worktree checkout is that worktree (when the folders of the worktrees are known)", () => {
  const root = "/h/Projects/worktrees";
  const known = { "herdr-tabi": ["tabi-mai-f353", "tabi-mai-verficacion"], PitLane: ["fix-x"] };
  const space = { name: "tabi-mai-verficacion", named: false, folder: "/h/Projects/herdr-tabi", branch: "tabi/mai-verficacion" };
  assert.deepEqual(worktreeInfo(space, root, known), { repo: "herdr-tabi", checkout: "tabi-mai-verficacion", branch: "tabi/mai-verficacion" });
  // without the list, or when somebody named the space, or when the name is not a checkout, or when two repos have it: not a worktree
  assert.equal(worktreeInfo(space, root), null);
  assert.equal(worktreeInfo({ ...space, named: true }, root, known), null);
  assert.equal(worktreeInfo({ ...space, name: "herdr-tabi" }, root, known), null);
  assert.equal(worktreeInfo(space, root, { a: ["tabi-mai-verficacion"], b: ["tabi-mai-verficacion"] }), null);
  // the folder still wins when it is inside the worktrees folder
  assert.deepEqual(worktreeInfo({ ...space, folder: "/h/Projects/worktrees/PitLane/fix-x", name: "fix-x" }, root, known), { repo: "PitLane", checkout: "fix-x", branch: "tabi/mai-verficacion" });
});

test("groupAgents: with the worktrees known, an agent whose space started in the repo but is named after a worktree hangs from the agent of its project", () => {
  const root = "/h/Projects/worktrees";
  const known = { "herdr-tabi": ["tabi-mai-verficacion"] };
  const spaces = {
    a: { id: "a", name: "herdr-tabi", named: false, folder: "/h/Projects/herdr-tabi", machine: null, branch: "main" },
    b: { id: "b", name: "tabi-mai-verficacion", named: false, folder: "/h/Projects/herdr-tabi", machine: null, branch: "tabi/mai-verficacion" },
  };
  const list = [{ address: "1", space: "a" }, { address: "2", space: "b" }];
  const nodes = groupAgents(list, (x) => spaces[x.space], root, known);
  assert.equal(nodes.length, 1);
  assert.deepEqual(nodes[0].children.map((c) => c.agent.address), ["2"]);
  assert.equal(nodes[0].children[0].wt.repo, "herdr-tabi");
  // the call without the list behaves as before
  assert.equal(groupAgents(list, (x) => spaces[x.space], root).length, 2);
});

test("worktreeIndex: from the folders under the worktrees folder to { repo: [checkouts] }, ignoring files", () => {
  assert.deepEqual(worktreeIndex([{ name: "herdr-tabi", children: [{ name: "a", dir: true }, { name: "b", dir: true }, { name: "x.txt", dir: false }] }, { name: "empty", children: [] }]), { "herdr-tabi": ["a", "b"] });
  assert.deepEqual(worktreeIndex([]), {});
  assert.deepEqual(worktreeIndex(undefined), {});
});

const NOW = 1_000_000_000_000;
const entry = (extra = {}) => ({ id: "t1", createdAt: NOW - 5000, usageId: "claude", name: "Claude Code", task: "arregla el login", command: "tab.new", args: { name: "Claude Code", argv: ["claude"], task: "arregla el login", space: "spA" }, record: { id: "t1", task: "arregla el login", tab: "Koyun", startedAt: NOW - 5000, status: "running" }, ...extra });
const reading = (used, extra = {}) => ({ windows: [{ label: "5h", used, resets: NOW + 3600_000 }, { label: "weekly", used: 10, resets: NOW + 9e8 }], okAt: NOW - 60_000, error: null, ...extra });

test("parseQueue: a saved entry, or null when it is not a usable one (nothing that is not a tab.new is ever run)", () => {
  assert.deepEqual(parseQueue(JSON.stringify(entry())), entry());
  assert.equal(parseQueue("nope"), null);
  assert.equal(parseQueue(JSON.stringify(entry({ command: "pane.close" }))), null);
  assert.equal(parseQueue(JSON.stringify(entry({ args: null }))), null);
  assert.equal(parseQueue(JSON.stringify(entry({ record: null }))), null);
  assert.equal(parseQueue(JSON.stringify(entry({ usageId: "" }))), null);
  assert.equal(parseQueue(JSON.stringify([entry()])), null);
});

test("queueDue: an entry goes when its account is at or under 85 %, with a recent reading; the rest waits", () => {
  const spaces = new Set(["spA"]);
  const go = (e, usage, last = {}) => queueDue([e], usage, NOW, spaces, last);
  assert.deepEqual(go(entry(), { claude: reading(40) }).launch.map((e) => e.id), ["t1"]);
  assert.deepEqual(go(entry(), { claude: reading(85) }).launch.map((e) => e.id), ["t1"]); // at the limit is not over it
  assert.deepEqual(go(entry(), { claude: reading(86) }).launch, []);
  assert.deepEqual(go(entry(), { claude: reading(86) }).waiting.map((e) => e.id), ["t1"]);
  assert.deepEqual(go(entry(), {}).launch, []); // no reading of that account
  assert.deepEqual(go(entry(), { claude: reading(10, { okAt: NOW - QUEUE_FRESH_MS - 1 }) }).launch, []); // an old reading is not trusted
  assert.deepEqual(go(entry(), { claude: reading(10, { okAt: null }) }).launch, []);
  assert.deepEqual(go(entry(), { claude: { ...reading(10), error: "boom" } }).launch.length, 0); // the last reading failed
  assert.deepEqual(go(entry(), { claude: reading(99, { windows: [{ label: "5h", used: 99, resets: NOW - 1 }] }) }).launch.map((e) => e.id), ["t1"]); // the window has renewed since a fresh reading
});

test("queueDue: another account does not decide it, a lost space is reported and never launched, and one goes per account until a new reading", () => {
  const spaces = new Set(["spA"]);
  const usage = { claude: reading(40), codex: reading(95) };
  const a = entry({ id: "a", createdAt: NOW - 3000 });
  const b = entry({ id: "b", createdAt: NOW - 2000 });
  const c = entry({ id: "c", usageId: "codex" });
  const lost = entry({ id: "l", args: { ...entry().args, space: "gone" } });
  const noSpace = entry({ id: "n", createdAt: NOW - 1000, args: { name: "Claude Code", argv: ["claude"] } }); // it was opened without a space: it goes where Herdr puts it
  const r = queueDue([b, c, lost, a, noSpace], usage, NOW, spaces, {});
  assert.deepEqual(r.launch.map((e) => e.id), ["a"]); // oldest first, one per account
  assert.deepEqual(r.waiting.map((e) => e.id).sort(), ["b", "c", "n"]);
  assert.deepEqual(r.lost.map((e) => e.id), ["l"]);
  // after a launch the next one waits for a reading made after it (the reading of these tests is 60 s old)
  assert.deepEqual(queueDue([b], usage, NOW, spaces, { claude: NOW - 30_000 }).launch, []);
  assert.deepEqual(queueDue([b], usage, NOW, spaces, { claude: NOW - 120_000 }).launch.map((e) => e.id), ["b"]);
});
