#!/bin/bash
#
# scripts/bootstrap.sh — one-command environment setup from a fresh clone
#
# Handles the full dependency chain without requiring direnv or reproctl
# to be available first:
#
#   1. Homebrew dependencies  (brew bundle)
#   2. agent-browser runtime   (doctor/install as needed)
#   3. direnv shell hook      (check + remind)
#   4. Proto-managed tools    (proto use)
#   5. Node.js dependencies   (pnpm install)
#   6. Docker                 (check daemon is running, wait if needed)
#   7. Trust .envrc           (direnv allow)
#   8. OpenCode local config  (.envrc.local)
#   9. Cluster + registry    (reproctl cluster up)
#
# Also invoked by `reproctl setup`, which passes through its flags.
#
# Usage:
#   ./scripts/bootstrap.sh              # full setup
#   ./scripts/bootstrap.sh --no-cluster # skip kind cluster creation

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$REPO_ROOT"

# ── Helpers ─────────────────────────────────────────────────────────

step=0
total=9

next_step() {
  step=$((step + 1))
  printf '\n\033[1m[%d/%d] %s\033[0m\n' "$step" "$total" "$1"
}

ok() {
  printf '  \033[32m✔ %s\033[0m\n' "$1"
}

die() {
  printf '\033[31mError: %s\033[0m\n' "$1" >&2
  exit 1
}

# ── Parse flags ─────────────────────────────────────────────────────

skip_cluster=false
for arg in "$@"; do
  case "$arg" in
    --no-cluster) skip_cluster=true ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/bootstrap.sh [options]

Bootstrap the development environment from a fresh clone.

Options:
  --no-cluster    Skip kind cluster creation (step 9)
  -h, --help      Show this help
EOF
      exit 0
      ;;
    *) die "Unknown option: $arg" ;;
  esac
done

# ── Step 1: Homebrew dependencies ───────────────────────────────────

next_step "Installing Homebrew dependencies..."

if ! command -v brew > /dev/null 2>&1; then
  die "Homebrew is not installed. Install it from https://brew.sh"
fi

brew bundle --file="$REPO_ROOT/Brewfile"
ok "Homebrew dependencies installed"

# ── Step 2: agent-browser runtime ────────────────────────────────────

next_step "Provisioning agent-browser runtime..."

if ! command -v agent-browser > /dev/null 2>&1; then
  die "agent-browser was not installed by brew bundle. Check the output above."
fi

if agent-browser doctor --offline --quick > /dev/null 2>&1; then
  ok "agent-browser runtime healthy"
else
  echo "  agent-browser runtime is missing or unhealthy. Running agent-browser install..."
  if ! agent-browser install; then
    die "agent-browser install failed. Run 'agent-browser doctor' or 'agent-browser doctor --fix' to repair the runtime."
  fi
  if ! agent-browser doctor --offline --quick > /dev/null 2>&1; then
    die "agent-browser install completed, but the runtime is still unhealthy. Run 'agent-browser doctor' or 'agent-browser doctor --fix'."
  fi
  ok "agent-browser runtime provisioned"
fi

# ── Step 3: direnv shell hook ───────────────────────────────────────

next_step "Checking direnv shell hook..."

if ! command -v direnv > /dev/null 2>&1; then
  die "direnv was not installed by brew bundle. Check the output above."
fi

if [ -z "${DIRENV_DIR:-}" ]; then
  echo ""
  echo "  direnv shell hook is not active in this session."
  echo "  If you haven't already, add one of these to your shell config:"
  echo ""
  echo "    # zsh (~/.zshrc)"
  echo '    eval "$(direnv hook zsh)"'
  echo ""
  echo "    # bash (~/.bashrc)"
  echo '    eval "$(direnv hook bash)"'
  echo ""
  echo "  The hook will activate in new shells. Continuing with setup..."
else
  ok "direnv shell hook active"
fi

# ── Step 4: Proto-managed tools ─────────────────────────────────────

next_step "Installing proto-managed tools..."

