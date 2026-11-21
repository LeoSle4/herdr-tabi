import test from "node:test";
import assert from "node:assert/strict";
import { parseTask, pendingReview, markReviewed, folderFor, diffStat, prText, copyCommand, agentOf, agoLabel, REVIEW_WINDOW_MS } from "./lib.js";
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
