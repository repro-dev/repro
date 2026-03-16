#!/bin/bash

cmd_up() {
  local wait_flag=false
  local services=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --wait) wait_flag=true; shift ;;
      -h|--help)
        cat <<'USAGE'
Usage: reproctl [--json] up [service...] [--wait]

Bring the development environment online. Ensures the cluster is running,
then starts the requested services via Tilt.

If no services are specified, all services defined in services.json are started.

Options:
  --wait    Block until all started services are healthy

Examples:
  reproctl up                     # start all services
  reproctl up api-server          # start only api-server
  reproctl up workspace --wait    # start workspace and wait for healthy
USAGE
        return 0
        ;;
      -*)
        die "Unknown option: $1\nRun 'reproctl up --help' for usage."
        ;;
      *)
        services+=("$1")
        shift
        ;;
    esac
  done

  if [ "${#services[@]}" -eq 0 ]; then
    while IFS= read -r _line; do
      services+=("$_line")
    done < <(_list_service_names)

    if [ "${#services[@]}" -eq 0 ]; then
      die "No services found in services.json."
    fi
  fi

  local total=2
  if [ "$wait_flag" = true ]; then
    total=3
  fi

  _step 1 "$total" "Ensuring cluster is running..."

  if ! cluster_preflight; then
    cmd_cluster_up
  else
    _ok "Cluster is running"
  fi

  _step 2 "$total" "Starting services..."
  cmd_start "${services[@]}"

  if [ "$wait_flag" = true ]; then
    _step 3 "$total" "Waiting for services to become healthy..."
    _wait_for_healthy "${services[@]}"
  fi

  if [ "${REPROCTL_JSON:-false}" = true ]; then
    _up_json "${services[@]}"
  fi
}

_wait_for_healthy() {
  local timeout=300
  local interval=5
  local elapsed=0

  while [ "$elapsed" -lt "$timeout" ]; do
    local all_ready=true

    for svc in "$@"; do
      local resource
      resource="$(resolve_worktree_resource_name "$svc")"
      local status
      status="$(tilt get uiresource "$resource" -o json --port "$TILT_PORT" 2>/dev/null \
        | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status',{}).get('runtimeStatus',''))" 2>/dev/null)" || true
      if [ "$status" != "ok" ]; then
        all_ready=false
        break
      fi
    done

    if [ "$all_ready" = true ]; then
      _ok "All services are healthy"
      return 0
    fi

    sleep "$interval"
    elapsed=$((elapsed + interval))
  done

  _warn "Timed out waiting for services to become healthy after ${timeout}s"
  return 1
}

_up_json() {
  local svc_array=""
  local first=true
  for svc in "$@"; do
    if [ "$first" = true ]; then
      first=false
    else
      svc_array="$svc_array,"
    fi
    svc_array="$svc_array\"$svc\""
  done
  printf '{"command":"up","services":[%s]}\n' "$svc_array"
}

cmd_down() {
  local cluster_flag=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --cluster) cluster_flag=true; shift ;;
      -h|--help)
        cat <<'USAGE'
Usage: reproctl [--json] down [--cluster]

Stop all running services and optionally tear down the cluster.

Without --cluster, the kind cluster is left running for faster restart.

Options:
  --cluster    Also tear down the kind cluster and registry

Examples:
  reproctl down              # stop services, keep cluster
  reproctl down --cluster    # stop services and tear down cluster
USAGE
        return 0
        ;;
      -*)
        die "Unknown option: $1\nRun 'reproctl down --help' for usage."
        ;;
      *)
        die "Unexpected argument: $1\nRun 'reproctl down --help' for usage."
        ;;
    esac
  done

  local total=1
  if [ "$cluster_flag" = true ]; then
    total=2
  fi

  _step 1 "$total" "Stopping all services..."
  stop_tilt_daemon

  if [ "$cluster_flag" = true ]; then
    _step 2 "$total" "Tearing down cluster..."
    cmd_cluster_down --force
  fi

  if [ "${REPROCTL_JSON:-false}" = true ]; then
    _down_json "$cluster_flag"
  fi
}

_down_json() {
  local cluster_torn_down="$1"
  printf '{"command":"down","cluster_removed":%s}\n' "$cluster_torn_down"
}
