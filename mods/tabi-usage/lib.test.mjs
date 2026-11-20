import test from "node:test";
import assert from "node:assert/strict";
import { mayRead, minutesUntilNext, canReread, pickCredential, keychainOutcome, tokenExpired, parseClaudeUsage, afterReading, windowView,
  untilReset, MIN_INTERVAL_MS, RATE_LIMIT_BACKOFF_MS } from "./lib.js";

test("never reads more often than every 5 minutes, and a failure counts as a reading", () => {
  assert.equal(mayRead(1000, undefined), true);
  assert.equal(mayRead(1000 + MIN_INTERVAL_MS - 1, 1000), false);
  assert.equal(mayRead(1000 + MIN_INTERVAL_MS, 1000), true);
  assert.equal(minutesUntilNext(1000 + 60000, 1000), 4);
  const failed = afterReading({ windows: [{ label: "5h", used: 10, resets: 5 }], okAt: 1 }, 5000, { ok: false, error: "HTTP 500" });
  assert.equal(mayRead(5000 + 1000, failed.checkedAt), false);
});

test("only the access token and its expiry are taken from the credential entry", () => {
  const entry = JSON.stringify({ claudeAiOauth: { accessToken: "tok", refreshToken: "REFRESH", expiresAt: 99, scopes: ["a"] }, mcpOAuth: { x: 1 } });
  const cred = pickCredential(entry);
  assert.deepEqual(cred, { token: "tok", expiresAt: 99 });
  assert.equal(JSON.stringify(cred).includes("REFRESH"), false);
  assert.throws(() => pickCredential(JSON.stringify({ claudeAiOauth: {} })));
  assert.throws(() => pickCredential("not json"));
});

test("keychain exit codes: 0 ok, 44 no login, anything else (cancelled, locked) is no access", () => {
  assert.equal(keychainOutcome(0), "ok");
  assert.equal(keychainOutcome(44), "nologin");
  assert.equal(keychainOutcome(128), "denied");
  assert.equal(keychainOutcome(51), "denied");
});

test("an expired login is re-read when renewed, or at most once per interval", () => {
  const old = { state: "ok", token: "t", expiresAt: 100 };
  const last = { expiresAt: "100", at: 1000 };
  assert.equal(canReread(old, undefined, 1000), true);
  assert.equal(canReread(old, last, 1000 + MIN_INTERVAL_MS - 1), false); // same login, too soon
  assert.equal(canReread(old, last, 1000 + MIN_INTERVAL_MS), true); // same login, interval passed: look again
  assert.equal(canReread({ ...old, expiresAt: 200 }, last, 1001), true); // Claude Code renewed it
  assert.equal(canReread({ ...old, expiresAt: null }, undefined, 1000), true);
  assert.equal(canReread({ ...old, expiresAt: null }, { expiresAt: "null", at: 1000 }, 1001), false);
  assert.equal(canReread({ state: "denied" }, undefined, 1000), false); // a refusal is never asked again
  assert.equal(canReread({ state: "nologin" }, undefined, 1000), false);
});

test("expiry", () => {
  assert.equal(tokenExpired({ expiresAt: 100 }, 100), true);
  assert.equal(tokenExpired({ expiresAt: 100 }, 99), false);
  assert.equal(tokenExpired({ expiresAt: null }, 1e15), false);
});

test("parses the two windows and skips missing ones", () => {
  const w = parseClaudeUsage({ five_hour: { utilization: 22.6, resets_at: "2026-11-19T20:00:00Z" }, seven_day: null });
  assert.deepEqual(w, [{ label: "5h", used: 23, resets: Date.parse("2026-11-19T20:00:00Z") }]);
  assert.deepEqual(parseClaudeUsage({}), []);
});

test("a failed reading keeps the last good windows and marks them stale", () => {
  const good = afterReading(null, 1000, { ok: true, windows: [{ label: "5h", used: 40, resets: 9e12 }], email: "a@b.c" });
  assert.equal(good.error, null);
  const bad = afterReading(good, 2000, { ok: false, error: "HTTP 500" });
  assert.deepEqual(bad.windows, good.windows);
  assert.equal(bad.error, "HTTP 500");
  assert.equal(bad.okAt, 1000);
  assert.equal(bad.email, "a@b.c");
});

test("a rate limit pushes the next reading out further", () => {
  const e = afterReading(null, 1000, { ok: false, error: "429", extraWaitMs: RATE_LIMIT_BACKOFF_MS - MIN_INTERVAL_MS });
  assert.equal(mayRead(1000 + MIN_INTERVAL_MS, e.checkedAt), false);
  assert.equal(mayRead(1000 + RATE_LIMIT_BACKOFF_MS, e.checkedAt), true);
});

