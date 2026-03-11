#!/bin/bash
#
# scripts/lib/common.sh — shared utilities for reproctl
#
# Sourced by reproctl.sh and its sub-libraries. Provides context
# detection, error handling, and string helpers used across all
# subcommands.

# ── Colour ──────────────────────────────────────────────────────────
#
# Respect NO_COLOR (https://no-color.org/) and non-interactive
# terminals by falling back to empty strings.

if [ -z "${NO_COLOR:-}" ] && [ -t 1 ]; then
  CLR_BOLD=$'\033[1m'
  CLR_DIM=$'\033[2m'
  CLR_RED=$'\033[31m'
  CLR_GREEN=$'\033[32m'
  CLR_YELLOW=$'\033[33m'
  CLR_RESET=$'\033[0m'
else
  CLR_BOLD=""
  CLR_DIM=""
  CLR_RED=""
  CLR_GREEN=""
  CLR_YELLOW=""
  CLR_RESET=""
fi

# ── Output helpers ──────────────────────────────────────────────────

_step() {
  local current="$1" total="$2" msg="$3"
  printf '%s[%d/%d]%s %s\n' "$CLR_BOLD" "$current" "$total" "$CLR_RESET" "$msg"
}

_ok() {
  printf '%s✔ %s%s\n' "$CLR_GREEN" "$1" "$CLR_RESET"
}

_err() {
  printf '%s✖ %s%s\n' "$CLR_RED" "$1" "$CLR_RESET" >&2
}

# ── Error handling ──────────────────────────────────────────────────

die() {
  printf 'Error: %b\n' "$*" >&2
  exit 1
}

# ── String helpers ──────────────────────────────────────────────────

slugify() {
  printf '%s\n' "$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'
}

# ── Context detection ───────────────────────────────────────────────
#
# REPO_ROOT is the git toplevel of the current working directory —
# either the main checkout or a worktree. MAIN_CHECKOUT is always the
# main checkout (first entry from `git worktree list`). We derive paths
# for repo-specific assets from REPO_ROOT, and shared state from
# MAIN_CHECKOUT so every script works identically regardless of which
# checkout invokes it.

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || {
  die "Not inside a git repository. Run reproctl from within the repro checkout."
}

is_worktree() {
  [ -f "$1/.git" ]
}

if is_worktree "$REPO_ROOT"; then
  MAIN_CHECKOUT="$(git -C "$REPO_ROOT" worktree list --porcelain | awk '/^worktree /{print substr($0,10); exit}')"
else
  MAIN_CHECKOUT="$REPO_ROOT"
fi

PARENT_DIR="$(dirname "$MAIN_CHECKOUT")"
INFRA_DIR="$MAIN_CHECKOUT/infra"
SCRIPTS_DIR="$REPO_ROOT/scripts"
SERVICES_JSON="$INFRA_DIR/services.json"
TMP_DIR="$MAIN_CHECKOUT/tmp"
CONFIG_FILE="$TMP_DIR/reproctl_services.json"
TILT_PID_FILE="$TMP_DIR/tilt.pid"
TILT_LOG_FILE="$TMP_DIR/tilt.log"
TILT_PORT="${TILT_PORT:-10350}"

detect_worktree_slug() {
  local basename
  basename="$(basename "$REPO_ROOT")"
  if [[ "$basename" == repro-wt-* ]]; then
    echo "${basename#repro-wt-}"
  else
    echo "$basename"
  fi
}

worktree_path() {
  echo "$PARENT_DIR/repro-wt-$1"
}

# ── Worktree-aware resource resolution ──────────────────────────────
#
# Maps a resource name to its Tilt resource name, appending the
# worktree slug suffix when running from a worktree checkout —
# but ONLY for names that correspond to services defined in
# services.json.  Shared infra resources (database, storage,
# ingress-controller, etc.) are never suffixed.
#
# Usage: resolve_worktree_resource_name <name>
#        resolve_worktree_resource_names <name> [<name>...]

_is_known_service() {
  [ -f "$SERVICES_JSON" ] || return 1
  python3 "$SCRIPTS_DIR/lib/py/is_known_service.py" "$1" "$SERVICES_JSON"
}

_wt_name() {
  python3 "$SCRIPTS_DIR/lib/py/wt_name.py" "$1" "$2"
}

resolve_worktree_resource_name() {
  if is_worktree "$REPO_ROOT" && _is_known_service "$1"; then
    local slug
    slug="$(detect_worktree_slug)"
    _wt_name "$1" "$slug"
  else
    echo "$1"
  fi
}

resolve_worktree_resource_names() {
  for svc in "$@"; do
    resolve_worktree_resource_name "$svc"
  done
}

