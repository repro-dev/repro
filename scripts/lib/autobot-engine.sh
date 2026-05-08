#!/bin/bash
#
# scripts/lib/autobot-engine.sh — standalone autobot-engine orchestration
#
# Sourced by scripts/autobot-engine.sh. Expects scripts/lib/common.sh to be
# loaded first (provides REPO_ROOT, MAIN_CHECKOUT, SCRIPTS_DIR, die, _err, _ok,
# _warn, _step).

AUTOBOT_ENGINE_DIR="${MAIN_CHECKOUT}/.autobot"
AUTOBOT_ENGINE_PID_FILE="$AUTOBOT_ENGINE_DIR/engine.pid"
AUTOBOT_ENGINE_LOCK_DIR="$AUTOBOT_ENGINE_DIR/engine.lock"
AUTOBOT_ENGINE_LOG_FILE="$AUTOBOT_ENGINE_DIR/engine.log"
AUTOBOT_ENGINE_STATUS_FILE="$AUTOBOT_ENGINE_DIR/status.json"
AUTOBOT_ENGINE_CLEANUP_FILE="$AUTOBOT_ENGINE_DIR/cleanup.jsonl"
AUTOBOT_ENGINE_RUNS_DIR="$AUTOBOT_ENGINE_DIR/runs"
AUTOBOT_ENGINE_EVENTS_FILE=""
AUTOBOT_ENGINE_DEFAULT_INTERVAL="${AUTOBOT_ENGINE_INTERVAL:-2}"
AUTOBOT_ENGINE_MAX_ATTEMPTS="${AUTOBOT_ENGINE_MAX_ATTEMPTS:-3}"

_autobot_engine_usage() {
  cat <<'EOF'
Usage: autobot-engine <command>

Commands:
  start [--daemon|-d] [--once]   Start the engine in foreground or daemon mode
  restart [--daemon|-d]          Restart the engine, preserving daemon mode
  stop                           Stop the running engine
  status                         Show engine and queue status
EOF
}

_autobot_engine_dir() { printf '%s\n' "$AUTOBOT_ENGINE_DIR"; }
_autobot_engine_pid_path() { printf '%s\n' "$AUTOBOT_ENGINE_PID_FILE"; }
_autobot_engine_lock_path() { printf '%s\n' "$AUTOBOT_ENGINE_LOCK_DIR"; }
_autobot_engine_log_path() { printf '%s\n' "$AUTOBOT_ENGINE_LOG_FILE"; }
_autobot_engine_status_path() { printf '%s\n' "$AUTOBOT_ENGINE_STATUS_FILE"; }
_autobot_engine_runs_root() { printf '%s\n' "$AUTOBOT_ENGINE_RUNS_DIR"; }
_autobot_engine_cleanup_path() { printf '%s\n' "$AUTOBOT_ENGINE_CLEANUP_FILE"; }

_autobot_engine_ensure_dirs() {
  mkdir -p "$AUTOBOT_ENGINE_DIR" "$AUTOBOT_ENGINE_RUNS_DIR"
}

