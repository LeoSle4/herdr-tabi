import test from "node:test";
import assert from "node:assert/strict";
import { agentChoices, tabName, taskId, newTaskRecord, handoffPrompt, handoffLaunch, reviewPrompt, slashCommand, canSwitch, switchSession, familyOf, prefKey, parseCodexModels, optionsFor, parsePrefs, setChoice, launchArgv, summary, CLAUDE_MODELS, CLAUDE_EFFORTS } from "./lib.js";

const cache = JSON.stringify({
  models: [
    { slug: "gpt-6.1-sol", display_name: "GPT-6.1-Sol", visibility: "list", default_reasoning_level: "low",
      supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }, { effort: "high" }, { effort: "xhigh" }, { effort: "max" }, { effort: "ultra" }] },
    { slug: "gpt-6-luna", display_name: "GPT-6-Luna", visibility: "list", default_reasoning_level: "medium",
      supported_reasoning_levels: [{ effort: "low" }, { effort: "medium" }, { effort: "high" }] },
    { slug: "gpt-reserve", display_name: "GPT-Reserve", visibility: "hide", supported_reasoning_levels: [{ effort: "low" }] },
    { slug: "broken", visibility: "list" },
  ],
});

test("familyOf: Claude Code and its accounts are claude, Codex is codex, anything else has no options", () => {
  assert.equal(familyOf("claude"), "claude");
  assert.equal(familyOf("claude-code"), "claude");
  assert.equal(familyOf("account-claude2"), "claude");
  assert.equal(familyOf("codex"), "codex");
  assert.equal(familyOf("gemini"), null);
  assert.equal(familyOf(undefined), null);
});

test("prefKey: one key per agent, whatever Herdr calls it, so the panel and the dialog share the choice", () => {
  assert.equal(prefKey("claude"), "claude");
  assert.equal(prefKey("claude-code"), "claude");
  assert.equal(prefKey("account-claude2"), "account-claude2");
  assert.equal(prefKey("codex"), "codex");
  assert.equal(prefKey("gemini"), "gemini");
  assert.equal(prefKey(undefined), "");
});

test("parseCodexModels: the models Codex lists, with the levels each one supports", () => {
  const ms = parseCodexModels(cache);
  assert.deepEqual(ms.map((m) => m.id), ["gpt-6.1-sol", "gpt-6-luna"]); // the hidden one and the broken one are left out
  assert.deepEqual(ms[1], { id: "gpt-6-luna", name: "GPT-6-Luna", efforts: ["low", "medium", "high"], defaultEffort: "medium" });
});

test("parseCodexModels: not JSON, or no models, gives an empty list", () => {
  assert.deepEqual(parseCodexModels("nope"), []);
  assert.deepEqual(parseCodexModels("{}"), []);
  assert.deepEqual(parseCodexModels(undefined), []);
});

test("optionsFor: Claude has fixed models and levels; Codex takes them from its cache, level by model", () => {
  const c = optionsFor("claude", []);
  assert.deepEqual(c.models.map((m) => m.id), CLAUDE_MODELS.map((m) => m.id));
  assert.deepEqual(c.effortsOf(null), CLAUDE_EFFORTS);
  assert.deepEqual(c.effortsOf("opus"), CLAUDE_EFFORTS);
  const x = optionsFor("codex", parseCodexModels(cache));
  assert.deepEqual(x.models.map((m) => m.id), ["gpt-6.1-sol", "gpt-6-luna"]);
  assert.deepEqual(x.effortsOf("gpt-6-luna"), ["low", "medium", "high"]);
  assert.equal(x.effortsOf("gpt-6.1-sol").length, 6);
  assert.deepEqual(x.effortsOf(null), ["low", "medium", "high"]); // no model chosen: only what every model supports
  assert.equal(optionsFor("gemini", []), null);
});

