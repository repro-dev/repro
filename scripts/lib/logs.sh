#!/bin/bash
#
# scripts/lib/logs.sh — service log access and streaming
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh and
# scripts/lib/services.sh to be loaded first (provides TILT_PORT,
# tilt_is_running, die, detect_worktree_slug, is_worktree, etc.)

# ── Helpers ─────────────────────────────────────────────────────────

list_tilt_resources() {
  tilt get uiresources --port "$TILT_PORT" -o name 2>/dev/null \
    | sed 's|^uiresource\.tilt\.dev/||'
}

validate_resources() {
  local available
  available="$(list_tilt_resources)"

  if [ -z "$available" ]; then
    echo "No resources found in Tilt." >&2
    return 1
  fi

  for res in "$@"; do
    if ! echo "$available" | grep -qx "$res"; then
      echo "Unknown resource: $res" >&2
      echo "" >&2
      echo "Available resources:" >&2
      echo "$available" | sed 's/^/  /' >&2
      return 1
    fi
  done
}

# ── Logstore processing ────────────────────────────────────────────

dump_logstore_filtered() {
  local resources_json="$1"
  local source_filter="$2"
  local level_filter="$3"
  local since_filter="$4"
  local grep_pattern="$5"
  local context_before="$6"
  local context_after="$7"
  local json_output="$8"
  local no_prefix="$9"
  local tail_lines="${10}"

  tilt dump logstore --port "$TILT_PORT" 2>/dev/null | \
    RESOURCES="$resources_json" \
    SOURCE_FILTER="$source_filter" \
    LEVEL_FILTER="$level_filter" \
    SINCE_FILTER="$since_filter" \
    GREP_PATTERN="$grep_pattern" \
    CONTEXT_BEFORE="$context_before" \
    CONTEXT_AFTER="$context_after" \
    JSON_OUTPUT="$json_output" \
    NO_PREFIX="$no_prefix" \
    TAIL_LINES="$tail_lines" \
    python3 "$SCRIPTS_DIR/lib/py/format_logs.py"
}

# ── Main command ────────────────────────────────────────────────────

