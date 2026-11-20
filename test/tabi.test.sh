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
mkdir -p "$ROOT/work/shell"
cp "$(dirname "$TABI")/../shell/profile.sh" "$(dirname "$TABI")/../shell/starship.toml" "$ROOT/work/shell/"
g -C "$ROOT/work" checkout -q -B main
g -C "$ROOT/work" add -A
g -C "$ROOT/work" commit -q -m one
g -C "$ROOT/work" push -q origin main

export TABI_REPO="$ROOT/origin.git"
run() { sh "$TABI" "$@"; }

# 1. A fresh install into an empty folder.
A="$ROOT/a"
run install --dir "$A" --no-shell >/dev/null
check "install: tracked files arrive" '[ "$(cat "$A/mods/tabi-x/main.js")" = "mod v1" ]'
check "install: folder is a checkout on main" '[ "$(git -C "$A" symbolic-ref --short HEAD)" = main ]'

# 2. An install over an existing folder keeps the replaced file and the untracked ones.
B="$ROOT/b"
mkdir -p "$B/data"
echo 'mine' > "$B/settings.json"
echo 'state' > "$B/data/state.json"
run install --dir "$B" --no-shell >/dev/null
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
check "install again: behaves as update" 'run install --dir "$A" --no-shell | grep -q "Already up to date"'

# 9. tabi shell wires the rc file once, keeps what is already in it and leaves a backup.
H="$ROOT/home"
mkdir -p "$H"
printf 'export FOO=1\n' > "$H/.zshrc"
shell() { HOME="$H" SHELL="$1" sh "$TABI" shell --dir "$A" --no-install; }
shell /bin/zsh >/dev/null
shell /bin/zsh >/dev/null
check "shell: one block after running twice" '[ "$(grep -c ">>> tabi shell >>>" "$H/.zshrc")" = 1 ]'
check "shell: existing lines kept" 'grep -qx "export FOO=1" "$H/.zshrc"'
check "shell: backup of the original" '[ "$(cat "$H/.zshrc.tabi-backup")" = "export FOO=1" ]'
check "shell: block points at the checkout" 'grep -q "TABI_SHELL_DIR=\"$A/shell\"" "$H/.zshrc"'
shell /bin/bash >/dev/null
check "shell: bash uses .bashrc" 'grep -q ">>> tabi shell >>>" "$H/.bashrc"'
check "shell: unknown shell touches no rc file" 'rm -f "$H/.zshrc" "$H/.bashrc"; shell /usr/bin/fish >/dev/null && [ ! -e "$H/.zshrc" ] && [ ! -e "$H/.bashrc" ]'
check "shell: refuses without the profile file" '! HOME="$H" SHELL=/bin/zsh sh "$TABI" shell --dir "$ROOT/empty" --no-install >/dev/null 2>&1'

# 10. The profile loads in bash and zsh, with and without the tools installed.
check "profile: valid bash" 'bash -n "$A/shell/profile.sh"'
check "profile: valid zsh" '! command -v zsh >/dev/null || zsh -n "$A/shell/profile.sh"'
check "profile: loads with no tools on the PATH" 'PATH=/usr/bin:/bin TABI_SHELL_DIR="$A/shell" bash --norc -ic ". \"$A/shell/profile.sh\"; echo loaded" 2>/dev/null | grep -q loaded'

# 11. tabi memory: two machines share Engram chunks through a git repository (engram itself is a stub here).
MB="$ROOT/bin"
mkdir -p "$MB"
cat > "$MB/engram" <<'STUB'
#!/bin/sh
case "$2" in
  --all) mkdir -p .engram; echo chunk > ".engram/chunk-$(basename "$PWD")" ;;
  --import) echo imported >> "$STUB_LOG" ;;
  --status) echo "Sync status:" ;;
esac
STUB
chmod +x "$MB/engram"
export STUB_LOG="$ROOT/stub.log"
git init -q --bare -b main "$ROOT/mem.git"
for m in m1 m2; do
  git clone -q "$ROOT/mem.git" "$ROOT/$m" 2>/dev/null
  git -C "$ROOT/$m" config user.name t
  git -C "$ROOT/$m" config user.email t@t.test
  git -C "$ROOT/$m" checkout -q -B main
done
mem() { d=$1; shift; PATH="$MB:$PATH" TABI_MEMORY_DIR="$d" TABI_MEMORY_TRUST=1 sh "$TABI" memory "$@"; }
check "memory: push sends the chunk" 'mem "$ROOT/m1" push | grep -q "Memories sent" && git -C "$ROOT/mem.git" ls-tree -r --name-only main | grep -qx ".engram/chunk-m1"'
check "memory: push again has nothing new" 'mem "$ROOT/m1" push | grep -q "Nothing new"'
check "memory: pull brings it and imports" 'mem "$ROOT/m2" pull | grep -q "Memories imported" && [ -f "$ROOT/m2/.engram/chunk-m1" ] && grep -q imported "$STUB_LOG"'
check "memory: the other machine sends its own chunk" 'mem "$ROOT/m2" push | grep -q "Memories sent" && mem "$ROOT/m1" pull >/dev/null && [ -f "$ROOT/m1/.engram/chunk-m2" ]'
check "memory: status passes engram through" 'mem "$ROOT/m1" status | grep -q "Sync status"'
check "memory: unknown subcommand fails" '! mem "$ROOT/m1" nonsense >/dev/null 2>&1'
git init -q --bare -b main "$ROOT/herdr-tabi.git"
git clone -q "$ROOT/herdr-tabi.git" "$ROOT/pub" 2>/dev/null
check "memory: refuses the public tabi repository" '! mem "$ROOT/pub" push >/dev/null 2>&1 && mem "$ROOT/pub" push 2>&1 | grep -q "public tabi repository"'
check "memory: refuses a folder that is not a checkout" '! mem "$ROOT/empty" push >/dev/null 2>&1'
check "memory: refuses when privacy cannot be confirmed" '! PATH="$MB:$PATH" TABI_MEMORY_DIR="$ROOT/m1" sh "$TABI" memory push >/dev/null 2>&1'

if [ "$FAILS" -ne 0 ]; then printf '\n%s test(s) failed\n' "$FAILS"; exit 1; fi
printf '\nall passed\n'
