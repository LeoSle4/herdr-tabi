"""Sub-agents on the agent cards of tabi.

Claude Code runs this as a hook (SubagentStart, SubagentStop, SessionEnd). It records each sub-agent of the Claude session
that lives in a Herdr terminal (its id is in HC_TERMINAL_ID), one small JSON file per sub-agent, so the tabi-party mod can
draw them under the card of their agent:

    <state>/<terminal id>/<agent id>.json     {"type", "status": "running" | "done", "started", "ended", "summary"}

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


def state_root():
    return os.environ.get("TABI_SUBAGENTS_DIR") or os.path.join(os.path.expanduser("~"), ".local", "state", "tabi", "subagents")


def safe(name):
    """A file name made of the name, never a path: letters, digits, dot, dash and underscore only."""
    cleaned = re.sub(r"[^A-Za-z0-9_.-]", "_", str(name or ""))
    return "" if cleaned.strip(".") == "" else cleaned


def summarize(text):
    """First non-empty line of what the sub-agent said last, squeezed to one short line."""
    for line in str(text or "").splitlines():
        line = " ".join(line.split())
        if line:
            return line if len(line) <= MAX_SUMMARY else line[: MAX_SUMMARY - 1] + "…"
    return ""


def _write(path, record):
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
        done = rec.get("status") == "done"
        stamp = rec.get("ended") if done else rec.get("started")
        age = (now_ms - stamp) / 1000 if isinstance(stamp, (int, float)) else 0
        if age > (KEEP_DONE_S if done else STALE_S):
            os.remove(path)
        else:
            entries.append((rec.get("started") or 0, path))
    for _, path in sorted(entries, reverse=True)[MAX_FILES:]:
        os.remove(path)


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
    agent_id = safe(event.get("agent_id"))
    if name not in ("SubagentStart", "SubagentStop") or not agent_id:
        return
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, agent_id + ".json")
    kind = str(event.get("agent_type") or "agent")[:40]
    if name == "SubagentStart":
        _write(path, {"type": kind, "status": "running", "started": now_ms, "ended": None, "summary": ""})
    else:
        rec = _read(path) or {"type": kind, "started": now_ms}
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
