import test from "node:test";
import assert from "node:assert/strict";
import { parseTask, pendingReview, markReviewed, folderFor, diffStat, prText, copyCommand, agentOf, agoLabel, REVIEW_WINDOW_MS, reviewState, groupReview, fileChanges, shortPath, daySummary, summaryText, parseQueue, sortQueue } from "./lib.js";
import * as party from "../tabi-party/lib.js";

const DAY = 24 * 3600 * 1000;
const rec = (extra = {}) => ({ id: "a", task: "arregla el login", agent: "Claude Code", agentKey: "claude", character: "Koyun", tab: "Koyun", branch: null, folder: "/p/repo", machine: null, startedAt: 1000, status: "done", finishedAt: 5000, result: "Listo: arreglé el formulario.", verify: "node --test", check: { state: "pass", code: 0, at: 6000, tail: "12 passed" }, ...extra });

test("parseTask: a saved record, or null; the fields it does not know are kept", () => {
  assert.deepEqual(parseTask(JSON.stringify(rec())), rec());
  assert.equal(parseTask(JSON.stringify(rec({ reviewed: true }))).reviewed, true);
  assert.equal(parseTask("nope"), null);
  assert.equal(parseTask("[]"), null);
  assert.equal(parseTask(JSON.stringify({ ...rec(), task: "" })), null);
});

test("pendingReview: finished tasks nobody has reviewed, the newest first, of the last week", () => {
  const now = 10 * DAY;
  const list = [
    rec({ id: "old", finishedAt: now - 8 * DAY }),
    rec({ id: "run", status: "running", finishedAt: null }),
    rec({ id: "seen", reviewed: true, finishedAt: now - 1000 }),
    rec({ id: "b", finishedAt: now - 3000 }),
    rec({ id: "a", finishedAt: now - 1000 }),
  ];
  assert.deepEqual(pendingReview(list, now).map((r) => r.id), ["a", "b"]);
  assert.equal(REVIEW_WINDOW_MS, 7 * DAY);
  assert.deepEqual(pendingReview([], now), []);
  assert.deepEqual(pendingReview(undefined, now), []);
});

test("pendingReview: a task finished with no time recorded still counts, after the ones that have one", () => {
  const now = 10 * DAY;
  const ids = pendingReview([rec({ id: "no-time", finishedAt: null }), rec({ id: "t", finishedAt: now - 5 })], now).map((r) => r.id);
  assert.deepEqual(ids, ["t", "no-time"]);
});

test("markReviewed: the same record, reviewed, and when", () => {
  const r = markReviewed(rec(), 9000);
  assert.deepEqual([r.reviewed, r.reviewedAt, r.task], [true, 9000, "arregla el login"]);
});

test("folderFor: a worktree task is looked at where its branch lives, any other where it was given", () => {
  const spaces = [{ id: "s1", folder: "/p/repo", branch: "main" }, { id: "s2", folder: "/w/repo/koyun", branch: "tabi/koyun-arregla" }];
  assert.equal(folderFor(rec({ branch: "tabi/koyun-arregla" }), spaces), "/w/repo/koyun");
  assert.equal(folderFor(rec({ branch: "tabi/other" }), spaces), "/p/repo"); // its space is gone: where it was given
  assert.equal(folderFor(rec({ branch: null }), spaces), "/p/repo");
  assert.equal(folderFor(rec({ branch: null, folder: null }), spaces), null);
  assert.equal(folderFor(rec({ branch: "x" }), undefined), "/p/repo");
});

test("diffStat: files and lines changed (tracked, from numstat) and files not tracked yet (from status)", () => {
  const numstat = "10\t2\tsrc/a.js\n3\t0\tsrc/b.js\n-\t-\tlogo.png\n";
  const status = " M src/a.js\n M src/b.js\n M logo.png\n?? notes.md\n?? tmp/\n";
  assert.deepEqual(diffStat(numstat, status), { files: 3, add: 13, del: 2, untracked: 2 });
  assert.deepEqual(diffStat("", ""), { files: 0, add: 0, del: 0, untracked: 0 });
  assert.deepEqual(diffStat(undefined, undefined), { files: 0, add: 0, del: 0, untracked: 0 });
});