_autobot_engine_pid_running() {
  local pid="${1:-}"
  [[ -n "$pid" ]] || return 1
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

_autobot_engine_read_pid() {
  local pid_file
  pid_file="$(_autobot_engine_pid_path)"
  if [[ -f "$pid_file" ]]; then
    sed -n '1p' "$pid_file"
  fi
}

_autobot_engine_release_lock() {
  rm -rf "$(_autobot_engine_lock_path)"
}

_autobot_engine_write_pid() {
  local pid_file pid
  pid_file="$(_autobot_engine_pid_path)"
  pid="${1:-$$}"
  _autobot_engine_ensure_dirs
  printf '%s\n' "$pid" > "$pid_file"
}

_autobot_engine_write_status() {
  local status_json="$1"
  local status_file
  status_file="$(_autobot_engine_status_path)"
  _autobot_engine_ensure_dirs
  printf '%s\n' "$status_json" > "$status_file"
}

_autobot_engine_write_cleanup_record() {
  local issue_identifier="$1"
  local reason="$2"
  local cleanup_file
  cleanup_file="$(_autobot_engine_cleanup_path)"
  _autobot_engine_ensure_dirs
  python3 - "$issue_identifier" "$reason" "$cleanup_file" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

issue_identifier, reason, path = sys.argv[1:4]
payload = {
    "issue_identifier": issue_identifier,
    "reason": reason,
    "recorded_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
}
with Path(path).open('a', encoding='utf-8') as fh:
    fh.write(json.dumps(payload, sort_keys=True) + '\n')
PY
}

_autobot_engine_append_event() {
  local event_path="$1"
  local event_json="$2"
  python3 "$SCRIPTS_DIR/lib/py/autobot_engine.py" append-event --path "$event_path" --event-json "$event_json" </dev/null
}

_autobot_engine_run_opencode() {
  opencode "$@"
}

_autobot_engine_queue_json() {
  REPROCTL_JSON=true cmd_autonomy status --all --json
}

_autobot_engine_select_work() {
  local queue_json="$1"
  printf '%s' "$queue_json" | python3 "$SCRIPTS_DIR/lib/py/autobot_engine.py" select-work
}

_autobot_engine_queue_has_work() {
  local selection_json selected_state
  selection_json="$(_autobot_engine_select_work "$1")" || return 1
  selected_state="$(printf '%s' "$selection_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); selected=payload.get("selected") or {}; print(selected.get("issue_identifier", ""))')"
  [[ -n "$selected_state" ]]
}

_autobot_engine_build_status_json() {
  local queue_json="$1"
  local pid="${2:-}"
  local running="${3:-false}"
  local current_issue="${4:-}"
  local current_phase="${5:-}"
  local current_attempt="${6:-}"
  local last_tick_at="${7:-}"
  local args=()

  [[ "$running" == true ]] && args+=(--running)
  [[ -n "$current_attempt" ]] && args+=(--current-attempt "$current_attempt")
  [[ -n "$last_tick_at" ]] && args+=(--last-tick-at "$last_tick_at")

  printf '%s' "$queue_json" | python3 "$SCRIPTS_DIR/lib/py/autobot_engine.py" render-status \
    --pid "${pid:-}" \
    --lock-path "$(_autobot_engine_lock_path)" \
    --pid-path "$(_autobot_engine_pid_path)" \
    --log-path "$(_autobot_engine_log_path)" \
    --status-path "$(_autobot_engine_status_path)" \
    --current-issue "$current_issue" \
    --current-phase "$current_phase" \
    "${args[@]}"
}

_autobot_engine_update_status() {
  local queue_json="$1"
  local pid="${2:-}"
  local running="${3:-false}"
  local current_issue="${4:-}"
  local current_phase="${5:-}"
  local current_attempt="${6:-}"
  local last_tick_at
  local status_json

  last_tick_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  status_json="$(_autobot_engine_build_status_json "$queue_json" "$pid" "$running" "$current_issue" "$current_phase" "$current_attempt" "$last_tick_at")"
  _autobot_engine_write_status "$status_json"
  if [[ "${REPROCTL_JSON:-false}" = true ]]; then
    printf '%s\n' "$status_json"
  fi
}

_autobot_engine_parse_json_field() {
  local json_text="$1"
  local expression="$2"
  printf '%s' "$json_text" | python3 -c "import json,sys; payload=json.load(sys.stdin); print($expression)"
}

_autobot_engine_lock_stale_cleanup() {
  local pid
  pid="$(_autobot_engine_read_pid)"
  if _autobot_engine_pid_running "$pid"; then
    return 1
  fi

  rm -f "$(_autobot_engine_pid_path)"
  _autobot_engine_release_lock
  return 0
}

_autobot_engine_acquire_lock() {
  _autobot_engine_ensure_dirs

  if mkdir "$(_autobot_engine_lock_path)" 2>/dev/null; then
    return 0
  fi

  if _autobot_engine_lock_stale_cleanup; then
    mkdir "$(_autobot_engine_lock_path)"
    return 0
  fi

  return 1
}

_autobot_engine_running_pid() {
  local pid
  pid="$(_autobot_engine_read_pid)"
  if _autobot_engine_pid_running "$pid"; then
    printf '%s\n' "$pid"
    return 0
  fi
  return 1
}

