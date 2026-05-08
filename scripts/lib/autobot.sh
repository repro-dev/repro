#!/bin/bash
#
# scripts/lib/autobot.sh — public autobot queue interface
#
# Sourced by scripts/autobot.sh. Expects scripts/lib/common.sh to be loaded
# first (provides REPO_ROOT, MAIN_CHECKOUT, SCRIPTS_DIR, die, _err, _ok,
# _warn, _step).

_autobot_queue_helper() {
  python3 "$SCRIPTS_DIR/lib/py/autobot_queue.py" "$@"
}

_autobot_main_checkout_guard() {
  if [[ "$REPO_ROOT" != "$MAIN_CHECKOUT" ]]; then
    die "autobot must run from the main checkout; worktrees are execution artifacts"
  fi
}

_autobot_prompt_yes_no() {
  local prompt="$1"
  local reply=""
  printf '%s [y/N] ' "$prompt" >&2
  if ! read -r reply; then
    return 1
  fi
  [[ "$reply" == "y" || "$reply" == "Y" || "$reply" == "yes" || "$reply" == "YES" ]]
}

_autobot_public_status_json() {
  REPROCTL_JSON=true _autonomy_py status --all
}

_autobot_public_item_json() {
  local status_json="$1"
  local issue_identifier="${2:-}"
  local status_file
  status_file="$(mktemp "$MAIN_CHECKOUT/tmp/autobot-status.XXXXXX")"
  printf '%s' "$status_json" > "$status_file"
  python3 - "$issue_identifier" "$status_file" <<'PY'
import json
import sys
from pathlib import Path

PUBLIC_STATE_MAP = {
    'queued': 'queued',
    'claimed': 'queued',
    'running': 'running',
    'reconciling': 'needs_attention',
    'failed': 'needs_attention',
    'error': 'needs_attention',
    'stale': 'needs_attention',
    'released': 'released',
    'canceled': 'removed',
}

issue_identifier = sys.argv[1]
payload = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8') or '{}')
items = []
for item in payload.get('items') or []:
    identifier = str(item.get('issue_identifier') or item.get('identifier') or '')
    if issue_identifier and identifier != issue_identifier:
        continue
    state = PUBLIC_STATE_MAP.get(str(item.get('claim_state') or ''), str(item.get('claim_state') or 'needs_attention'))
    public_item = {
        'issue_identifier': identifier,
        'state': state,
        'phase': str(item.get('phase') or ''),
        'workspace_path': str(item.get('workspace_path') or ''),
        'queued_by': str(item.get('claimed_by') or ''),
        'updated_at': str(item.get('updated_at') or ''),
        'attempt_count': int(item.get('attempt_count') or 0),
        'last_observed_issue_state_name': str(item.get('last_observed_issue_state_name') or ''),
        'last_observed_issue_state_type': str(item.get('last_observed_issue_state_type') or ''),
    }
    reason = item.get('retry_reason') or item.get('last_error') or item.get('linear_sync_error')
    if reason:
        public_item['reason'] = str(reason)
    items.append(public_item)
    if issue_identifier:
        break

print(json.dumps({'items': items, 'summary': {'total': len(items)}, 'generated_at': payload.get('generated_at') or ''}))
PY
  local rc=$?
  rm -f "$status_file"
  return "$rc"
}

_autobot_render_public_json() {
  local payload="$1"
  printf '%s\n' "$payload"
}

_autobot_render_public_human() {
  local shaped_json="$1"
  python3 - "$shaped_json" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
items = payload.get('items') or []
summary = payload.get('summary') or {}

print('QUEUE')
print(f"  total: {summary.get('total', 0)}")
print(f"  queued: {summary.get('queued', 0)}")
print(f"  running: {summary.get('running', 0)}")
print(f"  attention: {summary.get('needs_attention', 0)}")
for item in items:
    issue = item.get('issue_identifier') or 'unknown'
    state = item.get('state') or ''
    phase = item.get('phase') or ''
    print(f"  {issue} {state} {phase}".rstrip())
PY
}

_autobot_help() {
  cat <<'EOF'
Usage: autobot <subcommand>

Public queue interface for autobot work items.

Subcommands:
  add <issue> [--json] [--dry-run]
  remove <issue> [-f] [--json] [--dry-run]
  list [--json]
  status [<issue>] [--json]
  logs [<issue>] [-t] [--json]
  discover [--limit N] [--project NAME] [-q] [--json]
EOF
}

cmd_autobot_help() {
  _autobot_help
}

