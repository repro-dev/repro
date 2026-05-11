#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
exec pnpm --dir "$REPO_ROOT/packages/autobot-cli" exec tsx src/cli.ts autobot "$@"
