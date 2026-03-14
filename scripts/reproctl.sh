#!/bin/bash
#
# reproctl — unified CLI for cluster management, worktree lifecycle,
#            and Tilt service orchestration
#
# Usage:
#   reproctl setup                            Bootstrap the development environment
#   reproctl doctor                           Check development environment prerequisites
#   reproctl checkhealth [--json]              Runtime health checks
#   reproctl cluster up|down|status|reset     Manage the local k8s cluster
#   reproctl db reset|migrate|shell|status    Database operations
#   reproctl start <service> [...]            Start services from current context
#   reproctl stop [<service>...] [-w <wt>] | --all  Remove services or tear down Tilt
#   reproctl restart <service> [...] [-w <wt>] | --all  Rebuild services or restart Tilt
#   reproctl status                           Show running services and dashboard URL
#   reproctl logs [options] [service...]       Show or stream service logs
#   reproctl ui                               Open the Tilt dashboard in a browser
#   reproctl launch <service>                  Open service URL in the browser
#   reproctl config path|show|edit              Inspect service configuration
#   reproctl context                           Show current development context
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
# shellcheck source=scripts/lib/context.sh
source "$SCRIPT_DIR/lib/context.sh"
# shellcheck source=scripts/lib/checkhealth.sh
source "$SCRIPT_DIR/lib/checkhealth.sh"
# shellcheck source=scripts/lib/launch.sh
source "$SCRIPT_DIR/lib/launch.sh"
# shellcheck source=scripts/lib/config.sh
source "$SCRIPT_DIR/lib/config.sh"

# ── Main ────────────────────────────────────────────────────────────

usage() {
  cat <<'EOF'
Usage: reproctl <command> [args]

Commands:
  setup                             Bootstrap the development environment
  doctor                            Check development environment prerequisites
  checkhealth [--json]              Runtime health checks (Tilt, k8s, services)
  cluster <subcommand>            Manage the local k8s cluster and registry
                                  (up, down, status, reset)
  db <subcommand>                 Database operations
                                  (reset, migrate, shell, status)
  start <service> [...]           Start services from the current context
  stop [<service>...] | --all     Remove services or tear down Tilt
                                  Use --worktree / -w to target another worktree
  restart <service> [...] | --all Rebuild services or restart the Tilt daemon
                                  Use --worktree / -w to target another worktree
  status                          Show running services and dashboard URL
  logs [options] [service...]     Show or stream service logs
  ui                              Open the Tilt dashboard in a browser
  launch <service>                Open a service URL in the browser
  config <subcommand>             Inspect service configuration (path, show, edit)
  context                         Show current development context
  worktree <subcommand>           Manage git worktrees (create, remove, list, attach)
                                  (alias: wt)
  help [<command>]                Show manpage for reproctl or a subcommand

Context is detected automatically:
  - From the main checkout, services run as main.
  - From a worktree, services are isolated to that branch.

To run services from multiple contexts, invoke reproctl from each
checkout in separate terminals. The shared config and single Tilt
process handle coordination.

Examples:
  reproctl setup                              # bootstrap entire environment
  reproctl setup --skip-cluster               # skip cluster creation
  reproctl doctor                             # check installed tools and versions
  reproctl checkhealth                         # runtime health checks
  reproctl checkhealth --json                  # machine-readable health check
  reproctl cluster up                         # create cluster and registry
  reproctl cluster status                     # check cluster state
  reproctl db reset                           # drop + recreate database
  reproctl db migrate                         # run pending migrations
  reproctl db shell                           # open psql session
  reproctl db status                          # show migration status
  reproctl start workspace                    # main checkout services
  reproctl start api-server                   # from worktree: isolated api-server
  reproctl stop api-server                    # remove from current context
  reproctl stop -w rep-123 api-server        # stop in another worktree
  reproctl stop --all                         # tear down everything
  reproctl restart api-server                 # rebuild + redeploy a running service
  reproctl restart -w rep-123 workspace      # restart in another worktree
  reproctl restart --all                      # restart the Tilt daemon
  reproctl status                             # show what's running
  reproctl logs -f api-server                 # tail logs for a service
  reproctl logs --json --since 5m api-server  # structured recent logs
  reproctl ui                                 # open Tilt dashboard
  reproctl launch workspace                  # open workspace in browser
  reproctl launch api-server -w feat/my-feat # open worktree api-server URL
  reproctl context                            # show current worktree/branch context
  reproctl config path                       # print config file path
  reproctl config show                       # pretty-print current config
  reproctl config edit                       # open config in $EDITOR
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
  checkhealth)
    CHECKHEALTH_JSON=false
    for arg in "$@"; do
      case "$arg" in
        --json) CHECKHEALTH_JSON=true ;;
        -h|--help)
          cat <<'USAGE'
Usage: reproctl checkhealth [--json]

Check the runtime health of the development environment — Tilt daemon,
Kubernetes cluster, container registry, services, and worktree resources.

Options:
  --json    Output machine-readable JSON instead of human-readable text

Exit codes:
  0   All healthy (or only warnings)
  1   Errors found
USAGE
          exit 0
          ;;
        *) die "Unknown option: $arg\nRun 'reproctl checkhealth --help' for usage." ;;
      esac
    done
    cmd_checkhealth
    ;;
  cluster) cmd_cluster "$@" ;;
  db)      cmd_db "$@" ;;
  start)   cmd_start "$@" ;;
  stop)    cmd_stop "$@" ;;
  restart) cmd_restart "$@" ;;
  status)  cmd_status "$@" ;;
  logs)    cmd_logs "$@" ;;
  ui)      cmd_ui "$@" ;;
  launch)  cmd_launch "$@" ;;
  config)  cmd_config "$@" ;;
  context) cmd_context "$@" ;;
  worktree|wt) cmd_wt "$@" ;;
  help)
    topic="${1:-reproctl}"
    case "$topic" in
      wt) topic="worktree" ;;
    esac
    if [ "$topic" = "reproctl" ]; then
      page="reproctl"
    else
      page="reproctl-$topic"
    fi
    mandir="$REPO_ROOT/docs/man"
    manfile="$mandir/man1/${page}.1"
    if [ -f "$manfile" ] && command -v man > /dev/null 2>&1; then
      MANPATH="$mandir" man "$page"
    elif [ -f "$manfile" ]; then
      cat "$manfile"
    else
      die "No manual entry for $page.\nRun 'reproctl --help' for a command list."
    fi
    ;;
  -h|--help)   usage ;;
  *)
    die "Unknown command: $COMMAND\nRun 'reproctl --help' for usage."
    ;;
esac
