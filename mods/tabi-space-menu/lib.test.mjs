import test from "node:test";
import assert from "node:assert/strict";
import {
  normalize, findSpaceByFolder, recentFromPaths, shellQuote, expandPath,
  defaultProjectFolders, projectFolders, usableFolders,
} from "./lib.js";

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

test("recent folders: newest first, no hidden ones, no repeated names, at most six", () => {
  const out = "/p/new/\n/q/dup/\n/p/.hidden/\n/p/d/\n/p/c/\n/p/dup/\n/p/b/\n/p/a/\n/p/old/\n";
  assert.deepEqual(recentFromPaths(out).map((x) => x.name), ["new", "dup", "d", "c", "b", "a"]);
  assert.deepEqual(recentFromPaths(out, 2), [{ name: "new", path: "/p/new" }, { name: "dup", path: "/q/dup" }]);
  assert.deepEqual(recentFromPaths(""), []);
});

test("recent folders accept Windows output (backslashes, CRLF, no trailing separator)", () => {
  const out = "C:\\Users\\x\\Projects\\PitLane\r\nC:\\Users\\x\\Projects\\.git\r\n";
  assert.deepEqual(recentFromPaths(out), [{ name: "PitLane", path: "C:/Users/x/Projects/PitLane" }]);
});

test("shellQuote survives spaces and single quotes", () => {
  assert.equal(shellQuote("/a b/c"), "'/a b/c'");
  assert.equal(shellQuote("/it's"), "'/it'\\''s'");
});

test("expandPath replaces ~ and %USERPROFILE% only at the start", () => {
  assert.equal(expandPath("~/Projects", "/Users/x"), "/Users/x/Projects");
  assert.equal(expandPath("~", "/Users/x/"), "/Users/x");
  assert.equal(expandPath("%USERPROFILE%\\Projects", "C:\\Users\\x"), "C:\\Users\\x\\Projects");
  assert.equal(expandPath("/srv/~/p", "/Users/x"), "/srv/~/p");
  assert.equal(expandPath("~other/p", "/Users/x"), "~other/p");
});

test("defaults: ~/Projects first, then Documents/Projects (the redirected Documents too, without repeats)", () => {
  assert.deepEqual(defaultProjectFolders("/Users/x", "/Users/x/Documents"), ["/Users/x/Projects", "/Users/x/Documents/Projects"]);
  assert.deepEqual(defaultProjectFolders("/Users/x", null), ["/Users/x/Projects", "/Users/x/Documents/Projects"]);
  assert.deepEqual(
    defaultProjectFolders("C:\\Users\\x", "C:\\Users\\x\\OneDrive\\Documentos"),
    ["C:/Users/x/Projects", "C:/Users/x/OneDrive/Documentos/Projects", "C:/Users/x/Documents/Projects"],
  );
});

test("configured folders win; a missing, broken or empty config falls back to the defaults", () => {
  const defaults = ["/Users/x/Projects", "/Users/x/Documents/Projects"];
  const cfg = JSON.stringify({ projectFolders: ["~/Code", " ", 7, "~/Code/", "/srv/apps"] });
  assert.deepEqual(projectFolders(cfg, "/Users/x", null), ["/Users/x/Code", "/srv/apps"]);
  assert.deepEqual(projectFolders(null, "/Users/x", null), defaults);
  assert.deepEqual(projectFolders("{ not json", "/Users/x", null), defaults);
  assert.deepEqual(projectFolders('{"projectFolders": []}', "/Users/x", null), defaults);
  assert.deepEqual(projectFolders('{"other": 1}', "/Users/x", null), defaults);
});

test("usable folders: only those that exist, and a symlink to an earlier folder counts once", () => {
  const folders = ["/Users/x/Projects", "/Users/x/Documents/Projects", "/Users/x/Gone", "/srv/apps"];
  // 1-based index <TAB> real path; "Gone" does not exist so it has no line.
  const resolved = "1\t/Users/x/Projects\n2\t/Users/x/Projects\n4\t/srv/apps\n";
  assert.deepEqual(usableFolders(folders, resolved), ["/Users/x/Projects", "/srv/apps"]);
  assert.deepEqual(usableFolders(folders, ""), []);
  const win = ["C:/a/Projects", "C:/b/Projects"];
  assert.deepEqual(usableFolders(win, "1\tC:\\a\\Projects\r\n2\tc:\\A\\projects\r\n"), ["C:/a/Projects"]);
});
