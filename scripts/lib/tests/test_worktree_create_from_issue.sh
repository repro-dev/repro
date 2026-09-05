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

die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
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
}

_populate_issue_worktree_names() {
  WT_ISSUE_WORKTREE_BRANCH='gary/rep-812-manage-jcodemunch-python-dependencies-in-bootstrap-setup-fresh1'
  WT_ISSUE_WORKTREE_SLUG='rep-812-fresh1'
  WT_ISSUE_WORKTREE_PATH="$WORKSPACE_ROOT/repro-wt-rep-812-fresh1"
  WT_ISSUE_START_REF='refs/remotes/origin/main'
}

cmd_wt_create() { mkdir -p "$WT_ISSUE_WORKTREE_PATH"; }

_linear_cli() {
  case "$*" in
    *"issue update"*) return 1 ;;
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

die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
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
}

_populate_issue_worktree_names() {
  WT_ISSUE_WORKTREE_BRANCH='gary/rep-813-create-issue-worktree-from-metadata-fresh1'
  WT_ISSUE_WORKTREE_SLUG='rep-813-fresh1'
  WT_ISSUE_WORKTREE_PATH="$WORKSPACE_ROOT/repro-wt-rep-813-fresh1"
  WT_ISSUE_START_REF='refs/remotes/origin/main'
}

cmd_wt_create() { mkdir -p "$WT_ISSUE_WORKTREE_PATH"; }

_linear_cli() { return 0; }

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

test_resolve_issue_worktree_metadata_parses_cli_json() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_resolve_issue_worktree_metadata_parses_cli_json.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail

die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
_step() { echo "STEP: $*" >&2; }
_ok() { :; }

REPO_ROOT="$tmpdir/repro"
MAIN_CHECKOUT="$tmpdir/repro"
PARENT_DIR="$tmpdir"
SCRIPTS_DIR="$TESTS_DIR"
TMP_DIR="$tmpdir/tmp"
mkdir -p "$REPO_ROOT" "$TMP_DIR"

source "$WORKTREE_SH"

_linear_cli() {
  printf '%s\n' '{"item":{"id":"uuid-1","identifier":"REP-200","title":"Test issue","branchName":"feat/rep-200-test-issue","status":{"id":"st-1","name":"In Progress","type":"started"}}}'
}

_resolve_issue_worktree_metadata "REP-200"

if [[ "$WT_ISSUE_UUID" != "uuid-1" ]]; then
  die "Expected WT_ISSUE_UUID=uuid-1, got: ${WT_ISSUE_UUID:-<empty>}"
fi

if [[ "$WT_ISSUE_IDENTIFIER" != "REP-200" ]]; then
  die "Expected WT_ISSUE_IDENTIFIER=REP-200, got: ${WT_ISSUE_IDENTIFIER:-<empty>}"
fi

if [[ "$WT_ISSUE_TITLE" != "Test issue" ]]; then
  die "Expected WT_ISSUE_TITLE=Test issue, got: ${WT_ISSUE_TITLE:-<empty>}"
fi

if [[ "$WT_ISSUE_BRANCH_NAME" != "feat/rep-200-test-issue" ]]; then
  die "Expected WT_ISSUE_BRANCH_NAME=feat/rep-200-test-issue, got: ${WT_ISSUE_BRANCH_NAME:-<empty>}"
fi

if [[ "$WT_ISSUE_STATE_NAME" != "In Progress" ]]; then
  die "Expected WT_ISSUE_STATE_NAME=In Progress, got: ${WT_ISSUE_STATE_NAME:-<empty>}"
fi

if [[ "$WT_ISSUE_STATE_TYPE" != "started" ]]; then
  die "Expected WT_ISSUE_STATE_TYPE=started, got: ${WT_ISSUE_STATE_TYPE:-<empty>}"
fi
RUNNER

  chmod +x "$tmpdir/run_test.sh"
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?

  if [ ${rc:-0} -eq 0 ]; then
    _pass '_resolve_issue_worktree_metadata parses CLI JSON correctly'
  else
    _fail '_resolve_issue_worktree_metadata parses CLI JSON correctly' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

test_resolve_issue_worktree_metadata_rejects_invalid_id() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_resolve_issue_worktree_metadata_rejects_invalid_id.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail

die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
_step() { :; }
_ok() { :; }

REPO_ROOT="$tmpdir/repro"
MAIN_CHECKOUT="$tmpdir/repro"
PARENT_DIR="$tmpdir"
SCRIPTS_DIR="$TESTS_DIR"
TMP_DIR="$tmpdir/tmp"
mkdir -p "$REPO_ROOT" "$TMP_DIR"

source "$WORKTREE_SH"

_linear_cli() { touch "$tmpdir/linear_cli_called" && exit 2; }

# _resolve_issue_worktree_metadata should die before calling _linear_cli.
# If die() works, this subshell exits non-zero.
if ( _resolve_issue_worktree_metadata "bad-format" ) 2>/dev/null; then
  exit 1
fi

# Sentinel: verify _linear_cli was NOT called (validation must fire first).
if [ -f "$tmpdir/linear_cli_called" ]; then
  printf 'Error: _linear_cli was reached before ID validation\n' >&2
  exit 1
fi
RUNNER

  chmod +x "$tmpdir/run_test.sh"
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?

  if [ ${rc:-0} -eq 0 ]; then
    _pass '_resolve_issue_worktree_metadata rejects invalid issue ID'
  else
    _fail '_resolve_issue_worktree_metadata rejects invalid issue ID' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

test_resolve_issue_worktree_metadata_dies_on_empty_branch() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_resolve_issue_worktree_metadata_dies_on_empty_branch.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail

die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
_step() { :; }
_ok() { :; }

REPO_ROOT="$tmpdir/repro"
MAIN_CHECKOUT="$tmpdir/repro"
PARENT_DIR="$tmpdir"
SCRIPTS_DIR="$TESTS_DIR"
TMP_DIR="$tmpdir/tmp"
mkdir -p "$REPO_ROOT" "$TMP_DIR"

source "$WORKTREE_SH"

_linear_cli() {
  printf '%s\n' '{"item":{"id":"uuid-1","identifier":"REP-300","title":"No branch","branchName":null,"status":null}}'
}

# _resolve_issue_worktree_metadata should die on empty branchName.
# If die() works, this subshell exits non-zero.
if ( _resolve_issue_worktree_metadata "REP-300" ) 2>/dev/null; then
  exit 1
fi
RUNNER

  chmod +x "$tmpdir/run_test.sh"
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?

  if [ ${rc:-0} -eq 0 ]; then
    _pass '_resolve_issue_worktree_metadata dies on empty branchName'
  else
    _fail '_resolve_issue_worktree_metadata dies on empty branchName' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

test_no_status_update_skips_linear_cli() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_no_status_update_skips_linear_cli.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail

die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
_step() { :; }
_ok() { :; }
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
  WT_ISSUE_IDENTIFIER='REP-400'
  WT_ISSUE_TITLE='No status update'
  WT_ISSUE_BRANCH_NAME='feat/rep-400-no-status-update'
  WT_ISSUE_STATE_NAME='Todo'
  WT_ISSUE_STATE_TYPE='unstarted'
}

_populate_issue_worktree_names() {
  WT_ISSUE_WORKTREE_BRANCH='feat/rep-400-no-status-update-fresh1'
  WT_ISSUE_WORKTREE_SLUG='rep-400-fresh1'
  WT_ISSUE_WORKTREE_PATH="$WORKSPACE_ROOT/repro-wt-rep-400-fresh1"
  WT_ISSUE_START_REF='refs/remotes/origin/main'
}

WT_NO_STATUS_UPDATE=true
cmd_wt_create() { mkdir -p "$WT_ISSUE_WORKTREE_PATH"; }

