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
      echo "Tilt is running (pid $pid)."
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
  echo "Done."
}

# ── Service commands ────────────────────────────────────────────────

cmd_start() {
  if [ $# -eq 0 ]; then
    die "At least one service is required.\nUsage: reproctl start <service> [<service>...]"
  fi

  mkdir -p "$TMP_DIR"

  if ! cluster_preflight; then
    die "Cannot start services without a running cluster.\nRun 'reproctl cluster up' first."
  fi

  echo "Validating services.json..."
  if ! python3 "$SCRIPTS_DIR/validate-services.py" "$SERVICES_JSON" "$INFRA_DIR" "$@"; then
    die "services.json validation failed. Fix the errors above before starting."
  fi

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

  echo "Services:"
  print_services "$new_config"

  if tilt_is_running; then
    echo ""
    echo "Tilt is running. Config updated — Tilt will reload automatically."
    touch "$CONFIG_FILE"
  else
    echo ""
    start_tilt_daemon
  fi
}

cmd_stop() {
  local stop_all=false
  local targets=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --all)
        stop_all=true
        shift
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

  if [ "${#targets[@]}" -eq 0 ]; then
    die "Specify services to stop, or use --all.\nUsage: reproctl stop [<service>...] | --all"
  fi

  local entries=()
  for target in "${targets[@]}"; do
    if [[ "$target" == *:* ]]; then
      entries+=("$target")
    else
      if is_worktree "$REPO_ROOT"; then
        local wt_slug
        wt_slug="$(detect_worktree_slug)"
        entries+=("$wt_slug:$target")
      else
        entries+=(":$target")
      fi
    fi
  done

  local current_config new_config
  current_config="$(read_config)"
  new_config="$(remove_services "$current_config" "${entries[@]}")"
  write_config "$new_config"

  echo "Remaining services:"
  print_services "$new_config"

  local remaining
  remaining="$(service_count "$new_config")"

  if [ "$remaining" = "0" ]; then
    echo ""
    echo "No services remaining."
    stop_tilt_daemon
  elif tilt_is_running; then
    echo ""
    echo "Tilt will reload with updated config."
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
  if [ $# -eq 0 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    cat <<'USAGE'
Usage: reproctl restart <service> [<service>...]

Rebuild and redeploy running services via tilt trigger.
If a service has migrations, the migration job is triggered first.
USAGE
    if [ $# -eq 0 ]; then
      exit 1
    fi
    return 0
  fi

  if ! tilt_is_running; then
    die "Tilt is not running. Start services first with 'reproctl start <service>'."
  fi

  for svc in "$@"; do
    local resource
    resource="$(resolve_worktree_resource_name "$svc")"

    if ! tilt get uiresource "$resource" --port "$TILT_PORT" > /dev/null 2>&1; then
      die "Service '$svc' (resource '$resource') is not running in Tilt.\nStart it first with 'reproctl start $svc'."
    fi

    local has_migrations
    has_migrations=$(SERVICES_JSON="$SERVICES_JSON" SVC_NAME="$svc" \
      python3 "$SCRIPTS_DIR/lib/py/check_migrations.py")

    if [ "$has_migrations" = "yes" ]; then
      echo "Triggering migrations for $svc..."
      tilt trigger "${resource}-migrations" --port "$TILT_PORT"
    fi

    echo "Triggering restart for $svc..."
    tilt trigger "$resource" --port "$TILT_PORT"
  done

  echo "Done."
}

cmd_ui() {
  if ! tilt_is_running; then
    die "Tilt is not running. Start services first with 'reproctl start <service>'."
  fi

  local url="http://localhost:$TILT_PORT"
  echo "Opening $url"
  open "$url"
}
