#!/bin/bash
# scripts/lib/tests/test_autobot.sh

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SCRIPTS_DIR="$TESTS_DIR/../.."

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

_make_tmpdir() {
  mkdir -p "$SCRIPTS_DIR/../tmp"
  mktemp -d "$SCRIPTS_DIR/../tmp/test_autobot.XXXXXX"
}

_write_runner() {
  local tmpdir="$1"
  local extra="${2:-}"

  cat > "$tmpdir/run_test.sh" << RUNNER
#!/bin/bash
set -euo pipefail
die() { printf 'Error: %b\n' "\$*" >&2; exit 1; }
_err() { printf '✖ %s\n' "\$*" >&2; }
_ok() { printf '✔ %s\n' "\$*" >&2; }
_step() { :; }
_warn() { :; }
CLR_BOLD="" CLR_DIM="" CLR_RED="" CLR_GREEN="" CLR_YELLOW="" CLR_RESET=""
REPO_ROOT="$tmpdir/repro"
MAIN_CHECKOUT="$tmpdir/repro"
PARENT_DIR="$tmpdir"
WORKSPACE_ROOT="$tmpdir/workspaces"
SCRIPTS_DIR="$SCRIPTS_DIR"
TMP_DIR="$tmpdir/repro/tmp"
CONFIG_FILE="$tmpdir/repro/tmp/reproctl_services.json"
TILT_PID_FILE="$tmpdir/repro/tmp/tilt.pid"
TILT_LOG_FILE="$tmpdir/repro/tmp/tilt.log"
mkdir -p "$tmpdir/repro" "$tmpdir/workspaces" "$tmpdir/repro/tmp"
ln -s "$SCRIPTS_DIR" "$tmpdir/repro/scripts"
slugify() { printf '%s\n' "\$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "\${WORKSPACE_ROOT:-\$PARENT_DIR}/repro-wt-\$1"; }
source "$SCRIPTS_DIR/lib/common.sh"
REPO_ROOT="$tmpdir/repro"
MAIN_CHECKOUT="$tmpdir/repro"
PARENT_DIR="$tmpdir"
WORKSPACE_ROOT="$tmpdir/workspaces"
TMP_DIR="$tmpdir/repro/tmp"
CONFIG_FILE="$tmpdir/repro/tmp/reproctl_services.json"
TILT_PID_FILE="$tmpdir/repro/tmp/tilt.pid"
TILT_LOG_FILE="$tmpdir/repro/tmp/tilt.log"
SCRIPTS_DIR="$tmpdir/repro/scripts"
source "$SCRIPTS_DIR/lib/worktree.sh"
source "$SCRIPTS_DIR/lib/opencode.sh"
source "$SCRIPTS_DIR/lib/autonomy.sh"
source "$SCRIPTS_DIR/lib/autobot.sh"
$extra
RUNNER
  chmod +x "$tmpdir/run_test.sh"
}

test_help_lists_public_commands() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" 'cmd_autobot_help'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'Usage: autobot <subcommand>' && printf '%s\n' "$output" | grep -q 'discover \[--limit N\] \[--project NAME\] \[-q\] \[--json\]' && ! printf '%s\n' "$output" | grep -q 'prepare <issue>'; then
    _pass 'cmd_autobot_help shows only public commands'
  else
    _fail 'cmd_autobot_help shows only public commands' "rc=$rc; output=$output"
  fi
}

test_worktree_guard_rejects_non_main_checkout() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
REPO_ROOT="$MAIN_CHECKOUT/worktree"
mkdir -p "$REPO_ROOT"
cmd_autobot list
'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q 'worktrees are execution artifacts'; then
    _pass 'autobot refuses to run from a worktree checkout'
  else
    _fail 'autobot refuses to run from a worktree checkout' "rc=$rc; output=$output"
  fi
}