# This mock will fail if called for issue update
_linear_cli() {
  exit 2
}

cmd_wt_create_from_issue REP-400

if [[ "$WT_ISSUE_LINEAR_SYNCED" != "false" ]]; then
  die "Expected WT_ISSUE_LINEAR_SYNCED=false, got: ${WT_ISSUE_LINEAR_SYNCED}"
fi

if [[ -n "${WT_ISSUE_LINEAR_SYNC_ERROR:-}" ]]; then
  die "Expected no sync error, got: ${WT_ISSUE_LINEAR_SYNC_ERROR}"
fi
RUNNER

  chmod +x "$tmpdir/run_test.sh"
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?

  if [ ${rc:-0} -eq 0 ]; then
    _pass 'WT_NO_STATUS_UPDATE=true skips _linear_cli issue update'
  else
    _fail 'WT_NO_STATUS_UPDATE=true skips _linear_cli issue update' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

test_skip_install_skips_pnpm_and_build() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_skip_install.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail

die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
_step() { echo "STEP: $*" >&2; }
_ok() { :; }
_err() { printf 'x %s\n' "$1" >&2; }
_warn() { printf '%s\n' "$1" >&2; }

# Minimal PATH so `command -v direnv` fails deterministically (has_direnv=false).
PATH="/usr/bin:/bin"

CLR_BOLD="" CLR_DIM="" CLR_RED="" CLR_GREEN="" CLR_YELLOW="" CLR_RESET=""

REPO_ROOT="$tmpdir/repro"
MAIN_CHECKOUT="$tmpdir/repro"
PARENT_DIR="$tmpdir"
WORKSPACE_ROOT="$tmpdir"
SCRIPTS_DIR="$TESTS_DIR/../.."
TMP_DIR="$tmpdir/tmp"
mkdir -p "$REPO_ROOT" "$TMP_DIR"
touch "$MAIN_CHECKOUT/.linear"

slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }

source "$WORKTREE_SH"

# Mock external commands so the non-dry-run path of cmd_wt_create is exercised.
git() {
  case "$1" in
    rev-parse) return 1 ;;
    worktree)
      local wpath="" a
      for a in "$@"; do wpath="$a"; done
      mkdir -p "$wpath"
      return 0
      ;;
    push) return 0 ;;
    *) return 0 ;;
  esac
}
pnpm() { echo "PNPM_INSTALL_RUN" >&2; }
moon() { echo "MOON_BUILD_RUN" >&2; }

# A: dry-run + --skip-install → skip note, no install/build Would-run lines.
WT_SKIP_INSTALL=true
WT_DRY_RUN=true
out_a="$(cmd_wt_create feat/rep-999-skip-a rep-999-skip-a 2>&1)" || die "A: cmd_wt_create failed: $out_a"
printf '%s\n' "$out_a" | grep -q "Would skip: pnpm install + moon run :build (--skip-install)" || die "A: skip note missing: $out_a"
if printf '%s\n' "$out_a" | grep -q "Would run: pnpm install"; then die "A: install Would-run line present: $out_a"; fi
if printf '%s\n' "$out_a" | grep -q "Would run: moon run :build"; then die "A: build Would-run line present: $out_a"; fi

# B: dry-run + default → both Would-run lines present.
WT_SKIP_INSTALL=false
WT_DRY_RUN=true
out_b="$(cmd_wt_create feat/rep-999-skip-b rep-999-skip-b 2>&1)" || die "B: cmd_wt_create failed: $out_b"
printf '%s\n' "$out_b" | grep -q "Would run: pnpm install" || die "B: install Would-run line missing: $out_b"
printf '%s\n' "$out_b" | grep -q "Would run: moon run :build" || die "B: build Would-run line missing: $out_b"

# C: live + --skip-install → steps [1/2] [2/2], pnpm/moon never invoked.
WT_SKIP_INSTALL=true
WT_DRY_RUN=false
out_c="$(cmd_wt_create feat/rep-999-skip-c rep-999-skip-c 2>&1)" || die "C: cmd_wt_create failed: $out_c"
printf '%s\n' "$out_c" | grep -q "STEP: 1 2 Creating git worktree" || die "C: step 1/2 missing: $out_c"
printf '%s\n' "$out_c" | grep -q "STEP: 2 2 Copying local worktree config" || die "C: step 2/2 missing: $out_c"
if printf '%s\n' "$out_c" | grep -q "PNPM_INSTALL_RUN"; then die "C: pnpm install ran despite skip: $out_c"; fi
if printf '%s\n' "$out_c" | grep -q "MOON_BUILD_RUN"; then die "C: moon run :build ran despite skip: $out_c"; fi

# D: live + default → steps [3/4] [4/4], pnpm/moon both invoked.
WT_SKIP_INSTALL=false
WT_DRY_RUN=false
out_d="$(cmd_wt_create feat/rep-999-skip-d rep-999-skip-d 2>&1)" || die "D: cmd_wt_create failed: $out_d"
printf '%s\n' "$out_d" | grep -q "STEP: 3 4 Installing dependencies" || die "D: step 3/4 missing: $out_d"
printf '%s\n' "$out_d" | grep -q "STEP: 4 4 Building packages" || die "D: step 4/4 missing: $out_d"
printf '%s\n' "$out_d" | grep -q "PNPM_INSTALL_RUN" || die "D: pnpm install did not run: $out_d"
printf '%s\n' "$out_d" | grep -q "MOON_BUILD_RUN" || die "D: moon run :build did not run: $out_d"
RUNNER

  chmod +x "$tmpdir/run_test.sh"
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?

  if [ ${rc:-0} -eq 0 ]; then
    _pass 'WT_SKIP_INSTALL skips pnpm install + moon run :build (dry-run + live)'
  else
    _fail 'WT_SKIP_INSTALL skips pnpm install + moon run :build (dry-run + live)' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

test_skip_install_guard_rejects_non_create() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_skip_install_guard.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail

die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
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

# cmd_wt list --skip-install must die with the guard message before reaching
# the list dispatcher.
if ( cmd_wt list --skip-install ) 2>"$tmpdir/guard.err"; then
  die "expected cmd_wt list --skip-install to be rejected"
fi

if ! grep -q -- "--skip-install can only be used with 'create'" "$tmpdir/guard.err"; then
  die "guard message missing: $(cat "$tmpdir/guard.err")"
fi
RUNNER

  chmod +x "$tmpdir/run_test.sh"
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?

  if [ ${rc:-0} -eq 0 ]; then
    _pass 'cmd_wt --skip-install on non-create subcommand dies with guard message'
  else
    _fail 'cmd_wt --skip-install on non-create subcommand dies with guard message' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

# ── REP-1665: resolve existing issue work before minting ─────────────
#
# These three tests use a REAL git sandbox (the resolution logic must
# observe real refs and worktrees, so git is not stubbed here).

# Writes a runner prelude that builds a real git repo on main and sources
# worktree.sh against it (shared by the three REP-1665 tests).
_write_real_git_prelude() {
  cat <<'PRELUDE'
set -euo pipefail

die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
_step() { :; }
_ok() { :; }
_err() { printf 'x %s\n' "$1" >&2; }
_warn() { printf '%s\n' "$1" >&2; }

# CLR_* are set by common.sh in production; worktree.sh's output helpers
# reference them directly and common.sh is not sourced here.
CLR_BOLD="" CLR_DIM="" CLR_RED="" CLR_GREEN="" CLR_YELLOW="" CLR_RESET=""

# Real git sandbox repo on main with one commit.
REPO="$tmpdir/repro"
REPO_ROOT="$REPO"
MAIN_CHECKOUT="$REPO"
PARENT_DIR="$tmpdir"
WORKSPACE_ROOT="$tmpdir"
SCRIPTS_DIR="$TESTS_DIR/../.."
TMP_DIR="$tmpdir/tmp"
mkdir -p "$REPO_ROOT" "$TMP_DIR"
git init -q -b main "$REPO_ROOT"
git -C "$REPO_ROOT" config user.email test@example.com
git -C "$REPO_ROOT" config user.name Test
git -C "$REPO_ROOT" commit -q --allow-empty -m init
touch "$MAIN_CHECKOUT/.linear"

# cd into the sandbox repo: worktree.sh's bare git commands (e.g.
# cmd_wt_create's `git worktree add`, _latest_main_ref's fetch) must resolve
# against the sandbox, never the invoking checkout.
cd "$REPO_ROOT"

slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }

