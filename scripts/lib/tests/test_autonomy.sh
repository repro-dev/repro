#!/bin/bash
# scripts/lib/tests/test_autonomy.sh
#
# Regression tests for autonomy orchestration state and shell wrapper.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
AUTONOMY_SH="$TESTS_DIR/../autonomy.sh"
WORKTREE_SH="$TESTS_DIR/../worktree.sh"
PY_HELPER="$TESTS_DIR/../py/autonomy_state.py"

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

_make_tmpdir() {
  mktemp -d 2>/dev/null || mktemp -d -t test_autonomy
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

test_help_exists() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" 'cmd_autonomy_help'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -qi 'Usage: reproctl autonomy' && printf '%s\n' "$output" | grep -q 'prepare' && ! printf '%s\n' "$output" | grep -q -- '--issue-id'; then
    _pass 'cmd_autonomy_help exists and prints usage'
  else
    _fail 'cmd_autonomy_help exists and prints usage' "rc=$rc; output=$output"
  fi
}

test_status_json() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" 'REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" REPROCTL_JSON=true cmd_autonomy status --json'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q '"items"'; then
    _pass 'cmd_autonomy status --json emits JSON'
  else
    _fail 'cmd_autonomy status --json emits JSON' "rc=$rc; output=$output"
  fi
}

test_duplicate_claim_fails() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
linear() {
  case "$1 $2 $3" in
    "issue show REP-1094")
      cat <<'"'"'JSON'"'"'
{"item":{"id":"issue-uuid-1"}}
JSON
      ;;
    *)
      return 1
      ;;
  esac
}
workspace="$tmpdir/repro-wt-rep-1094"
mkdir -p "$workspace"
REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" cmd_autonomy claim REP-1094 --workspace "$workspace" --phase observe --issue-state In-Progress
REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" cmd_autonomy claim REP-1094 --workspace "$workspace" --phase observe --issue-state In-Progress
'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -qi 'existing claim'; then
    _pass 'duplicate claim through Bash wrapper is rejected'
  else
    _fail 'duplicate claim through Bash wrapper is rejected' "rc=$rc; output=$output"
  fi
}

test_claim_resolves_linear_issue_id() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
linear() {
  case "$1 $2 $3" in
    "issue show REP-1094")
      cat <<'"'"'JSON'"'"'
{"item":{"id":"issue-uuid-1"}}
JSON
      ;;
    *)
      return 1
      ;;
  esac
}
workspace="$tmpdir/repro-wt-rep-1094"
mkdir -p "$workspace"
REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" cmd_autonomy claim REP-1094 --workspace "$workspace" --phase observe --issue-state In-Progress
python3 - <<'PY' "$tmpdir/state.sqlite"
import sqlite3
import sys

db_path = sys.argv[1]
with sqlite3.connect(db_path) as conn:
    row = conn.execute("SELECT issue_id FROM claims WHERE issue_identifier = ?", ("REP-1094",)).fetchone()
    assert row is not None
    assert row[0] == "issue-uuid-1"
PY
'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'claimed REP-1094'; then
    _pass 'claim resolves Linear UUID internally'
  else
    _fail 'claim resolves Linear UUID internally' "rc=$rc; output=$output"
  fi
}

test_prepare_records_workspace_path() {
  local tmpdir output rc=0
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
issue_branch="rep-1095-prepare-isolated-workspaces"
git -C "$tmpdir/repro" branch "$issue_branch"
git -C "$tmpdir/repro" push origin "$issue_branch" >/dev/null 2>&1

WORKSPACE_ROOT="$tmpdir/workspaces"
_linear_api() {
  case "$1" in
    *"issues(filter:"*)
      cat <<'JSON'
{"data":{"issues":{"nodes":[{"id":"issue-uuid-1","identifier":"REP-1095","title":"Prepare isolated workspaces","branchName":"rep-1095-prepare-isolated-workspaces","state":{"name":"In Progress","type":"started"},"team":{"states":{"nodes":[{"id":"state-in-progress","name":"In Progress","type":"started"}]}}}]}}}
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

REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" REPRO_ISSUE_WORKTREE_SUFFIX=fresh1 cmd_autonomy prepare REP-1095 --phase observe --claimed-by autopilot

python3 - <<'PY' "$tmpdir/state.sqlite" "$tmpdir/workspaces/repro-wt-rep-1095-fresh1"
import sqlite3
import sys
from pathlib import Path

db_path, workspace_path = sys.argv[1], sys.argv[2]
workspace_path = str(Path(workspace_path).resolve(strict=False))
with sqlite3.connect(db_path) as conn:
    row = conn.execute(
        "SELECT workspace_path, phase, claim_state FROM claims WHERE issue_identifier = ?",
        ("REP-1095",),
    ).fetchone()
    assert row is not None, "missing claim row"
    assert row[0] == workspace_path, (row[0], workspace_path)
    assert row[1] == "observe", row[1]
    assert row[2] == "claimed", row[2]
PY
'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'Prepared workspace for REP-1095' && printf '%s\n' "$output" | grep -q "$tmpdir/workspaces/repro-wt-rep-1095-fresh1"; then
    _pass 'cmd_autonomy prepare records durable workspace path'
  else
    _fail 'cmd_autonomy prepare records durable workspace path' "rc=$rc; output=$output"
  fi
}

test_prepare_rejects_duplicate_active_claim_before_create() {
  local tmpdir output rc=0
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
issue_branch="rep-1095-prepare-isolated-workspaces"
git -C "$tmpdir/repro" branch "$issue_branch"
git -C "$tmpdir/repro" push origin "$issue_branch" >/dev/null 2>&1

WORKSPACE_ROOT="$tmpdir/workspaces"
REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" cmd_autonomy status --json >/dev/null
python3 - <<'PY' "$tmpdir/state.sqlite" "$tmpdir/workspaces/existing"
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

db_path, workspace_path = sys.argv[1], sys.argv[2]
workspace_path = str(Path(workspace_path).resolve(strict=False))
now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
with sqlite3.connect(db_path) as conn:
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
{"data":{"issues":{"nodes":[{"id":"issue-uuid-1","identifier":"REP-1095","title":"Prepare isolated workspaces","branchName":"rep-1095-prepare-isolated-workspaces","state":{"name":"In Progress","type":"started"},"team":{"states":{"nodes":[{"id":"state-in-progress","name":"In Progress","type":"started"}]}}}]}}}
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
  touch "$tmpdir/workspaces/should-not-be-created"
}

REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" REPRO_ISSUE_WORKTREE_SUFFIX=fresh1 cmd_autonomy prepare REP-1095 --phase observe --claimed-by autopilot
'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -qi 'existing claim' && ! [ -d "$tmpdir/workspaces/repro-wt-rep-1095-fresh1" ]; then
    _pass 'cmd_autonomy prepare rejects duplicate active claim before worktree creation'
  else
    _fail 'cmd_autonomy prepare rejects duplicate active claim before worktree creation' "rc=$rc; output=$output"
  fi
}

test_help_exists
test_status_json
test_duplicate_claim_fails
test_claim_resolves_linear_issue_id
test_prepare_records_workspace_path
test_prepare_rejects_duplicate_active_claim_before_create

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  printf '%d test(s) FAILED\n' "$FAIL" >&2
  exit 1
fi
