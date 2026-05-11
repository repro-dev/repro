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
AUTOBOT_ENGINE_MODE_FILE="$AUTOBOT_ENGINE_DIR/engine.mode"
AUTOBOT_ENGINE_LOG_FILE="$AUTOBOT_ENGINE_DIR/engine.log"
AUTOBOT_ENGINE_STATUS_FILE="$AUTOBOT_ENGINE_DIR/status.json"
AUTOBOT_ENGINE_CLEANUP_FILE="$AUTOBOT_ENGINE_DIR/cleanup.jsonl"
AUTOBOT_ENGINE_RUNS_DIR="$AUTOBOT_ENGINE_DIR/runs"
AUTOBOT_ENGINE_CONFIG_FILE="$AUTOBOT_ENGINE_DIR/config.json"
AUTOBOT_ENGINE_EVENTS_FILE=""
AUTOBOT_ENGINE_DEFAULT_INTERVAL="${AUTOBOT_ENGINE_INTERVAL:-15}"
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
_autobot_engine_mode_path() { printf '%s\n' "$AUTOBOT_ENGINE_MODE_FILE"; }
_autobot_engine_log_path() { printf '%s\n' "$AUTOBOT_ENGINE_LOG_FILE"; }
_autobot_engine_status_path() { printf '%s\n' "$AUTOBOT_ENGINE_STATUS_FILE"; }
_autobot_engine_runs_root() { printf '%s\n' "$AUTOBOT_ENGINE_RUNS_DIR"; }
_autobot_engine_cleanup_path() { printf '%s\n' "$AUTOBOT_ENGINE_CLEANUP_FILE"; }
_autobot_engine_config_path() { printf '%s\n' "$AUTOBOT_ENGINE_CONFIG_FILE"; }
_autobot_engine_config_helper() { python3 "$SCRIPTS_DIR/lib/py/autobot_config.py" "$@"; }
_autobot_engine_config_json() { _autobot_engine_config_helper dump --config-file "$(_autobot_engine_config_path)" --json; }
_autobot_engine_config_get() {
  local key="$1"
  _autobot_engine_config_helper get --config-file "$(_autobot_engine_config_path)" --json "$key" |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["value"])'
}

_autobot_engine_log_activity() {
  printf '%s autobot-engine: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*"
}

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

_autobot_engine_write_mode() {
  local mode_file mode
  mode_file="$(_autobot_engine_mode_path)"
  mode="${1:-foreground}"
  _autobot_engine_ensure_dirs
  printf '%s\n' "$mode" > "$mode_file"
}

_autobot_engine_read_mode() {
  local mode_file
  mode_file="$(_autobot_engine_mode_path)"
  if [[ -f "$mode_file" ]]; then
    sed -n '1p' "$mode_file"
  fi
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
  cmd_opencode "$@"
}

_autobot_engine_queue_json() {
  REPROCTL_JSON=true cmd_autobot_orchestrator status --all --json
}

_autobot_engine_select_work() {
  local queue_json="$1"
  printf '%s' "$queue_json" | python3 "$SCRIPTS_DIR/lib/py/autobot_engine.py" select-work
}

_autobot_engine_queue_has_work() {
  python3 - "$1" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1] or '{}')
items = payload.get('items')
if not isinstance(items, list):
    items = payload.get('claims') if isinstance(payload.get('claims'), list) else []

for item in items:
    if isinstance(item, dict) and item.get('claim_state') in {'queued', 'running'}:
        raise SystemExit(0)

raise SystemExit(1)
PY
}

