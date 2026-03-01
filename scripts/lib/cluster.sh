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

require_ctlptl() {
  if ! command -v ctlptl > /dev/null 2>&1; then
    die "ctlptl is not installed. Run 'proto use' to install managed tools."
  fi
}

require_kind() {
  if ! command -v kind > /dev/null 2>&1; then
    die "kind is not installed. Run 'proto use' to install managed tools."
  fi
}

# ── Subcommands ─────────────────────────────────────────────────────

cmd_cluster_up() {
  require_ctlptl
  require_kind

  if cluster_exists && registry_exists; then
    echo "Cluster '$CLUSTER_NAME' and registry '$REGISTRY_NAME' are already running."
    return 0
  fi

  echo "Creating cluster and registry..."
  ctlptl apply -f "$CLUSTER_YAML"
  echo "Cluster '$CLUSTER_NAME' is ready."
}

cmd_cluster_down() {
  require_ctlptl

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
        echo "Forcing cluster teardown — stopping $count service(s)..."
        stop_tilt_daemon
      else
        echo "Warning: $count service(s) are still configured."
        echo "Run 'reproctl stop --all' first, or pass --force to proceed."
        return 1
      fi
    fi
  fi

  echo "Tearing down cluster and registry..."
  ctlptl delete -f "$CLUSTER_YAML" 2>/dev/null || true
  echo "Cluster '$CLUSTER_NAME' has been removed."
}

cmd_cluster_status() {
  require_kind

  echo "Cluster: $CLUSTER_NAME"
  if cluster_exists; then
    echo "  Status: running"
    echo "  Context: kind-$CLUSTER_NAME"
  else
    echo "  Status: not running"
  fi

  echo ""
  echo "Registry: $REGISTRY_NAME"
  if registry_exists; then
    local port
    port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5000/tcp") 0).HostPort}}' "$REGISTRY_NAME" 2>/dev/null || echo "5000")"
    echo "  Status: running (port $port)"
  else
    echo "  Status: not running"
  fi
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
