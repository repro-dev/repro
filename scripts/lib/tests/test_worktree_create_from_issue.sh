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

test_records_linear_sync_failure
test_creates_issue_worktree_path_from_metadata
test_resolve_issue_worktree_metadata_parses_cli_json
test_resolve_issue_worktree_metadata_rejects_invalid_id
test_resolve_issue_worktree_metadata_dies_on_empty_branch
test_no_status_update_skips_linear_cli
test_skip_install_skips_pnpm_and_build

printf '\nResults: %d passed, %d failed out of 7 tests\n' "$PASS" "$FAIL"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
