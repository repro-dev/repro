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
  linear() {
    case "$*" in
      issue\ show\ REP-1094\ --json)
        printf '%s\n' '{"item":{"status":{"type":"in_progress"}}}'
        ;;
      *)
        return 1
        ;;
    esac
  }
  gh() {
    case "$*" in
      pr\ view\ --head\ *\ --json\ *)
        printf '%s\n' '{}'
        ;;
      *)
        return 1
        ;;
    esac
  }
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
  cmd_autobot_orchestrator() {
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
  if [ $rc -eq 0 ] && [ -f "$tmpdir/repro/.autobot/status.json" ] && [ -f "$tmpdir/repro/.autobot/runs/REP-1094-attempt-1/plan.md" ] && [ -f "$tmpdir/repro/.autobot/runs/REP-1094-attempt-1/release.md" ] && [ ! -f "$tmpdir/git.log" ] && [ -f "$tmpdir/opencode.log" ] && grep -q 'Issue: REP-1094' "$tmpdir/opencode.log" && ! grep -q -- '--issue' "$tmpdir/opencode.log"; then
    if python3 - "$tmpdir/repro/.autobot/status.json" <<'PY'
import json
import sys
from pathlib import Path

status = json.loads(Path(sys.argv[1]).read_text())
assert status["schema_version"] == 1
assert status["config"]["schema_version"] == 1
assert "engine" in status and "queue" in status
assert status["engine"]["running"] is True
PY
    then
      _pass 'foreground start --once writes metadata, status shape, and keeps release deferred'
    else
      _fail 'foreground start --once writes metadata, status shape, and keeps release deferred' "status.json shape invalid; output=$output"
    fi
  else
    _fail 'foreground start --once writes metadata, status shape, and keeps release deferred' "rc=$rc; output=$output"
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
cmd_autobot_orchestrator() {
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
export -f cmd_opencode cmd_autobot_orchestrator
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

test_auto_discover_runs_when_queue_empty() {
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
_autobot_engine_config_helper set --config-file "$TEST_TMPDIR/repro/.autobot/config.json" --json engine.auto-discover on >/dev/null
autobot() {
  case "$*" in
    discover\ --limit\ 10\ --json)
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
cmd_autobot_orchestrator() {
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
  if [ $rc -eq 0 ] && [ -f "$tmpdir/added.txt" ] && printf '%s\n' "$output" | grep -q 'discover queue empty' && printf '%s\n' "$output" | grep -q 'discover added issue=REP-1094'; then
    _pass 'auto-discover runs when the queue is empty'
  else
    _fail 'auto-discover runs when the queue is empty' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_auto_discover_skips_when_queue_has_active_work() {
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
_autobot_engine_config_helper set --config-file "$TEST_TMPDIR/repro/.autobot/config.json" --json engine.auto-discover on >/dev/null
autobot() {
  case "$*" in
    discover\ --limit\ 10\ --json)
      printf '%s\n' 'discover-called' > "$TEST_TMPDIR/discover.log"
      printf '%s\n' '{"items":[{"issue_identifier":"REP-1094"}]}'
      ;;
    add\ REP-1094)
      printf '%s\n' 'added' > "$TEST_TMPDIR/added.txt"
      ;;
    *)
      return 1
      ;;
  esac
}
cmd_autobot_orchestrator() {
  case "$*" in
    status\ --all\ --json)
      printf '%s\n' '{"schema_version":1,"items":[{"issue_identifier":"REP-1094","claim_state":"queued","workspace_path":"'$TEST_TMPDIR'/workspaces/repro-wt-rep-1094","attempt_count":0},{"issue_identifier":"REP-1095","claim_state":"running","workspace_path":"'$TEST_TMPDIR'/workspaces/repro-wt-rep-1095","attempt_count":1}],"runs":[],"summary":{"claim_states":{"queued":1,"running":1},"active_runs":1,"stale_claims":0,"failed_runs":0,"sync_errors":0},"recent_errors":[],"generated_at":"2026-05-08T12:00:00Z"}'
      ;;
    prepare\ REP-1094\ --phase\ delivery\ --claimed-by\ autobot-engine)
      printf '%s\n' '{"claim":{"issue_identifier":"REP-1094"}}' > "$TEST_TMPDIR/prepared.txt"
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
  if [ $rc -eq 0 ] && [ ! -f "$tmpdir/discover.log" ] && [ -f "$tmpdir/prepared.txt" ] && [ ! -f "$tmpdir/added.txt" ] && printf '%s\n' "$output" | grep -q 'selected issue=REP-1094' && printf '%s\n' "$output" | grep -q 'prepare issue=REP-1094'; then
    _pass 'auto-discover skips when queued or running work is present'
  else
    _fail 'auto-discover skips when queued or running work is present' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_auto_discover_can_be_disabled_by_config() {
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
_autobot_engine_config_helper set --config-file "$TEST_TMPDIR/repro/.autobot/config.json" --json engine.auto-discover off >/dev/null
autobot() {
  case "$*" in
    discover\ --limit\ 10\ --json)
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
cmd_autobot_orchestrator() {
  case "$*" in
    status\ --all\ --json)
      printf '%s\n' '{"schema_version":1,"items":[],"runs":[],"summary":{"claim_states":{},"active_runs":0,"stale_claims":0,"failed_runs":0,"sync_errors":0},"recent_errors":[],"generated_at":"2026-05-08T12:00:00Z"}'
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
  if [ $rc -eq 0 ] && [ ! -f "$tmpdir/added.txt" ]; then
    _pass 'auto-discover is disabled by config even when the env var is on'
  else
    _fail 'auto-discover is disabled by config even when the env var is on' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_auto_discover_caps_intake_by_queue_depth_and_concurrency() {
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
_autobot_engine_config_helper set --config-file "$TEST_TMPDIR/repro/.autobot/config.json" --json engine.auto-discover on >/dev/null
_autobot_engine_config_helper set --config-file "$TEST_TMPDIR/repro/.autobot/config.json" --json engine.queue-depth 2 >/dev/null
_autobot_engine_config_helper set --config-file "$TEST_TMPDIR/repro/.autobot/config.json" --json engine.max-concurrency 1 >/dev/null
autobot() {
  case "$*" in
    discover\ --limit\ 2\ --json)
      printf '%s\n' '{"items":[{"issue_identifier":"REP-1094"},{"issue_identifier":"REP-1095"}]}' > "$TEST_TMPDIR/discover.args"
      printf '%s\n' '{"items":[{"issue_identifier":"REP-1094"},{"issue_identifier":"REP-1095"}]}'
      ;;
    add\ REP-1094)
      printf '%s\n' "REP-1094" >> "$TEST_TMPDIR/added.log"
      ;;
    add\ REP-1095)
      printf '%s\n' "REP-1095" >> "$TEST_TMPDIR/added.log"
      ;;
    *)
      return 1
      ;;
  esac
}
cmd_autobot_orchestrator() {
  case "$*" in
    status\ --all\ --json)
      printf '%s\n' '{"schema_version":1,"items":[],"runs":[],"summary":{"claim_states":{},"active_runs":0,"stale_claims":0,"failed_runs":0,"sync_errors":0},"recent_errors":[],"generated_at":"2026-05-08T12:00:00Z"}'
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
  if [ $rc -eq 0 ] && [ -f "$tmpdir/discover.args" ] && [ "$(wc -l < "$tmpdir/added.log" | tr -d ' ')" = "1" ] && grep -q 'REP-1094' "$tmpdir/added.log" && ! grep -q 'REP-1095' "$tmpdir/added.log"; then
    _pass 'auto-discover caps intake by configured queue depth and concurrency'
  else
    _fail 'auto-discover caps intake by configured queue depth and concurrency' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_auto_discover_skips_rejected_candidates_without_consuming_capacity() {
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
_autobot_engine_config_helper set --config-file "$TEST_TMPDIR/repro/.autobot/config.json" --json engine.auto-discover on >/dev/null
_autobot_engine_config_helper set --config-file "$TEST_TMPDIR/repro/.autobot/config.json" --json engine.queue-depth 3 >/dev/null
_autobot_engine_config_helper set --config-file "$TEST_TMPDIR/repro/.autobot/config.json" --json engine.max-concurrency 2 >/dev/null
autobot() {
  case "$*" in
    discover\ --limit\ 3\ --json)
      printf '%s\n' '{"items":[{"issue_identifier":"REP-1094"},{"issue_identifier":"REP-1095"},{"issue_identifier":"REP-1096"}]}' > "$TEST_TMPDIR/discover.args"
      printf '%s\n' '{"items":[{"issue_identifier":"REP-1094"},{"issue_identifier":"REP-1095"},{"issue_identifier":"REP-1096"}]}'
      ;;
    add\ REP-1094)
      printf '%s\n' 'already in progress'
      return 1
      ;;
    add\ REP-1095)
      printf '%s\n' "REP-1095" >> "$TEST_TMPDIR/added.log"
      ;;
    add\ REP-1096)
      printf '%s\n' "REP-1096" >> "$TEST_TMPDIR/added.log"
      ;;
    *)
      return 1
      ;;
  esac
}
cmd_autobot_orchestrator() {
  case "$*" in
    status\ --all\ --json)
      printf '%s\n' '{"schema_version":1,"items":[],"runs":[],"summary":{"claim_states":{},"active_runs":0,"stale_claims":0,"failed_runs":0,"sync_errors":0},"recent_errors":[],"generated_at":"2026-05-08T12:00:00Z"}'
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
  if [ $rc -eq 0 ] && [ -f "$tmpdir/discover.args" ] && [ "$(wc -l < "$tmpdir/added.log" | tr -d ' ')" = "2" ] && grep -q 'REP-1095' "$tmpdir/added.log" && grep -q 'REP-1096' "$tmpdir/added.log" && ! grep -q 'REP-1094' "$tmpdir/added.log" && printf '%s\n' "$output" | grep -q 'already in progress' && printf '%s\n' "$output" | grep -q 'discover skipped issue=REP-1094'; then
    _pass 'auto-discover skips rejected candidates without consuming capacity'
  else
    _fail 'auto-discover skips rejected candidates without consuming capacity' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_auto_discover_logs_when_no_candidates_are_returned() {
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
_autobot_engine_config_helper set --config-file "$TEST_TMPDIR/repro/.autobot/config.json" --json engine.auto-discover on >/dev/null
_autobot_engine_config_helper set --config-file "$TEST_TMPDIR/repro/.autobot/config.json" --json engine.queue-depth 3 >/dev/null
_autobot_engine_config_helper set --config-file "$TEST_TMPDIR/repro/.autobot/config.json" --json engine.max-concurrency 2 >/dev/null
autobot() {
  case "$*" in
    discover\ --limit\ 3\ --json)
      printf '%s\n' '{"items":[]}' > "$TEST_TMPDIR/discover.args"
      printf '%s\n' '{"items":[]}'
      ;;
    *)
      return 1
      ;;
  esac
}
cmd_autobot_orchestrator() {
  case "$*" in
    status\ --all\ --json)
      printf '%s\n' '{"schema_version":1,"items":[],"runs":[],"summary":{"claim_states":{},"active_runs":0,"stale_claims":0,"failed_runs":0,"sync_errors":0},"recent_errors":[],"generated_at":"2026-05-08T12:00:00Z"}'
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
  if [ $rc -eq 0 ] && [ -f "$tmpdir/discover.args" ] && ! [ -f "$tmpdir/added.log" ] && printf '%s\n' "$output" | grep -q 'discover queue empty' && printf '%s\n' "$output" | grep -q 'discover returned no candidates'; then
    _pass 'auto-discover logs when no candidates are returned'
  else
    _fail 'auto-discover logs when no candidates are returned' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_process_queue_logs_recovery_path() {
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
mkdir -p "$TEST_TMPDIR/repro/.autobot" "$TEST_TMPDIR/workspaces" "$TMP_DIR"
ln -s "$TEST_SCRIPTS_DIR" "$TEST_TMPDIR/repro/scripts"
export CALLER_PWD="$TEST_TMPDIR/repro"
SCRIPT_DIR="$TEST_TMPDIR/repro/scripts"
SCRIPTS_DIR="$SCRIPT_DIR"
slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }
source "$SCRIPTS_DIR/lib/autobot-engine.sh"
_autobot_engine_update_status() { :; }
_autobot_engine_collect_monitor_snapshot() {
  printf '%s\n' '{"issue_identifier":"REP-1094","attempt_count":2}'
}
python3() {
  if [[ "$1" == "$SCRIPTS_DIR/lib/py/autobot_engine.py" && "${2:-}" == decide-recovery ]]; then
    printf '%s\n' '{"action":"release","reason":"merged upstream","fetch_main":false,"cleanup_eligible":false}'
    return 0
  fi
  command python3 "$@"
}
cmd_autobot_orchestrator() {
  case "$*" in
    release\ REP-1094\ --reason\ merged\ upstream)
      :
      ;;
    *)
      return 1
      ;;
  esac
}
queue_json='{"items":[{"issue_identifier":"REP-1094","claim_state":"claimed","workspace_path":"'$TEST_TMPDIR'/workspaces/repro-wt-rep-1094","attempt_count":2}],"runs":[],"summary":{"claim_states":{"claimed":1},"active_runs":0,"stale_claims":0,"failed_runs":0,"sync_errors":0},"recent_errors":[],"generated_at":"2026-05-08T12:00:00Z"}'
_autobot_engine_process_queue "$queue_json"
RUNNER
  chmod +x "$tmpdir/run_test.sh"
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'recover issue=REP-1094' && printf '%s\n' "$output" | grep -q 'recovery issue=REP-1094 attempt=2 action=release reason=merged upstream'; then
    _pass 'process queue logs recovery decisions'
  else
    _fail 'process queue logs recovery decisions' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_process_queue_observes_all_active_issues() {
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
mkdir -p "$TEST_TMPDIR/repro/.autobot" "$TEST_TMPDIR/workspaces" "$TMP_DIR"
slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }
source "$SCRIPTS_DIR/lib/autobot-engine.sh"
_autobot_engine_update_status() { :; }
_autobot_engine_collect_monitor_snapshot() {
  local issue_identifier
  issue_identifier="$(printf '%s' "$1" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("issue_identifier") or payload.get("identifier") or "")')"
  printf '%s\n' "$issue_identifier" >> "$TEST_TMPDIR/snapshots.log"
  printf '%s\n' '{}'
}
_autobot_engine_apply_recovery_decision() { return 1; }
cmd_autobot_orchestrator() {
  case "$*" in
    run\ start\ REP-1094\ --phase\ delivery\ --workspace\ *)
      printf '%s\n' '{"run":{"attempt":1}}'
      ;;
    *)
      return 1
      ;;
  esac
}
queue_json='{"items":[{"issue_identifier":"REP-1094","claim_state":"running","workspace_path":"'$TEST_TMPDIR'/workspaces/repro-wt-rep-1094","attempt_count":1},{"issue_identifier":"REP-1095","claim_state":"running","workspace_path":"'$TEST_TMPDIR'/workspaces/repro-wt-rep-1095","attempt_count":2},{"issue_identifier":"REP-1096","claim_state":"failed","workspace_path":"'$TEST_TMPDIR'/workspaces/repro-wt-rep-1096","attempt_count":3}],"runs":[],"summary":{"claim_states":{"running":2,"failed":1},"active_runs":2,"stale_claims":0,"failed_runs":1,"sync_errors":0},"recent_errors":[],"generated_at":"2026-05-08T12:00:00Z"}'
_autobot_engine_process_queue "$queue_json"
RUNNER
  chmod +x "$tmpdir/run_test.sh"
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ $rc -eq 0 ] && [ "$(grep -c '^REP-1094$' "$tmpdir/snapshots.log")" -eq 1 ] && [ "$(grep -c '^REP-1095$' "$tmpdir/snapshots.log")" -eq 1 ] && [ "$(grep -c '^REP-1096$' "$tmpdir/snapshots.log")" -eq 0 ]; then
    _pass 'process queue processes every active issue in one tick'
  else
    _fail 'process queue processes every active issue in one tick' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_default_interval_uses_fifteen_seconds_when_unset() {
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
slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }
unset AUTOBOT_ENGINE_INTERVAL
source "$SCRIPTS_DIR/lib/autobot-engine.sh"
printf '%s\n' "$AUTOBOT_ENGINE_DEFAULT_INTERVAL"
RUNNER
  chmod +x "$tmpdir/run_test.sh"
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ $rc -eq 0 ] && [ "$output" = '15' ]; then
    _pass 'default engine interval resolves to fifteen seconds'
  else
    _fail 'default engine interval resolves to fifteen seconds' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_monitor_snapshot_separates_review_comments_from_pr_review_data() {
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
ln -s "$TEST_SCRIPTS_DIR" "$TEST_TMPDIR/repro/scripts"
export CALLER_PWD="$TEST_TMPDIR/repro"
SCRIPT_DIR="$TEST_TMPDIR/repro/scripts"
SCRIPTS_DIR="$SCRIPT_DIR"
slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }
source "$SCRIPTS_DIR/lib/autobot-engine.sh"
linear() {
  case "$*" in
    issue\ show\ REP-1094\ --json)
      printf '%s\n' '{}'
      ;;
    *)
      return 1
      ;;
  esac
}
git() {
  case "$*" in
    *"-C $TEST_TMPDIR/workspaces/repro-wt-rep-1094 branch --show-current"*)
      printf '%s\n' 'feature/review-comments'
      ;;
    *"-C $TEST_TMPDIR/workspaces/repro-wt-rep-1094 status --porcelain"*)
      return 0
      ;;
    *"-C $TEST_TMPDIR/workspaces/repro-wt-rep-1094 diff --name-only --diff-filter=U"*)
      return 0
      ;;
    *)
      command git "$@"
      ;;
  esac
}
gh() {
  case "$*" in
    pr\ view\ --head\ feature/review-comments\ --json\ *)
      printf '%s\n' '{"number":123,"state":"OPEN","mergeStateStatus":"CLEAN","statusCheckRollup":[{"state":"SUCCESS"}],"reviewDecision":"COMMENTED","reviews":[{"author":{"login":"reviewer"},"body":"approved","state":"APPROVED","submittedAt":"2026-05-08T12:00:00Z"}],"url":"https://github.com/repro/repro/pull/123"}'
      ;;
    api\ --paginate\ --jq\ .\[\]\ repos/repro/repro/issues/123/comments)
      printf '%s\n%s\n' '{"id":1,"body":"top-level-1","author":{"login":"alice"}}' '{"id":2,"body":"top-level-2","author":{"login":"carol"}}'
      ;;
    api\ --paginate\ --jq\ .\[\]\ repos/repro/repro/pulls/123/comments)
      printf '%s\n%s\n' '{"id":3,"body":"line comment-1","author":{"login":"bob"},"path":"src/app.py","line":12}' '{"id":4,"body":"line comment-2","author":{"login":"dana"},"path":"src/app.py","line":34}'
      ;;
    *)
      return 1
      ;;
  esac
}
item_json='{"issue_identifier":"REP-1094","workspace_path":"'$TEST_TMPDIR'/workspaces/repro-wt-rep-1094","attempt_count":1}'
snapshot_json="$(_autobot_engine_collect_monitor_snapshot "$item_json")"
python3 - "$snapshot_json" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
review_activity = payload['pr']['review_activity']
assert payload['pr']['reviewDecision'] == 'COMMENTED'
assert payload['pr']['statusCheckRollup'][0]['state'] == 'SUCCESS'
assert review_activity['review_decision'] == 'COMMENTED'
assert review_activity['reviews'][0]['state'] == 'APPROVED'
assert len(review_activity['top_level_comments']) == 2
assert len(review_activity['code_line_comments']) == 2
assert review_activity['top_level_comments'][1]['author'] == 'carol'
assert review_activity['code_line_comments'][1]['line'] == 34
PY
RUNNER
  chmod +x "$tmpdir/run_test.sh"
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ $rc -eq 0 ]; then
    _pass 'monitor snapshot separates review comments from review data'
  else
    _fail 'monitor snapshot separates review comments from review data' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_monitor_snapshot_degrades_review_comment_fetch_failures_to_empty_lists() {
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
ln -s "$TEST_SCRIPTS_DIR" "$TEST_TMPDIR/repro/scripts"
export CALLER_PWD="$TEST_TMPDIR/repro"
SCRIPT_DIR="$TEST_TMPDIR/repro/scripts"
SCRIPTS_DIR="$SCRIPT_DIR"
slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }
source "$SCRIPTS_DIR/lib/autobot-engine.sh"
linear() {
  case "$*" in
    issue\ show\ REP-1094\ --json)
      printf '%s\n' '{}'
      ;;
    *)
      return 1
      ;;
  esac
}
git() {
  case "$*" in
    *"-C $TEST_TMPDIR/workspaces/repro-wt-rep-1094 branch --show-current"*)
      printf '%s\n' 'feature/review-comments'
      ;;
    *"-C $TEST_TMPDIR/workspaces/repro-wt-rep-1094 status --porcelain"*)
      return 0
      ;;
    *"-C $TEST_TMPDIR/workspaces/repro-wt-rep-1094 diff --name-only --diff-filter=U"*)
      return 0
      ;;
    *)
      command git "$@"
      ;;
  esac
}
gh() {
  case "$*" in
    pr\ view\ --head\ feature/review-comments\ --json\ *)
      printf '%s\n' '{"number":123,"repository":{"nameWithOwner":"repro/repro"},"state":"OPEN","mergeStateStatus":"CLEAN","statusCheckRollup":[{"state":"SUCCESS"}],"reviewDecision":"COMMENTED","reviews":[],"url":"https://example.test/pr/123"}'
      ;;
    api\ repos/repro/repro/issues/123/comments)
      return 1
      ;;
    api\ repos/repro/repro/pulls/123/comments)
      return 1
      ;;
    *)
      return 1
      ;;
  esac
}
item_json='{"issue_identifier":"REP-1094","workspace_path":"'$TEST_TMPDIR'/workspaces/repro-wt-rep-1094","attempt_count":1}'
snapshot_json="$(_autobot_engine_collect_monitor_snapshot "$item_json")"
python3 - "$snapshot_json" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
review_activity = payload['pr']['review_activity']
assert review_activity['top_level_comments'] == []
assert review_activity['code_line_comments'] == []
PY
RUNNER
  chmod +x "$tmpdir/run_test.sh"
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ $rc -eq 0 ]; then
    _pass 'monitor snapshot degrades comment fetch failures to empty review lists'
  else
    _fail 'monitor snapshot degrades comment fetch failures to empty review lists' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_queued_work_is_prepared_before_delivery() {
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
mkdir -p "$TEST_TMPDIR/repro/.autobot" "$TEST_TMPDIR/workspaces" "$TMP_DIR"
slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }
source "$SCRIPTS_DIR/lib/autobot-engine.sh"
cmd_opencode() { printf 'OPENCODE %s\n' "$*"; }
cmd_autobot_orchestrator() {
  case "$*" in
    status\ --all\ --json)
      printf '%s\n' '{"items":[{"issue_identifier":"REP-1094","claim_state":"queued","workspace_path":"'$TEST_TMPDIR'/workspaces/repro-wt-rep-1094","attempt_count":0}],"runs":[],"summary":{"claim_states":{"queued":1},"active_runs":0,"stale_claims":0,"failed_runs":0,"sync_errors":0},"recent_errors":[],"generated_at":"2026-05-08T12:00:00Z"}'
      ;;
    prepare\ REP-1094\ --phase\ delivery\ --claimed-by\ autobot-engine)
      printf '%s\n' '{"claim":{"issue_identifier":"REP-1094"}}' > "$TEST_TMPDIR/prepared.txt"
      ;;
    retry\ REP-1094\ --phase\ delivery\ --claimed-by\ autobot-engine)
      printf '%s\n' '{"claim":{"issue_identifier":"REP-1094"}}' > "$TEST_TMPDIR/retry.txt"
      ;;
    run\ start\ REP-1094\ --phase\ delivery\ --workspace\ *)
      printf 'run-start-should-not-happen\n' > "$TEST_TMPDIR/run-start.txt"
      return 1
      ;;
    *)
      return 1
      ;;
  esac
}
queue_json='{"items":[{"issue_identifier":"REP-1094","claim_state":"queued","workspace_path":"'$TEST_TMPDIR'/workspaces/repro-wt-rep-1094","attempt_count":0}],"runs":[],"summary":{"claim_states":{"queued":1},"active_runs":0,"stale_claims":0,"failed_runs":0,"sync_errors":0},"recent_errors":[],"generated_at":"2026-05-08T12:00:00Z"}'
_autobot_engine_process_queue "$queue_json"
RUNNER
  chmod +x "$tmpdir/run_test.sh"
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ $rc -eq 0 ] && [ -f "$tmpdir/prepared.txt" ] && [ ! -f "$tmpdir/retry.txt" ] && [ ! -f "$tmpdir/run-start.txt" ] && printf '%s\n' "$output" | grep -q 'selected issue=REP-1094' && printf '%s\n' "$output" | grep -q 'prepare issue=REP-1094'; then
    _pass 'queued work is prepared before delivery begins'
  else
    _fail 'queued work is prepared before delivery begins' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_empty_queue_logs_no_processable_work() {
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
mkdir -p "$TEST_TMPDIR/repro/.autobot" "$TEST_TMPDIR/workspaces" "$TMP_DIR"
slugify() { printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "${WORKSPACE_ROOT:-$PARENT_DIR}/repro-wt-$1"; }
source "$SCRIPTS_DIR/lib/autobot-engine.sh"
cmd_autobot_orchestrator() {
  case "$*" in
    status\ --all\ --json)
      printf '%s\n' '{"schema_version":1,"items":[],"runs":[],"summary":{"claim_states":{},"active_runs":0,"stale_claims":0,"failed_runs":0,"sync_errors":0},"recent_errors":[],"generated_at":"2026-05-08T12:00:00Z"}'
      ;;
    *)
      return 1
      ;;
  esac
}
set +e
_autobot_engine_process_queue '{"items":[],"runs":[],"summary":{"claim_states":{},"active_runs":0,"stale_claims":0,"failed_runs":0,"sync_errors":0},"recent_errors":[],"generated_at":"2026-05-08T12:00:00Z"}'
set -e
RUNNER
  chmod +x "$tmpdir/run_test.sh"
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'no processable work'; then
    _pass 'empty queue logs that no work is processable'
  else
    _fail 'empty queue logs that no work is processable' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_help_mentions_commands
test_second_start_is_rejected_by_lock
test_foreground_start_once_writes_metadata
test_worktree_guard_rejects_non_main_checkout
test_restart_preserves_daemon_mode
test_daemon_start_status_and_stop
test_auto_discover_runs_when_queue_empty
test_auto_discover_skips_when_queue_has_active_work
test_auto_discover_can_be_disabled_by_config
test_auto_discover_caps_intake_by_queue_depth_and_concurrency
test_auto_discover_logs_when_no_candidates_are_returned
test_auto_discover_skips_rejected_candidates_without_consuming_capacity
test_process_queue_logs_recovery_path
test_process_queue_observes_all_active_issues
test_default_interval_uses_fifteen_seconds_when_unset
test_monitor_snapshot_separates_review_comments_from_pr_review_data
test_monitor_snapshot_degrades_review_comment_fetch_failures_to_empty_lists
test_queued_work_is_prepared_before_delivery
test_empty_queue_logs_no_processable_work

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  printf '%d test(s) FAILED\n' "$FAIL" >&2
  exit 1
fi
