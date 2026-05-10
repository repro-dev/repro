#!/bin/bash
# scripts/lib/tests/test_autobot_claim_id.sh
#
# Regression tests for claim identifier resolution.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
AUTOBOT_ORCH_SH="$TESTS_DIR/../autobot_orchestrator.sh"
WORKTREE_SH="$TESTS_DIR/../worktree.sh"
export TESTS_DIR AUTOBOT_ORCH_SH WORKTREE_SH tmpdir

tmpdir="$(mktemp -d 2>/dev/null || mktemp -d -t test_autobot_claim_id)"
trap 'rm -rf "$tmpdir"' EXIT

cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail
REPO_ROOT="$tmpdir/repro"
MAIN_CHECKOUT="$tmpdir/repro"
PARENT_DIR="$tmpdir"
WORKSPACE_ROOT="$tmpdir"
SCRIPTS_DIR="$TESTS_DIR/../.."
tmpdir="$tmpdir"
mkdir -p "$tmpdir/repro" "$tmpdir/tmp"
slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }
source "$WORKTREE_SH"
source "$AUTOBOT_ORCH_SH"

linear() {
  case "$1 $2 $3" in
    "issue show REP-1094")
      cat <<'JSON'
{"item":{"id":"issue-uuid-1"}}
JSON
      ;;
    *)
      return 1
      ;;
  esac
}

_linear_api() {
  case "$1" in
    *"viewer { id }"*)
      cat <<'JSON'
{"data":{"viewer":{"id":"viewer-1"}}}
JSON
      ;;
    *"assigneeId: \"viewer-1\""*)
      cat <<'JSON'
{"data":{"issueUpdate":{"issue":{"id":"issue-uuid-1","identifier":"REP-1094"}}}}
JSON
      ;;
    *)
      return 1
      ;;
  esac
}

workspace="$tmpdir/repro-wt-rep-1094"
mkdir -p "$workspace"
REPRO_AUTOBOT_DB="$tmpdir/state.sqlite" cmd_autobot_orchestrator claim REP-1094 --workspace "$workspace" --phase observe --issue-state In-Progress
python3 - "$tmpdir/state.sqlite" <<'PY'
import sqlite3
import sys

db_path = sys.argv[1]
with sqlite3.connect(db_path) as conn:
    row = conn.execute('SELECT issue_id FROM claims WHERE issue_identifier = ?', ('REP-1094',)).fetchone()
    assert row == ('issue-uuid-1',), row
PY
RUNNER

chmod +x "$tmpdir/run_test.sh"
output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
if [ "${rc:-0}" -eq 0 ] && printf '%s\n' "$output" | grep -q 'claimed REP-1094'; then
  printf '  ✔ %s\n' 'claim resolves Linear UUID internally'
  exit 0
fi

printf '  ✖ %s\n  %s\n' 'claim resolves Linear UUID internally' "rc=${rc:-0}; output=$output" >&2
exit 1