# ── Interactive picker ──────────────────────────────────────────────
#
# _pick <prompt> [candidates...]
#
# Reads candidate lines from arguments (one per arg).  If fzf is
# available, launches it with the given prompt.  Otherwise, falls back
# to a numbered prompt on the terminal.
#
# Prints the selected value to stdout.  Returns 1 if the user cancels
# or if there are no candidates.
#
# Usage:
#   selected="$(_pick "Select a service" "${services[@]}")" || exit 1

_pick() {
  local prompt="$1"
  shift

  if [[ $# -eq 0 ]]; then
    _err "No candidates available."
    return 1
  fi

  if [[ $# -eq 1 ]]; then
    echo "$1"
    return 0
  fi

  # fzf path
  if command -v fzf > /dev/null 2>&1; then
    local selected
    selected="$(printf '%s\n' "$@" | fzf --prompt="$prompt: " --height=~15 --reverse)" || return 1
    [[ -n "$selected" ]] || return 1
    echo "$selected"
    return 0
  fi

  # Numbered-prompt fallback (requires a terminal)
  if [[ ! -t 0 ]]; then
    _err "Cannot show interactive picker: stdin is not a terminal and fzf is not installed."
    return 1
  fi

  echo "" >&2
  echo "${CLR_BOLD}${prompt}:${CLR_RESET}" >&2
  local i=1
  for item in "$@"; do
    printf '  %s%d)%s %s\n' "$CLR_DIM" "$i" "$CLR_RESET" "$item" >&2
    i=$((i + 1))
  done
  echo "" >&2

  local choice
  read -r -p "Enter number (1-$#): " choice </dev/tty
  if [[ ! "$choice" =~ ^[0-9]+$ ]] || [[ "$choice" -lt 1 ]] || [[ "$choice" -gt $# ]]; then
    _err "Invalid selection."
    return 1
  fi

  local idx=$((choice))
  local j=1
  for item in "$@"; do
    if [[ $j -eq $idx ]]; then
      echo "$item"
      return 0
    fi
    j=$((j + 1))
  done

  return 1
}

# _pick_multi <prompt> [candidates...]
#
# Multi-select variant of _pick.  Prints one selected value per line to
# stdout.  Returns 1 if the user cancels or selects nothing.
#
# With fzf: uses --multi (Tab to toggle, Enter to confirm).
# Fallback: accepts a comma-separated list of numbers.
#
# Usage:
#   local selected=()
#   while IFS= read -r _l; do selected+=("$_l"); done < <(_pick_multi "Select services" "${svcs[@]}")

_pick_multi() {
  local prompt="$1"
  shift

  if [[ $# -eq 0 ]]; then
    _err "No candidates available."
    return 1
  fi

  if [[ $# -eq 1 ]]; then
    echo "$1"
    return 0
  fi

  # fzf path (multi-select)
  if command -v fzf > /dev/null 2>&1; then
    local selected
    selected="$(printf '%s\n' "$@" | fzf --prompt="$prompt: " --height=~15 --reverse --multi)" || return 1
    [[ -n "$selected" ]] || return 1
    echo "$selected"
    return 0
  fi

  # Numbered-prompt fallback (requires a terminal)
  if [[ ! -t 0 ]]; then
    _err "Cannot show interactive picker: stdin is not a terminal and fzf is not installed."
    return 1
  fi

  echo "" >&2
  echo "${CLR_BOLD}${prompt}:${CLR_RESET}" >&2
  local i=1
  for item in "$@"; do
    printf '  %s%d)%s %s\n' "$CLR_DIM" "$i" "$CLR_RESET" "$item" >&2
    i=$((i + 1))
  done
  echo "" >&2

  local choices
  read -r -p "Enter numbers separated by commas (1-$#): " choices </dev/tty
  [[ -n "$choices" ]] || return 1

  local IFS=','
  local found=false
  for choice in $choices; do
    choice="${choice// /}"  # trim spaces
    if [[ ! "$choice" =~ ^[0-9]+$ ]] || [[ "$choice" -lt 1 ]] || [[ "$choice" -gt $# ]]; then
      _err "Invalid selection: $choice"
      return 1
    fi
    local j=1
    for item in "$@"; do
      if [[ $j -eq $choice ]]; then
        echo "$item"
        found=true
        break
      fi
      j=$((j + 1))
    done
  done

  [[ "$found" = true ]] || return 1
}

_list_service_names() {
  [[ -f "$SERVICES_JSON" ]] || return
  python3 -c "import json,sys; print('\n'.join(json.load(open(sys.argv[1])).keys()))" "$SERVICES_JSON" 2>/dev/null
}

_list_worktree_branches() {
  git worktree list --porcelain 2>/dev/null \
    | awk '/^branch refs\/heads\//{sub(/^branch refs\/heads\//, ""); print}'
}
