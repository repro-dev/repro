#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage_text() {
  cat >&2 <<EOF
Usage: deliver [--profile <name> | --pick] [--help] <issue-id>

  Creates an isolated worktree from a Linear issue, then opens an
  OpenCode session with /deliver-issue to run the delivery workflow.

  Flags:
    --profile <name>  Use the specified OpenCode profile
    --pick            Interactive profile picker
    --help, -h        Show this help message

  Examples:
    deliver REP-123
    deliver --profile beta REP-123
    deliver REP-123 --pick

EOF
}

usage() {
  usage_text
  exit 1
}

# Parse flags and issue ID (flags accepted before OR after issue ID)
profile=""
pick=false
issue_id=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) usage_text; exit 0 ;;
    --profile)
      shift
      if [[ $# -eq 0 ]]; then
        echo "Error: --profile requires a value" >&2
        exit 1
      fi
      profile="$1"
      ;;
    --pick)
      pick=true
      ;;
    *)
      if [[ -z "$issue_id" ]]; then
        issue_id="$1"
      else
        echo "Error: Unexpected argument '$1'" >&2
        exit 1
      fi
      ;;
  esac
  shift
done

if [[ -z "$issue_id" ]]; then
  usage
fi

if [[ ! "$issue_id" =~ ^[A-Z]+-[0-9]+$ ]]; then
  echo "Error: Invalid issue ID '$issue_id'. Expected format: REP-123" >&2
  exit 1
fi

# Validate mutual exclusivity
if [[ -n "$profile" && "$pick" == true ]]; then
  echo "Error: --profile and --pick are mutually exclusive" >&2
  exit 1
fi

# Validate profile existence
if [[ -n "$profile" ]]; then
  REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  profile_file="$REPO_ROOT/.opencode/profiles/${profile}.json"
  if [[ ! -f "$profile_file" ]]; then
    echo "Error: Profile '$profile' not found at $profile_file" >&2
    echo "Available profiles:" >&2
    ls "$REPO_ROOT/.opencode/profiles/"*.json 2>/dev/null \
      | sed 's/.*\///; s/\.json$//' \
      | sed 's/^/  - /' >&2 || true
    exit 1
  fi
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

if [[ -n "$profile" ]]; then
  exec herdr agent start "opencode-${issue_id}" \
      --workspace "$workspace_id" \
      --focus \
      -- bash -c 'cd "$1" && exec "$2" opencode --profile "$3" --prompt "$4"' _ "$worktree_path" "$SCRIPT_DIR/reproctl.sh" "$profile" "/deliver-issue $issue_id"
elif [[ "$pick" == true ]]; then
  exec herdr agent start "opencode-${issue_id}" \
      --workspace "$workspace_id" \
      --focus \
      -- bash -c 'cd "$1" && exec "$2" opencode --pick --prompt "$3"' _ "$worktree_path" "$SCRIPT_DIR/reproctl.sh" "/deliver-issue $issue_id"
else
  exec herdr agent start "opencode-${issue_id}" \
      --workspace "$workspace_id" \
      --focus \
      -- bash -c 'cd "$1" && REPRO_OPENCODE_PROFILE="$2" exec "$3" opencode --prompt "$4"' _ "$worktree_path" "${REPRO_OPENCODE_PROFILE:-deepseek-v4}" "$SCRIPT_DIR/reproctl.sh" "/deliver-issue $issue_id"
fi
