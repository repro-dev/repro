#!/bin/bash
#
# scripts/lib/launch.sh — open a service URL in the browser
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh to be loaded
# first (provides REPO_ROOT, is_worktree, detect_worktree_slug, die).

_ingress_service_url() {
  local service="$1" slug="$2"
  local host

  case "$service" in
    workspace)
      if [[ -n "$slug" ]]; then
        host="app.wt-${slug}.repro.localhost"
      else
        host="app.repro.localhost"
      fi
      ;;
    api-server)
      if [[ -n "$slug" ]]; then
        host="api.wt-${slug}.repro.localhost"
      else
        host="api.repro.localhost"
      fi
      ;;
    admin)
      if [[ -n "$slug" ]]; then
        host="admin.wt-${slug}.repro.localhost"
      else
        host="admin.repro.localhost"
      fi
      ;;
    *)
      return 1
      ;;
  esac

  echo "http://${host}"
}

_local_service_url() {
  local service="$1" slug="$2"
  local url
  if [[ -n "$slug" ]]; then
    url="$(python3 "$SCRIPTS_DIR/lib/py/local_service_url.py" "$service" "$SERVICES_JSON" "$slug" 2>/dev/null)"
  else
    url="$(python3 "$SCRIPTS_DIR/lib/py/local_service_url.py" "$service" "$SERVICES_JSON" 2>/dev/null)"
  fi
  [[ -n "$url" ]] || return 1
  echo "$url"
}

_service_url() {
  _ingress_service_url "$@" 2>/dev/null && return 0
  _local_service_url "$@" 2>/dev/null && return 0
  return 1
}

_launchable_services() {
  local services=()
  services=(workspace api-server admin)

  if [[ -f "$SERVICES_JSON" ]]; then
    local line
    while IFS= read -r line; do
      [[ -n "$line" ]] && services+=("$line")
    done < <(python3 "$SCRIPTS_DIR/lib/py/launchable_local_services.py" "$SERVICES_JSON" 2>/dev/null)
  fi

  printf '%s\n' "${services[@]}"
}

cmd_launch() {
  local service=""
  local worktree_flag=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --worktree|-w)
        [[ -n "${2:-}" ]] || die "Missing value for $1"
        worktree_flag="$2"
        shift 2
        ;;
      -h|--help)
        printf '%s\n' \
          "Usage: reproctl launch <service> [--worktree <branch>]" \
          "" \
          "Open the browser at the URL for a service in the current (or specified)" \
          "worktree context." \
          "" \
          "Services:" \
          "  workspace      App frontend   (app.repro.localhost)" \
          "  api-server     API backend    (api.repro.localhost)" \
          "  admin          Admin panel    (admin.repro.localhost)"
        if [[ -f "$SERVICES_JSON" ]]; then
          local line
          while IFS= read -r line; do
            [[ -n "$line" ]] && printf '  %-14s Local service  (localhost)\n' "$line"
          done < <(python3 "$SCRIPTS_DIR/lib/py/launchable_local_services.py" "$SERVICES_JSON" 2>/dev/null)
        fi
        printf '%s\n' \
          "" \
          "Options:" \
          "  --worktree, -w <branch>   Target a specific worktree instead of the" \
          "                            current working directory context" \
          "" \
          "Examples:" \
          "  reproctl launch workspace" \
          "  reproctl launch api-server --worktree feat/my-feature"
        return 0
        ;;
      -*)
        die "Unknown option: $1\nRun 'reproctl launch --help' for usage."
        ;;
      *)
        if [[ -z "$service" ]]; then
          service="$1"
        else
          die "Unexpected argument: $1\nRun 'reproctl launch --help' for usage."
        fi
        shift
        ;;
    esac
  done

  if [[ -z "$service" ]]; then
    local candidates=()
    while IFS= read -r line; do
      [[ -n "$line" ]] && candidates+=("$line")
    done < <(_launchable_services)
    service="$(_pick "Select a service" "${candidates[@]}")" || exit 1
  fi

  local slug=""

  if [[ -n "$worktree_flag" ]]; then
    local wt_path
    wt_path="$(resolve_worktree "$worktree_flag")" || \
      die "No worktree found for '$worktree_flag'.\nRun 'reproctl worktree list' to see available worktrees."
    if is_worktree "$wt_path"; then
      local basename
      basename="$(basename "$wt_path")"
      slug="${basename#repro-wt-}"
    fi
  elif is_worktree "$REPO_ROOT"; then
    slug="$(detect_worktree_slug)"
  fi

  local url
  url="$(_service_url "$service" "$slug")" || {
    local available
    available="$(printf '%s' "$(_launchable_services)" | tr '\n' ',' | sed 's/,/, /g; s/, $//')"
    die "Unknown service: $service\nAvailable services: $available"
  }

  echo "Opening $url"
  open "$url"
} >&2
