import test from "node:test";
import assert from "node:assert/strict";
import { parseConfig, appendLog, parseCurl, snapshot, changes, parseSaid, saidFor, nameOf, localMessage, cardMessage, portraitOf, pushPayload, desktopCommand, FRESH_MS } from "./notify.js";

const agent = (address, status, extra = {}) => ({ address, status, app: "claude-code", space_name: "herdr-tabi", ...extra });
const TOPIC = "tabi-0123456789ab";

test("config: a topic is enough for the phone, the rest has defaults", () => {
  assert.deepEqual(parseConfig(`{"topic":"${TOPIC}"}`), { server: "https://ntfy.sh", topic: TOPIC, desktop: false, on: ["blocked", "done"], details: false, notifier: "auto", debug: false });
});

test("config: desktop alone is enough, with no topic", () => {
  assert.deepEqual(parseConfig('{"desktop":true}'), { server: "https://ntfy.sh", topic: null, desktop: true, on: ["blocked", "done"], details: false, notifier: "auto", debug: false });
  assert.equal(parseConfig('{"desktop":false}'), null);
  assert.equal(parseConfig('{"desktop":"yes"}'), null);
});

test("config: server, events and details are read", () => {
  const c = parseConfig(`{"topic":"${TOPIC}","desktop":true,"server":"https://ntfy.example.com:8443/","on":["blocked","nonsense"],"details":true}`);
  assert.deepEqual(c, { server: "https://ntfy.example.com:8443", topic: TOPIC, desktop: true, on: ["blocked"], details: true, notifier: "auto", debug: false });
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
  assert.deepEqual(pushPayload(cfg, agent("t1", "blocked"), "Mai", "secret answer"), { topic: TOPIC, title: "Herdr: te necesita", message: "Claude Code necesita tu atención", priority: 4 });
  assert.deepEqual(pushPayload(cfg, agent("t1", "done"), "Mai", "secret answer"), { topic: TOPIC, title: "Herdr: terminó", message: "Claude Code terminó", priority: 3 });
  assert.equal(JSON.stringify(pushPayload(cfg, agent("t1", "done"), "Mai", "secret answer")).includes("secret"), false);
  assert.equal(JSON.stringify(pushPayload(cfg, agent("t1", "done"), "Mai", "x")).includes("herdr-tabi"), false);
});

test("pushPayload: with details it is the same message as on the desktop", () => {
  const cfg = { topic: TOPIC, details: true };
  assert.deepEqual(pushPayload(cfg, agent("t1", "done"), "Mai", "Arreglé el CI"), { topic: TOPIC, title: "Mai terminó · herdr-tabi", message: "Arreglé el CI", priority: 3 });
  assert.equal(pushPayload(cfg, agent("t1", "blocked"), "Mai", "").priority, 4);
});

const card = { title: "Mai terminó · herdr-tabi", subtitle: "", body: "Listo, el PR quedó publicado.", image: "/h/data/tabi/portraits/mai.png" };

test("cardMessage: one bold line with who, what and where, and what the agent said below", () => {
  assert.deepEqual(cardMessage(agent("t1", "done"), "Mai", "Listo.", "/p/mai.png"), { title: "Mai terminó · herdr-tabi", subtitle: "", body: "Listo.", image: "/p/mai.png" });
  assert.deepEqual(cardMessage(agent("t1", "blocked"), "Kazuto", "Claude needs your permission", null), { title: "Kazuto te necesita · herdr-tabi", subtitle: "", body: "Claude needs your permission", image: null });
});

test("cardMessage: with nothing said there is no text, and a space without a name is called so", () => {
  assert.deepEqual(cardMessage(agent("t1", "done"), "Mai", ""), { title: "Mai terminó · herdr-tabi", subtitle: "", body: "", image: null });
  assert.equal(cardMessage(agent("t1", "done", { space_name: "" }), "Mai", "").title, "Mai terminó · sin space");
});

test("portraitOf: the thumbnail tabi-party published, as an absolute path", () => {
  const party = { t1d: { name: "Mai", thumb: "data/tabi/portraits/mai.png" }, t2: { name: "X", thumb: null } };
  assert.equal(portraitOf(party, "t1d", "/home/u/.config/herdr-app"), "/home/u/.config/herdr-app/data/tabi/portraits/mai.png");
  assert.equal(portraitOf(party, "t2", "/h"), null);
  assert.equal(portraitOf(party, "nope", "/h"), null);
  assert.equal(portraitOf(undefined, "t1d", "/h"), null);
});

