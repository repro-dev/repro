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

  echo "Creating worktree for branch: $branch"
  echo "  Path: $wt_path"

  if [ "$WT_DRY_RUN" = true ]; then
    echo ""
    echo "[dry-run] Would run: git worktree add ... \"$wt_path\" \"$branch\""
    echo "[dry-run] Would run: pnpm install (in $wt_path)"

    local env_files
    env_files=$(find "$MAIN_CHECKOUT/apps" -maxdepth 2 -type f -name '.env*' -not -name '.env.example' 2>/dev/null || true)
    if [ -n "$env_files" ]; then
      echo "[dry-run] Would copy .env files:"
      echo "$env_files" | while read -r f; do
        local rel="${f#"$MAIN_CHECKOUT"/}"
        echo "  $rel"
      done
    fi
    if command -v direnv > /dev/null 2>&1; then
      echo "[dry-run] Would run: direnv allow (in $wt_path)"
    fi
    echo ""
    echo "[dry-run] No changes were made."
    return 0
  fi

  if [ -d "$wt_path" ]; then
    echo "Error: Worktree already exists at $wt_path" >&2
    echo "  To remove it: reproctl worktree remove $branch" >&2
    exit 1
  fi

  if git rev-parse --verify --quiet "refs/heads/$branch" >/dev/null 2>&1; then
    git worktree add "$wt_path" "$branch"
  elif git rev-parse --verify --quiet "refs/remotes/origin/$branch" >/dev/null 2>&1; then
    git worktree add "$wt_path" "$branch"
  else
    echo "Branch '$branch' does not exist locally or on remote, creating from HEAD..."
    git worktree add -b "$branch" "$wt_path"
  fi

  echo ""
  echo "Running pnpm install..."
  (cd "$wt_path" && pnpm install)

  echo ""
  echo "Copying .env files..."
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

  if command -v direnv > /dev/null 2>&1 && [ -f "$wt_path/.envrc" ]; then
    local main_allowed=false
    if (cd "$MAIN_CHECKOUT" && direnv status 2>/dev/null) | grep -q "Found RC allowed 0"; then
      main_allowed=true
    fi

    if [ "$main_allowed" = true ]; then
      echo ""
      echo "Allowing direnv..."
      (cd "$wt_path" && direnv allow)
    fi
  fi

  echo ""
  echo "=== Worktree ready ==="
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

  echo "Removing worktree for branch: $branch"
  echo "  Path: $wt_path"

  if [ "$WT_DRY_RUN" = true ]; then
    echo ""
    echo "[dry-run] Would run: git worktree remove \"$wt_path\""
    echo "[dry-run] Would run: git worktree prune"
    echo ""
    echo "[dry-run] No changes were made."
    return 0
  fi

  if [ ! -d "$wt_path" ]; then
    echo "Error: No worktree found at $wt_path" >&2
    echo "  Run 'reproctl worktree list' to see active worktrees." >&2
    git worktree prune
    exit 1
  fi

  git worktree remove "$wt_path"
  echo "Pruning stale worktree entries..."
  git worktree prune

  echo ""
  echo "Worktree removed: $wt_path"
}

cmd_wt_list() {
  echo "Active worktrees:"
  echo ""

  git worktree list --porcelain | awk '
    /^worktree / { path = substr($0, 10) }
    /^HEAD /     { head = substr($0, 6) }
    /^branch /   { branch = substr($0, 8); sub("refs/heads/", "", branch) }
    /^bare$/     { branch = "(bare)" }
    /^detached$/ { branch = "(detached HEAD)" }
    /^$/         {
      if (path != "") {
        printf "  %-60s %s\n", path, branch
      }
      path = ""; head = ""; branch = ""
    }
    END {
      if (path != "") {
        printf "  %-60s %s\n", path, branch
      }
    }
  '

  echo ""
}

wt_usage() {
  cat <<'EOF'
Usage: reproctl worktree <command> [options] [args]

Commands:
  create [options] <branch>   Create a new worktree for the given branch
  remove [options] <branch>   Remove the worktree for the given branch
  list                        List all active worktrees

Options (create, remove):
  --dry-run         Preview what would be done without making changes

Examples:
  reproctl worktree create feat/my-feature      # checkout existing branch
  reproctl worktree create feat/new-feature     # auto-creates branch if needed
  reproctl worktree remove feat/my-feature      # remove worktree
  reproctl worktree list                        # list all worktrees
EOF
}

cmd_wt() {
  if [ $# -eq 0 ]; then
    wt_usage >&2
    exit 1
  fi

  # Parse options before subcommand
  WT_DRY_RUN=false

  local subcmd=""
  local args=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help)
        wt_usage
        exit 0
        ;;
      create|remove|list)
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
  esac
}
