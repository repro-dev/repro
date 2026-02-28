#!/bin/bash

set -euo pipefail

MAIN_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  echo "Error: Not inside a git repository." >&2
  exit 1
}
PARENT_DIR="$(dirname "$MAIN_ROOT")"

DRY_RUN=false
NEW_BRANCH=false

slugify() {
  printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'
}

worktree_path() {
  local slug
  slug="$(slugify "$1")"
  echo "$PARENT_DIR/repro-wt-$slug"
}

usage() {
  cat <<EOF
Usage: worktree.sh [options] <command> [args]

Commands:
  create <branch>   Create a new worktree for the given branch
  remove <branch>   Remove the worktree for the given branch
  list              List all active worktrees

Options:
  -b                Create a new branch (used with 'create')
  --dry-run         Preview what would be done without making changes
  -h, --help        Show this help message
EOF
}

cmd_create() {
  local branch="$1"
  local wt_path
  wt_path="$(worktree_path "$branch")"

  echo "Creating worktree for branch: $branch"
  echo "  Path: $wt_path"

  if [ "$DRY_RUN" = true ]; then
    echo ""
    if [ "$NEW_BRANCH" = true ]; then
      echo "[dry-run] Would run: git worktree add -b \"$branch\" \"$wt_path\""
    else
      echo "[dry-run] Would run: git worktree add \"$wt_path\" \"$branch\""
    fi
    echo "[dry-run] Would run: pnpm install (in $wt_path)"

    local env_files
    env_files=$(find "$MAIN_ROOT/apps" -maxdepth 2 -type f -name '.env*' -not -name '.env.example' 2>/dev/null || true)
    if [ -n "$env_files" ]; then
      echo "[dry-run] Would copy .env files:"
      echo "$env_files" | while read -r f; do
        local rel="${f#"$MAIN_ROOT"/}"
        echo "  $rel"
      done
    fi
    echo ""
    echo "[dry-run] No changes were made."
    return 0
  fi

  if [ -d "$wt_path" ]; then
    echo "Error: Worktree already exists at $wt_path" >&2
    echo "  To remove it: ./scripts/worktree.sh remove $branch" >&2
    exit 1
  fi

  if [ "$NEW_BRANCH" = true ]; then
    if git rev-parse --verify --quiet "$branch" >/dev/null 2>&1; then
      echo "Error: Branch '$branch' already exists. Omit -b to check out the existing branch." >&2
      exit 1
    fi
    git worktree add -b "$branch" "$wt_path"
  else
    if ! git rev-parse --verify --quiet "$branch" >/dev/null 2>&1; then
      echo "Error: Branch '$branch' does not exist." >&2
      echo "  To create a new branch: ./scripts/worktree.sh -b create $branch" >&2
      echo "  To list local branches:  git branch" >&2
      exit 1
    fi
    git worktree add "$wt_path" "$branch"
  fi

  echo ""
  echo "Running pnpm install..."
  (cd "$wt_path" && pnpm install)

  echo ""
  echo "Copying .env files..."
  local copied=0
  while read -r env_file; do
    local rel="${env_file#"$MAIN_ROOT"/}"
    local dest="$wt_path/$rel"
    local dest_dir
    dest_dir="$(dirname "$dest")"

    if [ -d "$dest_dir" ]; then
      cp "$env_file" "$dest"
      echo "  Copied: $rel"
      copied=$((copied + 1))
    fi
  done < <(find "$MAIN_ROOT/apps" -maxdepth 2 -type f -name '.env*' -not -name '.env.example' 2>/dev/null || true)

  echo ""
  echo "=== Worktree ready ==="
  echo ""
  echo "  Branch: $branch"
  echo "  Path:   $wt_path"
  echo ""
  echo "  cd $wt_path"
  echo ""
}

cmd_remove() {
  local branch="$1"
  local wt_path
  wt_path="$(worktree_path "$branch")"

  echo "Removing worktree for branch: $branch"
  echo "  Path: $wt_path"

  if [ "$DRY_RUN" = true ]; then
    echo ""
    echo "[dry-run] Would run: git worktree remove \"$wt_path\""
    echo "[dry-run] Would run: git worktree prune"
    echo ""
    echo "[dry-run] No changes were made."
    return 0
  fi

  if [ ! -d "$wt_path" ]; then
    echo "Error: No worktree found at $wt_path" >&2
    echo "  Run './scripts/worktree.sh list' to see active worktrees." >&2
    git worktree prune
    exit 1
  fi

  git worktree remove "$wt_path"
  echo "Pruning stale worktree entries..."
  git worktree prune

  echo ""
  echo "Worktree removed: $wt_path"
}

cmd_list() {
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

# Parse global options
while [[ $# -gt 0 ]]; do
  case "$1" in
    -b)
      NEW_BRANCH=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Error: Unknown option '$1'" >&2
      echo "" >&2
      usage >&2
      exit 1
      ;;
    *)
      break
      ;;
  esac
done

if [ $# -lt 1 ]; then
  usage >&2
  exit 1
fi

COMMAND="$1"
shift

case "$COMMAND" in
  create)
    if [ $# -lt 1 ]; then
      echo "Error: 'create' requires a branch name" >&2
      exit 1
    fi
    cmd_create "$1"
    ;;
  remove)
    if [ $# -lt 1 ]; then
      echo "Error: 'remove' requires a branch name" >&2
      exit 1
    fi
    cmd_remove "$1"
    ;;
  list)
    cmd_list
    ;;
  *)
    echo "Error: Unknown command '$COMMAND'" >&2
    echo "" >&2
    usage >&2
    exit 1
    ;;
esac
