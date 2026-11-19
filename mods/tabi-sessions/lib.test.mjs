import test from "node:test";
import assert from "node:assert/strict";
import { accountTag, accountArgs, filterSessions, groupSessions, resumeArgv, ago, folderName, DEFAULT_OPEN, sectionOpen, groupOpen, withSection, withGroup } from "./lib.js";

const NOW = new Date(2026, 10, 19, 15, 0, 0).getTime(); // 19 Nov 2026, 15:00 local
const H = 3600 * 1000;
const D = 24 * H;
const s = (id, last, extra = {}) => ({ id, title: id, cwd: "/x", last, native_pin: false, ...extra });

test("groups: pinned first, then today, last 7 days, older; each session once", () => {
  const list = [
    s("old", NOW - 30 * D),
    s("today", NOW - 2 * H),
    s("yesterday", NOW - 20 * H),
    s("pinned", NOW - 40 * D),
    s("codexpin", NOW - 3 * D, { native_pin: true }),
  ];
  const groups = groupSessions(list, ["pinned"], NOW);
  assert.deepEqual(groups.map((g) => g.key), ["pinned", "today", "week", "older"]);
  assert.deepEqual(groups[0].items.map((i) => i.id), ["codexpin", "pinned"]);
  assert.deepEqual(groups[1].items.map((i) => i.id), ["today"]);
  assert.deepEqual(groups[2].items.map((i) => i.id), ["yesterday"]);
  assert.deepEqual(groups[3].items.map((i) => i.id), ["old"]);
});

test("groups: empty groups are left out", () => {
  assert.deepEqual(groupSessions([s("a", NOW - H)], [], NOW).map((g) => g.key), ["today"]);
  assert.deepEqual(groupSessions([], [], NOW), []);
});

test("groups: the 7-day window starts at local midnight six days back", () => {
  const edgeIn = new Date(2026, 10, 13, 0, 0, 1).getTime();
  const edgeOut = new Date(2026, 10, 12, 23, 59, 59).getTime();
  const groups = groupSessions([s("in", edgeIn), s("out", edgeOut)], [], NOW);
  assert.deepEqual(groups.map((g) => [g.key, g.items[0].id]), [["week", "in"], ["older", "out"]]);
});

test("filter: every word, ignoring case and accents, in title or folder", () => {
  const list = [s("a", 1, { title: "Revisión del Backend", cwd: "/p/Proyecto_futuro" }), s("b", 1, { title: "otra cosa", cwd: "/p/otro" })];
  assert.deepEqual(filterSessions(list, "revision backend").map((i) => i.id), ["a"]);
  assert.deepEqual(filterSessions(list, "futuro").map((i) => i.id), ["a"]);
  assert.deepEqual(filterSessions(list, "revision otro").map((i) => i.id), []);
  assert.equal(filterSessions(list, "  ").length, 2);
});

test("resume command per agent", () => {
  assert.deepEqual(resumeArgv("claude", "abc"), ["claude", "--resume", "abc"]);
  assert.deepEqual(resumeArgv("codex", "abc"), ["codex", "resume", "abc"]);
});

test("ago and folderName", () => {
  assert.equal(ago(NOW - 10 * 1000, NOW), "ahora");
  assert.equal(ago(NOW - 5 * 60000, NOW), "5 min");
  assert.equal(ago(NOW - 3 * H, NOW), "3 h");
  assert.equal(ago(NOW - 2 * D, NOW), "2 d");
  assert.equal(folderName("/Users/a/Proyecto"), "Proyecto");
  assert.equal(folderName("C:\\Users\\a\\Proyecto\\"), "Proyecto");
});

test("folderName: a very short last name comes with the folder above (Codex chat folders)", () => {
  assert.equal(folderName("/Users/a/Documents/Codex/2026-11-17/ti"), "2026-11-17/ti");
  assert.equal(folderName("/Users/a/Documents/Codex/2026-10-13/h"), "2026-10-13/h");
  assert.equal(folderName("/Users/a/Documents/Projects/echoes-sle"), "echoes-sle");
  assert.equal(folderName("C:\\Users\\a\\Codex\\2026-10-12\\con"), "2026-10-12/con");
  assert.equal(folderName("/ab"), "ab");
  assert.equal(folderName(""), "");
});

test("folding: sections open by default; Fijadas and Hoy open, the older groups closed; state is not mutated", () => {
  assert.equal(sectionOpen({}, "claude"), true);
  assert.deepEqual(DEFAULT_OPEN, { pinned: true, today: true, week: false, older: false });
  assert.equal(groupOpen({}, "claude", "today", false), true);
  assert.equal(groupOpen({}, "claude", "week", false), false);
  assert.equal(groupOpen({}, "claude", "older", false), false);
  const ui = {};
  const folded = withSection(ui, "codex", false);
  assert.equal(sectionOpen(folded, "codex"), false);
  assert.equal(sectionOpen(folded, "claude"), true);
  assert.deepEqual(ui, {});
  const opened = withGroup(folded, "claude", "week", true);
  assert.equal(groupOpen(opened, "claude", "week", false), true);
  assert.equal(groupOpen(opened, "codex", "week", false), false); // per agent
  assert.equal(sectionOpen(opened, "codex"), false); // the other state is kept
});

test("a search opens every group", () => {
  assert.equal(groupOpen({}, "claude", "older", true), true);
});

test("resume with another account uses its wrapper; codex and the default stay as they were", () => {
  assert.deepEqual(resumeArgv("claude", "abc", "/h/.local/bin/claude2"), ["/h/.local/bin/claude2", "--resume", "abc"]);
  assert.deepEqual(resumeArgv("codex", "abc", "/h/.local/bin/claude2"), ["codex", "resume", "abc"]);
});

test("account tag: none for the default, c2 for claude2", () => {
  assert.deepEqual([undefined, null, "claude", "claude2", "claude10", "otra"].map(accountTag), ["", "", "", "c2", "c10", "otr"]);
});

test("account args for sessions.py: name=dir of the extra accounts only", () => {
  const accounts = [{ name: "claude", dir: "/h/.claude", default: true }, { name: "claude2", dir: "/h/.c2", default: false }];
  assert.deepEqual(accountArgs(accounts), ["claude2=/h/.c2"]);
  assert.deepEqual(accountArgs(undefined), []);
});
