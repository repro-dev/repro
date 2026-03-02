#!/bin/bash
#
# reproctl — unified CLI for cluster management, worktree lifecycle,
#            and Tilt service orchestration
#
# Usage:
#   reproctl setup                            Bootstrap the development environment
#   reproctl doctor                           Diagnose the development environment
#   reproctl cluster up|down|status|reset     Manage the local k8s cluster
#   reproctl db reset|migrate|shell|status    Database operations
#   reproctl start <service> [...]            Start services from current context
#   reproctl stop [<service>...] | --all      Remove services or tear down Tilt
#   reproctl restart <service> [...] | --all  Rebuild services or restart Tilt
#   reproctl status                           Show running services and dashboard URL
#   reproctl logs [options] [service...]       Show or stream service logs
#   reproctl ui                               Open the Tilt dashboard in a browser
#   reproctl worktree attach <branch>          Attach to a worktree subshell
#   reproctl worktree create <branch>         Create a worktree
#   reproctl worktree remove <branch>         Remove a worktree
#   reproctl worktree list                    List active worktrees
#
# Context is detected automatically:
#   - From the main checkout, services run as main.
#   - From a worktree, services are isolated to that branch.
#
# Examples:
#   reproctl start workspace                # main checkout services
#   reproctl start api-server               # from worktree: isolated api-server
#   reproctl stop --all                     # tear down everything
#   reproctl restart api-server             # rebuild + redeploy a running service
#   reproctl worktree create feat/my-feat   # create worktree for existing branch
#   reproctl worktree list                  # list all worktrees

set -euo pipefail

# Resolve scripts/lib relative to this script's location, so it works
# regardless of the caller's cwd (e.g. from bin/reproctl wrapper or
# from a worktree's copy of the script).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=scripts/lib/common.sh
source "$SCRIPT_DIR/lib/common.sh"
# shellcheck source=scripts/lib/services.sh
source "$SCRIPT_DIR/lib/services.sh"
# shellcheck source=scripts/lib/cluster.sh
source "$SCRIPT_DIR/lib/cluster.sh"
# shellcheck source=scripts/lib/worktree.sh
source "$SCRIPT_DIR/lib/worktree.sh"
# shellcheck source=scripts/lib/setup.sh
source "$SCRIPT_DIR/lib/setup.sh"
# shellcheck source=scripts/lib/logs.sh
source "$SCRIPT_DIR/lib/logs.sh"
# shellcheck source=scripts/lib/db.sh
source "$SCRIPT_DIR/lib/db.sh"

# ── Main ────────────────────────────────────────────────────────────

usage() {
  cat <<'EOF'
Usage: reproctl <command> [args]

Commands:
  setup                             Bootstrap the development environment
  doctor                            Diagnose the development environment
  cluster <subcommand>            Manage the local k8s cluster and registry
                                  (up, down, status, reset)
  db <subcommand>                 Database operations
                                  (reset, migrate, shell, status)
  start <service> [...]           Start services from the current context
  stop [<service>...] | --all     Remove services or tear down Tilt
  restart <service> [...] | --all Rebuild services or restart the Tilt daemon
  status                          Show running services and dashboard URL
  logs [options] [service...]     Show or stream service logs
  ui                              Open the Tilt dashboard in a browser
  worktree <subcommand>           Manage git worktrees (create, remove, list, attach)
                                  (alias: wt)

Context is detected automatically:
  - From the main checkout, services run as main.
  - From a worktree, services are isolated to that branch.

To run services from multiple contexts, invoke reproctl from each
checkout in separate terminals. The shared config and single Tilt
process handle coordination.

Examples:
  reproctl setup                              # bootstrap entire environment
  reproctl setup --skip-cluster               # skip cluster creation
  reproctl doctor                             # check environment health
  reproctl cluster up                         # create cluster and registry
  reproctl cluster status                     # check cluster state
  reproctl db reset                           # drop + recreate database
  reproctl db migrate                         # run pending migrations
  reproctl db shell                           # open psql session
  reproctl db status                          # show migration status
  reproctl start workspace                    # main checkout services
  reproctl start api-server                   # from worktree: isolated api-server
  reproctl stop api-server                    # remove from current context
  reproctl stop --all                         # tear down everything
  reproctl restart api-server                 # rebuild + redeploy a running service
  reproctl restart --all                      # restart the Tilt daemon
  reproctl status                             # show what's running
  reproctl logs -f api-server                 # tail logs for a service
  reproctl logs --json --since 5m api-server  # structured recent logs
  reproctl ui                                 # open Tilt dashboard
  reproctl wt attach feat/my-feat              # drop into worktree subshell
  reproctl wt create feat/my-feat             # shorthand for worktree
  reproctl worktree create feat/my-feat       # create worktree (auto-creates branch)
  reproctl worktree remove feat/my-feat       # remove worktree
  reproctl worktree list                      # list all worktrees
EOF
}

if [ $# -lt 1 ]; then
  usage >&2
  exit 1
fi

COMMAND="$1"
shift

case "$COMMAND" in
  setup)   cmd_setup "$@" ;;
  doctor)  cmd_doctor "$@" ;;
  cluster) cmd_cluster "$@" ;;
  db)      cmd_db "$@" ;;
  start)   cmd_start "$@" ;;
  stop)    cmd_stop "$@" ;;
  restart) cmd_restart "$@" ;;
  status)  cmd_status "$@" ;;
  logs)    cmd_logs "$@" ;;
  ui)      cmd_ui "$@" ;;
  worktree|wt) cmd_wt "$@" ;;
  -h|--help)   usage ;;
  *)
    die "Unknown command: $COMMAND\nRun 'reproctl --help' for usage."
    ;;
esac
