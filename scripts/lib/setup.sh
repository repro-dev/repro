#!/bin/bash
#
# scripts/lib/setup.sh — environment bootstrap and diagnostics
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh and
# scripts/lib/cluster.sh to be loaded first.

# ── Doctor output helpers ───────────────────────────────────────────

_doctor_statuses=()
_doctor_names=()
_doctor_details=()

_doctor_row() {
  _doctor_statuses+=("$1")
  _doctor_names+=("$2")
  _doctor_details+=("$3")
}

_doctor_flush() {
  local sw nw
  sw="$(_label_width "${_doctor_statuses[@]}")"
  nw="$(_label_width "${_doctor_names[@]}")"

  i=0
  while [ "$i" -lt "${#_doctor_names[@]}" ]; do
    local status="${_doctor_statuses[$i]}"
    local pad=""
    local j=${#status}
    while [ "$j" -lt "$sw" ]; do
      pad="$pad "
      j=$((j + 1))
    done
    local clr
    clr="$(_status_clr "$status")"
    printf '  %s%s  %-*s  %s\n' \
      "$pad" "$clr" \
      "$nw" "${_doctor_names[$i]}" \
      "${_doctor_details[$i]}"
    i=$((i + 1))
  done

  _doctor_statuses=()
  _doctor_names=()
  _doctor_details=()
} >&2

_doctor_items=()

_doctor_add() {
  local name="$1" status="$2"
  shift 2
  local expected="" actual="" message=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --expected) expected="$2"; shift 2 ;;
      --actual)   actual="$2"; shift 2 ;;
      --message)  message="$2"; shift 2 ;;
      *)          shift ;;
    esac
  done
  _doctor_items+=("$(python3 -c '
import json, sys
obj = {"name": sys.argv[1], "status": sys.argv[2]}
if sys.argv[3]: obj["expected"] = sys.argv[3]
if sys.argv[4]: obj["actual"] = sys.argv[4]
if sys.argv[5]: obj["message"] = sys.argv[5]
print(json.dumps(obj))
' "$name" "$status" "$expected" "$actual" "$message")")
}

# ── .prototools parser ──────────────────────────────────────────────

read_prototools_version() {
  local tool="$1"
  local prototools="$MAIN_CHECKOUT/.prototools"
  if [ ! -f "$prototools" ]; then
    return 1
  fi
  awk -F' *= *' -v tool="$tool" '
    /^\[/ { exit }
    {
      gsub(/^"|"$/, "", $1)
      gsub(/^"|"$/, "", $2)
      if ($1 == tool || $1 == "asdf:" tool) print $2
    }
  ' "$prototools" | head -1
}

# ── Setup command ───────────────────────────────────────────────────

cmd_setup() {
  local args=()

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --skip-cluster) args+=("--no-cluster"); shift ;;
      -h|--help)
        cat <<'EOF'
Usage: reproctl setup [options]

Bootstrap the local development environment. Delegates to
scripts/bootstrap.sh which handles the full dependency chain.

Options:
  --skip-cluster    Skip kind cluster creation

Run './scripts/bootstrap.sh --help' for full details.
EOF
        return 0
        ;;
      *)
        die "Unknown option: $1\nRun 'reproctl setup --help' for usage."
        ;;
    esac
  done

  exec "$SCRIPTS_DIR/bootstrap.sh" "${args[@]}"
}

# ── Doctor command ──────────────────────────────────────────────────

