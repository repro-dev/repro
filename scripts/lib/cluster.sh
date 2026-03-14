#!/bin/bash
#
# scripts/lib/cluster.sh — local Kubernetes cluster lifecycle
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh to be loaded
# first (provides INFRA_DIR, CONFIG_FILE, die, etc.)

CLUSTER_YAML="$INFRA_DIR/cluster.yaml"
CLUSTER_NAME="repro-cluster"
REGISTRY_NAME="ctlptl-registry"

# ── Helpers ─────────────────────────────────────────────────────────

cluster_exists() {
  kind get clusters 2>/dev/null | grep -qx "$CLUSTER_NAME"
}

registry_exists() {
  docker inspect "$REGISTRY_NAME" > /dev/null 2>&1
}

require_docker() {
  if ! command -v docker > /dev/null 2>&1; then
    die "docker is not installed.\nRun 'reproctl setup' or install Docker Desktop: https://www.docker.com/products/docker-desktop"
  fi
  if ! docker info > /dev/null 2>&1; then
    die "Docker daemon is not running or is not accessible.\nStart Docker Desktop and try again, or run 'reproctl setup'."
  fi
}

require_ctlptl() {
  if ! command -v ctlptl > /dev/null 2>&1; then
    die "ctlptl is not installed. Run 'reproctl setup' to install all required tools."
  fi
}

require_kind() {
  if ! command -v kind > /dev/null 2>&1; then
    die "kind is not installed. Run 'reproctl setup' to install all required tools."
  fi
}

# ── Subcommands ─────────────────────────────────────────────────────

cmd_cluster_up() {
  require_docker
  require_ctlptl
  require_kind

  if cluster_exists && registry_exists; then
    _ok "Cluster '$CLUSTER_NAME' and registry '$REGISTRY_NAME' are already running"
    return 0
  fi

  _step 1 1 "Creating cluster and registry..."
  ctlptl apply -f "$CLUSTER_YAML"
  _ok "Cluster '$CLUSTER_NAME' is ready"
}

cmd_cluster_down() {
  require_docker
  require_ctlptl
  require_kind

  local force=false
  for arg in "$@"; do
    if [ "$arg" = "--force" ]; then
      force=true
      break
    fi
  done

  if [ -f "$CONFIG_FILE" ]; then
    local count
    count="$(service_count "$(cat "$CONFIG_FILE")")"
    if [ "$count" != "0" ]; then
      if [ "$force" = true ]; then
        echo "$count service(s) still configured — forcing teardown" >&2
        stop_tilt_daemon
      else
        _warn "$count service(s) are still configured."
        echo "Run 'reproctl stop --all' first, or pass --force to proceed." >&2
        return 1
      fi
    fi
  fi

  _step 1 1 "Tearing down cluster and registry..."
  ctlptl delete -f "$CLUSTER_YAML" 2>/dev/null || true
  _ok "Cluster '$CLUSTER_NAME' has been removed"
}

cmd_cluster_status() {
  require_docker
  require_kind

  if [ "${REPROCTL_JSON:-false}" = true ]; then
    _cluster_status_json
    return
  fi

  local w
  w="$(_label_width "Status:" "Context:" "Port:")"

  echo "${CLR_BOLD}Cluster:${CLR_RESET} $CLUSTER_NAME"
  if cluster_exists; then
    _kv "$w" "Status:" "running" "  "
    _kv "$w" "Context:" "kind-$CLUSTER_NAME" "  "
  else
    _kv "$w" "Status:" "not running" "  "
  fi

  echo ""
  echo "${CLR_BOLD}Registry:${CLR_RESET} $REGISTRY_NAME"
  if registry_exists; then
    local port
    port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5000/tcp") 0).HostPort}}' "$REGISTRY_NAME" 2>/dev/null || echo "5000")"
    _kv "$w" "Status:" "running" "  "
    _kv "$w" "Port:" "$port" "  "
  else
    _kv "$w" "Status:" "not running" "  "
  fi
}

_cluster_status_json() {
  local cluster_running=false
  local context=""
  if cluster_exists; then
    cluster_running=true
    context="kind-$CLUSTER_NAME"
  fi

  local reg_running=false
  local reg_port=""
  if registry_exists; then
    reg_running=true
    reg_port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5000/tcp") 0).HostPort}}' "$REGISTRY_NAME" 2>/dev/null || echo "5000")"
  fi

  python3 -c '
import json, sys
obj = {"cluster": sys.argv[1], "running": sys.argv[2] == "true"}
if sys.argv[3]:
    obj["context"] = sys.argv[3]
reg = {"running": sys.argv[4] == "true"}
if sys.argv[5]:
    reg["port"] = int(sys.argv[5])
obj["registry"] = reg
print(json.dumps(obj))
' "$CLUSTER_NAME" "$cluster_running" "$context" "$reg_running" "$reg_port"
}

cmd_cluster_reset() {
  cmd_cluster_down "$@"
  cmd_cluster_up
}

# ── Pre-flight check ───────────────────────────────────────────────

cluster_preflight() {
  cluster_exists
}

# ── Router ──────────────────────────────────────────────────────────

cmd_cluster() {
  local usage="Usage: reproctl cluster <up|down|status|reset>"

  if [ $# -eq 0 ]; then
    echo "$usage" >&2
    exit 1
  fi

  local subcmd="$1"
  shift

  case "$subcmd" in
    up)     cmd_cluster_up "$@" ;;
    down)   cmd_cluster_down "$@" ;;
    status) cmd_cluster_status "$@" ;;
    reset)  cmd_cluster_reset "$@" ;;
    -h|--help)
      cat <<'EOF'
Usage: reproctl cluster <subcommand>

Subcommands:
  up       Create the local registry and kind cluster (idempotent)
  down     Tear down the cluster and registry
  status   Show cluster and registry state
  reset    Destroy and recreate the cluster (clean slate)

Options (down):
  --force  Tear down even if services are still running
EOF
      ;;
    *)
      die "Unknown cluster subcommand: $subcmd\n$usage"
      ;;
  esac
}
