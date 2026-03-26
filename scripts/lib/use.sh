#!/bin/bash
#
# scripts/lib/use.sh — reproctl wt use: set the machine-wide active worktree
#
# Sourced by reproctl.sh. Expects common.sh and worktree.sh to be loaded first.
#
# State directory: ~/.repro/  (machine-local, never committed to git)
#   ~/.repro/active   — symlink → <wt-path> (worktree root)
#                       Extension loads from ~/.repro/active/apps/capture/dist

wt_use_usage() {
  cat <<'EOF' >&2
Usage: reproctl wt use [<branch-or-slug>]

Set the machine-wide active worktree. Points ~/.repro/active at the
worktree root directory as a symlink. The Chrome extension can be
loaded permanently from:
  ~/.repro/active/apps/capture/dist

If <branch-or-slug> is omitted and stdin is a terminal, an interactive
picker is shown.

Options:
  -h, --help    Show this help message
EOF
}

cmd_wt_use() {
  local input=""

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help)
        wt_use_usage
        exit 0
        ;;
      -*)
        die "Unknown option: $1\nRun 'reproctl wt use --help' for usage."
        ;;
      *)
        if [[ -n "$input" ]]; then
          die "'wt use' takes at most one argument\nRun 'reproctl wt use --help' for usage."
        fi
        input="$1"
        ;;
    esac
    shift
  done

  # If no argument provided, use interactive picker or die
  if [[ -z "$input" ]]; then
    if [ -t 0 ]; then
      local candidates=()
      while IFS= read -r _line; do candidates+=("$_line"); done < <(_list_worktree_branches)
      local selected
      selected="$(_pick "Select worktree to activate" "${candidates[@]}")" || exit $?
      input="$selected"
    else
      die "'wt use' requires a branch-or-slug argument (stdin is not a terminal)"
    fi
  fi

  # Resolve the worktree path
  local wt_path
  wt_path="$(resolve_worktree "$input")" || true

  if [[ -z "$wt_path" ]] || [[ ! -d "$wt_path" ]]; then
    die "No worktree found for '${input}'.\n\nAvailable worktrees:\n$(_list_available_worktrees)\n\nCreate one: reproctl wt create ${input}"
  fi

  # Derive the slug
  local slug
  if [[ "$wt_path" == "$MAIN_CHECKOUT" ]]; then
    slug="main"
  else
    local basename
    basename="$(basename "$wt_path")"
    slug="${basename#repro-wt-}"
  fi

  # Get the branch name for the worktree
  local branch
  branch="$(_worktree_branch_for_path "$wt_path")" || branch="(unknown)"

  # Create ~/.repro/ if it doesn't exist
  local repro_dir="$HOME/.repro"
  if [[ ! -d "$repro_dir" ]]; then
    mkdir -p "$repro_dir"
  fi

  # Detect first-time setup: was the symlink absent before this call?
  local first_time=false
  if [[ ! -L "$repro_dir/active" ]]; then
    first_time=true
  fi

  # Derive the extension dist path
  local ext_dist="$wt_path/apps/capture/dist"

  local dist_missing=false
  if [[ ! -d "$ext_dist" ]]; then
    dist_missing=true
  fi

  # Point ~/.repro/active at the worktree root (atomic replace on macOS/Linux)
  ln -sfn "$wt_path" "$repro_dir/active"

  # Print confirmation summary
  {
    echo ""
    _ok "Active worktree set"
    echo ""
    printf '  %-18s %s\n' "Slug:"      "$slug"
    printf '  %-18s %s\n' "Branch:"    "$branch"
    printf '  %-18s %s\n' "Extension:" "$repro_dir/active/apps/capture/dist"
    echo ""
  } >&2

  # First-time setup instructions
  if [[ "$first_time" == true ]]; then
    {
      printf '%sFirst-time setup:%s load the extension in Chrome from:\n' "$CLR_BOLD" "$CLR_RESET"
      printf '\n'
      printf 'Go to chrome://extensions → Enable Developer mode → Load unpacked\n'
      printf '  Load from: ~/.repro/active/apps/capture/dist\n'
      printf '\n'
    } >&2
  fi

  # Warn if dist path doesn't exist
  if [[ "$dist_missing" == true ]]; then
    _warn "Extension dist not found at: $ext_dist"
    printf "  Run 'reproctl start capture' (or 'moon run repro/capture:build') to build the extension first.\n" >&2
    echo "" >&2
  fi
}
