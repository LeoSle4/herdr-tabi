# Lists Claude Code and Codex sessions as JSON for the tabi-sessions mod. Works on macOS, Windows and Linux.
#   python3 -X utf8 sessions.py <herdr-app-home> [<account>=<config dir> ...]
#   Extra Claude accounts (a wrapper that sets CLAUDE_CONFIG_DIR, e.g. claude2=/Users/me/.claude-cuenta2) are read from
#   <config dir>/projects too; their sessions carry "account": "<account>" (the default account has none).
# Read-only: it never writes to Claude's or Codex's own files. The only thing it writes is its own
# cache, <herdr-app-home>/data/tabi/claude-cache.json.
#   Claude: ~/.claude/projects/*/*.jsonl (the CLI transcripts), with titles from the Claude desktop
#           app's session files when that app is installed (optional: missing folders are skipped).
#   Codex:  state_5.sqlite, opened read-only.
import datetime
import glob
import json
import os
import sqlite3
import sys

HOME = os.path.expanduser("~")
CLAUDE_HOME = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.join(HOME, ".claude")
CODEX_HOME = os.environ.get("CODEX_HOME") or os.path.join(HOME, ".codex")


def desktop_roots():
    """Where the Claude desktop app keeps its Code sessions. Every folder is optional."""
    local = os.environ.get("LOCALAPPDATA") or ""
    appdata = os.environ.get("APPDATA") or ""
    candidates = [
        os.path.join(HOME, "Library", "Application Support", "Claude", "claude-code-sessions"),  # macOS
        os.path.join(appdata, "Claude", "claude-code-sessions") if appdata else "",  # Windows
        os.path.join(HOME, ".config", "Claude", "claude-code-sessions"),  # Linux
    ]
    found = [c for c in candidates if c and os.path.isdir(c)]
    if local:
        found += sorted(glob.glob(os.path.join(local, "Claude-Data", "claude_*", "claude-code-sessions")))
    return found


def desktop_titles():
    """cliSessionId -> {title, archived} from the desktop app's local_*.json files."""
    out = {}
    for root in desktop_roots():
        for path in glob.glob(os.path.join(root, "*", "*", "local_*.json")):
            try:
                with open(path, encoding="utf-8") as f:
                    o = json.load(f)
            except (OSError, ValueError):
                continue
            cli = o.get("cliSessionId")
            if cli:
                out[cli] = {"title": o.get("title") or "", "archived": bool(o.get("isArchived"))}
    return out


