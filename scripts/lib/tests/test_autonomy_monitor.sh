#!/bin/bash
# scripts/lib/tests/test_autonomy_monitor.sh
#
# Regression tests for the autonomy monitor shell surface.

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
  mktemp -d 2>/dev/null || mktemp -d -t test_autonomy_monitor
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
WORKSPACE_ROOT="$tmpdir/workspaces"
SCRIPTS_DIR="$TESTS_DIR/../.."
TMP_DIR="$tmpdir/tmp"
tmpdir="$tmpdir"
mkdir -p "$tmpdir/repro" "$tmpdir/workspaces" "$tmpdir/tmp"
slugify() { printf '%s\n' "\$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "\${WORKSPACE_ROOT:-\$PARENT_DIR}/repro-wt-\$1"; }
source "$WORKTREE_SH"
source "$AUTONOMY_SH"
$extra
RUNNER
  chmod +x "$tmpdir/run_test.sh"
}

test_help_mentions_monitor() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" 'cmd_autonomy_help'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'monitor' && printf '%s\n' "$output" | grep -q -- '--once' && printf '%s\n' "$output" | grep -q -- '--prepare' && printf '%s\n' "$output" | grep -q -- '--project'; then
    _pass 'cmd_autonomy_help documents monitor flags'
  else
    _fail 'cmd_autonomy_help documents monitor flags' "rc=$rc; output=$output"
  fi
}

test_monitor_reports_list_failure() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
linear() {
  return 1
}

REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" REPROCTL_JSON=true cmd_autonomy monitor --once --json
'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q 'Failed to list backlog issues'; then
    _pass 'cmd_autonomy monitor fails clearly when Linear list lookup fails'
  else
    _fail 'cmd_autonomy monitor fails clearly when Linear list lookup fails' "rc=$rc; output=$output"
  fi
}

test_monitor_reports_eligibility_and_reasons() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
linear() {
  case "$*" in
    "issue list --status backlog --json identifier,priority,project,status,relations")
      cat <<'"'"'JSON'"'"'
[{"identifier":"REP-2","priority":2,"project":{"name":"Engineering"},"status":{"name":"Todo","type":"backlog"}},{"identifier":"REP-3","priority":3,"project":{"name":"Engineering"},"status":{"name":"Todo","type":"backlog"},"relations":{"blockedBy":[{"identifier":"REP-9","status":{"type":"started"}}]}},{"identifier":"REP-4","priority":4,"project":{"name":"Marketing"},"status":{"name":"Todo","type":"backlog"}}]
JSON
      ;;
    "issue list --status todo --json identifier,priority,project,status,relations")
      cat <<'"'"'JSON'"'"'
[{"identifier":"REP-1","priority":1,"project":{"name":"Engineering"},"status":{"name":"Todo","type":"todo"},"relations":{"blockedBy":[{"identifier":"REP-8","status":{"type":"closed"}}]}}]
JSON
      ;;
    "issue show REP-1 --json")
      cat <<'"'"'JSON'"'"'
{"item":{"identifier":"REP-1"}}
JSON
      ;;
    *)
      return 1
      ;;
  esac
}

workspace="$tmpdir/workspaces/repro-wt-rep-1"
mkdir -p "$workspace"
REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" cmd_autonomy claim REP-1 --workspace "$workspace" --phase observe --issue-state Todo >/dev/null
REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" REPROCTL_JSON=true cmd_autonomy monitor --once --json
'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && python3 - "$output" <<'PY'
import json
import sys

data = json.loads(sys.argv[1])
items = data["items"]
assert [item["issue_identifier"] for item in items] == ["REP-1", "REP-2", "REP-3", "REP-4"]
assert items[0]["eligible"] is False
assert "active-claim" in items[0]["reasons"]
assert items[1]["eligible"] is True
assert items[2]["eligible"] is False
assert "blocked-by:REP-9" in items[2]["reasons"]
assert "terminal-blockers-ignored" in items[0]["notes"]
assert items[3]["eligible"] is True
assert items[3]["reasons"] == []
PY
  then
    _pass 'cmd_autonomy monitor allows non-engineering projects by default'
  else
    _fail 'cmd_autonomy monitor allows non-engineering projects by default' "rc=$rc; output=$output"
  fi
}

test_monitor_project_scope_filters_candidates() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
linear() {
  case "$*" in
    "issue list --status backlog --json identifier,priority,project,status,relations")
      cat <<'"'"'JSON'"'"'
[{"identifier":"REP-2","priority":2,"project":{"name":"Engineering"},"status":{"name":"Todo","type":"backlog"}},{"identifier":"REP-4","priority":4,"project":{"name":"Marketing"},"status":{"name":"Todo","type":"backlog"}}]
JSON
      ;;
    "issue list --status todo --json identifier,priority,project,status,relations")
      cat <<'"'"'JSON'"'"'