test("parsePrefs: what was saved per agent, and nothing that could be a flag or a shell", () => {
  assert.deepEqual(parsePrefs('{"claude":{"model":"opus","effort":"high"},"codex":{"model":"gpt-6.1-sol"}}'),
    { claude: { model: "opus", effort: "high" }, codex: { model: "gpt-6.1-sol" } });
  assert.deepEqual(parsePrefs('{"claude":{"model":"opus; rm -rf ~","effort":"high"}}'), { claude: { effort: "high" } });
  assert.deepEqual(parsePrefs('{"claude":{"model":"--dangerous"}}'), {});
  assert.deepEqual(parsePrefs('{"claude":{"effort":"HIGH!"}}'), {});
  assert.deepEqual(parsePrefs('{"claude":{}}'), {});
  assert.deepEqual(parsePrefs("not json"), {});
  assert.deepEqual(parsePrefs("[]"), {});
  assert.deepEqual(parsePrefs(undefined), {});
});

test("setChoice: sets or clears the choice of one agent without touching the others", () => {
  const prefs = { codex: { model: "gpt-6-luna" } };
  assert.deepEqual(setChoice(prefs, "claude", { model: "opus", effort: "high" }), { codex: { model: "gpt-6-luna" }, claude: { model: "opus", effort: "high" } });
  assert.deepEqual(setChoice(prefs, "codex", { model: null, effort: null }), {}); // back to the defaults: nothing is kept
  assert.deepEqual(setChoice(prefs, "codex", { model: "gpt-6-luna", effort: null }), { codex: { model: "gpt-6-luna" } });
  assert.deepEqual(prefs, { codex: { model: "gpt-6-luna" } }); // the original is not changed
});

test("launchArgv: Claude takes --model and --effort after its command, an account's too", () => {
  assert.deepEqual(launchArgv("claude", ["claude"], { claude: { model: "opus", effort: "high" } }), ["claude", "--model", "opus", "--effort", "high"]);
  assert.deepEqual(launchArgv("account-claude2", ["/h/.local/bin/claude2"], { "account-claude2": { model: "sonnet" } }), ["/h/.local/bin/claude2", "--model", "sonnet"]);
  assert.deepEqual(launchArgv("claude", ["claude"], { claude: { effort: "max" } }), ["claude", "--effort", "max"]);
});

test("launchArgv: Codex takes -m and -c model_reasoning_effort, the key of its config.toml", () => {
  assert.deepEqual(launchArgv("codex", ["codex"], { codex: { model: "gpt-6.1-sol", effort: "high" } }), ["codex", "-m", "gpt-6.1-sol", "-c", "model_reasoning_effort=high"]);
  assert.deepEqual(launchArgv("codex", ["codex"], { codex: { effort: "low" } }), ["codex", "-c", "model_reasoning_effort=low"]);
});

test("launchArgv: with nothing chosen, or for an agent with no options, the command is as it was", () => {
  assert.deepEqual(launchArgv("claude", ["claude"], {}), ["claude"]);
  assert.deepEqual(launchArgv("claude", ["claude"], undefined), ["claude"]);
  assert.deepEqual(launchArgv("gemini", ["gemini"], { gemini: { model: "x" } }), ["gemini"]);
  const base = ["claude"];
  launchArgv("claude", base, { claude: { model: "opus" } });
  assert.deepEqual(base, ["claude"]); // the original is not changed
});

test("summary: what is chosen in a few words, or that it is the default", () => {
  assert.equal(summary({ model: "opus", effort: "high" }), "opus · high");
  assert.equal(summary({ model: "opus" }), "opus");
  assert.equal(summary({ effort: "high" }), "esfuerzo high");
  assert.equal(summary({}), "por defecto");
  assert.equal(summary(undefined), "por defecto");
});

// tabi-panel and tabi-task carry copies of these (mods do not import each other): they must behave the same.
import * as panel from "../tabi-panel/lib.js";
import * as task from "../tabi-task/lib.js";

