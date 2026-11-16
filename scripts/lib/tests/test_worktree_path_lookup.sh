#!/bin/bash
# scripts/lib/tests/test_worktree_path_lookup.sh
#
# Tests for worktree_path <slug>. Inky creates worktrees under
# <repo>/.inky/worktrees/<branch>, not the sibling repro-wt-<slug> path, so
# worktree_path must find a worktree by its branch in `git worktree list`
# first, and fall back to the sibling path when no worktree matches (the
# creation case).
#
# Each test builds a scratch repo in a temp dir, sources common.sh with
# CALLER_PWD pointing at an Inky-style worktree, and runs in a subshell.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
COMMON_SH="$TESTS_DIR/../common.sh"

# ── Harness ──────────────────────────────────────────────────────────

PASS=0
FAIL=0
TESTS_RUN=0

# Each test runs in a subshell, so _pass/_fail only print. The subshell's exit
# status (0 = pass, 1 = fail) is what the runner counts.
_pass() { printf '  ✔ %s\n' "$1"; }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; exit 1; }

run_case() {
  TESTS_RUN=$((TESTS_RUN + 1))
  if ( "$1" ); then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
  fi
}

# ── Scratch repo ─────────────────────────────────────────────────────
#
# Creates:
#   $TDIR/repro                                  main checkout
#   $MAIN/.inky/worktrees/$INKY_BRANCH           Inky-style linked worktree
#
# Sets TDIR, MAIN, INKY_BRANCH, INKY_WT.

setup_repo() {
  TDIR="$(cd "$(mktemp -d)" && pwd -P)"
  trap 'rm -rf "$TDIR"' EXIT
  MAIN="$TDIR/repro"
  mkdir -p "$MAIN"
  git -C "$MAIN" init -q -b main
  git -C "$MAIN" config user.email "test@test.com"
  git -C "$MAIN" config user.name "Test"
  git -C "$MAIN" commit -q --allow-empty -m "init"
  INKY_BRANCH="adhoc-3-scratch-branch"
  INKY_WT="$MAIN/.inky/worktrees/$INKY_BRANCH"
  git -C "$MAIN" worktree add -q -b "$INKY_BRANCH" "$INKY_WT"
}

# Sources common.sh as if the user's CWD were the Inky worktree.
source_common_from_inky_worktree() {
  NO_COLOR=1
  CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
  export NO_COLOR CLR_BOLD CLR_DIM CLR_RED CLR_GREEN CLR_YELLOW CLR_RESET
  die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
  export -f die
  export CALLER_PWD="$INKY_WT" REPRO_WORKSPACE_ROOT="$TDIR"
  source "$COMMON_SH"
}

# ── Test 1: worktree at a non-sibling path is found by slug ──────────

test_inky_worktree_found_by_slug() (
  setup_repo
  source_common_from_inky_worktree
  local got
  got="$(worktree_path "$INKY_BRANCH")"
  if [[ "$got" == "$INKY_WT" ]]; then
    _pass "worktree_path: Inky worktree found by branch slug"
  else
    _fail "worktree_path: Inky worktree found by branch slug" \
      "expected=$INKY_WT actual=$got"
  fi
)

# ── Test 2: no matching worktree falls back to the sibling path ──────

test_missing_worktree_gives_sibling_path() (
  setup_repo
  source_common_from_inky_worktree
  local got expected="$WORKSPACE_ROOT/repro-wt-rep-999-missing"
  got="$(worktree_path "rep-999-missing")"
  if [[ "$got" == "$expected" && ! -e "$got" ]]; then
    _pass "worktree_path: no matching worktree returns sibling path (creation case)"
  else
    _fail "worktree_path: no matching worktree returns sibling path (creation case)" \
      "expected=$expected actual=$got"
  fi
)

# ── Test 3: slash in branch name ─────────────────────────────────────

test_slash_branch_without_worktree_keeps_sibling_path() (
  setup_repo
  source_common_from_inky_worktree
  git -C "$MAIN" branch -q feat/rep-7-slash
  local got expected="$WORKSPACE_ROOT/repro-wt-feat/rep-7-slash"
  got="$(worktree_path "feat/rep-7-slash")"
  if [[ "$got" == "$expected" ]]; then
    _pass "worktree_path: slash branch with no worktree keeps sibling path"
  else
    _fail "worktree_path: slash branch with no worktree keeps sibling path" \
      "expected=$expected actual=$got"
  fi
)

test_slash_branch_with_worktree_found() (
  setup_repo
  source_common_from_inky_worktree
  local wt="$MAIN/.inky/worktrees/feat-rep-8-slash"
  git -C "$MAIN" worktree add -q -b feat/rep-8-slash "$wt"
  local got
  got="$(worktree_path "feat/rep-8-slash")"
  if [[ "$got" == "$wt" ]]; then
    _pass "worktree_path: slash branch with a non-sibling worktree is found"
  else
    _fail "worktree_path: slash branch with a non-sibling worktree is found" \
      "expected=$wt actual=$got"
  fi
)

# ── Test 4: existing sibling repro-wt-<slug> layout still resolves ───

test_sibling_worktree_still_resolves() (
  setup_repo
  source_common_from_inky_worktree
  local sib="$WORKSPACE_ROOT/repro-wt-rep-5-sibling"
  git -C "$MAIN" worktree add -q -b feat/rep-5-other "$sib"
  local got
  got="$(worktree_path "rep-5-sibling")"
  if [[ "$got" == "$sib" ]]; then
    _pass "worktree_path: sibling repro-wt-<slug> path still resolves"
  else
    _fail "worktree_path: sibling repro-wt-<slug> path still resolves" \
      "expected=$sib actual=$got"
  fi
)

# ── Test 5: the launch path picks the worktree's capture dist ────────
#
# Mirrors scripts/lib/launch.sh: slug from detect_worktree_slug, then
# worktree_path "$slug", then apps/capture/dist under that path.

test_launch_picks_inky_worktree_capture_dist() (
  setup_repo
  source_common_from_inky_worktree
  mkdir -p "$INKY_WT/apps/capture/dist"
  is_worktree "$REPO_ROOT" || _fail "launch: capture extension dist resolves to Inky worktree" "is_worktree(REPO_ROOT) was false"
  local slug wt_path ext_dist
  slug="$(detect_worktree_slug)"
  wt_path="$(worktree_path "$slug")"
  ext_dist="$wt_path/apps/capture/dist"
  if [[ "$slug" == "$INKY_BRANCH" && "$ext_dist" == "$INKY_WT/apps/capture/dist" && -d "$ext_dist" ]]; then
    _pass "launch: capture extension dist resolves to Inky worktree"
  else
    _fail "launch: capture extension dist resolves to Inky worktree" \
      "slug=$slug ext_dist=$ext_dist"
  fi
)

# ── Main ──────────────────────────────────────────────────────────────

printf '\nworktree_path — lookup by branch in git worktree list\n\n'

run_case test_inky_worktree_found_by_slug
run_case test_missing_worktree_gives_sibling_path
run_case test_slash_branch_without_worktree_keeps_sibling_path
run_case test_slash_branch_with_worktree_found
run_case test_sibling_worktree_still_resolves
run_case test_launch_picks_inky_worktree_capture_dist

printf '\n%d/%d tests passed\n' "$PASS" "$TESTS_RUN"

if [ "$FAIL" -gt 0 ]; then
  printf '%d test(s) FAILED\n' "$FAIL" >&2
  exit 1
fi
