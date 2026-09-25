#!/bin/bash
#
# scripts/lib/herdr.sh — project-scoped Herdr command helpers
#
# Sourced by reproctl.sh and worktree.sh. Expects common.sh context when
# available; helpers also work with explicit checkout paths in tests.

REPROCTL_HERDR_LIBRARY_LOADED=true
HERDR_LIBRARY_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/herdr.sh"
export HERDR_LIBRARY_PATH

herdr_project_context_init() {
  local checkout="${1:-${REPO_ROOT:-$PWD}}"
  local main_checkout="${2:-${MAIN_CHECKOUT:-$checkout}}"
  local canonical_checkout canonical_main hash_output digest

  canonical_checkout="$(cd "$checkout" 2>/dev/null && pwd -P)" || {
    echo "Cannot resolve checkout path for Herdr: $checkout" >&2
    return 1
  }
  canonical_main="$(cd "$main_checkout" 2>/dev/null && pwd -P)" || {
    echo "Cannot resolve main checkout path for Herdr: $main_checkout" >&2
    return 1
  }
  hash_output="$(printf '%s' "$canonical_main" | shasum -a 256 2>/dev/null)" || {
    echo "Cannot calculate Herdr session identity for $canonical_main" >&2
    return 1
  }
  digest="${hash_output%% *}"
  if [[ ! "$digest" =~ ^[[:xdigit:]]{64}$ ]]; then
    echo "Cannot verify Herdr session identity for $canonical_main" >&2
    return 1
  fi

  HERDR_PROJECT_CHECKOUT_PATH="$canonical_checkout"
  HERDR_PROJECT_MAIN_CHECKOUT="$canonical_main"
  HERDR_PROJECT_CONFIG_PATH="$canonical_checkout/.herdr/config.toml"
  HERDR_PROJECT_SESSION_NAME="repro-${digest:0:24}"
  export HERDR_PROJECT_CHECKOUT_PATH HERDR_PROJECT_MAIN_CHECKOUT
  export HERDR_PROJECT_CONFIG_PATH HERDR_PROJECT_SESSION_NAME
}

herdr_project_cmd() {
  if [[ -z "${HERDR_PROJECT_SESSION_NAME:-}" || -z "${HERDR_PROJECT_CONFIG_PATH:-}" ]]; then
    herdr_project_context_init || return $?
  fi

  HERDR_CONFIG_PATH="$HERDR_PROJECT_CONFIG_PATH" \
    herdr --session "$HERDR_PROJECT_SESSION_NAME" "$@"
}

herdr_project_start_recovery_command() {
  if [[ -z "${HERDR_PROJECT_SESSION_NAME:-}" || -z "${HERDR_PROJECT_CONFIG_PATH:-}" ]]; then
    herdr_project_context_init || return $?
  fi

  printf 'HERDR_CONFIG_PATH=%q herdr --session %q server' \
    "$HERDR_PROJECT_CONFIG_PATH" "$HERDR_PROJECT_SESSION_NAME"
}

cmd_herdr_help() {
  cat <<'EOF'
Usage: reproctl herdr open

Open or reuse the current checkout in the repository's named Herdr session.
The project config is .herdr/config.toml; Herdr does not expose a supported
query for the config already loaded by a running server, so its active config
is reported as unverified. Existing sessions are never stopped or restarted.

If Herdr is missing, install it with 'brew install herdr'. If the named
daemon is unavailable, start it with the session-scoped command printed by
reproctl.
EOF
}

cmd_herdr() {
  local subcommand="${1:-}"
  case "$subcommand" in
    open)
      shift
      while [[ $# -gt 0 ]]; do
        case "$1" in
          -h|--help)
            cmd_herdr_help
            return 0
            ;;
          *)
            die "Unknown option for 'reproctl herdr open': $1\nRun 'reproctl herdr --help' for usage."
            ;;
        esac
      done

      local checkout label
      herdr_project_context_init "$REPO_ROOT" "$MAIN_CHECKOUT" || return $?
      checkout="$HERDR_PROJECT_CHECKOUT_PATH"
      label="$(basename "$checkout")"
      label="${label#repro-wt-}"
      if [[ ! -f "$HERDR_PROJECT_CONFIG_PATH" ]]; then
        echo "Project Herdr config not found: $HERDR_PROJECT_CONFIG_PATH" >&2
        return 1
      fi
      if ! _herdr_workspace_add_sibling "$checkout" "$label" "" true; then
        return 1
      fi
      if [[ -z "${HERDR_WORKSPACE_ID:-}" ]]; then
        echo "Could not open Herdr workspace for $checkout." >&2
        return 1
      fi
      echo "Herdr workspace ready: $checkout (${HERDR_WORKSPACE_ID})"
      echo "Project config selected: $HERDR_PROJECT_CONFIG_PATH"
      ;;
    -h|--help)
      cmd_herdr_help
      ;;
    "")
      cmd_herdr_help >&2
      return 1
      ;;
    *)
      die "Unknown Herdr subcommand: $subcommand\nRun 'reproctl herdr --help' for usage."
      ;;
  esac
}
