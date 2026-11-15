#!/bin/bash
# scripts/lib/worktree_lookup.sh
#
# Branch -> worktree path lookup, sourced by common.sh (worktree_path) and
# worktree.sh. Kept in its own file so both can share one definition without
# common.sh being sourced by worktree.sh (its tests rely on that).

# Second arg scopes the git lookup (defaults to "."). Callers that must not
# depend on the current directory (e.g. the issue resolver, deliver's dry-run)
# pass "$REPO_ROOT".
_worktree_path_for_branch() {
  local target="$1"
  local git_cwd="${2:-.}"
  local wt_path="" wt_branch=""
  while IFS= read -r line; do
    case "$line" in
      worktree\ *) wt_path="${line#worktree }" ;;
      branch\ *)   wt_branch="${line#branch }"; wt_branch="${wt_branch#refs/heads/}" ;;
      "")
        if [[ "$wt_branch" == "$target" ]]; then
          echo "$wt_path"
          return 0
        fi
        wt_path="" wt_branch=""
        ;;
    esac
  done < <(git -C "$git_cwd" worktree list --porcelain)
  if [[ "$wt_branch" == "$target" ]]; then
    echo "$wt_path"
    return 0
  fi

  return 1
}