test_discover_q_emits_issue_ids_only() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
cmd_autonomy() {
  case "$*" in
    discover\ --limit\ 2\ --project\ Demo\ --json)
      printf "%s\n" "{\"waves\":[{\"issues\":[{\"issue_identifier\":\"REP-1\"},{\"issue_identifier\":\"REP-2\"}]}],\"deferred\":[{\"issue_identifier\":\"REP-3\"}],\"out_of_limit\":[{\"issue_identifier\":\"REP-4\"}]}"
      ;;
    *) return 1 ;;
  esac
}
cmd_autobot discover --limit 2 --project Demo -q
'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && [ "$(printf '%s\n' "$output" | sed '/^$/d' | wc -l | tr -d ' ')" -eq 2 ] && printf '%s\n' "$output" | grep -qx 'REP-1' && printf '%s\n' "$output" | grep -qx 'REP-2' && ! printf '%s\n' "$output" | grep -qx 'REP-3' && ! printf '%s\n' "$output" | grep -qx 'REP-4'; then
    _pass 'autobot discover -q emits issue identifiers only'
  else
    _fail 'autobot discover -q emits issue identifiers only' "rc=$rc; output=$output"
  fi
}

test_add_dry_run_does_not_queue_or_sync() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
queue_marker="$MAIN_CHECKOUT/tmp/queue-called"
sync_marker="$MAIN_CHECKOUT/tmp/sync-called"
_autobot_public_status_json() {
  printf "%s\n" "{\"items\":[],\"summary\":{\"total\":0}}"
}
_resolve_issue_worktree_metadata() {
  WT_ISSUE_WORKTREE_PATH="$MAIN_CHECKOUT/workspaces/repro-wt-REP-1"
  WT_ISSUE_UUID="uuid-rep-1"
  WT_ISSUE_STATE_NAME="Todo"
  WT_ISSUE_STATE_TYPE="unstarted"
}
_populate_issue_worktree_names() { :; }
_autonomy_py() {
  printf "%s\n" "queue invoked" > "$queue_marker"
  return 1
}
_autonomy_linear_sync_assignment() {
  printf "%s\n" "sync invoked" > "$sync_marker"
  return 1
}
cmd_autobot add REP-1 --dry-run
[ ! -e "$queue_marker" ]
[ ! -e "$sync_marker" ]
'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'Would queue item REP-1'; then
    _pass 'autobot add --dry-run skips queue mutation'
  else
    _fail 'autobot add --dry-run skips queue mutation' "rc=$rc; output=$output"
  fi
}

test_add_is_idempotent_for_existing_queue_item() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
_write_runner "$tmpdir" '
queue_invocations=0
queue_marker="$MAIN_CHECKOUT/tmp/queue-called"
_autobot_public_status_json() {
  printf "%s\n" "{\"items\":[{\"issue_identifier\":\"REP-1\",\"claim_state\":\"queued\",\"claimed_by\":\"autobot\"}],\"summary\":{\"total\":1}}"
}
_autonomy_py() {
  queue_invocations=$((queue_invocations + 1))
  printf "%s\n" "queue invoked" > "$queue_marker"
  return 1
}
cmd_autobot add REP-1
if [ -e "$queue_marker" ]; then
  printf "%s\n" "queue-called"
fi
'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'already queued' && ! printf '%s\n' "$output" | grep -q 'queue-called'; then
    _pass 'autobot add is idempotent for existing queue items'
else
  _fail 'autobot add is idempotent for existing queue items' "rc=$rc; output=$output"
fi
}

test_add_json_for_existing_queue_item_hides_internal_phase() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
_autobot_public_status_json() {
  printf "%s\n" "{\"items\":[{\"issue_identifier\":\"REP-1\",\"claim_state\":\"queued\",\"phase\":\"queue\",\"claimed_by\":\"autobot\"}],\"summary\":{\"total\":1}}"
}
cmd_autobot add REP-1 --json
'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q '"already_queued": true' && ! printf '%s\n' "$output" | grep -q '"phase"'; then
    _pass 'autobot add --json hides internal phase for existing queue items'
  else
    _fail 'autobot add --json hides internal phase for existing queue items' "rc=$rc; output=$output"
  fi
}

