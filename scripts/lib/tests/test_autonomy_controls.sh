#!/bin/bash
# scripts/lib/tests/test_autonomy_controls.sh
#
# Regression tests for autonomy control commands.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
AUTONOMY_SH="$TESTS_DIR/../autonomy.sh"
WORKTREE_SH="$TESTS_DIR/../worktree.sh"

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

_make_tmpdir() {
  mktemp -d 2>/dev/null || mktemp -d -t test_autonomy_controls
}

_write_runner() {
  local tmpdir="$1"
  local extra="${2:-}"

  cat > "$tmpdir/run_test.sh" << RUNNER
#!/bin/bash
set -euo pipefail
die() { printf 'Error: %b\n' "\$*" >&2; exit 1; }
_err() { printf '✖ %s\n' "\$*" >&2; }
_ok() { printf '✔ %s\n' "\$*" >&2; }
_step() { :; }
_warn() { :; }
CLR_BOLD="" CLR_DIM="" CLR_RED="" CLR_GREEN="" CLR_YELLOW="" CLR_RESET=""
REPO_ROOT="$tmpdir/repro"
MAIN_CHECKOUT="$tmpdir/repro"
PARENT_DIR="$tmpdir"
WORKSPACE_ROOT="$tmpdir"
SCRIPTS_DIR="$TESTS_DIR/../.."
TMP_DIR="$tmpdir/tmp"
tmpdir="$tmpdir"
mkdir -p "$tmpdir/repro" "$tmpdir/tmp"
slugify() { printf '%s\n' "\$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "\${WORKSPACE_ROOT:-\$PARENT_DIR}/repro-wt-\$1"; }
source "$WORKTREE_SH"
source "$AUTONOMY_SH"
$extra
RUNNER
  chmod +x "$tmpdir/run_test.sh"
}

test_cancel_emits_json_and_records_linear_sync() {
  local tmpdir stdout_file stderr_file rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
issue_workspace="$tmpdir/existing"
mkdir -p "$issue_workspace"
now="2026-05-06T19:00:00Z"
python3 - "$tmpdir/state.sqlite" "$issue_workspace" "$now" <<'PY'
import sqlite3
import sys

db_path, workspace_path, now = sys.argv[1:4]
with sqlite3.connect(db_path) as conn:
    conn.executescript(
        """
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
            released_at TEXT
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
        """
    )
    conn.execute(
        """
        INSERT INTO claims (
            issue_id, issue_identifier, claim_state, workspace_path, phase,
            attempt_count, retry_state, retry_after, retry_reason,
            last_observed_issue_state_name, last_observed_issue_state_type,
            claimed_by, claimed_at, updated_at, released_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        """,
        (
            "issue-uuid-1",
            "REP-1095",
            "claimed",
            workspace_path,
            "observe",
            0,
            None,
            None,
            None,
            "In Progress",
            "started",
            "autopilot",
            now,
            now,
        ),
    )
    conn.commit()
PY

_linear_api() {
  case "$1" in
    *"issues(filter:"*)
      cat <<'JSON'
{"data":{"issues":{"nodes":[{"id":"issue-uuid-1","identifier":"REP-1095","state":{"name":"In Progress","type":"started"},"team":{"states":{"nodes":[{"id":"todo-state-id","name":"Todo","type":"todo"},{"id":"in-progress-state-id","name":"In Progress","type":"started"}]}}}]}}}
JSON
      ;;
    *)
      cat <<'JSON'
{"data":{"issueUpdate":{"issue":{"id":"issue-uuid-1","identifier":"REP-1095"}}}}
JSON
      ;;
  esac
}

REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" REPROCTL_JSON=true cmd_autonomy cancel REP-1095 --reason "manual stop"
'
  stdout_file="$tmpdir/stdout.json"
  stderr_file="$tmpdir/stderr.txt"
  bash "$tmpdir/run_test.sh" >"$stdout_file" 2>"$stderr_file" || rc=$?

  if [ $rc -eq 0 ] && python3 - "$stdout_file" "$tmpdir/state.sqlite" <<'PY'
import json
import sqlite3
import sys