test("prText: a description of the task for a pull request, with what the agent said, the check and the changes", () => {
  const t = prText(rec({ branch: "tabi/koyun-arregla" }), { files: 3, add: 13, del: 2, untracked: 1 });
  assert.match(t, /^## arregla el login/);
  assert.match(t, /Listo: arreglé el formulario\./);
  assert.match(t, /node --test.*✓.*12 passed/s);
  assert.match(t, /3 archivos/);
  assert.match(t, /\+13/);
  assert.match(t, /−2/);
  assert.match(t, /1 sin seguimiento/);
  assert.match(t, /tabi\/koyun-arregla/);
});

test("prText: without a check, a result or changes it only says what it knows", () => {
  const t = prText(rec({ verify: null, check: null, result: null }), { files: 0, add: 0, del: 0, untracked: 0 });
  assert.doesNotMatch(t, /Comprobación/);
  assert.doesNotMatch(t, /Resultado/);
  assert.match(t, /sin cambios/);
  assert.match(prText(rec({ check: { state: "fail", tail: "2 failed" } }), { files: 1, add: 1, del: 0, untracked: 0 }), /✗.*2 failed/s);
  assert.match(prText(rec({ check: { state: "running" } }), { files: 1, add: 1, del: 0, untracked: 0 }), /comprobando/);
});

test("copyCommand: how the text gets to the clipboard, on the platforms that have a tool for it", () => {
  assert.deepEqual(copyCommand("macos", "hola"), { command: "sh", args: ["-c", 'printf %s "$1" | pbcopy', "sh", "hola"] });
  const linux = copyCommand("linux", "hola");
  assert.equal(linux.command, "sh");
  assert.match(linux.args[1], /wl-copy|xclip/);
  assert.equal(linux.args[linux.args.length - 1], "hola");
  assert.equal(copyCommand("windows", "hola"), null);
});

test("agentOf: the agent a task belongs to, by the name of its tab and its machine; none when it has gone", () => {
  const agents = [{ address: "t1", tab_name: "Koyun", pane: "p1" }, { address: "msi-casa/t5", tab_name: "Koyun", pane: "p5" }, { address: "t2", tab_name: "Mai", pane: "p2" }];
  const machineOf = (a) => (a.address.includes("/") ? "msi-casa" : null);
  assert.equal(agentOf(rec(), agents, machineOf).pane, "p1");
  assert.equal(agentOf(rec({ machine: "msi-casa" }), agents, machineOf).pane, "p5");
  assert.equal(agentOf(rec({ tab: "Rusita" }), agents, machineOf), null);
  assert.equal(agentOf(rec(), [], machineOf), null);
});

test("the copy of parseTask behaves like the original of tabi-party", () => {
  for (const t of [JSON.stringify(rec()), JSON.stringify({ ...rec(), status: "weird" }), JSON.stringify({ ...rec(), result: 5 }), "nope", "[]", JSON.stringify({ ...rec(), startedAt: "x" })]) {
    assert.deepEqual(parseTask(t), party.parseTask(t));
  }
});

test("tabi-party counts the tasks to review the same way as the inbox lists them", () => {
  const now = 10 * DAY;
  const list = [rec({ id: "a", finishedAt: now - 1000 }), rec({ id: "b", reviewed: true }), rec({ id: "c", status: "running", finishedAt: null }), rec({ id: "d", finishedAt: now - 9 * DAY }), rec({ id: "e", finishedAt: null })];
  assert.equal(party.reviewCount(list, now), pendingReview(list, now).length);
  assert.equal(party.reviewCount(list, now), 2);
  assert.equal(party.reviewCount([], now), 0);
  assert.equal(party.reviewCount(undefined, now), 0);
});

test("agoLabel: how long ago a task finished, in a few words", () => {
  const now = 10 * DAY;
  assert.equal(agoLabel(now - 20 * 1000, now), "ahora");
  assert.equal(agoLabel(now - 5 * 60 * 1000, now), "hace 5 min");
  assert.equal(agoLabel(now - 3 * 3600 * 1000, now), "hace 3 h");
  assert.equal(agoLabel(now - 2 * DAY, now), "hace 2 d");
  assert.equal(agoLabel(null, now), "");
  assert.equal(agoLabel(now + 5000, now), "ahora");
});

test("reviewState: what the check of a task says, in four words", () => {
  assert.equal(reviewState(rec()), "pass");
  assert.equal(reviewState(rec({ check: { state: "fail", code: 1, tail: "2 failed" } })), "fail");
  assert.equal(reviewState(rec({ check: { state: "running" } })), "running");
  assert.equal(reviewState(rec({ check: null })), "running"); // it has a check to run and no answer yet
  assert.equal(reviewState(rec({ verify: null, check: null })), "none");
  assert.equal(reviewState(rec({ verify: "", check: null })), "none");
});

test("groupReview: failures first, then what passed, what is checking, what has no check; empty groups are left out; the order inside a group is kept", () => {
  const list = [
    rec({ id: "n1", verify: null, check: null }),
    rec({ id: "p1" }),
    rec({ id: "f1", check: { state: "fail", code: 1, tail: "x" } }),
    rec({ id: "r1", check: { state: "running" } }),
    rec({ id: "p2" }),
  ];
  const groups = groupReview(list);
  assert.deepEqual(groups.map((g) => g.key), ["fail", "pass", "running", "none"]);
  assert.deepEqual(groups.map((g) => g.items.map((r) => r.id)), [["f1"], ["p1", "p2"], ["r1"], ["n1"]]);
  for (const g of groups) { assert.ok(g.label && g.hint, `${g.key} explains itself`); }
  assert.deepEqual(groupReview([rec({ id: "p1" })]).map((g) => g.key), ["pass"]);
  assert.deepEqual(groupReview([]), []);
  assert.deepEqual(groupReview(undefined), []);
});

test("fileChanges: one entry per file, tracked ones with their lines (a binary one has none) and then the ones git does not follow yet", () => {
  const numstat = "10\t2\tsrc/a.js\n3\t0\tsrc/b.js\n-\t-\tlogo.png\n";
  const status = " M src/a.js\n?? notes.md\n?? tmp/\n";
  assert.deepEqual(fileChanges(numstat, status), [
    { path: "src/a.js", add: 10, del: 2, untracked: false },
    { path: "src/b.js", add: 3, del: 0, untracked: false },
    { path: "logo.png", add: null, del: null, untracked: false },
    { path: "notes.md", add: null, del: null, untracked: true },
    { path: "tmp/", add: null, del: null, untracked: true },
  ]);
  assert.deepEqual(fileChanges("", ""), []);
  assert.deepEqual(fileChanges(undefined, undefined), []);
  // it counts the same files diffStat counts
  assert.equal(fileChanges(numstat, status).filter((f) => !f.untracked).length, diffStat(numstat, status).files);
  assert.equal(fileChanges(numstat, status).filter((f) => f.untracked).length, diffStat(numstat, status).untracked);
});

test("shortPath: the end of a long path, which is the part that tells the files apart", () => {
  assert.equal(shortPath("src/a.js", 30), "src/a.js");
  assert.equal(shortPath("mods/tabi-review/lib.test.mjs", 20), "…/lib.test.mjs");
  assert.equal(shortPath("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.js", 12), "…aaaaaaaa.js");
  assert.equal(shortPath("", 10), "");
});

test("daySummary: what ended in the last 24 hours, whether or not it was reviewed: how many, what the checks said, and by which agent", () => {
  const now = 100 * DAY;
  const list = [
    rec({ id: "1", finishedAt: now - 1000 }),
    rec({ id: "2", finishedAt: now - 2000, check: { state: "fail", tail: "x" }, agent: "Codex" }),
    rec({ id: "3", finishedAt: now - 3000, verify: null, check: null, reviewed: true }),
    rec({ id: "4", finishedAt: now - 2 * DAY }), // too old
    rec({ id: "5", status: "running", finishedAt: undefined }), // not ended
    rec({ id: "6", finishedAt: now - 4000, agent: "Codex" }),
  ];
  assert.deepEqual(daySummary(list, now), { total: 4, pass: 2, fail: 1, none: 1, running: 0, reviewed: 1, agents: [["Claude Code", 2], ["Codex", 2]] });
  assert.deepEqual(daySummary([], now), { total: 0, pass: 0, fail: 0, none: 0, running: 0, reviewed: 0, agents: [] });
  assert.deepEqual(daySummary(undefined, now).total, 0);
});

test("summaryText: the day in one line, only with what there is, and empty when nothing ended", () => {
  const s = { total: 4, pass: 2, fail: 1, none: 1, running: 0, reviewed: 1, agents: [["Claude Code", 2], ["Codex", 2]] };
  assert.equal(summaryText(s), "Hoy: 4 tareas · 2 ✓ · 1 ✗ · 1 sin comprobación · 1 revisada · Claude Code 2 · Codex 2");
  assert.equal(summaryText({ total: 1, pass: 1, fail: 0, none: 0, running: 0, reviewed: 0, agents: [["Codex", 1]] }), "Hoy: 1 tarea · 1 ✓ · Codex 1");
  assert.equal(summaryText({ total: 0, pass: 0, fail: 0, none: 0, running: 0, reviewed: 0, agents: [] }), "");
});

test("parseQueue: the same entries as tabi-party reads (a copy of it), and the ones waiting go oldest first", () => {
  const e = (id, createdAt, extra = {}) => ({ id, createdAt, usageId: "claude", name: "Claude Code", task: `t${id}`, command: "tab.new", args: { name: "K", argv: ["claude"] }, record: { id }, ...extra });
  for (const x of [e("a", 1), e("b", 2, { command: "pane.close" }), e("c", 3, { args: null }), e("d", 4, { usageId: "" })]) {
    assert.deepEqual(parseQueue(JSON.stringify(x)), party.parseQueue(JSON.stringify(x)));
  }
  assert.equal(parseQueue("nope"), null);
  assert.deepEqual(sortQueue([e("b", 20), e("a", 10), e("c", 30)]).map((x) => x.id), ["a", "b", "c"]);
  assert.deepEqual(sortQueue(undefined), []);
});
