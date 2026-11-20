# tabi shell: prompt, autocompletion, smart cd and shortcuts for zsh and bash.
# Loaded from ~/.zshrc or ~/.bashrc by `tabi shell`, which sets TABI_SHELL_DIR to this folder.
# Edit this file (not your rc) and run `tabi update` to share changes. Everything is skipped
# when the tool is not installed, so a missing package never breaks the shell.

# Interactive shells only.
case $- in *i*) ;; *) return 0 ;; esac

if [ -n "${ZSH_VERSION:-}" ]; then __tabi_sh=zsh; else __tabi_sh=bash; fi

# Prompt: the same Starship look as the other machines. A starship.toml of your own wins.
if command -v starship >/dev/null 2>&1; then
  [ -f "$HOME/.config/starship.toml" ] || export STARSHIP_CONFIG="${TABI_SHELL_DIR:-}/starship.toml"
  eval "$(starship init "$__tabi_sh")"
fi

# Smart cd: `z her` jumps to the folder you visit most that matches "her".
if command -v zoxide >/dev/null 2>&1; then
  eval "$(zoxide init "$__tabi_sh")"
fi

# Fuzzy finder: Ctrl+R searches history, Ctrl+T picks a file (fzf 0.48 or newer).
if command -v fzf >/dev/null 2>&1; then
  eval "$(fzf "--$__tabi_sh" 2>/dev/null)"
fi

# Shortcuts: ls and ll through eza, cat through bat.
if command -v eza >/dev/null 2>&1; then
  alias ls='eza --icons --git'
  alias ll='eza -la --icons --git'
fi
if command -v bat >/dev/null 2>&1; then
  alias cat='bat --paging=never'
fi

# zsh only: a gray suggestion from your history (Right arrow accepts it), then syntax highlighting,
# which has to be loaded last. Looks in the Homebrew prefixes and the distribution folders.
if [ "$__tabi_sh" = zsh ]; then
  for __tabi_f in \
    /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh \
    /usr/local/share/zsh-autosuggestions/zsh-autosuggestions.zsh \
    /home/linuxbrew/.linuxbrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh \
    /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh; do
    [ -f "$__tabi_f" ] && . "$__tabi_f" && break
  done
  for __tabi_f in \
    /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh \
    /usr/local/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh \
    /home/linuxbrew/.linuxbrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh \
    /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh; do
    [ -f "$__tabi_f" ] && . "$__tabi_f" && break
  done
fi

unset __tabi_sh __tabi_f
