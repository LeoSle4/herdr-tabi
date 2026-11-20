// tabi-status: the bottom bar. Arrow-shaped segments (SVG triangles; the engine has no clip-path), each with a
// subtle fill, a 0.5 px border and an icon: este equipo › rama › agentes N. On the right: the background tag
// ("fondo 4/10", click for another picture for this space) and the command palette key.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import * as fs from "fs/promises";
import { agents, spaces, focused, theme, shared, machines, run, exec, appHome, home, window as herdrWindow } from "herdr";
import { parseConfig, appendLog, parseCurl, snapshot, changes, parseSaid, saidFor, nameOf, cardMessage, portraitOf, pushPayload, desktopCommand, WAIT_TRIES } from "./notify.js";

const H = 28;
const TIP = 10;

export default class TabiStatus extends View {
  init(_props, cx) {
    cx.timer.every(30000, (cx) => cx.notify()); // the minutes until the next background change
    this.pending = []; // changes waiting for the text the agent said (see flush)
    cx.timer.every(5000, () => this.push()); // notifications outside Herdr; off until data/tabi/notify.json exists
    cx.timer.every(1000, () => this.flush());
  }

  /**
   * Notices an agent that turns blocked or done and queues it for flush(). Opt-in through <app home>/data/tabi/notify.json
   * (see the README): a system notification when Herdr is not the active window, and/or a push to the phone through ntfy.
   * Enable the phone on one machine only, because every Herdr app sees every machine's agents. Failures stay silent.
   */
  async push() {
    if (this.pushing) return;
    this.pushing = true;
    try {
      if (!this.pushConfigAt || Date.now() - this.pushConfigAt > 60000) {
        this.pushConfigAt = Date.now();
        try { this.pushConfig = parseConfig(await fs.readFile(`${appHome()}/data/tabi/notify.json`, "utf8")); } catch { this.pushConfig = null; }
      }
      const list = agents();
      const cfg = this.pushConfig;
      // The previous reading is kept even while the feature is off, so turning it on never floods old statuses.
      const events = cfg ? changes(this.pushSeen ?? null, list, cfg.on) : [];
      this.pushSeen = snapshot(list);
      for (const agent of events) {
        this.pending.push({ agent, at: Date.now(), tries: 0 });
        this.log(`queued ${agent.address} -> ${agent.status}`);
      }
    } catch {
      // A failed reading is retried on the next tick.
    } finally {
      this.pushing = false;
    }
  }

  /** Writes one line to data/tabi/notify.log when "debug" is on in notify.json (the last 80 lines); never throws. */
  log(line) {
    if (!this.pushConfig?.debug) return;
    this.logText = appendLog(this.logText, line, Date.now());
    const text = this.logText;
    fs.writeFile(`${appHome()}/data/tabi/notify.log`, text).catch(() => {});
  }

  /** What the agent said about this change (the Claude Code hook writes it on this machine), or "" (other machines, Codex). */
  async saidAbout(item) {
    if (item.agent.address.includes("/")) return "";
    const dir = `${home()}/.local/state/tabi/subagents/${item.agent.address}`;
    const read = async (file) => { try { return parseSaid(await fs.readFile(`${dir}/${file}`, "utf8")); } catch { return null; } };
    const [stop, notification] = await Promise.all([read("_stop.json"), read("_notification.json")]);
    return saidFor(item.agent.status, stop, notification, item.at);
  }

  /**
   * Every second: delivers the queued changes. The hook and Herdr are not ordered (and a permission prompt is reported about
   * 6 s late), so a change waits up to WAIT_TRIES seconds for its text, and goes without it after that.
   */
  async flush() {
    if (this.flushing || !this.pending.length) return;
    this.flushing = true;
    try {
      const cfg = this.pushConfig;
      const waiting = [];
      for (const item of this.pending) {
        const wantsText = cfg && (cfg.desktop || cfg.details) && !item.agent.address.includes("/");
        const said = wantsText ? await this.saidAbout(item) : "";
        if (said || !wantsText || ++item.tries >= WAIT_TRIES) await this.deliver(item.agent, said, cfg);
        else waiting.push(item);
      }
      this.pending = waiting;
    } catch {
      // delivered on the next tick
    } finally {
      this.flushing = false;
    }
  }

  /** Runs a notification command and says how it went: { ok, detail }. */
  async show(c) {
    try {
      const r = await exec(c.command, c.args, { timeout: 15000 });
      this.log(`desktop ${c.command} exit=${r.code} ${r.stdout ?? ""}${r.stderr ?? ""}`);
      // A notification that went through prints nothing: terminal-notifier can exit 0 and still say it was refused.
      const quiet = !String(r.stderr ?? "").trim() && !(c.command === "terminal-notifier" && String(r.stdout ?? "").trim());
      return { ok: r.code === 0 && quiet, detail: `${r.stdout ?? ""}${r.stderr ?? ""}` };
    } catch (e) {
      this.log(`desktop ${c.command} failed: ${e}`);
      return { ok: false, detail: String(e) };
    }
  }

