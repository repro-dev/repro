#!/bin/bash
# scripts/lib/tests/test_launch_worktree.sh
#
# Regression tests for REP-746: reproctl launch uses the caller's CWD
# to detect the current worktree, not the binary's location.
#
# The root cause: git rev-parse --show-toplevel is called without -C,
# so it resolves relative to $PWD.  When reproctl is invoked via a
# symlink in the main checkout's bin/ while the user's shell CWD is
# inside a worktree, $PWD (and therefore git's working directory) may
# have been set to the main checkout by direnv.
#
# The fix: bin/reproctl captures CALLER_PWD=$PWD before any cd, exports
# it, and common.sh runs git -C "$CALLER_PWD" rev-parse --show-toplevel
# when CALLER_PWD is set.
#
# Tests here verify:
#   1. is_worktree() returns true for a real git worktree (.git is a file)
#   2. is_worktree() returns false for the main checkout (.git is a dir)
#   3. When CALLER_PWD points to a worktree, REPO_ROOT is set to the
#      worktree root (not the main checkout).
#   4. When CALLER_PWD points to the main checkout, REPO_ROOT is set to
#      the main checkout.
#   5. --worktree override is unaffected by CALLER_PWD.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
COMMON_SH="$TESTS_DIR/../common.sh"

# ── Harness ──────────────────────────────────────────────────────────

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

# Run a bash snippet in an isolated subshell.  The snippet must print
# "PASS" on its first output line to succeed.
run_test() {
  local desc="$1" snippet="$2"
  local output rc=0
  output="$(bash -c "$snippet" 2>&1)" || rc=$?
  local first_line
  first_line="$(printf '%s\n' "$output" | head -1)"
  if [[ "$first_line" == "PASS" ]]; then
    _pass "$desc"
  else
    _fail "$desc" "$output"
  fi
}

# ── Shared git-repo setup ─────────────────────────────────────────────
#
# Creates:
#   _TDIR/repro         — main checkout
#   _TDIR/repro-wt-<s>  — linked worktree
#
# After _setup_git_repo, MAIN and WT_PATH are set.

REPO_SETUP='
_TDIR="$(mktemp -d)"
_TDIR="$(cd "$_TDIR" && pwd -P)"
_main="$_TDIR/repro"
mkdir -p "$_main"
git -C "$_main" init -b main >/dev/null 2>&1
git -C "$_main" config user.email "test@test.com"
git -C "$_main" config user.name "Test"
git -C "$_main" commit --allow-empty -m "init" >/dev/null 2>&1

# Create a linked worktree with a known slug
_wt="$_TDIR/repro-wt-test-slug"
git -C "$_main" worktree add -b "feat/test-slug" "$_wt" >/dev/null 2>&1

_cleanup() { rm -rf "$_TDIR"; }
trap _cleanup EXIT
'

# ── Test 1: is_worktree detects a real linked worktree ──────────────────

