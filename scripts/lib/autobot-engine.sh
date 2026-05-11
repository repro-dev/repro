#!/bin/bash
set -euo pipefail

_autobot_engine_cli() {
  local script_dir repo_root
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_root="$(dirname "$(dirname "$script_dir")")"
  pnpm --dir "$repo_root/packages/autobot-cli" exec tsx src/cli.ts autobot-engine "$@"
}

cmd_autobot_engine_help() { _autobot_engine_cli --help; }
cmd_autobot_engine() { _autobot_engine_cli "$@"; }
