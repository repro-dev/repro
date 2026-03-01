#!/bin/bash
#
# reproctl — Unified Tilt orchestrator CLI
#
# Detects the current directory context (main checkout vs worktree),
# resolves which services to run and from which source trees, writes
# reproctl_services.json, and manages the Tilt process lifecycle.
#
# Tilt runs daemonised. Use `reproctl stop` to tear it down.
#
# Usage:
#   reproctl start <service> [<service>...]   Start services from current context
#   reproctl stop [<service>...]              Remove services (or stop Tilt if none remain)
#   reproctl stop --all                       Tear down Tilt entirely
#   reproctl status                           Show running services and Tilt dashboard URL
#
# Examples:
#   # From main checkout — start workspace normally
#   reproctl start workspace
#
#   # From a worktree — isolated api-server from this branch
#   reproctl start api-server
#
#   # Remove a worktree's services (run from the worktree)
#   reproctl stop api-server
#
#   # Tear down everything (from any checkout)
#   reproctl stop --all

set -euo pipefail

# ── Context detection ───────────────────────────────────────────────
#
# REPO_ROOT is the git toplevel of the current working directory —
# either the main checkout or a worktree. MAIN_CHECKOUT is always the
# main checkout (first entry from `git worktree list`). We derive all
# paths from these two values so the script works identically
# regardless of which checkout invokes it.

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Error: not inside a git repository." >&2
  exit 1
}

is_worktree() {
  [ -f "$1/.git" ]
}

if is_worktree "$REPO_ROOT"; then
  MAIN_CHECKOUT="$(git -C "$REPO_ROOT" worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}')"
else
  MAIN_CHECKOUT="$REPO_ROOT"
fi

INFRA_DIR="$MAIN_CHECKOUT/infra"
TMP_DIR="$MAIN_CHECKOUT/tmp"
CONFIG_FILE="$TMP_DIR/reproctl_services.json"
TILT_PID_FILE="$TMP_DIR/tilt.pid"
TILT_LOG_FILE="$TMP_DIR/tilt.log"
TILT_PORT="${TILT_PORT:-10350}"

# ── Helpers ─────────────────────────────────────────────────────────

die() {
  printf 'Error: %b\n' "$*" >&2
  exit 1
}

detect_worktree_slug() {
  local basename
  basename="$(basename "$REPO_ROOT")"
  if [[ "$basename" == repro-wt-* ]]; then
    echo "${basename#repro-wt-}"
  else
    echo "$basename"
  fi
}

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
      python3 -c "
import json, os, sys
data = json.load(sys.stdin)
svc_name = os.environ['SVC_NAME']
source = os.environ['SVC_SOURCE']
slug = os.environ['SVC_SLUG']
services = data.get('services', [])
services = [s for s in services if not (s['name'] == svc_name and s.get('slug', '') == slug)]
services.append({'name': svc_name, 'source': source, 'slug': slug})
data['services'] = services
json.dump(data, sys.stdout, indent=2)
" <<< "$result")
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
      python3 -c "
import json, os, sys
data = json.load(sys.stdin)
svc_name = os.environ['SVC_NAME']
slug = os.environ['SVC_SLUG']
services = data.get('services', [])
services = [s for s in services if not (s['name'] == svc_name and s.get('slug', '') == slug)]
data['services'] = services
json.dump(data, sys.stdout, indent=2)
" <<< "$result")
  done

  echo "$result"
}

print_services() {
  echo "$1" | python3 -c "
import json, sys
data = json.load(sys.stdin)
services = data.get('services', [])
if not services:
    print('  (none)')
else:
    for s in services:
        slug = s.get('slug', '')
        if slug:
            print('  %s (wt: %s)' % (s['name'], slug))
        else:
            print('  %s (main)' % s['name'])
"
}

service_count() {
  echo "$1" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data.get('services', [])))
"
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

  # Wait briefly for Tilt to bind the port
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

  # Clean up the backgrounded process
  if [ -f "$TILT_PID_FILE" ]; then
    local pid
    pid="$(cat "$TILT_PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      # Give it a moment, then force if needed
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

# ── Commands ────────────────────────────────────────────────────────

cmd_start() {
  if [ $# -eq 0 ]; then
    die "At least one service is required.\nUsage: reproctl start <service> [<service>...]"
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
  if tilt_is_running; then
    echo "Tilt: running (http://localhost:$TILT_PORT)"
  else
    echo "Tilt: not running"
  fi

  echo ""

  if [ -f "$CONFIG_FILE" ]; then
    echo "Services:"
    print_services "$(cat "$CONFIG_FILE")"
  else
    echo "No services configured. Run 'reproctl start <service>' to begin."
  fi
}

cmd_ui() {
  if ! tilt_is_running; then
    die "Tilt is not running. Start services first with 'reproctl start <service>'."
  fi

  local url="http://localhost:$TILT_PORT"
  echo "Opening $url"
  open "$url"
}

# ── Main ────────────────────────────────────────────────────────────

usage() {
  cat <<'EOF'
Usage: reproctl <command> [args]

Commands:
  start <service> [...]           Start services from the current context
  stop [<service>...] | --all     Remove services or tear down Tilt
  status                          Show running services and dashboard URL
  ui                              Open the Tilt dashboard in a browser

Context is detected automatically:
  - From the main checkout, services run as main.
  - From a worktree, services are isolated to that branch.

To run services from multiple contexts, invoke reproctl from each
checkout in separate terminals. The shared config and single Tilt
process handle coordination.

Examples:
  reproctl start workspace          # main checkout services
  reproctl start api-server         # from worktree: isolated api-server
  reproctl stop api-server           # remove from current context
  reproctl stop --all                # tear down everything
  reproctl status                    # show what's running
  reproctl ui                        # open Tilt dashboard
EOF
}

if [ $# -lt 1 ]; then
  usage >&2
  exit 1
fi

COMMAND="$1"
shift

case "$COMMAND" in
  start)  cmd_start "$@" ;;
  stop)   cmd_stop "$@" ;;
  status) cmd_status "$@" ;;
  ui)     cmd_ui "$@" ;;
  -h|--help) usage ;;
  *)
    die "Unknown command: $COMMAND"
    ;;
esac