_autobot_engine_print_status_human() {
  local status_json="$1"
  local running pid current_issue current_phase selected_issue selected_state queue_summary log_path lock_path
  running="$(printf '%s' "$status_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print("running" if payload["engine"]["running"] else "stopped")')"
  pid="$(printf '%s' "$status_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload["engine"].get("pid") or "")')"
  current_issue="$(printf '%s' "$status_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload["engine"].get("current_issue") or "")')"
  current_phase="$(printf '%s' "$status_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload["engine"].get("current_phase") or "")')"
  selected_issue="$(printf '%s' "$status_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); selected=payload["queue"].get("selected_work") or {}; print(selected.get("issue_identifier") or "")')"
  selected_state="$(printf '%s' "$status_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); selected=payload["queue"].get("selected_work") or {}; print(selected.get("claim_state") or "")')"
  queue_summary="$(printf '%s' "$status_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); summary=payload["queue"].get("summary") or {}; print(summary.get("total", 0))')"
  log_path="$(printf '%s' "$status_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload["paths"].get("log") or "")')"
  lock_path="$(printf '%s' "$status_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload["paths"].get("lock") or "")')"

  printf 'engine: %s\n' "$running"
  printf 'pid: %s\n' "${pid:-none}"
  printf 'lock: %s\n' "$lock_path"
  printf 'log: %s\n' "$log_path"
  printf 'current: %s %s\n' "${current_issue:-none}" "${current_phase:-}"
  printf 'queue items: %s\n' "$queue_summary"
  printf 'selected: %s %s\n' "${selected_issue:-none}" "${selected_state:-}"
}

_autobot_engine_discover_candidates() {
  local discover_json
  discover_json="$(autobot discover --json)" || return 1
  printf '%s' "$discover_json" | python3 "$SCRIPTS_DIR/lib/py/autobot_engine.py" discover-ids
}

_autobot_engine_run_delivery_attempt() {
  local issue_identifier="$1"
  local workspace_path="$2"
  local attempt="$3"
  local run_dir="$4"
  local events_file="$5"

  local phase agent phase_output phase_file event_json
  local phases=(plan deliver review test release)
  local agents=(planner develop review test release)
  local i=0

  while [ "$i" -lt "${#phases[@]}" ]; do
    phase="${phases[$i]}"
    agent="${agents[$i]}"
    phase_file="$run_dir/${phase}.md"

    event_json="$(python3 - "$issue_identifier" "$phase" "$attempt" <<'PY'
import json
import sys
from datetime import datetime, timezone

issue_identifier, phase, attempt = sys.argv[1:4]
print(json.dumps({
    "kind": "phase-start",
    "issue_identifier": issue_identifier,
    "phase": phase,
    "attempt": int(attempt),
    "state": "running",
    "recorded_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
}))
PY
)"
    _autobot_engine_append_event "$events_file" "$event_json"

    if ! phase_output="$(_autobot_engine_run_opencode --agent "$agent" run --issue "$issue_identifier" --workspace "$workspace_path" --phase "$phase" 2>&1)"; then
      printf '%s\n' "$phase_output" > "$phase_file"
      event_json="$(python3 - "$issue_identifier" "$phase" "$attempt" "$phase_output" <<'PY'
import json
import sys
from datetime import datetime, timezone

issue_identifier, phase, attempt, message = sys.argv[1:5]
print(json.dumps({
    "kind": "phase-failed",
    "issue_identifier": issue_identifier,
    "phase": phase,
    "attempt": int(attempt),
    "state": "failed",
    "message": message,
    "recorded_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
}))
PY
)"
      _autobot_engine_append_event "$events_file" "$event_json"
      return 1
    fi

    printf '%s\n' "$phase_output" > "$phase_file"
    event_json="$(python3 - "$issue_identifier" "$phase" "$attempt" <<'PY'
import json
import sys
from datetime import datetime, timezone

