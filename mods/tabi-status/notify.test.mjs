import test from "node:test";
import assert from "node:assert/strict";
import { parseConfig, snapshot, changes, message, endpoint } from "./notify.js";

const agent = (address, status, extra = {}) => ({ address, status, app: "claude-code", space_name: "herdr-tabi", ...extra });

test("config: a topic is enough, the rest has defaults", () => {
  assert.deepEqual(parseConfig('{"topic":"tabi-0123456789ab"}'), { server: "https://ntfy.sh", topic: "tabi-0123456789ab", on: ["blocked", "done"], details: false });
});

test("config: server, events and details are read", () => {
  const c = parseConfig('{"topic":"tabi-0123456789ab","server":"https://ntfy.example.com:8443/","on":["blocked","nonsense"],"details":true}');
  assert.deepEqual(c, { server: "https://ntfy.example.com:8443", topic: "tabi-0123456789ab", on: ["blocked"], details: true });
});

test("config: anything unsafe or incomplete turns the feature off", () => {
  assert.equal(parseConfig("not json"), null);
  assert.equal(parseConfig("{}"), null);
  assert.equal(parseConfig('{"topic":"short"}'), null); // too guessable on a public server
  assert.equal(parseConfig('{"topic":"has spaces in it"}'), null);
  assert.equal(parseConfig('{"topic":"tabi-0123456789ab","server":"http://ntfy.example.com"}'), null); // not https
  assert.equal(parseConfig('{"topic":"tabi-0123456789ab","server":42}'), null);
});

test("changes: only an agent that turns blocked or done is reported", () => {
  const prev = snapshot([agent("t1", "working"), agent("t2", "working"), agent("t3", "idle")]);
  const now = [agent("t1", "blocked"), agent("t2", "working"), agent("t3", "done")];
  assert.deepEqual(changes(prev, now, ["blocked", "done"]).map((a) => a.address), ["t1", "t3"]);
});

test("changes: the same status twice, or a status that is not asked for, stays quiet", () => {
  const prev = snapshot([agent("t1", "blocked"), agent("t2", "working")]);
  assert.deepEqual(changes(prev, [agent("t1", "blocked"), agent("t2", "done")], ["blocked"]), []);
  assert.deepEqual(changes(prev, [agent("t1", "idle"), agent("t2", "working")], ["blocked", "done"]), []);
});

test("changes: the first reading and agents seen for the first time never notify", () => {
  assert.deepEqual(changes(null, [agent("t1", "blocked")], ["blocked"]), []);
  assert.deepEqual(changes(snapshot([agent("t1", "working")]), [agent("t1", "working"), agent("msi/t9", "blocked")], ["blocked"]), []);
});

test("message: no space name unless details is on", () => {
  assert.deepEqual(message(agent("t1", "blocked"), false), { title: "Herdr: te necesita", body: "Claude Code necesita tu atención", priority: "high" });
  assert.deepEqual(message(agent("t1", "done"), true), { title: "Herdr: terminó", body: "Claude Code en herdr-tabi terminó", priority: "default" });
  assert.equal(message(agent("t1", "done", { app: "unknown" }), false).body, "Un agente terminó");
});

test("endpoint joins server and topic", () => {
  assert.equal(endpoint({ server: "https://ntfy.sh", topic: "abc12345" }), "https://ntfy.sh/abc12345");
});