test_add_in_progress_requires_confirmation_and_defaults_no() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
_write_runner "$tmpdir" '
queue_marker="$MAIN_CHECKOUT/tmp/queue-called"
_autobot_public_status_json() {
  printf "%s\n" "{\"items\":[],\"summary\":{\"total\":0}}"
}
_resolve_issue_worktree_metadata() {
  WT_ISSUE_WORKTREE_PATH="$MAIN_CHECKOUT/workspaces/repro-wt-REP-1"
  WT_ISSUE_UUID="uuid-rep-1"
  WT_ISSUE_STATE_NAME="In Progress"
  WT_ISSUE_STATE_TYPE="started"
}
_populate_issue_worktree_names() { :; }
_autonomy_py() {
  printf "%s\n" "queue invoked" > "$queue_marker"
  return 1
}
cmd_autobot add REP-1
if [ ! -e "$queue_marker" ]; then
  printf "%s\n" "no-queue"
fi
'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q 'refusing to queue REP-1 without confirmation while Linear is already In Progress'; then
    _pass 'autobot add defaults to no for in-progress issues'
  else
    _fail 'autobot add defaults to no for in-progress issues' "rc=$rc; output=$output"
  fi
}

test_remove_help_does_not_crash_under_set_u() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" 'cmd_autobot remove --help'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'remove <issue> \[-f\] \[--json\] \[--dry-run\]'; then
    _pass 'autobot remove --help does not crash under set -u'
  else
    _fail 'autobot remove --help does not crash under set -u' "rc=$rc; output=$output"
  fi
}

test_remove_requires_issue_identifier_without_crashing_under_set_u() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" 'cmd_autobot remove'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q 'Missing issue identifier'; then
    _pass 'autobot remove reports missing issue identifier cleanly'
  else
    _fail 'autobot remove reports missing issue identifier cleanly' "rc=$rc; output=$output"
  fi
}

test_remove_dry_run_does_not_cancel() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
cancel_marker="$MAIN_CHECKOUT/tmp/cancel-called"
_autobot_public_status_json() {
  printf "%s\n" "{\"items\":[{\"issue_identifier\":\"REP-1\",\"claim_state\":\"running\",\"workspace_path\":\"/workspaces/repro-wt-rep-1\"}],\"summary\":{\"total\":1}}"
}
cmd_autonomy() {
  printf "%s\n" "cancel invoked" > "$cancel_marker"
  return 1
}
cmd_autobot remove REP-1 --dry-run
[ ! -e "$cancel_marker" ]
'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if printf '%s\n' "$output" | grep -q 'Would remove queued item REP-1'; then
    _pass 'autobot remove --dry-run skips cancellation'
  else
    _fail 'autobot remove --dry-run skips cancellation' "rc=$rc; output=$output"
  fi
}

test_remove_force_cancels_in_flight_item() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
cancel_invocations=0
_autobot_public_status_json() {
  printf "%s\n" "{\"items\":[{\"issue_identifier\":\"REP-1\",\"claim_state\":\"running\",\"workspace_path\":\"/workspaces/repro-wt-rep-1\"}],\"summary\":{\"total\":1}}"
}
cmd_autonomy() {
  cancel_invocations=$((cancel_invocations + 1))
  printf "%s\n" "cancel invoked" > "$MAIN_CHECKOUT/tmp/cancel-called"
  return 0
}
cmd_autobot remove REP-1 -f
if [ -e "$MAIN_CHECKOUT/tmp/cancel-called" ]; then
  printf "%s\n" "cancel-called"