issue_identifier, phase, attempt = sys.argv[1:4]
print(json.dumps({
    "kind": "phase-complete",
    "issue_identifier": issue_identifier,
    "phase": phase,
    "attempt": int(attempt),
    "state": "finished",
    "recorded_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z'),
}))
PY
)"
    _autobot_engine_append_event "$events_file" "$event_json"

    i=$((i + 1))
  done

  return 0
}

_autobot_engine_process_item() {
  local item_json="$1"
  local queue_json="$2"
  local issue_identifier workspace_path attempt run_start_json run_dir events_file
  local state state_type claim_state retry_reason

  issue_identifier="$(printf '%s' "$item_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("issue_identifier") or payload.get("identifier") or "")')"
  workspace_path="$(printf '%s' "$item_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("workspace_path") or "")')"
  claim_state="$(printf '%s' "$item_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("claim_state") or "")')"
  state="$(printf '%s' "$item_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("last_observed_issue_state_name") or "")')"
  state_type="$(printf '%s' "$item_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("last_observed_issue_state_type") or "")')"
  retry_reason="$(printf '%s' "$item_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("retry_reason") or "")')"

  if [[ -z "$issue_identifier" ]]; then
    return 1
  fi

  if [[ ! -d "$workspace_path" ]]; then
    if [[ "$claim_state" == failed || "$claim_state" == error || "$claim_state" == stale ]]; then
      _warn "Skipping recovery for $issue_identifier because workspace is missing"
      return 0
    fi
    _warn "Skipping $issue_identifier because workspace is missing"
    return 0
  fi

  if ! git -C "$workspace_path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    _warn "Skipping $issue_identifier because workspace is not a git worktree"
    return 0
  fi

  local run_start_file
  mkdir -p "$MAIN_CHECKOUT/tmp"
  run_start_file="$(mktemp "$MAIN_CHECKOUT/tmp/autobot-engine-run-start.XXXXXX")"

  if ! REPROCTL_JSON=true cmd_autonomy run start "$issue_identifier" --phase delivery --workspace "$workspace_path" >"$run_start_file" 2>/dev/null; then
    _warn "Failed to start run for $issue_identifier"
    rm -f "$run_start_file"
    return 1
  fi

  run_start_json="$(cat "$run_start_file" 2>/dev/null)"
  rm -f "$run_start_file"
  attempt="$(printf '%s' "$run_start_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); run=payload.get("run") or {}; print(run.get("attempt") or 0)')"
  if [[ -z "$attempt" || "$attempt" = 0 ]]; then
    attempt="$(printf '%s' "$item_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(int(payload.get("attempt_count") or 0) + 1)')"
  fi

  run_dir="$(_autobot_engine_runs_root)/${issue_identifier}-attempt-${attempt}"
  events_file="$run_dir/events.jsonl"
  mkdir -p "$run_dir"

  if ! _autobot_engine_run_delivery_attempt "$issue_identifier" "$workspace_path" "$attempt" "$run_dir" "$events_file"; then
    REPROCTL_JSON=true cmd_autonomy run finish "$issue_identifier" --attempt "$attempt" --state failed --error "delivery phase failed" >/dev/null 2>&1 || true
    _autobot_engine_write_status "$queue_json"
    return 1
  fi

  REPROCTL_JSON=true cmd_autonomy run finish "$issue_identifier" --attempt "$attempt" --state finished >/dev/null 2>&1 || true
  REPROCTL_JSON=true cmd_autonomy release "$issue_identifier" --reason "autobot-engine completed" >/dev/null 2>&1 || true
  _autobot_engine_write_cleanup_record "$issue_identifier" "merged-or-released"
  _autobot_engine_write_status "$queue_json"
  return 0
}

