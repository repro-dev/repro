#!/bin/bash
# scripts/lib/tests/test_worktree_create_from_issue.sh
#
# Regression tests for issue-based worktree creation and Linear sync visibility.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
WORKTREE_SH="$TESTS_DIR/../worktree.sh"
export TESTS_DIR WORKTREE_SH
REPO_ROOT="$(cd "$TESTS_DIR/../../.." && pwd -P)"

PASS=0
FAIL=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); }

mkdir -p "$REPO_ROOT/tmp"

test_records_linear_sync_failure() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_worktree_create_from_issue.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail

die() { printf 'Error: %b\n' "$*" >&2; return 1; }
_step() { :; }
_ok() { :; }
_err() { printf 'x %s\n' "$1" >&2; }
_warn() { printf '%s\n' "$1" >&2; }

REPO_ROOT="$tmpdir/repro"
MAIN_CHECKOUT="$tmpdir/repro"
PARENT_DIR="$tmpdir"
WORKSPACE_ROOT="$tmpdir"
SCRIPTS_DIR="$TESTS_DIR/../.."
TMP_DIR="$tmpdir/tmp"
mkdir -p "$REPO_ROOT" "$TMP_DIR"

slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }

source "$WORKTREE_SH"

_resolve_issue_worktree_metadata() {
  WT_ISSUE_UUID='uuid-1'
  WT_ISSUE_IDENTIFIER='REP-812'
  WT_ISSUE_TITLE='Manage jcodemunch Python dependencies in bootstrap setup'
  WT_ISSUE_BRANCH_NAME='gary/rep-812-manage-jcodemunch-python-dependencies-in-bootstrap-setup'
  WT_ISSUE_STATE_NAME='In Progress'
  WT_ISSUE_STATE_TYPE='started'
  WT_ISSUE_IN_PROGRESS_STATE_ID='state-in-progress-id'
}

_populate_issue_worktree_names() {
  WT_ISSUE_WORKTREE_BRANCH='gary/rep-812-manage-jcodemunch-python-dependencies-in-bootstrap-setup-fresh1'
  WT_ISSUE_WORKTREE_SLUG='rep-812-fresh1'
  WT_ISSUE_WORKTREE_PATH="$WORKSPACE_ROOT/repro-wt-rep-812-fresh1"
  WT_ISSUE_START_REF='refs/remotes/origin/main'
}

cmd_wt_create() { mkdir -p "$WT_ISSUE_WORKTREE_PATH"; }

_linear_api_try() {
  case "$1" in
    *'stateId:'*) return 1 ;;
    *) return 0 ;;
  esac
}

if cmd_wt_create_from_issue REP-812; then
  die "expected cmd_wt_create_from_issue REP-812 to fail when Linear sync fails"
fi

if [[ "$WT_ISSUE_LINEAR_SYNC_ERROR" != 'Failed to update Linear state to In Progress' ]]; then
  die "unexpected sync error: ${WT_ISSUE_LINEAR_SYNC_ERROR:-<empty>}"
fi

if [[ "$WT_ISSUE_WORKTREE_BRANCH" != 'gary/rep-812-manage-jcodemunch-python-dependencies-in-bootstrap-setup-fresh1' ]]; then
  die "unexpected worktree branch: ${WT_ISSUE_WORKTREE_BRANCH:-<empty>}"
fi

if [[ "$WT_ISSUE_WORKTREE_PATH" != "$WORKSPACE_ROOT/repro-wt-rep-812-fresh1" ]]; then
  die "unexpected worktree path: ${WT_ISSUE_WORKTREE_PATH:-<empty>}"
fi

if [[ ! -d "$WT_ISSUE_WORKTREE_PATH" ]]; then
  die "expected issue-based worktree path to be created"
fi
RUNNER

  chmod +x "$tmpdir/run_test.sh"

  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ ${rc:-0} -eq 0 ] && printf '%s\n' "$output" | grep -q 'Linear sync failed for REP-812: Failed to update Linear state to In Progress'; then
    _pass 'cmd_wt_create_from_issue warns and fails on Linear sync failure'
  else
    _fail 'cmd_wt_create_from_issue warns and fails on Linear sync failure' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

test_creates_issue_worktree_path_from_metadata() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_worktree_create_from_issue_path.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail

die() { printf 'Error: %b\n' "$*" >&2; return 1; }
_step() { :; }
_ok() { :; }
_err() { printf 'x %s\n' "$1" >&2; }
_warn() { printf '%s\n' "$1" >&2; }

REPO_ROOT="$tmpdir/repro"
MAIN_CHECKOUT="$tmpdir/repro"
PARENT_DIR="$tmpdir"
WORKSPACE_ROOT="$tmpdir"
SCRIPTS_DIR="$TESTS_DIR/../.."
TMP_DIR="$tmpdir/tmp"
mkdir -p "$REPO_ROOT" "$TMP_DIR"

slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }

source "$WORKTREE_SH"

_resolve_issue_worktree_metadata() {
  WT_ISSUE_UUID='uuid-1'
  WT_ISSUE_IDENTIFIER='REP-813'
  WT_ISSUE_TITLE='Create issue worktree from metadata'
  WT_ISSUE_BRANCH_NAME='gary/rep-813-create-issue-worktree-from-metadata'
  WT_ISSUE_STATE_NAME='In Progress'
  WT_ISSUE_STATE_TYPE='started'
  WT_ISSUE_IN_PROGRESS_STATE_ID='state-in-progress-id'
}

_populate_issue_worktree_names() {
  WT_ISSUE_WORKTREE_BRANCH='gary/rep-813-create-issue-worktree-from-metadata-fresh1'
  WT_ISSUE_WORKTREE_SLUG='rep-813-fresh1'
  WT_ISSUE_WORKTREE_PATH="$WORKSPACE_ROOT/repro-wt-rep-813-fresh1"
  WT_ISSUE_START_REF='refs/remotes/origin/main'
}

cmd_wt_create() { mkdir -p "$WT_ISSUE_WORKTREE_PATH"; }

_linear_api_try() { return 0; }

cmd_wt_create_from_issue REP-813

if [[ "$WT_ISSUE_WORKTREE_BRANCH" != 'gary/rep-813-create-issue-worktree-from-metadata-fresh1' ]]; then
  die "unexpected worktree branch: $WT_ISSUE_WORKTREE_BRANCH"
fi

if [[ "$WT_ISSUE_WORKTREE_PATH" != "$WORKSPACE_ROOT/repro-wt-rep-813-fresh1" ]]; then
  die "unexpected worktree path: $WT_ISSUE_WORKTREE_PATH"
fi

if [[ ! -d "$WT_ISSUE_WORKTREE_PATH" ]]; then
  die "expected issue-based worktree path to be created"
fi
RUNNER

  chmod +x "$tmpdir/run_test.sh"
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?

  if [ ${rc:-0} -eq 0 ]; then
    _pass 'cmd_wt_create_from_issue creates worktree path from metadata'
  else
    _fail 'cmd_wt_create_from_issue creates worktree path from metadata' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

test_records_linear_sync_failure
test_creates_issue_worktree_path_from_metadata

printf '\nResults: %d passed, %d failed out of 2 tests\n' "$PASS" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
