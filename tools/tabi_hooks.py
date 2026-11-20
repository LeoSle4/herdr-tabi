"""Installs, removes and checks the Claude Code hooks that tabi_subagents.py serves.

    python3 tools/tabi_subagents.py install [--config-dir DIR]      (also: uninstall, status)

Edits <config dir>/settings.json (default: $CLAUDE_CONFIG_DIR, else ~/.claude) and touches only the entries that run
tabi_subagents.py; the first time it saves a copy as settings.json.tabi-backup.
"""
import json
import os
import shutil
import sys

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tabi_subagents.py")
MARK = "tabi_subagents.py"
EVENTS = ("SubagentStart", "SubagentStop", "Stop", "Notification", "SessionEnd")


def default_config_dir():
    return os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(os.path.expanduser("~"), ".claude")


def hook_command():
    return f'"{sys.executable}" "{SCRIPT}"'


def _is_ours(entry):
    return any(MARK in str(h.get("command", "")) for h in entry.get("hooks", []) if isinstance(h, dict))


def _load_settings(config_dir):
    path = os.path.join(config_dir, "settings.json")
    if not os.path.exists(path):
        return path, {}
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        raise ValueError(f"{path} is not a JSON object")
    return path, data


def _save_settings(path, data):
    backup = path + ".tabi-backup"
    if os.path.exists(path) and not os.path.exists(backup):
        shutil.copy2(path, backup)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.tmp-{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, path)


def install(config_dir):
    """Adds (or refreshes) our three hooks. Returns the events that changed."""
    path, data = _load_settings(config_dir)
    hooks = data.setdefault("hooks", {})
    command = hook_command()
    changed = []
    for event in EVENTS:
        entries = hooks.setdefault(event, [])
        ours = [e for e in entries if isinstance(e, dict) and _is_ours(e)]
        wanted = {"matcher": "", "hooks": [{"type": "command", "command": command, "timeout": 5, "async": True}]}
        if ours and ours[0] == wanted and len(ours) == 1:
            continue
        hooks[event] = [e for e in entries if e not in ours] + [wanted]
        changed.append(event)
    if changed:
        _save_settings(path, data)
    return changed


def uninstall(config_dir):
    """Removes only our hooks. Returns the events that changed."""
    path, data = _load_settings(config_dir)
    hooks = data.get("hooks", {})
    changed = []
    for event in EVENTS:
        entries = hooks.get(event, [])
        kept = [e for e in entries if not (isinstance(e, dict) and _is_ours(e))]
        if len(kept) != len(entries):
            changed.append(event)
            if kept:
                hooks[event] = kept
            else:
                del hooks[event]
    if changed:
        if not hooks:
            data.pop("hooks", None)
        _save_settings(path, data)
    return changed


def status(config_dir):
    """The events that have our hook, and whether it points at this python and this file."""
    _, data = _load_settings(config_dir)
    hooks = data.get("hooks", {})
    found = {}
    for event in EVENTS:
        ours = [e for e in hooks.get(event, []) if isinstance(e, dict) and _is_ours(e)]
        found[event] = bool(ours) and all(h.get("command") == hook_command() for e in ours for h in e["hooks"] if MARK in str(h.get("command", "")))
    return found




def cli(command, argv):
    config_dir = default_config_dir()
    if "--config-dir" in argv:
        i = argv.index("--config-dir")
        if i + 1 >= len(argv):
            print("error: --config-dir needs a folder", file=sys.stderr)
            return 2
        config_dir = argv[i + 1]
    try:
        if command == "install":
            changed = install(config_dir)
            print(f"==> Hooks {'updated: ' + ', '.join(changed) if changed else 'already in place'} ({config_dir}/settings.json)")
            return 0
        if command == "uninstall":
            changed = uninstall(config_dir)
            print(f"==> Hooks {'removed: ' + ', '.join(changed) if changed else 'were not installed'} ({config_dir}/settings.json)")
            return 0
        if command == "status":
            found = status(config_dir)
            for event, ok in found.items():
                print(f"{event}: {'ok' if ok else 'missing or pointing somewhere else'}")
            return 0 if all(found.values()) else 1
    except (OSError, ValueError) as e:
        print(f"error: {e}", file=sys.stderr)
        return 1
    print("usage: tabi_subagents.py [hook | install | uninstall | status] [--config-dir DIR]", file=sys.stderr)
    return 2