test("the copies in tabi-panel and tabi-task behave like the original", () => {
  const texts = ['{"claude":{"model":"opus","effort":"high"},"codex":{"model":"gpt-6.1-sol","effort":"low"}}', '{"claude":{"model":"x; y"}}', "nope", "[]", undefined];
  const keys = ["claude", "claude-code", "account-claude2", "codex", "gemini", undefined];
  const choices = [{ model: "opus", effort: "high" }, { model: "opus" }, { effort: "max" }, {}, undefined];
  for (const copy of [panel, task]) {
    for (const t of texts) assert.deepEqual(copy.parsePrefs(t), parsePrefs(t));
    for (const k of keys) { assert.equal(copy.familyOf(k), familyOf(k)); assert.equal(copy.prefKey(k), prefKey(k)); }
    for (const c of choices) {
      assert.equal(copy.summary(c), summary(c));
      for (const k of keys) assert.deepEqual(copy.launchArgv(k, ["run"], { [k]: c }), launchArgv(k, ["run"], { [k]: c }));
    }
  }
});

test("slashCommand: the command that changes the model or the effort inside Claude Code, only for values that are safe", () => {
  assert.equal(slashCommand("model", "sonnet"), "/model sonnet");
  assert.equal(slashCommand("model", "claude-opus-4-5"), "/model claude-opus-4-5");
  assert.equal(slashCommand("effort", "high"), "/effort high");
  assert.equal(slashCommand("effort", "turbo"), null); // not a level Claude has
  assert.equal(slashCommand("model", "x; rm -rf ~"), null);
  assert.equal(slashCommand("model", "--bad"), null);
  assert.equal(slashCommand("model", ""), null);
  assert.equal(slashCommand("model", null), null);
  assert.equal(slashCommand("nope", "x"), null);
});

test("canSwitch: only Claude Code on this macOS computer, and not while it is working", () => {
  assert.deepEqual(canSwitch({ key: "claude", platform: "macos", address: "t1k", status: "idle" }), { ok: true });
  assert.equal(canSwitch({ key: "account-claude2", platform: "macos", address: "t1k", status: "done" }).ok, true);
  assert.match(canSwitch({ key: "codex", platform: "macos", address: "t1k", status: "idle" }).reason, /Claude/);
  assert.match(canSwitch({ key: "claude", platform: "windows", address: "t1k", status: "idle" }).reason, /macOS/);
  assert.match(canSwitch({ key: "claude", platform: "macos", address: "msi-casa/t5", status: "idle" }).reason, /equipo/);
  assert.match(canSwitch({ key: "claude", platform: "macos", address: "t1k", status: "working" }).reason, /trabajando/);
  assert.match(canSwitch({ key: "claude", platform: "macos", address: "t1k", status: "blocked" }).reason, /espera/);
});

function fakes({ clip = "my clipboard", failPaste = false, failRead = false } = {}) {
  const log = [];
  let clipboard = clip;
  return {
    log,
    clipboard: () => clipboard,
    deps: {
      exec: async (command, args) => {
        if (command === "pbpaste") { log.push("read"); if (failRead) throw new Error("no clipboard"); return { code: 0, stdout: clipboard, stderr: "" }; }
        if (command === "sh") { clipboard = args[3]; log.push(`write:${args[3]}`); return { code: 0, stdout: "", stderr: "" }; }
        throw new Error(`unexpected ${command}`);
      },
      run: (command, a) => { if (command === "terminal.paste" && failPaste) throw new Error("paste failed"); log.push(command === "pane.focus" ? `focus:${a.pane}` : command); },
      wait: async () => { log.push("wait"); },
    },
  };
}

test("switchSession: puts the command in the clipboard, focuses the agent, pastes it, and gives the clipboard back", async () => {
  const f = fakes();
  const r = await switchSession(f.deps, { pane: "p9", text: "/model sonnet", platform: "macos" });
  assert.equal(r.ok, true);
  assert.deepEqual(f.log.filter((x) => x !== "wait"), ["read", "write:/model sonnet", "focus:p9", "terminal.paste", "write:my clipboard"]);
  assert.equal(f.clipboard(), "my clipboard");
});

test("switchSession: the clipboard comes back even when the paste fails, and the failure is reported", async () => {
  const f = fakes({ failPaste: true });
  const r = await switchSession(f.deps, { pane: "p9", text: "/model sonnet", platform: "macos" });
  assert.equal(r.ok, false);
  assert.match(r.error, /paste failed/);
  assert.equal(f.clipboard(), "my clipboard");
});

