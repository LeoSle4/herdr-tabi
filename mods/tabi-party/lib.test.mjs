import test from "node:test";
import assert from "node:assert/strict";
import { statusInfo, portraitNames, taskLine, accountNames, subtitle, isImage, pickPortrait, thumbName, cropSide, parseFolder, reconcilePortraits, configDirOf, accountOf } from "./lib.js";

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
