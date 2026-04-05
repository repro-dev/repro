#!/bin/bash
# scripts/lib/tests/test_code_index.sh
#
# Unit tests for the code-index command group skeleton (REP-738).

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
CODE_INDEX_SH="$TESTS_DIR/../code-index.sh"

# ── Harness ──────────────────────────────────────────────────────────

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

# ── Tests ─────────────────────────────────────────────────────────────

# Test: code-index.sh file exists
test_file_exists() {
  if [ -f "$CODE_INDEX_SH" ]; then
    _pass "code-index.sh exists"
  else
    _fail "code-index.sh exists" "file not found: $CODE_INDEX_SH"
  fi
}

# Test: cmd_code_index_help function is defined after sourcing
test_help_function_defined() {
  local output rc=0
  output="$(bash -c "
    CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
    die() { echo \"Error: \$*\" >&2; exit 1; }
    source \"$CODE_INDEX_SH\"
    declare -f cmd_code_index_help >/dev/null 2>&1 && echo PASS || echo FAIL
  " 2>&1)" || rc=$?
  if [ "$output" = "PASS" ]; then
    _pass "cmd_code_index_help is defined"
  else
    _fail "cmd_code_index_help is defined" "$output"
  fi
}

# Test: cmd_code_index function is defined after sourcing
test_dispatch_function_defined() {
  local output rc=0
  output="$(bash -c "
    CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
    die() { echo \"Error: \$*\" >&2; exit 1; }
    source \"$CODE_INDEX_SH\"
    declare -f cmd_code_index >/dev/null 2>&1 && echo PASS || echo FAIL
  " 2>&1)" || rc=$?
  if [ "$output" = "PASS" ]; then
    _pass "cmd_code_index is defined"
  else
    _fail "cmd_code_index is defined" "$output"
  fi
}

# Test: reproctl code-index help exits 0 and prints usage
test_help_exits_zero() {
  local output rc=0
  output="$(bash -c "
    CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
    die() { echo \"Error: \$*\" >&2; exit 1; }
    source \"$CODE_INDEX_SH\"
    cmd_code_index_help
  " 2>&1)" || rc=$?
  if [ $rc -eq 0 ]; then
    _pass "cmd_code_index_help exits 0"
  else
    _fail "cmd_code_index_help exits 0" "exited with $rc; output: $output"
  fi
}

# Test: help output mentions 'code-index'
test_help_mentions_command() {
  local output rc=0
  output="$(bash -c "
    CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
    die() { echo \"Error: \$*\" >&2; exit 1; }
    source \"$CODE_INDEX_SH\"
    cmd_code_index_help
  " 2>&1)" || rc=$?
  if printf '%s\n' "$output" | grep -q "code-index"; then
    _pass "help output mentions code-index"
  else
    _fail "help output mentions code-index" "output: $output"
  fi
}

# Test: cmd_code_index help subcommand exits 0
test_dispatch_help_exits_zero() {
  local output rc=0
  output="$(bash -c "
    CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
    die() { echo \"Error: \$*\" >&2; exit 1; }
    source \"$CODE_INDEX_SH\"
    cmd_code_index help
  " 2>&1)" || rc=$?
  if [ $rc -eq 0 ]; then
    _pass "cmd_code_index help exits 0"
  else
    _fail "cmd_code_index help exits 0" "exited with $rc; output: $output"
  fi
}

# Test: cmd_code_index with no args exits 1 and prints usage
test_dispatch_no_args_exits_nonzero() {
  local output rc=0
  output="$(bash -c "
    CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
    die() { echo \"Error: \$*\" >&2; exit 1; }
    source \"$CODE_INDEX_SH\"
    cmd_code_index
  " 2>&1)" || rc=$?
  if [ $rc -ne 0 ]; then
    _pass "cmd_code_index with no args exits non-zero"
  else
    _fail "cmd_code_index with no args exits non-zero" "unexpectedly exited 0"
  fi
}

# Test: cmd_code_index --help flag exits 0
test_dispatch_help_flag_exits_zero() {
  local output rc=0
  output="$(bash -c "
    CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
    die() { echo \"Error: \$*\" >&2; exit 1; }
    source \"$CODE_INDEX_SH\"
    cmd_code_index --help
  " 2>&1)" || rc=$?
  if [ $rc -eq 0 ]; then
    _pass "cmd_code_index --help exits 0"
  else
    _fail "cmd_code_index --help exits 0" "exited with $rc; output: $output"
  fi
}

# Test: unknown subcommand exits non-zero
test_dispatch_unknown_subcommand() {
  local output rc=0
  output="$(bash -c "
    CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
    die() { echo \"Error: \$*\" >&2; exit 1; }
    source \"$CODE_INDEX_SH\"
    cmd_code_index bogus-subcommand
  " 2>&1)" || rc=$?
  if [ $rc -ne 0 ]; then
    _pass "cmd_code_index unknown subcommand exits non-zero"
  else
    _fail "cmd_code_index unknown subcommand exits non-zero" "unexpectedly exited 0"
  fi
}

# ── Run all tests ─────────────────────────────────────────────────────

test_file_exists
test_help_function_defined
test_dispatch_function_defined
test_help_exits_zero
test_help_mentions_command
test_dispatch_help_exits_zero
test_dispatch_no_args_exits_nonzero
test_dispatch_help_flag_exits_zero
test_dispatch_unknown_subcommand

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
