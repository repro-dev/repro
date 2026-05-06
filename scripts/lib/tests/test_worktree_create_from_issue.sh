#!/bin/bash
# scripts/lib/tests/test_worktree_create_from_issue.sh
#
# Regression test for Linear sync error visibility during issue-based
# worktree creation.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
WORKTREE_SH="$TESTS_DIR/../worktree.sh"
export TESTS_DIR WORKTREE_SH

PASS=0
FAIL=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); }

tmpdir="$(mktemp -d 2>/dev/null || mktemp -d -t test_worktree_create_from_issue)"
export tmpdir
trap 'rm -rf "$tmpdir"' EXIT

cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail

die() { printf 'Error: %b\n' "$*" >&2; return 1; }
_step() { :; }
_ok() { :; }
_err() { printf 'x %s\n' "$1" >&2; }
_warn() { :; }

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

cmd_wt_create() { return 0; }

_linear_api_try() {
  case "$1" in
    *'stateId:'*) return 1 ;;
    *) return 0 ;;
  esac
}

cmd_wt_create_from_issue REP-812

if [[ "$WT_ISSUE_LINEAR_SYNC_ERROR" != 'Failed to update Linear state to In Progress' ]]; then
  die "unexpected sync error: ${WT_ISSUE_LINEAR_SYNC_ERROR:-<empty>}"
fi

RUNNER

chmod +x "$tmpdir/run_test.sh"

if bash "$tmpdir/run_test.sh" >/dev/null 2>&1; then
  _pass 'cmd_wt_create_from_issue records Linear sync failure'
else
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || true
  _fail 'cmd_wt_create_from_issue records Linear sync failure' "$output"
fi

printf '\nResults: %d passed, %d failed out of 1 test\n' "$PASS" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