_autobot_add_issue() {
  local issue_identifier="$1"
  local dry_run="$2"
  local json_output="$3"

  local status_json item_json planned_workspace state_name state_type issue_id public_state
  status_json="$(_autobot_public_status_json)" || return 1
  item_json="$(_autobot_public_item_json "$status_json" "$issue_identifier")"
  public_state="$(printf '%s' "$item_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); items=payload.get("items") or []; print(items[0].get("state") if items else "")')"
  if [[ "$public_state" == queued || "$public_state" == running || "$public_state" == needs_attention ]]; then
    if [[ "$json_output" == true ]]; then
      python3 - "$item_json" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
payload['already_queued'] = True
print(json.dumps(payload))
PY
    else
      printf 'queued item %s is already %s\n' "$issue_identifier" "$public_state"
    fi
    return 0
  fi

  _resolve_issue_worktree_metadata "$issue_identifier"
  _populate_issue_worktree_names
  planned_workspace="$WT_ISSUE_WORKTREE_PATH"
  issue_id="$WT_ISSUE_UUID"
  state_name="${WT_ISSUE_STATE_NAME:-}"
  state_type="${WT_ISSUE_STATE_TYPE:-}"

  if [[ "$dry_run" == true ]]; then
    if [[ "$json_output" == true ]]; then
      python3 - "$issue_identifier" "$issue_id" "$planned_workspace" "$state_name" "$state_type" <<'PY'
import json
import sys

issue_identifier, issue_id, workspace_path, state_name, state_type = sys.argv[1:6]
print(json.dumps({
    'issue_identifier': issue_identifier,
    'issue_id': issue_id,
    'workspace_path': workspace_path,
    'issue_state_name': state_name,
    'issue_state_type': state_type,
    'dry_run': True,
}))
PY
    else
      printf 'Would queue item %s at %s\n' "$issue_identifier" "$planned_workspace"
    fi
    return 0
  fi

  if [[ "$state_type" == started || "$state_name" == "In Progress" ]]; then
    if [[ -t 0 ]]; then
      if ! _autobot_prompt_yes_no "Linear says ${issue_identifier} is already In Progress; queue it anyway?"; then
        die "aborted by user"
      fi
    else
      die "refusing to queue ${issue_identifier} without confirmation while Linear is already In Progress"
    fi
  fi

  local queue_args=(queue "$issue_identifier" --issue-id "$issue_id" --workspace "$planned_workspace" --issue-state "$state_name" --issue-state-type "${state_type:-unstarted}")
  REPROCTL_JSON=true _autonomy_py "${queue_args[@]}" >/dev/null || return 1
  _autonomy_linear_sync_assignment "$issue_identifier" assign || true

  if [[ "$json_output" == true ]]; then
    status_json="$(_autobot_public_status_json)" || return 1
    printf '%s\n' "$(printf '%s' "$status_json" | _autobot_queue_helper status --issue "$issue_identifier")"
  else
    printf 'queued item %s\n' "$issue_identifier"
  fi
}

cmd_autobot_add() {
  local dry_run=false json_output="${REPROCTL_JSON:-false}"
  local issue_identifiers=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --json) json_output=true ;;
      --dry-run) dry_run=true ;;
      --)
        shift
        while [[ $# -gt 0 ]]; do
          issue_identifiers+=("$1")
          shift
        done
        break
        ;;
      -h|--help)
        _autobot_help
        return 0
        ;;
      -*) die "Unknown option: $1\nRun 'autobot --help' for usage." ;;
      *) issue_identifiers+=("$1") ;;
    esac
    shift
  done

  [[ ${#issue_identifiers[@]} -gt 0 ]] || die "Missing issue identifier"

  local issue_identifier
  for issue_identifier in "${issue_identifiers[@]}"; do
    _autonomy_validate_issue_identifier "$issue_identifier" || die "Invalid issue identifier: '$issue_identifier'. Expected format: REP-123"
    _autobot_add_issue "$issue_identifier" "$dry_run" "$json_output" || return 1
  done
}

cmd_autobot_remove() {
  local issue_identifier=""
  local force=false dry_run=false json_output="${REPROCTL_JSON:-false}"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -f|--force) force=true ;;
      --json) json_output=true ;;
      --dry-run) dry_run=true ;;
      -h|--help)
        _autobot_help
        return 0
        ;;
      --)
        shift
        if [[ $# -gt 0 ]]; then
          issue_identifier="$1"
          shift
        fi
        break
        ;;
      -*) die "Unknown option: $1\nRun 'autobot --help' for usage." ;;
      *)
        if [[ -z "$issue_identifier" ]]; then
          issue_identifier="$1"
        else
          die "Unexpected argument: $1\nRun 'autobot --help' for usage."
        fi
        ;;
    esac
    shift
  done

  [[ -n "$issue_identifier" ]] || die "Missing issue identifier"
  _autonomy_validate_issue_identifier "$issue_identifier" || die "Invalid issue identifier: '$issue_identifier'. Expected format: REP-123"

  local status_json item_json public_state workspace_path
  status_json="$(_autobot_public_status_json)" || return 1
  item_json="$(_autobot_public_item_json "$status_json" "$issue_identifier")"
  public_state="$(printf '%s' "$item_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); items=payload.get("items") or []; print(items[0].get("state") if items else "")')"
  workspace_path="$(printf '%s' "$item_json" | python3 -c 'import json,sys; payload=json.load(sys.stdin); items=payload.get("items") or []; print(items[0].get("workspace_path") if items else "")')"

  if [[ -z "$public_state" ]]; then
    if [[ "$json_output" == true ]]; then
      printf '%s\n' '{"removed":false,"reason":"not queued"}'
    else
      printf 'not queued: %s\n' "$issue_identifier"
    fi
    return 0
  fi

  if [[ "$public_state" == released || "$public_state" == removed ]]; then
    if [[ "$json_output" == true ]]; then
      printf '%s\n' '{"removed":false,"reason":"not queued"}'
    else
      printf 'not queued: %s\n' "$issue_identifier"
    fi
    return 0
  fi

  if [[ "$dry_run" == true ]]; then
    if [[ "$json_output" == true ]]; then
      python3 - "$issue_identifier" "$workspace_path" <<'PY'
