#!/bin/bash
#
# scripts/lib/autonomy.sh — durable claim/run orchestration state
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh to be loaded
# first (provides REPO_ROOT, MAIN_CHECKOUT, PARENT_DIR, die, _err, _ok).

_autonomy_db_path() {
  if [[ -n "${REPRO_AUTONOMY_DB:-}" ]]; then
    printf '%s\n' "$REPRO_AUTONOMY_DB"
    return 0
  fi

  printf '%s\n' "$MAIN_CHECKOUT/tmp/autonomy/state.sqlite"
}

_autonomy_main_checkout() {
  if [[ -n "${MAIN_CHECKOUT:-}" ]]; then
    printf '%s\n' "$MAIN_CHECKOUT"
  else
    printf '%s\n' "$REPO_ROOT"
  fi
}


_autonomy_workspace_root() {
  local main_checkout
  main_checkout="$(_autonomy_main_checkout)"

  if [[ -n "${WORKSPACE_ROOT:-}" ]]; then
    printf '%s\n' "$WORKSPACE_ROOT"
  else
    if [[ -n "${PARENT_DIR:-}" ]]; then
      printf '%s\n' "$PARENT_DIR"
    else
      printf '%s\n' "$(dirname "$main_checkout")"
    fi
  fi
}

_autonomy_py() {
  local db_path main_checkout
  local workspace_root
  db_path="$(_autonomy_db_path)"
  main_checkout="$(_autonomy_main_checkout)"
  workspace_root="$(_autonomy_workspace_root)"

  if [[ "${REPROCTL_JSON:-false}" == true ]]; then
    python3 "$SCRIPTS_DIR/lib/py/autonomy_state.py" --db "$db_path" --main-checkout "$main_checkout" --workspace-root "$workspace_root" --json "$@"
  else
    python3 "$SCRIPTS_DIR/lib/py/autonomy_state.py" --db "$db_path" --main-checkout "$main_checkout" --workspace-root "$workspace_root" "$@"
  fi
}

_autonomy_issue_id() {
  local issue_identifier="${1:-}"
  [[ -n "$issue_identifier" ]] || die "Missing issue identifier"
  _autonomy_validate_issue_identifier "$issue_identifier" || die "Invalid issue identifier: '$issue_identifier'. Expected format: REP-123"

  local issue_json issue_id
  issue_json="$(linear issue show "$issue_identifier" --json)" || die "Failed to resolve Linear issue: $issue_identifier"
  issue_id="$(python3 "$SCRIPTS_DIR/lib/py/autonomy_issue_id.py" "$issue_json")" || die "Failed to resolve Linear issue UUID for $issue_identifier"

  printf '%s\n' "$issue_id"
}

_autonomy_active_claim() {
  local issue_identifier="$1"

  local status_json
  status_json="$(REPROCTL_JSON=true _autonomy_py status)"

  python3 "$SCRIPTS_DIR/lib/py/autonomy_active_claim.py" "$issue_identifier" <<<"$status_json"
}

_autonomy_monitor_payload() {
  local backlog_json todo_json claims_json
  backlog_json="$(linear issue list --status backlog --json identifier,priority,project,status,relations)" || die "Failed to list backlog issues"
  todo_json="$(linear issue list --status todo --json identifier,priority,project,status,relations)" || die "Failed to list todo issues"
  claims_json="$(REPROCTL_JSON=true _autonomy_py status --all)" || die "Failed to load autonomy claims"

  python3 "$SCRIPTS_DIR/lib/py/autonomy_monitor_payload.py" "$backlog_json" "$todo_json" "$claims_json" || die "Failed to enrich monitor issues"
}

_autonomy_monitor_issue_ids() {
  local evaluation_json="$1"

  python3 "$SCRIPTS_DIR/lib/py/autonomy_monitor_issue_ids.py" "$evaluation_json"
}

_autonomy_monitor_render() {
  local evaluation_json="$1"

  python3 "$SCRIPTS_DIR/lib/py/autonomy_monitor_render.py" "$evaluation_json"
}

_autonomy_sequence_render_prompt() {
  local template_file="$1"
  local evaluation_json="$2"
  local result_limit="$3"

  python3 "$SCRIPTS_DIR/lib/py/autonomy_sequence.py" render --template-file "$template_file" --evaluation-json "$evaluation_json" --result-limit "$result_limit"
}

