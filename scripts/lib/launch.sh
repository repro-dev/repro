#!/bin/bash
#
# scripts/lib/launch.sh — open a service URL in the browser
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh to be loaded
# first (provides REPO_ROOT, is_worktree, detect_worktree_slug, die).

_portless_service_url() {
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

  echo "http://${host}:1355"
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
  _portless_service_url "$@" 2>/dev/null && return 0
  _local_service_url "$@" 2>/dev/null && return 0
  return 1
}

_playwright_chromium_bin() {
  local repo_root="$REPO_ROOT"
  local bin
  bin="$(node -e "
try {
  const {chromium} = require('$repo_root/node_modules/@playwright/test');
  process.stdout.write(chromium.executablePath());
} catch(e) {
  process.exit(1);
}
" 2>/dev/null)" || return 1
  if [[ ! -x "$bin" ]]; then
    return 1
  fi
  echo "$bin"
}

# Ensure Playwright Chromium is installed, downloading it if needed.
_ensure_playwright_chromium() {
  local bin
  bin="$(_playwright_chromium_bin 2>/dev/null)" && echo "$bin" && return 0

  printf 'Playwright Chromium not found — installing now...\n' >&2
  (cd "$REPO_ROOT" && pnpm exec playwright install chromium) >&2 || \
    die "Failed to install Playwright Chromium. Run manually: pnpm exec playwright install chromium"

  bin="$(_playwright_chromium_bin 2>/dev/null)" || \
    die "Playwright Chromium still not found after install. Check: pnpm exec playwright install chromium"
  echo "$bin"
}

_launchable_services() {
  local services=()
  services=(workspace api-server admin capture)

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
          "  admin          Admin panel    (admin.repro.localhost)" \
          "  capture        Chrome extension  (Playwright Chromium + --load-extension)"
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
    service="$(_pick "Select a service" "${candidates[@]}")" || exit $?
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

  # Special case: launch capture extension in Playwright Chromium
  if [[ "$service" == "capture" ]]; then
    local chromium_bin
    chromium_bin="$(_ensure_playwright_chromium)"

    local ext_dist="$REPO_ROOT/apps/capture/dist"
    if [[ -n "$slug" ]] && [[ "$slug" != "main" ]]; then
      local capture_wt_path
      capture_wt_path="$(worktree_path "$slug")"
      ext_dist="$capture_wt_path/apps/capture/dist"
    fi

    if [[ ! -d "$ext_dist" ]]; then
      _warn "Extension dist not found at: $ext_dist"
      printf "  Run 'moon run capture:build' to build the extension first.\n" >&2
    fi

    local profile_dir="$HOME/.repro/browser-profiles/${slug:-main}"
    mkdir -p "$profile_dir"

    # Resolve workspace URL — prefer the worktree-specific URL if that worktree's
    # workspace service is currently running (per reproctl_services.json), otherwise
    # fall back to the main checkout URL so the browser opens to a working page.
    local workspace_url workspace_url_note=""
    workspace_url="$(_service_url workspace "$slug" 2>/dev/null)" || workspace_url=""
    if [[ -n "$workspace_url" ]] && [[ -n "$slug" ]] && [[ "$slug" != "main" ]]; then
      local _wt_running=false
      if [[ -f "$CONFIG_FILE" ]]; then
        local _config _svc_names
        _config="$(cat "$CONFIG_FILE")"
        _svc_names="$(python3 "$SCRIPTS_DIR/lib/py/worktree_services.py" "$_config" "$slug" 2>/dev/null || true)"
        case ",$_svc_names," in
          *,workspace,*) _wt_running=true ;;
        esac
      fi
      if [[ "$_wt_running" == false ]]; then
        local fallback_url
        fallback_url="$(_service_url workspace "" 2>/dev/null)" || fallback_url=""
        if [[ -n "$fallback_url" ]]; then
          workspace_url="$fallback_url"
          workspace_url_note=" (worktree not running, using main)"
        fi
      fi
    fi

    {
      echo ""
      _ok "Launching Chromium with capture extension"
      echo ""
      printf '  %-16s %s\n' "Extension:" "$ext_dist"
      printf '  %-16s %s\n' "Profile:"   "$profile_dir"
      if [[ -n "$workspace_url" ]]; then
        printf '  %-16s %s%s\n' "URL:" "$workspace_url" "$workspace_url_note"
      fi
      echo ""
    } >&2

    "$chromium_bin" \
      --user-data-dir="$profile_dir" \
      --load-extension="$ext_dist" \
      --no-first-run \
      ${workspace_url:+"$workspace_url"} \
      >/dev/null 2>&1 &
    disown

    return 0
  fi

  local url
  url="$(_service_url "$service" "$slug")" || {
    local available
    available="$(printf '%s' "$(_launchable_services)" | tr '\n' ',' | sed 's/,/, /g; s/, $//')"
    die "Unknown service: $service\nAvailable services: $available"
  }

  # Auto-start the service if it is not already registered in the running config.
  # This makes `launch` idempotent — it starts the service when needed, and is a
  # no-op when it is already running.
  local _svc_is_running=false
  local _check_slug="${slug:-}"
  if [[ -f "$CONFIG_FILE" ]]; then
    local _config _svc_names
    _config="$(cat "$CONFIG_FILE")"
    _svc_names="$(python3 "$SCRIPTS_DIR/lib/py/worktree_services.py" "$_config" "$_check_slug" 2>/dev/null || true)"
    case ",$_svc_names," in
      *,"$service",*) _svc_is_running=true ;;
    esac
  fi
  if [[ "$_svc_is_running" == false ]]; then
    echo "Service '$service' is not running — starting it now..." >&2
    cmd_start "$service"
  fi

  echo "Opening $url"
  open "$url"
} >&2