source "$WORKTREE_SH"

# Explicit globals: nothing may depend on unset-variable behavior.
WT_DRY_RUN=false
WT_OPEN=false
WT_NO_STATUS_UPDATE=false
WT_SKIP_INSTALL=true
PRELUDE
}

# Shared metadata stub: Linear hint matches the pre-existing branches below.
_write_metadata_stub() {
  cat <<'STUB'
_resolve_issue_worktree_metadata() {
  WT_ISSUE_UUID='uuid-1'
  WT_ISSUE_IDENTIFIER='REP-123'
  WT_ISSUE_TITLE='Existing delivery'
  WT_ISSUE_BRANCH_NAME='gary/rep-123-existing-delivery'
  WT_ISSUE_STATE_NAME='In Progress'
  WT_ISSUE_STATE_TYPE='started'
}

_linear_cli() {
  printf '%s\n' "$*" >> "$tmpdir/linear_calls.log"
  return 0
}
STUB
}

# Case 1: existing branch WITH a worktree → adopt it. No new branch, no new
# worktree, Path: resolves to the EXISTING worktree, and no Linear status
# churn (the issue is already underway).
test_adopt_existing_branch_with_worktree() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_wt_adopt_existing.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  {
    _write_real_git_prelude
    cat <<'SETUP'

EXISTING_BRANCH='gary/rep-123-existing-delivery-20260806144124-03fa'
EXISTING_WT="$tmpdir/repro-wt-rep-123-existing-delivery"
git -C "$REPO_ROOT" worktree add -b "$EXISTING_BRANCH" "$EXISTING_WT" >/dev/null 2>&1

branches_before="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"
SETUP
    _write_metadata_stub
    cat <<'BODY'

output="$(cmd_wt_create_from_issue REP-123 2>&1)"

branches_after="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"

if [[ "$branches_before" != "$branches_after" ]]; then
  die "adopt minted a new branch (before → after):
$branches_before
---
$branches_after"
fi

resolved_path="$(printf '%s\n' "$output" | sed -n 's/^[[:space:]]*Path:[[:space:]]*//p' | tail -1)"
if [[ "$resolved_path" != "$EXISTING_WT" ]]; then
  die "expected Path: $EXISTING_WT, got: ${resolved_path:-<none>}
output: $output"
fi

if ! printf '%s\n' "$output" | grep -qi 'existing worktree'; then
  die "adoption was not announced:
$output"
fi

if [ -f "$tmpdir/linear_calls.log" ] && grep -q 'issue update' "$tmpdir/linear_calls.log"; then
  die "adopt must not update Linear status:
$(cat "$tmpdir/linear_calls.log")"
fi
BODY
  } > "$tmpdir/run_test.sh"
  chmod +x "$tmpdir/run_test.sh"

  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ ${rc:-0} -eq 0 ]; then
    _pass 'existing branch + existing worktree → adopt (no new branch/worktree, Path: resolves to it)'
  else
    _fail 'existing branch + existing worktree → adopt (no new branch/worktree, Path: resolves to it)' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

# Case 2: existing branch WITHOUT a worktree → reuse the existing branch and
# attach a worktree to it. No new branch may be minted.
test_reattach_existing_branch_without_worktree() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_wt_reattach.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  {
    _write_real_git_prelude
    cat <<'SETUP'

EXISTING_BRANCH='gary/rep-123-existing-delivery-20260806144124-03fa'
git -C "$REPO_ROOT" branch "$EXISTING_BRANCH"

branches_before="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"
SETUP
    _write_metadata_stub
    cat <<'BODY'

output="$(cmd_wt_create_from_issue REP-123 2>&1)"

branches_after="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"

if [[ "$branches_before" != "$branches_after" ]]; then
  die "reattach minted a new branch instead of reusing the existing one:
before:
$branches_before
after:
$branches_after"
fi

if ! git -C "$REPO_ROOT" worktree list --porcelain | grep -q "refs/heads/$EXISTING_BRANCH"; then
  die "existing branch was not attached to a worktree:
$output"
fi

resolved_path="$(printf '%s\n' "$output" | sed -n 's/^[[:space:]]*Path:[[:space:]]*//p' | tail -1)"
if [[ -z "$resolved_path" || ! -d "$resolved_path" ]]; then
  die "expected a Path: line pointing at the attached worktree, got: ${resolved_path:-<none>}
output: $output"
fi
BODY
  } > "$tmpdir/run_test.sh"
  chmod +x "$tmpdir/run_test.sh"

  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ ${rc:-0} -eq 0 ]; then
    _pass 'existing branch without worktree → reattach (no new branch, worktree for existing branch)'
  else
    _fail 'existing branch without worktree → reattach (no new branch, worktree for existing branch)' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

# Case 3 (control): no existing branch for the issue → mint a fresh branch
# prefixed with the Linear hint and create its worktree. Pins the create path
# so the resolver only short-circuits on a real match.
test_create_fresh_when_no_existing_branch() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_wt_create_fresh.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  {
    _write_real_git_prelude
    cat <<'SETUP'

branches_before="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"
SETUP
    _write_metadata_stub
    cat <<'BODY'

output="$(cmd_wt_create_from_issue REP-123 2>&1)"

branches_after="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"

fresh_branch="$(printf '%s\n' "$branches_after" | grep '^gary/rep-123-existing-delivery-' | grep -v -F -x -f <(printf '%s\n' "$branches_before") | head -1 || true)"
if [[ -z "$fresh_branch" ]]; then
  die "expected a fresh branch prefixed with the Linear hint:
$output"
fi

if ! git -C "$REPO_ROOT" worktree list --porcelain | grep -q "refs/heads/$fresh_branch"; then
  die "fresh branch has no worktree:
$output"
fi

resolved_path="$(printf '%s\n' "$output" | sed -n 's/^[[:space:]]*Path:[[:space:]]*//p' | tail -1)"
if [[ -z "$resolved_path" || ! -d "$resolved_path" ]]; then
  die "expected a Path: line pointing at the created worktree, got: ${resolved_path:-<none>}
output: $output"
fi
BODY
  } > "$tmpdir/run_test.sh"
  chmod +x "$tmpdir/run_test.sh"

  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ ${rc:-0} -eq 0 ]; then
    _pass 'no existing branch → mint fresh branch + worktree (create path preserved)'
  else
    _fail 'no existing branch → mint fresh branch + worktree (create path preserved)' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

