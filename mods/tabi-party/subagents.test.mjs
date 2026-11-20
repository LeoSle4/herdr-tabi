import test from "node:test";
import assert from "node:assert/strict";
import { parseRecord, visibleRows, elapsed, rowInfo, KEEP_DONE_MS, MAX_ROWS } from "./subagents.js";

const rec = (over = {}) => ({ type: "Explore", status: "running", started: 1000, ended: null, summary: "", ...over });

test("parseRecord: a hook file becomes a record", () => {
  const text = JSON.stringify({ type: "web-fetch", status: "done", started: 1, ended: 9, summary: "ok" });
  assert.deepEqual(parseRecord(text), { type: "web-fetch", status: "done", started: 1, ended: 9, summary: "ok" });
  assert.deepEqual(parseRecord('{"status":"running","started":5}'), { type: "agent", status: "running", started: 5, ended: null, summary: "" });
});

test("parseRecord: anything else is ignored", () => {
  for (const bad of ["not json", "null", "[]", '{"status":"weird","started":1}', '{"status":"running"}', '{"status":"running","started":"1"}']) {
    assert.equal(parseRecord(bad), null, bad);
  }
});

test("visibleRows: running first in start order, then finished newest first", () => {
  const now = 100000;
  const list = [
    rec({ type: "b", started: 3000 }), rec({ type: "a", started: 2000 }),
    rec({ type: "old", status: "done", started: 1000, ended: 90000 }), rec({ type: "new", status: "done", started: 1000, ended: 95000 }),
  ];
  assert.deepEqual(visibleRows(list, "working", now).rows.map((r) => r.type), ["a", "b", "new", "old"]);
});

test("visibleRows: a running record of an agent that is not working is a leftover and is hidden", () => {
  const list = [rec(), rec({ type: "done-one", status: "done", ended: 99000 })];
  for (const status of ["idle", "done", undefined]) assert.deepEqual(visibleRows(list, status, 100000).rows.map((r) => r.type), ["done-one"]);
  assert.equal(visibleRows(list, "blocked", 100000).rows.length, 2);
});

test("visibleRows: a finished one goes after two minutes", () => {
  const r = rec({ status: "done", ended: 1000 });
  assert.equal(visibleRows([r], "working", 1000 + KEEP_DONE_MS - 1).rows.length, 1);
  assert.equal(visibleRows([r], "working", 1000 + KEEP_DONE_MS).rows.length, 0);
});

test("visibleRows: at most MAX_ROWS, and it says how many more", () => {
  const list = Array.from({ length: MAX_ROWS + 3 }, (_, i) => rec({ type: `a${i}`, started: i }));
  const { rows, more } = visibleRows(list, "working", 5000);
  assert.equal(rows.length, MAX_ROWS);
  assert.equal(more, 3);
  assert.deepEqual(visibleRows([], "working", 0), { rows: [], more: 0 });
});

test("elapsed: seconds, minutes, hours", () => {
  assert.deepEqual([0, 12000, 59999, 60000, 185000, 3600000, 7300000].map(elapsed), ["0 s", "12 s", "59 s", "1 min", "3 min", "1 h", "2 h"]);
  assert.equal(elapsed(-5000), "0 s");
});

test("rowInfo: running shows the time, finished shows what it reported", () => {
  assert.deepEqual(rowInfo(rec({ started: 1000 }), 13000), { kanji: "働", detail: "12 s", busy: true });
  assert.deepEqual(rowInfo(rec({ status: "done", ended: 5000, summary: "Encontré 3 archivos." }), 9000), { kanji: "済", detail: "Encontré 3 archivos.", busy: false });
  assert.equal(rowInfo(rec({ status: "done", started: 1000, ended: 31000 }), 99000).detail, "30 s");
});
