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
  local skip_cluster=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --skip-cluster) skip_cluster=true; shift ;;
      -h|--help)
        cat <<'EOF'
Usage: reproctl setup [options]

Bootstrap the local development environment. Installs all required
tools and dependencies in the correct order.

Options:
  --skip-cluster    Skip kind cluster creation (step 5)

Steps:
  1. brew bundle     Install Homebrew dependencies from Brewfile
  2. proto use       Install proto-managed tools from .prototools
  3. pnpm install    Install Node.js dependencies
  4. Docker check    Verify Docker is installed and running
  5. cluster up      Create kind cluster and registry (idempotent)
EOF
        return 0
        ;;
      *)
        die "Unknown option: $1\nRun 'reproctl setup --help' for usage."
        ;;
    esac
  done

  # Prerequisite: brew must be available
  if ! command -v brew > /dev/null 2>&1; then
    die "Homebrew is not installed.\nInstall it from https://brew.sh:\n  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  fi

  # Step 1: brew bundle
  echo "==> Step 1/5: Installing Homebrew dependencies..."
  if ! brew bundle --file="$MAIN_CHECKOUT/Brewfile"; then
    die "brew bundle failed. Check the output above."
  fi
  echo ""

  # Step 2: proto use
  echo "==> Step 2/5: Installing proto-managed tools..."
  if ! command -v proto > /dev/null 2>&1; then
    die "proto is not on PATH after brew bundle.\nInstall it manually: https://moonrepo.dev/docs/proto/install"
  fi
  if ! (cd "$MAIN_CHECKOUT" && proto use); then
    die "proto use failed. Check the output above."
  fi
  echo ""

  # Step 3: pnpm install
  echo "==> Step 3/5: Installing Node.js dependencies..."
  if ! (cd "$MAIN_CHECKOUT" && pnpm install); then
    die "pnpm install failed. Check the output above."
  fi
  echo ""

  # Step 4: Docker check
  echo "==> Step 4/5: Checking Docker..."
  if ! command -v docker > /dev/null 2>&1; then
    die "Docker is not installed.\nInstall Docker Desktop: https://www.docker.com/products/docker-desktop"
  fi
  if ! docker info > /dev/null 2>&1; then
    echo "Docker daemon is not running. Please start Docker Desktop."
    echo "Waiting for Docker to start..."
    local retries=0
    while [ "$retries" -lt 30 ]; do
      if docker info > /dev/null 2>&1; then
        break
      fi
      sleep 2
      retries=$((retries + 1))
    done
    if ! docker info > /dev/null 2>&1; then
      die "Docker daemon did not start within 60 seconds.\nStart Docker Desktop manually and re-run 'reproctl setup'."
    fi
  fi
  echo "Docker is running."
  echo ""

  # Step 5: Cluster
  if [ "$skip_cluster" = true ]; then
    echo "==> Step 5/5: Skipping cluster creation (--skip-cluster)"
  else
    echo "==> Step 5/5: Creating kind cluster and registry..."
    cmd_cluster_up
  fi

  echo ""
  echo "Setup complete. Run 'reproctl doctor' to verify your environment."
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
  local brew_deps=("direnv" "kind" "postgresql@17")
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

  # 6. Cluster
  if command -v kind > /dev/null 2>&1 && command -v docker > /dev/null 2>&1 && docker info > /dev/null 2>&1; then
    if cluster_exists; then
      check_ok "cluster" "$CLUSTER_NAME running (kind-$CLUSTER_NAME)"
    else
      check_fail "cluster" "$CLUSTER_NAME not running — run 'reproctl setup' or 'reproctl cluster up'"
      has_failures=true
    fi

    if registry_exists; then
      local reg_port
      reg_port="$(docker inspect --format '{{(index (index .NetworkSettings.Ports "5000/tcp") 0).HostPort}}' "$REGISTRY_NAME" 2>/dev/null || echo "5000")"
      check_ok "registry" "$REGISTRY_NAME running (port $reg_port)"
    else
      check_fail "registry" "$REGISTRY_NAME not running — run 'reproctl setup' or 'reproctl cluster up'"
      has_failures=true
    fi
  else
    check_fail "cluster" "cannot check — docker or kind not available"
    check_fail "registry" "cannot check — docker not available"
    has_failures=true
  fi

  # 7. pnpm dependencies
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