# Case 4 (hardening, tier semantics): a branch that only matches by issue-id
# substring (tier 3) is adopted, and an exact-hint branch (tier 1) beats a
# hint-prefix mint (tier 2) when both exist. Direct resolver call at the end
# is read-only (no refs/worktrees mutated).
test_resolver_tiers_substring_and_exact_preference() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_wt_resolver_tiers.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  {
    _write_real_git_prelude
    cat <<'SETUP'

# Tier 3: only a substring match exists (the Linear hint matches nothing by
# exact/prefix). The unrelated branch already has a worktree.
TIER3_BRANCH='feat/some-rep-123-unrelated'
TIER3_WT="$tmpdir/repro-wt-some-unrelated"
git -C "$REPO_ROOT" worktree add -b "$TIER3_BRANCH" "$TIER3_WT" >/dev/null 2>&1

branches_before="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"
SETUP
    cat <<'STUB'
_resolve_issue_worktree_metadata() {
  WT_ISSUE_UUID='uuid-1'
  WT_ISSUE_IDENTIFIER='REP-123'
  WT_ISSUE_TITLE='Resolver tiering'
  WT_ISSUE_BRANCH_NAME='feat/rep-123-other'
  WT_ISSUE_STATE_NAME='In Progress'
  WT_ISSUE_STATE_TYPE='started'
}

_linear_cli() {
  printf '%s\n' "$*" >> "$tmpdir/linear_calls.log"
  return 0
}
STUB
    cat <<'BODY'

output="$(cmd_wt_create_from_issue REP-123 2>&1)"

branches_after="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"

if [[ "$branches_before" != "$branches_after" ]]; then
  die "tier-3 adopt minted a new branch (before → after):
$branches_before
---
$branches_after"
fi

resolved_path="$(printf '%s\n' "$output" | sed -n 's/^[[:space:]]*Path:[[:space:]]*//p' | tail -1)"
if [[ "$resolved_path" != "$TIER3_WT" ]]; then
  die "expected tier-3 adopt of $TIER3_WT, got: ${resolved_path:-<none>}
output: $output"
fi

# Tier preference: the exact hint (tier 1) must win over the hint-prefix
# mint (tier 2) regardless of commit-date ordering. Both branches exist
# without worktrees, so the decision is reattach of the exact-hint branch.
git -C "$REPO_ROOT" branch 'feat/rep-123-other-20260102030405-aaaa'
git -C "$REPO_ROOT" branch 'feat/rep-123-other'

decision="$(_resolve_existing_issue_worktree 'REP-123' 'feat/rep-123-other')"
if [[ "$decision" != "reattach feat/rep-123-other" ]]; then
  die "expected exact-hint branch to win (reattach feat/rep-123-other), got: $decision"
fi
BODY
  } > "$tmpdir/run_test.sh"
  chmod +x "$tmpdir/run_test.sh"

  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ ${rc:-0} -eq 0 ]; then
    _pass 'resolver tiers: substring-only match adopted; exact hint beats hint prefix'
  else
    _fail 'resolver tiers: substring-only match adopted; exact hint beats hint prefix' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

# Case 5 (hardening, digit boundary): a tier-3 substring match must not fire
# when the branch's issue number merely EXTENDS the requested one — `rep-123`
# inside `gary/rep-1234-fix-billing` is REP-1234, not REP-123. With only that
# branch (plus its worktree) and a hint that matches nothing, the decision is
# a fresh create; the rep-1234 branch/worktree is never adopted.
test_resolver_digit_boundary_rejects_longer_issue_number() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_wt_digit_boundary.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  {
    _write_real_git_prelude
    cat <<'SETUP'

# Fixture: REP-1234's branch exists WITH a worktree. Its name contains
# `rep-123` as a strict substring of `rep-1234` (slug followed by a digit).
OTHER_ISSUE_BRANCH='gary/rep-1234-fix-billing'
OTHER_ISSUE_WT="$tmpdir/repro-wt-rep-1234-fix-billing"
git -C "$REPO_ROOT" worktree add -b "$OTHER_ISSUE_BRANCH" "$OTHER_ISSUE_WT" >/dev/null 2>&1

branches_before="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"
SETUP
    cat <<'STUB'
_resolve_issue_worktree_metadata() {
  WT_ISSUE_UUID='uuid-1'
  WT_ISSUE_IDENTIFIER='REP-123'
  WT_ISSUE_TITLE='Digit boundary'
  WT_ISSUE_BRANCH_NAME='gary/rep-123-none'
  WT_ISSUE_STATE_NAME='In Progress'
  WT_ISSUE_STATE_TYPE='started'
}

_linear_cli() {
  printf '%s\n' "$*" >> "$tmpdir/linear_calls.log"
  return 0
}
STUB
    cat <<'BODY'

# Read-only resolver: the hint matches nothing, so the only possible match
# would be tier 3 — and `rep-123` inside `gary/rep-1234-fix-billing` is
# followed by a digit (a longer issue number), which must not match.
decision="$(_resolve_existing_issue_worktree 'REP-123' 'gary/rep-123-none')"
if [[ "$decision" != "create" ]]; then
  die "digit boundary: expected create (no partial issue-number match), got: $decision"
fi

# Control: a genuine tier-3 hit (slug followed by '-') still resolves.
BOUNDARY_OK_BRANCH='feat/rep-123-unrelated'
git -C "$REPO_ROOT" branch "$BOUNDARY_OK_BRANCH"
decision="$(_resolve_existing_issue_worktree 'REP-123' 'gary/rep-123-none')"
if [[ "$decision" != "reattach $BOUNDARY_OK_BRANCH" ]]; then
  die "digit boundary over-corrected: expected reattach $BOUNDARY_OK_BRANCH, got: $decision"
fi
git -C "$REPO_ROOT" branch -D "$BOUNDARY_OK_BRANCH" >/dev/null 2>&1

# End-to-end: REP-123 must mint a fresh hint-prefixed branch — never adopt
# the rep-1234 branch or worktree.
output="$(cmd_wt_create_from_issue REP-123 2>&1)"

branches_after="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"

fresh_branch="$(printf '%s\n' "$branches_after" | grep '^gary/rep-123-none-' | grep -v -F -x -f <(printf '%s\n' "$branches_before") | head -1 || true)"
if [[ -z "$fresh_branch" ]]; then
  die "expected a fresh branch prefixed with the Linear hint:
$output"
fi

if printf '%s\n' "$output" | grep -qi 'existing worktree'; then
  die "digit boundary: rep-1234 branch was adopted:
$output"
fi

resolved_path="$(printf '%s\n' "$output" | sed -n 's/^[[:space:]]*Path:[[:space:]]*//p' | tail -1)"
if [[ -z "$resolved_path" || ! -d "$resolved_path" ]]; then
  die "expected a Path: line pointing at the created worktree, got: ${resolved_path:-<none>}
output: $output"
fi

if [[ "$resolved_path" == "$OTHER_ISSUE_WT" ]]; then
  die "digit boundary: rep-1234 worktree was adopted:
$output"
fi
BODY
  } > "$tmpdir/run_test.sh"
  chmod +x "$tmpdir/run_test.sh"

  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ ${rc:-0} -eq 0 ]; then
    _pass 'digit boundary: rep-1234 branch not matched for REP-123 (create, never adopt)'
  else
    _fail 'digit boundary: rep-1234 branch not matched for REP-123 (create, never adopt)' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

