#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
# Silence Node's experimental sqlite warning for the POC launcher.
NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--disable-warning=ExperimentalWarning" \
exec pnpm --dir "$REPO_ROOT/packages/autobot-cli" run autobot-engine "$@"
