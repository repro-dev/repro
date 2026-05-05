#!/bin/bash
# scripts/lib/tests/test_autonomy.sh
#
# Regression tests for autonomy orchestration state and shell wrapper.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
AUTONOMY_SH="$TESTS_DIR/../autonomy.sh"
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
_warn() { :; }
REPO_ROOT="$tmpdir/repro"
MAIN_CHECKOUT="$tmpdir/repro"
PARENT_DIR="$tmpdir"
SCRIPTS_DIR="$TESTS_DIR/../.."
TMP_DIR="$tmpdir/tmp"
tmpdir="$tmpdir"
mkdir -p "$tmpdir/repro" "$tmpdir/tmp"
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
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -qi 'Usage: reproctl autonomy' && ! printf '%s\n' "$output" | grep -q -- '--issue-id'; then
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

test_help_exists
test_status_json
test_duplicate_claim_fails
test_claim_resolves_linear_issue_id

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  printf '%d test(s) FAILED\n' "$FAIL" >&2
  exit 1
fi