test("a stale window that already reset shows no number", () => {
  const entry = { error: "HTTP 500" };
  assert.deepEqual(windowView({ label: "5h", used: 90, resets: 100 }, entry, 200), { label: "5h", used: null, resets: null });
  assert.equal(windowView({ label: "5h", used: 90, resets: 300 }, entry, 200).used, 90);
  assert.equal(windowView({ label: "5h", used: 90, resets: 100 }, { error: null }, 200).used, 90);
});

test("time until reset", () => {
  assert.equal(untilReset(null, 0), "");
  assert.equal(untilReset(45 * 60000, 0), "45 min");
  assert.equal(untilReset(130 * 60000, 0), "2 h 10 min");
  assert.equal(untilReset(26 * 3600000, 0), "1 d 2 h");
});

import { usageLevel } from "./lib.js";
test("usage thresholds: neutral, amber from 50, soft red from 85", () => {
  assert.equal(usageLevel(0), "ok");
  assert.equal(usageLevel(49), "ok");
  assert.equal(usageLevel(50), "warn");
  assert.equal(usageLevel(84), "warn");
  assert.equal(usageLevel(85), "high");
  assert.equal(usageLevel(100), "high");
});

import { compactReset, ageLabel } from "./lib.js";
test("compact reset: 4h17, 17m, 2d5h", () => {
  assert.equal(compactReset(null, 0), "");
  assert.equal(compactReset(17 * 60000, 0), "17m");
  assert.equal(compactReset((4 * 60 + 17) * 60000, 0), "4h17");
  assert.equal(compactReset((4 * 60 + 5) * 60000, 0), "4h05");
  assert.equal(compactReset((2 * 1440 + 5 * 60) * 60000, 0), "2d5h");
});

test("age label: act. hace N min", () => {
  assert.equal(ageLabel(null, 0), null);
  assert.equal(ageLabel(1000, 1000 + 20000), "ahora");
  assert.equal(ageLabel(0, 3 * 60000 + 5000), "hace 3 min");
  assert.equal(ageLabel(0, 125 * 60000), "hace 2 h");
});

import { clock, dayAbbr, renewShort, inTime, renewTooltip, ringFile } from "./lib.js";
test("clock and weekday are local", () => {
  const d = new Date(2026, 10, 16, 14, 40); // Monday
  assert.equal(clock(d.getTime()), "14:40");
  assert.equal(dayAbbr(d.getTime()), "lun");
  assert.equal(clock(new Date(2026, 10, 16, 9, 5).getTime()), "09:05");
});
test("renewal text: 5 h shows the time, weekly the day", () => {
  const d = new Date(2026, 10, 16, 14, 40).getTime();
  assert.equal(renewShort("5h", d), "renueva 14:40");
  assert.equal(renewShort("weekly", d), "lun");
  assert.equal(renewShort("5h", null), "");
});
test("time left pads the minutes", () => {
  assert.equal(inTime((4 * 60 + 5) * 60000, 0), "4 h 05 min");
  assert.equal(inTime(17 * 60000, 0), "17 min");
  assert.equal(inTime((2 * 1440 + 5 * 60) * 60000, 0), "2 d 5 h");
});
test("tooltip: time left and local time, with the weekday from a day away", () => {
  const now = new Date(2026, 10, 16, 10, 35).getTime();
  assert.equal(renewTooltip(new Date(2026, 10, 16, 14, 40).getTime(), now), "se renueva en 4 h 05 min (14:40)");
  assert.equal(renewTooltip(new Date(2026, 10, 21, 18, 0).getTime(), now), "se renueva en 5 d 7 h (sáb 18:00)");
  assert.equal(renewTooltip(null, now), "");
});
test("ring file: percentage rounded and clamped", () => {
  assert.equal(ringFile(46), "mods/tabi-usage/rings/ring-46.svg");
  assert.equal(ringFile(130), "mods/tabi-usage/rings/ring-100.svg");
  assert.equal(ringFile(null), "mods/tabi-usage/rings/ring-6.svg");
  assert.equal(ringFile(0), "mods/tabi-usage/rings/ring-6.svg"); // a minimum arc is always visible
  assert.equal(ringFile(2), "mods/tabi-usage/rings/ring-6.svg");
});

