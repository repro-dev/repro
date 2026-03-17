#!/bin/bash
#
# scripts/lib/services.sh — service config management and Tilt lifecycle
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh to be loaded
# first (provides MAIN_CHECKOUT, TMP_DIR, CONFIG_FILE, TILT_PORT, etc.)

# ── Tilt ────────────────────────────────────────────────────────────

tilt_is_running() {
  tilt get session --port "$TILT_PORT" > /dev/null 2>&1
}

# ── Config management ───────────────────────────────────────────────

read_config() {
  if [ -f "$CONFIG_FILE" ]; then
    cat "$CONFIG_FILE"
  else
    echo '{"services":[]}'
  fi
}

write_config() {
  local tmpfile
  tmpfile="$(mktemp "$TMP_DIR/reproctl_services.XXXXXX")"
  echo "$1" > "$tmpfile"
  mv -f "$tmpfile" "$CONFIG_FILE"
}

merge_services() {
  local current_json="$1"
  shift

  local result="$current_json"

  for entry in "$@"; do
    local slug source svc_name
    IFS=':' read -r slug source svc_name <<< "$entry"

    result=$(SVC_NAME="$svc_name" SVC_SOURCE="$source" SVC_SLUG="$slug" \
      python3 "$SCRIPTS_DIR/lib/py/config_upsert.py" <<< "$result")
  done

  echo "$result"
}

remove_services() {
  local current_json="$1"
  shift

  local result="$current_json"

  for entry in "$@"; do
    local slug svc_name
    IFS=':' read -r slug svc_name <<< "$entry"

    result=$(SVC_NAME="$svc_name" SVC_SLUG="$slug" \
      python3 "$SCRIPTS_DIR/lib/py/config_remove.py" <<< "$result")
  done

  echo "$result"
}

print_services() {
  echo "$1" | python3 "$SCRIPTS_DIR/lib/py/config_print.py"
}

service_count() {
  echo "$1" | python3 "$SCRIPTS_DIR/lib/py/config_count.py"
}

# ── Tilt lifecycle ──────────────────────────────────────────────────

start_tilt_daemon() {
  echo "Starting Tilt (dashboard: http://localhost:$TILT_PORT)..."

  nohup tilt up \
    --port "$TILT_PORT" \
    --file "$INFRA_DIR/Tiltfile" \
    > "$TILT_LOG_FILE" 2>&1 &

  local pid=$!
  echo "$pid" > "$TILT_PID_FILE"

  local retries=0
  while [ "$retries" -lt 15 ]; do
    if tilt_is_running; then
      _ok "Tilt is running (pid $pid)"
      return 0
    fi
    sleep 1
    retries=$((retries + 1))
  done

  _warn "Tilt may still be starting. Check logs: $TILT_LOG_FILE"
} >&2

stop_tilt_daemon() {
  if tilt_is_running; then
    echo "Stopping Tilt..."
    TILT_PORT="$TILT_PORT" tilt down --file "$INFRA_DIR/Tiltfile" 2>/dev/null || true
  fi

  if [ -f "$TILT_PID_FILE" ]; then
    local pid
    pid="$(cat "$TILT_PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      local i=0
      while [ "$i" -lt 5 ] && kill -0 "$pid" 2>/dev/null; do
        sleep 1
        i=$((i + 1))
      done
      if kill -0 "$pid" 2>/dev/null; then
        kill -9 "$pid" 2>/dev/null || true
      fi
    fi
    rm -f "$TILT_PID_FILE"
  fi

  rm -f "$CONFIG_FILE"
  _ok "Tilt stopped"
}

# ── Service commands ────────────────────────────────────────────────

_resolve_worktree_flag() {
  local input="$1"
  local wt_path
  wt_path="$(resolve_worktree "$input")" || \
    die "No worktree found for '$input'.\nRun 'reproctl worktree list' to see available worktrees."
  if ! is_worktree "$wt_path"; then
    die "--worktree targets worktree checkouts only.\n'$input' resolved to the main checkout. Omit --worktree to target main services."
  fi
  local basename
  basename="$(basename "$wt_path")"
  echo "${basename#repro-wt-}"
}

_parse_timeout() {
  local input="$1"
  local num="${input%s}"
  if [[ "$num" =~ ^[0-9]+$ ]]; then
    echo "$num"
  else
    return 1
  fi
}

