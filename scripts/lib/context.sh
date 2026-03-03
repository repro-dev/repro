cmd_context() {
  if is_worktree "$REPO_ROOT"; then
    local slug branch

    slug="$(detect_worktree_slug)"

    branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(unknown)")"

    echo "${CLR_BOLD}Worktree:${CLR_RESET}  $slug"
    echo "${CLR_BOLD}Branch:${CLR_RESET}    $branch"
    echo "${CLR_BOLD}Path:${CLR_RESET}      $REPO_ROOT"

    if [ -n "${REPRO_WORKTREE:-}" ]; then
      echo "${CLR_BOLD}Session:${CLR_RESET}   attached (subshell)"
    fi
  else
    local branch
    branch="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(unknown)")"

    echo "${CLR_BOLD}Main checkout${CLR_RESET}"
    echo "${CLR_BOLD}Branch:${CLR_RESET}  $branch"
    echo "${CLR_BOLD}Path:${CLR_RESET}    $REPO_ROOT"
  fi
}
