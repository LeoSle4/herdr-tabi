import test from "node:test";
import assert from "node:assert/strict";
import { normalize, findSpaceByFolder, recentFromLs } from "./lib.js";

test("normalize drops trailing separators and unifies them", () => {
  assert.equal(normalize("/a/b/"), "/a/b");
  assert.equal(normalize("C:\\x\\y\\"), "C:/x/y");
  assert.equal(normalize("/"), "/");
  assert.equal(normalize(null), "");
});

test("an existing space is found by its folder or by where its terminal is now", () => {
  const spaces = [{ id: "a", folder: "/Users/x" }, { id: "b", folder: "/Users/x" }];
  const where = (s) => (s.id === "b" ? "/Users/x/Projects/PitLane/" : s.folder);
  assert.equal(findSpaceByFolder(spaces, where, "/Users/x/Projects/PitLane").id, "b");
  assert.equal(findSpaceByFolder(spaces, where, "/Users/x/").id, "a");
  assert.equal(findSpaceByFolder(spaces, where, "/Users/x/other"), undefined);
});

test("recent folders from ls -t: newest first, folders only, no hidden ones, at most six", () => {
  const out = "new/\nfile.txt\n.hidden/\nd/\nc/\nb/\na/\nold/\n";
  assert.deepEqual(recentFromLs(out, "/p").map((x) => x.name), ["new", "d", "c", "b", "a", "old"]);
  assert.deepEqual(recentFromLs(out, "/p", 2), [{ name: "new", path: "/p/new" }, { name: "d", path: "/p/d" }]);
  assert.deepEqual(recentFromLs("", "/p"), []);
});