import { parseWrapper, buildAccounts, keychainService, displayName, shortTag } from "./lib.js";
test("wrapper: CLAUDE_CONFIG_DIR with $HOME, ~, quotes or none", () => {
  const home = "/Users/x";
  assert.deepEqual(parseWrapper("claude2", 'export CLAUDE_CONFIG_DIR="$HOME/.claude-cuenta2"', home), { name: "claude2", dir: "/Users/x/.claude-cuenta2" });
  assert.deepEqual(parseWrapper("c3", "CLAUDE_CONFIG_DIR=~/.c3 exec claude", home), { name: "c3", dir: "/Users/x/.c3" });
  assert.deepEqual(parseWrapper("c4", "export CLAUDE_CONFIG_DIR='${HOME}/.c4/'", home), { name: "c4", dir: "/Users/x/.c4" });
  assert.equal(parseWrapper("c5", "exec claude", home), null);
  assert.equal(parseWrapper("c6", 'export CLAUDE_CONFIG_DIR=""', home), null);
});
test("accounts: the default first, wrappers by name", () => {
  const out = 'claude3\texport CLAUDE_CONFIG_DIR="$HOME/.c3"\nclaude2\texport CLAUDE_CONFIG_DIR="$HOME/.c2"\nclaude-old\texec claude\n';
  assert.deepEqual(buildAccounts(out, "/h").map((a) => [a.name, a.dir, a.default]),
    [["claude", "/h/.claude", true], ["claude2", "/h/.c2", false], ["claude3", "/h/.c3", false]]);
  assert.deepEqual(buildAccounts("", "/h").map((a) => a.name), ["claude"]);
});
import { parseWindowsWrapper, windowsWrapperName, buildWindowsAccounts } from "./lib.js";
test("windows wrapper: set in cmd/bat and $env in ps1, with %USERPROFILE%, $HOME, quotes", () => {
  const home = "C:\\Users\\x";
  assert.deepEqual(parseWindowsWrapper("claude2", 'set "CLAUDE_CONFIG_DIR=%USERPROFILE%\\.c2"', home), { name: "claude2", dir: "C:\\Users\\x\\.c2" });
  assert.deepEqual(parseWindowsWrapper("c3", "@set CLAUDE_CONFIG_DIR=D:\\cfg\\c3\\ ", home), { name: "c3", dir: "D:\\cfg\\c3" });
  assert.deepEqual(parseWindowsWrapper("c4", '$env:CLAUDE_CONFIG_DIR = "$HOME\\.c4"', home), { name: "c4", dir: "C:\\Users\\x\\.c4" });
  assert.deepEqual(parseWindowsWrapper("c5", "$env:CLAUDE_CONFIG_DIR='~/.c5'", home), { name: "c5", dir: "C:\\Users\\x/.c5" });
  assert.equal(parseWindowsWrapper("c6", "claude %*", home), null);
  assert.equal(parseWindowsWrapper("c7", 'set "CLAUDE_CONFIG_DIR=%OTHER%\\.c7"', home), null); // a variable not resolved here
  assert.equal(parseWindowsWrapper("c8", 'export CLAUDE_CONFIG_DIR="$HOME/.c8"', home), null); // a POSIX line is not a Windows wrapper
});
test("windows wrapper files: only .cmd, .bat and .ps1 starting with claude; never claude.exe or plain claude", () => {
  assert.deepEqual(["claude2.cmd", "claude-work.PS1", "claude3.bat"].map(windowsWrapperName), ["claude2", "claude-work", "claude3"]);
  for (const f of ["claude.exe", "claude", "claude.cmd", "claude.ps1", "claude2.exe", "claude2", "other.cmd", "claude2.cmd.bak"]) assert.equal(windowsWrapperName(f), null, f);
});
test("windows accounts: the default first, wrappers by name, one account per name, binaries ignored", () => {
  const files = [
    { file: "claude2.ps1", text: '$env:CLAUDE_CONFIG_DIR = "$HOME\\.c2-ps1"\nclaude @args' },
    { file: "claude2.cmd", text: '@echo off\r\nset "CLAUDE_CONFIG_DIR=%USERPROFILE%\\.c2"\r\nclaude %*' },
    { file: "claude1.bat", text: "@echo off\r\nclaude %*" }, // sets no config dir: not an account
    { file: "claude.exe", text: 'set "CLAUDE_CONFIG_DIR=C:\\x"' }, // a binary: never
    { file: "claude9.cmd", text: 'set "CLAUDE_CONFIG_DIR=C:\\nine"' },
  ];
  assert.deepEqual(buildWindowsAccounts(files, "C:\\Users\\x").map((a) => [a.name, a.dir, a.default, a.file]), [
    ["claude", "C:\\Users\\x/.claude", true, undefined],
    ["claude2", "C:\\Users\\x\\.c2", false, "claude2.cmd"],
    ["claude9", "C:\\nine", false, "claude9.cmd"],
  ]);
  assert.deepEqual(buildWindowsAccounts([], "C:\\Users\\x").map((a) => a.name), ["claude"]);
});
test("keychain service: plain for the default, suffixed with the dir hash for the others", () => {
  assert.equal(keychainService({ default: true }, "de4e3d40"), "Claude Code-credentials");
  assert.equal(keychainService({ default: false }, "de4e3d40"), "Claude Code-credentials-de4e3d40");
});
test("names and tags", () => {
  assert.deepEqual(["claude", "claude2", "codex"].map(displayName), ["Claude", "Claude2", "Codex"]);
  assert.deepEqual(["claude", "claude2", "codex"].map(shortTag), ["c1", "c2", "co"]);
});
