#!/bin/bash
#
# scripts/lib/context.sh — show current development context
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh to be loaded
# first (provides REPO_ROOT, MAIN_CHECKOUT, CONFIG_FILE, CLR_*,
# is_worktree, detect_worktree_slug).

_extract_issue_id() {
  local branch="$1"
  local id
  id="$(printf '%s' "$branch" | sed -n 's|.*[/-]\(REP-[0-9]\{1,\}\).*|\1|p' | head -1)"
  if [ -n "$id" ]; then
    echo "$id"
  fi
}

_commit_delta() {
  local ahead behind
  ahead="$(git -C "$REPO_ROOT" rev-list --count main..HEAD 2>/dev/null)" || return 1
  behind="$(git -C "$REPO_ROOT" rev-list --count HEAD..main 2>/dev/null)" || return 1
  echo "${ahead} ahead, ${behind} behind main"
}

_context_services() {
  local slug="${1:-}"
  if [ ! -f "$CONFIG_FILE" ]; then
    return
  fi

  local names
  names="$(python3 -c '
import json, sys
data = json.load(sys.stdin)
slug = sys.argv[1]
matches = [s["name"] for s in data.get("services", []) if s.get("slug", "") == slug]
if matches:
    print(", ".join(matches))
' "$slug" < "$CONFIG_FILE" 2>/dev/null)"

  if [ -n "$names" ]; then
    echo "$names"
  fi
}

_context_json() {
  local branch="$1"
  local ctx_type="main"
  local slug=""

  if is_worktree "$REPO_ROOT"; then
    ctx_type="worktree"
    slug="$(detect_worktree_slug)"
  fi

  local issue_id
  issue_id="$(_extract_issue_id "$branch")"

  local ahead="" behind=""
  ahead="$(git -C "$REPO_ROOT" rev-list --count main..HEAD 2>/dev/null)" || ahead=""
  behind="$(git -C "$REPO_ROOT" rev-list --count HEAD..main 2>/dev/null)" || behind=""

  local services_csv
  services_csv="$(_context_services "$slug")"

  local active_slug=""
  local _active_target
  _active_target="$(readlink "$HOME/.repro/active" 2>/dev/null || true)"
  if [[ -n "$_active_target" ]]; then
    local _active_base
    _active_base="$(basename "$_active_target")"
    if [[ "$_active_base" == repro-wt-* ]]; then
      active_slug="${_active_base#repro-wt-}"
    else
      active_slug="main"
    fi
  fi

  python3 -c '
import json, sys
obj = {"type": sys.argv[1], "branch": sys.argv[2], "path": sys.argv[3]}
if sys.argv[4]:
    obj["worktree"] = sys.argv[4]
if sys.argv[5]:
    obj["issue"] = sys.argv[5]
svcs = [s.strip() for s in sys.argv[6].split(",") if s.strip()] if sys.argv[6] else []
obj["services"] = svcs
if sys.argv[7]:
    obj["ahead"] = int(sys.argv[7])
if sys.argv[8]:
    obj["behind"] = int(sys.argv[8])
if sys.argv[9]:
    obj["active"] = sys.argv[9]
print(json.dumps(obj))
' "$ctx_type" "$branch" "$REPO_ROOT" "$slug" "$issue_id" "$services_csv" "$ahead" "$behind" "$active_slug"
}

cmd_context() {
  local branch
  branch="$(git -C "$REPO_ROOT" symbolic-ref -q --short HEAD 2>/dev/null)" || \
    branch="(detached: $(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo 'unknown'))"

  _debug "detected branch: $branch"

  if [ "${REPROCTL_JSON:-false}" = true ]; then
    _context_json "$branch"
    return
  fi

  local labels=() values=()

  # Read machine-wide active worktree slug (if set)
  local active_slug=""
  local _active_target
  _active_target="$(readlink "$HOME/.repro/active" 2>/dev/null || true)"
  if [[ -n "$_active_target" ]]; then
    local _active_base
    _active_base="$(basename "$_active_target")"
    if [[ "$_active_base" == repro-wt-* ]]; then
      active_slug="${_active_base#repro-wt-}"
    else
      active_slug="main"
    fi
  fi

  if is_worktree "$REPO_ROOT"; then
    local slug
    slug="$(detect_worktree_slug)"

    labels+=("Worktree:") ; values+=("$slug")
    labels+=("Branch:")   ; values+=("$branch")
    labels+=("Path:")     ; values+=("$REPO_ROOT")
    labels+=("Main:")     ; values+=("$MAIN_CHECKOUT")

    local issue_id
    issue_id="$(_extract_issue_id "$branch")"
    if [ -n "$issue_id" ]; then
      labels+=("Issue:") ; values+=("$issue_id")
    fi

    local delta
    delta="$(_commit_delta)"
    if [ -n "$delta" ]; then
      labels+=("vs main:") ; values+=("$delta")
    fi

    if [ -n "${REPRO_WORKTREE:-}" ]; then
      labels+=("Session:") ; values+=("attached (subshell)")
    fi

    local services
    services="$(_context_services "$slug")"
    if [ -n "$services" ]; then
      labels+=("Services:") ; values+=("$services")
    fi

    # Show active worktree from ~/.repro/active
    if [ -n "$active_slug" ]; then
      if [ "$active_slug" = "$slug" ]; then
        labels+=("Active:") ; values+=("$active_slug (this worktree)")
      else
        labels+=("Active:") ; values+=("$active_slug")
      fi
    fi
  else
    echo "${CLR_BOLD}Main checkout${CLR_RESET}"

    labels+=("Branch:") ; values+=("$branch")
    labels+=("Path:")   ; values+=("$REPO_ROOT")

    local issue_id
    issue_id="$(_extract_issue_id "$branch")"
    if [ -n "$issue_id" ]; then
      labels+=("Issue:") ; values+=("$issue_id")
    fi

    local delta
    delta="$(_commit_delta)"
    if [ -n "$delta" ]; then
      labels+=("vs main:") ; values+=("$delta")
    fi

    local services
    services="$(_context_services "")"
    if [ -n "$services" ]; then
      labels+=("Services:") ; values+=("$services")
    fi

    # Show active worktree from ~/.repro/active
    if [ -n "$active_slug" ]; then
      labels+=("Active:") ; values+=("$active_slug")
    fi
  fi

  local w
  w="$(_label_width "${labels[@]}")"
  local i=0
  while [ "$i" -lt "${#labels[@]}" ]; do
    _kv "$w" "${labels[$i]}" "${values[$i]}"
    i=$((i + 1))
  done
}
