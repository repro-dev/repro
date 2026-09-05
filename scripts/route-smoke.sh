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

WORKSPACE_PORT="${SMOKE_WORKSPACE_PORT:-7080}"
ADMIN_PORT="${SMOKE_ADMIN_PORT:-7081}"

WORKSPACE_PID=""
ADMIN_PID=""

cleanup() {
  for pid in "$WORKSPACE_PID" "$ADMIN_PID"; do
    if [ -n "$pid" ]; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
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
  local max_attempts=10
  local attempt=0

  while [ $attempt -lt $max_attempts ]; do
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

if ! WORKSPACE_PORT="$(find_free_port "$WORKSPACE_PORT")"; then
  echo "Error: could not find a free workspace port near $SMOKE_WORKSPACE_PORT" >&2
  exit 1
fi

if ! ADMIN_PORT="$(find_free_port "$ADMIN_PORT")"; then
  echo "Error: could not find a free admin port near $SMOKE_ADMIN_PORT" >&2
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