_autobot_engine_build_status_json() {
  local queue_json="$1"
  local pid="${2:-}"
  local running="${3:-false}"
  local current_mode="${4:-}"
  local current_issue="${5:-}"
  local current_phase="${6:-}"
  local current_attempt="${7:-}"
  local last_tick_at="${8:-}"
  local args=()
  local config_json merged_queue_json

  [[ "$running" == true ]] && args+=(--running)
  [[ -n "$current_attempt" ]] && args+=(--current-attempt "$current_attempt")
  [[ -n "$last_tick_at" ]] && args+=(--last-tick-at "$last_tick_at")

  config_json="$(_autobot_engine_config_json)" || return 1
  merged_queue_json="$(python3 - "$queue_json" "$config_json" <<'PY'
import json
import sys

queue_payload = json.loads(sys.argv[1] or '{}')
config = json.loads(sys.argv[2] or '{}')
queue_payload['schema_version'] = queue_payload.get('schema_version') or config.get('schema_version') or 1
queue_payload['config'] = config
print(json.dumps(queue_payload))
PY
)" || return 1

  printf '%s' "$merged_queue_json" | python3 "$SCRIPTS_DIR/lib/py/autobot_engine.py" render-status \
    --pid "${pid:-}" \
    --lock-path "$(_autobot_engine_lock_path)" \
    --pid-path "$(_autobot_engine_pid_path)" \
    --log-path "$(_autobot_engine_log_path)" \
    --status-path "$(_autobot_engine_status_path)" \
    --current-mode "$current_mode" \
    --current-issue "$current_issue" \
    --current-phase "$current_phase" \
    "${args[@]}"
}

_autobot_engine_update_status() {
  local queue_json="$1"
  local pid="${2:-}"
  local running="${3:-false}"
  local current_mode="${4:-}"
  local current_issue="${5:-}"
  local current_phase="${6:-}"
  local current_attempt="${7:-}"
  local last_tick_at
  local status_json

  last_tick_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  status_json="$(_autobot_engine_build_status_json "$queue_json" "$pid" "$running" "$current_mode" "$current_issue" "$current_phase" "$current_attempt" "$last_tick_at")"
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

_autobot_engine_fetch_paginated_json_array() {
  local endpoint="$1"
  local output
  if ! output="$(gh api --paginate --jq '.[]' "$endpoint" 2>/dev/null | python3 -c 'import json,sys; items=[json.loads(line.strip()) for line in sys.stdin if line.strip()]; print(json.dumps(items))')"; then
    printf '[]\n'
    return 0
  fi

  if [[ -z "$output" ]]; then
    printf '[]\n'
  else
    printf '%s\n' "$output"
  fi
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
  local limit="${1:-10}"
  local discover_json
  discover_json="$(autobot discover --limit "$limit" --json)" || return 1
  printf '%s' "$discover_json" | python3 "$SCRIPTS_DIR/lib/py/autobot_engine.py" discover-ids
}

_autobot_engine_collect_monitor_snapshot() {
  local item_json="$1"
  local issue_identifier workspace_path attempt_count workspace_exists workspace_dirty merge_conflicts linear_json pr_json

  issue_identifier="$(printf '%s' "$item_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("issue_identifier") or payload.get("identifier") or "")')"
  workspace_path="$(printf '%s' "$item_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("workspace_path") or "")')"
  attempt_count="$(printf '%s' "$item_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(int(payload.get("attempt_count") or 0))')"

  workspace_exists=false
  workspace_dirty=false
  merge_conflicts=""
  if [[ -n "$workspace_path" && -d "$workspace_path" ]]; then
    workspace_exists=true
    merge_conflicts="$(git -C "$workspace_path" diff --name-only --diff-filter=U 2>/dev/null || true)"
    if [[ -n "$(git -C "$workspace_path" status --porcelain 2>/dev/null || true)" ]]; then
      workspace_dirty=true
    fi
  fi

  linear_json="$(linear issue show "$issue_identifier" --json 2>/dev/null || printf '{}')"
  local pr_branch
  pr_branch="$(git -C "$workspace_path" branch --show-current 2>/dev/null || true)"
  if [[ -n "$pr_branch" && "$pr_branch" != HEAD ]]; then
    pr_json="$(gh pr view --head "$pr_branch" --json number,state,mergeStateStatus,statusCheckRollup,reviewDecision,reviews,url 2>/dev/null || printf '{}')"
  else
    pr_json="{}"
  fi

  local review_activity_json repo_name pr_number issue_comments_json review_comments_json
  repo_name="$(printf '%s' "$pr_json" | python3 -c 'import json,sys; from urllib.parse import urlparse; payload=json.load(sys.stdin); url=payload.get("url") or ""; parts=[part for part in urlparse(url).path.split("/") if part]; print("/".join(parts[:2]) if len(parts) >= 2 else "")')"
  pr_number="$(printf '%s' "$pr_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("number") or "")')"
  issue_comments_json='[]'
  review_comments_json='[]'
  if [[ -n "$repo_name" && -n "$pr_number" ]]; then
    issue_comments_json="$(_autobot_engine_fetch_paginated_json_array "repos/$repo_name/issues/$pr_number/comments" || printf '[]')"
    review_comments_json="$(_autobot_engine_fetch_paginated_json_array "repos/$repo_name/pulls/$pr_number/comments" || printf '[]')"
  fi

  review_activity_json="$(python3 - "$pr_json" "$issue_comments_json" "$review_comments_json" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1] or '{}')
