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

_autonomy_py() {
  local db_path main_checkout
  db_path="$(_autonomy_db_path)"
  main_checkout="$(_autonomy_main_checkout)"

  if [[ "${REPROCTL_JSON:-false}" == true ]]; then
    python3 "$SCRIPTS_DIR/lib/py/autonomy_state.py" --db "$db_path" --main-checkout "$main_checkout" --json "$@"
  else
    python3 "$SCRIPTS_DIR/lib/py/autonomy_state.py" --db "$db_path" --main-checkout "$main_checkout" "$@"
  fi
}

_autonomy_issue_id() {
  local issue_identifier="${1:-}"
  [[ -n "$issue_identifier" ]] || die "Missing issue identifier"

  local issue_json issue_id
  issue_json="$(linear issue show "$issue_identifier" --json)" || die "Failed to resolve Linear issue: $issue_identifier"
  issue_id="$(python3 -c 'import json, sys; item = json.loads(sys.argv[1]).get("item", {}); issue_id = item.get("id", "") if isinstance(item, dict) else ""; assert issue_id; print(issue_id)' "$issue_json")" || die "Failed to resolve Linear issue UUID for $issue_identifier"

  printf '%s\n' "$issue_id"
}

cmd_autonomy_help() {
  cat <<'EOF'
Usage: reproctl autonomy <subcommand>

Durable local state for autonomous orchestration.

Subcommands:
  status [--all]                 Show current claims and run attempts
  claim <issue> --workspace <path> --phase <phase> --issue-state <name> [--issue-state-type <type>] [--claimed-by <user>]
  release <issue> [--reason <text>]
  reconcile [<issue> | --all]
  run start <issue> --phase <phase> --workspace <path>
  run finish <issue> --attempt <n> --state <state> [--error <text>]

Examples:
  reproctl autonomy status --json
  reproctl autonomy claim REP-1094 --workspace /path/to/repro-wt-rep-1094 --phase observe --issue-state In-Progress
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
