#!/bin/sh
# Tests for bin/tabi against a throwaway local origin. Run from the repo root: sh test/tabi.test.sh
# Everything happens inside a mktemp folder; nothing of yours is touched.
set -eu

TABI="$(cd "$(dirname "$0")/.." && pwd)/bin/tabi"
ROOT=$(mktemp -d)
trap 'rm -rf "$ROOT"' EXIT
FAILS=0

ok() { printf 'ok   %s\n' "$1"; }
no() { printf 'FAIL %s\n' "$1"; FAILS=$((FAILS + 1)); }
check() { if eval "$2"; then ok "$1"; else no "$1"; fi; }
g() { git -c user.name=t -c user.email=t@t.test "$@"; }

# An origin with one commit: a settings file and a mod.
git init -q --bare -b main "$ROOT/origin.git"
git clone -q "$ROOT/origin.git" "$ROOT/work" 2>/dev/null
mkdir -p "$ROOT/work/mods/tabi-x"
echo 'upstream' > "$ROOT/work/settings.json"
echo 'mod v1' > "$ROOT/work/mods/tabi-x/main.js"
g -C "$ROOT/work" checkout -q -B main
g -C "$ROOT/work" add -A
g -C "$ROOT/work" commit -q -m one
g -C "$ROOT/work" push -q origin main

export TABI_REPO="$ROOT/origin.git"
run() { sh "$TABI" "$@"; }

# 1. A fresh install into an empty folder.
A="$ROOT/a"
run install --dir "$A" >/dev/null
check "install: tracked files arrive" '[ "$(cat "$A/mods/tabi-x/main.js")" = "mod v1" ]'
check "install: folder is a checkout on main" '[ "$(git -C "$A" symbolic-ref --short HEAD)" = main ]'

# 2. An install over an existing folder keeps the replaced file and the untracked ones.
B="$ROOT/b"
mkdir -p "$B/data"
echo 'mine' > "$B/settings.json"
echo 'state' > "$B/data/state.json"
run install --dir "$B" >/dev/null
check "install over existing: file replaced" '[ "$(cat "$B/settings.json")" = upstream ]'
check "install over existing: old file backed up" 'cat "$B"/.tabi-backup-*/settings.json | grep -qx mine'
check "install over existing: untracked data untouched" '[ "$(cat "$B/data/state.json")" = state ]'

# 3. An identical file is not backed up.
check "install over existing: identical files not backed up" '[ ! -e "$A"/.tabi-backup-* ] && ! ls "$B"/.tabi-backup-*/mods >/dev/null 2>&1'

# 4. Update brings a new commit.
echo 'mod v2' > "$ROOT/work/mods/tabi-x/main.js"
g -C "$ROOT/work" commit -q -am two
g -C "$ROOT/work" push -q origin main
run update --dir "$A" >/dev/null
check "update: new version arrives" '[ "$(cat "$A/mods/tabi-x/main.js")" = "mod v2" ]'
check "update: running again says up to date" 'run update --dir "$A" | grep -q "Already up to date"'

# 5. Update refuses local edits to tracked files.
echo 'edited' > "$A/settings.json"
check "update: refuses with local changes" '! run update --dir "$A" >/dev/null 2>&1'
check "update: leaves the edit alone" '[ "$(cat "$A/settings.json")" = edited ]'
g -C "$A" checkout -q -- settings.json

# 6. Update refuses when the folder is on another branch.
g -C "$A" checkout -q -b other
check "update: refuses off main" '! run update --dir "$A" >/dev/null 2>&1'
g -C "$A" checkout -q main

# 7. Update on a folder that was never installed.
mkdir "$ROOT/empty"
check "update: refuses a non-checkout" '! run update --dir "$ROOT/empty" >/dev/null 2>&1'

# 8. Install on an installed folder updates it instead of failing.
check "install again: behaves as update" 'run install --dir "$A" | grep -q "Already up to date"'

if [ "$FAILS" -ne 0 ]; then printf '\n%s test(s) failed\n' "$FAILS"; exit 1; fi
printf '\nall passed\n'
