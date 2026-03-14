#!/bin/bash

cmd_completion() {
  local shell="${1:-}"

  if [ "$shell" = "-h" ] || [ "$shell" = "--help" ] || [ -z "$shell" ]; then
    if [ -z "$shell" ] || [ "$shell" = "-h" ] || [ "$shell" = "--help" ]; then
      cat <<'EOF'
Generate shell completions for reproctl.

Usage: reproctl completion <shell>

Supported shells: bash, zsh, fish

Installation:
  Bash:  reproctl completion bash > ~/.local/share/bash-completion/completions/reproctl
  Zsh:   reproctl completion zsh > "${fpath[1]}/_reproctl" && compinit
  Fish:  reproctl completion fish > ~/.config/fish/completions/reproctl.fish

Or eval directly in your shell profile:
  Bash:  eval "$(reproctl completion bash)"
  Zsh:   eval "$(reproctl completion zsh)"
  Fish:  reproctl completion fish | source
EOF
      if [ "$shell" = "-h" ] || [ "$shell" = "--help" ]; then
        exit 0
      fi
      exit 1
    fi
  fi

  local completions_dir="$SCRIPT_DIR/completions"

  case "$shell" in
    bash)
      cat "$completions_dir/reproctl.bash"
      ;;
    zsh)
      cat "$completions_dir/_reproctl"
      ;;
    fish)
      cat "$completions_dir/reproctl.fish"
      ;;
    *)
      die "Unsupported shell: $shell\nSupported shells: bash, zsh, fish"
      ;;
  esac
}