# Case 6 (hardening, main checkout): a branch checked out in the
# MAIN_CHECKOUT (the primary checkout) must not be adopted — deliver would
# launch the agent in the primary checkout. Reattach is also impossible (git
# refuses to check a branch out of a second worktree), so the documented
# decision is create: mint a fresh hint-prefixed branch + worktree.
test_main_checkout_branch_not_adopted() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_wt_main_checkout.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  {
    _write_real_git_prelude
    cat <<'SETUP'

# Fixture: the issue branch is checked out in the sandbox's MAIN_CHECKOUT —
# no separate worktree holds it. The prelude already cd'd into the sandbox.
MAIN_HELD_BRANCH='gary/rep-123-existing-delivery'
git -C "$REPO_ROOT" checkout -q -b "$MAIN_HELD_BRANCH"

# Sanity: the branch resolves to the main checkout (not a repro-wt-* dir).
wt_at_main="$(_worktree_path_for_branch "$MAIN_HELD_BRANCH" "$REPO_ROOT")"
if [[ "$wt_at_main" != "$MAIN_CHECKOUT" ]]; then
  die "fixture broken: expected $MAIN_CHECKOUT to hold $MAIN_HELD_BRANCH, got: ${wt_at_main:-<none>}"
fi

branches_before="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"
SETUP
    _write_metadata_stub
    cat <<'BODY'

# Read-only resolver: the branch is held by the main checkout — not
# adoptable, and not reattachable (git forbids a second checkout), so the
# resolver must fall through to create.
decision="$(_resolve_existing_issue_worktree 'REP-123' 'gary/rep-123-existing-delivery')"
if [[ "$decision" != "create" ]]; then
  die "main checkout: expected create (never adopt/reattach the main checkout), got: $decision"
fi

# End-to-end: a fresh REP-123 worktree is minted; the main checkout is never
# announced as the resume target.
output="$(cmd_wt_create_from_issue REP-123 2>&1)"

if printf '%s\n' "$output" | grep -qi 'existing worktree'; then
  die "main checkout was adopted:
$output"
fi

resolved_path="$(printf '%s\n' "$output" | sed -n 's/^[[:space:]]*Path:[[:space:]]*//p' | tail -1)"
if [[ -z "$resolved_path" || ! -d "$resolved_path" ]]; then
  die "expected a Path: line pointing at the created worktree, got: ${resolved_path:-<none>}
output: $output"
fi

if [[ "$resolved_path" == "$MAIN_CHECKOUT" ]]; then
  die "main checkout was adopted as the worktree path:
$output"
fi

fresh_branch="$(printf '%s\n' "$output" | sed -n 's/^[[:space:]]*Branch:[[:space:]]*//p' | tail -1)"
if [[ "$fresh_branch" != "gary/rep-123-existing-delivery-"* ]]; then
  die "expected a fresh branch prefixed with the Linear hint, got: ${fresh_branch:-<none>}
output: $output"
fi
BODY
  } > "$tmpdir/run_test.sh"
  chmod +x "$tmpdir/run_test.sh"

  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ ${rc:-0} -eq 0 ]; then
    _pass 'branch checked out in main checkout → create (never adopt the primary checkout)'
  else
    _fail 'branch checked out in main checkout → create (never adopt the primary checkout)' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

# Case 7 (hardening, tier precedence under coexistence): a hint-prefix mint
# (tier 2) must beat an issue-id substring match (tier 3) regardless of which
# branch is more recently modified. The resolver scans refs/heads sorted by
# committerdate desc, so the branch ORDER in the scan is controlled with
# GIT_COMMITTER_DATE on a commit per branch. Both branches carry worktrees,
# so the winning decision is adopt of the tier-2 worktree.
test_resolver_tier2_prefix_beats_tier3_newest_first() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_wt_tier2_beats_tier3_a.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  {
    _write_real_git_prelude
    cat <<'SETUP'

TIER2_BRANCH='gary/rep-123-existing-delivery-20260806144124-03fa'
TIER2_WT="$tmpdir/repro-wt-rep-123-hint-prefix"
TIER3_BRANCH='feat/some-rep-123-unrelated'
TIER3_WT="$tmpdir/repro-wt-rep-123-substring"

# Scan order fixture: tier 2 carries the NEWER commit, so the resolver
# visits tier 2 FIRST and tier 3 second (committerdate desc).
git -C "$REPO_ROOT" worktree add -b "$TIER3_BRANCH" "$TIER3_WT" >/dev/null 2>&1
GIT_COMMITTER_DATE='2026-03-01T09:00:00' git -C "$TIER3_WT" commit -q --allow-empty -m 'tier3 work'
git -C "$REPO_ROOT" worktree add -b "$TIER2_BRANCH" "$TIER2_WT" >/dev/null 2>&1
GIT_COMMITTER_DATE='2026-03-02T09:00:00' git -C "$TIER2_WT" commit -q --allow-empty -m 'tier2 work'

scan_order="$(git -C "$REPO_ROOT" for-each-ref --sort=-committerdate --format='%(refname:short)' refs/heads | grep -E "$TIER2_BRANCH|$TIER3_BRANCH" | tr '\n' '|')"
if [[ "$scan_order" != "$TIER2_BRANCH|$TIER3_BRANCH|" ]]; then
  die "fixture broken: expected tier2 before tier3 in committerdate-desc order, got: $scan_order"
fi

branches_before="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"
SETUP
    _write_metadata_stub
    cat <<'BODY'

output="$(cmd_wt_create_from_issue REP-123 2>&1)"

branches_after="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"

if [[ "$branches_before" != "$branches_after" ]]; then
  die "tier coexistence minted a new branch (before → after):
$branches_before
---
$branches_after"
fi

resolved_path="$(printf '%s\n' "$output" | sed -n 's/^[[:space:]]*Path:[[:space:]]*//p' | tail -1)"
if [[ "$resolved_path" != "$TIER2_WT" ]]; then
  die "tier precedence: expected the hint-prefix (tier 2) worktree to win over the substring (tier 3) match, got: ${resolved_path:-<none>}
output: $output"
fi

if ! printf '%s\n' "$output" | grep -qi 'existing worktree'; then
  die "tier-2 adoption was not announced:
$output"
fi
BODY
  } > "$tmpdir/run_test.sh"
  chmod +x "$tmpdir/run_test.sh"

  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ ${rc:-0} -eq 0 ]; then
    _pass 'tier precedence: hint prefix (tier 2) beats substring (tier 3) when tier 3 is scanned first'
  else
    _fail 'tier precedence: hint prefix (tier 2) beats substring (tier 3) when tier 3 is scanned first' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

# Case 8 (hardening, tier precedence under coexistence): same two branches as
# case 7 but with the committerdate order flipped — the tier-3 substring
# match is now the NEWEST branch and is scanned first. Tier 2 must still win.
test_resolver_tier2_prefix_beats_tier3_oldest_first() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_wt_tier2_beats_tier3_b.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  {
    _write_real_git_prelude
    cat <<'SETUP'

TIER2_BRANCH='gary/rep-123-existing-delivery-20260806144124-03fa'
TIER2_WT="$tmpdir/repro-wt-rep-123-hint-prefix"
TIER3_BRANCH='feat/some-rep-123-unrelated'
TIER3_WT="$tmpdir/repro-wt-rep-123-substring"

# Scan order fixture: tier 3 carries the NEWER commit, so the resolver
# visits tier 3 FIRST and tier 2 second (committerdate desc).
git -C "$REPO_ROOT" worktree add -b "$TIER2_BRANCH" "$TIER2_WT" >/dev/null 2>&1
GIT_COMMITTER_DATE='2026-03-01T09:00:00' git -C "$TIER2_WT" commit -q --allow-empty -m 'tier2 work'
git -C "$REPO_ROOT" worktree add -b "$TIER3_BRANCH" "$TIER3_WT" >/dev/null 2>&1
GIT_COMMITTER_DATE='2026-03-02T09:00:00' git -C "$TIER3_WT" commit -q --allow-empty -m 'tier3 work'

scan_order="$(git -C "$REPO_ROOT" for-each-ref --sort=-committerdate --format='%(refname:short)' refs/heads | grep -E "$TIER2_BRANCH|$TIER3_BRANCH" | tr '\n' '|')"
if [[ "$scan_order" != "$TIER3_BRANCH|$TIER2_BRANCH|" ]]; then
  die "fixture broken: expected tier3 before tier2 in committerdate-desc order, got: $scan_order"
fi

branches_before="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"
SETUP
    _write_metadata_stub
    cat <<'BODY'

output="$(cmd_wt_create_from_issue REP-123 2>&1)"

branches_after="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"

if [[ "$branches_before" != "$branches_after" ]]; then
  die "tier coexistence minted a new branch (before → after):
$branches_before
---
$branches_after"
fi

resolved_path="$(printf '%s\n' "$output" | sed -n 's/^[[:space:]]*Path:[[:space:]]*//p' | tail -1)"
if [[ "$resolved_path" != "$TIER2_WT" ]]; then
  die "tier precedence: expected the hint-prefix (tier 2) worktree to win even when the substring (tier 3) match is newer, got: ${resolved_path:-<none>}
output: $output"
fi

if ! printf '%s\n' "$output" | grep -qi 'existing worktree'; then
  die "tier-2 adoption was not announced:
$output"
fi
BODY
  } > "$tmpdir/run_test.sh"
  chmod +x "$tmpdir/run_test.sh"

  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ ${rc:-0} -eq 0 ]; then
    _pass 'tier precedence: hint prefix (tier 2) beats substring (tier 3) when tier 3 is newest'
  else
    _fail 'tier precedence: hint prefix (tier 2) beats substring (tier 3) when tier 3 is newest' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