_wait_for_healthy() {
  local timeout="$1"
  shift
  local services=("$@")

  local target_names=()
  for svc in "${services[@]}"; do
    target_names+=("$(resolve_worktree_resource_name "$svc")")
  done

  local dep_tree
  dep_tree="$(python3 "$SCRIPTS_DIR/lib/py/resolve_deps.py" "$SERVICES_JSON" "${services[@]}" 2>/dev/null)" || dep_tree='{"targets":[],"deps":[]}'

  local dep_resource_names=()
  while IFS= read -r _line; do
    [ -z "$_line" ] && continue
    dep_resource_names+=("$_line")
  done < <(printf '%s' "$dep_tree" | python3 -c '
import json, sys
data = json.load(sys.stdin)
for d in data.get("deps", []):
    print(d)
' 2>/dev/null)

  local dep_args=()
  if [ ${#dep_resource_names[@]} -gt 0 ]; then
    dep_args+=("--deps")
    dep_args+=("${dep_resource_names[@]}")
    dep_args+=("--")
  fi

  local start_time
  start_time=$(date +%s)
  local poll_interval=3
  local log_interval=10
  local last_log=0
  local is_tty=false
  local tty_lines=0
  local spin_frame=0
  local spin_set
  spin_set=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
  if [ -t 2 ]; then
    is_tty=true
  fi

  while true; do
    local now
    now=$(date +%s)

    if [ "$timeout" -gt 0 ] && [ "$now" -ge "$((start_time + timeout))" ]; then
      local result
      result="$(python3 "$SCRIPTS_DIR/lib/py/wait_healthy.py" \
        "$TILT_PORT" "${dep_args[@]}" "${target_names[@]}" 2>/dev/null)" || true

      if [ "$is_tty" = true ] && [ "$tty_lines" -gt 0 ]; then
        local i
        for ((i = 0; i < tty_lines; i++)); do
          printf '\033[A\033[K' >&2
        done
        tty_lines=0
      fi

      if [ "${REPROCTL_JSON:-false}" = true ]; then
        local status_json
        status_json="$(tilt get uiresources -o json --port "$TILT_PORT" 2>/dev/null | \
          SERVICES_JSON="$SERVICES_JSON" CONFIG_FILE="$CONFIG_FILE" \
          REPROCTL_JSON=true \
          python3 "$SCRIPTS_DIR/lib/py/format_status.py")"
        printf '{"error":"timeout","message":"Timed out after %ds waiting for services","items":%s}\n' \
          "$timeout" "$status_json"
      fi

      local unhealthy_line
      while IFS= read -r unhealthy_line; do
        [ -z "$unhealthy_line" ] && continue
        _err "$unhealthy_line"
      done <<< "$(printf '%s' "${result:-}" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    for r in data.get("resources", []):
        if r.get("status") != "ok":
            label = r["name"]
            if not r.get("target", False):
                label = label + " (dependency)"
            print(label + ": " + r.get("status", "unknown") + " (" + r.get("detail", "") + ")")
except:
    pass
' 2>/dev/null)"

      _err "Timed out after ${timeout}s waiting for services to become healthy"
      return 1
    fi

    local result
    result="$(python3 "$SCRIPTS_DIR/lib/py/wait_healthy.py" \
      "$TILT_PORT" "${dep_args[@]}" "${target_names[@]}" 2>/dev/null)" || true

    local all_healthy
    all_healthy="$(printf '%s' "$result" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    print("true" if data.get("healthy") else "false")
except:
    print("false")
' 2>/dev/null)" || all_healthy="false"

    if [ "$all_healthy" = "true" ]; then
      if [ "$is_tty" = true ] && [ "$tty_lines" -gt 0 ]; then
        local i
        for ((i = 0; i < tty_lines; i++)); do
          printf '\033[A\033[K' >&2
        done
      fi

      if [ "$is_tty" = true ]; then
        while IFS= read -r _line; do
          [ -z "$_line" ] && continue
          printf '     %s\n' "$_line" >&2
        done <<< "$(printf '%s' "${result:-}" | CLR_GREEN="$CLR_GREEN" CLR_RESET="$CLR_RESET" python3 -c '
import json, sys, os
clr_green = os.environ.get("CLR_GREEN", "")
clr_reset = os.environ.get("CLR_RESET", "")
try:
    data = json.load(sys.stdin)
    for r in data.get("resources", []):
        label = r["name"]
        if r.get("target", False):
            label = label + " (target)"
        print(clr_green + "\u2714 " + label.ljust(30) + " ok" + clr_reset)
except:
    pass
' 2>/dev/null)"
      fi
      _ok "All services are healthy"

      if [ "${REPROCTL_JSON:-false}" = true ]; then
        local status_json
        status_json="$(tilt get uiresources -o json --port "$TILT_PORT" 2>/dev/null | \
          SERVICES_JSON="$SERVICES_JSON" CONFIG_FILE="$CONFIG_FILE" \
          REPROCTL_JSON=true \
          python3 "$SCRIPTS_DIR/lib/py/format_status.py")"
        printf '{"items":%s}\n' "$status_json"
      fi

      return 0
    fi

    local elapsed=$((now - start_time))

    if [ "$is_tty" = true ]; then
      if [ "$tty_lines" -gt 0 ]; then
        local i
        for ((i = 0; i < tty_lines; i++)); do
          printf '\033[A\033[K' >&2
        done
      fi

      local time_display
      if [ "$timeout" -gt 0 ]; then
        time_display="${elapsed}s/${timeout}s"
      else
        time_display="${elapsed}s"
      fi

      local spinner_char
      local frame_idx=$((spin_frame % 10))
      spinner_char="${spin_set[$frame_idx]}"
      spin_frame=$((spin_frame + 1))

      local new_lines=0
      printf '  %s%s%s Waiting for services [%s]\n' "$CLR_YELLOW" "$spinner_char" "$CLR_RESET" "$time_display" >&2
      new_lines=$((new_lines + 1))

      while IFS= read -r _line; do
        [ -z "$_line" ] && continue
        printf '     %s\n' "$_line" >&2
        new_lines=$((new_lines + 1))
      done <<< "$(printf '%s' "${result:-}" | \
        SPIN="$spinner_char" \
        CLR_GREEN="$CLR_GREEN" CLR_YELLOW="$CLR_YELLOW" CLR_RED="$CLR_RED" CLR_RESET="$CLR_RESET" \
        python3 -c '
import json, sys, os
spin = os.environ.get("SPIN", "~")
clr_green = os.environ.get("CLR_GREEN", "")
clr_yellow = os.environ.get("CLR_YELLOW", "")
clr_red = os.environ.get("CLR_RED", "")
clr_reset = os.environ.get("CLR_RESET", "")
try:
    data = json.load(sys.stdin)
    for r in data.get("resources", []):
        s = r.get("status", "unknown")
        if s == "ok":
            icon = clr_green + "\u2714" + clr_reset
            st = clr_green + s + clr_reset
        elif s == "error":
            icon = clr_red + "\u2718" + clr_reset
            st = clr_red + s + clr_reset
        elif s == "building":
            icon = clr_yellow + spin + clr_reset
            st = clr_yellow + s + clr_reset
        else:
            icon = clr_yellow + spin + clr_reset
            st = clr_yellow + s + clr_reset
        label = r["name"]
        if r.get("target", False):
            label = label + " (target)"
        detail = r.get("detail", "")
        line = icon + " " + label.ljust(30) + " " + st
        if detail and s != "ok":
            line += " (" + detail + ")"
        print(line)
except:
    print(spin + " waiting...")
' 2>/dev/null)"
      tty_lines=$new_lines
    else
      local since_log=$((now - last_log))
      if [ "$last_log" -eq 0 ] || [ "$since_log" -ge "$log_interval" ]; then
        local summary
        summary="$(printf '%s' "${result:-}" | python3 -c '
import json, sys
try:
    data = json.load(sys.stdin)
    parts = []
    for r in data.get("resources", []):
        parts.append(r["name"] + "=" + r.get("status", "unknown"))
    print(" ".join(parts) if parts else "waiting...")
except:
    print("waiting...")
' 2>/dev/null)" || summary="waiting..."

        local time_display
        if [ "$timeout" -gt 0 ]; then
          time_display="${elapsed}s/${timeout}s"
        else
          time_display="${elapsed}s"
        fi
        printf 'Waiting: %s [%s]\n' "$summary" "$time_display" >&2
        last_log=$now
      fi
    fi

    sleep "$poll_interval"
  done
}

cmd_start() {
  local pick=false
  local wait=false
  local timeout_secs=0
  local args=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pick|-p) pick=true; shift ;;
      --wait|-w) wait=true; shift ;;
      --timeout|-t)
        [[ -n "${2:-}" ]] || die "Missing value for $1"
        timeout_secs="$(_parse_timeout "$2")" || die "Invalid timeout: $2\nExpected a duration like '120s' or '120'."
        shift 2
        ;;
      -h|--help)
        cat <<'USAGE'