[{"identifier":"REP-1","priority":1,"project":{"name":"Marketing"},"status":{"name":"Todo","type":"todo"}}]
JSON
      ;;
    *)
      return 1
      ;;
  esac
}

REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" REPROCTL_JSON=true cmd_autonomy monitor --once --json --project Engineering
'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && python3 - "$output" <<'PY'
import json
import sys

data = json.loads(sys.argv[1])
assert [item["issue_identifier"] for item in data["items"]] == ["REP-2"]
assert data["summary"]["project_scope"] == ["Engineering"]
PY
  then
    _pass 'cmd_autonomy monitor --project filters the candidate set'
  else
    _fail 'cmd_autonomy monitor --project filters the candidate set' "rc=$rc; output=$output"
  fi
}

test_monitor_orders_zero_and_missing_priority_last() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
linear() {
  case "$*" in
    "issue list --status backlog --json identifier,priority,project,status,relations")
      cat <<'"'"'JSON'"'"'
[{"identifier":"REP-0","priority":0,"project":{"name":"Engineering"},"status":{"name":"Todo","type":"backlog"}},{"identifier":"REP-1","priority":1,"project":{"name":"Engineering"},"status":{"name":"Todo","type":"backlog"}},{"identifier":"REP-2","priority":2,"project":{"name":"Engineering"},"status":{"name":"Todo","type":"backlog"}},{"identifier":"REP-3","project":{"name":"Engineering"},"status":{"name":"Todo","type":"backlog"}}]
JSON
      ;;
    "issue list --status todo --json identifier,priority,project,status,relations")
      cat <<'"'"'JSON'"'"'
[]
JSON
      ;;
    *)
      return 1
      ;;
  esac
}

REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" REPROCTL_JSON=true cmd_autonomy monitor --once --json
'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && python3 - "$output" <<'PY'
import json
import sys

items = json.loads(sys.argv[1])["items"]
assert [item["issue_identifier"] for item in items] == ["REP-1", "REP-2", "REP-0", "REP-3"], items
assert items[2]["priority"] == items[3]["priority"]
PY
  then
    _pass 'cmd_autonomy monitor sorts missing and zero priority last'
  else
    _fail 'cmd_autonomy monitor sorts missing and zero priority last' "rc=$rc; output=$output"
  fi
}

test_monitor_prepare_calls_prepare_for_eligible_issues() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
linear() {
  case "$*" in
    "issue list --status backlog --json identifier,priority,project,status,relations")
      cat <<'"'"'JSON'"'"'
[{"identifier":"REP-2","priority":2,"project":{"name":"Engineering"},"status":{"name":"Todo","type":"backlog"}},{"identifier":"REP-3","priority":3,"project":{"name":"Engineering"},"status":{"name":"Todo","type":"backlog"},"relations":{"blockedBy":[{"identifier":"REP-9","status":{"type":"started"}}]}}]
JSON
      ;;
    "issue list --status todo --json identifier,priority,project,status,relations")
      cat <<'"'"'JSON'"'"'
[{"identifier":"REP-1","priority":1,"project":{"name":"Engineering"},"status":{"name":"Todo","type":"todo"}}]
JSON
      ;;
    *)
      return 1
      ;;
  esac
}

prepared_log="$tmpdir/prepared.log"
_autonomy_monitor_prepare_issue() {
  printf "%s|" "$1" >> "$prepared_log"
}

REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" REPROCTL_JSON=true cmd_autonomy monitor --once --prepare --limit 3 --claimed-by autopilot
'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  prepared_log="$tmpdir/prepared.log"
  prepared_contents=""
  if [ -f "$prepared_log" ]; then
    prepared_contents="$(cat "$prepared_log")"
  fi
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && python3 - "$prepared_contents" <<'PY'
import sys

assert sys.argv[1] == "REP-1|REP-2|", sys.argv[1]
PY
  then
    _pass 'cmd_autonomy monitor --prepare claims eligible issues only'
  else
    _fail 'cmd_autonomy monitor --prepare claims eligible issues only' "rc=$rc; output=$output; prepared=$prepared_contents"
  fi
}

test_help_mentions_monitor
test_monitor_reports_list_failure
test_monitor_reports_eligibility_and_reasons
test_monitor_project_scope_filters_candidates
test_monitor_orders_zero_and_missing_priority_last
test_monitor_prepare_calls_prepare_for_eligible_issues

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  printf '%d test(s) FAILED\n' "$FAIL" >&2
  exit 1
fi