# Case 12 (round-3 review, tier-1 replacement): both the exact Linear hint
# (tier 1) and a hint-prefix mint (tier 2) exist, with tier 2 carrying the
# NEWER commit so the resolver scans it FIRST. The tier-1 branch must still
# win unconditionally — a newer tier-2 hit never replaces the exact hint.
# Both branches have worktrees, so the winner is adopted.
test_resolver_tier1_replaces_newer_tier2() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_wt_tier1_beats_tier2.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  {
    _write_real_git_prelude
    cat <<'SETUP'

TIER1_BRANCH='gary/rep-123-existing-delivery'
TIER1_WT="$tmpdir/repro-wt-rep-123-existing-delivery"
TIER2_BRANCH='gary/rep-123-existing-delivery-20260806144124-03fa'
TIER2_WT="$tmpdir/repro-wt-rep-123-hint-prefix"

# Scan order fixture: tier 2 carries the NEWER commit, so the resolver
# visits tier 2 FIRST and the exact-hint tier 1 second (committerdate desc).
git -C "$REPO_ROOT" worktree add -b "$TIER1_BRANCH" "$TIER1_WT" >/dev/null 2>&1
GIT_COMMITTER_DATE='2026-03-01T09:00:00' git -C "$TIER1_WT" commit -q --allow-empty -m 'tier1 work'
git -C "$REPO_ROOT" worktree add -b "$TIER2_BRANCH" "$TIER2_WT" >/dev/null 2>&1
GIT_COMMITTER_DATE='2026-03-02T09:00:00' git -C "$TIER2_WT" commit -q --allow-empty -m 'tier2 work'

scan_order="$(git -C "$REPO_ROOT" for-each-ref --sort=-committerdate --format='%(refname:short)' refs/heads | grep -xE "$TIER1_BRANCH|$TIER2_BRANCH" | tr '\n' '|')"
if [[ "$scan_order" != "$TIER2_BRANCH|$TIER1_BRANCH|" ]]; then
  die "fixture broken: expected tier2 before tier1 in committerdate-desc order, got: $scan_order"
fi

branches_before="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"
SETUP
    _write_metadata_stub
    cat <<'BODY'

output="$(cmd_wt_create_from_issue REP-123 2>&1)"

branches_after="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"

if [[ "$branches_before" != "$branches_after" ]]; then
  die "tier coexistence minted a new branch (before → after):
$branches_before
---
$branches_after"
fi

resolved_path="$(printf '%s\n' "$output" | sed -n 's/^[[:space:]]*Path:[[:space:]]*//p' | tail -1)"
if [[ "$resolved_path" != "$TIER1_WT" ]]; then
  die "tier precedence: expected the exact-hint (tier 1) worktree to win even when the hint-prefix (tier 2) match is newer, got: ${resolved_path:-<none>}
output: $output"
fi

if ! printf '%s\n' "$output" | grep -qi 'existing worktree'; then
  die "tier-1 adoption was not announced:
$output"
fi

if [ -f "$tmpdir/linear_calls.log" ] && grep -q 'issue update' "$tmpdir/linear_calls.log"; then
  die "tier-1 adopt must not update Linear status:
$(cat "$tmpdir/linear_calls.log")"
fi
BODY
  } > "$tmpdir/run_test.sh"
  chmod +x "$tmpdir/run_test.sh"

  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ ${rc:-0} -eq 0 ]; then
    _pass 'tier precedence: exact hint (tier 1) beats newer hint prefix (tier 2)'
  else
    _fail 'tier precedence: exact hint (tier 1) beats newer hint prefix (tier 2)' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

# Case 9 (hardening, stale registration): the matched branch still has a
# `git worktree list` registration whose directory was deleted (rm -rf, no
# prune). The resolver sees a registered-but-missing path and decides
# reattach; `git worktree add` would otherwise die with "missing but already
# registered worktree" and kill the whole reproctl run. The reattach path
# must prune the stale registration first, then attach the existing branch to
# a (re)created worktree — no new branch, no hard failure.
test_reattach_after_stale_worktree_registration() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_wt_stale_registration.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  {
    _write_real_git_prelude
    cat <<'SETUP'

EXISTING_BRANCH='gary/rep-123-existing-delivery-20260806144124-03fa'
EXISTING_WT="$tmpdir/repro-wt-rep-123-20260806144124-03fa"
git -C "$REPO_ROOT" worktree add -b "$EXISTING_BRANCH" "$EXISTING_WT" >/dev/null 2>&1

# Delete the directory WITHOUT pruning: the registration must survive.
rm -rf "$EXISTING_WT"

stale_path="$(_worktree_path_for_branch "$EXISTING_BRANCH" "$REPO_ROOT")"
if [[ "$stale_path" != "$EXISTING_WT" ]]; then
  die "fixture broken: expected stale registration at $EXISTING_WT, got: ${stale_path:-<none>}"
fi
if [ -d "$stale_path" ]; then
  die "fixture broken: expected $EXISTING_WT to be missing (rm -rf, no prune)"
fi

branches_before="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"
SETUP
    _write_metadata_stub
    cat <<'BODY'

output="$(cmd_wt_create_from_issue REP-123 2>&1)"

branches_after="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"

if [[ "$branches_before" != "$branches_after" ]]; then
  die "reattach over a stale registration minted a new branch (before → after):
$branches_before
---
$branches_after"
fi

if ! git -C "$REPO_ROOT" worktree list --porcelain | grep -q "refs/heads/$EXISTING_BRANCH"; then
  die "existing branch was not attached to a worktree:
$output"
fi

resolved_path="$(printf '%s\n' "$output" | sed -n 's/^[[:space:]]*Path:[[:space:]]*//p' | tail -1)"
if [[ -z "$resolved_path" || ! -d "$resolved_path" ]]; then
  die "expected a Path: line pointing at the reattached worktree, got: ${resolved_path:-<none>}
output: $output"
fi

if [[ "$resolved_path" != "$EXISTING_WT" ]]; then
  die "expected the reattach to reuse the recomputed path $EXISTING_WT, got: $resolved_path"
fi
BODY
  } > "$tmpdir/run_test.sh"
  chmod +x "$tmpdir/run_test.sh"

  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ ${rc:-0} -eq 0 ]; then
    _pass 'stale worktree registration → prune + reattach (no new branch, no hard failure)'
  else
    _fail 'stale worktree registration → prune + reattach (no new branch, no hard failure)' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

# Case 10 (blocker regression, round-3 review): the reattach wrapper calls
# `_create_issue_worktree_from_metadata` inside `if ! ...`, which SUSPENDS
# errexit for the entire call chain — a bare failing command inside
# cmd_wt_create (pnpm install) no longer aborts the run on its own. The
# install/build/direnv steps must fail loudly via explicit `|| return $?`
# guards: non-zero exit, die message surfaced, moon never reached, and no
# Linear `issue update` churn from a broken install.
test_reattach_install_failure_fails_loudly() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_wt_reattach_install_fail.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  # Failing pnpm + canary moon on the runner's PATH. pnpm logs then exits 1;
  # moon logs then exits 0 — reaching its log means the failure was swallowed.
  mkdir -p "$tmpdir/failbin"
  cat > "$tmpdir/failbin/pnpm" <<STUB
