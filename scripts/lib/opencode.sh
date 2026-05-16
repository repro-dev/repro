#!/bin/bash
#
# scripts/lib/opencode.sh — opencode launcher with optional profile and caffeinate wrapper
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh to be loaded
# first (provides REPO_ROOT, die, CLR_BOLD, CLR_RESET).

_opencode_usage() {
  cat <<EOF
Usage: reproctl opencode [--profile <name>] [opencode-args...]

Launch OpenCode, optionally with a model profile that layers on top of the
tracked project config in .opencode/opencode.json and overrides agent model
assignments without modifying the agent definition files.

When no explicit --profile is supplied, REPRO_OPENCODE_PROFILE can select a
non-interactive default profile before the fzf picker is considered.

${CLR_BOLD}OPTIONS${CLR_RESET}
  --profile <name>    Load .opencode/profiles/<name>.json as OPENCODE_CONFIG.
                      Without this flag, REPRO_OPENCODE_PROFILE may provide a
                      non-interactive default profile; otherwise an fzf picker
                      lets you choose from available profiles in
                      .opencode/profiles/.
  -h, --help          Show this help.

${CLR_BOLD}EXAMPLES${CLR_RESET}
  reproctl opencode
      OpenCode uses REPRO_OPENCODE_PROFILE when set; otherwise it opens an
      fzf picker to select a profile before launch.

  reproctl opencode --profile openrouter-glm5-minimax
      Launch OpenCode remapped to GLM-5.1 and MiniMax M2.7 via OpenRouter.

  reproctl opencode --profile github-copilot-sonnet run "do the thing"
      Launch OpenCode with the GitHub Copilot Sonnet profile and pass a run command.

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

  # No --profile given: select one interactively via fzf.
  if [[ -z "$profile" ]]; then
    # Collect available profiles (Bash 3.2 safe: no mapfile/readarray).
    local profiles=()
    local pfile
    for pfile in "$REPO_ROOT/.opencode/profiles/"*.json; do
      [[ -f "$pfile" ]] || continue
      profiles+=("$(basename "$pfile" .json)")
    done

    if [[ ${#profiles[@]} -eq 0 ]]; then
      die "No profiles found in $REPO_ROOT/.opencode/profiles/\nCreate a .json profile file or pass --profile <name> to skip the picker."
    fi

    if [[ -n "${REPRO_OPENCODE_PROFILE:-}" ]]; then
      profile="$REPRO_OPENCODE_PROFILE"
    elif [[ ${#profiles[@]} -gt 1 ]] && ! command -v fzf > /dev/null 2>&1; then
      die "No --profile flag given and fzf is not installed.\nInstall fzf to enable the interactive profile picker: brew install fzf\nOr pass --profile <name> to skip the picker."
    else
      # _pick auto-selects without fzf when there is exactly one profile.
      profile="$(_pick "Select a profile" "${profiles[@]}")" || exit $?
    fi
  fi

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
    exec caffeinate -i opencode "$@"
  else
    exec opencode "$@"
  fi
}