fi
'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'removed queued item REP-1' && printf '%s\n' "$output" | grep -q 'cancel-called'; then
    _pass 'autobot remove -f cancels in-flight work'
  else
    _fail 'autobot remove -f cancels in-flight work' "rc=$rc; output=$output"
  fi
}

test_remove_in_flight_requires_confirmation_and_defaults_no() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
_autobot_public_status_json() {
  printf "%s\n" "{\"items\":[{\"issue_identifier\":\"REP-1\",\"claim_state\":\"running\",\"workspace_path\":\"/workspaces/repro-wt-rep-1\"}],\"summary\":{\"total\":1}}"
}
cmd_autonomy() { return 0; }
cmd_autobot remove REP-1
'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q 'refusing to remove REP-1 without confirmation while work is in flight'; then
    _pass 'autobot remove defaults to no for in-flight work'
  else
    _fail 'autobot remove defaults to no for in-flight work' "rc=$rc; output=$output"
  fi
}

test_entrypoints_are_executable() {
  if [ -x "$SCRIPTS_DIR/../bin/autobot" ] && [ -x "$SCRIPTS_DIR/autobot.sh" ]; then
    _pass 'autobot entrypoints are executable'
  else
    _fail 'autobot entrypoints are executable' "bin/autobot or scripts/autobot.sh is not executable"
  fi
}

test_public_item_json_uses_queue_language() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
mkdir -p "$MAIN_CHECKOUT/tmp"
status_json='"'"'{"items":[{"issue_identifier":"REP-1","claim_state":"queued","claimed_by":"autobot"}]}'"'"'
item_json="$(_autobot_public_item_json "$status_json" REP-1)"
printf '%s\n' "$item_json"
'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q '"queued_by": "autobot"' && ! printf '%s\n' "$output" | grep -q 'claimed_by'; then
    _pass 'autobot public item JSON uses queue language'
  else
    _fail 'autobot public item JSON uses queue language' "rc=$rc; output=$output"
  fi
}

test_logs_without_issue_prints_engine_log_contents() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
_write_runner "$tmpdir" '
mkdir -p "$MAIN_CHECKOUT/.autobot"
printf "engine log line one\nengine log line two\n" > "$MAIN_CHECKOUT/.autobot/engine.log"
cmd_autobot_logs
'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'engine log line one' && ! printf '%s\n' "$output" | grep -q 'engine log:'; then
    _pass 'autobot logs without issue prints engine log contents'
  else
    _fail 'autobot logs without issue prints engine log contents' "rc=$rc; output=$output"
  fi
}

test_add_accepts_multiple_issue_identifiers() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
_write_runner "$tmpdir" '
_autobot_add_issue() {
  printf "queued item %s\n" "$1"
}

cmd_autobot add REP-1 REP-2
'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'queued item REP-1' && printf '%s\n' "$output" | grep -q 'queued item REP-2'; then
    _pass 'autobot add accepts multiple issue identifiers'
  else
    _fail 'autobot add accepts multiple issue identifiers' "rc=$rc; output=$output"
  fi
}

test_help_lists_public_commands
test_worktree_guard_rejects_non_main_checkout
test_discover_q_emits_issue_ids_only
test_add_dry_run_does_not_queue_or_sync
test_add_is_idempotent_for_existing_queue_item
test_add_json_for_existing_queue_item_hides_internal_phase
test_add_in_progress_requires_confirmation_and_defaults_no
test_remove_help_does_not_crash_under_set_u
test_remove_requires_issue_identifier_without_crashing_under_set_u
test_remove_dry_run_does_not_cancel
test_remove_force_cancels_in_flight_item
test_remove_in_flight_requires_confirmation_and_defaults_no
test_entrypoints_are_executable
test_public_item_json_uses_queue_language
test_logs_without_issue_prints_engine_log_contents
test_add_accepts_multiple_issue_identifiers

printf '\nSummary: %d passed, %d failed, %d total\n' "$PASS" "$FAIL" "$TESTS_RUN"
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
