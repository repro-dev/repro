#!/bin/bash
#
# repro-start.sh — Unified Tilt orchestrator CLI
#
# Detects the current directory context (main checkout vs worktree),
# resolves which services to run and from which source trees, writes
# tilt_config.json, and manages the Tilt process lifecycle.
#
# Usage:
#   repro start <service> [<service>...]   Start services
#   repro start --wt <slug>:<svc>[,<svc>]  Start worktree services from main
#   repro stop [<slug>:]<service>           Remove services from running session
#   repro stop --all                        Tear down Tilt entirely
#   repro status                            Show running services
#
# Examples:
#   # From main checkout — start workspace normally
#   ./scripts/repro-start.sh start workspace
#
#   # From a worktree — isolated api-server from this branch
#   ./scripts/repro-start.sh start api-server
#
#   # From main — start main workspace + worktree api-server
#   ./scripts/repro-start.sh start workspace --wt feat-new-api:api-server
#
#   # Remove a worktree's services without stopping Tilt
#   ./scripts/repro-start.sh stop feat-new-api:api-server
#
#   # Tear down everything
#   ./scripts/repro-start.sh stop --all

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TILT_CONFIG="$REPO_ROOT/infra/tilt_config.json"
TILT_PORT="${TILT_PORT:-10350}"

# ── Helpers ─────────────────────────────────────────────────────────

die() {
  echo "Error: $*" >&2
  exit 1
}

slugify() {
  printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'
}

is_worktree() {
  local dir="$1"
  [ -f "$dir/.git" ]
}

detect_main_checkout() {
  git -C "$REPO_ROOT" worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}'
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

ensure_infra_dir() {
  local main_checkout="$1"
  echo "$main_checkout/infra"
}

# ── Config management ───────────────────────────────────────────────

read_config() {
  if [ -f "$TILT_CONFIG" ]; then
    cat "$TILT_CONFIG"
  else
    echo '{"services":[]}'
  fi
}

write_config() {
  local json="$1"
  echo "$json" > "$TILT_CONFIG"
}