payload['issue_comments'] = json.loads(sys.argv[2] or '[]')
payload['review_comments'] = json.loads(sys.argv[3] or '[]')
print(json.dumps(payload))
PY
)"
  review_activity_json="$(printf '%s' "$review_activity_json" | python3 "$SCRIPTS_DIR/lib/py/autobot_engine.py" summarize-review-activity)"
  pr_json="$(python3 - "$pr_json" "$review_activity_json" <<'PY'
import json
import sys

pr = json.loads(sys.argv[1] or '{}')
pr['review_activity'] = json.loads(sys.argv[2] or '{}')
print(json.dumps(pr))
PY
)"

  python3 - "$item_json" "$linear_json" "$pr_json" "$workspace_exists" "$workspace_dirty" "$merge_conflicts" "$attempt_count" "$AUTOBOT_ENGINE_MAX_ATTEMPTS" <<'PY'
import json
import sys
from pathlib import Path

item = json.loads(sys.argv[1] or '{}')
linear = json.loads(sys.argv[2] or '{}')
pr = json.loads(sys.argv[3] or '{}')
workspace_exists = sys.argv[4] == 'true'
workspace_dirty = sys.argv[5] == 'true'
merge_conflict_count = len([line for line in sys.argv[6].splitlines() if line.strip()])
attempt_count = int(sys.argv[7] or 0)
max_attempts = int(sys.argv[8] or 0)

payload = {
    'issue_identifier': item.get('issue_identifier') or item.get('identifier') or '',
    'workspace_path': item.get('workspace_path') or '',
    'claim_state': item.get('claim_state') or '',
    'attempt_count': attempt_count,
    'max_attempts': max_attempts,
    'workspace_exists': workspace_exists,
    'workspace_dirty': workspace_dirty,
    'merge_conflict_count': merge_conflict_count,
    'linear': linear,
    'pr': pr,
}

print(json.dumps(payload))
PY
}

