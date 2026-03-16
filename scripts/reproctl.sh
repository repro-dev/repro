#!/bin/bash
set -euo pipefail

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
# shellcheck source=scripts/lib/lifecycle.sh
source "$SCRIPT_DIR/lib/lifecycle.sh"
# shellcheck source=scripts/lib/completion.sh
source "$SCRIPT_DIR/lib/completion.sh"
# shellcheck source=scripts/lib/version.sh
source "$SCRIPT_DIR/lib/version.sh"

# ── Main ────────────────────────────────────────────────────────────

usage() {
  cat <<EOF
Usage: reproctl [--json] <command> [args]

${CLR_BOLD}GLOBAL OPTIONS${CLR_RESET}
  --json                          Output machine-readable JSON where supported

${CLR_BOLD}LIFECYCLE${CLR_RESET}
  up [service...] [--wait]        Bring the environment online (cluster + services)
  down [--cluster]                Stop all services (optionally tear down cluster)

${CLR_BOLD}ENVIRONMENT${CLR_RESET}
  setup                           Bootstrap the development environment
  doctor                          Check development environment prerequisites
  checkhealth                     Runtime health checks (Tilt, k8s, services)

${CLR_BOLD}SERVICES${CLR_RESET}
  start <service> [...]           Start services from the current context
  stop [<service>...] | --all     Remove services or tear down Tilt
  restart <service> [...] | --all Rebuild services or restart the Tilt daemon
  status                          Show running services and dashboard URL
  logs [options] [service...]     Show or stream service logs
  ui                              Open the Tilt dashboard in a browser
  launch <service>                Open a service URL in the browser

${CLR_BOLD}INFRASTRUCTURE${CLR_RESET}
  cluster <subcommand>            Manage the local k8s cluster and registry
  db <subcommand>                 Database operations

${CLR_BOLD}WORKTREES${CLR_RESET}
  wt create <branch>              Create a new worktree for a branch
  wt create --from-issue <id>     Create a worktree from a Linear issue
  wt remove <branch>              Remove the worktree for a branch
  wt list                         List active worktrees
  wt attach <branch>              Drop into a worktree subshell
  wt prune [--yes]                Remove worktrees whose branches are merged

${CLR_BOLD}GENERAL${CLR_RESET}
  context                         Show current development context
  completion <shell>              Generate shell completions (bash, zsh, fish)
  version                         Print the reproctl commit and date
  help [<command>]                Show manpage for reproctl or a subcommand

Examples:
  reproctl up                                 # bring everything online
  reproctl up api-server workspace            # start specific services
  reproctl up --wait                          # start all, wait for healthy
  reproctl down                               # stop services, keep cluster
  reproctl down --cluster                     # stop services and cluster
  reproctl setup                              # bootstrap entire environment
  reproctl doctor                             # check installed tools and versions
  reproctl --json checkhealth                 # machine-readable health check
  reproctl --json status                      # machine-readable service status
  reproctl --json context                     # machine-readable context info
  reproctl cluster up                         # create cluster and registry
  reproctl db migrate                         # run pending migrations
  reproctl start workspace                    # main checkout services
  reproctl stop --all                         # tear down everything
  reproctl restart api-server                 # rebuild + redeploy a running service
  reproctl logs -f api-server                 # tail logs for a service
  reproctl launch workspace                   # open workspace in browser
  reproctl wt create --from-issue REP-123     # create worktree from Linear issue
  reproctl wt list                            # list all worktrees
  reproctl context                            # show current worktree/branch context
EOF
}

REPROCTL_JSON=false

_args=()
for _a in "$@"; do
  if [ "$_a" = "--json" ]; then
    REPROCTL_JSON=true
  else
    _args+=("$_a")
  fi
done
set -- ${_args[@]+"${_args[@]}"}
unset _args _a

if [ $# -eq 0 ]; then
  usage >&2
  exit 1
fi

COMMAND="$1"
shift

case "$COMMAND" in
  up)      cmd_up "$@" ;;
  down)    cmd_down "$@" ;;
  setup)   cmd_setup "$@" ;;
  doctor)  cmd_doctor "$@" ;;
  checkhealth)
    for arg in "$@"; do
      case "$arg" in
        -h|--help)
          cat <<'USAGE'
Usage: reproctl [--json] checkhealth

Check the runtime health of the development environment — Tilt daemon,
Kubernetes cluster, container registry, services, and worktree resources.

The --json global flag outputs machine-readable JSON instead of human text.

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
  context) cmd_context "$@" ;;
  worktree|wt) cmd_wt "$@" ;;
  completion)  cmd_completion "$@" ;;
  version)     cmd_version "$@" ;;
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
  -h|--help)      usage ;;
  --version|-V)    cmd_version "$@" ;;
  *)
    KNOWN_COMMANDS="up down setup doctor checkhealth cluster db start stop restart status logs ui launch context worktree wt help"
    suggestions=$(python3 "$SCRIPT_DIR/lib/py/suggest_command.py" "$COMMAND" $KNOWN_COMMANDS 2>/dev/null) || true
    if [ -n "$suggestions" ]; then
      printf 'Error: Unknown command: %s\n' "$COMMAND" >&2
      printf 'Did you mean:\n' >&2
      while IFS= read -r s; do
        printf '  %s\n' "$s" >&2
      done <<EOF
$suggestions
EOF
    else
      die "Unknown command: $COMMAND\nRun 'reproctl --help' for usage."
    fi
    exit 1
    ;;
esac
