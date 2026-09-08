#!/usr/bin/env bash
# route-smoke.sh
#
# Bash 3.2-compatible harness: envsubst smoke env into copies of both app
# dists, serves workspace + admin with SPA fallback, polls readiness, then
# runs the `route-smoke` Playwright project with WORKSPACE_URL/ADMIN_URL set.
#
# Requirements:
#   - envsubst (gettext) on PATH.
#   - Both dists built by moon (apps/workspace/dist, apps/admin/dist with
#     *.template.html + hashed assets). The moon task declares
#     repro/workspace:build and repro/admin:build as deps.
#   - Playwright chromium installed (`pnpm exec playwright install chromium`).
#
# Usage:
#   bash scripts/route-smoke.sh
#
# Environment:
#   SMOKE_WORKSPACE_PORT  preferred workspace port (default 7080, auto-increments)
#   SMOKE_ADMIN_PORT      preferred admin port (default 7081, auto-increments)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

WORKSPACE_APP="$REPO_ROOT/apps/workspace"
ADMIN_APP="$REPO_ROOT/apps/admin"
SMOKE_DIR="$REPO_ROOT/tmp/route-smoke"

# Resolved preferred ports: referenced in error messages below (the raw
# SMOKE_* variables are unset when defaulted, and a `set -u` reference in
# an error path would mask the real error with "unbound variable").
WORKSPACE_PREFERRED="${SMOKE_WORKSPACE_PORT:-7080}"
ADMIN_PREFERRED="${SMOKE_ADMIN_PORT:-7081}"

WORKSPACE_PORT="$WORKSPACE_PREFERRED"
ADMIN_PORT="$ADMIN_PREFERRED"

WORKSPACE_PID=""
ADMIN_PID=""

cleanup() {
  for pid in "$WORKSPACE_PID" "$ADMIN_PID"; do
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done

  # Killing the pnpm wrapper can orphan the actual `serve` child process, so
  # clear both picked ports directly (they were free when the harness booted).
  # Only queried when a port was actually picked.
  for port in "$WORKSPACE_PORT" "$ADMIN_PORT"; do
    if [ -n "$port" ]; then
      lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
    fi
  done
}

trap cleanup EXIT

# ---------------------------------------------------------------------------
# Precondition checks
# ---------------------------------------------------------------------------

command -v envsubst >/dev/null 2>&1 || {
  echo "Error: envsubst (gettext) is required but not on PATH" >&2
  exit 1
}

for app in "$WORKSPACE_APP" "$ADMIN_APP"; do
  if [ ! -f "$app/dist/index.template.html" ]; then
    echo "Error: $app/dist/index.template.html missing — build both apps first" >&2
    echo "  (moon run repro/workspace:build repro/admin:build)" >&2
    exit 1
  fi
done

# ---------------------------------------------------------------------------
# Find a free port starting at the preferred one
# ---------------------------------------------------------------------------

find_free_port() {
  local port="$1"
  # Optional exclusion (Bash 3.2: may be unset for single-arg calls).
  local exclude="${2:-}"
  local max_attempts=10
  local attempt=0

  while [ $attempt -lt $max_attempts ]; do
    # Never hand out the other app's already-picked port: both pickers
    # resolve BEFORE either server binds, so when the workspace preferred
    # port was occupied and auto-incremented onto the admin preferred port,
    # the free-port probe alone would hand BOTH servers the same port.
    if [ -n "$exclude" ] && [ "$port" = "$exclude" ]; then
      port=$((port + 1))
      attempt=$((attempt + 1))
      continue
    fi
    if ! lsof -iTCP:"$port" -sTCP:LISTEN -t >/dev/null 2>&1; then
      echo "$port"
      return 0
    fi
    port=$((port + 1))
    attempt=$((attempt + 1))
  done

  echo ""
  return 1
}

if ! WORKSPACE_PORT="$(find_free_port "$WORKSPACE_PREFERRED")"; then
  echo "Error: could not find a free workspace port near $WORKSPACE_PREFERRED (SMOKE_WORKSPACE_PORT=$WORKSPACE_PREFERRED)" >&2
  exit 1
fi

# Exclude the workspace's picked port so the admin picker cannot select it
# (it is still unbound at this point and would look free).
if ! ADMIN_PORT="$(find_free_port "$ADMIN_PREFERRED" "$WORKSPACE_PORT")"; then
  echo "Error: could not find a free admin port near $ADMIN_PREFERRED (SMOKE_ADMIN_PORT=$ADMIN_PREFERRED)" >&2
  exit 1
fi

echo "[route-smoke] workspace port: $WORKSPACE_PORT, admin port: $ADMIN_PORT" >&2

# ---------------------------------------------------------------------------
# Prepare served copies with smoke env (never touch the built dist in place)
# ---------------------------------------------------------------------------

