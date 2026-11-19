import test from "node:test";
import assert from "node:assert/strict";
import { accountNames, pending, agoShort, changeSummary, parseLastCommit, parseAhead, filesLabel } from "./lib.js";

test("account names number the second agent of the same program", () => {
  const list = [{ address: "a", program: { key: "claude" } }, { address: "b", program: { key: "claude" } }, { address: "c", program: { key: "codex" } }];
  assert.deepEqual(accountNames(list), { a: "claude", b: "claude2", c: "codex" });
});

test("pending keeps only the blocked agents", () => {
  const list = [{ status: "working" }, { status: "blocked", address: "x" }, { status: "idle" }, { status: "done" }];
  assert.deepEqual(pending(list), [{ status: "blocked", address: "x" }]);
  assert.deepEqual(pending([]), []);
});

test("ago: minutes, hours, days", () => {
  const now = 10_000_000;
  assert.equal(agoShort(now / 1000 - 20, now), "hace un momento");
  assert.equal(agoShort(now / 1000 - 3 * 60, now), "hace 3 min");
  assert.equal(agoShort(now / 1000 - 2 * 3600, now), "hace 2 h");
  assert.equal(agoShort(now / 1000 - 4 * 86400, now), "hace 4 d");
});

test("change summary counts files and sums lines, binary files count as zero", () => {
  assert.deepEqual(changeSummary(" M a.kt\n?? b.js\n", "7\t2\ta.kt\n-\t-\timg.png\n3\t0\tb.js\n"), { files: 2, add: 10, del: 2 });
  assert.deepEqual(changeSummary("", ""), { files: 0, add: 0, del: 0 });
});

test("last commit parses time and subject, even with tabs in the subject", () => {
  assert.deepEqual(parseLastCommit("1795000000\tfix: a\tb\n"), { at: 1795000000, subject: "fix: a\tb" });
  assert.equal(parseLastCommit(""), null);
  assert.equal(parseLastCommit("nope\tx"), null);
});

test("ahead: a number, or null without an upstream", () => {
  assert.equal(parseAhead(0, "3\n"), 3);
  assert.equal(parseAhead(0, "0\n"), 0);
  assert.equal(parseAhead(128, ""), null);
});

test("files label", () => {
  assert.deepEqual([filesLabel(0), filesLabel(1), filesLabel(15)], ["sin cambios", "1 archivo", "15 archivos"]);
});
