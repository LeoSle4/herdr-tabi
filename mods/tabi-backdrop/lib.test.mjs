import test from "node:test";
import assert from "node:assert/strict";
import { darkness, withAlpha, pickUnused, pruneSpaces, tagLabel, mergeLive, patchLayout } from "./lib.js";

test("brighter pictures get a darker layer; unknown gets the strongest", () => {
  assert.ok(darkness(0.76) > darkness(0.14));
  assert.equal(darkness(null), 0.9);
  assert.ok(darkness(0) >= 0.6 && darkness(1) <= 0.95);
  assert.ok(darkness(0.76) >= 0.84); // the brightest picture here stays readable
});

test("hex with alpha", () => {
  assert.equal(withAlpha("#0d1014", 1), "#0d1014ff");
  assert.equal(withAlpha("#0d1014", 0), "#0d101400");
  assert.equal(withAlpha("#0d1014", 0.5).length, 9);
});

test("a new space gets a picture nobody has; when all are taken, the least used", () => {
  const files = ["a", "b", "c"];
  assert.equal(pickUnused(files, ["a", "b"], () => 0), "c");
  assert.equal(pickUnused(files, [], () => 0.99), "c");
  assert.equal(pickUnused(files, ["a", "b", "c"], () => 0), "a");
  assert.equal(pickUnused(files, ["a", "a", "b", "c"], () => 0), "b");
  assert.equal(pickUnused([], [], () => 0), null);
});

test("closed spaces free their pictures", () => {
  assert.deepEqual(pruneSpaces({ s1: "a", s2: "b" }, ["s2", "s3"]), { s2: "b" });
});

test("tag: the position of the picture in the list", () => {
  assert.equal(tagLabel(["a", "b", "c"], "b"), "fondo 2/3");
  assert.equal(tagLabel(["a"], "zz"), "sin fondo");
});

test("merge live: sizes, hidden and the stack's child come from the window; the rest stays as on disk", () => {
  const file = { id: "root", children: [
    { id: "sessions", size: { weight: 2 }, content: { mod: "s" } },
    { id: "panel", hidden: true, size: { px: 368 }, children: [{ id: "body", type: "stack", active: "files", children: [{ id: "files" }] }] },
    { id: "gone", size: { px: 1 } },
  ] };
  const live = { id: "root", children: [
    { id: "sessions", size: { px: 330 } },
    { id: "panel", hidden: false, size: { px: 312 }, children: [{ id: "body", active: "changes", children: [] }] },
  ] };
  const out = mergeLive(file, live);
  assert.deepEqual(out.children[0], { id: "sessions", size: { px: 330 }, content: { mod: "s" } });
  assert.equal(out.children[1].hidden, false);
  assert.deepEqual(out.children[1].size, { px: 312 });
  assert.equal(out.children[1].children[0].active, "changes");
  assert.deepEqual(out.children[2], { id: "gone", size: { px: 1 } }); // not in the live tree: untouched
  assert.deepEqual(file.children[0].size, { weight: 2 }); // the input is not mutated
  live.children[0].size.px = 1;
  assert.equal(out.children[0].size.px, 330); // and the copy shares nothing with the live tree
});

test("patching a layout paints work-body and darkens the pane frame, leaving the rest alone", () => {
  const layout = { id: "root", children: [{ id: "work-body", children: [{ id: "main", content: { tab: "active", pane: { gap: 6, background: "x" } } }] }, { id: "other" }] };
  const out = patchLayout(layout, "backgrounds/tabi/03.jpg", 0.8);
  assert.deepEqual(out.children[0].background, { image: "backgrounds/tabi/03.jpg", fit: "cover" });
  assert.equal(out.children[0].children[0].content.pane.background, "#0d1014cc");
  assert.equal(out.children[0].children[0].content.pane.gap, 6);
  assert.equal(layout.children[0].background, undefined); // the input is not mutated
  assert.equal(out.children[1].background, undefined);
});
