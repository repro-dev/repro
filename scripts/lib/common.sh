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
  local slug
  slug="$(slugify "$1")"
  echo "$PARENT_DIR/repro-wt-$slug"
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

resolve_worktree_resource_name() {
  if is_worktree "$REPO_ROOT" && _is_known_service "$1"; then
    local slug
    slug="$(detect_worktree_slug)"
    echo "${1}-wt-${slug}"
  else
    echo "$1"
  fi
}

resolve_worktree_resource_names() {
  for svc in "$@"; do
    resolve_worktree_resource_name "$svc"
  done
}
