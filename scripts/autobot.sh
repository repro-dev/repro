#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=scripts/lib/worktree.sh
source "$SCRIPT_DIR/lib/worktree.sh"
# shellcheck source=scripts/lib/opencode.sh
source "$SCRIPT_DIR/lib/opencode.sh"
# shellcheck source=scripts/lib/autobot_orchestrator.sh
source "$SCRIPT_DIR/lib/autobot_orchestrator.sh"
# shellcheck source=scripts/lib/autobot.sh
source "$SCRIPT_DIR/lib/autobot.sh"

REPROCTL_JSON=false
REPROCTL_QUIET=false
REPROCTL_DEBUG="${REPROCTL_DEBUG:-false}"
if [ "$REPROCTL_DEBUG" = "1" ] || [ "$REPROCTL_DEBUG" = "true" ]; then
  REPROCTL_DEBUG=true
else
  REPROCTL_DEBUG=false
fi

_args=()
for _a in "$@"; do
  case "$_a" in
    --json) REPROCTL_JSON=true ;;
    --quiet) REPROCTL_QUIET=true ;;
    --verbose) REPROCTL_DEBUG=true ;;
    *) _args+=("$_a") ;;
  esac
done
set -- ${_args[@]+"${_args[@]}"}
unset _args _a

cmd_autobot "$@"