cmd_logs() {
  local follow=false
  local level=""
  local source_filter="all"
  local grep_pattern=""
  local context_before=""
  local context_after=""
  local since=""
  local json_output=false
  local no_prefix=false
  local tail_lines=""
  local pick=false
  local services=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -f|--follow)
        follow=true
        shift
        ;;
      --pick|-p)
        pick=true
        shift
        ;;
      --level)
        [ $# -ge 2 ] || die "--level requires a value (warn|error)"
        level="$2"
        shift 2
        ;;
      --source)
        [ $# -ge 2 ] || die "--source requires a value (all|build|runtime)"
        source_filter="$2"
        shift 2
        ;;
      --grep)
        [ $# -ge 2 ] || die "--grep requires a pattern"
        grep_pattern="$2"
        shift 2
        ;;
      -C|--context)
        [ $# -ge 2 ] || die "-C/--context requires a duration (e.g. 10s)"
        context_before="$2"
        context_after="$2"
        shift 2
        ;;
      -B)
        [ $# -ge 2 ] || die "-B requires a duration (e.g. 30s)"
        context_before="$2"
        shift 2
        ;;
      -A)
        [ $# -ge 2 ] || die "-A requires a duration (e.g. 5s)"
        context_after="$2"
        shift 2
        ;;
      --since)
        [ $# -ge 2 ] || die "--since requires a duration or timestamp"
        since="$2"
        shift 2
        ;;
      --json)
        json_output=true
        shift
        ;;
      --no-prefix)
        no_prefix=true
        shift
        ;;
      -n|--tail)
        [ $# -ge 2 ] || die "-n/--tail requires a number"
        tail_lines="$2"
        shift 2
        ;;
      -h|--help)
        logs_usage
        return 0
        ;;
      -*)
        die "Unknown option: $1\nRun 'reproctl logs --help' for usage."
        ;;
      *)
        services+=("$1")
        shift
        ;;
    esac
  done

  if ! tilt_is_running; then
    die "Tilt is not running. Start services first with 'reproctl start <service>'."
  fi

  if [ "$pick" = true ] && [ "${#services[@]}" -eq 0 ]; then
    local candidates=()
    while IFS= read -r _line; do candidates+=("$_line"); done < <(_list_service_names)
    local selected
    selected="$(_pick "Select service for logs" "${candidates[@]}")" || exit 1
    services=("$selected")
  fi

  if [ -n "$context_before" ] || [ -n "$context_after" ]; then
    if [ -z "$grep_pattern" ]; then
      echo "Warning: -A/-B/-C ignored without --grep" >&2
      context_before=""
      context_after=""
    fi
  fi

  local resolved=()
  if [ "${#services[@]}" -gt 0 ]; then
    while IFS= read -r name; do
      resolved+=("$name")
    done < <(resolve_worktree_resource_names "${services[@]}")

    validate_resources "${resolved[@]}" || exit 1
  fi

  local needs_logstore=false
  if [ "$json_output" = true ] || [ -n "$tail_lines" ] || \
     [ -n "$context_before" ] || [ -n "$context_after" ]; then
    needs_logstore=true
  fi

  if [ "$follow" = false ] && [ -z "$since" ] && [ -z "$grep_pattern" ] && \
     [ "$needs_logstore" = false ]; then
    if [ "${#services[@]}" -eq 0 ]; then
      tail_lines="50"
      needs_logstore=true
    fi
  fi

  if [ "$needs_logstore" = true ] || { [ "$follow" = false ] && { [ -n "$since" ] || [ -n "$grep_pattern" ]; }; }; then
    local resources_json="[]"
    if [ "${#resolved[@]}" -gt 0 ]; then
      resources_json=$(printf '%s\n' "${resolved[@]}" | python3 "$SCRIPTS_DIR/lib/py/lines_to_json_array.py")
    fi

    dump_logstore_filtered \
      "$resources_json" \
      "$source_filter" \
      "$level" \
      "$since" \
      "$grep_pattern" \
      "$context_before" \
      "$context_after" \
      "$json_output" \
      "$no_prefix" \
      "$tail_lines"
    return
  fi

  local tilt_args=()

  if [ "$follow" = true ]; then
    tilt_args+=("-f")
  fi

  if [ -n "$level" ]; then
    tilt_args+=("--level" "$level")
  fi

  if [ "$source_filter" != "all" ]; then
    tilt_args+=("--source" "$source_filter")
  fi

  if [ "$no_prefix" = true ]; then
    tilt_args+=("--no-prefix")
  fi

  if [ "${#resolved[@]}" -gt 0 ]; then
    for res in "${resolved[@]}"; do
      tilt_args+=("$res")
    done
  fi

  tilt_args+=("--port" "$TILT_PORT")

  if [ -n "$since" ] && [ "$follow" = true ]; then
    local resources_json="[]"
    if [ "${#resolved[@]}" -gt 0 ]; then
      resources_json=$(printf '%s\n' "${resolved[@]}" | python3 "$SCRIPTS_DIR/lib/py/lines_to_json_array.py")
    fi

    dump_logstore_filtered \
      "$resources_json" \
      "$source_filter" \
      "$level" \
      "$since" \
      "$grep_pattern" \
      "" \
      "" \
      "false" \
      "$no_prefix" \
      ""

    tilt logs "${tilt_args[@]}"
    return
  fi

  if [ -n "$grep_pattern" ] && [ "$follow" = true ]; then
    tilt logs "${tilt_args[@]}" | grep --line-buffered -E "$grep_pattern"
  else
    tilt logs "${tilt_args[@]}"
  fi
}

logs_usage() {
  cat <<'EOF'
Usage: reproctl logs [options] [service...]

Show logs from Tilt-managed services.

Options:
  -f, --follow             Stream logs continuously (like tail -f)
  --level <warn|error>     Filter by log level
  --source <all|build|runtime>
                           Filter by log source (default: all)
  --grep <pattern>         Filter log lines matching a pattern
  -C, --context <duration> Time window around grep matches (e.g. 10s)
  -B <duration>            Time window before grep matches
  -A <duration>            Time window after grep matches
  --since <duration|timestamp>
                           Show logs newer than duration (e.g. 5m) or timestamp
  --json                   Output structured JSON (one object per line)
  --no-prefix              Omit resource name prefix
  -n, --tail <lines>       Show only last N lines (snapshot mode)
  --pick, -p               Interactively select a service (uses fzf if available)

Without -f or services, shows the last 50 lines across all resources.

Examples:
  reproctl logs -f                           Tail all logs
  reproctl logs -f api-server                Tail a specific service
  reproctl logs api-server                   Snapshot current logs
  reproctl logs --level error                Filter by level
  reproctl logs --json api-server            Structured JSON output
  reproctl logs --grep "FATAL" -C 10s api-server
                                             Time-context around matches
  reproctl logs --since 5m api-server        Logs from last 5 minutes
  reproctl logs -n 100 api-server            Last 100 lines
  reproctl logs --pick                       Pick a service interactively
EOF
}
