#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat >&2 <<EOF
Usage: deliver <issue-id>

  Creates an isolated worktree from a Linear issue, then opens an
  OpenCode session with /deliver-issue to run the delivery workflow.

  Example: deliver REP-123

EOF
  exit 1
}

issue_id="${1:-}"
if [[ -z "$issue_id" ]]; then
  usage
fi
if [[ ! "$issue_id" =~ ^[A-Z]+-[0-9]+$ ]]; then
  echo "Error: Invalid issue ID '$issue_id'. Expected format: REP-123" >&2
  exit 1
fi

"$SCRIPT_DIR/reproctl.sh" wt create --from-issue "$issue_id" --open

if ! herdr status &>/dev/null; then
  echo "herdr is not running — worktree created but no OpenCode session was opened." >&2
  echo "Start herdr and run the following in the new worktree:" >&2
  echo "  opencode run -i \"/deliver-issue $issue_id\"" >&2
  exit 1
fi

herdr_output="$(herdr workspace list 2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
for ws in data['result']['workspaces']:
    if ws.get('label') == '$issue_id':
        print(ws['workspace_id'])
        print(ws.get('worktree', {}).get('checkout_path', ''))
        break
" 2>/dev/null)"

workspace_id="$(printf '%s\n' "$herdr_output" | head -n1)"
worktree_path="$(printf '%s\n' "$herdr_output" | tail -n1)"

if [[ -z "$workspace_id" ]]; then
  echo "Error: Could not find herdr workspace for $issue_id after creation." >&2
  exit 1
fi

if [[ -z "$worktree_path" ]]; then
  echo "Error: Could not determine worktree path for $issue_id." >&2
  exit 1
fi

exec herdr agent start "opencode-${issue_id}" \
    --workspace "$workspace_id" \
    --focus \
    -- bash -c 'cd "$1" && REPRO_OPENCODE_PROFILE="$2" exec "$3" opencode --prompt "$4"' _ "$worktree_path" "${REPRO_OPENCODE_PROFILE:-deepseek-v4}" "$SCRIPT_DIR/reproctl.sh" "/deliver-issue $issue_id"
