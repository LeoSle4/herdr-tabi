#!/bin/sh
# One-line installer for macOS and Linux:
#   curl -fsSL https://raw.githubusercontent.com/LeoSle4/herdr-tabi/main/install.sh | sh
# It puts the `tabi` command in ~/.local/bin and runs `tabi install`.
set -eu

RAW="${TABI_RAW:-https://raw.githubusercontent.com/LeoSle4/herdr-tabi/main}"
BIN="${TABI_BIN:-$HOME/.local/bin}"

command -v curl >/dev/null 2>&1 || { echo "error: curl is required" >&2; exit 1; }
command -v git >/dev/null 2>&1 || { echo "error: git is required: install it and run this again" >&2; exit 1; }

mkdir -p "$BIN"
curl -fsSL "$RAW/bin/tabi" -o "$BIN/tabi"
chmod +x "$BIN/tabi"
echo "==> Installed the tabi command in $BIN"

case ":$PATH:" in
  *":$BIN:"*) ;;
  *) echo "==> Add $BIN to your PATH to run 'tabi' from anywhere (for example: export PATH=\"$BIN:\$PATH\" in your shell profile)." ;;
esac

exec "$BIN/tabi" install