test("desktopCommand macOS: terminal-notifier carries the portrait, osascript only text", () => {
  assert.deepEqual(desktopCommand("macos", card, { terminalNotifier: true }), {
    command: "terminal-notifier",
    args: ["-title", "Mai terminó · herdr-tabi", "-message", "Listo, el PR quedó publicado.", "-group", "tabi", "-contentImage", "/h/data/tabi/portraits/mai.png"],
  });
  const plain = desktopCommand("macos", { ...card, image: null, body: "" }, { terminalNotifier: true });
  assert.deepEqual(plain.args, ["-title", "Mai terminó · herdr-tabi", "-message", " ", "-group", "tabi"]);
  const osa = desktopCommand("macos", card);
  assert.equal(osa.command, "osascript");
  assert.ok(osa.args.includes("display notification (item 2 of argv) with title (item 1 of argv)"));
  assert.deepEqual(osa.args.slice(-2), ["Mai terminó · herdr-tabi", "Listo, el PR quedó publicado."]);
  assert.equal(osa.args.some((a) => a.includes("/portraits/")), false);
  const withSubtitle = desktopCommand("macos", { ...card, subtitle: "extra" });
  assert.ok(withSubtitle.args.includes("display notification (item 2 of argv) with title (item 1 of argv) subtitle (item 3 of argv)"));
  assert.deepEqual(withSubtitle.args.slice(-3), ["Mai terminó · herdr-tabi", "Listo, el PR quedó publicado.", "extra"]);
});

test("desktopCommand Windows: the portrait goes as -Image for the round toast", () => {
  const win = desktopCommand("windows", card, { script: "C:\\h\\tools\\desktop-notify.ps1" });
  assert.equal(win.command, "powershell");
  assert.deepEqual(win.args.slice(-6), ["-Title", "Mai terminó · herdr-tabi", "-Body", "Listo, el PR quedó publicado.", "-Image", "/h/data/tabi/portraits/mai.png"]);
  const bare = desktopCommand("windows", { ...card, image: null }, { script: "x" });
  assert.equal(bare.args.includes("-Image") || bare.args.includes("-Subtitle"), false);
});

test("desktopCommand Linux: notify-send with the portrait as the icon", () => {
  assert.deepEqual(desktopCommand("linux", card), { command: "notify-send", args: ["--app-name=Herdr", "-i", "/h/data/tabi/portraits/mai.png", "--", "Mai terminó · herdr-tabi", "Listo, el PR quedó publicado."] });
  assert.deepEqual(desktopCommand("linux", { title: "-T", subtitle: "", body: "s", image: null }).args, ["--app-name=Herdr", "--", "-T", "s"]);
});

test("desktopCommand: text only ever travels as arguments, never in a shell line", () => {
  const evil = { title: 'a"; rm -rf ~ #', subtitle: "$(reboot)", body: "`id`", image: null };
  for (const platform of ["macos", "windows", "linux"]) {
    const c = desktopCommand(platform, evil, { script: "s.ps1" });
    assert.equal(["osascript", "powershell", "notify-send"].includes(c.command), true);
    assert.equal(c.args.includes(evil.title), true);
  }
});

test("config: notifier can force osascript, anything else is auto", () => {
  assert.equal(parseConfig('{"desktop":true,"notifier":"osascript"}').notifier, "osascript");
  assert.equal(parseConfig('{"desktop":true,"notifier":"whatever"}').notifier, "auto");
});

test("config: debug is opt-in", () => {
  assert.equal(parseConfig('{"desktop":true,"debug":true}').debug, true);
  assert.equal(parseConfig('{"desktop":true,"debug":"yes"}').debug, false);
});

test("appendLog: stamped lines, one per entry, newest last, capped", () => {
  const t0 = Date.UTC(2026, 10, 20, 15, 7, 9);
  const one = appendLog("", "queued t1d -> done", t0);
  assert.equal(one, "15:07:09 queued t1d -> done\n");
  assert.equal(appendLog(one, "delivered", t0 + 1000), "15:07:09 queued t1d -> done\n15:07:10 delivered\n");
  assert.equal(appendLog("", "a\n  b\tc", t0), "15:07:09 a b c\n"); // one line per entry
  let text = "";
  for (let i = 0; i < 100; i++) text = appendLog(text, `line ${i}`, t0, 5);
  assert.deepEqual(text.trim().split("\n").map((l) => l.slice(9)), ["line 95", "line 96", "line 97", "line 98", "line 99"]);
  assert.equal(appendLog("", "x".repeat(900), t0).length, 9 + 300 + 1); // a long line is cut
});

test("pushPayload: the priority is an integer 1 to 5, as ntfy wants in JSON (a word is rejected with a 400)", () => {
  for (const details of [true, false]) {
    for (const status of ["blocked", "done"]) {
      const p = pushPayload({ topic: TOPIC, details }, agent("t1", status), "Mai", "x");
      assert.equal(Number.isInteger(p.priority) && p.priority >= 1 && p.priority <= 5, true, `${status} details=${details}`);
    }
  }
});

test("parseCurl: the body and the status of what curl printed", () => {
  assert.deepEqual(parseCurl('{"id":"abc","event":"message"}\n200'), { code: 200, body: '{"id":"abc","event":"message"}' });
  assert.deepEqual(parseCurl('{"code":40001,"error":"invalid priority"}\n400\n'), { code: 400, body: '{"code":40001,"error":"invalid priority"}' });
  assert.deepEqual(parseCurl("\n000"), { code: 0, body: "" });
  assert.deepEqual(parseCurl(undefined), { code: 0, body: "" });
  assert.equal(parseCurl("x".repeat(500) + "\n200").body.length, 200); // an answer is cut for the log
});
