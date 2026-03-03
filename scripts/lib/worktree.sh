#!/bin/bash
#
# scripts/lib/worktree.sh — git worktree lifecycle commands
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh to be loaded
# first (provides REPO_ROOT, MAIN_CHECKOUT, PARENT_DIR, slugify,
# worktree_path, die).

WT_DRY_RUN=false

cmd_wt_create() {
  local branch="$1"
  local wt_path
  wt_path="$(worktree_path "$branch")"

  echo "${CLR_BOLD}Creating worktree for branch:${CLR_RESET} $branch"
  echo "  Path: $wt_path"

  if [ "$WT_DRY_RUN" = true ]; then
    echo ""
    echo "${CLR_DIM}[dry-run]${CLR_RESET} Would run: git worktree add ... \"$wt_path\" \"$branch\""
    echo "${CLR_DIM}[dry-run]${CLR_RESET} Would run: pnpm install (in $wt_path)"

    local env_files
    env_files=$(find "$MAIN_CHECKOUT/apps" -maxdepth 2 -type f -name '.env*' -not -name '.env.example' 2>/dev/null || true)
    if [ -n "$env_files" ]; then
      echo "${CLR_DIM}[dry-run]${CLR_RESET} Would copy .env files:"
      echo "$env_files" | while read -r f; do
        local rel="${f#"$MAIN_CHECKOUT"/}"
        echo "  $rel"
      done
    fi
    if command -v direnv > /dev/null 2>&1; then
      echo "${CLR_DIM}[dry-run]${CLR_RESET} Would run: direnv allow (in $wt_path)"
    fi
    echo ""
    echo "${CLR_DIM}[dry-run] No changes were made.${CLR_RESET}"
    return 0
  fi

  if [ -d "$wt_path" ]; then
    _err "Error: Worktree already exists at $wt_path"
    echo "  To remove it: reproctl worktree remove $branch" >&2
    exit 1
  fi

  local has_direnv=false
  if command -v direnv > /dev/null 2>&1; then
    has_direnv=true
  fi

  local total_steps=3
  if [ "$has_direnv" = true ]; then
    total_steps=4
  fi

  local step=1
  _step "$step" "$total_steps" "Creating git worktree..."
  if git rev-parse --verify --quiet "refs/heads/$branch" >/dev/null 2>&1; then
    git worktree add "$wt_path" "$branch"
  elif git rev-parse --verify --quiet "refs/remotes/origin/$branch" >/dev/null 2>&1; then
    git worktree add "$wt_path" "$branch"
  else
    echo "  Branch '$branch' does not exist locally or on remote, creating from HEAD..."
    git worktree add -b "$branch" "$wt_path"
  fi

  step=$((step + 1))
  _step "$step" "$total_steps" "Installing dependencies..."
  (cd "$wt_path" && pnpm install)

  step=$((step + 1))
  _step "$step" "$total_steps" "Copying .env files..."
  local copied=0
  while read -r env_file; do
    local rel="${env_file#"$MAIN_CHECKOUT"/}"
    local dest="$wt_path/$rel"
    local dest_dir
    dest_dir="$(dirname "$dest")"

    if [ -d "$dest_dir" ]; then
      cp "$env_file" "$dest"
      echo "  Copied: $rel"
      copied=$((copied + 1))
    fi
  done < <(find "$MAIN_CHECKOUT/apps" -maxdepth 2 -type f -name '.env*' -not -name '.env.example' 2>/dev/null || true)
  echo "  ($copied file(s) copied)"

  if [ "$has_direnv" = true ] && [ -f "$wt_path/.envrc" ]; then
    step=$((step + 1))
    _step "$step" "$total_steps" "Allowing direnv..."
    local main_allowed=false
    if (cd "$MAIN_CHECKOUT" && direnv status 2>/dev/null) | grep -q "Found RC allowed 0"; then
      main_allowed=true
    fi

    if [ "$main_allowed" = true ]; then
      (cd "$wt_path" && direnv allow)
    else
      echo "  ${CLR_DIM}Skipped (not allowed in main checkout)${CLR_RESET}"
    fi
  fi

  echo ""
  _ok "Worktree ready"
  echo ""
  echo "  Branch: $branch"
  echo "  Path:   $wt_path"
  echo ""
  echo "  cd $wt_path"
  echo ""
}

