# Reads Codex plan usage and prints it as JSON for the tabi-usage mod. macOS, Windows and Linux.
#   python3 -X utf8 codex_usage.py
# It sends no token anywhere: it starts the official `codex app-server` (stdio) for the account in
# CODEX_HOME and asks it `account/rateLimits/read`, as the Codex app does. The only thing read from
# auth.json is the email inside the id_token, to label the account.
import base64
import datetime
import glob
import json
import os
import shutil
import subprocess
import sys
import threading

HOME = os.path.expanduser("~")
CODEX_HOME = os.environ.get("CODEX_HOME") or os.path.join(HOME, ".codex")


def ms(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value * 1000 if value < 10**12 else value)
    return int(datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00")).timestamp() * 1000)


def codex_exe():
    found = shutil.which("codex")
    if found:
        return found
    local = os.environ.get("LOCALAPPDATA")
    if local:  # Windows desktop app
        exes = sorted(glob.glob(os.path.join(local, "OpenAI", "Codex", "bin", "*", "codex.exe")), key=os.path.getmtime, reverse=True)
        if exes:
            return exes[0]
    raise RuntimeError("codex not found in PATH.")


def email():
    try:
        with open(os.path.join(CODEX_HOME, "auth.json"), encoding="utf-8") as f:
            part = json.load(f)["tokens"]["id_token"].split(".")[1]
        return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))).get("email")
    except (OSError, ValueError, KeyError, IndexError, TypeError):
        return None


def span(minutes):
    """A window's name from its length: plans differ (5 hours and a week, or a week, or 30 days)."""
    if not minutes:
        return "limit"
    if minutes <= 6 * 60:
        return f"{round(minutes / 60)}h"
    if minutes <= 8 * 24 * 60:
        return "weekly"
    return f"{round(minutes / 1440)}d"


def read_limits():
    proc = subprocess.Popen([codex_exe(), "app-server", "--listen", "stdio://"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.DEVNULL, encoding="utf-8", env={**os.environ, "CODEX_HOME": CODEX_HOME},
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    watchdog = threading.Timer(40, proc.kill)
    watchdog.daemon = True
    watchdog.start()

    def send(msg):
        proc.stdin.write(json.dumps(msg) + "\n")
        proc.stdin.flush()

    def answer(want):
        for line in proc.stdout:
            try:
                msg = json.loads(line)
            except ValueError:
                continue
            if msg.get("id") == want:
                if "error" in msg:
                    raise RuntimeError(msg["error"].get("message", "app-server error"))
                return msg["result"]
        raise RuntimeError("app-server didn't answer.")

    try:
        send({"id": 1, "method": "initialize", "params": {"clientInfo": {"name": "herdr-tabi-usage", "version": "0.1"}}})
        answer(1)
        send({"method": "initialized"})
        send({"id": 2, "method": "account/rateLimits/read"})
        return answer(2)["rateLimits"]
    finally:
        watchdog.cancel()
        proc.kill()


def main():
    out = {"agent": "codex", "email": email()}
    try:
        limits = read_limits()
        found = [w for w in (limits.get("primary"), limits.get("secondary")) if w]
        found.sort(key=lambda w: w.get("windowDurationMins") or 0)
        out["plan"] = limits.get("planType")
        out["windows"] = [{"label": span(w.get("windowDurationMins")), "used": w.get("usedPercent"), "resets": ms(w.get("resetsAt"))}
                          for w in found]
        out["error"] = None
    except Exception as e:  # noqa: BLE001 - reported to the mod, which marks the reading as stale
        error = str(e) or type(e).__name__
        out["windows"] = []
        out["error"] = "Logged out: run `codex login`." if "authentication required" in error else error
    sys.stdout.write(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
