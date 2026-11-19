import test from "node:test";
import assert from "node:assert/strict";
import { tildePath, shortPath, displayName, isHome, duplicateNames, subline, dotKey, blockHeight } from "./lib.js";

const HOME = "/Users/x";
const sp = (o) => ({ name: "x", named: false, folder: "/x", branch: null, ...o });

test("paths: home becomes ~, long ones keep the last two folders", () => {
  assert.equal(tildePath("/Users/x/Projects/sitios/PitLane", HOME), "~/Projects/sitios/PitLane");
  assert.equal(tildePath("/Users/x", HOME), "~");
  assert.equal(tildePath("/opt/app", HOME), "/opt/app");
  assert.equal(shortPath("/Users/x/Projects/sitios/PitLane", HOME), "…/sitios/PitLane");
  assert.equal(shortPath("/Users/x/x", HOME), "~/x");
});

test("the home space reads '~ inicio'; others keep their name", () => {
  assert.equal(displayName(sp({ name: "~", folder: HOME }), HOME, HOME), "~ inicio");
  assert.equal(displayName(sp({ name: "PitLane", folder: "/Users/x/p" }), "/Users/x/p", HOME), "PitLane");
  assert.equal(displayName(sp({ name: "Trabajo", named: true, folder: HOME }), HOME, HOME), "Trabajo"); // a name someone chose stays
  assert.equal(isHome(sp({ name: "~", folder: "/other" }), null, HOME), true);
});

test("duplicate names are found; their rows show the path and a number", () => {
  const list = [sp({ name: "PitLane" }), sp({ name: "PitLane" }), sp({ name: "~" })];
  const dupes = duplicateNames(list);
  assert.deepEqual([...dupes], ["PitLane"]);
  const where = "/Users/x/Projects/sitios/PitLane";
  assert.equal(subline(sp({ name: "PitLane", branch: "main" }), where, dupes, HOME, 1), "…/sitios/PitLane · #1");
  assert.equal(subline(sp({ name: "PitLane", branch: "main" }), where, dupes, HOME, 2), "…/sitios/PitLane · #2");
  assert.equal(subline(sp({ name: "api", branch: "feat/x" }), "/p/api", dupes, HOME), "feat/x"); // unique: the branch
  assert.equal(subline(sp({ name: "api" }), "/Users/x/api", dupes, HOME), "~/api"); // no branch: the path
});

test("status dot", () => {
  assert.equal(dotKey("blocked"), "blocked");
  assert.equal(dotKey("working"), "working");
  assert.equal(dotKey(null), null);
});

test("block height follows the number of spaces, within limits", () => {
  assert.equal(blockHeight(1), 88);
  assert.equal(blockHeight(3), 172);
  assert.equal(blockHeight(40), 240);
  assert.equal(blockHeight(0), 84);
});

import { ordinals, suffix, orderSpaces, rowWindow, rowsHeight } from "./lib.js";
test("ordinals count by name in list order", () => {
  assert.deepEqual(ordinals([{ id: "a", name: "PitLane" }, { id: "b", name: "~" }, { id: "c", name: "PitLane" }, { id: "d", name: "PitLane" }]), { a: 1, b: 1, c: 2, d: 3 });
});
test("suffix: none for the first, superscript from the second", () => {
  assert.deepEqual([suffix(1), suffix(2), suffix(3), suffix(10)], ["", " ²", " ³", " ¹⁰"]);
});
test("order: active, then with agents (more first), then the rest", () => {
  const spaces = [{ id: "a" }, { id: "b" }, { id: "c", active: true }, { id: "d" }, { id: "e" }];
  assert.deepEqual(orderSpaces(spaces, { b: 1, e: 3 }).map((s) => s.id), ["c", "e", "b", "a", "d"]);
  assert.deepEqual(orderSpaces(spaces, {}).map((s) => s.id), ["c", "a", "b", "d", "e"]);
});
test("window: five rows, whole rows only, offset clamped", () => {
  assert.deepEqual(rowWindow(3, 0, false), { rows: 3, start: 0, more: false, less: false });
  assert.deepEqual(rowWindow(8, 0, false), { rows: 5, start: 0, more: true, less: false });
  assert.deepEqual(rowWindow(8, 9, false), { rows: 5, start: 3, more: false, less: true });
  assert.deepEqual(rowWindow(8, 2, false), { rows: 5, start: 2, more: true, less: true });
  assert.deepEqual(rowWindow(8, 2, true), { rows: 1, start: 0, more: false, less: false }); // folded: only the first, the active one
  assert.deepEqual(rowWindow(0, 0, false), { rows: 0, start: 0, more: false, less: false });
});
test("block height", () => {
  assert.equal(rowsHeight(5), 38 + 140 + 8);
  assert.equal(rowsHeight(1), 74);
});