# Add services to the config. Each entry is "slug:source:svc_name".
# For main checkout services, slug is empty and source is ".".
merge_services() {
  local current_json="$1"
  shift
  local entries=("$@")

  local result="$current_json"

  for entry in "${entries[@]}"; do
    local slug source svc_name
    IFS=':' read -r slug source svc_name <<< "$entry"

    # Remove any existing entry with the same name+slug combo
    result=$(echo "$result" | python3 -c "
import json, sys
data = json.load(sys.stdin)
services = data.get('services', [])
services = [s for s in services if not (s['name'] == '$svc_name' and s.get('slug', '') == '$slug')]
services.append({'name': '$svc_name', 'source': '$source', 'slug': '$slug'})
data['services'] = services
json.dump(data, sys.stdout, indent=2)
")
  done

  echo "$result"
}

# Remove services from the config. Each entry is "slug:svc_name".
remove_services() {
  local current_json="$1"
  shift
  local entries=("$@")

  local result="$current_json"

  for entry in "${entries[@]}"; do
    local slug svc_name
    IFS=':' read -r slug svc_name <<< "$entry"

    result=$(echo "$result" | python3 -c "
import json, sys
data = json.load(sys.stdin)
services = data.get('services', [])
services = [s for s in services if not (s['name'] == '$svc_name' and s.get('slug', '') == '$slug')]
data['services'] = services
json.dump(data, sys.stdout, indent=2)
")
  done

  echo "$result"
}

# ── Commands ────────────────────────────────────────────────────────

cmd_start() {
  local services=()
  local wt_specs=()
  local main_checkout

  # Resolve main checkout
  if is_worktree "$REPO_ROOT"; then
    main_checkout="$(detect_main_checkout)"
  else
    main_checkout="$REPO_ROOT"
  fi

  local infra_dir
  infra_dir="$(ensure_infra_dir "$main_checkout")"
  TILT_CONFIG="$infra_dir/tilt_config.json"

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --wt)
        shift
        [[ $# -gt 0 ]] || die "--wt requires an argument (slug:service[,service])"
        wt_specs+=("$1")
        shift
        ;;
      -*)
        die "Unknown option: $1"
        ;;
      *)
        services+=("$1")
        shift
        ;;
    esac
  done

  if [ ${#services[@]} -eq 0 ] && [ ${#wt_specs[@]} -eq 0 ]; then
    die "At least one service is required.\nUsage: repro-start.sh start <service> [--wt <slug>:<service>,...]"
  fi

  # Build the list of service entries to merge
  local entries=()

  # Services from the current context
  if is_worktree "$REPO_ROOT"; then
    local wt_slug
    wt_slug="$(detect_worktree_slug)"
    for svc in "${services[@]}"; do
      entries+=("$wt_slug:$REPO_ROOT:$svc")
    done
  else
    for svc in "${services[@]}"; do
      entries+=(":.:$svc")
    done
  fi

  # Explicit --wt specs (from main checkout targeting other worktrees)
  for spec in "${wt_specs[@]}"; do
    local wt_slug_spec wt_svcs_spec
    IFS=':' read -r wt_slug_spec wt_svcs_spec <<< "$spec"
    local wt_path
    wt_path="$(dirname "$main_checkout")/repro-wt-$wt_slug_spec"

    if [ ! -d "$wt_path" ]; then
      die "Worktree not found: $wt_path\nRun './scripts/worktree.sh list' to see active worktrees."
    fi

    IFS=',' read -ra svc_list <<< "$wt_svcs_spec"
    for svc in "${svc_list[@]}"; do
      entries+=("$wt_slug_spec:$wt_path:$svc")
    done
  done

  # Merge into config
  local current_config
  current_config="$(read_config)"
  local new_config
  new_config="$(merge_services "$current_config" "${entries[@]}")"
  write_config "$new_config"

  echo "Services configured:"
  echo "$new_config" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for s in data.get('services', []):
    slug = s.get('slug', '')
    label = s['name'] if not slug else s['name'] + ' (wt: ' + slug + ')'
    print('  ' + label)
"

  # Start or reload Tilt
  if tilt_is_running; then
    echo ""
    echo "Tilt is already running. Triggering reload via config file change..."
    # The config file write above is sufficient — Tilt watches it.
    # But we also touch it to ensure the mtime changes even if the
    # content is identical (e.g. re-running the same start command).
    touch "$TILT_CONFIG"
    echo "Done. Tilt will re-evaluate the Tiltfile with the updated config."
  else
    echo ""
    echo "Starting Tilt..."
    exec tilt up --port "$TILT_PORT" --file "$infra_dir/Tiltfile"
  fi
}

cmd_stop() {
  local stop_all=false
  local targets=()

  local main_checkout
  if is_worktree "$REPO_ROOT"; then
    main_checkout="$(detect_main_checkout)"
  else
    main_checkout="$REPO_ROOT"
  fi

  local infra_dir
  infra_dir="$(ensure_infra_dir "$main_checkout")"
  TILT_CONFIG="$infra_dir/tilt_config.json"

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
    echo "Stopping Tilt..."
    if tilt_is_running; then
      tilt down --port "$TILT_PORT"
    fi
    rm -f "$TILT_CONFIG"
    echo "Done."
    return 0
  fi

  if [ ${#targets[@]} -eq 0 ]; then
    die "Specify services to stop, or use --all.\nUsage: repro-start.sh stop [<slug>:]<service> | --all"
  fi

  # Build removal entries
  local entries=()
  for target in "${targets[@]}"; do
    if [[ "$target" == *:* ]]; then
      # Explicit slug:service
      entries+=("$target")
    else
      # Infer slug from current context
      if is_worktree "$REPO_ROOT"; then
        local wt_slug
        wt_slug="$(detect_worktree_slug)"
        entries+=("$wt_slug:$target")
      else
        entries+=(":$target")
      fi
    fi
  done

  local current_config
  current_config="$(read_config)"
  local new_config
  new_config="$(remove_services "$current_config" "${entries[@]}")"
  write_config "$new_config"

  echo "Removed services. Remaining:"
  echo "$new_config" | python3 -c "
import json, sys
data = json.load(sys.stdin)
services = data.get('services', [])
if not services:
    print('  (none)')
else:
    for s in services:
        slug = s.get('slug', '')
        label = s['name'] if not slug else s['name'] + ' (wt: ' + slug + ')'
        print('  ' + label)
"

  # If no services remain, offer to stop Tilt
  local remaining
  remaining=$(echo "$new_config" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(len(data.get('services', [])))
")

  if [ "$remaining" = "0" ] && tilt_is_running; then
    echo ""
    echo "No services remaining. Stopping Tilt..."
    tilt down --port "$TILT_PORT"
    rm -f "$TILT_CONFIG"
    echo "Done."
  elif tilt_is_running; then
    echo ""
    echo "Tilt will re-evaluate with updated config."
  fi
}

cmd_status() {
  local main_checkout
  if is_worktree "$REPO_ROOT"; then
    main_checkout="$(detect_main_checkout)"
  else
    main_checkout="$REPO_ROOT"
  fi

  local infra_dir
  infra_dir="$(ensure_infra_dir "$main_checkout")"
  TILT_CONFIG="$infra_dir/tilt_config.json"

  echo "Tilt process: $(tilt_is_running && echo 'running' || echo 'not running')"
  echo ""

  if [ -f "$TILT_CONFIG" ]; then
    echo "Configured services:"
    python3 -c "
import json
with open('$TILT_CONFIG') as f:
    data = json.load(f)
services = data.get('services', [])
if not services:
    print('  (none)')
else:
    for s in services:
        slug = s.get('slug', '')
        source = s.get('source', '.')
        if slug:
            print('  %s (wt: %s, source: %s)' % (s['name'], slug, source))
        else:
            print('  %s (main checkout)' % s['name'])
"
  else
    echo "No config file found. Run 'repro-start.sh start <service>' to begin."
  fi
}

# ── Main ────────────────────────────────────────────────────────────

usage() {
  cat <<'EOF'
Usage: repro-start.sh <command> [options] [args]

Commands:
  start <service> [...]         Start services in the current context
  start <svc> --wt <slug>:<svc> Start services from a specific worktree
  stop [<slug>:]<service> [...] Remove services from running Tilt session
  stop --all                    Tear down Tilt entirely
  status                        Show running services and config

Examples:
  # From main checkout
  repro-start.sh start workspace
  repro-start.sh start workspace --wt feat-new-api:api-server

  # From a worktree
  repro-start.sh start api-server

  # Remove worktree services
  repro-start.sh stop feat-new-api:api-server

  # Tear down
  repro-start.sh stop --all
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
  -h|--help) usage ;;
  *)
    die "Unknown command: $COMMAND"
    ;;
esac
