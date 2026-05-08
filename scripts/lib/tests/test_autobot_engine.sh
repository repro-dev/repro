#!/bin/bash
# scripts/lib/tests/test_autobot_engine.sh

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SCRIPTS_DIR="$TESTS_DIR/../.."

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

_make_tmpdir() {
  mktemp -d 2>/dev/null || mktemp -d -t test_autobot_engine
}

test_help_mentions_commands() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail
die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
_err() { printf '✖ %s\n' "$*" >&2; }
_ok() { printf '✔ %s\n' "$*" >&2; }
_step() { :; }
_warn() { printf '⚠ %s\n' "$*" >&2; }
CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
REPO_ROOT="$TEST_TMPDIR/repro"
MAIN_CHECKOUT="$TEST_TMPDIR/repro"
PARENT_DIR="$TEST_TMPDIR"
WORKSPACE_ROOT="$TEST_TMPDIR/workspaces"
SCRIPTS_DIR="$TEST_SCRIPTS_DIR"
TMP_DIR="$TEST_TMPDIR/tmp"
mkdir -p "$TEST_TMPDIR/repro" "$TEST_TMPDIR/workspaces" "$TEST_TMPDIR/tmp"
slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }
source "$SCRIPTS_DIR/lib/autobot-engine.sh"
cmd_autobot_engine --help
RUNNER
  chmod +x "$tmpdir/run_test.sh"
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'start \[--daemon'; then
    _pass 'cmd_autobot_engine --help mentions command surface'
  else
    _fail 'cmd_autobot_engine --help mentions command surface' "rc=$rc; output=$output"
  fi
}

test_foreground_start_once_writes_metadata() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail
die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
_err() { printf '✖ %s\n' "$*" >&2; }
_ok() { printf '✔ %s\n' "$*" >&2; }
_step() { :; }
_warn() { printf '⚠ %s\n' "$*" >&2; }
CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
REPO_ROOT="$TEST_TMPDIR/repro"
MAIN_CHECKOUT="$TEST_TMPDIR/repro"
PARENT_DIR="$TEST_TMPDIR"
WORKSPACE_ROOT="$TEST_TMPDIR/workspaces"
SCRIPTS_DIR="$TEST_SCRIPTS_DIR"
TMP_DIR="$TEST_TMPDIR/tmp"
mkdir -p "$TEST_TMPDIR/repro/.autobot" "$TEST_TMPDIR/workspaces/repro-wt-rep-1094" "$TEST_TMPDIR/tmp"
git -C "$TEST_TMPDIR/workspaces/repro-wt-rep-1094" init >/dev/null 2>&1
slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }
  source "$SCRIPTS_DIR/lib/autobot-engine.sh"
  git() {
    if [[ "$*" == *"$MAIN_CHECKOUT"*"fetch --prune origin main"* ]]; then
      printf '%s\n' "$*" >> "$TEST_TMPDIR/git.log"
      return 0
    fi
    command git "$@"
  }
  cmd_opencode() {
    printf '%s\n' "$*" >> "$TEST_TMPDIR/opencode.log"
    printf 'phase output: %s\n' "$*"
  }
  cmd_autonomy() {
    case "$*" in
      status\ --all\ --json)
        printf '%s\n' "{\"items\":[{\"issue_identifier\":\"REP-1094\",\"claim_state\":\"claimed\",\"workspace_path\":\"$TEST_TMPDIR/workspaces/repro-wt-rep-1094\",\"attempt_count\":0}],\"runs\":[],\"summary\":{\"claim_states\":{\"claimed\":1},\"active_runs\":0,\"stale_claims\":0,\"failed_runs\":0,\"sync_errors\":0},\"recent_errors\":[],\"generated_at\":\"2026-05-08T12:00:00Z\"}"
        ;;
    run\ start\ REP-1094\ --phase\ delivery\ --workspace\ *)
      printf '%s\n' '{"run":{"attempt":1}}'
      ;;
    run\ finish\ REP-1094\ --attempt\ 1\ --state\ finished)
      printf '%s\n' '{"run":{"attempt":1}}'
      ;;
    release\ REP-1094\ --reason\ autobot-engine\ completed)
      printf '%s\n' '{"claim":{"issue_identifier":"REP-1094"}}'
      ;;
    *)
      return 1
      ;;
  esac
}
cmd_autobot_engine start --once
RUNNER
  chmod +x "$tmpdir/run_test.sh"
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ $rc -eq 0 ] && [ -f "$tmpdir/repro/.autobot/status.json" ] && [ -f "$tmpdir/repro/.autobot/runs/REP-1094-attempt-1/plan.md" ] && [ -f "$tmpdir/repro/.autobot/runs/REP-1094-attempt-1/release.md" ] && [ -f "$tmpdir/git.log" ] && grep -q 'fetch --prune origin main' "$tmpdir/git.log" && [ -f "$tmpdir/opencode.log" ] && grep -q 'Issue: REP-1094' "$tmpdir/opencode.log" && ! grep -q -- '--issue' "$tmpdir/opencode.log"; then
    if python3 - "$tmpdir/repro/.autobot/status.json" <<'PY'