_autonomy_sequence_finalize() {
  local template_file="$1"
  local evaluation_json="$2"
  local raw_response="$3"
  local output_dir="$4"
  local result_limit="$5"

  python3 "$SCRIPTS_DIR/lib/py/autonomy_sequence.py" finalize --template-file "$template_file" --evaluation-json "$evaluation_json" --raw-response "$raw_response" --output-dir "$output_dir" --result-limit "$result_limit"
}

_autonomy_monitor_tick() {
  local once="$1" prepare="$2" json_output="$3" limit="$4" interval="$5" claimed_by="$6"
  shift 6 || true
  local project_scopes=()
  if (($# > 0)); then
    project_scopes=("$@")
  fi
  local payload evaluation_json

  while :; do
    payload="$(_autonomy_monitor_payload)" || return 1
    local monitor_args=(--json --limit "$limit")
    if [[ "$prepare" == true ]]; then
      monitor_args+=(--prepare)
    fi
    if [[ -n "$claimed_by" ]]; then
      monitor_args+=(--claimed-by "$claimed_by")
    fi
    local project_scope
    if ((${#project_scopes[@]} > 0)); then
      for project_scope in "${project_scopes[@]}"; do
        [[ -n "$project_scope" ]] || continue
        monitor_args+=(--project "$project_scope")
      done
    fi

    if [[ "$prepare" == true ]]; then
      evaluation_json="$(printf '%s' "$payload" | python3 "$SCRIPTS_DIR/lib/py/autonomy_monitor.py" "${monitor_args[@]}")" || return 1
    else
      evaluation_json="$(printf '%s' "$payload" | python3 "$SCRIPTS_DIR/lib/py/autonomy_monitor.py" "${monitor_args[@]}")" || return 1
    fi

    if [[ "$prepare" == true ]]; then
      while IFS= read -r issue_identifier; do
        [[ -n "$issue_identifier" ]] || continue
        _autonomy_monitor_prepare_issue "$issue_identifier" "$claimed_by" >&2
      done < <(_autonomy_monitor_issue_ids "$evaluation_json")
    fi

    if [[ "$json_output" == true ]]; then
      printf '%s\n' "$evaluation_json"
    else
      _autonomy_monitor_render "$evaluation_json"
    fi

    if [[ "$once" == true ]]; then
      break
    fi

    sleep "$interval"
  done
}

_autonomy_monitor_prepare_issue() {
  local issue_identifier="$1"
  local claimed_by="${2:-}"

  if [[ -n "$claimed_by" ]]; then
    cmd_autonomy prepare "$issue_identifier" --phase observe --claimed-by "$claimed_by"
  else
    cmd_autonomy prepare "$issue_identifier" --phase observe
  fi
}

_autonomy_linear_issue_state_info() {
  local issue_identifier="$1"
  local target_state_name="$2"

  _autonomy_validate_issue_identifier "$issue_identifier" || return 1

  local team_key issue_number query response
  team_key="${issue_identifier%%-*}"
  issue_number="${issue_identifier##*-}"
  query="{ issues(filter: { number: { eq: ${issue_number} }, team: { key: { eq: \"${team_key}\" } } }, first: 1) { nodes { id identifier state { name type } team { states { nodes { id name type } } } } } }"
  response="$(_linear_api "$query")" || return 1

  python3 - "$target_state_name" "$response" <<'PY'
import json
import sys

wanted = sys.argv[1]
data = json.loads(sys.argv[2])
nodes = data.get('data', {}).get('issues', {}).get('nodes', [])
if not nodes:
    raise SystemExit(1)

node = nodes[0]
print(node.get('id', ''))
print(node.get('state', {}).get('name', ''))
print(node.get('state', {}).get('type', ''))
state_id = ''
for state in node.get('team', {}).get('states', {}).get('nodes', []):
    if state.get('name') == wanted:
        state_id = state.get('id', '')
        break
print(state_id)
PY
}

_autonomy_record_sync() {
  local issue_identifier="$1"
  local kind="$2"
  local ok="$3"
  local error_text="${4:-}"
  local assignment_owned="${5:-}"

  if [[ "$ok" == true ]]; then
    if [[ "$kind" == assignment ]]; then
      REPROCTL_JSON=true _autonomy_py sync "$issue_identifier" --kind "$kind" --ok --assignment-owned "${assignment_owned:-false}" >/dev/null
    else
      REPROCTL_JSON=true _autonomy_py sync "$issue_identifier" --kind "$kind" --ok >/dev/null
    fi
  else
    REPROCTL_JSON=true _autonomy_py sync "$issue_identifier" --kind "$kind" --error "$error_text" >/dev/null
  fi
}

_autonomy_claim_assignment_owned() {
  local issue_identifier="$1"
  local active_claim owned

  if ! active_claim="$(_autonomy_active_claim "$issue_identifier")"; then
    printf 'false\n'
    return 0
  fi

  owned="$(python3 - <<'PY' "$active_claim"
import json
import sys

claim = json.loads(sys.argv[1])
print(str(bool(claim.get('linear_assignment_owned'))).lower())
PY
)"
  printf '%s\n' "$owned"
}

_autonomy_validate_issue_identifier() {
  local issue_identifier="$1"
  [[ "$issue_identifier" =~ ^[A-Z]+-[0-9]+$ ]]
}

_autonomy_linear_viewer_id() {
  local response viewer_id
  response="$(_linear_api '{ viewer { id } }')" || return 1
  viewer_id="$(python3 - <<'PY' "$response"
import json
import sys

data = json.loads(sys.argv[1])
print(data.get('data', {}).get('viewer', {}).get('id', ''))
PY
)"
  [[ -n "$viewer_id" ]] || return 1
  printf '%s\n' "$viewer_id"
}

_autonomy_linear_set_state() {
  local issue_identifier="$1"
  local target_state_name="$2"
  local allow_terminal="${3:-true}"

  local state_info issue_uuid current_state_name current_state_type target_state_id
  state_info="$(_autonomy_linear_issue_state_info "$issue_identifier" "$target_state_name")" || {
    _autonomy_record_sync "$issue_identifier" state false "failed to resolve Linear metadata"
    return 1
  }

  issue_uuid="$(sed -n '1p' <<< "$state_info")"
  current_state_name="$(sed -n '2p' <<< "$state_info")"
  current_state_type="$(sed -n '3p' <<< "$state_info")"
  target_state_id="$(sed -n '4p' <<< "$state_info")"

  case "$current_state_type" in
    completed|canceled|closed|done)
      if [[ "$allow_terminal" != true ]]; then
        _autonomy_record_sync "$issue_identifier" state false "Linear issue is terminal: $current_state_name"
        return 1
      fi
      _autonomy_record_sync "$issue_identifier" state true
      return 0
      ;;
  esac

  if [[ -z "$target_state_id" ]]; then
    _autonomy_record_sync "$issue_identifier" state false "missing Linear state: $target_state_name"
    return 1
  fi

  local mutation
  mutation="mutation { issueUpdate(id: \"$issue_uuid\", input: { stateId: \"$target_state_id\" }) { issue { id identifier } } }"
  if _linear_api "$mutation" >/dev/null; then
    _autonomy_record_sync "$issue_identifier" state true
    return 0
  fi

  _autonomy_record_sync "$issue_identifier" state false "failed to update Linear state to $target_state_name"
}

_autonomy_linear_sync_assignment() {
  local issue_identifier="$1"
  local action="$2"

  _autonomy_validate_issue_identifier "$issue_identifier" || return 1

  local team_key issue_number query response viewer_id
  team_key="${issue_identifier%%-*}"
  issue_number="${issue_identifier##*-}"
  query="{ issues(filter: { number: { eq: ${issue_number} }, team: { key: { eq: \"${team_key}\" } } }, first: 1) { nodes { id identifier state { name type } assignee { id } } } }"
  response="$(_linear_api "$query")" || {
    _autonomy_record_sync "$issue_identifier" assignment false "failed to resolve Linear metadata"
    return 1
  }

  local issue_uuid assignee_id
  issue_uuid="$(python3 - <<'PY' "$response"
import json
import sys

data = json.loads(sys.argv[1])
nodes = data.get('data', {}).get('issues', {}).get('nodes', [])
if not nodes:
    raise SystemExit(1)

node = nodes[0]
print(node.get('id', ''))
assignee = node.get('assignee') or {}
print(assignee.get('id', ''))
PY
)"
  assignee_id="$(sed -n '2p' <<< "$issue_uuid")"
  issue_uuid="$(sed -n '1p' <<< "$issue_uuid")"

  case "$action" in
    assign)
      viewer_id="$(_autonomy_linear_viewer_id)" || {
        _autonomy_record_sync "$issue_identifier" assignment false "failed to resolve automation viewer"
        return 1
      }
      if [[ -n "$assignee_id" && "$assignee_id" != "$viewer_id" ]]; then
        return 0
      fi
      if [[ "$assignee_id" == "$viewer_id" ]]; then
        return 0
      fi
      if _linear_api "mutation { issueUpdate(id: \"$issue_uuid\", input: { assigneeId: \"$viewer_id\" }) { issue { id identifier } } }" >/dev/null; then
        _autonomy_record_sync "$issue_identifier" assignment true "" true
        return 0
      fi
      _autonomy_record_sync "$issue_identifier" assignment false "failed to assign automation viewer"
      return 1
      ;;
    clear)
      viewer_id="$(_autonomy_linear_viewer_id)" || {
        _autonomy_record_sync "$issue_identifier" assignment false "failed to resolve automation viewer"
        return 1
      }
      if [[ -n "$assignee_id" && "$assignee_id" != "$viewer_id" ]]; then
        return 0
      fi
      if _linear_api "mutation { issueUpdate(id: \"$issue_uuid\", input: { assigneeId: null }) { issue { id identifier } } }" >/dev/null; then
        _autonomy_record_sync "$issue_identifier" assignment true "" false
        return 0
      fi
      _autonomy_record_sync "$issue_identifier" assignment false "failed to clear Linear assignee"
      return 1
      ;;
    *)
      return 1
      ;;
  esac
}

