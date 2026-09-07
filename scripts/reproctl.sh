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
# shellcheck source=scripts/lib/completion.sh
source "$SCRIPT_DIR/lib/completion.sh"
# shellcheck source=scripts/lib/version.sh
source "$SCRIPT_DIR/lib/version.sh"
# shellcheck source=scripts/lib/code-index.sh
source "$SCRIPT_DIR/lib/code-index.sh"
# shellcheck source=scripts/lib/opencode.sh
source "$SCRIPT_DIR/lib/opencode.sh"
# ── Main ────────────────────────────────────────────────────────────

usage() {
  cat <<EOF
Usage: reproctl [--json] [--quiet] [--verbose] <command> [args]

${CLR_BOLD}GLOBAL OPTIONS${CLR_RESET}
  --json                          Output machine-readable JSON where supported
  --quiet, -q                     Suppress non-error output on stderr
  --verbose                       Show diagnostic details (or set REPROCTL_DEBUG=1)

${CLR_BOLD}ENVIRONMENT${CLR_RESET}
  setup                           Bootstrap the development environment
  doctor                          Check development environment prerequisites
  checkhealth                     Runtime health checks (Tilt, k8s, services)

${CLR_BOLD}SERVICES${CLR_RESET}
  start <service> [...]           Start services from the current context
                                   --wait / --timeout to block until healthy
                                   --full-stack for worktree-local deps
  stop [<service>...] | --all     Remove services or tear down Tilt
  restart <service> [...] | --all Rebuild services or restart the Tilt daemon
  status                          Show running services and dashboard URL
  logs [options] [service...]     Show or stream service logs
  ui                              Open the Tilt dashboard in a browser
  launch <service>                Open a service URL in the browser

${CLR_BOLD}INFRASTRUCTURE${CLR_RESET}
  cluster <subcommand>            Manage the local k8s cluster and registry
  db <subcommand>                 Database operations
  code-index <subcommand>         Code intelligence index management

${CLR_BOLD}WORKTREES${CLR_RESET}
  wt create <branch>              Create a new worktree for a branch
  wt create --from-issue <id>     Create or resume a worktree from a Linear issue
                                  --open to also register as a herdr workspace
                                  --skip-install to skip pnpm install + build
  wt remove <branch>              Remove the worktree for a branch
  wt list                         List active worktrees
  wt attach <branch>              Drop into a worktree subshell
  wt prune [--yes]                Remove worktrees whose branches are merged

${CLR_BOLD}GENERAL${CLR_RESET}
  context                         Show current development context
  completion <shell>              Generate shell completions (bash, zsh, fish)
  version                         Print the reproctl commit and date
  help [<command>|<topic>]        Show manpage for a command or topic
                                  Topics: environment, exit-codes, json
  opencode [--profile <name>|--pick]  Launch OpenCode with optional model profile

Examples:
  reproctl setup                              # bootstrap entire environment
  reproctl doctor                             # check installed tools and versions
  reproctl --json checkhealth                 # machine-readable health check
  reproctl --json status                      # machine-readable service status
  reproctl --json context                     # machine-readable context info
  reproctl cluster up                         # create cluster and registry
  reproctl db migrate                         # run pending migrations
  reproctl start workspace                    # main checkout services
  reproctl start --wait --full-stack api-server  # start worktree-local stack
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
REPROCTL_QUIET=false
REPROCTL_DEBUG="${REPROCTL_DEBUG:-false}"
if [ "$REPROCTL_DEBUG" = "1" ] || [ "$REPROCTL_DEBUG" = "true" ]; then
  REPROCTL_DEBUG=true
else
  REPROCTL_DEBUG=false
fi

_args=()
for _a in "$@"; do
  case "$_a" in
    --json) REPROCTL_JSON=true ;;
    --quiet|-q) REPROCTL_QUIET=true ;;
    --verbose) REPROCTL_DEBUG=true ;;
    *) _args+=("$_a") ;;
  esac
done
set -- ${_args[@]+"${_args[@]}"}
unset _args _a

_debug "command line: reproctl $*"
_debug "REPROCTL_JSON=$REPROCTL_JSON REPROCTL_QUIET=$REPROCTL_QUIET REPROCTL_DEBUG=$REPROCTL_DEBUG"

if [ $# -eq 0 ]; then
  usage >&2
  exit 1
fi

COMMAND="$1"
shift

case "$COMMAND" in
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
  code-index) cmd_code_index "$@" ;;
  opencode) cmd_opencode "$@" ;;
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
    mandir="$REPO_ROOT/docs/man"
    if [ "$topic" = "reproctl" ]; then
      page="reproctl"
      manfile="$mandir/man1/${page}.1"
    else
      page="reproctl-$topic"
      manfile="$mandir/man1/${page}.1"
      if [ ! -f "$manfile" ]; then
        page="reproctl-help-$topic"
        manfile="$mandir/man7/${page}.7"
      fi
    fi
    if [ -f "$manfile" ] && command -v man > /dev/null 2>&1; then
      MANPATH="$mandir" man "$page"
    elif [ -f "$manfile" ]; then
      cat "$manfile"
    else
      helper="cmd_${topic}_help"
      if declare -f "$helper" >/dev/null 2>&1; then
        "$helper"
      else
        die "No manual entry for $topic.\nRun 'reproctl --help' for a command list."
      fi
    fi
    ;;
  -h|--help)      usage ;;
  --version|-V)    cmd_version "$@" ;;
  *)
    KNOWN_COMMANDS="setup doctor checkhealth cluster db code-index start stop restart status logs ui launch context worktree wt completion version help opencode"
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