_autobot_engine_process_queue() {
  local queue_json="$1"
  local selection_json selected_json selected_issue selected_state selected_attempt selected_item

  selection_json="$(_autobot_engine_select_work "$queue_json")"
  selected_json="$(printf '%s' "$selection_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); selected=payload.get("selected"); print(json.dumps(selected or {}))')"
  selected_issue="$(printf '%s' "$selected_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("issue_identifier") or payload.get("identifier") or "")')"
  selected_state="$(printf '%s' "$selected_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("claim_state") or "")')"
  selected_attempt="$(printf '%s' "$selected_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("attempt_count") or 0)')"

  if [[ -z "$selected_issue" ]]; then
    return 1
  fi

  selected_item="$selected_json"

  if [[ "$selected_state" == running || "$selected_state" == reconciling ]]; then
    _autobot_engine_update_status "$queue_json" "$$" true "$selected_issue" delivery "$selected_attempt"
    return 0
  fi

  if [[ "$selected_state" == failed || "$selected_state" == error || "$selected_state" == stale ]]; then
    if [[ "$selected_attempt" -ge "$AUTOBOT_ENGINE_MAX_ATTEMPTS" ]]; then
      _warn "Skipping $selected_issue after $selected_attempt attempts"
      _autobot_engine_update_status "$queue_json" "$$" true "$selected_issue" delivery "$selected_attempt"
      return 0
    fi
    REPROCTL_JSON=true cmd_autonomy retry "$selected_issue" --phase delivery --claimed-by autobot-engine >/dev/null 2>&1 || true
    _autobot_engine_update_status "$queue_json" "$$" true "$selected_issue" delivery "$selected_attempt"
    return 0
  fi

  _autobot_engine_update_status "$queue_json" "$$" true "$selected_issue" delivery "$selected_attempt"
  _autobot_engine_process_item "$selected_item" "$queue_json"
}

_autobot_engine_run_once() {
  local queue_json status_json selected_json selected_issue
  queue_json="$(_autobot_engine_queue_json)"

  if [[ "${AUTOBOT_ENGINE_AUTO_DISCOVER:-off}" = "on" ]] && command -v autobot >/dev/null 2>&1; then
    local discover_ids discover_id
    if discover_ids="$(_autobot_engine_discover_candidates)"; then
      while IFS= read -r discover_id; do
        [[ -n "$discover_id" ]] || continue
        autobot add "$discover_id" >/dev/null 2>&1 || true
      done <<< "$discover_ids"
    fi
  fi

  if _autobot_engine_process_queue "$queue_json"; then
    return 0
  fi

  _autobot_engine_update_status "$queue_json" "$$" true
  return 0
}

_autobot_engine_run_foreground() {
  local once="${1:-false}"
  local pid

  if ! _autobot_engine_acquire_lock; then
    pid="$(_autobot_engine_read_pid)"
    if [[ -n "$pid" ]]; then
      die "engine is already running (pid $pid); lock: $(_autobot_engine_lock_path)"
    fi
    die "engine lock is held; lock: $(_autobot_engine_lock_path)"
  fi

  trap '_autobot_engine_release_lock; rm -f "$(_autobot_engine_pid_path)"; exit 0' INT TERM EXIT
  _autobot_engine_write_pid "$$"

  while :; do
    _autobot_engine_run_once
    if [[ "$once" = true ]]; then
      break
    fi
    sleep "$AUTOBOT_ENGINE_DEFAULT_INTERVAL"
  done

  _autobot_engine_release_lock
  rm -f "$(_autobot_engine_pid_path)"
  trap - INT TERM EXIT
}

_autobot_engine_run_daemon() {
  local once="${1:-false}"
  local log_file pid_file child_pid attempts=0
  local launcher_script="${SCRIPT_DIR:-$SCRIPTS_DIR}/autobot-engine.sh"

  if [[ "$REPO_ROOT" != "$MAIN_CHECKOUT" ]]; then
    die "engine must run from main checkout; worktrees are execution artifacts"
  fi

  _autobot_engine_ensure_dirs
  log_file="$(_autobot_engine_log_path)"
  pid_file="$(_autobot_engine_pid_path)"

  if _autobot_engine_running_pid >/dev/null 2>&1; then
    child_pid="$(_autobot_engine_read_pid)"
    die "engine is already running (pid $child_pid); lock: $(_autobot_engine_lock_path)"
  fi

  nohup "$launcher_script" _daemon ${once:+--once} >>"$log_file" 2>&1 &
  child_pid=$!

  while [ "$attempts" -lt 20 ]; do
    if [[ -f "$pid_file" ]]; then
      break
    fi
    if ! kill -0 "$child_pid" >/dev/null 2>&1; then
      break
    fi
    attempts=$((attempts + 1))
    sleep 0.1
  done

  if ! kill -0 "$child_pid" >/dev/null 2>&1 && [[ ! -f "$pid_file" ]]; then
    die "engine failed to start; see $log_file"
  fi

  printf 'started autobot-engine pid=%s log=%s\n' "$child_pid" "$log_file"
}