import json
import sys
from pathlib import Path

status = json.loads(Path(sys.argv[1]).read_text())
assert "engine" in status and "queue" in status
assert status["engine"]["running"] is True
PY
    then
      _pass 'foreground start --once writes metadata, status shape, and fetches main checkout'
    else
      _fail 'foreground start --once writes metadata, status shape, and fetches main checkout' "status.json shape invalid; output=$output"
    fi
  else
    _fail 'foreground start --once writes metadata, status shape, and fetches main checkout' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_second_start_is_rejected_by_lock() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail
die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
_err() { printf '✖ %s\n' "$*" >&2; }
_ok() { printf '✔ %s\n' "$*" >&2; }
_step() { :; }
_warn() { printf '⚠ %s\n' "$*" >&2; }
CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
REPO_ROOT="$TEST_TMPDIR/repro"
MAIN_CHECKOUT="$TEST_TMPDIR/repro"
PARENT_DIR="$TEST_TMPDIR"
WORKSPACE_ROOT="$TEST_TMPDIR/workspaces"
SCRIPTS_DIR="$TEST_SCRIPTS_DIR"
TMP_DIR="$TEST_TMPDIR/tmp"
mkdir -p "$TEST_TMPDIR/repro/.autobot" "$TMP_DIR"
printf '%s\n' "$$" > "$TEST_TMPDIR/repro/.autobot/engine.pid"
mkdir -p "$TEST_TMPDIR/repro/.autobot/engine.lock"
slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }
source "$SCRIPTS_DIR/lib/autobot-engine.sh"
cmd_autobot_engine start --once
RUNNER
  chmod +x "$tmpdir/run_test.sh"
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q 'already running'; then
    _pass 'second engine start is rejected when the lock is held'
  else
    _fail 'second engine start is rejected when the lock is held' "rc=$rc; output=$output"
  fi
}

test_worktree_guard_rejects_non_main_checkout() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail
die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
_err() { printf '✖ %s\n' "$*" >&2; }
_ok() { printf '✔ %s\n' "$*" >&2; }
_step() { :; }
_warn() { printf '⚠ %s\n' "$*" >&2; }
CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
REPO_ROOT="$TEST_TMPDIR/worktree"
MAIN_CHECKOUT="$TEST_TMPDIR/repro"
PARENT_DIR="$TEST_TMPDIR"
WORKSPACE_ROOT="$TEST_TMPDIR/workspaces"
SCRIPTS_DIR="$TEST_SCRIPTS_DIR"
TMP_DIR="$TEST_TMPDIR/tmp"
mkdir -p "$REPO_ROOT" "$MAIN_CHECKOUT" "$TMP_DIR"
slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }
source "$SCRIPTS_DIR/lib/autobot-engine.sh"
cmd_autobot_engine start --once
RUNNER
  chmod +x "$tmpdir/run_test.sh"
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q 'worktrees are execution artifacts'; then
    _pass 'engine refuses to start from a worktree checkout'
  else
    _fail 'engine refuses to start from a worktree checkout' "rc=$rc; output=$output"
  fi
}

