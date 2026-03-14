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

  echo "Warning: Tilt may still be starting. Check logs: $TILT_LOG_FILE"
}

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

cmd_start() {
  local pick=false
  local args=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pick|-p) pick=true; shift ;;
      *) args+=("$1"); shift ;;
    esac
  done
  set -- ${args[@]+"${args[@]}"}

  if [ "$pick" = true ] || { [ $# -eq 0 ] && [ -t 0 ]; }; then
    local candidates=()
    while IFS= read -r _line; do candidates+=("$_line"); done < <(_list_service_names)
    local selected=()
    while IFS= read -r _line; do selected+=("$_line"); done < <(_pick_multi "Select services to start" "${candidates[@]}")
    [[ ${#selected[@]} -gt 0 ]] || exit 1
    set -- "${selected[@]}"
  fi

  if [ $# -eq 0 ]; then
    die "At least one service is required.\nUsage: reproctl start <service> [<service>...]"
  fi

  mkdir -p "$TMP_DIR"

  if ! cluster_preflight; then
    die "Cannot start services without a running cluster.\nRun 'reproctl cluster up' first."
  fi

  _step 1 3 "Validating services.json..."
  if ! python3 "$SCRIPTS_DIR/validate-services.py" "$SERVICES_JSON" "$REPO_ROOT/infra" "$@"; then
    die "services.json validation failed. Fix the errors above before starting."
  fi

  _step 2 3 "Updating configuration..."

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
    _step 3 3 "Starting Tilt..."
    start_tilt_daemon
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
    local selected=()
    while IFS= read -r _line; do selected+=("$_line"); done < <(_pick_multi "Select services to stop" "${candidates[@]}")
    [[ ${#selected[@]} -gt 0 ]] || exit 1
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
Usage: reproctl status

Show the current state of Tilt and all running resources.
When Tilt is running, queries live resource status.
When Tilt is not running, shows configured services only.
USAGE
    return 0
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
    local selected=()
    while IFS= read -r _line; do selected+=("$_line"); done < <(_pick_multi "Select services to restart" "${candidates[@]}")
    [[ ${#selected[@]} -gt 0 ]] || exit 1
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
      _step "$step" "$total" "Triggering migrations for $svc..."
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
}