WORKSPACE_SERVE_DIR="$SMOKE_DIR/workspace"
ADMIN_SERVE_DIR="$SMOKE_DIR/admin"

rm -rf "$SMOKE_DIR"
mkdir -p "$WORKSPACE_SERVE_DIR" "$ADMIN_SERVE_DIR"
cp -R "$WORKSPACE_APP/dist/." "$WORKSPACE_SERVE_DIR/"
cp -R "$ADMIN_APP/dist/." "$ADMIN_SERVE_DIR/"

envsubst_workspace() {
  # Workspace template vars: BUILD_ENV, PADDLE_CLIENT_TOKEN, PADDLE_ENVIRONMENT,
  # REPRO_APP_URL, REPRO_API_URL. REPRO_API_URL='' makes apiClient fetch
  # same-origin relative URLs (interceptable, passes the zod env schema).
  # envsubst takes a shell-format string — variable names must carry '$'.
  local input="$1"
  local output="$2"
  BUILD_ENV=production \
    PADDLE_CLIENT_TOKEN= \
    PADDLE_ENVIRONMENT=sandbox \
    REPRO_APP_URL= \
    REPRO_API_URL= \
    envsubst '$BUILD_ENV,$PADDLE_CLIENT_TOKEN,$PADDLE_ENVIRONMENT,$REPRO_APP_URL,$REPRO_API_URL' \
    <"$input" >"$output"
}

envsubst_admin() {
  # Admin template vars: BUILD_ENV, REPRO_WORKSPACE_URL, REPRO_ADMIN_URL,
  # REPRO_API_URL. zod requires valid URLs, so all three point at the local
  # smoke servers (same-origin keeps intercepted responses CORS-free).
  local input="$1"
  local output="$2"
  BUILD_ENV=production \
    REPRO_WORKSPACE_URL="http://localhost:${WORKSPACE_PORT}" \
    REPRO_ADMIN_URL="http://localhost:${ADMIN_PORT}" \
    REPRO_API_URL="http://localhost:${ADMIN_PORT}" \
    envsubst '$BUILD_ENV,$REPRO_WORKSPACE_URL,$REPRO_ADMIN_URL,$REPRO_API_URL' \
    <"$input" >"$output"
}

envsubst_workspace "$WORKSPACE_SERVE_DIR/index.template.html" "$WORKSPACE_SERVE_DIR/index.html"
envsubst_admin "$ADMIN_SERVE_DIR/index.template.html" "$ADMIN_SERVE_DIR/index.html"

# ---------------------------------------------------------------------------
# Serve both apps (serve -s: static + SPA fallback for deep links)
# ---------------------------------------------------------------------------

serve_app() {
  local serve_dir="$1"
  local port="$2"

  # `serve` is a devDependency of apps/workspace only, so `pnpm exec serve`
  # resolves the binary from apps/workspace's node_modules. The cwd is set to
  # apps/workspace for BOTH apps — the served directory is passed
  # explicitly, which is why admin is served correctly from its own dist
  # copy despite running under the workspace app's package context.
  (
    cd "$REPO_ROOT/apps/workspace"
    pnpm exec serve -s "$serve_dir" -l "$port"
  ) >/dev/null 2>&1 &
  echo $!
}

echo "[route-smoke] serving workspace from $WORKSPACE_SERVE_DIR..." >&2
WORKSPACE_PID="$(serve_app "$WORKSPACE_SERVE_DIR" "$WORKSPACE_PORT")"

echo "[route-smoke] serving admin from $ADMIN_SERVE_DIR..." >&2
ADMIN_PID="$(serve_app "$ADMIN_SERVE_DIR" "$ADMIN_PORT")"

wait_for() {
  local url="$1"
  local max_wait=30
  local interval=1
  local elapsed=0

  while [ $elapsed -lt $max_wait ]; do
    http_code="$(curl -s -o /dev/null -w "%{http_code}" "$url" 2>/dev/null || echo "000")"
    if [ "$http_code" = "200" ]; then
      return 0
    fi
    sleep "$interval"
    elapsed=$((elapsed + interval))
  done

  echo "Error: $url did not become ready within ${max_wait}s" >&2
  return 1
}

wait_for "http://localhost:${WORKSPACE_PORT}/" || exit 1
wait_for "http://localhost:${ADMIN_PORT}/" || exit 1

echo "[route-smoke] both servers ready — running Playwright route-smoke project" >&2

# ---------------------------------------------------------------------------
# Run the route-smoke Playwright project
# ---------------------------------------------------------------------------

PLAYWRIGHT_EXIT=0
WORKSPACE_URL="http://localhost:${WORKSPACE_PORT}" \
  ADMIN_URL="http://localhost:${ADMIN_PORT}" \
  pnpm exec playwright test --project=route-smoke || PLAYWRIGHT_EXIT=$?

exit "$PLAYWRIGHT_EXIT"