test_daemon_start_status_and_stop() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail
die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
_err() { printf '✖ %s\n' "$*" >&2; }
_ok() { printf '✔ %s\n' "$*" >&2; }
_step() { :; }
_warn() { printf '⚠ %s\n' "$*" >&2; }
CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
REPO_ROOT="$TEST_TMPDIR/repro"
MAIN_CHECKOUT="$TEST_TMPDIR/repro"
PARENT_DIR="$TEST_TMPDIR"
WORKSPACE_ROOT="$TEST_TMPDIR/workspaces"
SCRIPTS_DIR="$TEST_SCRIPTS_DIR"
TMP_DIR="$TEST_TMPDIR/tmp"
mkdir -p "$TEST_TMPDIR/repro/.autobot" "$TEST_TMPDIR/workspaces/repro-wt-rep-1094" "$TMP_DIR"
git -C "$TEST_TMPDIR/repro" init >/dev/null 2>&1
git -C "$TEST_TMPDIR/workspaces/repro-wt-rep-1094" init >/dev/null 2>&1
ln -s "$TEST_SCRIPTS_DIR" "$TEST_TMPDIR/repro/scripts"
export CALLER_PWD="$TEST_TMPDIR/repro"
SCRIPT_DIR="$TEST_TMPDIR/repro/scripts"
SCRIPTS_DIR="$SCRIPT_DIR"
slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }
source "$SCRIPTS_DIR/lib/autobot-engine.sh"
SCRIPT_DIR="$TEST_TMPDIR/fake-bin"
mkdir -p "$SCRIPT_DIR"
cat > "$SCRIPT_DIR/autobot-engine.sh" <<'DAEMON'
#!/bin/bash
set -euo pipefail
printf '%s\n' "$*" > "$TEST_TMPDIR/daemon.args"
mkdir -p "$TEST_TMPDIR/repro/.autobot"
printf '%s\n' "$$" > "$TEST_TMPDIR/repro/.autobot/engine.pid"
cat > "$TEST_TMPDIR/repro/.autobot/status.json" <<'JSON'
{"engine":{"pid":1234,"running":true,"current_issue":"","current_phase":"","current_attempt":null,"last_tick_at":"2026-05-08T12:00:00Z"},"paths":{"lock":"$TEST_TMPDIR/repro/.autobot/engine.lock","pid":"$TEST_TMPDIR/repro/.autobot/engine.pid","log":"$TEST_TMPDIR/repro/.autobot/engine.log","status":"$TEST_TMPDIR/repro/.autobot/status.json"},"queue":{"items":[],"selected_work":null,"summary":{"total":0,"claimed":0,"running":0,"reconciling":0,"recovery":0,"terminal":0,"by_state":{}}},"generated_at":"2026-05-08T12:00:00Z"}
JSON
trap 'exit 0' INT TERM
while :; do sleep 1; done
DAEMON
chmod +x "$SCRIPT_DIR/autobot-engine.sh"
cmd_opencode() { printf 'OPENCODE %s\n' "$*"; }
cmd_autonomy() {
  case "$*" in
    status\ --all\ --json)
      printf '%s\n' "{\"items\":[{\"issue_identifier\":\"REP-1094\",\"claim_state\":\"claimed\",\"workspace_path\":\"$TEST_TMPDIR/workspaces/repro-wt-rep-1094\",\"attempt_count\":0}],\"runs\":[],\"summary\":{\"claim_states\":{\"claimed\":1},\"active_runs\":0,\"stale_claims\":0,\"failed_runs\":0,\"sync_errors\":0},\"recent_errors\":[],\"generated_at\":\"2026-05-08T12:00:00Z\"}"
      ;;
    run\ start\ REP-1094\ --phase\ delivery\ --workspace\ *)
      printf '%s\n' '{"run":{"attempt":1}}'
      ;;
    run\ finish\ REP-1094\ --attempt\ 1\ --state\ finished)
      printf '%s\n' '{"run":{"attempt":1}}'
      ;;
    release\ REP-1094\ --reason\ autobot-engine\ completed)
      printf '%s\n' '{"claim":{"issue_identifier":"REP-1094"}}'
      ;;
    *)
      return 1
      ;;
  esac
}
export -f cmd_opencode cmd_autonomy
cmd_autobot_engine start -d
cmd_autobot_engine status --json
cmd_autobot_engine stop
RUNNER
  chmod +x "$tmpdir/run_test.sh"
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'started autobot-engine' && printf '%s\n' "$output" | grep -q 'engine: running' && [ -f "$tmpdir/daemon.args" ] && ! grep -q -- '--once' "$tmpdir/daemon.args" && (printf '%s\n' "$output" | grep -q 'engine is not running' || printf '%s\n' "$output" | grep -q 'stopped autobot-engine'); then
    _pass 'daemon start, status, and stop manage the same engine instance'
  else
    _fail 'daemon start, status, and stop manage the same engine instance' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_restart_preserves_daemon_mode() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail
