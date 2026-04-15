#!/bin/bash
# scripts/lib/tests/test_worktree_remove.sh
#
# Integration tests for the wt remove slug and --force fixes (REP-705).
#
# Tests create a temporary git repo layout that mimics the production
# worktree structure (PARENT_DIR/repro-wt-<slug>) without touching the
# real checkout.
#
# Integration tests run inside bash subshells (via run_git_test) so that
# each test gets a clean environment and temp-dir cleanup happens reliably.

set -euo pipefail

# Absolute path to this test file's directory, so we can find worktree.sh
TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
WORKTREE_SH="$TESTS_DIR/../worktree.sh"

# ── Harness ──────────────────────────────────────────────────────────

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

# Run a snippet of bash code in an isolated subshell.  The snippet must
# print "PASS" on its first line; additional output is allowed. Anything
# else is treated as failure.
run_git_test() {
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

# ── Shared setup preamble (embedded into each subshell) ───────────────
#
# COMMON_SETUP creates a minimal git repo under a resolved temp dir,
# defines _add_worktree and _src_wt helpers, and registers a cleanup trap.
# Worktree.sh is sourced via _src_wt which first cd's into the temp main
# checkout so that `git worktree list --porcelain` (called without -C) sees
# the temp repo, not the live checkout.

COMMON_SETUP='
# Resolve symlinks so paths match what git worktree list --porcelain reports on macOS.
_TDIR="$(mktemp -d)"
_TDIR="$(cd "$_TDIR" && pwd -P)"

_main="$_TDIR/repro"
mkdir -p "$_main"
git -C "$_main" init -b main >/dev/null 2>&1
git -C "$_main" config user.email "test@test.com"
git -C "$_main" config user.name "Test"
git -C "$_main" commit --allow-empty -m "init" >/dev/null 2>&1

# Add a git worktree under _TDIR with the given slug and return its path.
_add_worktree() {
  local slug="$1"
  local branch="feat/rep-705-${slug}"
  local wt="$_TDIR/repro-wt-${slug}"
  git -C "$_main" worktree add -b "$branch" "$wt" >/dev/null 2>&1
  echo "$wt"
}

# Source worktree.sh with stubs pointing at the temp checkout.
# cd into _main first so bare `git worktree list --porcelain` sees this repo.
_src_wt() {
  cd "$_main"
  export REPO_ROOT="$_main"
  export MAIN_CHECKOUT="$_main"
  export PARENT_DIR="$(dirname "$_main")"
  export CONFIG_FILE="$_main/tmp/reproctl_services.json"
  export SCRIPTS_DIR="$_main/scripts"
  export TMP_DIR="$_main/tmp"
  mkdir -p "$_main/tmp"
  CLR_BOLD="" CLR_DIM="" CLR_RED="" CLR_GREEN="" CLR_YELLOW="" CLR_RESET=""
  export CLR_BOLD CLR_DIM CLR_RED CLR_GREEN CLR_YELLOW CLR_RESET
  die()           { printf "Error: %b\n" "$*" >&2; return 1; }
  _step()         { :; }
  _ok()           { :; }
  _err()          { printf "x %s\n" "$1" >&2; }
  _warn()         { :; }
  slugify()       { printf "%s\n" "$1" | sed "s|/|-|g" | tr "[:upper:]" "[:lower:]"; }
  worktree_path() { echo "$PARENT_DIR/repro-wt-$1"; }
  # shellcheck source=../worktree.sh
  source '"\"$WORKTREE_SH\""'
}

_cleanup() { rm -rf "$_TDIR"; }
trap _cleanup EXIT
'

# ── Guard logic tests (pure bash, no git repo needed) ─────────────────

# Test: --force guard allows 'remove' subcommand
test_force_guard_allows_remove() {
  local subcmd="remove" WT_FORCE=true
  if [ "$WT_FORCE" = true ] && [ "$subcmd" != "prune" ] && [ "$subcmd" != "remove" ]; then
    _fail "force guard allows remove" "guard unexpectedly rejected 'remove'"
  else
    _pass "force guard allows remove"
  fi
}

# Test: --force guard still rejects 'create' subcommand
test_force_guard_rejects_create() {
  local subcmd="create" WT_FORCE=true
  if [ "$WT_FORCE" = true ] && [ "$subcmd" != "prune" ] && [ "$subcmd" != "remove" ]; then
    _pass "force guard rejects create"
  else
    _fail "force guard rejects create" "guard should reject 'create' but did not"
  fi
}

# Test: --force guard still rejects 'list' subcommand
test_force_guard_rejects_list() {
  local subcmd="list" WT_FORCE=true
  if [ "$WT_FORCE" = true ] && [ "$subcmd" != "prune" ] && [ "$subcmd" != "remove" ]; then
    _pass "force guard rejects list"
  else
    _fail "force guard rejects list" "guard should reject 'list' but did not"
  fi
}

# Test: --force guard still allows 'prune' subcommand (no regression)
test_force_guard_allows_prune() {
  local subcmd="prune" WT_FORCE=true
  if [ "$WT_FORCE" = true ] && [ "$subcmd" != "prune" ] && [ "$subcmd" != "remove" ]; then
    _fail "force guard allows prune" "guard unexpectedly rejected 'prune'"
  else
    _pass "force guard allows prune"
  fi
}

# ── Main ──────────────────────────────────────────────────────────────

printf '\nworktree.sh — wt remove slug + --force (REP-705)\n\n'

# Guard tests (pure bash logic, no git repo needed)
test_force_guard_allows_remove
test_force_guard_rejects_create
test_force_guard_rejects_list
test_force_guard_allows_prune

# Integration tests (each runs in an isolated subshell with a fresh git repo)

run_git_test "resolve_worktree: slug form resolves to correct path" "
$COMMON_SETUP
wt_path=\"\$(_add_worktree rep-705)\"
_src_wt
result=\"\$(resolve_worktree rep-705 2>/dev/null)\"
if [[ \"\$result\" == \"\$wt_path\" ]]; then echo PASS; else echo \"FAIL:expected=\$wt_path actual=\$result\"; fi
"

run_git_test "resolve_worktree: branch form resolves to correct path" "
$COMMON_SETUP
wt_path=\"\$(_add_worktree branch-test)\"
_src_wt
result=\"\$(resolve_worktree feat/rep-705-branch-test 2>/dev/null)\"
if [[ \"\$result\" == \"\$wt_path\" ]]; then echo PASS; else echo \"FAIL:expected=\$wt_path actual=\$result\"; fi
"

run_git_test "cmd_wt_remove: dry-run with slug outputs dry-run message" "
$COMMON_SETUP
_add_worktree rep-705 >/dev/null
_src_wt
WT_DRY_RUN=true WT_FORCE=false
output=\"\$(cmd_wt_remove rep-705 2>&1)\"
if echo \"\$output\" | grep -q 'dry-run'; then echo PASS; else echo \"FAIL:\$output\"; fi
"

run_git_test "cmd_wt_remove: dry-run with branch name outputs dry-run message" "
$COMMON_SETUP
_add_worktree branch-test >/dev/null
_src_wt
WT_DRY_RUN=true WT_FORCE=false
output=\"\$(cmd_wt_remove feat/rep-705-branch-test 2>&1)\"
if echo \"\$output\" | grep -q 'dry-run'; then echo PASS; else echo \"FAIL:\$output\"; fi
"

run_git_test "cmd_wt_remove: dry-run with --force and slug outputs dry-run message" "
$COMMON_SETUP
_add_worktree force-test >/dev/null
_src_wt
WT_DRY_RUN=true WT_FORCE=true
output=\"\$(cmd_wt_remove force-test 2>&1)\"
if echo \"\$output\" | grep -q 'dry-run'; then echo PASS; else echo \"FAIL:\$output\"; fi
"

run_git_test "cmd_wt_remove: worktree with tracked changes without --force exits non-zero and leaves worktree intact" "
$COMMON_SETUP
wt_dir=\"\$(_add_worktree dirty-no-force)\"
# Create a tracked file with uncommitted changes (unstaged modification)
printf 'initial\n' >\"\$wt_dir/tracked-file.txt\"
git -C \"\$wt_dir\" add tracked-file.txt
git -C \"\$wt_dir\" commit -m 'add tracked file' >/dev/null 2>&1
printf 'modified\n' >\"\$wt_dir/tracked-file.txt\"
_src_wt
WT_DRY_RUN=false WT_FORCE=false
rc=0
output=\"\$(cmd_wt_remove dirty-no-force 2>&1)\" || rc=\$?
if [[ \"\$rc\" -ne 0 && -d \"\$wt_dir\" ]]; then
  echo PASS
else
  echo \"FAIL:rc=\$rc output=\$output wt_exists=\$(test -d \"\$wt_dir\" && echo yes || echo no)\"
fi
"

run_git_test "cmd_wt_remove: dirty worktree with --force succeeds and removes worktree" "
$COMMON_SETUP
wt_dir=\"\$(_add_worktree dirty-force)\"
printf 'dirty\n' >\"\$wt_dir/.dirty-uncommitted\"
_src_wt
WT_DRY_RUN=false WT_FORCE=true
rc=0
output=\"\$(cmd_wt_remove dirty-force 2>&1)\" || rc=\$?
if [[ \"\$rc\" -eq 0 && ! -d \"\$wt_dir\" ]]; then
  echo PASS
else
  echo \"FAIL:rc=\$rc output=\$output wt_exists=\$(test -d \"\$wt_dir\" && echo yes || echo no)\"
fi
"

run_git_test "cmd_wt_remove: missing slug exits non-zero" "
$COMMON_SETUP
_src_wt
WT_DRY_RUN=false WT_FORCE=false
rc=0
cmd_wt_remove nonexistent-slug 2>/dev/null || rc=\$?
if [[ \"\$rc\" -ne 0 ]]; then echo PASS; else echo 'FAIL:expected non-zero exit'; fi
"

# ── REP-898: ignored-only auto-remove ─────────────────────────────────

run_git_test "cmd_wt_remove: worktree with only ignored files auto-removes without --force" "
$COMMON_SETUP
wt_dir=\"\$(_add_worktree ignored-only)\"
# Stage a .gitignore that ignores tmp/
printf 'tmp/\n' >\"\$wt_dir/.gitignore\"
git -C \"\$wt_dir\" add .gitignore
git -C \"\$wt_dir\" commit -m 'add gitignore' >/dev/null 2>&1
# Create an ignored artifact
mkdir -p \"\$wt_dir/tmp\"
printf 'output\n' >\"\$wt_dir/tmp/output.txt\"
_src_wt
WT_DRY_RUN=false WT_FORCE=false WT_YES=false
rc=0
output=\"\$(cmd_wt_remove ignored-only 2>&1)\" || rc=\$?
if [[ \"\$rc\" -eq 0 && ! -d \"\$wt_dir\" ]]; then
  echo PASS
else
  echo \"FAIL:rc=\$rc output=\$output wt_exists=\$(test -d \"\$wt_dir\" && echo yes || echo no)\"
fi
"

# ── REP-898: WT_YES + has-changes skips with rc=0 ─────────────────────

run_git_test "cmd_wt_remove: WT_YES + tracked changes skips worktree and returns 0" "
$COMMON_SETUP
wt_dir=\"\$(_add_worktree yes-has-changes)\"
# Commit a tracked file, then modify it (unstaged)
printf 'initial\n' >\"\$wt_dir/tracked.txt\"
git -C \"\$wt_dir\" add tracked.txt
git -C \"\$wt_dir\" commit -m 'add tracked file' >/dev/null 2>&1
printf 'modified\n' >\"\$wt_dir/tracked.txt\"
_src_wt
WT_DRY_RUN=false WT_FORCE=false WT_YES=true
rc=0
output=\"\$(cmd_wt_remove yes-has-changes 2>&1)\" || rc=\$?
if [[ \"\$rc\" -eq 0 && -d \"\$wt_dir\" ]]; then
  echo PASS
else
  echo \"FAIL:rc=\$rc output=\$output wt_exists=\$(test -d \"\$wt_dir\" && echo yes || echo no)\"
fi
"

# ── REP-898: non-interactive + tracked changes exits non-zero ──────────

run_git_test "cmd_wt_remove: non-interactive + tracked changes exits non-zero and leaves worktree intact" "
$COMMON_SETUP
wt_dir=\"\$(_add_worktree noninteractive-tracked)\"
printf 'initial\n' >\"\$wt_dir/tracked.txt\"
git -C \"\$wt_dir\" add tracked.txt
git -C \"\$wt_dir\" commit -m 'add tracked file' >/dev/null 2>&1
printf 'modified\n' >\"\$wt_dir/tracked.txt\"
_src_wt
WT_DRY_RUN=false WT_FORCE=false WT_YES=false
rc=0
output=\"\$(cmd_wt_remove noninteractive-tracked </dev/null 2>&1)\" || rc=\$?
if [[ \"\$rc\" -ne 0 && -d \"\$wt_dir\" ]]; then
  echo PASS
else
  echo \"FAIL:rc=\$rc output=\$output wt_exists=\$(test -d \"\$wt_dir\" && echo yes || echo no)\"
fi
"


# ── REP-921: _wt_change_state new states ──────────────────────────────

run_git_test "_wt_change_state: returns has-untracked for worktree with only untracked non-ignored files" "
$COMMON_SETUP
wt_dir=\"\$(_add_worktree change-state-untracked)\"
# Create an untracked file (not gitignored)
printf 'scratch\n' >\"\$wt_dir/scratch.txt\"
_src_wt
result=\"\$(_wt_change_state \"\$wt_dir\")\"
if [[ \"\$result\" == \"has-untracked\" ]]; then echo PASS; else echo \"FAIL:expected=has-untracked actual=\$result\"; fi
"

run_git_test "_wt_change_state: returns clean for worktree with only git-ignored files" "
$COMMON_SETUP
wt_dir=\"\$(_add_worktree change-state-ignored)\"
# Commit a .gitignore that ignores tmp/
printf 'tmp/\n' >\"\$wt_dir/.gitignore\"
git -C \"\$wt_dir\" add .gitignore
git -C \"\$wt_dir\" commit -m 'add gitignore' >/dev/null 2>&1
# Create an ignored artifact
mkdir -p \"\$wt_dir/tmp\"
printf 'output\n' >\"\$wt_dir/tmp/artifact.txt\"
_src_wt
result=\"\$(_wt_change_state \"\$wt_dir\")\"
if [[ \"\$result\" == \"clean\" ]]; then echo PASS; else echo \"FAIL:expected=clean actual=\$result\"; fi
"

run_git_test "_wt_change_state: returns has-tracked-changes for worktree with staged changes" "
$COMMON_SETUP
wt_dir=\"\$(_add_worktree change-state-staged)\"
# Create and stage a new file
printf 'content\n' >\"\$wt_dir/staged.txt\"
git -C \"\$wt_dir\" add staged.txt
_src_wt
result=\"\$(_wt_change_state \"\$wt_dir\")\"
if [[ \"\$result\" == \"has-tracked-changes\" ]]; then echo PASS; else echo \"FAIL:expected=has-tracked-changes actual=\$result\"; fi
"

run_git_test "_wt_change_state: returns has-tracked-changes for worktree with unstaged changes to tracked file" "
$COMMON_SETUP
wt_dir=\"\$(_add_worktree change-state-unstaged)\"
# Commit a tracked file, then modify it (unstaged)
printf 'initial\n' >\"\$wt_dir/tracked.txt\"
git -C \"\$wt_dir\" add tracked.txt
git -C \"\$wt_dir\" commit -m 'add tracked file' >/dev/null 2>&1
printf 'modified\n' >\"\$wt_dir/tracked.txt\"
_src_wt
result=\"\$(_wt_change_state \"\$wt_dir\")\"
if [[ \"\$result\" == \"has-tracked-changes\" ]]; then echo PASS; else echo \"FAIL:expected=has-tracked-changes actual=\$result\"; fi
"

# REP-921: has-untracked should NOT trigger the skip-with-warning path in WT_YES mode
run_git_test "cmd_wt_remove: WT_YES + only untracked files removes worktree (does not skip)" "
$COMMON_SETUP
wt_dir=\"\$(_add_worktree yes-untracked-only)\"
# Only untracked (non-ignored) file — no tracked changes
printf 'scratch\n' >\"\$wt_dir/scratch.txt\"
_src_wt
WT_DRY_RUN=false WT_FORCE=false WT_YES=true
rc=0
output=\"\$(cmd_wt_remove yes-untracked-only 2>&1)\" || rc=\$?
if [[ \"\$rc\" -eq 0 && ! -d \"\$wt_dir\" ]]; then
  echo PASS
else
  echo \"FAIL:rc=\$rc output=\$output wt_exists=\$(test -d \"\$wt_dir\" && echo yes || echo no)\"
fi
"

# REP-921 Fix 1: has-untracked in non-interactive non-WT_YES path must NOT silently delete.
# When WT_YES=false and no TTY, a worktree with only untracked files should exit non-zero.
# NOTE: The interactive-output path (TTY prompt text) is verified manually — pseudo-tty
# testing is not supported in this harness.
run_git_test "cmd_wt_remove: no-TTY + only untracked files (no --force, no --yes) exits non-zero and leaves worktree intact" "
$COMMON_SETUP
wt_dir=\"\$(_add_worktree noyes-untracked)\"
# Only untracked (non-ignored) file — no tracked changes
printf 'scratch\n' >\"\$wt_dir/scratch.txt\"
_src_wt
WT_DRY_RUN=false WT_FORCE=false WT_YES=false
rc=0
output=\"\$(cmd_wt_remove noyes-untracked </dev/null 2>&1)\" || rc=\$?
if [[ \"\$rc\" -ne 0 && -d \"\$wt_dir\" ]]; then
  echo PASS
else
  echo \"FAIL:rc=\$rc output=\$output wt_exists=\$(test -d \"\$wt_dir\" && echo yes || echo no)\"
fi
"

printf '\n%d/%d tests passed\n' "$PASS" "$TESTS_RUN"

if [ "$FAIL" -gt 0 ]; then
  printf '%d test(s) FAILED\n' "$FAIL" >&2
  exit 1
fi