Usage: reproctl start [options] <service> [<service>...]

Start one or more services from the current context.

Options:
  --pick, -p               Interactively select services
  --wait, -w               Block until all services are healthy
  --timeout, -t <duration> How long to wait before giving up (no default;
                            waits indefinitely unless set)
                            Only meaningful with --wait

Exit codes:
  0   Services started (and healthy, if --wait)
  1   Error or timeout
USAGE
        return 0
        ;;
      *) args+=("$1"); shift ;;
    esac
  done
  set -- ${args[@]+"${args[@]}"}

  if [ "$pick" = true ] || { [ $# -eq 0 ] && [ -t 0 ]; }; then
    local candidates=()
    while IFS= read -r _line; do candidates+=("$_line"); done < <(_list_service_names)
    local _pick_out _pick_rc=0
    _pick_out="$(_pick_multi "Select services to start" "${candidates[@]}")" || _pick_rc=$?
    if [[ $_pick_rc -ne 0 ]]; then exit "$_pick_rc"; fi
    local selected=()
    while IFS= read -r _line; do selected+=("$_line"); done <<< "$_pick_out"
    [[ ${#selected[@]} -gt 0 ]] || exit 2
    set -- "${selected[@]}"
  fi

  if [ $# -eq 0 ]; then
    die "At least one service is required.\nUsage: reproctl start <service> [<service>...]"
  fi

  local started_services=("$@")

  mkdir -p "$TMP_DIR"

  if ! cluster_preflight; then
    die "Cannot start services without a running cluster.\nRun 'reproctl cluster up' first."
  fi

  local total_steps=3
  if [ "$wait" = true ]; then
    total_steps=4
  fi

  _step 1 "$total_steps" "Validating services.json..."
  if ! python3 "$SCRIPTS_DIR/validate-services.py" "$SERVICES_JSON" "$REPO_ROOT/infra" "$@"; then
    die "services.json validation failed. Fix the errors above before starting."
  fi

  _step 2 "$total_steps" "Updating configuration..."

  local entries=()

  if is_worktree "$REPO_ROOT"; then
    local wt_slug
    wt_slug="$(detect_worktree_slug)"
    for svc in "$@"; do
      entries+=("$wt_slug:$REPO_ROOT:$svc")
    done
  else
    for svc in "$@"; do
      entries+=(":.:$svc")
    done
  fi

  local current_config new_config
  current_config="$(read_config)"
  new_config="$(merge_services "$current_config" "${entries[@]}")"
  write_config "$new_config"

  echo "Services:" >&2
  print_services "$new_config"

  if tilt_is_running; then
    echo "" >&2
    _ok "Config updated — Tilt will reload automatically"
    touch "$CONFIG_FILE"
  else
    _step 3 "$total_steps" "Starting Tilt..."
    start_tilt_daemon
  fi

  if [ "$wait" = true ]; then
    local wait_msg="Waiting for services to become healthy"
    if [ "$timeout_secs" -gt 0 ]; then
      wait_msg="$wait_msg (timeout: ${timeout_secs}s)"
    fi
    _step "$total_steps" "$total_steps" "$wait_msg..."
    _wait_for_healthy "$timeout_secs" "${started_services[@]}"
  fi
}

cmd_stop() {
  local stop_all=false
  local pick=false
  local targets=()
  local worktree_flag=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --all)
        stop_all=true
        shift
        ;;
      --pick|-p)
        pick=true
        shift
        ;;
      --worktree|-w)
        [[ -n "${2:-}" ]] || die "Missing value for $1"
        worktree_flag="$2"
        shift 2
        ;;
      -*)
        die "Unknown option: $1"
        ;;
      *)
        targets+=("$1")
        shift
        ;;
    esac
  done

  if [ "$stop_all" = true ]; then
    stop_tilt_daemon
    return 0
  fi

  if [ "$pick" = true ] || { [ "${#targets[@]}" -eq 0 ] && [ -t 0 ]; }; then
    local candidates=()
    while IFS= read -r _line; do candidates+=("$_line"); done < <(_list_service_names)
    local _pick_out _pick_rc=0
    _pick_out="$(_pick_multi "Select services to stop" "${candidates[@]}")" || _pick_rc=$?
    if [[ $_pick_rc -ne 0 ]]; then exit "$_pick_rc"; fi
    local selected=()
    while IFS= read -r _line; do selected+=("$_line"); done <<< "$_pick_out"
    [[ ${#selected[@]} -gt 0 ]] || exit 2
    targets=("${selected[@]}")
  fi

  if [ "${#targets[@]}" -eq 0 ]; then
    die "Specify services to stop, or use --all.\nUsage: reproctl stop [<service>...] [--worktree <worktree>] | --all"
  fi

  local wt_slug=""
  if [[ -n "$worktree_flag" ]]; then
    wt_slug="$(_resolve_worktree_flag "$worktree_flag")"
  elif is_worktree "$REPO_ROOT"; then
    wt_slug="$(detect_worktree_slug)"
  fi

  local entries=()
  for target in "${targets[@]}"; do
    if [[ "$target" == *:* ]]; then
      entries+=("$target")
    elif [[ -n "$wt_slug" ]]; then
      entries+=("$wt_slug:$target")
    else
      entries+=(":$target")
    fi
  done

  local current_config new_config
  current_config="$(read_config)"
  new_config="$(remove_services "$current_config" "${entries[@]}")"
  write_config "$new_config"

  echo "Remaining services:" >&2
  print_services "$new_config"

  local remaining
  remaining="$(service_count "$new_config")"

  if [ "$remaining" = "0" ]; then
    echo "" >&2
    echo "No services remaining." >&2
    stop_tilt_daemon
  elif tilt_is_running; then
    echo "" >&2
    _ok "Config updated — Tilt will reload automatically"
  fi
}

cmd_status() {
  if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
    cat <<'USAGE'
Usage: reproctl [--json] status

Show the current state of Tilt and all running resources.
When Tilt is running, queries live resource status.
When Tilt is not running, shows configured services only.

The --json global flag outputs machine-readable JSON instead of human text.
USAGE
    return 0
  fi

  if [ "${REPROCTL_JSON:-false}" = true ]; then
    _status_json
    return
  fi

  if tilt_is_running; then
    echo "Tilt: running (http://localhost:$TILT_PORT)"
  else
    echo "Tilt: not running"
  fi

  echo ""

  if ! tilt_is_running; then
    if [ -f "$CONFIG_FILE" ]; then
      echo "Services:"
      print_services "$(cat "$CONFIG_FILE")"
    else
      echo "No services configured. Run 'reproctl start <service>' to begin."
    fi
    return 0
  fi

  echo "Resources:"

  tilt get uiresources -o json --port "$TILT_PORT" 2>/dev/null | \
    SERVICES_JSON="$SERVICES_JSON" CONFIG_FILE="$CONFIG_FILE" \
    python3 "$SCRIPTS_DIR/lib/py/format_status.py"
}

_status_json() {
  local tilt_running=false
  local tilt_url="http://localhost:$TILT_PORT"
  local tilt_pid=""
  local items_json="[]"

  if tilt_is_running; then
    tilt_running=true
    if [ -f "$TILT_PID_FILE" ]; then
      tilt_pid="$(tr -d '[:space:]' < "$TILT_PID_FILE")"
    fi

    items_json="$(tilt get uiresources -o json --port "$TILT_PORT" 2>/dev/null | \
      SERVICES_JSON="$SERVICES_JSON" CONFIG_FILE="$CONFIG_FILE" \
      REPROCTL_JSON=true \
      python3 "$SCRIPTS_DIR/lib/py/format_status.py")"
  else
    if [ -f "$CONFIG_FILE" ]; then
      items_json="$(SERVICES_JSON="$SERVICES_JSON" CONFIG_FILE="$CONFIG_FILE" \
        REPROCTL_JSON=true TILT_RUNNING=false \
        python3 "$SCRIPTS_DIR/lib/py/format_status.py" <<< '{"items":[]}')"
    fi
  fi

  local pid_json="null"
  if [[ "$tilt_pid" =~ ^[0-9]+$ ]]; then
    pid_json="$tilt_pid"
  fi

  printf '{"tilt":{"running":%s,"url":"%s","pid":%s},"items":%s}\n' \
    "$tilt_running" "$tilt_url" "$pid_json" "$items_json"
}

cmd_restart() {
  local pick=false
  local positional=()
  local do_all=false
  local worktree_flag=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --all) do_all=true; shift ;;
      --pick|-p) pick=true; shift ;;
      --worktree|-w)
        [[ -n "${2:-}" ]] || die "Missing value for $1"
        worktree_flag="$2"
        shift 2
        ;;
      -h|--help)
        cat <<'USAGE'