cmd_doctor() {
  local has_failures=false
  local has_warnings=false
  local json_mode="${REPROCTL_JSON:-false}"
  _doctor_items=()

  if [ "$json_mode" != true ]; then
    echo "Checking development environment..." >&2
    echo "" >&2
  fi

  if command -v brew > /dev/null 2>&1; then
    local brew_version
    brew_version="$(brew --version 2>/dev/null | head -1)"
    [ "$json_mode" != true ] && _doctor_row "ok" "brew" "$brew_version"
    _doctor_add "brew" "ok" --actual "$brew_version"
  else
    [ "$json_mode" != true ] && _doctor_row "error" "brew" "not installed — https://brew.sh"
    _doctor_add "brew" "fail" --message "not installed — https://brew.sh"
    has_failures=true
  fi

  local brew_deps=("direnv" "kind" "pandoc" "postgresql@17")
  for dep in "${brew_deps[@]}"; do
    if command -v brew > /dev/null 2>&1 && brew list "$dep" > /dev/null 2>&1; then
      local dep_version
      dep_version="$(brew list --versions "$dep" 2>/dev/null | awk '{print $2}')"
      [ "$json_mode" != true ] && _doctor_row "ok" "$dep" "${dep_version:-installed}"
      _doctor_add "$dep" "ok" --actual "${dep_version:-installed}"
    else
      [ "$json_mode" != true ] && _doctor_row "error" "$dep" "not installed — run 'reproctl setup'"
      _doctor_add "$dep" "fail" --message "not installed — run 'reproctl setup'"
      has_failures=true
    fi
  done

  if command -v proto > /dev/null 2>&1; then
    local proto_version
    proto_version="$(proto --version 2>/dev/null | awk '{print $NF}')"
    local expected_proto
    expected_proto="$(read_prototools_version proto)"
    if [ -n "$expected_proto" ] && [ "$proto_version" != "$expected_proto" ]; then
      [ "$json_mode" != true ] && _doctor_row "warn" "proto" "$proto_version (expected $expected_proto)"
      _doctor_add "proto" "warn" --expected "$expected_proto" --actual "$proto_version"
      has_warnings=true
    else
      [ "$json_mode" != true ] && _doctor_row "ok" "proto" "$proto_version"
      _doctor_add "proto" "ok" --actual "$proto_version"
    fi
  else
    [ "$json_mode" != true ] && _doctor_row "error" "proto" "not installed — run 'reproctl setup'"
    _doctor_add "proto" "fail" --message "not installed — run 'reproctl setup'"
    has_failures=true
  fi

  local proto_tools=("node" "pnpm" "moon" "tilt" "helm" "ctlptl")
  for tool in "${proto_tools[@]}"; do
    local expected
    expected="$(read_prototools_version "$tool")"

    if ! command -v "$tool" > /dev/null 2>&1; then
      [ "$json_mode" != true ] && _doctor_row "error" "$tool" "not installed — run 'reproctl setup'"
      _doctor_add "$tool" "fail" --message "not installed — run 'reproctl setup'"
      has_failures=true
      continue
    fi

    local actual=""
    case "$tool" in
      node)   actual="$(node --version 2>/dev/null | sed 's/^v//')" ;;
      pnpm)   actual="$(pnpm --version 2>/dev/null)" ;;
      moon)   actual="$(moon --version 2>/dev/null | awk '{print $NF}')" ;;
      tilt)   actual="$(tilt version 2>/dev/null | sed 's/^v//; s/,.*//')" ;;
      helm)   actual="$(helm version --short 2>/dev/null | sed 's/^v//; s/+.*//')" ;;
      ctlptl) actual="$(ctlptl version 2>/dev/null | sed 's/^v//; s/,.*//')" ;;
    esac

    if [ -n "$expected" ] && [ -n "$actual" ] && [ "$actual" != "$expected" ]; then
      [ "$json_mode" != true ] && _doctor_row "warn" "$tool" "v$actual (expected v$expected) — run 'reproctl setup'"
      _doctor_add "$tool" "warn" --expected "$expected" --actual "$actual"
      has_warnings=true
    else
      [ "$json_mode" != true ] && _doctor_row "ok" "$tool" "v${actual:-unknown}"
      _doctor_add "$tool" "ok" --actual "${actual:-unknown}"
    fi
  done

  if command -v docker > /dev/null 2>&1; then
    if docker info > /dev/null 2>&1; then
      local docker_version
      docker_version="$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")"
      [ "$json_mode" != true ] && _doctor_row "ok" "docker" "Docker $docker_version, daemon running"
      _doctor_add "docker" "ok" --actual "$docker_version"
    else
      [ "$json_mode" != true ] && _doctor_row "error" "docker" "daemon not running — start Docker Desktop"
      _doctor_add "docker" "fail" --message "daemon not running — start Docker Desktop"
      has_failures=true
    fi
  else
    [ "$json_mode" != true ] && _doctor_row "error" "docker" "not installed — https://www.docker.com/products/docker-desktop"
    _doctor_add "docker" "fail" --message "not installed — https://www.docker.com/products/docker-desktop"
    has_failures=true
  fi

  if [ -d "$MAIN_CHECKOUT/node_modules" ]; then
    if [ -f "$MAIN_CHECKOUT/node_modules/.package-lock.json" ] || [ -f "$MAIN_CHECKOUT/node_modules/.modules.yaml" ]; then
      if [ "$MAIN_CHECKOUT/pnpm-lock.yaml" -nt "$MAIN_CHECKOUT/node_modules/.modules.yaml" ] 2>/dev/null; then
        [ "$json_mode" != true ] && _doctor_row "warn" "pnpm install" "node_modules may be out of date — run 'reproctl setup'"
        _doctor_add "pnpm install" "warn" --message "node_modules may be out of date — run 'reproctl setup'"
        has_warnings=true
      else
        [ "$json_mode" != true ] && _doctor_row "ok" "pnpm install" "node_modules present"
        _doctor_add "pnpm install" "ok"
      fi
    else
      [ "$json_mode" != true ] && _doctor_row "ok" "pnpm install" "node_modules present"
      _doctor_add "pnpm install" "ok"
    fi
  else
    [ "$json_mode" != true ] && _doctor_row "error" "pnpm install" "node_modules missing — run 'reproctl setup'"
    _doctor_add "pnpm install" "fail" --message "node_modules missing — run 'reproctl setup'"
    has_failures=true
  fi

  if [[ -n "${LINEAR_API_KEY:-}" ]]; then
    if [[ "$LINEAR_API_KEY" == lin_api_* ]]; then
      [ "$json_mode" != true ] && _doctor_row "ok" "LINEAR_API_KEY" "set"
      _doctor_add "LINEAR_API_KEY" "ok"
    else
      [ "$json_mode" != true ] && _doctor_row "warn" "LINEAR_API_KEY" "set but does not start with lin_api_ — may be invalid"
      _doctor_add "LINEAR_API_KEY" "warn" --message "set but does not start with lin_api_ — may be invalid"
      has_warnings=true
    fi
  else
    [ "$json_mode" != true ] && _doctor_row "warn" "LINEAR_API_KEY" "not set — wt create --from-issue will not fetch issue details"
    _doctor_add "LINEAR_API_KEY" "warn" --message "not set — wt create --from-issue will not fetch issue details"
    has_warnings=true
  fi

  if command -v direnv > /dev/null 2>&1; then
    if [ -n "${DIRENV_DIR:-}" ]; then
      [ "$json_mode" != true ] && _doctor_row "ok" "direnv" "shell hook active"
      _doctor_add "direnv" "ok" --actual "shell hook active"
    else
      [ "$json_mode" != true ] && _doctor_row "warn" "direnv" "shell hook not detected — add 'eval \"\$(direnv hook <shell>)\"' to your shell config"
      _doctor_add "direnv" "warn" --message "shell hook not detected"
      has_warnings=true
    fi

    if [ -f "$MAIN_CHECKOUT/.envrc" ]; then
      if direnv status 2>/dev/null | grep -q "Found RC allowed true"; then
        [ "$json_mode" != true ] && _doctor_row "ok" ".envrc" "allowed"
        _doctor_add ".envrc" "ok"
      elif direnv status 2>/dev/null | grep -q "Found RC allowed false"; then
        [ "$json_mode" != true ] && _doctor_row "error" ".envrc" "not allowed — run 'direnv allow'"
        _doctor_add ".envrc" "fail" --message "not allowed — run 'direnv allow'"
        has_failures=true
      else
        [ "$json_mode" != true ] && _doctor_row "warn" ".envrc" "unable to determine status"
        _doctor_add ".envrc" "warn" --message "unable to determine status"
        has_warnings=true
      fi
    fi
  else
    [ "$json_mode" != true ] && _doctor_row "error" "direnv" "not installed — run 'reproctl setup'"
    _doctor_add "direnv" "fail" --message "not installed — run 'reproctl setup'"
    has_failures=true
  fi

  if python3 -c "import socket; socket.getaddrinfo('test.sub.repro.localhost', 80)" 2>/dev/null; then
    [ "$json_mode" != true ] && _doctor_row "ok" ".localhost DNS" "multi-level subdomains resolve correctly"
    _doctor_add ".localhost DNS" "ok"
  else
    [ "$json_mode" != true ] && _doctor_row "warn" ".localhost DNS" "multi-level .localhost subdomains do not resolve — browser DoH may prevent worktree URLs from loading. Disable DNS-over-HTTPS or add entries to /etc/hosts."
    _doctor_add ".localhost DNS" "warn" --message "multi-level .localhost subdomains do not resolve"
    has_warnings=true
  fi

  if [ "$json_mode" = true ]; then
    printf '{"items":[%s]}\n' "$(IFS=,; echo "${_doctor_items[*]}")"
    if [ "$has_failures" = true ]; then
      return 1
    fi
    return 0
  fi

  _doctor_flush

  echo "" >&2

  if [ "$has_failures" = true ]; then
    echo "Some checks failed. Run 'reproctl setup' to fix most issues." >&2
    return 1
  elif [ "$has_warnings" = true ]; then
    echo "All critical checks passed, but some warnings were found." >&2
    return 0
  else
    echo "All checks passed." >&2
    return 0
  fi
}