if ! command -v proto > /dev/null 2>&1; then
  die "proto is not on PATH after brew bundle. Install it manually: https://moonrepo.dev/docs/proto/install"
fi

proto use
ok "Proto tools installed (node, pnpm, moon, tilt, helm, ctlptl)"

# ── Step 5: Node.js dependencies ───────────────────────────────────

next_step "Installing Node.js dependencies..."

pnpm install
ok "Node.js dependencies installed"

if pnpm exec linear --version > /dev/null 2>&1 && pnpm exec node --input-type=module -e "await import('@linear/sdk')" > /dev/null 2>&1; then
  ok "linear CLI wrapper and @linear/sdk are available from workspace dependency"
else
  die "repo-local Linear CLI wrapper could not execute or resolve @linear/sdk after pnpm install. Run 'pnpm install' again or check the @linear/sdk dependency in package.json."
fi

# ── Step 6: Docker ──────────────────────────────────────────────────

next_step "Checking Docker..."

if ! command -v docker > /dev/null 2>&1; then
  die "Docker is not installed. Install Docker Desktop: https://www.docker.com/products/docker-desktop"
fi

if ! docker info > /dev/null 2>&1; then
  echo "  Docker daemon is not running. Please start Docker Desktop."
  echo "  Waiting for Docker to start..."
  retries=0
  while [ "$retries" -lt 30 ]; do
    if docker info > /dev/null 2>&1; then
      break
    fi
    sleep 2
    retries=$((retries + 1))
  done
  if ! docker info > /dev/null 2>&1; then
    die "Docker daemon did not start within 60 seconds. Start Docker Desktop manually and re-run."
  fi
fi

docker_version="$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "unknown")"
ok "Docker $docker_version, daemon running"

# ── Step 7: Trust .envrc ────────────────────────────────────────────

next_step "Trusting .envrc (enables reproctl as a bare command)..."

direnv allow "$REPO_ROOT"
ok ".envrc allowed"

# ── Step 8: OpenCode local config ───────────────────────────────────

next_step "Writing .envrc.local (machine-local OpenCode permissions)..."

PARENT_DIR="$(dirname "$REPO_ROOT")"
ENVRC_LOCAL="$REPO_ROOT/.envrc.local"

# Export OPENCODE_CONFIG_CONTENT so OpenCode (loaded via direnv) receives a
# machine-local permission grant scoped to the parent directory.  This allows
# agents to access sibling worktrees without hardcoding any path in tracked
# files.  The key is the config merge order: OPENCODE_CONFIG_CONTENT (level 6)
# overrides project config (level 4), so external_directory set here wins.
#
# The file is gitignored and regenerated on every `reproctl setup` run.
cat > "$ENVRC_LOCAL" << ENVRC_EOF
# Written by \`reproctl setup\` — gitignored, do not commit.
export OPENCODE_CONFIG_CONTENT='{
  "provider": {
    "github-copilot": {
      "options": {
        "model": "gpt-5.4",
        "reasoningEffort": "high"
      }
    }
  },
  "permission": {
    "external_directory": {
      "${PARENT_DIR}/**": "allow"
    }
  }
}'
ENVRC_EOF

ok ".envrc.local written (external_directory: $PARENT_DIR/**)"

# ── Step 9: Cluster + registry ─────────────────────────────────────

if [ "$skip_cluster" = true ]; then
  next_step "Skipping cluster creation (--no-cluster)"
  ok "Skipped"
else
  next_step "Creating kind cluster and container registry..."
  "$REPO_ROOT/scripts/reproctl.sh" cluster up
  ok "Cluster and registry ready"
fi

# ── Done ────────────────────────────────────────────────────────────

echo ""
printf '\033[32m✔ Bootstrap complete.\033[0m\n'
echo ""
echo "Next steps:"
echo "  reproctl doctor     # verify environment"
echo "  reproctl start workspace  # start developing"
echo ""
if [ -z "${DIRENV_DIR:-}" ]; then
  echo "Note: open a new terminal tab to activate the direnv shell hook,"
  echo "or run:  eval \"\$(direnv export \$(basename \$SHELL))\""
  echo ""
fi
