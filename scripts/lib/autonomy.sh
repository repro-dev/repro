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

  local issue_json issue_id
  issue_json="$(linear issue show "$issue_identifier" --json)" || die "Failed to resolve Linear issue: $issue_identifier"
  issue_id="$(python3 -c 'import json, sys; item = json.loads(sys.argv[1]).get("item", {}); issue_id = item.get("id") or item.get("identifier") or item.get("issue_identifier") or ""; assert issue_id; print(issue_id)' "$issue_json")" || die "Failed to resolve Linear issue UUID for $issue_identifier"

  printf '%s\n' "$issue_id"
}

_autonomy_active_claim() {
  local issue_identifier="$1"

  local status_json
  status_json="$(REPROCTL_JSON=true _autonomy_py status)"

  python3 - "$issue_identifier" "$status_json" <<'PY'
import json
import sys

target = sys.argv[1]
active_states = {"claimed", "running", "reconciling"}
data = json.loads(sys.argv[2])

for item in data.get("items", []):
    if item.get("issue_identifier") == target and item.get("claim_state") in active_states:
        print(json.dumps(item))
        raise SystemExit(0)

raise SystemExit(1)
PY
}

_autonomy_monitor_candidate_ids() {
  local backlog_json="$1" todo_json="$2"

  python3 - "$backlog_json" "$todo_json" <<'PY'
import json
import sys


def extract_items(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        items = payload.get("items")
        if isinstance(items, list):
            return items
        data = payload.get("data")
        if isinstance(data, dict):
            issues = data.get("issues")
            if isinstance(issues, dict):
                nodes = issues.get("nodes")
                if isinstance(nodes, list):
                    return nodes
    return []


seen = set()
for raw in sys.argv[1:3]:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        continue
    for issue in extract_items(payload):
        if not isinstance(issue, dict):
            continue
        identifier = str(issue.get("identifier") or issue.get("issue_identifier") or "")
        if identifier and identifier not in seen:
            seen.add(identifier)
            print(identifier)
PY
}

_autonomy_monitor_payload() {
  local backlog_json todo_json claims_json issue_ids
  backlog_json="$(linear issue list --status backlog --json identifier,priority,project,status,relations)" || die "Failed to list backlog issues"
  todo_json="$(linear issue list --status todo --json identifier,priority,project,status,relations)" || die "Failed to list todo issues"
  issue_ids="$(_autonomy_monitor_candidate_ids "$backlog_json" "$todo_json")" || die "Failed to derive monitor candidates"
  claims_json="$(REPROCTL_JSON=true _autonomy_py status --all)" || die "Failed to load autonomy claims"

  local monitor_tmpdir monitor_payload_file
  monitor_tmpdir="$(mktemp -d "$TMP_DIR/autonomy-monitor.XXXXXX")" || die "Failed to create monitor temp dir"
  monitor_payload_file="$monitor_tmpdir/issues.jsonl"
  : > "$monitor_payload_file"

  python3 - "$backlog_json" "$todo_json" "$issue_ids" <<'PY' > "$monitor_payload_file"
import json
import sys


def extract_items(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        items = payload.get("items")
        if isinstance(items, list):
            return items
        data = payload.get("data")
        if isinstance(data, dict):
            issues = data.get("issues")
            if isinstance(issues, dict):
                nodes = issues.get("nodes")
                if isinstance(nodes, list):
                    return nodes
    return []


selected = {issue_identifier.strip() for issue_identifier in sys.argv[3].splitlines() if issue_identifier.strip()}

for raw in sys.argv[1:3]:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        continue
    for issue in extract_items(payload):
        if not isinstance(issue, dict):
            continue
        identifier = str(issue.get("identifier") or issue.get("issue_identifier") or "")
        if identifier and identifier in selected:
            print(json.dumps(issue))
PY

  evaluation_json="$(python3 - "$claims_json" "$monitor_payload_file" <<'PY'
import json
import sys

claims_payload = json.loads(sys.argv[1])
claims = claims_payload.get("items", []) if isinstance(claims_payload, dict) else []
if not isinstance(claims, list):
    claims = []

issues = []
with open(sys.argv[2], encoding="utf-8") as fh:
    for raw in fh:
        if not raw.strip():
            continue
        payload = json.loads(raw)
        if isinstance(payload, dict):
            item = payload.get("item")
            if isinstance(item, dict):
                issues.append(item)
                continue
            items = payload.get("items")
            if isinstance(items, list):
                for entry in items:
                    if isinstance(entry, dict):
                        issues.append(entry)
                continue
            if payload.get("identifier") or payload.get("issue_identifier"):
                issues.append(payload)
                continue
            issues.append(payload)

print(json.dumps({"issues": issues, "claims": claims}))
PY
  )" || { rm -rf "$monitor_tmpdir"; die "Failed to enrich monitor issues"; }

  printf '%s\n' "$evaluation_json"
  rm -rf "$monitor_tmpdir"
}

_autonomy_monitor_issue_ids() {
  local evaluation_json="$1"

  python3 - "$evaluation_json" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
for item in payload.get("items", []):
    if isinstance(item, dict) and item.get("eligible"):
        print(item.get("issue_identifier", ""))
PY
}

_autonomy_monitor_render() {
  local evaluation_json="$1"

  python3 - "$evaluation_json" <<'PY'
import json
import sys

payload = json.loads(sys.argv[1])
items = payload.get("items", []) if isinstance(payload, dict) else []
print("MONITOR")
if not items:
    print("  (none)")
    raise SystemExit(0)

for item in items:
    if not isinstance(item, dict):
        continue
    parts = ["eligible" if item.get("eligible") else "blocked"]
    parts.append(f"action={item.get('action', '')}")
    if item.get("reasons"):
        parts.append(f"reasons={','.join(item['reasons'])}")
    if item.get("notes"):
        parts.append(f"notes={','.join(item['notes'])}")
    print(f"  {item.get('issue_identifier', '')}  priority={item.get('priority', '')}  " + "  ".join(parts))
PY
}

_autonomy_monitor_tick() {
  local once="$1" prepare="$2" json_output="$3" limit="$4" interval="$5" claimed_by="$6"
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

cmd_autonomy_help() {
  cat <<'EOF'
Usage: reproctl autonomy <subcommand>

Durable local state for autonomous orchestration.

Subcommands:
  status [--all]                 Show current claims and run attempts
  claim <issue> --workspace <path> --phase <phase> --issue-state <name> [--issue-state-type <type>] [--claimed-by <user>]
  prepare <issue> [--phase observe] [--claimed-by <name>]
  release <issue> [--reason <text>]
  reconcile [<issue> | --all]
  monitor [--once] [--prepare] [--interval <seconds>] [--limit <count>] [--claimed-by <name>] [--json]
  run start <issue> --phase <phase> --workspace <path>
  run finish <issue> --attempt <n> --state <state> [--error <text>]

Examples:
  reproctl autonomy status --json
  reproctl autonomy claim REP-1094 --workspace /path/to/repro-wt-rep-1094 --phase observe --issue-state In-Progress
  reproctl autonomy prepare REP-1095 --phase observe --claimed-by autopilot
  reproctl autonomy monitor --once --json
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
          python3 - "$active_claim" <<'PY'
import json
import sys

print(json.dumps({"error": "existing claim", "claim": json.loads(sys.argv[1])}))
PY
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

      if [[ "${REPROCTL_JSON:-false}" == true ]]; then
        python3 - "$claim_json" "$phase" "$claimed_by" "$WT_ISSUE_UUID" "$WT_ISSUE_IDENTIFIER" "$WT_ISSUE_WORKTREE_PATH" "$WT_ISSUE_WORKTREE_BRANCH" "$WT_ISSUE_WORKTREE_SLUG" "$WT_ISSUE_STATE_NAME" "$WT_ISSUE_STATE_TYPE" <<'PY'
import json
import sys

claim = json.loads(sys.argv[1])["claim"]
print(json.dumps({
    "prepare": {
        "issue_id": sys.argv[4],
        "issue_identifier": sys.argv[5],
        "workspace_path": sys.argv[6],
        "branch": sys.argv[7],
        "slug": sys.argv[8],
        "phase": sys.argv[2],
        "claimed_by": sys.argv[3] or None,
        "issue_state_name": sys.argv[9],
        "issue_state_type": sys.argv[10],
        "claim": claim,
    }
}))
PY
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
      if [[ -n "$reason" ]]; then
        _autonomy_py release "$issue_identifier" --reason "$reason"
      else
        _autonomy_py release "$issue_identifier"
      fi
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

    monitor)
      local once=false prepare=false json_output=false limit=10 interval=60 claimed_by=""
      if [[ "${REPROCTL_JSON:-false}" == true ]]; then
        json_output=true
      fi
      while [[ $# -gt 0 ]]; do
        case "$1" in
          --json) json_output=true; shift ;;
          --once) once=true; shift ;;
          --prepare) prepare=true; shift ;;
          --limit) [[ -n "${2:-}" ]] || die "Missing value for $1"; limit="$2"; shift 2 ;;
          --interval) [[ -n "${2:-}" ]] || die "Missing value for $1"; interval="$2"; shift 2 ;;
          --claimed-by) [[ -n "${2:-}" ]] || die "Missing value for $1"; claimed_by="$2"; shift 2 ;;
          -h|--help)
            cmd_autonomy_help
            return 0
            ;;
          *) die "Unknown option: $1\nRun 'reproctl autonomy --help' for usage." ;;
        esac
      done

      _autonomy_monitor_tick "$once" "$prepare" "$json_output" "$limit" "$interval" "$claimed_by"
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
