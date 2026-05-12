#!/bin/bash
set -euo pipefail

_autobot_cli() {
  local script_dir repo_root
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_root="$(dirname "$(dirname "$script_dir")")"
  # Silence Node's experimental sqlite warning for the POC launcher.
  REPROCTL_JSON="${REPROCTL_JSON:-false}" REPROCTL_QUIET="${REPROCTL_QUIET:-false}" \
  NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--disable-warning=ExperimentalWarning" \
  pnpm --dir "$repo_root/packages/autobot-cli" exec tsx src/cli.ts autobot "$@"
}

cmd_autobot_help() { _autobot_cli --help; }
cmd_autobot() { _autobot_cli "$@"; }