_autobot_engine_apply_recovery_decision() {
  local snapshot_json="$1"
  local decision_json action reason fetch_main cleanup_eligible issue_identifier current_attempt

  decision_json="$(printf '%s' "$snapshot_json" | python3 "$SCRIPTS_DIR/lib/py/autobot_engine.py" decide-recovery)" || return 1
  action="$(printf '%s' "$decision_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("action") or "")')"
  reason="$(printf '%s' "$decision_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("reason") or "")')"
  fetch_main="$(printf '%s' "$decision_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print("true" if payload.get("fetch_main") else "false")')"
  cleanup_eligible="$(printf '%s' "$decision_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print("true" if payload.get("cleanup_eligible") else "false")')"
  issue_identifier="$(printf '%s' "$snapshot_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("issue_identifier") or "")')"
  current_attempt="$(printf '%s' "$snapshot_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("attempt_count") or 0)')"

  _autobot_engine_log_activity "recovery issue=$issue_identifier attempt=$current_attempt action=$action reason=$reason"

  case "$action" in
    release)
      REPROCTL_JSON=true cmd_autobot_orchestrator release "$issue_identifier" --reason "$reason" >/dev/null 2>&1 || true
      if [[ "$fetch_main" = true ]]; then
        git -C "$MAIN_CHECKOUT" fetch --prune origin main >/dev/null 2>&1 || true
      fi
      if [[ "$cleanup_eligible" = true ]]; then
        _autobot_engine_write_cleanup_record "$issue_identifier" "merged-or-released"
      fi
      ;;
    reconcile)
      REPROCTL_JSON=true cmd_autobot_orchestrator reconcile "$issue_identifier" >/dev/null 2>&1 || true
      ;;
    cancel)
      REPROCTL_JSON=true cmd_autobot_orchestrator cancel "$issue_identifier" --reason "$reason" >/dev/null 2>&1 || true
      ;;
    retry)
      REPROCTL_JSON=true cmd_autobot_orchestrator retry "$issue_identifier" --phase delivery --claimed-by autobot-engine >/dev/null 2>&1 || true
      ;;
    stop)
      _warn "Stopping work for $issue_identifier: $reason"
      ;;
    continue)
      return 1
      ;;
    *)
      return 1
      ;;
  esac

  _autobot_engine_update_status "$(_autobot_engine_queue_json)" "$$" true "$(_autobot_engine_read_mode)" "$issue_identifier" delivery "$current_attempt"
  return 0
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

    local phase_goal=""
    case "$phase" in
      plan) phase_goal="Draft the implementation plan and test strategy for this issue." ;;
      deliver) phase_goal="Implement the smallest safe change required for this phase." ;;
      review) phase_goal="Review the changed code against the issue requirements and note any blockers." ;;
      test) phase_goal="Audit the test coverage and add any missing regressions." ;;
      release) phase_goal="Prepare the release summary, commit, and PR handoff details." ;;
    esac

    local prompt_text
    prompt_text="$(cat <<EOF
Issue: $issue_identifier
Workspace: $workspace_path
Phase: $phase
Attempt: $attempt

$phase_goal

Follow the repository delivery contract for this phase. Keep the response concise and focused on the requested work.
EOF
)"

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

    if ! phase_output="$(_autobot_engine_run_opencode --agent "$agent" run "$prompt_text" 2>&1)"; then
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

  if ! REPROCTL_JSON=true cmd_autobot_orchestrator run start "$issue_identifier" --phase delivery --workspace "$workspace_path" >"$run_start_file" 2>/dev/null; then
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
    REPROCTL_JSON=true cmd_autobot_orchestrator run finish "$issue_identifier" --attempt "$attempt" --state failed --error "delivery phase failed" >/dev/null 2>&1 || true
    _autobot_engine_update_status "$(_autobot_engine_queue_json)" "$$" true "$(_autobot_engine_read_mode)" "$issue_identifier" delivery "$attempt"
    return 1
  fi

  REPROCTL_JSON=true cmd_autobot_orchestrator run finish "$issue_identifier" --attempt "$attempt" --state finished >/dev/null 2>&1 || true
  snapshot_json="$(_autobot_engine_collect_monitor_snapshot "$selected_item")"
  if _autobot_engine_apply_recovery_decision "$snapshot_json"; then
    return 0
  fi
  _autobot_engine_update_status "$(_autobot_engine_queue_json)" "$$" true "$(_autobot_engine_read_mode)" "$issue_identifier" delivery "$attempt"
  return 0
}

_autobot_engine_observe_active_queue_items() {
  local queue_json="$1"
  local selected_issue="${2:-}"
  local issue_identifier claim_state attempt_count

  while IFS=$'\t' read -r issue_identifier claim_state attempt_count; do
    [[ -n "$issue_identifier" ]] || continue
    _autobot_engine_log_activity "observe issue=$issue_identifier state=$claim_state attempt=$attempt_count"
  done < <(
    python3 - "$selected_issue" "$queue_json" <<'PY'
import json
import sys

selected = sys.argv[1] if len(sys.argv) > 1 else ''
payload = json.loads(sys.argv[2] if len(sys.argv) > 2 else '{}')
items = payload.get('items')
if not isinstance(items, list):
    items = payload.get('claims') if isinstance(payload.get('claims'), list) else []

for item in items:
    if not isinstance(item, dict):
        continue

    claim_state = str(item.get('claim_state') or '')
    issue_identifier = str(item.get('issue_identifier') or item.get('identifier') or '')
    if claim_state in {'claimed', 'running', 'reconciling'} and issue_identifier and issue_identifier != selected:
        attempt_count = int(item.get('attempt_count') or 0)
        print(f'{issue_identifier}\t{claim_state}\t{attempt_count}')
PY
  )
}

