#!/bin/bash
#
# scripts/lib/setup.sh — environment bootstrap and diagnostics
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh and
# scripts/lib/cluster.sh to be loaded first.

# ── Doctor output helpers ───────────────────────────────────────────

check_ok() {
  printf '  \033[32m ok\033[0m  %-16s %s\n' "$1" "$2"
}

check_warn() {
  printf ' \033[33mWARN\033[0m  %-16s %s\n' "$1" "$2"
}

check_fail() {
  printf ' \033[31mFAIL\033[0m  %-16s %s\n' "$1" "$2"
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

  echo "Checking development environment..."
  echo ""

  # 1. Homebrew
  if command -v brew > /dev/null 2>&1; then
    local brew_version
    brew_version="$(brew --version 2>/dev/null | head -1)"
    check_ok "brew" "$brew_version"
  else
    check_fail "brew" "not installed — https://brew.sh"
    has_failures=true
  fi

  # 2. Brewfile dependencies
  local brew_deps=("direnv" "kind" "pandoc" "postgresql@17")
  for dep in "${brew_deps[@]}"; do
    if command -v brew > /dev/null 2>&1 && brew list "$dep" > /dev/null 2>&1; then
      local dep_version
      dep_version="$(brew list --versions "$dep" 2>/dev/null | awk '{print $2}')"
      check_ok "$dep" "${dep_version:-installed}"
    else
      check_fail "$dep" "not installed — run 'reproctl setup'"
      has_failures=true
    fi
  done

  # 3. proto
  if command -v proto > /dev/null 2>&1; then
    local proto_version
    proto_version="$(proto --version 2>/dev/null | awk '{print $NF}')"
    local expected_proto
    expected_proto="$(read_prototools_version proto)"
    if [ -n "$expected_proto" ] && [ "$proto_version" != "$expected_proto" ]; then
      check_warn "proto" "$proto_version (expected $expected_proto)"
      has_warnings=true
    else
      check_ok "proto" "$proto_version"
    fi
  else
    check_fail "proto" "not installed — run 'reproctl setup'"
    has_failures=true
  fi

  # 4. Proto-managed tools
  local proto_tools=("node" "pnpm" "moon" "tilt" "helm" "ctlptl")
  for tool in "${proto_tools[@]}"; do
    local expected
    expected="$(read_prototools_version "$tool")"

    if ! command -v "$tool" > /dev/null 2>&1; then
      check_fail "$tool" "not installed — run 'reproctl setup'"
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
      check_warn "$tool" "v$actual (expected v$expected) — run 'reproctl setup'"
      has_warnings=true
    else
      check_ok "$tool" "v${actual:-unknown}"
    fi
  done

  # 5. Docker
  if command -v docker > /dev/null 2>&1; then
    if docker info > /dev/null 2>&1; then
      local docker_version
      docker_version="$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")"
      check_ok "docker" "Docker $docker_version, daemon running"
    else
      check_fail "docker" "daemon not running — start Docker Desktop"
      has_failures=true
    fi
  else
    check_fail "docker" "not installed — https://www.docker.com/products/docker-desktop"
    has_failures=true
  fi

  # 6. pnpm dependencies
  if [ -d "$MAIN_CHECKOUT/node_modules" ]; then
    if [ -f "$MAIN_CHECKOUT/node_modules/.package-lock.json" ] || [ -f "$MAIN_CHECKOUT/node_modules/.modules.yaml" ]; then
      if [ "$MAIN_CHECKOUT/pnpm-lock.yaml" -nt "$MAIN_CHECKOUT/node_modules/.modules.yaml" ] 2>/dev/null; then
        check_warn "pnpm install" "node_modules may be out of date — run 'reproctl setup'"
        has_warnings=true
      else
        check_ok "pnpm install" "node_modules present"
      fi
    else
      check_ok "pnpm install" "node_modules present"
    fi
  else
    check_fail "pnpm install" "node_modules missing — run 'reproctl setup'"
    has_failures=true
  fi

  # 7. LINEAR_API_KEY (optional — needed for reproctl wt create --from-issue)
  if [[ -n "${LINEAR_API_KEY:-}" ]]; then
    if [[ "$LINEAR_API_KEY" == lin_api_* ]]; then
      check_ok "LINEAR_API_KEY" "set"
    else
      check_warn "LINEAR_API_KEY" "set but does not start with lin_api_ — may be invalid"
      has_warnings=true
    fi
  else
    check_warn "LINEAR_API_KEY" "not set — wt create --from-issue will not fetch issue details"
    has_warnings=true
  fi

  # 8. direnv
  if command -v direnv > /dev/null 2>&1; then
    if [ -n "${DIRENV_DIR:-}" ]; then
      check_ok "direnv" "shell hook active"
    else
      check_warn "direnv" "shell hook not detected — add 'eval \"\$(direnv hook <shell>)\"' to your shell config"
      has_warnings=true
    fi

    if [ -f "$MAIN_CHECKOUT/.envrc" ]; then
      if direnv status 2>/dev/null | grep -q "Found RC allowed true"; then
        check_ok ".envrc" "allowed"
      elif direnv status 2>/dev/null | grep -q "Found RC allowed false"; then
        check_fail ".envrc" "not allowed — run 'direnv allow'"
        has_failures=true
      else
        check_warn ".envrc" "unable to determine status"
        has_warnings=true
      fi
    fi
  else
    check_fail "direnv" "not installed — run 'reproctl setup'"
    has_failures=true
  fi

  if python3 -c "import socket; socket.getaddrinfo('test.sub.repro.localhost', 80)" 2>/dev/null; then
    check_ok ".localhost DNS" "multi-level subdomains resolve correctly"
  else
    check_warn ".localhost DNS" "multi-level .localhost subdomains do not resolve — browser DoH may prevent worktree URLs from loading. Disable DNS-over-HTTPS or add entries to /etc/hosts."
    has_warnings=true
  fi

  echo ""

  if [ "$has_failures" = true ]; then
    echo "Some checks failed. Run 'reproctl setup' to fix most issues."
    return 1
  elif [ "$has_warnings" = true ]; then
    echo "All critical checks passed, but some warnings were found."
    return 0
  else
    echo "All checks passed."
    return 0
  fi
}