import json
import sys

issue_identifier, workspace_path = sys.argv[1:3]
print(json.dumps({
    'issue_identifier': issue_identifier,
    'workspace_path': workspace_path,
    'dry_run': True,
    'removed': False,
}))
PY
    else
      printf 'Would remove queued item %s\n' "$issue_identifier"
    fi
    return 0
  fi

  if [[ "$public_state" == running || "$public_state" == needs_attention ]]; then
    if [[ "$force" != true ]]; then
      if [[ -t 0 ]]; then
        if ! _autobot_prompt_yes_no "Remove in-flight item ${issue_identifier}?"; then
          die "aborted by user"
        fi
      else
        die "refusing to remove ${issue_identifier} without confirmation while work is in flight"
      fi
    fi
  fi

  REPROCTL_JSON=true cmd_autonomy cancel "$issue_identifier" --reason "removed by autobot" >/dev/null || return 1

  if [[ "$json_output" == true ]]; then
    printf '%s\n' '{"removed":true,"issue_identifier":"'$issue_identifier'"}'
  else
    printf 'removed queued item %s\n' "$issue_identifier"
    if [[ -n "$workspace_path" ]]; then
      printf 'workspace preserved at %s\n' "$workspace_path"
    fi
  fi
}

cmd_autobot_list() {
  local json_output="${REPROCTL_JSON:-false}"
  if [[ "${1:-}" == "--json" ]]; then
    json_output=true
    shift
  fi
  [[ $# -eq 0 ]] || die "Unknown option: $1\nRun 'autobot --help' for usage."

  local status_json shaped_json
  status_json="$(_autobot_public_status_json)" || return 1
  shaped_json="$(printf '%s' "$status_json" | _autobot_queue_helper list)"
  if [[ "$json_output" == true ]]; then
    _autobot_render_public_json "$shaped_json"
  else
    _autobot_render_public_human "$shaped_json"
  fi
}

cmd_autobot_status() {
  local issue_identifier=""
  local json_output="${REPROCTL_JSON:-false}"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --json) json_output=true ;;
      -h|--help)
        _autobot_help
        return 0
        ;;
      --)
        shift
        if [[ $# -gt 0 ]]; then
          issue_identifier="$1"
          shift
        fi
        break
        ;;
      -*) die "Unknown option: $1\nRun 'autobot --help' for usage." ;;
      *)
        if [[ -z "$issue_identifier" ]]; then
          issue_identifier="$1"
        else
          die "Unexpected argument: $1\nRun 'autobot --help' for usage."
        fi
        ;;
    esac
    shift
  done

  local status_json shaped_json
  status_json="$(_autobot_public_status_json)" || return 1
  if [[ -n "$issue_identifier" ]]; then
    shaped_json="$(printf '%s' "$status_json" | _autobot_queue_helper status --issue "$issue_identifier")"
  else
    shaped_json="$(printf '%s' "$status_json" | _autobot_queue_helper status)"
  fi

  if [[ "$json_output" == true ]]; then
    _autobot_render_public_json "$shaped_json"
  else
    _autobot_render_public_human "$shaped_json"
  fi
}

