#!/bin/bash
# scripts/lib/tests/test_autonomy_monitor.sh
#
# Regression tests for the autonomy surface removal.

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

test_help_mentions_discover_and_omits_monitor_surface() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" 'cmd_autonomy_help'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'discover' && ! printf '%s\n' "$output" | grep -q 'monitor' && ! printf '%s\n' "$output" | grep -q 'sequence' && ! printf '%s\n' "$output" | grep -q -- '--once' && ! printf '%s\n' "$output" | grep -q -- '--prepare' && ! printf '%s\n' "$output" | grep -q -- '--interval'; then
    _pass 'cmd_autonomy_help documents discover and omits monitor flags'
  else
    _fail 'cmd_autonomy_help documents discover and omits monitor flags' "rc=$rc; output=$output"
  fi
}

test_monitor_is_rejected_as_unknown_subcommand() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" 'cmd_autonomy monitor --once --json'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q 'Unknown subcommand: monitor'; then
    _pass 'cmd_autonomy monitor is rejected as an unknown subcommand'
  else
    _fail 'cmd_autonomy monitor is rejected as an unknown subcommand' "rc=$rc; output=$output"
  fi
}

test_sequence_is_rejected_as_unknown_subcommand() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" 'cmd_autonomy sequence --limit 5 --json'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q 'Unknown subcommand: sequence'; then
    _pass 'cmd_autonomy sequence is rejected as an unknown subcommand'
  else
    _fail 'cmd_autonomy sequence is rejected as an unknown subcommand' "rc=$rc; output=$output"
  fi
}

test_help_mentions_discover_and_omits_monitor_surface
test_monitor_is_rejected_as_unknown_subcommand
test_sequence_is_rejected_as_unknown_subcommand

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  printf '%d test(s) FAILED\n' "$FAIL" >&2
  exit 1
fi