  async deliver(agent, said, cfg) {
    if (!cfg) return;
    const name = nameOf(agent, shared("tabi.party"));
    const active = herdrWindow()?.active;
    this.log(`deliver ${agent.address} ${agent.status} as "${name}" said="${said}" window.active=${active} desktop=${cfg.desktop} phone=${Boolean(cfg.topic)}`);
    // The notification of the system only when Herdr is not what the person is looking at: inside Herdr there is already its own.
    if (cfg.desktop && !active) {
      const platform = herdrWindow()?.platform ?? "linux";
      if (platform === "macos" && this.terminalNotifier === undefined) {
        this.terminalNotifier = await exec("sh", ["-c", "command -v terminal-notifier"], { timeout: 5000 }).then((r) => r.code === 0, () => false);
      }
      const card = cardMessage(agent, name, said, portraitOf(shared("tabi.party"), agent.address, appHome()));
      const options = { terminalNotifier: this.terminalNotifier && cfg.notifier !== "osascript", script: `${appHome()}/tools/desktop-notify.ps1` };
      let c = desktopCommand(platform, card, options);
      let result = await this.show(c);
      // terminal-notifier can be installed and still refused by macOS (no permission yet): osascript is the other way in.
      if (!result.ok && c.command === "terminal-notifier") {
        this.log("desktop terminal-notifier did not work: trying osascript");
        c = desktopCommand(platform, card, { ...options, terminalNotifier: false });
        result = await this.show(c);
      }
    } else if (cfg.desktop) {
      this.log("desktop skipped: Herdr is the active window");
    }
    if (cfg.topic) {
      const payload = pushPayload(cfg, agent, name, said);
      // No -f: with it curl hides the body of an error, and ntfy says there what it did not like.
      await exec("curl", ["-sS", "-m", "10", "-H", "Content-Type: application/json", "-d", JSON.stringify(payload), "-w", "\n%{http_code}", cfg.server], { timeout: 15000 })
        .then((r) => { const a = parseCurl(r.stdout); this.log(`phone curl exit=${r.code} http=${a.code} ${a.body} ${r.stderr ?? ""}`); },
          (e) => this.log(`phone curl failed: ${e}`));
    }
  }

  /** One arrow: a filled body with a 0.5 px top and bottom border, then the point (fill + edge line). */
  segment(icon, text, t, first) {
    const fill = t.surface;
    const edge = t.input;
    return h_flex().h(H).items_center().flex_none().when(!first, (el) => el.ml(2))
      .child(h_flex().h(H).items_center().gap(6).pl(first ? 14 : 12).pr(2).bg(fill)
        .border_t(0.5).border_b(0.5).border_color(edge)
        .when(first, (el) => el.border_l(0.5))
        .child(svg(icon).size(13).flex_none().text_color(t.muted))
        .child(div().text_size(11).font_light().text_color(t.muted).child(text)))
      .child(div().relative().w(TIP).h(H).flex_none()
        .child(svg("mods/tabi-status/arrow.svg").absolute().top(0).left(0).w(TIP).h(H).text_color(fill))
        .child(svg("mods/tabi-status/arrow-line.svg").absolute().top(0).left(0).w(TIP).h(H).text_color(edge)));
  }

  render() {
    const t = theme();
    const f = focused();
    const space = spaces().find((s) => s.id === f?.space);
    const machine = space?.machine ? (machines().find((m) => m.name === space.machine)?.name ?? space.machine) : "este equipo";
    const branch = space?.branch || "sin rama";
    const bd = shared("tabi.backdrop");
    const tag = bd?.total && bd.index >= 0 ? `fondo ${bd.index + 1}/${bd.total}` : "sin fondos";
    return h_flex().id("tabi-status").size_full().items_center().justify_between().bg(t.chrome).border_t(0.5).border_color(t.border)
      .child(h_flex().h(H).items_center().pl(6)
        .child(this.segment("mods/tabi-status/icon-equipo.svg", machine, t, true))
        .child(this.segment("mods/tabi-status/icon-rama.svg", branch, t, false))
        .child(this.segment("mods/tabi-status/icon-agentes.svg", `agentes ${agents().length}`, t, false)))
      .child(h_flex().items_center().gap(18).pr(16)
        .child(div().id("tabi-backdrop-tag").text_size(11).font_light().text_color(t.muted).hover((s) => s.text_color(t.foreground))
          .on_click(() => run("tabi-backdrop.next")).child(tag))
        .child(div().text_size(11).font_light().text_color(t.dim).child("⌘⇧P comandos")));
  }
}
