#!/bin/bash
#
# scripts/lib/opencode.sh — opencode launcher with optional profile and caffeinate wrapper
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh to be loaded
# first (provides REPO_ROOT, die, CLR_BOLD, CLR_RESET).

_opencode_usage() {
  cat <<EOF
Usage: reproctl opencode [--profile <name>] [opencode-args...]

Launch OpenCode, optionally with a model profile that overrides agent
model assignments without modifying the agent definition files.

${CLR_BOLD}OPTIONS${CLR_RESET}
  --profile <name>    Load .opencode/profiles/<name>.json as OPENCODE_CONFIG.
                      Without this flag, OpenCode is launched with no profile
                      override (uses each agent's own hardcoded model).
  -h, --help          Show this help.

${CLR_BOLD}EXAMPLES${CLR_RESET}
  reproctl opencode
      Launch OpenCode with default agent models.

  reproctl opencode --profile openrouter
      Launch OpenCode remapped to OpenRouter models.

  reproctl opencode --profile default run "do the thing"
      Launch OpenCode with the default profile and pass a run command.

${CLR_BOLD}PROFILES${CLR_RESET}
  Profile files live at .opencode/profiles/<name>.json and are committed.
  Run 'reproctl help opencode' for the full manual.
EOF
}

cmd_opencode() {
  local profile=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --profile)
        [[ -n "${2:-}" ]] || die "Missing value for --profile\nRun 'reproctl opencode --help' for usage."
        profile="$2"
        shift 2
        ;;
      -h|--help)
        _opencode_usage
        return 0
        ;;
      *)
        break
        ;;
    esac
  done

  if [[ -n "$profile" ]]; then
    local profile_path="$REPO_ROOT/.opencode/profiles/${profile}.json"
    if [[ ! -f "$profile_path" ]]; then
      # List available profiles for the error message (Bash 3.2 safe)
      local available=""
      local pfile
      for pfile in "$REPO_ROOT/.opencode/profiles/"*.json; do
        [[ -f "$pfile" ]] || continue
        local pname
        pname="$(basename "$pfile" .json)"
        if [[ -z "$available" ]]; then
          available="$pname"
        else
          available="$available, $pname"
        fi
      done
      die "Profile not found: $profile\nExpected: $profile_path\nAvailable profiles: ${available:-none}"
    fi
    export OPENCODE_CONFIG="$profile_path"
  fi

  if [[ "$(uname)" == "Darwin" ]]; then
    exec caffeinate -dims opencode "$@"
  else
    exec opencode "$@"
  fi
}