test("switchSession: when the clipboard cannot be read nothing is overwritten and nothing is pasted", async () => {
  const f = fakes({ failRead: true });
  const r = await switchSession(f.deps, { pane: "p9", text: "/model sonnet", platform: "macos" });
  assert.equal(r.ok, false);
  assert.equal(f.clipboard(), "my clipboard");
  assert.equal(f.log.includes("terminal.paste"), false);
});

test("switchSession: refuses a platform it has no clipboard tools for, and a text that is not a slash command", async () => {
  const f = fakes();
  assert.equal((await switchSession(f.deps, { pane: "p9", text: "/model sonnet", platform: "windows" })).ok, false);
  assert.equal((await switchSession(f.deps, { pane: "p9", text: "rm -rf ~", platform: "macos" })).ok, false);
  assert.equal((await switchSession(f.deps, { pane: "p9", text: "/model sonnet\n/effort high", platform: "macos" })).ok, false);
  assert.deepEqual(f.log, []);
});

const rec = (extra = {}) => ({ id: "a", task: "arregla el login", agent: "Claude Code", agentKey: "claude", character: "Koyun", tab: "Koyun", branch: null, folder: "/p/repo", machine: null, startedAt: 1000, status: "done", finishedAt: 2000, result: "Dejé el formulario a medias.", verify: "node --test", check: null, ...extra });
const codex = { key: "codex", name: "Codex", argv: ["codex"] };

test("handoffPrompt: the task, what the last agent said, and what to do first, in one line", () => {
  const p = handoffPrompt({ task: "arregla el login", result: "Dejé el formulario a medias.", from: "Koyun" });
  assert.match(p, /^Continúa esta tarea/);
  assert.match(p, /Koyun/);
  assert.match(p, /arregla el login/);
  assert.match(p, /Dejé el formulario a medias\./);
  assert.match(p, /git status/);
  assert.equal(p.includes("\n"), false);
});

test("handoffPrompt: without a result it does not mention one, a long one is cut, and newlines are squeezed", () => {
  assert.doesNotMatch(handoffPrompt({ task: "x", result: null, from: "Koyun" }), /Lo último que dijo/);
  assert.ok(handoffPrompt({ task: "x", result: "r".repeat(2000), from: "Koyun" }).length < 900);
  const multi = handoffPrompt({ task: "uno\ndos\n\ntres", result: "a\nb", from: "K" });
  assert.equal(multi.includes("\n"), false);
  assert.match(multi, /uno dos tres/);
  assert.match(handoffPrompt({ task: "x", result: null, from: undefined }), /otro agente/);
});

test("handoffLaunch: a tab in the same space and folder with the new agent, its flags and the message; and the record that goes with it", () => {
  const prefs = { codex: { model: "gpt-6-luna", effort: "high" } };
  const r = handoffLaunch({ rec: rec(), from: "Koyun", agent: codex, space: "spA", folder: "/p/repo", prefs, now: 9000, rnd: "ab12" });
  assert.equal(r.command, "tab.new");
  assert.deepEqual(r.args.argv, ["codex", "-m", "gpt-6-luna", "-c", "model_reasoning_effort=high"]);
  assert.deepEqual([r.args.name, r.args.space, r.args.folder], ["Codex", "spA", "/p/repo"]);
  assert.equal(r.args.task, handoffPrompt({ task: "arregla el login", result: "Dejé el formulario a medias.", from: "Koyun" }));
  assert.equal(r.record.task, "→ arregla el login");
  assert.deepEqual([r.record.tab, r.record.agent, r.record.verify, r.record.folder, r.record.branch, r.record.machine, r.record.startedAt], ["Codex", "Codex", "node --test", "/p/repo", null, null, 9000]);
  assert.equal(r.record.status, "running");
  assert.equal(r.record.id, taskId(9000, "ab12"));
});