def one_line(text, limit=140):
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def prompt_text(message):
    """The plain text of a user message, or '' for tool results, commands and system notes."""
    content = (message or {}).get("content")
    if isinstance(content, list):
        content = " ".join(p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text")
    content = (content or "").strip()
    return "" if content.startswith("<") else content


def read_transcript(path):
    """(cwd, first prompt, last ai-title) of one transcript. A cheap pass: JSON is parsed only on the
    lines that can hold those three fields."""
    cwd = first = title = None
    with open(path, "rb") as f:
        for raw in f:
            if b'"ai-title"' in raw:
                try:
                    title = json.loads(raw).get("aiTitle") or title
                except ValueError:
                    pass
            elif (cwd is None or first is None) and b'"type":"user"' in raw:
                try:
                    o = json.loads(raw)
                except ValueError:
                    continue
                if o.get("isSidechain"):
                    continue
                cwd = cwd or o.get("cwd")
                first = first or prompt_text(o.get("message"))
    return cwd, first, title


def claude_sessions(store, extra=()):
    cache_path = os.path.join(store, "claude-cache.json")
    try:
        with open(cache_path, encoding="utf-8") as f:
            cache = json.load(f)
    except (OSError, ValueError):
        cache = {}
    fresh, dirty = {}, False
    titles = desktop_titles()
    sessions = []
    homes = [(None, CLAUDE_HOME)] + [(name, folder) for name, folder in extra]
    paths = [(account, path) for account, folder in homes for path in glob.glob(os.path.join(folder, "projects", "*", "*.jsonl"))]
    for account, path in paths:
        try:
            st = os.stat(path)
        except OSError:
            continue
        stamp = f"{st.st_mtime_ns}-{st.st_size}"
        hit = cache.get(path)
        if not hit or hit.get("stamp") != stamp:
            try:
                cwd, first, title = read_transcript(path)
            except OSError:
                continue
            hit = {"stamp": stamp, "cwd": cwd, "first": first, "title": title}
            dirty = True
        fresh[path] = hit
        sid = os.path.splitext(os.path.basename(path))[0]
        if not hit["cwd"] or not (hit["first"] or hit["title"]):
            continue  # opened and closed without a prompt
        desk = titles.get(sid) or {}
        if desk.get("archived"):
            continue
        cwd = hit["cwd"]
        sessions.append({
            "id": sid,
            "title": one_line(desk.get("title") or hit["title"] or hit["first"]),
            "cwd": cwd,
            "last": int(st.st_mtime * 1000),
            "folder": os.path.isdir(cwd),
            "native_pin": False,
            "desktop": sid in titles,
            "account": account,
        })
    if dirty or set(fresh) != set(cache):
        os.makedirs(store, exist_ok=True)
        tmp = cache_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(fresh, f, ensure_ascii=False)
        os.replace(tmp, cache_path)
    return sessions


def strip_verbatim(path):
    """Windows' \\\\?\\ long-path prefix."""
    return path[4:] if path and path.startswith("\\\\?\\") else (path or "")


def codex_title(name, title, first_message, preview, last_ms):
    """The name Codex gave the thread, else its title, else the first user message (cut to one line), else
    "Sin título · <date>" (just "Sin título" when the thread has no date)."""
    text = one_line(name or title or first_message or preview)
    if text:
        return text
    if last_ms:
        return "Sin título · " + datetime.datetime.fromtimestamp(last_ms / 1000).strftime("%Y-%m-%d")
    return "Sin título"


def codex_sessions():
    db = os.path.join(CODEX_HOME, "state_5.sqlite")
    if not os.path.isfile(db):
        return []
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=2)
    try:
        # first_user_message is not in every Codex version: ask for it only when the table has it.
        columns = {row[1] for row in con.execute("pragma table_info(threads)")}
        first = "first_user_message" if "first_user_message" in columns else "null"
        rows = con.execute(
            f"""select id, name, title, {first}, preview, cwd, recency_at_ms, updated_at_ms, is_pinned
               from threads
               where archived = 0 and source in ('cli', 'vscode') and (thread_source is null or thread_source = 'user')"""
        ).fetchall()
    finally:
        con.close()
    out = []
    for tid, name, title, first_message, preview, cwd, recency, updated, pinned in rows:
        cwd = strip_verbatim(cwd)
        last = recency or updated or 0
        out.append({
            "id": tid,
            "title": codex_title(name, title, first_message, preview, last),
            "cwd": cwd,
            "last": last,
            "folder": bool(cwd) and os.path.isdir(cwd),
            "native_pin": bool(pinned),
            "desktop": False,
        })
    return out


def attempt(fn, *args):
    """A source that fails shows as an error next to the other one, not as a broken list."""
    try:
        return fn(*args), None
    except Exception as e:  # noqa: BLE001 - reported to the mod, which shows it
        return [], f"{type(e).__name__}: {e}"


def main():
    app_home = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HOME, ".config", "herdr-app")
    store = os.path.join(app_home, "data", "tabi")
    extra = [tuple(a.split("=", 1)) for a in sys.argv[2:] if "=" in a]
    claude, claude_error = attempt(claude_sessions, store, extra)
    codex, codex_error = attempt(codex_sessions)
    for rows in (claude, codex):
        rows.sort(key=lambda s: s["last"], reverse=True)
    sys.stdout.write(json.dumps({
        "claude": claude, "claude_error": claude_error,
        "codex": codex, "codex_error": codex_error,
        "desktop_found": bool(desktop_roots()),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