Usage: reproctl restart <service> [<service>...] [--worktree <worktree>] | --all

Rebuild and redeploy running services via tilt trigger.
If a service has migrations, the migration job is triggered first.

  --all   Stop the Tilt daemon and restart it with the same service
          configuration. Useful when Tiltfile changes need to be
          picked up or when Tilt gets into a bad state.

  --worktree, -w <worktree>  Target services in a specific worktree instead
                          of the current working directory context.
                          Accepts a branch name, slug, or prefix.

  --pick, -p  Interactively choose services.
USAGE
        return 0
        ;;
      *) positional+=("$1"); shift ;;
    esac
  done

  if [ "$do_all" = true ]; then
    if ! tilt_is_running; then
      die "Tilt is not running. Start services first with 'reproctl start <service>'."
    fi

    local saved_config
    saved_config="$(read_config)"

    echo "Restarting Tilt daemon..."
    stop_tilt_daemon

    write_config "$saved_config"
    start_tilt_daemon
    return 0
  fi

  if ! tilt_is_running; then
    die "Tilt is not running. Start services first with 'reproctl start <service>'."
  fi

  if [ "$pick" = true ] || { [ "${#positional[@]}" -eq 0 ] && [ -t 0 ]; }; then
    local candidates=()
    while IFS= read -r _line; do candidates+=("$_line"); done < <(_list_service_names)
    local _pick_out _pick_rc=0
    _pick_out="$(_pick_multi "Select services to restart" "${candidates[@]}")" || _pick_rc=$?
    if [[ $_pick_rc -ne 0 ]]; then exit "$_pick_rc"; fi
    local selected=()
    while IFS= read -r _line; do selected+=("$_line"); done <<< "$_pick_out"
    [[ ${#selected[@]} -gt 0 ]] || exit 2
    positional=("${selected[@]}")
  fi

  if [ "${#positional[@]}" -eq 0 ]; then
    die "At least one service is required.\nUsage: reproctl restart <service> [<service>...] | --all"
  fi

  local wt_slug=""
  if [[ -n "$worktree_flag" ]]; then
    wt_slug="$(_resolve_worktree_flag "$worktree_flag")"
  fi

  local step=0
  local total="${#positional[@]}"

  for svc in "${positional[@]}"; do
    step=$((step + 1))
    local resource
    if [[ -n "$wt_slug" ]]; then
      resource="$(_wt_name "$svc" "$wt_slug")"
    else
      resource="$(resolve_worktree_resource_name "$svc")"
    fi

    if ! tilt get uiresource "$resource" --port "$TILT_PORT" > /dev/null 2>&1; then
      die "Service '$svc' (resource '$resource') is not running in Tilt.\nStart it first with 'reproctl start $svc'."
    fi

    local has_migrations
    has_migrations=$(SERVICES_JSON="$SERVICES_JSON" SVC_NAME="$svc" \
      python3 "$SCRIPTS_DIR/lib/py/check_migrations.py")

    if [ "$has_migrations" = "yes" ]; then
      echo "  Triggering migrations for $svc..." >&2
      tilt trigger "${resource}-migrations" --port "$TILT_PORT"
    fi

    _step "$step" "$total" "Restarting $svc..."
    tilt trigger "$resource" --port "$TILT_PORT"
  done

  _ok "Restart complete"
}

cmd_ui() {
  if ! tilt_is_running; then
    die "Tilt is not running. Start services first with 'reproctl start <service>'."
  fi

  local url="http://localhost:$TILT_PORT"
  echo "Opening $url"
  open "$url"
} >&2