_autobot_engine_process_queue() {
  local queue_json="$1"
  local selection_json selected_json selected_issue selected_state selected_attempt selected_item snapshot_json

  selection_json="$(_autobot_engine_select_work "$queue_json")"
  selected_json="$(printf '%s' "$selection_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); selected=payload.get("selected"); print(json.dumps(selected or {}))')"
  selected_issue="$(printf '%s' "$selected_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("issue_identifier") or payload.get("identifier") or "")')"
  selected_state="$(printf '%s' "$selected_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("claim_state") or "")')"
  selected_attempt="$(printf '%s' "$selected_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); print(payload.get("attempt_count") or 0)')"

  if [[ -z "$selected_issue" ]]; then
    _autobot_engine_log_activity "no processable work"
    return 1
  fi

  selected_item="$selected_json"
  _autobot_engine_log_activity "selected issue=$selected_issue state=$selected_state attempt=$selected_attempt"

  if [[ "$selected_state" == queued ]]; then
    _autobot_engine_log_activity "prepare issue=$selected_issue attempt=$selected_attempt"
    if ! REPROCTL_JSON=true cmd_autobot_orchestrator prepare "$selected_issue" --phase delivery --claimed-by autobot-engine >/dev/null 2>&1; then
      _warn "Failed to prepare queued item $selected_issue"
      _autobot_engine_update_status "$queue_json" "$$" true "$(_autobot_engine_read_mode)" "$selected_issue" delivery "$selected_attempt"
      _autobot_engine_observe_active_queue_items "$queue_json" "$selected_issue"
      return 0
    fi

    queue_json="$(_autobot_engine_queue_json)"
    _autobot_engine_update_status "$queue_json" "$$" true "$(_autobot_engine_read_mode)" "$selected_issue" delivery "$selected_attempt"
    _autobot_engine_observe_active_queue_items "$queue_json" "$selected_issue"
    return 0
  fi

  snapshot_json="$(_autobot_engine_collect_monitor_snapshot "$selected_item")"
  _autobot_engine_log_activity "recover issue=$selected_issue state=$selected_state attempt=$selected_attempt"
  if _autobot_engine_apply_recovery_decision "$snapshot_json"; then
    _autobot_engine_observe_active_queue_items "$queue_json" "$selected_issue"
    return 0
  fi

  if [[ "$selected_state" == running || "$selected_state" == reconciling ]]; then
    _autobot_engine_update_status "$queue_json" "$$" true "$(_autobot_engine_read_mode)" "$selected_issue" delivery "$selected_attempt"
    _autobot_engine_observe_active_queue_items "$queue_json" "$selected_issue"
    return 0
  fi

  if [[ "$selected_state" == failed || "$selected_state" == error || "$selected_state" == stale ]]; then
    if [[ "$selected_attempt" -ge "$AUTOBOT_ENGINE_MAX_ATTEMPTS" ]]; then
      _warn "Skipping $selected_issue after $selected_attempt attempts"
      _autobot_engine_update_status "$queue_json" "$$" true "$(_autobot_engine_read_mode)" "$selected_issue" delivery "$selected_attempt"
      _autobot_engine_observe_active_queue_items "$queue_json" "$selected_issue"
      return 0
    fi
    REPROCTL_JSON=true cmd_autobot_orchestrator retry "$selected_issue" --phase delivery --claimed-by autobot-engine >/dev/null 2>&1 || true
    _autobot_engine_update_status "$queue_json" "$$" true "$(_autobot_engine_read_mode)" "$selected_issue" delivery "$selected_attempt"
    _autobot_engine_observe_active_queue_items "$queue_json" "$selected_issue"
    return 0
  fi

  _autobot_engine_update_status "$queue_json" "$$" true "$(_autobot_engine_read_mode)" "$selected_issue" delivery "$selected_attempt"
  _autobot_engine_observe_active_queue_items "$queue_json" "$selected_issue"
  _autobot_engine_process_item "$selected_item" "$queue_json"
}