cmd_autobot_logs() {
  local issue_identifier=""
  local tail=false json_output="${REPROCTL_JSON:-false}"

  if [[ $# -gt 0 ]] && [[ "${1:-}" != -* ]]; then
    issue_identifier="$1"
    shift
  fi

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -t) tail=true ;;
      --json) json_output=true ;;
      -h|--help)
        _autobot_help
        return 0
        ;;
      *) die "Unknown option: $1\nRun 'autobot --help' for usage." ;;
    esac
    shift
  done

  local engine_log="$MAIN_CHECKOUT/.autobot/engine.log"
  local issue_logs=()
  if [[ -n "$issue_identifier" ]]; then
    local run_dir
    run_dir="$MAIN_CHECKOUT/.autobot/runs"
    local log_path
    for log_path in "$run_dir/${issue_identifier}"-attempt-*/events.jsonl; do
      [[ -f "$log_path" ]] || continue
      issue_logs+=("$log_path")
    done
  fi

  if [[ "$json_output" == true ]]; then
    local log_args=(--engine-log "$engine_log")
    if [[ ${#issue_logs[@]} -gt 0 ]]; then
      local log_path
      for log_path in "${issue_logs[@]}"; do
        log_args+=(--issue-log "$log_path")
      done
    fi
    printf '{}' | _autobot_queue_helper logs "${log_args[@]}"
    return 0
  fi

  if [[ "$tail" == true ]]; then
    if [[ -n "$issue_identifier" && ${#issue_logs[@]} -gt 0 ]]; then
      local last_index=$(( ${#issue_logs[@]} - 1 ))
      tail -n 20 "${issue_logs[$last_index]}"
    elif [[ -f "$engine_log" ]]; then
      tail -n 20 "$engine_log"
    else
      printf 'no logs yet\n'
    fi
    return 0
  fi

  if [[ -f "$engine_log" ]]; then
    printf 'engine log: %s\n' "$engine_log"
  fi
  if [[ -n "$issue_identifier" && ${#issue_logs[@]} -gt 0 ]]; then
    printf 'issue logs:\n'
    local p
    for p in "${issue_logs[@]}"; do
      printf '  %s\n' "$p"
    done
  elif [[ -n "$issue_identifier" ]]; then
    printf 'no logs yet for %s\n' "$issue_identifier"
  fi
}

cmd_autobot_discover() {
  local limit=10 project_scope="" json_output="${REPROCTL_JSON:-false}" quiet=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --json) json_output=true ;;
      --limit) [[ -n "${2:-}" ]] || die "Missing value for $1"; limit="$2"; shift 2; continue ;;
      --project) [[ -n "${2:-}" ]] || die "Missing value for $1"; project_scope="$2"; shift 2; continue ;;
      -q) quiet=true ;;
      -h|--help)
        _autobot_help
        return 0
        ;;
      *) die "Unknown option: $1\nRun 'autobot --help' for usage." ;;
    esac
    shift
  done

  local discover_args=(discover --limit "$limit")
  [[ -n "$project_scope" ]] && discover_args+=(--project "$project_scope")
  discover_args+=(--json)
  local discovery_json
  local previous_json="${REPROCTL_JSON:-false}"
  REPROCTL_JSON=true
  discovery_json="$(cmd_autonomy "${discover_args[@]}")" || return 1
  REPROCTL_JSON="$previous_json"

  if [[ "$json_output" == true ]]; then
    printf '%s\n' "$discovery_json"
    return 0
  fi

  local issue_ids
  issue_ids="$(printf '%s' "$discovery_json" | _autobot_queue_helper discover-ids)"
  if [[ "$quiet" == true ]]; then
    printf '%s\n' "$issue_ids"
  else
    printf 'Queued candidates:\n'
    while IFS= read -r issue_identifier; do
      [[ -n "$issue_identifier" ]] || continue
      printf '  %s\n' "$issue_identifier"
    done <<< "$issue_ids"
  fi
}

cmd_autobot() {
  local subcmd="${1:-}"
  shift || true

  case "$subcmd" in
    -h|--help|help|"")
      cmd_autobot_help
      return 0
      ;;
  esac

  _autobot_main_checkout_guard

  case "$subcmd" in
    add)
      cmd_autobot_add "$@"
      ;;
    remove)
      cmd_autobot_remove "$@"
      ;;
    list)
      cmd_autobot_list "$@"
      ;;
    status)
      cmd_autobot_status "$@"
      ;;
    logs)
      cmd_autobot_logs "$@"
      ;;
    discover)
      cmd_autobot_discover "$@"
      ;;
    *)
      die "Unknown subcommand: $subcmd\nRun 'autobot --help' for usage."
      ;;
  esac
}