cmd_wt_remove() {
  local branch="$1"
  local wt_path
  wt_path="$(worktree_path "$branch")"

  echo "${CLR_BOLD}Removing worktree for branch:${CLR_RESET} $branch"
  echo "  Path: $wt_path"

  if [ "$WT_DRY_RUN" = true ]; then
    echo ""
    echo "${CLR_DIM}[dry-run]${CLR_RESET} Would run: git worktree remove \"$wt_path\""
    echo "${CLR_DIM}[dry-run]${CLR_RESET} Would run: git worktree prune"
    echo ""
    echo "${CLR_DIM}[dry-run] No changes were made.${CLR_RESET}"
    return 0
  fi

  if [ ! -d "$wt_path" ]; then
    _err "Error: No worktree found at $wt_path"
    echo "  Run 'reproctl worktree list' to see active worktrees." >&2
    git worktree prune
    exit 1
  fi

  _step 1 2 "Removing git worktree..."
  git worktree remove "$wt_path"

  _step 2 2 "Pruning stale entries..."
  git worktree prune

  echo ""
  _ok "Worktree removed: $wt_path"
}

cmd_wt_list() {
  echo "${CLR_BOLD}Active worktrees:${CLR_RESET}"
  echo ""

  local active_services=""
  if [ -f "$CONFIG_FILE" ]; then
    active_services="$(cat "$CONFIG_FILE")"
  fi

  local slugs=() branches=() services_list=()
  local max_slug=4 max_branch=6

  local wt_path="" wt_branch="" wt_bare=false wt_detached=false

  _wt_list_flush() {
    [ -z "$wt_path" ] && return

    local slug basename
    basename="$(basename "$wt_path")"
    if [[ "$basename" == repro-wt-* ]]; then
      slug="${basename#repro-wt-}"
    else
      slug="main"
    fi

    if [ "$wt_bare" = true ]; then
      wt_branch="(bare)"
    elif [ "$wt_detached" = true ]; then
      wt_branch="(detached HEAD)"
    fi

    local svc_names=""
    if [ -n "$active_services" ] && command -v python3 > /dev/null 2>&1; then
      svc_names="$(python3 "$SCRIPTS_DIR/lib/py/worktree_services.py" "$active_services" "$slug" 2>/dev/null || true)"
    fi

    slugs+=("$slug")
    branches+=("$wt_branch")
    services_list+=("$svc_names")

    [ ${#slug} -gt $max_slug ] && max_slug=${#slug}
    [ ${#wt_branch} -gt $max_branch ] && max_branch=${#wt_branch}

    wt_path="" wt_branch="" wt_bare=false wt_detached=false
  }

  while IFS= read -r line; do
    case "$line" in
      worktree\ *) wt_path="${line#worktree }" ;;
      branch\ *)   wt_branch="${line#branch }"; wt_branch="${wt_branch#refs/heads/}" ;;
      bare)        wt_bare=true ;;
      detached)    wt_detached=true ;;
      "")          _wt_list_flush ;;
    esac
  done < <(git worktree list --porcelain)
  _wt_list_flush

  printf "  ${CLR_BOLD}%-${max_slug}s  %-${max_branch}s  %s${CLR_RESET}\n" "SLUG" "BRANCH" "SERVICES"

  local i
  for i in "${!slugs[@]}"; do
    local svc_display="${services_list[$i]}"
    if [ -z "$svc_display" ]; then
      svc_display="${CLR_DIM}(none)${CLR_RESET}"
    fi
    printf "  %-${max_slug}s  %-${max_branch}s  %s\n" "${slugs[$i]}" "${branches[$i]}" "$svc_display"
  done

  echo ""
}

resolve_worktree() {
  local input="$1"
  local slug_path
  slug_path="$(worktree_path "$input")"

  if [[ -d "$slug_path" ]]; then
    echo "$slug_path"
    return 0
  fi

  local wt_path="" wt_branch=""
  while IFS= read -r line; do
    case "$line" in
      worktree\ *) wt_path="${line#worktree }" ;;
      branch\ *)   wt_branch="${line#branch refs/heads/}" ;;
      "")
        if [[ "$wt_branch" == "$input" ]]; then
          echo "$wt_path"
          return 0
        fi
        wt_path="" wt_branch=""
        ;;
    esac
  done < <(git worktree list --porcelain)
  if [[ "$wt_branch" == "$input" ]]; then
    echo "$wt_path"
    return 0
  fi

  return 1
}

_worktree_branch_for_path() {
  local target="$1"
  local wt_path="" wt_branch=""
  while IFS= read -r line; do
    case "$line" in
      worktree\ *) wt_path="${line#worktree }" ;;
      branch\ *)   wt_branch="${line#branch refs/heads/}" ;;
      "")
        if [[ "$wt_path" == "$target" ]]; then
          echo "$wt_branch"
          return 0
        fi
        wt_path="" wt_branch=""
        ;;
    esac
  done < <(git worktree list --porcelain)
  if [[ "$wt_path" == "$target" ]]; then
    echo "$wt_branch"
    return 0
  fi

  return 1
}