_autobot_engine_run_once() {
  local queue_json status_json selected_json selected_issue
  local auto_discover queue_depth max_concurrency discover_ids discover_id discovered_count=0
  queue_json="$(_autobot_engine_queue_json)"
  auto_discover="$(_autobot_engine_config_get engine.auto-discover)" || return 1
  queue_depth="$(_autobot_engine_config_get engine.queue-depth)" || return 1
  max_concurrency="$(_autobot_engine_config_get engine.max-concurrency)" || return 1

  if [[ "$auto_discover" = "on" ]] && command -v autobot >/dev/null 2>&1; then
    if ! _autobot_engine_queue_has_work "$queue_json"; then
      _autobot_engine_log_activity "discover queue empty; looking for candidates"
      if discover_ids="$(_autobot_engine_discover_candidates "$queue_depth")"; then
        if [[ -z "$(printf '%s' "$discover_ids" | tr -d '[:space:]')" ]]; then
          _autobot_engine_log_activity "discover returned no candidates"
        fi
        while IFS= read -r discover_id; do
          [[ -n "$discover_id" ]] || continue
          [[ "$discovered_count" -ge "$max_concurrency" ]] && break
          local add_output
          if add_output="$(autobot add "$discover_id" 2>&1)"; then
            discovered_count=$((discovered_count + 1))
            _autobot_engine_log_activity "discover added issue=$discover_id"
          else
            _autobot_engine_log_activity "discover skipped issue=$discover_id reason=${add_output:-autobot add rejected the candidate}"
            _warn "auto-discover skipped $discover_id: ${add_output:-autobot add rejected the candidate}"
          fi
        done <<< "$discover_ids"
      fi
    fi
  fi

  if _autobot_engine_process_queue "$queue_json"; then
    return 0
  fi

  _autobot_engine_update_status "$queue_json" "$$" true "$(_autobot_engine_read_mode)"
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
  _autobot_engine_write_mode foreground

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
  local daemon_args=(_daemon)
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

  [[ "$once" = true ]] && daemon_args+=(--once)
  _autobot_engine_write_mode daemon

  nohup "$launcher_script" "${daemon_args[@]}" >>"$log_file" 2>&1 &
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
    _autobot_engine_update_status "{\"items\":[],\"claims\":[]}" "" false "$(_autobot_engine_read_mode)"
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
  _autobot_engine_update_status "{\"items\":[],\"claims\":[]}" "" false "$(_autobot_engine_read_mode)"
  _ok "stopped autobot-engine"
}

cmd_autobot_engine_status() {
  local status_json queue_json pid running

  if [[ -f "$(_autobot_engine_status_path)" ]]; then
    status_json="$(cat "$(_autobot_engine_status_path)")"
  else
    queue_json="$(_autobot_engine_queue_json)"
    pid="$(_autobot_engine_read_pid)"
    local current_mode
    current_mode="$(_autobot_engine_read_mode)"
    if _autobot_engine_pid_running "$pid"; then
      running=true
    else
      running=false
      pid=""
    fi
    status_json="$(_autobot_engine_build_status_json "$queue_json" "$pid" "$running" "$current_mode")"
  fi

  if [[ "${REPROCTL_JSON:-false}" = true ]]; then
    printf '%s\n' "$status_json"
  else
    _autobot_engine_print_status_human "$status_json"
  fi
}

cmd_autobot_engine_restart() {
  local daemon="" mode

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
  elif [[ "$daemon" = "" ]]; then
    mode="$(_autobot_engine_read_mode)"
    if [[ "$mode" = daemon ]]; then
      _autobot_engine_run_daemon
    else
      _autobot_engine_run_foreground false
    fi
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