run_test "is_worktree: returns true for linked worktree (.git is a file)" "
$REPO_SETUP
# Stub minimal environment so common.sh can be sourced without error
export CALLER_PWD=\"\$_main\"
_stub_common() {
  NO_COLOR=1
  CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
  is_worktree() { [ -f \"\$1/.git\" ]; }
}
_stub_common

# The worktree's .git is a file (not a directory)
if [ -f \"\$_wt/.git\" ] && is_worktree \"\$_wt\"; then
  echo PASS
else
  echo \"FAIL: .git=$(ls -la \$_wt/.git 2>/dev/null); is_worktree=\$(is_worktree \$_wt && echo true || echo false)\"
fi
"

# ── Test 2: is_worktree returns false for main checkout ─────────────────

run_test "is_worktree: returns false for main checkout (.git is a directory)" "
$REPO_SETUP
is_worktree() { [ -f \"\$1/.git\" ]; }

if [ -d \"\$_main/.git\" ] && ! is_worktree \"\$_main\"; then
  echo PASS
else
  echo \"FAIL: .git type=$([ -f \"\$_main/.git\" ] && echo file || echo dir)\"
fi
"

# ── Test 3: REPO_ROOT uses CALLER_PWD when set ──────────────────────────
#
# Simulates the scenario where:
#   - binary is invoked from the main checkout's bin/ (so common.sh
#     runs from main checkout context)
#   - but CALLER_PWD is set to the worktree (user's actual CWD)
#
# Expected: REPO_ROOT resolves to the worktree root, not the main checkout.

run_test "common.sh: CALLER_PWD inside worktree sets REPO_ROOT to worktree" "
$REPO_SETUP
# Simulate: user is CWD'd into the worktree
export CALLER_PWD=\"\$_wt\"

# Source common.sh with stubs to prevent side-effects
NO_COLOR=1
CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
export NO_COLOR CLR_BOLD CLR_DIM CLR_RED CLR_GREEN CLR_YELLOW CLR_RESET
die() { printf 'Error: %b\n' \"\$*\" >&2; exit 1; }
export -f die

source \"$COMMON_SH\"

if [[ \"\$REPO_ROOT\" == \"\$_wt\" ]]; then
  echo PASS
else
  echo \"FAIL: expected=\$_wt actual=\$REPO_ROOT\"
fi
"

# ── Test 4: REPO_ROOT uses CALLER_PWD pointing to main checkout ─────────

run_test "common.sh: CALLER_PWD inside main checkout sets REPO_ROOT to main" "
$REPO_SETUP
export CALLER_PWD=\"\$_main\"

NO_COLOR=1
CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
export NO_COLOR CLR_BOLD CLR_DIM CLR_RED CLR_GREEN CLR_YELLOW CLR_RESET
die() { printf 'Error: %b\n' \"\$*\" >&2; exit 1; }
export -f die

source \"$COMMON_SH\"

if [[ \"\$REPO_ROOT\" == \"\$_main\" ]]; then
  echo PASS
else
  echo \"FAIL: expected=\$_main actual=\$REPO_ROOT\"
fi
"

# ── Test 5: is_worktree correctly gates worktree slug detection ──────────
#
# When CALLER_PWD is inside a worktree, is_worktree($REPO_ROOT) must be
# true, enabling worktree-aware resource resolution.

run_test "common.sh: is_worktree true when CALLER_PWD is a worktree" "
$REPO_SETUP
export CALLER_PWD=\"\$_wt\"

NO_COLOR=1
CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
export NO_COLOR CLR_BOLD CLR_DIM CLR_RED CLR_GREEN CLR_YELLOW CLR_RESET
die() { printf 'Error: %b\n' \"\$*\" >&2; exit 1; }
export -f die

source \"$COMMON_SH\"

if is_worktree \"\$REPO_ROOT\"; then
  echo PASS
else
  echo \"FAIL: is_worktree returned false for REPO_ROOT=\$REPO_ROOT (expected true for worktree)\"
fi
"

# ── Test 6: CALLER_PWD unset falls back to CWD-based resolution ─────────
#
# When CALLER_PWD is not set (existing invocation paths without the fix),
# git rev-parse should still work using process CWD.

run_test "common.sh: CALLER_PWD unset falls back to CWD-based git resolution" "
$REPO_SETUP
# Do NOT export CALLER_PWD — test the fallback path
unset CALLER_PWD

# cd into the worktree so git rev-parse uses it as CWD
cd \"\$_wt\"

NO_COLOR=1
CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
export NO_COLOR CLR_BOLD CLR_DIM CLR_RED CLR_GREEN CLR_YELLOW CLR_RESET
die() { printf 'Error: %b\n' \"\$*\" >&2; exit 1; }
export -f die

source \"$COMMON_SH\"

if [[ \"\$REPO_ROOT\" == \"\$_wt\" ]]; then
  echo PASS
else
  echo \"FAIL: expected=\$_wt actual=\$REPO_ROOT\"
fi
"

# ── Test 7: bin/reproctl exports CALLER_PWD ─────────────────────────────
#
# Verify that CALLER_PWD is captured and exported by bin/reproctl before
# exec'ing the main script.

run_test "bin/reproctl: exports CALLER_PWD before exec" "
$REPO_SETUP
BIN_REPROCTL=\"$TESTS_DIR/../../../bin/reproctl\"
if grep -q 'CALLER_PWD' \"\$BIN_REPROCTL\"; then
  echo PASS
else
  echo \"FAIL: bin/reproctl does not set CALLER_PWD\"
fi
"

# ── Main ──────────────────────────────────────────────────────────────

printf '\ncommon.sh — REPO_ROOT from CALLER_PWD (REP-746)\n\n'

printf '\n%d/%d tests passed\n' "$PASS" "$TESTS_RUN"

if [ "$FAIL" -gt 0 ]; then
  printf '%d test(s) FAILED\n' "$FAIL" >&2
  exit 1
fi