#!/bin/bash
printf 'pnpm-install-failed\n' >> "$tmpdir/pnpm.log"
exit 1
STUB
  cat > "$tmpdir/failbin/moon" <<STUB
#!/bin/bash
printf 'moon-build-ran\n' >> "$tmpdir/moon.log"
exit 0
STUB
  chmod +x "$tmpdir/failbin/pnpm" "$tmpdir/failbin/moon"

  {
    _write_real_git_prelude
    cat <<'SETUP'

# The prelude sets WT_SKIP_INSTALL=true globally; override it so the
# install/build steps actually run on the reattach path.
WT_SKIP_INSTALL=false
export PATH="$tmpdir/failbin:$PATH"

EXISTING_BRANCH='gary/rep-123-existing-delivery-20260806144124-03fa'
git -C "$REPO_ROOT" branch "$EXISTING_BRANCH"

branches_before="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"
SETUP
    _write_metadata_stub
    cat <<'BODY'

rc=0
output="$(cmd_wt_create_from_issue REP-123 2>&1)" || rc=$?

if [ "$rc" -eq 0 ]; then
  die "reattach install failure exited 0 (errexit suspended on the reattach chain):
$output"
fi

if ! printf '%s\n' "$output" | grep -q 'Failed to attach a worktree to the existing branch'; then
  die "reattach install failure was not surfaced via the die message:
$output"
fi

# The die message must point at the failing phase: for install/copy/config
# failures the stale-prune remediation below it is noise.
if ! printf '%s\n' "$output" | grep -q 'check the step output above for the failing phase'; then
  die "die message missing the failing-phase hint:
$output"
fi

if [ ! -f "$tmpdir/pnpm.log" ] || ! grep -q 'pnpm-install-failed' "$tmpdir/pnpm.log"; then
  die "fixture broken: the failing pnpm stub did not run:
$output"
fi

if [ -f "$tmpdir/moon.log" ]; then
  die "moon run :build was reached after pnpm install failed:
$(cat "$tmpdir/moon.log")"
fi

if [ -f "$tmpdir/linear_calls.log" ] && grep -q 'issue update' "$tmpdir/linear_calls.log"; then
  die "broken install churned Linear status (issue update was called):
$(cat "$tmpdir/linear_calls.log")"
fi

branches_after="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"
if [[ "$branches_before" != "$branches_after" ]]; then
  die "failed reattach minted a new branch (before → after):
$branches_before
---
$branches_after"
fi
BODY
  } > "$tmpdir/run_test.sh"
  chmod +x "$tmpdir/run_test.sh"

  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ ${rc:-0} -eq 0 ]; then
    _pass 'reattach install failure → loud failure (non-zero exit, die message, no moon, no Linear update)'
  else
    _fail 'reattach install failure → loud failure (non-zero exit, die message, no moon, no Linear update)' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

# Case 11 (round-3 review, prune scoping): the stale-registration prune must
# only fire when the registration AT THE REATTACH TARGET is the stale one.
# A stale registration for a DIFFERENT path (e.g. a worktree on an unmounted
# external volume) must be warned about and left untouched — repo-wide
# pruning would silently unregister live issue branches elsewhere.
test_prune_skips_stale_registration_elsewhere() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_wt_stale_elsewhere.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  {
    _write_real_git_prelude
    cat <<'SETUP'

# Stale-elsewhere fixture: a registered worktree on an unrelated branch whose
# directory was deleted without a prune. Its branch name matches no resolver
# tier for REP-123.
ELSEWHERE_BRANCH='feat/totally-unrelated'
ELSEWHERE_WT="$tmpdir/repro-wt-unrelated"
git -C "$REPO_ROOT" worktree add -b "$ELSEWHERE_BRANCH" "$ELSEWHERE_WT" >/dev/null 2>&1
rm -rf "$ELSEWHERE_WT"

# The reattach TARGET branch exists without any worktree: nothing is stale
# at the target path, so no prune may run at all.
EXISTING_BRANCH='gary/rep-123-existing-delivery-20260806144124-03fa'
git -C "$REPO_ROOT" branch "$EXISTING_BRANCH"

branches_before="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"
SETUP
    _write_metadata_stub
    cat <<'BODY'

output="$(cmd_wt_create_from_issue REP-123 2>&1)"

branches_after="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"

if [[ "$branches_before" != "$branches_after" ]]; then
  die "reattach minted a new branch (before → after):
$branches_before
---
$branches_after"
fi

if ! git -C "$REPO_ROOT" worktree list --porcelain | grep -q "refs/heads/$EXISTING_BRANCH"; then
  die "existing branch was not attached to a worktree:
$output"
fi

resolved_path="$(printf '%s\n' "$output" | sed -n 's/^[[:space:]]*Path:[[:space:]]*//p' | tail -1)"
if [[ "$resolved_path" != "$tmpdir/repro-wt-rep-123-20260806144124-03fa" ]]; then
  die "expected the reattach target path, got: ${resolved_path:-<none>}
output: $output"
fi

if ! printf '%s\n' "$output" | grep -q 'left untouched (no prune)'; then
  die "stale-elsewhere registration was not flagged as skipped:
$output"
fi

if ! git -C "$REPO_ROOT" worktree list --porcelain | grep -qF "worktree $ELSEWHERE_WT"; then
  die "stale-elsewhere registration was pruned (prune scope is too wide):
$(git -C "$REPO_ROOT" worktree list --porcelain)"
fi
BODY
  } > "$tmpdir/run_test.sh"
  chmod +x "$tmpdir/run_test.sh"

  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ ${rc:-0} -eq 0 ]; then
    _pass 'stale registration elsewhere → warn, no prune, target reattach proceeds'
  else
    _fail 'stale registration elsewhere → warn, no prune, target reattach proceeds' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

