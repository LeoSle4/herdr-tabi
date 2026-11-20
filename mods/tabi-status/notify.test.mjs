import test from "node:test";
import assert from "node:assert/strict";
import { parseConfig, snapshot, changes, parseSaid, saidFor, nameOf, localMessage, pushPayload, desktopCommand, FRESH_MS } from "./notify.js";

const agent = (address, status, extra = {}) => ({ address, status, app: "claude-code", space_name: "herdr-tabi", ...extra });
const TOPIC = "tabi-0123456789ab";

test("config: a topic is enough for the phone, the rest has defaults", () => {
  assert.deepEqual(parseConfig(`{"topic":"${TOPIC}"}`), { server: "https://ntfy.sh", topic: TOPIC, desktop: false, on: ["blocked", "done"], details: false });
});

test("config: desktop alone is enough, with no topic", () => {
  assert.deepEqual(parseConfig('{"desktop":true}'), { server: "https://ntfy.sh", topic: null, desktop: true, on: ["blocked", "done"], details: false });
  assert.equal(parseConfig('{"desktop":false}'), null);
  assert.equal(parseConfig('{"desktop":"yes"}'), null);
});

test("config: server, events and details are read", () => {
  const c = parseConfig(`{"topic":"${TOPIC}","desktop":true,"server":"https://ntfy.example.com:8443/","on":["blocked","nonsense"],"details":true}`);
  assert.deepEqual(c, { server: "https://ntfy.example.com:8443", topic: TOPIC, desktop: true, on: ["blocked"], details: true });
});

test("config: anything unsafe or incomplete turns the feature off", () => {
  assert.equal(parseConfig("not json"), null);
  assert.equal(parseConfig("null"), null);
  assert.equal(parseConfig("{}"), null);
  assert.equal(parseConfig('{"topic":"short"}'), null); // too guessable on a public server
  assert.equal(parseConfig('{"topic":"has spaces in it"}'), null);
  assert.equal(parseConfig(`{"topic":"${TOPIC}","server":"http://ntfy.example.com"}`), null); // not https
  assert.equal(parseConfig(`{"topic":"${TOPIC}","server":42}`), null);
  assert.equal(parseConfig('{"desktop":true,"topic":"x"}'), null); // a bad topic is an error even when desktop is on
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

test("parseSaid and saidFor: the text that belongs to this change, and only that one", () => {
  assert.deepEqual(parseSaid('{"text":"Listo.","at":5}'), { text: "Listo.", at: 5 });
  for (const bad of ["x", "{}", '{"text":"","at":5}', '{"text":"x","at":"5"}']) assert.equal(parseSaid(bad), null, bad);
  const stop = { text: "Listo.", at: 1000 };
  const notification = { text: "Claude needs your permission to use Bash", at: 1000 };
  assert.equal(saidFor("done", stop, notification, 2000), "Listo.");
  assert.equal(saidFor("blocked", stop, notification, 2000), "Claude needs your permission to use Bash");
  assert.equal(saidFor("working", stop, notification, 2000), "");
  assert.equal(saidFor("done", stop, null, 1000 + FRESH_MS + 1), "");
  assert.equal(saidFor("done", null, null, 1000), "");
});

test("nameOf: the character, else the program, else a generic name", () => {
  assert.equal(nameOf(agent("t1d", "done"), { t1d: { name: "Mai" } }), "Mai");
  assert.equal(nameOf(agent("t1d", "done"), {}), "Claude Code");
  assert.equal(nameOf(agent("t1d", "done", { app: "unknown" }), undefined), "Un agente");
});

test("localMessage: reads like a bot, with the first line of what it said under the name", () => {
  assert.deepEqual(localMessage(agent("t1", "done"), "Mai", "Arreglé el CI"), { title: "Mai terminó", body: "Arreglé el CI" });
  assert.deepEqual(localMessage(agent("t1", "blocked"), "Mai", "Claude needs your permission"), { title: "Mai te necesita", body: "Claude needs your permission" });
  assert.deepEqual(localMessage(agent("t1", "done"), "Mai", ""), { title: "Mai terminó", body: "herdr-tabi" });
});

test("pushPayload: without details nothing but the program and the status leaves the machine", () => {
  const cfg = { topic: TOPIC, details: false };
  assert.deepEqual(pushPayload(cfg, agent("t1", "blocked"), "Mai", "secret answer"), { topic: TOPIC, title: "Herdr: te necesita", message: "Claude Code necesita tu atención", priority: "high" });
  assert.deepEqual(pushPayload(cfg, agent("t1", "done"), "Mai", "secret answer"), { topic: TOPIC, title: "Herdr: terminó", message: "Claude Code terminó", priority: "default" });
  assert.equal(JSON.stringify(pushPayload(cfg, agent("t1", "done"), "Mai", "secret answer")).includes("secret"), false);
  assert.equal(JSON.stringify(pushPayload(cfg, agent("t1", "done"), "Mai", "x")).includes("herdr-tabi"), false);
});

test("pushPayload: with details it is the same message as on the desktop", () => {
  const cfg = { topic: TOPIC, details: true };
  assert.deepEqual(pushPayload(cfg, agent("t1", "done"), "Mai", "Arreglé el CI"), { topic: TOPIC, title: "Mai terminó", message: "Arreglé el CI", priority: "default" });
  assert.equal(pushPayload(cfg, agent("t1", "blocked"), "Mai", "").priority, "high");
});

test("desktopCommand: one program per platform, the text only ever as arguments", () => {
  const evil = 'a"; do shell script "rm -rf ~" #';
  const mac = desktopCommand("macos", "Mai terminó", evil);
  assert.equal(mac.command, "osascript");
  assert.deepEqual(mac.args.slice(-2), ["Mai terminó", evil]);
  assert.equal(mac.args.some((a) => a.includes("rm -rf") && a !== evil), false);
  assert.deepEqual(desktopCommand("macos", "T", "B", { terminalNotifier: true }), { command: "terminal-notifier", args: ["-title", "T", "-message", "B", "-group", "tabi"] });
  assert.deepEqual(desktopCommand("macos", "T", "", { terminalNotifier: true }).args[3], " ");
  const win = desktopCommand("windows", "T", "B", { script: "C:\\h\\tools\\desktop-notify.ps1" });
  assert.equal(win.command, "powershell");
  assert.deepEqual(win.args.slice(-6), ["-File", "C:\\h\\tools\\desktop-notify.ps1", "-Title", "T", "-Body", "B"]);
  assert.deepEqual(desktopCommand("linux", "-T", "B"), { command: "notify-send", args: ["--app-name=Herdr", "--", "-T", "B"] });
});