cmd_autonomy_help() {
  cat <<'EOF'
Usage: reproctl autonomy <subcommand>

Durable local state for autonomous orchestration.

Subcommands:
  status [--all] [--json]        Show current claims and run attempts
  claim <issue> --workspace <path> --phase <phase> --issue-state <name> [--issue-state-type <type>] [--claimed-by <user>]
  prepare <issue> [--phase observe] [--claimed-by <name>]
  release <issue> [--reason <text>] [--json]
  cancel <issue> [--reason <text>] [--json]
  retry <issue> [--phase observe] [--claimed-by <name>] [--reason <text>] [--json]
  reconcile [<issue> | --all]
  discover [--limit <count>] [--profile <name>] [--prompt-file <path>] [--output-dir <path>] [--claimed-by <name>] [--project <name>] [--json]
  run start <issue> --phase <phase> --workspace <path>
  run finish <issue> --attempt <n> --state <state> [--error <text>]

Examples:
  reproctl autonomy status --json
  reproctl autonomy claim REP-1094 --workspace /path/to/repro-wt-rep-1094 --phase observe --issue-state In-Progress
  reproctl autonomy prepare REP-1095 --phase observe --claimed-by autopilot
  reproctl autonomy discover --limit 2 --profile github-copilot-sonnet --output-dir tmp/autonomy/discoveries --json
  reproctl autonomy run start REP-1094 --phase observe --workspace /path/to/repro-wt-rep-1094
EOF
}