cmd_autobot_engine_start() {
  local daemon=false once=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -d|--daemon)
        daemon=true
        shift
        ;;
      --once)
        once=true
        shift
        ;;
      -h|--help)
        _autobot_engine_usage
        return 0
        ;;
      *)
        die "Unknown option: $1\nRun 'autobot-engine start --help' for usage."
        ;;
    esac
  done

  if [[ "$REPO_ROOT" != "$MAIN_CHECKOUT" ]]; then
    die "engine must run from main checkout; worktrees are execution artifacts"
  fi

  if [[ "$daemon" = true ]]; then
    _autobot_engine_run_daemon "$once"
  else
    _autobot_engine_run_foreground "$once"
  fi
}

cmd_autobot_engine_stop() {
  local pid

  pid="$(_autobot_engine_read_pid)"
  if [[ -z "$pid" ]]; then
    _autobot_engine_release_lock
    rm -f "$(_autobot_engine_pid_path)"
    _autobot_engine_update_status "{\"items\":[],\"claims\":[]}" "" false
    _ok "engine is not running"
    return 0
  fi

  if _autobot_engine_pid_running "$pid"; then
    kill -TERM "$pid" >/dev/null 2>&1 || true
    local attempts=0
    while _autobot_engine_pid_running "$pid" && [ "$attempts" -lt 50 ]; do
      attempts=$((attempts + 1))
      sleep 0.1
    done
  fi

  rm -f "$(_autobot_engine_pid_path)"
  _autobot_engine_release_lock
  _autobot_engine_update_status "{\"items\":[],\"claims\":[]}" "" false
  _ok "stopped autobot-engine"
}

cmd_autobot_engine_status() {
  local status_json queue_json pid running

  if [[ -f "$(_autobot_engine_status_path)" ]]; then
    status_json="$(cat "$(_autobot_engine_status_path)")"
  else
    queue_json="$(_autobot_engine_queue_json)"
    pid="$(_autobot_engine_read_pid)"
    if _autobot_engine_pid_running "$pid"; then
      running=true
    else
      running=false
      pid=""
    fi
    status_json="$(_autobot_engine_build_status_json "$queue_json" "$pid" "$running")"
  fi

  if [[ "${REPROCTL_JSON:-false}" = true ]]; then
    printf '%s\n' "$status_json"
  else
    _autobot_engine_print_status_human "$status_json"
  fi
}

cmd_autobot_engine_restart() {
  local daemon=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -d|--daemon)
        daemon=true
        shift
        ;;
      --once)
        shift
        ;;
      -h|--help)
        _autobot_engine_usage
        return 0
        ;;
      *)
        die "Unknown option: $1\nRun 'autobot-engine restart --help' for usage."
        ;;
    esac
  done

  cmd_autobot_engine_stop >/dev/null 2>&1 || true
  if [[ "$daemon" = true ]]; then
    _autobot_engine_run_daemon
  else
    _autobot_engine_run_foreground false
  fi
}

cmd_autobot_engine() {
  local subcommand="${1:-}"
  shift || true

  case "$subcommand" in
    -h|--help|help|"")
      _autobot_engine_usage
      return 0
      ;;
  esac

  if [[ "$REPO_ROOT" != "$MAIN_CHECKOUT" ]]; then
    die "engine must run from main checkout; worktrees are execution artifacts"
  fi

  case "$subcommand" in
    start) cmd_autobot_engine_start "$@" ;;
    restart) cmd_autobot_engine_restart "$@" ;;
    stop) cmd_autobot_engine_stop "$@" ;;
    status) cmd_autobot_engine_status "$@" ;;
    *)
      die "Unknown subcommand: $subcommand\nRun 'autobot-engine --help' for usage."
      ;;
  esac
}