stdout_file, db_path = sys.argv[1:3]
payload = json.loads(open(stdout_file, encoding='utf-8').read())
assert payload['claim']['issue_identifier'] == 'REP-1095', payload
assert payload['claim']['claim_state'] == 'canceled', payload

with sqlite3.connect(db_path) as conn:
    row = conn.execute(
        'SELECT claim_state, linear_synced_at, linear_sync_error FROM claims WHERE issue_identifier = ?',
        ('REP-1095',),
    ).fetchone()

assert row[0] == 'canceled', row
assert row[1], row
assert row[2] is None, row
PY
  then
    rm -rf "$tmpdir"
    _pass 'cmd_autonomy cancel emits JSON and records Linear sync'
  else
    output="$(cat "$stderr_file" 2>/dev/null)"
    rm -rf "$tmpdir"
    _fail 'cmd_autonomy cancel emits JSON and records Linear sync' "rc=$rc; output=$output"
  fi
}

test_retry_rejects_active_claims() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
now="2026-05-06T19:00:00Z"
python3 - "$tmpdir/state.sqlite" "$now" <<'PY'
import sqlite3
import sys

db_path, now = sys.argv[1:3]
with sqlite3.connect(db_path) as conn:
    conn.executescript(
        """
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
            released_at TEXT
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
        """
    )
    conn.execute(
        """
        INSERT INTO claims (
            issue_id, issue_identifier, claim_state, workspace_path, phase,
            attempt_count, retry_state, retry_after, retry_reason,
            last_observed_issue_state_name, last_observed_issue_state_type,
            claimed_by, claimed_at, updated_at, released_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        """,
        (
            "issue-uuid-1",
            "REP-1095",
            "claimed",
            "$tmpdir/workspace",
            "observe",
            0,
            None,
            None,
            None,
            "In Progress",
            "started",
            "autopilot",
            now,
            now,
        ),
    )
    conn.commit()
PY

_linear_api() {
  case "$1" in
    *"issues(filter:"*)
      cat <<'JSON'
{"data":{"issues":{"nodes":[{"id":"issue-uuid-1","identifier":"REP-1095","state":{"name":"In Progress","type":"started"},"team":{"states":{"nodes":[{"id":"todo-state-id","name":"Todo","type":"todo"},{"id":"in-progress-state-id","name":"In Progress","type":"started"}]}}}]}}}
JSON
      ;;
    *)
      cat <<'JSON'
{"data":{"issueUpdate":{"issue":{"id":"issue-uuid-1","identifier":"REP-1095"}}}}
JSON
      ;;
  esac
}

REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" cmd_autonomy retry REP-1095 --phase observe --claimed-by autopilot
'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -qi 'claim is not retryable'; then
    _pass 'cmd_autonomy retry rejects active claims'
  else
    _fail 'cmd_autonomy retry rejects active claims' "rc=$rc; output=$output"
  fi
}

