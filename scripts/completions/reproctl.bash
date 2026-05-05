#!/usr/bin/env bash
# shellcheck disable=SC2207
#
# Bash completion for reproctl — the Repro development CLI.
#
# Installation (add to ~/.bashrc):
#   source /path/to/repro/scripts/completions/reproctl.bash
#
# Or, if direnv is already configured, the .envrc sources this
# automatically.

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

__reproctl_repo_root() {
  local root
  root="$(git rev-parse --show-toplevel 2>/dev/null)"
  if [[ -n "$root" ]]; then
    echo "$root"
    return
  fi

  local source="${BASH_SOURCE[0]}"
  local dir
  while [[ -L "$source" ]]; do
    dir="$(cd -P "$(dirname "$source")" && pwd)"
    source="$(readlink "$source")"
    [[ "$source" != /* ]] && source="$dir/$source"
  done
  dir="$(cd -P "$(dirname "$source")" && pwd)"
  echo "$(dirname "$(dirname "$dir")")"
}

__reproctl_services() {
  local repo
  repo="$(__reproctl_repo_root)"
  local json="$repo/infra/services.json"
  [[ -f "$json" ]] || return
  python3 "$repo/scripts/lib/py/service_names.py" "$json" 2>/dev/null
}

__reproctl_launchable_services() {
  local repo
  repo="$(__reproctl_repo_root)"
  local json="$repo/infra/services.json"
  [[ -f "$json" ]] || return
  python3 "$repo/scripts/lib/py/launchable_local_services.py" "$json" 2>/dev/null
}

__reproctl_worktree_branches() {
  git worktree list --porcelain 2>/dev/null \
    | awk '/^branch refs\/heads\//{sub(/^branch refs\/heads\//, ""); print}'
}

# ---------------------------------------------------------------------------
# Main completion function
# ---------------------------------------------------------------------------

_reproctl() {
  local cur prev words cword
  _init_completion || return

  local top_commands="setup doctor checkhealth cluster db code-index start stop restart status logs ui launch autonomy context worktree wt completion version help opencode"
  local cluster_sub="up down status reset"
  local db_sub="reset migrate shell status"
  local code_index_sub="help"
  local wt_sub="create remove list attach prune"
  local completion_shells="bash zsh fish"
  local help_topics="setup doctor checkhealth cluster db code-index start stop restart status logs ui launch autonomy context worktree wt completion version environment exit-codes json opencode"

  # Find the subcommand position (skip global flags)
  local cmd="" subcmd=""
  local i
  for ((i = 1; i < cword; i++)); do
    case "${words[i]}" in
      -h|--help|--json|--quiet|-q|--verbose) continue ;;
      -*) continue ;;
      *)
        if [[ -z "$cmd" ]]; then
          cmd="${words[i]}"
        elif [[ -z "$subcmd" ]]; then
          subcmd="${words[i]}"
        fi
        ;;
    esac
  done

  # Top-level completion
  if [[ -z "$cmd" ]]; then
    COMPREPLY=($(compgen -W "$top_commands --json --quiet -q --verbose -h --help --version -V" -- "$cur"))
    return
  fi

  case "$cmd" in
    setup)
      COMPREPLY=($(compgen -W "--skip-cluster -h --help" -- "$cur"))
      ;;

    doctor)
      ;;

    checkhealth)
      COMPREPLY=($(compgen -W "-h --help" -- "$cur"))
      ;;

    cluster)
      if [[ -z "$subcmd" ]]; then
        COMPREPLY=($(compgen -W "$cluster_sub -h --help" -- "$cur"))
      else
        case "$subcmd" in
          down|reset) COMPREPLY=($(compgen -W "--force" -- "$cur")) ;;
        esac
      fi
      ;;

    db)
      if [[ -z "$subcmd" ]]; then
        COMPREPLY=($(compgen -W "$db_sub -h --help" -- "$cur"))
      else
        case "$subcmd" in
          reset) COMPREPLY=($(compgen -W "-y --yes" -- "$cur")) ;;
        esac
      fi
      ;;

    code-index)
      if [[ -z "$subcmd" ]]; then
        COMPREPLY=($(compgen -W "$code_index_sub -h --help" -- "$cur"))
      fi
      ;;

    start)
      case "$prev" in
        --timeout|-t) return ;; # expect value
      esac
      COMPREPLY=($(compgen -W "--pick -p --wait -w --timeout -t -h --help $(__reproctl_services)" -- "$cur"))
      ;;

    stop)
      case "$prev" in
        --worktree|-w) COMPREPLY=($(compgen -W "$(__reproctl_worktree_branches)" -- "$cur")); return ;;
      esac
      COMPREPLY=($(compgen -W "--all --worktree -w --pick -p $(__reproctl_services)" -- "$cur"))
      ;;

    restart)
      case "$prev" in
        --worktree|-w) COMPREPLY=($(compgen -W "$(__reproctl_worktree_branches)" -- "$cur")); return ;;
      esac
      COMPREPLY=($(compgen -W "--all --worktree -w --pick -p -h --help $(__reproctl_services)" -- "$cur"))
      ;;

    logs)
      case "$prev" in
        --level)  COMPREPLY=($(compgen -W "warn error" -- "$cur")); return ;;
        --source) COMPREPLY=($(compgen -W "all build runtime" -- "$cur")); return ;;
        --grep|--since|-C|--context|-B|-A|-n|--tail) return ;; # expect value
      esac
      COMPREPLY=($(compgen -W "-f --follow --level --source --grep -C --context -B -A --since --json --no-prefix -n --tail --pick -p -h --help $(__reproctl_services)" -- "$cur"))
      ;;

    launch)
      case "$prev" in
        --worktree|-w) COMPREPLY=($(compgen -W "$(__reproctl_worktree_branches)" -- "$cur")); return ;;
      esac
      COMPREPLY=($(compgen -W "--worktree -w -h --help $(__reproctl_launchable_services)" -- "$cur"))
      ;;

    autonomy)
      if [[ -z "$subcmd" ]]; then
        COMPREPLY=($(compgen -W "status claim prepare release reconcile monitor run help -h --help" -- "$cur"))
      else
        case "$subcmd" in
          status)
            COMPREPLY=($(compgen -W "--all -h --help" -- "$cur"))
            ;;
          claim)
            case "$prev" in
              --issue-id|--workspace|--phase|--issue-state|--issue-state-type|--claimed-by) return ;;
            esac
            COMPREPLY=($(compgen -W "--issue-id --workspace --phase --issue-state --issue-state-type --claimed-by -h --help" -- "$cur"))
            ;;
          prepare)
            case "$prev" in
              --phase|--claimed-by) return ;;
            esac
            COMPREPLY=($(compgen -W "--phase --claimed-by -h --help" -- "$cur"))
            ;;
          release)
            case "$prev" in
              --reason) return ;;
            esac
            COMPREPLY=($(compgen -W "--reason -h --help" -- "$cur"))
            ;;
          reconcile)
            case "$prev" in
              --issue-state-name|--issue-state-type) return ;;
            esac
            COMPREPLY=($(compgen -W "--all --issue-state-name --issue-state-type -h --help" -- "$cur"))
            ;;
          monitor)
            case "$prev" in
              --limit|--interval|--claimed-by) return ;;
            esac
            COMPREPLY=($(compgen -W "--once --prepare --interval --limit --claimed-by --json -h --help" -- "$cur"))
            ;;
          run)
            case "$prev" in
              run) COMPREPLY=($(compgen -W "start finish -h --help" -- "$cur")); return ;;
              --phase|--workspace|--attempt|--state|--error) return ;;
              start) COMPREPLY=($(compgen -W "--phase --workspace -h --help" -- "$cur")); return ;;
              finish) COMPREPLY=($(compgen -W "--attempt --state --error -h --help" -- "$cur")); return ;;
            esac
            COMPREPLY=($(compgen -W "start finish -h --help" -- "$cur"))
            ;;
        esac
      fi
      ;;

    context)
      ;;

    worktree|wt)
      if [[ -z "$subcmd" ]]; then
        COMPREPLY=($(compgen -W "$wt_sub -h --help" -- "$cur"))
      else
        case "$subcmd" in
          create)
            case "$prev" in
              --from-issue|-i) return ;; # expect issue id
            esac
            COMPREPLY=($(compgen -W "--from-issue -i --no-status-update --dry-run -h --help" -- "$cur"))
            ;;
          remove)
            if [[ "$cur" == -* ]]; then
              COMPREPLY=($(compgen -W "--dry-run -h --help" -- "$cur"))
            else
              COMPREPLY=($(compgen -W "$(__reproctl_worktree_branches)" -- "$cur"))
            fi
            ;;
          attach)
            COMPREPLY=($(compgen -W "$(__reproctl_worktree_branches)" -- "$cur"))
            ;;
          prune)
            COMPREPLY=($(compgen -W "--dry-run -y --yes -h --help" -- "$cur"))
            ;;
          list)
            ;;
        esac
      fi
      ;;

    completion)
      COMPREPLY=($(compgen -W "$completion_shells" -- "$cur"))
      ;;

    help)
      COMPREPLY=($(compgen -W "$help_topics" -- "$cur"))
      ;;

    ui|status)
      ;;

    version)
      COMPREPLY=($(compgen -W "--json -h --help" -- "$cur"))
      ;;

    opencode)
      case "$prev" in
        --profile)
          # Complete profile names from .opencode/profiles/
          local repo
          repo="$(__reproctl_repo_root)"
          local profiles=()
          local pfile
          for pfile in "$repo/.opencode/profiles/"*.json; do
            [[ -f "$pfile" ]] || continue
            profiles+=("$(basename "$pfile" .json)")
          done
          COMPREPLY=($(compgen -W "${profiles[*]}" -- "$cur"))
          return
          ;;
      esac
      COMPREPLY=($(compgen -W "--profile -h --help" -- "$cur"))
      ;;
  esac
}

complete -F _reproctl reproctl