test("handoffLaunch: a worktree task goes on in the same branch, and there is nothing to launch without a task or an agent", () => {
  const r = handoffLaunch({ rec: rec({ branch: "tabi/koyun-arregla" }), from: "Koyun", agent: codex, space: "spW", folder: "/w/repo/koyun", prefs: {}, now: 1, rnd: "0000" });
  assert.equal(r.record.branch, "tabi/koyun-arregla");
  assert.deepEqual(r.args.argv, ["codex"]);
  assert.equal(handoffLaunch({ rec: null, from: "K", agent: codex, space: "s", folder: "/f", prefs: {}, now: 1 }), null);
  assert.equal(handoffLaunch({ rec: rec(), from: "K", agent: null, space: "s", folder: "/f", prefs: {}, now: 1 }), null);
});

test("the copies of tabi-task (agentChoices, tabName, taskId, newTaskRecord) behave like the original", () => {
  const known = [{ key: "claude", name: "Claude Code", run: ["claude"], installed: true }, { key: "codex", name: "Codex", run: ["codex"], installed: true }, { key: "gemini", name: "G", run: ["g"], installed: false }];
  const accounts = [{ name: "claude2", bin: "/b/claude2", default: false }, { name: "claude", default: true }];
  assert.deepEqual(agentChoices(known, accounts), task.agentChoices(known, accounts));
  assert.deepEqual(agentChoices(undefined, undefined), task.agentChoices(undefined, undefined));
  assert.equal(tabName({ name: "Koyun" }, codex), task.tabName({ name: "Koyun" }, codex));
  assert.equal(taskId(123456789, "AB-12"), task.taskId(123456789, "AB-12"));
  const a = { task: " x ", agent: codex, character: null, branch: "b", folder: "/f", machine: null, now: 5, rnd: "0001", verify: " node --test " };
  assert.deepEqual(newTaskRecord(a), task.newTaskRecord(a));
  assert.equal(newTaskRecord({ ...a, task: "  " }), task.newTaskRecord({ ...a, task: "  " }));
});

test("reviewPrompt: ask another agent to read the work, not to change it, in one line, with what the check said", () => {
  const p = reviewPrompt({ task: "arregla el login", result: "Listo, arreglé el formulario.", from: "Koyun", verify: "node --test", check: { state: "fail", tail: "2 failed" } });
  assert.match(p, /^Revisa el trabajo/);
  assert.match(p, /sin modificar/);
  assert.match(p, /Koyun/);
  assert.match(p, /arregla el login/);
  assert.match(p, /Listo, arreglé el formulario\./);
  assert.match(p, /node --test/);
  assert.match(p, /2 failed/);
  assert.match(p, /git diff/);
  assert.equal(p.includes("\n"), false);
});

test("reviewPrompt: without a result or a check it mentions neither; a long result is cut; newlines are squeezed", () => {
  const p = reviewPrompt({ task: "x", result: null, from: undefined, verify: null, check: null });
  assert.doesNotMatch(p, /Lo que dijo/);
  assert.doesNotMatch(p, /comprobación/);
  assert.match(p, /otro agente/);
  assert.match(reviewPrompt({ task: "x", result: null, from: "K", verify: "npm test", check: { state: "pass", tail: "ok" } }), /npm test.*pasó/);
  assert.ok(reviewPrompt({ task: "x", result: "r".repeat(2000), from: "K" }).length < 1100);
  assert.equal(reviewPrompt({ task: "a\nb", result: "c\nd", from: "K" }).includes("\n"), false);
});

test("handoffLaunch with kind review: the reviewer is told to read, and its record is marked as a review and has no check of its own", () => {
  const r = handoffLaunch({ kind: "review", rec: rec({ check: { state: "pass", tail: "12 passed" } }), from: "Koyun", agent: codex, space: "spA", folder: "/p/repo", prefs: {}, now: 9000, rnd: "ab12" });
  assert.equal(r.command, "tab.new");
  assert.match(r.args.task, /^Revisa el trabajo/);
  assert.equal(r.record.task, "審 arregla el login");
  assert.equal(r.record.verify, null);
  // the default is still the one before: go on with the task
  const d = handoffLaunch({ rec: rec(), from: "Koyun", agent: codex, space: "spA", folder: "/p/repo", prefs: {}, now: 9000, rnd: "ab12" });
  assert.match(d.args.task, /^Continúa esta tarea/);
  assert.equal(d.record.task, "→ arregla el login");
  assert.equal(d.record.verify, "node --test");
});