cmd_autonomy() {
  local subcmd="${1:-}"
  shift || true

  case "$subcmd" in
    -h|--help|help|"")
      cmd_autonomy_help
      return 0
      ;;

    status)
      local all=false
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --json) : ;;
          --all) all=true ;;
          -h|--help)
            cmd_autonomy_help
            return 0
            ;;
          *) die "Unknown option: $1\nRun 'reproctl autonomy --help' for usage." ;;
        esac
        shift
      done
      if [[ "$all" == true ]]; then
        _autonomy_py status --all
      else
        _autonomy_py status
      fi
      ;;

    claim)
      local issue_identifier="${1:-}"
      shift || true
      local issue_id="" workspace="" phase="" issue_state="" issue_state_type="started" claimed_by=""
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --json) shift ;;
          --workspace) [[ -n "${2:-}" ]] || die "Missing value for $1"; workspace="$2"; shift 2 ;;
          --phase) [[ -n "${2:-}" ]] || die "Missing value for $1"; phase="$2"; shift 2 ;;
          --issue-state) [[ -n "${2:-}" ]] || die "Missing value for $1"; issue_state="$2"; shift 2 ;;
          --issue-state-type) [[ -n "${2:-}" ]] || die "Missing value for $1"; issue_state_type="$2"; shift 2 ;;
          --claimed-by) [[ -n "${2:-}" ]] || die "Missing value for $1"; claimed_by="$2"; shift 2 ;;
          -h|--help)
            cmd_autonomy_help
            return 0
            ;;
          *) die "Unknown option: $1\nRun 'reproctl autonomy --help' for usage." ;;
        esac
      done
      [[ -n "$issue_identifier" ]] || die "Missing issue identifier"
      [[ -n "$workspace" ]] || die "Missing --workspace"
      [[ -n "$phase" ]] || die "Missing --phase"
      [[ -n "$issue_state" ]] || die "Missing --issue-state"
      issue_id="$(_autonomy_issue_id "$issue_identifier")"
      local args=(claim "$issue_identifier" --issue-id "$issue_id" --workspace "$workspace" --phase "$phase" --issue-state "$issue_state" --issue-state-type "${issue_state_type:-started}")
      [[ -n "$claimed_by" ]] && args+=(--claimed-by "$claimed_by")
      _autonomy_py "${args[@]}"
      _autonomy_linear_sync_assignment "$issue_identifier" assign || true
      ;;

    prepare)
      local issue_identifier="${1:-}"
      shift || true
      local phase="observe" claimed_by=""
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --json) shift ;;
          --phase) [[ -n "${2:-}" ]] || die "Missing value for $1"; phase="$2"; shift 2 ;;
          --claimed-by) [[ -n "${2:-}" ]] || die "Missing value for $1"; claimed_by="$2"; shift 2 ;;
          -h|--help)
            cmd_autonomy_help
            return 0
            ;;
          *) die "Unknown option: $1\nRun 'reproctl autonomy --help' for usage." ;;
        esac
      done
      [[ -n "$issue_identifier" ]] || die "Missing issue identifier"

      _resolve_issue_worktree_metadata "$issue_identifier"

      local active_claim
      if active_claim="$(_autonomy_active_claim "$WT_ISSUE_IDENTIFIER")"; then
        if [[ "${REPROCTL_JSON:-false}" == true ]]; then
          python3 "$SCRIPTS_DIR/lib/py/autonomy_prepare_json.py" existing-claim "$active_claim"
        else
          die "existing claim for ${WT_ISSUE_IDENTIFIER}"
        fi
        return 1
      fi

      _populate_issue_worktree_names
      if [[ "${REPROCTL_JSON:-false}" == true ]]; then
        _create_issue_worktree_from_metadata >&2
      else
        _create_issue_worktree_from_metadata
      fi

      local claim_args=(claim "$WT_ISSUE_IDENTIFIER" --issue-id "$WT_ISSUE_UUID" --workspace "$WT_ISSUE_WORKTREE_PATH" --phase "$phase" --issue-state "$WT_ISSUE_STATE_NAME" --issue-state-type "${WT_ISSUE_STATE_TYPE:-started}")
      [[ -n "$claimed_by" ]] && claim_args+=(--claimed-by "$claimed_by")

      local claim_json
      claim_json="$(REPROCTL_JSON=true _autonomy_py "${claim_args[@]}")" || return 1

      if [[ "$WT_ISSUE_LINEAR_SYNCED" == true ]]; then
        _autonomy_record_sync "$WT_ISSUE_IDENTIFIER" state true
      elif [[ -n "$WT_ISSUE_LINEAR_SYNC_ERROR" ]]; then
        _autonomy_record_sync "$WT_ISSUE_IDENTIFIER" state false "$WT_ISSUE_LINEAR_SYNC_ERROR"
      fi

      _autonomy_linear_sync_assignment "$WT_ISSUE_IDENTIFIER" assign || true

      if [[ "${REPROCTL_JSON:-false}" == true ]]; then
        python3 "$SCRIPTS_DIR/lib/py/autonomy_prepare_json.py" prepare "$phase" "$claimed_by" "$WT_ISSUE_UUID" "$WT_ISSUE_IDENTIFIER" "$WT_ISSUE_WORKTREE_PATH" "$WT_ISSUE_WORKTREE_BRANCH" "$WT_ISSUE_WORKTREE_SLUG" "$WT_ISSUE_STATE_NAME" "$WT_ISSUE_STATE_TYPE" "$claim_json"
      else
        echo "Prepared workspace for ${WT_ISSUE_IDENTIFIER}"
        echo "  Branch: ${WT_ISSUE_WORKTREE_BRANCH}"
        echo "  Slug:   ${WT_ISSUE_WORKTREE_SLUG}"
        echo "  Path:   ${WT_ISSUE_WORKTREE_PATH}"
        echo "  Phase:  ${phase}"
      fi
      ;;

    release)
      local issue_identifier="${1:-}"
      shift || true
      local reason=""
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --json) shift ;;
          --reason) [[ -n "${2:-}" ]] || die "Missing value for $1"; reason="$2"; shift 2 ;;
          -h|--help)
            cmd_autonomy_help
            return 0
            ;;
          *) die "Unknown option: $1\nRun 'reproctl autonomy --help' for usage." ;;
        esac
      done
      [[ -n "$issue_identifier" ]] || die "Missing issue identifier"
      local assignment_owned
      assignment_owned="$(_autonomy_claim_assignment_owned "$issue_identifier")"
      if [[ -n "$reason" ]]; then
        _autonomy_py release "$issue_identifier" --reason "$reason"
      else
        _autonomy_py release "$issue_identifier"
      fi
      _autonomy_linear_set_state "$issue_identifier" "Todo"
      if [[ "$assignment_owned" == true ]]; then
        _autonomy_linear_sync_assignment "$issue_identifier" clear || true
      fi
      ;;

    cancel)
      local issue_identifier="${1:-}"
      shift || true
      local reason=""
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --json) shift ;;
          --reason) [[ -n "${2:-}" ]] || die "Missing value for $1"; reason="$2"; shift 2 ;;
          -h|--help)
            cmd_autonomy_help
            return 0
            ;;
          *) die "Unknown option: $1\nRun 'reproctl autonomy --help' for usage." ;;
        esac
      done
      [[ -n "$issue_identifier" ]] || die "Missing issue identifier"
      local assignment_owned
      assignment_owned="$(_autonomy_claim_assignment_owned "$issue_identifier")"
      if [[ -n "$reason" ]]; then
        _autonomy_py cancel "$issue_identifier" --reason "$reason"
      else
        _autonomy_py cancel "$issue_identifier"
      fi
      _autonomy_linear_set_state "$issue_identifier" "Todo"
      if [[ "$assignment_owned" == true ]]; then
        _autonomy_linear_sync_assignment "$issue_identifier" clear || true
      fi
      ;;

    retry)
      local issue_identifier="${1:-}"
      shift || true
      local phase="observe" claimed_by="" reason=""
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --json) shift ;;
          --phase) [[ -n "${2:-}" ]] || die "Missing value for $1"; phase="$2"; shift 2 ;;
          --claimed-by) [[ -n "${2:-}" ]] || die "Missing value for $1"; claimed_by="$2"; shift 2 ;;
          --reason) [[ -n "${2:-}" ]] || die "Missing value for $1"; reason="$2"; shift 2 ;;
          -h|--help)
            cmd_autonomy_help
            return 0
            ;;
          *) die "Unknown option: $1\nRun 'reproctl autonomy --help' for usage." ;;
        esac
      done
      [[ -n "$issue_identifier" ]] || die "Missing issue identifier"

      local state_info current_state_name current_state_type
      state_info="$(_autonomy_linear_issue_state_info "$issue_identifier" "In Progress")" || {
        _autonomy_record_sync "$issue_identifier" state false "failed to resolve Linear metadata"
        return 1
      }
      current_state_name="$(sed -n '2p' <<< "$state_info")"
      current_state_type="$(sed -n '3p' <<< "$state_info")"

      case "$current_state_type" in
        completed|canceled|closed|done)
          _autonomy_py reconcile "$issue_identifier" --issue-state-type "$current_state_type"
          _autonomy_record_sync "$issue_identifier" state false "Linear issue is terminal: $current_state_name"
          return 1
          ;;
      esac

      if [[ -n "$reason" ]]; then
        _autonomy_py retry "$issue_identifier" --reason "$reason" >/dev/null
      else
        _autonomy_py retry "$issue_identifier" >/dev/null
      fi

      _autonomy_linear_set_state "$issue_identifier" "In Progress" false
      _autonomy_linear_sync_assignment "$issue_identifier" assign || true
      local prepare_args=(prepare "$issue_identifier" --phase "$phase")
      [[ -n "$claimed_by" ]] && prepare_args+=(--claimed-by "$claimed_by")
      cmd_autonomy "${prepare_args[@]}"
      ;;

    reconcile)
      local issue_identifier=""
      local all=false
      local issue_state_name="" issue_state_type=""
      if [[ $# -gt 0 ]] && [[ "${1:-}" != -* ]]; then
        issue_identifier="$1"
        shift
      fi
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --json) shift ;;
          --all) all=true; shift ;;
          --issue-state-name) [[ -n "${2:-}" ]] || die "Missing value for $1"; issue_state_name="$2"; shift 2 ;;
          --issue-state-type) [[ -n "${2:-}" ]] || die "Missing value for $1"; issue_state_type="$2"; shift 2 ;;
          -h|--help)
            cmd_autonomy_help
            return 0
            ;;
          *) die "Unknown option: $1\nRun 'reproctl autonomy --help' for usage." ;;
        esac
      done
      if [[ "$all" == true ]]; then
        if [[ -n "$issue_state_name" && -n "$issue_state_type" ]]; then
          _autonomy_py reconcile --all --issue-state-name "$issue_state_name" --issue-state-type "$issue_state_type"
        elif [[ -n "$issue_state_name" ]]; then
          _autonomy_py reconcile --all --issue-state-name "$issue_state_name"
        elif [[ -n "$issue_state_type" ]]; then
          _autonomy_py reconcile --all --issue-state-type "$issue_state_type"
        else
          _autonomy_py reconcile --all
        fi
      elif [[ -n "$issue_identifier" ]]; then
        if [[ -n "$issue_state_name" && -n "$issue_state_type" ]]; then
          _autonomy_py reconcile "$issue_identifier" --issue-state-name "$issue_state_name" --issue-state-type "$issue_state_type"
        elif [[ -n "$issue_state_name" ]]; then
          _autonomy_py reconcile "$issue_identifier" --issue-state-name "$issue_state_name"
        elif [[ -n "$issue_state_type" ]]; then
          _autonomy_py reconcile "$issue_identifier" --issue-state-type "$issue_state_type"
        else
          _autonomy_py reconcile "$issue_identifier"
        fi
      else
        _autonomy_py reconcile
      fi
      ;;

    discover)
      local limit=10 profile="" prompt_file="$SCRIPTS_DIR/lib/prompts/autonomy-sequence.md" output_dir="$REPO_ROOT/tmp/autonomy/discoveries" claimed_by="" json_output=false
      local project_scope=()
      if [[ "${REPROCTL_JSON:-false}" == true ]]; then
        json_output=true
      fi
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --json) json_output=true; shift ;;
          --limit) [[ -n "${2:-}" ]] || die "Missing value for $1"; limit="$2"; shift 2 ;;
          --profile) [[ -n "${2:-}" ]] || die "Missing value for $1"; profile="$2"; shift 2 ;;
          --prompt-file) [[ -n "${2:-}" ]] || die "Missing value for $1"; prompt_file="$2"; shift 2 ;;
          --output-dir) [[ -n "${2:-}" ]] || die "Missing value for $1"; output_dir="$2"; shift 2 ;;
          --claimed-by) [[ -n "${2:-}" ]] || die "Missing value for $1"; claimed_by="$2"; shift 2 ;;
          --project) [[ -n "${2:-}" ]] || die "Missing value for $1"; project_scope+=("$2"); shift 2 ;;
          -h|--help)
            cmd_autonomy_help
            return 0
            ;;
          *) die "Unknown option: $1\nRun 'reproctl autonomy --help' for usage." ;;
        esac
      done

      local payload evaluation_json prompt_text raw_response canonical_json canonical_path
      payload="$(_autonomy_monitor_payload)" || return 1
      local monitor_args=(--json)
      local project_value
      if ((${#project_scope[@]} > 0)); then
        for project_value in "${project_scope[@]}"; do
          [[ -n "$project_value" ]] || continue
          monitor_args+=(--project "$project_value")
        done
      fi
      if [[ -n "$claimed_by" ]]; then
        monitor_args+=(--claimed-by "$claimed_by")
      else
        :
      fi
      evaluation_json="$(printf '%s' "$payload" | python3 "$SCRIPTS_DIR/lib/py/autonomy_monitor.py" "${monitor_args[@]}")" || return 1

      prompt_text="$(_autonomy_sequence_render_prompt "$prompt_file" "$evaluation_json" "$limit")" || return 1

      if [[ -n "$profile" ]]; then
        raw_response="$(cmd_opencode --profile "$profile" --agent sequencer run "$prompt_text")" || return 1
      else
        raw_response="$(cmd_opencode --agent sequencer run "$prompt_text")" || return 1
      fi

      canonical_json="$(_autonomy_sequence_finalize "$prompt_file" "$evaluation_json" "$raw_response" "$output_dir" "$limit")" || return 1

      if [[ "$json_output" == true ]]; then
        printf '%s\n' "$canonical_json"
      else
        canonical_path="$(printf '%s' "$canonical_json" | python3 -c 'import json, sys; print(json.load(sys.stdin)["artifacts"]["canonical_path"])')"
        printf 'Discovery artifacts written to %s\n' "$canonical_path"
      fi
      ;;

    run)
      local run_cmd="${1:-}"
      shift || true
      case "$run_cmd" in
        start)
          local issue_identifier="${1:-}"
          shift || true
          local phase="" workspace=""
          while [[ $# -gt 0 ]]; do
            case "$1" in
              --json) shift ;;
              --phase) [[ -n "${2:-}" ]] || die "Missing value for $1"; phase="$2"; shift 2 ;;
              --workspace) [[ -n "${2:-}" ]] || die "Missing value for $1"; workspace="$2"; shift 2 ;;
              -h|--help)
                cmd_autonomy_help
                return 0
                ;;
              *) die "Unknown option: $1\nRun 'reproctl autonomy --help' for usage." ;;
            esac
          done
          [[ -n "$issue_identifier" ]] || die "Missing issue identifier"
          [[ -n "$phase" ]] || die "Missing --phase"
          [[ -n "$workspace" ]] || die "Missing --workspace"
          _autonomy_py run start "$issue_identifier" --phase "$phase" --workspace "$workspace"
          ;;
        finish)
          local issue_identifier="${1:-}"
          shift || true
          local attempt="" state="" error=""
          while [[ $# -gt 0 ]]; do
            case "$1" in
              --json) shift ;;
              --attempt) [[ -n "${2:-}" ]] || die "Missing value for $1"; attempt="$2"; shift 2 ;;
              --state) [[ -n "${2:-}" ]] || die "Missing value for $1"; state="$2"; shift 2 ;;
              --error) [[ -n "${2:-}" ]] || die "Missing value for $1"; error="$2"; shift 2 ;;
              -h|--help)
                cmd_autonomy_help
                return 0
                ;;
              *) die "Unknown option: $1\nRun 'reproctl autonomy --help' for usage." ;;
            esac
          done
          [[ -n "$issue_identifier" ]] || die "Missing issue identifier"
          [[ -n "$attempt" ]] || die "Missing --attempt"
          [[ -n "$state" ]] || die "Missing --state"
          if [[ -n "$error" ]]; then
            _autonomy_py run finish "$issue_identifier" --attempt "$attempt" --state "$state" --error "$error"
          else
            _autonomy_py run finish "$issue_identifier" --attempt "$attempt" --state "$state"
          fi
          ;;
        -h|--help|help|"")
          cmd_autonomy_help
          return 0
          ;;
        *) die "Unknown run subcommand: $run_cmd\nRun 'reproctl autonomy --help' for usage." ;;
      esac
      ;;

    -h|--help|help)
      cmd_autonomy_help
      return 0
      ;;

    *)
      die "Unknown subcommand: $subcmd\nRun 'reproctl autonomy --help' for usage."
      ;;
  esac
}