test_retry_rehydrates_released_claim_through_prepare_path() {
  local tmpdir stdout_file stderr_file rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
PATH="$tmpdir/fake-bin:$PATH"
mkdir -p "$tmpdir/fake-bin" "$tmpdir/workspaces"
printf "#!/bin/bash\nexit 0\n" > "$tmpdir/fake-bin/pnpm"
printf "#!/bin/bash\nexit 0\n" > "$tmpdir/fake-bin/moon"
chmod +x "$tmpdir/fake-bin/pnpm" "$tmpdir/fake-bin/moon"

git init --bare "$tmpdir/origin.git" >/dev/null 2>&1
git clone "$tmpdir/origin.git" "$tmpdir/repro" >/dev/null 2>&1
git -C "$tmpdir/repro" config user.email "test@test.com"
git -C "$tmpdir/repro" config user.name "Test"
git -C "$tmpdir/repro" switch -c main >/dev/null 2>&1
printf "init\n" > "$tmpdir/repro/README.md"
git -C "$tmpdir/repro" add README.md
git -C "$tmpdir/repro" commit -m "init" >/dev/null 2>&1
git -C "$tmpdir/repro" push -u origin main >/dev/null 2>&1
issue_branch="rep-1095-retry-workspace"
git -C "$tmpdir/repro" branch "$issue_branch"
git -C "$tmpdir/repro" push origin "$issue_branch" >/dev/null 2>&1

now="2026-05-06T19:00:00Z"
python3 - "$tmpdir/state.sqlite" "$tmpdir/workspaces/old" "$now" <<'PY'
import sqlite3
import sys
from pathlib import Path

db_path, workspace_path, now = sys.argv[1:4]
workspace_path = str(Path(workspace_path).resolve(strict=False))
with sqlite3.connect(db_path) as conn:
    conn.executescript(
        """
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
            released_at TEXT
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
        """
    )
    conn.execute(
        """
        INSERT INTO claims (
            issue_id, issue_identifier, claim_state, workspace_path, phase,
            attempt_count, retry_state, retry_after, retry_reason,
            last_observed_issue_state_name, last_observed_issue_state_type,
            claimed_by, claimed_at, updated_at, released_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
        """,
        (
            "issue-uuid-1",
            "REP-1095",
            "canceled",
            workspace_path,
            "observe",
            0,
            "canceled",
            None,
            "manual stop",
            "In Progress",
            "started",
            "autopilot",
            now,
            now,
        ),
    )
    conn.commit()
PY

_linear_api() {
  case "$1" in
    *"issues(filter:"*)
      cat <<'JSON'
{"data":{"issues":{"nodes":[{"id":"issue-uuid-1","identifier":"REP-1095","title":"Retry workspace","branchName":"rep-1095-retry-workspace","state":{"name":"Todo","type":"todo"},"team":{"states":{"nodes":[{"id":"todo-state-id","name":"Todo","type":"todo"},{"id":"in-progress-state-id","name":"In Progress","type":"started"}]}}}]}}}
JSON
      ;;
    *)
      cat <<'JSON'
{"data":{"issueUpdate":{"issue":{"id":"issue-uuid-1","identifier":"REP-1095"}}}}
JSON
      ;;
  esac
}

_resolve_issue_worktree_names() {
  printf "%s\n%s\n" "${issue_branch}-fresh1" "rep-1095-fresh1"
}

cmd_wt_create() {
  mkdir -p "$WT_ISSUE_WORKTREE_PATH"
}

REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" REPRO_ISSUE_WORKTREE_SUFFIX=fresh1 REPROCTL_JSON=true cmd_autonomy retry REP-1095 --phase observe --claimed-by autopilot
'
  stdout_file="$tmpdir/stdout.json"
  stderr_file="$tmpdir/stderr.txt"
  bash "$tmpdir/run_test.sh" >"$stdout_file" 2>"$stderr_file" || rc=$?

  if [ $rc -eq 0 ] && python3 - "$stdout_file" "$tmpdir/state.sqlite" <<'PY'
import json
import sqlite3
import sys
from pathlib import Path

stdout_file, db_path = sys.argv[1:3]
payload = json.loads(Path(stdout_file).read_text())
assert payload['prepare']['issue_identifier'] == 'REP-1095', payload
assert payload['prepare']['workspace_path'].endswith('/repro-wt-rep-1095-fresh1'), payload

with sqlite3.connect(db_path) as conn:
    row = conn.execute(
        'SELECT claim_state, workspace_path, retry_reason FROM claims WHERE issue_identifier = ?',
        ('REP-1095',),
    ).fetchone()

assert row[0] == 'claimed', row
assert row[1].endswith('/repro-wt-rep-1095-fresh1'), row
assert row[2] is None, row
PY
  then
    rm -rf "$tmpdir"
    _pass 'cmd_autonomy retry rehydrates a released claim through prepare'
  else
    output="$(cat "$stderr_file" 2>/dev/null)"
    rm -rf "$tmpdir"
    _fail 'cmd_autonomy retry rehydrates a released claim through prepare' "rc=$rc; output=$output"
  fi
}

test_cancel_emits_json_and_records_linear_sync
test_retry_rejects_active_claims
test_retry_rehydrates_released_claim_through_prepare_path

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  printf '%d test(s) FAILED\n' "$FAIL" >&2
  exit 1
fi