_list_available_worktrees() {
  local wt_path="" wt_branch="" wt_bare=false wt_detached=false
  local entries=()
  while IFS= read -r line; do
    case "$line" in
      worktree\ *) wt_path="${line#worktree }" ;;
      branch\ *)   wt_branch="${line#branch refs/heads/}" ;;
      bare)        wt_bare=true ;;
      detached)    wt_detached=true ;;
      "")
        if [[ "$wt_bare" != true ]]; then
          local basename
          basename="$(basename "$wt_path")"
          if [[ "$basename" == repro-wt-* ]]; then
            local slug="${basename#repro-wt-}"
            if [[ "$wt_detached" == true ]]; then
              entries+=("  $slug  (detached HEAD)")
            else
              entries+=("  $slug  $wt_branch")
            fi
          fi
        fi
        wt_path="" wt_branch="" wt_bare=false wt_detached=false
        ;;
    esac
  done < <(git worktree list --porcelain)

  if [[ ${#entries[@]} -eq 0 ]]; then
    echo "  (none)"
  else
    printf '%s\n' "${entries[@]}"
  fi
}

cmd_attach() {
  local input="$1"
  local wt_path
  wt_path="$(resolve_worktree "$input")" || true

  if [[ -z "$wt_path" ]] || [[ ! -d "$wt_path" ]]; then
    {
      printf "No worktree found for '%s'.\n\n" "$input"
      printf "Available worktrees:\n"
      _list_available_worktrees
      printf "\n  Create one: reproctl worktree create %s\n" "$input"
    } >&2
    exit 1
  fi

  local branch
  branch="$(_worktree_branch_for_path "$wt_path")" || branch="$input"

  local slug
  slug="$(slugify "$branch")"

  echo "Attached to worktree: $branch"
  echo "  Path: $wt_path"
  echo "  Exit the shell (exit or Ctrl-D) to return."

  (cd "$wt_path" && \
    REPRO_WORKTREE="$slug" \
    REPRO_WORKTREE_BRANCH="$branch" \
    REPRO_WORKTREE_PATH="$wt_path" \
    exec "$SHELL")

  echo "Detached from worktree: $branch"
}

wt_usage() {
  cat <<'EOF'
Usage: reproctl worktree <command> [options] [args]

Commands:
  create [options] <branch>   Create a new worktree for the given branch
  remove [options] <branch>   Remove the worktree for the given branch
  list                        List all active worktrees
  attach <branch>             Drop into a subshell in the given worktree

Options (create, remove):
  --dry-run         Preview what would be done without making changes

Examples:
  reproctl worktree create feat/my-feature      # checkout existing branch
  reproctl worktree create feat/new-feature     # auto-creates branch if needed
  reproctl worktree remove feat/my-feature      # remove worktree
  reproctl worktree list                        # list all worktrees
  reproctl worktree attach feat/my-feature      # drop into worktree subshell
EOF
}

cmd_wt() {
  if [ $# -eq 0 ]; then
    wt_usage >&2
    exit 1
  fi

  WT_DRY_RUN=false

  local subcmd=""
  local args=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help)
        wt_usage
        exit 0
        ;;
      create|remove|list|attach)
        subcmd="$1"
        shift
        break
        ;;
      *)
        die "Unknown worktree command: $1\nRun 'reproctl worktree --help' for usage."
        ;;
    esac
  done

  if [ -z "$subcmd" ]; then
    wt_usage >&2
    exit 1
  fi

  # Parse subcommand-level options
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --dry-run)
        WT_DRY_RUN=true
        shift
        ;;
      -h|--help)
        wt_usage
        exit 0
        ;;
      -*)
        die "Unknown option: $1"
        ;;
      *)
        args+=("$1")
        shift
        ;;
    esac
  done

  if [ "$WT_DRY_RUN" = true ] && [ "$subcmd" = "attach" ]; then
    die "--dry-run flag cannot be used with 'attach'"
  fi


  case "$subcmd" in
    create)
      if [ "${#args[@]}" -lt 1 ]; then
        die "'worktree create' requires a branch name"
      fi
      if ! git check-ref-format "refs/heads/${args[0]}" >/dev/null 2>&1; then
        die "'${args[0]}' is not a valid branch name."
      fi
      cmd_wt_create "${args[0]}"
      ;;
    remove)
      if [ "${#args[@]}" -lt 1 ]; then
        die "'worktree remove' requires a branch name"
      fi
      if ! git check-ref-format "refs/heads/${args[0]}" >/dev/null 2>&1; then
        die "'${args[0]}' is not a valid branch name."
      fi
      cmd_wt_remove "${args[0]}"
      ;;
    list)
      cmd_wt_list
      ;;
    attach)
      if [ "${#args[@]}" -lt 1 ]; then
        die "'worktree attach' requires a branch name"
      fi
      cmd_attach "${args[0]}"
      ;;
  esac
}