# Case 13 (non-blocker review fix, combined stale disclosure): when the stale
# registration sits AT the reattach target, the repo-wide `git worktree prune`
# also destroys stale registrations for OTHER paths. The warning must disclose
# those collateral paths — silently unregistering them is the failure mode a
# target-only warning hides.
test_reattach_prune_warns_about_collateral_stale_paths() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_wt_combined_stale.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  {
    _write_real_git_prelude
    cat <<'SETUP'

# Stale AT the reattach target: the matched branch's registered worktree
# directory was deleted without a prune.
EXISTING_BRANCH='gary/rep-123-existing-delivery-20260806144124-03fa'
EXISTING_WT="$tmpdir/repro-wt-rep-123-20260806144124-03fa"
git -C "$REPO_ROOT" worktree add -b "$EXISTING_BRANCH" "$EXISTING_WT" >/dev/null 2>&1
rm -rf "$EXISTING_WT"

# Collateral stale registration elsewhere (registered, directory missing).
ELSEWHERE_BRANCH='feat/totally-unrelated'
ELSEWHERE_WT="$tmpdir/repro-wt-unrelated"
git -C "$REPO_ROOT" worktree add -b "$ELSEWHERE_BRANCH" "$ELSEWHERE_WT" >/dev/null 2>&1
rm -rf "$ELSEWHERE_WT"

# Fixture sanity: both registrations exist and both directories are missing.
if ! git -C "$REPO_ROOT" worktree list --porcelain | grep -qF "worktree $EXISTING_WT"; then
  die "fixture broken: no stale registration at the reattach target $EXISTING_WT"
fi
if ! git -C "$REPO_ROOT" worktree list --porcelain | grep -qF "worktree $ELSEWHERE_WT"; then
  die "fixture broken: no stale registration at $ELSEWHERE_WT"
fi
if [ -d "$EXISTING_WT" ] || [ -d "$ELSEWHERE_WT" ]; then
  die "fixture broken: stale fixture directories must be missing"
fi

branches_before="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"
SETUP
    _write_metadata_stub
    cat <<'BODY'

output="$(cmd_wt_create_from_issue REP-123 2>&1)"

branches_after="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"

if [[ "$branches_before" != "$branches_after" ]]; then
  die "reattach over combined stale registrations minted a new branch (before → after):
$branches_before
---
$branches_after"
fi

if ! git -C "$REPO_ROOT" worktree list --porcelain | grep -qF "refs/heads/$EXISTING_BRANCH"; then
  die "reattach over combined stale registrations did not attach the existing branch:
$output"
fi

resolved_path="$(printf '%s\n' "$output" | sed -n 's/^[[:space:]]*Path:[[:space:]]*//p' | tail -1)"
if [[ "$resolved_path" != "$EXISTING_WT" ]]; then
  die "expected the reattach to reuse the recomputed path $EXISTING_WT, got: ${resolved_path:-<none>}
output: $output"
fi

if ! printf '%s\n' "$output" | grep -q 'also removes stale registrations for'; then
  die "combined-stale prune warning did not disclose the collateral destruction:
$output"
fi

if ! printf '%s\n' "$output" | grep -qF "$ELSEWHERE_WT"; then
  die "combined-stale prune warning did not name the collateral stale path $ELSEWHERE_WT:
$output"
fi

# The disclosed behavior: the repo-wide prune removed the collateral
# registration too (warned about, not silently destroyed).
if git -C "$REPO_ROOT" worktree list --porcelain | grep -qF "worktree $ELSEWHERE_WT"; then
  die "collateral stale registration at $ELSEWHERE_WT survived the disclosed prune:
$(git -C "$REPO_ROOT" worktree list --porcelain)"
fi
BODY
  } > "$tmpdir/run_test.sh"
  chmod +x "$tmpdir/run_test.sh"

  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ ${rc:-0} -eq 0 ]; then
    _pass 'stale at target AND elsewhere → prune warns and names the collateral stale paths'
  else
    _fail 'stale at target AND elsewhere → prune warns and names the collateral stale paths' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

# Case 14 (non-blocker review fix, reattach must not publish): reattach
# attaches a PRE-EXISTING branch — possibly a tier-3-matched foreign local
# branch. cmd_wt_create's `git push -u origin` exists for freshly minted
# branches; on reattach it would silently publish someone else's branch. A
# bare origin proves the negative: main is pushable (fixture sanity), the
# foreign branch is never pushed, and the fresh-mint control still pushes
# (the no-push rule must not leak into the mint path).
test_reattach_skips_push_but_mint_still_pushes() {
  local tmpdir output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_wt_reattach_no_push.XXXXXX")"
  export tmpdir
  trap 'rm -rf "$tmpdir"' RETURN

  {
    _write_real_git_prelude
    cat <<'SETUP'

# Bare origin: pushable target for the negative assertion. Seeded with main
# so ls-remote proves the remote actually receives pushes.
ORIGIN="$tmpdir/origin.git"
git -C "$REPO_ROOT" init -q --bare -b main "$ORIGIN"
git -C "$REPO_ROOT" remote add origin "$ORIGIN"
git -C "$REPO_ROOT" push -q origin main
if [ -z "$(git -C "$REPO_ROOT" ls-remote origin refs/heads/main)" ]; then
  die "fixture broken: origin did not receive the seeded main ref"
fi

# Foreign local branch: matches REP-123 only via the tier-3 issue-id
# substring, has no worktree, and is NOT on origin.
FOREIGN_BRANCH='feat/some-rep-123-unrelated'
git -C "$REPO_ROOT" branch "$FOREIGN_BRANCH"
if [ -n "$(git -C "$REPO_ROOT" ls-remote origin "refs/heads/$FOREIGN_BRANCH")" ]; then
  die "fixture broken: origin already has the foreign branch"
fi

branches_before="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"
SETUP
    _write_metadata_stub
    cat <<'BODY'

output="$(cmd_wt_create_from_issue REP-123 2>&1)"

# Reattach succeeded: foreign branch attached, no new branch minted.
branches_after="$(git -C "$REPO_ROOT" for-each-ref --format='%(refname:short)' refs/heads | sort)"
if [[ "$branches_before" != "$branches_after" ]]; then
  die "reattach minted a new branch (before → after):
$branches_before
---
$branches_after"
fi

if ! git -C "$REPO_ROOT" worktree list --porcelain | grep -qF "refs/heads/$FOREIGN_BRANCH"; then
  die "reattach did not attach the foreign branch:
$output"
fi

# The core assertion: attaching a pre-existing branch must NOT publish it.
if [ -n "$(git -C "$REPO_ROOT" ls-remote origin "refs/heads/$FOREIGN_BRANCH")" ]; then
  die "reattach published a pre-existing (foreign) local branch to origin:
$output"
fi

# Control: a fresh mint for a DIFFERENT issue must still push to origin —
# proves the no-push rule is scoped to reattach, not stuck on the process.
_resolve_issue_worktree_metadata() {
  WT_ISSUE_UUID='uuid-2'
  WT_ISSUE_IDENTIFIER='REP-456'
  WT_ISSUE_TITLE='Fresh mint control'
  WT_ISSUE_BRANCH_NAME='gary/rep-456-fresh-feature'
  WT_ISSUE_STATE_NAME='Todo'
  WT_ISSUE_STATE_TYPE='unstarted'
}

mint_output="$(cmd_wt_create_from_issue REP-456 2>&1)"

mint_branch="$(printf '%s\n' "$mint_output" | sed -n 's/^[[:space:]]*Branch:[[:space:]]*//p' | tail -1)"
if [[ "$mint_branch" != 'gary/rep-456-fresh-feature-'* ]]; then
  die "control did not mint a fresh hint-prefixed branch, got: ${mint_branch:-<none>}
$mint_output"
fi

if [ -z "$(git -C "$REPO_ROOT" ls-remote origin "refs/heads/$mint_branch")" ]; then
  die "fresh mint was not pushed to origin (no-push rule leaked into the mint path):
$mint_output"
fi
BODY
  } > "$tmpdir/run_test.sh"
  chmod +x "$tmpdir/run_test.sh"

  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ ${rc:-0} -eq 0 ]; then
    _pass 'reattach does not push the foreign branch to origin; fresh-mint control still pushes'
  else
    _fail 'reattach does not push the foreign branch to origin; fresh-mint control still pushes' "$output"
  fi
  rm -rf "$tmpdir"
  trap - RETURN
}

test_records_linear_sync_failure
test_creates_issue_worktree_path_from_metadata
test_resolve_issue_worktree_metadata_parses_cli_json
test_resolve_issue_worktree_metadata_rejects_invalid_id
test_resolve_issue_worktree_metadata_dies_on_empty_branch
test_no_status_update_skips_linear_cli
test_skip_install_skips_pnpm_and_build
test_skip_install_guard_rejects_non_create
test_adopt_existing_branch_with_worktree
test_reattach_existing_branch_without_worktree
test_create_fresh_when_no_existing_branch
test_resolver_tiers_substring_and_exact_preference
test_resolver_digit_boundary_rejects_longer_issue_number
test_main_checkout_branch_not_adopted
test_resolver_tier2_prefix_beats_tier3_newest_first
test_resolver_tier2_prefix_beats_tier3_oldest_first
test_resolver_tier1_replaces_newer_tier2
test_reattach_after_stale_worktree_registration
test_reattach_install_failure_fails_loudly
test_prune_skips_stale_registration_elsewhere
test_reattach_prune_warns_about_collateral_stale_paths
test_reattach_skips_push_but_mint_still_pushes

printf '\nResults: %d passed, %d failed out of 22 tests\n' "$PASS" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
