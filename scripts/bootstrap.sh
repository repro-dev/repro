#!/bin/bash
#
# scripts/bootstrap.sh — one-command environment setup from a fresh clone
#
# Handles the full dependency chain without requiring direnv or reproctl
# to be available first:
#
#   1. Homebrew dependencies  (brew bundle)
#   2. direnv shell hook      (check + remind)
#   3. Proto-managed tools    (proto use)
#   4. Node.js dependencies   (pnpm install)
#   5. Docker                 (check daemon is running, wait if needed)
#   6. Trust .envrc           (direnv allow)
#   7. Cluster + registry     (reproctl cluster up)
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
total=8

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
  --no-cluster    Skip kind cluster creation (step 7)
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

# ── Step 2: direnv shell hook ───────────────────────────────────────

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

# ── Step 3: Proto-managed tools ─────────────────────────────────────

next_step "Installing proto-managed tools..."

if ! command -v proto > /dev/null 2>&1; then
  die "proto is not on PATH after brew bundle. Install it manually: https://moonrepo.dev/docs/proto/install"
fi

proto use
ok "Proto tools installed (node, pnpm, moon, tilt, helm, ctlptl)"

# ── Step 4: Node.js dependencies ───────────────────────────────────

next_step "Installing Node.js dependencies..."

pnpm install
ok "Node.js dependencies installed"

# ── Step 5: Docker ──────────────────────────────────────────────────

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

# ── Step 6: Trust .envrc ────────────────────────────────────────────

next_step "Trusting .envrc (enables reproctl as a bare command)..."

direnv allow "$REPO_ROOT"
ok ".envrc allowed"

# ── Step 7: OpenCode local config ───────────────────────────────────

next_step "Writing .opencode/opencode.json (local agent permissions)..."

OPENCODE_DIR="$REPO_ROOT/.opencode"
PARENT_DIR="$(dirname "$REPO_ROOT")"
OPENCODE_CONFIG="$OPENCODE_DIR/opencode.json"

mkdir -p "$OPENCODE_DIR"

# Write a scoped opencode.json that allows agents to read sibling worktrees
# (same parent directory as the main checkout) and permits known-repeating
# commands for the lightspeed automation loop. This file is gitignored and
# regenerated on every `reproctl setup` run — never commit it.
cat > "$OPENCODE_CONFIG" << OPENCODE_EOF
{
  "provider": {
    "github-copilot": {
      "model": "claude-sonnet-4.6"
    }
  },
  "permissions": {
    "external_directory": {
      "$PARENT_DIR/**": "allow"
    },
    "doom_loop": {
      "reproctl wt create *": "allow",
      "git push *": "allow",
      "gh pr checks *": "allow",
      "gh pr view *": "allow",
      "gh pr merge *": "allow",
      "*": "ask"
    }
  }
}
OPENCODE_EOF

ok ".opencode/opencode.json written (external_directory: $PARENT_DIR/**)"

# ── Step 8: Cluster + registry ──────────────────────────────────────

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
