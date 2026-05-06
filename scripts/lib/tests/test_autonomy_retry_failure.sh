#!/bin/bash
# scripts/lib/tests/test_autonomy_retry_failure.sh
#
# Regression tests for retry failure visibility.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
AUTONOMY_SH="$TESTS_DIR/../autonomy.sh"
WORKTREE_SH="$TESTS_DIR/../worktree.sh"
export TESTS_DIR AUTONOMY_SH WORKTREE_SH tmpdir

PASS=0
FAIL=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); }

tmpdir="$(mktemp -d 2>/dev/null || mktemp -d -t test_autonomy_retry_failure)"
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
source "$AUTONOMY_SH"

die() { printf 'Error: %b\n' "$*" >&2; return 1; }
_step() { :; }
_ok() { :; }
_err() { printf 'x %s\n' "$1" >&2; }
_warn() { :; }
eval "$(declare -f cmd_autonomy | sed '1s/cmd_autonomy/original_cmd_autonomy/')"
cmd_autonomy() {
  if [[ "${1:-}" == prepare ]]; then
    return 1
  fi
  original_cmd_autonomy "$@"
}

linear() {
  case "$1 $2 $3" in
    "issue show REP-1095")
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
    *"issues(filter:"*)
      cat <<'JSON'
{"data":{"issues":{"nodes":[{"id":"issue-uuid-1","identifier":"REP-1095","title":"Retry failure visibility","branchName":"gary/rep-1095-retry-failure","state":{"name":"In Progress","type":"started"},"team":{"states":{"nodes":[{"id":"todo-state-id","name":"Todo","type":"todo"},{"id":"in-progress-state-id","name":"In Progress","type":"started"}]}}}]}}}
JSON
      ;;
    *"stateId:"*)
      cat <<'JSON'
{"data":{"issueUpdate":{"issue":{"id":"issue-uuid-1","identifier":"REP-1095"}}}}
JSON
      ;;
    *)
      return 1
      ;;
  esac
}

cmd_wt_create() { return 1; }

python3 - "$tmpdir/state.sqlite" <<'PY'
import sqlite3
import os
import sys

db_path = sys.argv[1]
now = '2026-05-06T19:00:00Z'
workspace = os.path.join(os.environ['tmpdir'], 'workspace')
with sqlite3.connect(db_path) as conn:
    conn.executescript(
        '''
        CREATE TABLE claims (
            issue_id TEXT NOT NULL,
            issue_identifier TEXT PRIMARY KEY,
            claim_state TEXT NOT NULL,
            workspace_path TEXT NOT NULL,
            phase TEXT NOT NULL,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            retry_state TEXT,
            retry_after TEXT,
            retry_reason TEXT,
            last_observed_issue_state_name TEXT,
            last_observed_issue_state_type TEXT,
            claimed_by TEXT,
            claimed_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            released_at TEXT,
            linear_assignment_owned INTEGER NOT NULL DEFAULT 0,
            linear_state_sync_error TEXT,
            linear_assignment_sync_error TEXT,
            linear_sync_error TEXT,
            canceled_at TEXT,
            last_error TEXT,
            last_error_at TEXT,
            linear_synced_at TEXT
        );
        CREATE TABLE runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            issue_identifier TEXT NOT NULL,
            attempt INTEGER NOT NULL,
            phase TEXT NOT NULL,
            state TEXT NOT NULL,
            workspace_path TEXT NOT NULL,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            last_error TEXT
        );
        '''
    )
    conn.execute(
        '''
        INSERT INTO claims (
            issue_id, issue_identifier, claim_state, workspace_path, phase,
            attempt_count, retry_state, retry_after, retry_reason,
            last_observed_issue_state_name, last_observed_issue_state_type,
            claimed_by, claimed_at, updated_at, released_at,
            linear_assignment_owned, linear_state_sync_error,
            linear_assignment_sync_error, linear_sync_error,
            canceled_at, last_error, last_error_at, linear_synced_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
        '''
        ,(
            'issue-uuid-1',
            'REP-1095',
            'canceled',
            workspace,
            'observe',
            0,
            'canceled',
            None,
            'manual stop',
            'In Progress',
            'started',
            'autopilot',
            now,
            now,
        ),
    )
    conn.commit()
PY

REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" REPRO_ISSUE_WORKTREE_SUFFIX=fail1 cmd_autonomy retry REP-1095 --phase observe --claimed-by autopilot
RUNNER

chmod +x "$tmpdir/run_test.sh"
output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?

if [ "${rc:-0}" -ne 0 ] && python3 - "$tmpdir/state.sqlite" <<'PY'
import sqlite3
import sys

db_path = sys.argv[1]
with sqlite3.connect(db_path) as conn:
    row = conn.execute(
        'SELECT claim_state, linear_sync_error FROM claims WHERE issue_identifier = ?',
        ('REP-1095',),
    ).fetchone()

assert row == ('released', 'failed to prepare retry workspace'), row
PY
then
  _pass 'cmd_autonomy retry records prepare failure visibility'
else
  _fail 'cmd_autonomy retry records prepare failure visibility' "rc=${rc:-0}; output=$output"
fi
