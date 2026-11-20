"""Sub-agents on the agent cards of tabi.

Claude Code runs this as a hook (SubagentStart, SubagentStop, Stop, Notification, SessionEnd). It records, for the Claude
session that lives in a Herdr terminal (its id is in HC_TERMINAL_ID), what tabi shows on the agent's card:

    <state>/<terminal id>/<agent id>.json     a sub-agent: {"type", "status": "running" | "done", "started", "ended", "summary"}
    <state>/<terminal id>/_stop.json          how the last turn ended: {"text", "at"} (first line of the final answer)
    <state>/<terminal id>/_notification.json  what it is waiting for: {"text", "at"} (a permission prompt, a question)

The same command installs the hooks into Claude's settings.json (the work is in tabi_hooks.py):

    python3 tools/tabi_subagents.py install [--config-dir DIR]      (also: uninstall, status)

As a hook it must never get in Claude's way: it always exits 0 and prints nothing. State folder: TABI_SUBAGENTS_DIR, else
~/.local/state/tabi/subagents. One file per sub-agent means parallel sub-agents never overwrite each other.
"""
import json
import os
import re
import shutil
import sys
import time

KEEP_DONE_S = 600  # a finished sub-agent's file is deleted after 10 minutes
STALE_S = 7200  # a "running" one older than 2 hours is left over from a crash
MAX_FILES = 30
MAX_SUMMARY = 100
MAX_SAID = 140  # the first line of a final answer or of a notification
# Notification types that mean the agent waits for the person (not "idle_prompt", which is only a reminder).
WAITING = ("permission_prompt", "elicitation_dialog", "agent_needs_input")


def state_root():
    return os.environ.get("TABI_SUBAGENTS_DIR") or os.path.join(os.path.expanduser("~"), ".local", "state", "tabi", "subagents")


def safe(name):
    """A file name made of the name, never a path: letters, digits, dot, dash and underscore only."""
    cleaned = re.sub(r"[^A-Za-z0-9_.-]", "_", str(name or ""))
    return "" if cleaned.strip(".") == "" else cleaned


def summarize(text, limit=MAX_SUMMARY):
    """First non-empty line of a text, squeezed to one short line."""
    for line in str(text or "").splitlines():
        line = " ".join(line.split())
        if line:
            return line if len(line) <= limit else line[: limit - 1] + "…"
    return ""


def _write(path, record):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp-{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(record, f, ensure_ascii=False)
    os.replace(tmp, path)


def _read(path):
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None


def prune(folder, now_ms):
    """Deletes finished records older than KEEP_DONE_S, running ones older than STALE_S, and all but the newest MAX_FILES."""
    entries = []
    for name in os.listdir(folder):
        if not name.endswith(".json"):
            continue
        path = os.path.join(folder, name)
        rec = _read(path)
        if rec is None:
            continue
        if name.startswith("_"):  # what the agent said: not a sub-agent, only dropped when very old
            if isinstance(rec.get("at"), (int, float)) and (now_ms - rec["at"]) / 1000 > STALE_S:
                os.remove(path)
            continue
        done = rec.get("status") == "done"
        stamp = rec.get("ended") if done else rec.get("started")
        age = (now_ms - stamp) / 1000 if isinstance(stamp, (int, float)) else 0
        if age > (KEEP_DONE_S if done else STALE_S):
            os.remove(path)
        else:
            entries.append((rec.get("started") or 0, path))
    for _, path in sorted(entries, reverse=True)[MAX_FILES:]:
        os.remove(path)


def _said(folder, file, text, now_ms):
    """Records the first line of what the agent said (nothing when there is no text) and when."""
    line = summarize(text, MAX_SAID)
    if not line:
        return
    os.makedirs(folder, exist_ok=True)
    _write(os.path.join(folder, file), {"text": line, "at": now_ms})
    prune(folder, now_ms)


def handle(event, terminal, root=None, now_ms=None):
    """Applies one hook event. Does nothing outside a Herdr terminal or for an event without a usable sub-agent id."""
    terminal = safe(terminal)
    if not terminal or not isinstance(event, dict):
        return
    root = root or state_root()
    now_ms = int(time.time() * 1000) if now_ms is None else now_ms
    name = event.get("hook_event_name")
    folder = os.path.join(root, terminal)
    if name == "SessionEnd":
        shutil.rmtree(folder, ignore_errors=True)
        return
    if name == "Stop":
        _said(folder, "_stop.json", event.get("last_assistant_message"), now_ms)
        return
    if name == "Notification":
        if event.get("notification_type") in WAITING:
            _said(folder, "_notification.json", event.get("message"), now_ms)
        return
    agent_id = safe(event.get("agent_id"))
    if name not in ("SubagentStart", "SubagentStop") or not agent_id:
        return
    path = os.path.join(folder, agent_id + ".json")
    agent_type = str(event.get("agent_type") or "")[:40]
    existing = _read(path)
    if name == "SubagentStart":
        if existing and existing.get("status") == "done":
            return  # the stop of a very quick one can be handled before its start: never bring it back to "running"
        _write(path, {"type": agent_type or "agent", "status": "running", "started": now_ms, "ended": None, "summary": ""})
    else:
        # A stop with no start and no type is not a sub-agent of the work: Claude Code runs internal agents too (the
        # suggestion of what you may type next, for one) and reports them as a bare SubagentStop. Those are not shown.
        if not existing and not agent_type:
            return
        rec = existing or {"type": agent_type, "started": now_ms}
        rec.update(status="done", ended=now_ms, summary=summarize(event.get("last_assistant_message")))
        _write(path, rec)
    prune(folder, now_ms)


def main(argv):
    command = argv[1] if len(argv) > 1 else "hook"
    if command == "hook":
        try:
            handle(json.load(sys.stdin), os.environ.get("HC_TERMINAL_ID"))
        except Exception:
            pass  # a hook never breaks Claude
        return 0
    import tabi_hooks  # only the commands that edit settings.json need it: the hook itself stays light

    return tabi_hooks.cli(command, argv)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