die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
_err() { printf '✖ %s\n' "$*" >&2; }
_ok() { printf '✔ %s\n' "$*" >&2; }
_step() { :; }
_warn() { printf '⚠ %s\n' "$*" >&2; }
CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
REPO_ROOT="$TEST_TMPDIR/repro"
MAIN_CHECKOUT="$TEST_TMPDIR/repro"
PARENT_DIR="$TEST_TMPDIR"
WORKSPACE_ROOT="$TEST_TMPDIR/workspaces"
SCRIPTS_DIR="$TEST_SCRIPTS_DIR"
TMP_DIR="$TEST_TMPDIR/tmp"
mkdir -p "$TEST_TMPDIR/repro/.autobot" "$TMP_DIR"
printf 'daemon\n' > "$TEST_TMPDIR/repro/.autobot/engine.mode"
slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }
source "$SCRIPTS_DIR/lib/autobot-engine.sh"
_autobot_engine_run_daemon() { printf 'daemon\n' > "$TEST_TMPDIR/mode.log"; }
_autobot_engine_run_foreground() { printf 'foreground\n' > "$TEST_TMPDIR/mode.log"; }
cmd_autobot_engine_restart
RUNNER
  chmod +x "$tmpdir/run_test.sh"
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ $rc -eq 0 ] && [ -f "$tmpdir/mode.log" ] && grep -q '^daemon$' "$tmpdir/mode.log"; then
    _pass 'restart preserves daemon mode when the prior engine was daemonized'
  else
    _fail 'restart preserves daemon mode when the prior engine was daemonized' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_auto_discover_invokes_external_autobot() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  cat > "$tmpdir/run_test.sh" <<'RUNNER'
#!/bin/bash
set -euo pipefail
die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
_err() { printf '✖ %s\n' "$*" >&2; }
_ok() { printf '✔ %s\n' "$*" >&2; }
_step() { :; }
_warn() { printf '⚠ %s\n' "$*" >&2; }
CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
REPO_ROOT="$TEST_TMPDIR/repro"
MAIN_CHECKOUT="$TEST_TMPDIR/repro"
PARENT_DIR="$TEST_TMPDIR"
WORKSPACE_ROOT="$TEST_TMPDIR/workspaces"
SCRIPTS_DIR="$TEST_SCRIPTS_DIR"
TMP_DIR="$TEST_TMPDIR/tmp"
mkdir -p "$TEST_TMPDIR/repro/.autobot" "$TMP_DIR"
ln -s "$TEST_SCRIPTS_DIR" "$TEST_TMPDIR/repro/scripts"
export CALLER_PWD="$TEST_TMPDIR/repro"
SCRIPT_DIR="$TEST_TMPDIR/repro/scripts"
SCRIPTS_DIR="$SCRIPT_DIR"
slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }
source "$SCRIPTS_DIR/lib/autobot-engine.sh"
autobot() {
  case "$*" in
    discover\ --json)
      printf '%s\n' '{"items":[{"issue_identifier":"REP-1094"}]}'
      ;;
    add\ REP-1094)
      printf '%s\n' "added" > "$TEST_TMPDIR/added.txt"
      ;;
    *)
      return 1
      ;;
  esac
}
cmd_autonomy() {
  case "$*" in
    status\ --all\ --json)
      printf '%s\n' '{"items":[],"runs":[],"summary":{"claim_states":{},"active_runs":0,"stale_claims":0,"failed_runs":0,"sync_errors":0},"recent_errors":[],"generated_at":"2026-05-08T12:00:00Z"}'
      ;;
    *)
      return 1
      ;;
  esac
}
AUTOBOT_ENGINE_AUTO_DISCOVER=on cmd_autobot_engine start --once
RUNNER
  chmod +x "$tmpdir/run_test.sh"
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ $rc -eq 0 ] && [ -f "$tmpdir/added.txt" ]; then
    _pass 'auto-discover shells out to external autobot commands when enabled'
  else
    _fail 'auto-discover shells out to external autobot commands when enabled' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_help_mentions_commands
test_second_start_is_rejected_by_lock
test_foreground_start_once_writes_metadata
test_worktree_guard_rejects_non_main_checkout
test_restart_preserves_daemon_mode
test_daemon_start_status_and_stop
test_auto_discover_invokes_external_autobot

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  printf '%d test(s) FAILED\n' "$FAIL" >&2
  exit 1
fi
