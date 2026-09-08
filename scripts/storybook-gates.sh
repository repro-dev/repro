#!/usr/bin/env bash
# storybook-gates.sh
#
# Bash 3.2-compatible wrapper: boots (or reuses) Storybook, then runs
#   (a) @storybook/test-runner — every story renders, interactions pass,
#       zero critical a11y violations (critical-only axe rule set in
#       apps/storybook-ui/.storybook/preview.js)
#   (b) the docs-pages Playwright project — docs previews render
#       non-fragmented (REP-1643 class: raw JSDoc leaks, empty previews,
#       test-named stories)
#
# Exits non-zero when either gate fails.
#
# Environment:
#   REPRO_STORYBOOK_URL  When set (non-empty), skip booting Storybook and
#                        reuse the running server. This is an opt-in for
#                        manually sharing one Storybook across wrappers
#                        (e.g. running visual-regression.sh and this script
#                        against the same local server); the CI gate tasks
#                        boot their own server independently.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STORYBOOK_PKG="$REPO_ROOT/apps/storybook-ui"

STORYBOOK_PORT="${STORYBOOK_PORT:-6099}"
STORYBOOK_PID=""

cleanup() {
  if [ -n "$STORYBOOK_PID" ]; then
    echo "[storybook-gates] Stopping Storybook (PID $STORYBOOK_PID)..." >&2
    kill "$STORYBOOK_PID" 2>/dev/null || true
    wait "$STORYBOOK_PID" 2>/dev/null || true
    # Killing the pnpm wrapper can orphan the node dev server — clear the
    # picked port directly (it was free when we booted).
    lsof -tiTCP:"$STORYBOOK_PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
  fi
}

if [ -n "${REPRO_STORYBOOK_URL:-}" ]; then
  STORYBOOK_URL="$REPRO_STORYBOOK_URL"
  echo "[storybook-gates] Reusing Storybook at $STORYBOOK_URL (REPRO_STORYBOOK_URL)" >&2

  MAX_WAIT=30
  INTERVAL=2
  elapsed=0
  ready="false"
  while [ $elapsed -lt $MAX_WAIT ]; do
    http_code="$(curl -s -o /dev/null -w "%{http_code}" "$STORYBOOK_URL" 2>/dev/null || echo "000")"
    if [ "$http_code" = "200" ]; then
      ready="true"
      break
    fi
    sleep "$INTERVAL"
    elapsed=$((elapsed + INTERVAL))
  done
  if [ "$ready" != "true" ]; then
    echo "Error: REPRO_STORYBOOK_URL did not respond within ${MAX_WAIT}s: $STORYBOOK_URL" >&2
    exit 1
  fi
else
  # Boot Storybook on a free port near 6099 (same port family as the
  # visual-regression wrapper).
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

  if ! STORYBOOK_PORT="$(find_free_port "$STORYBOOK_PORT")"; then
    echo "Error: could not find a free Storybook port near $STORYBOOK_PORT" >&2
    exit 1
  fi

  trap cleanup EXIT

  echo "[storybook-gates] Starting Storybook on port $STORYBOOK_PORT..." >&2
  (
    cd "$STORYBOOK_PKG"
    pnpm storybook --ci -p "$STORYBOOK_PORT" --no-open >/dev/null 2>&1
  ) &
  STORYBOOK_PID=$!

  STORYBOOK_URL="http://localhost:${STORYBOOK_PORT}"
  MAX_WAIT=90
  INTERVAL=2
  elapsed=0
  ready="false"

  echo "[storybook-gates] Waiting for Storybook at $STORYBOOK_URL..." >&2
  while [ $elapsed -lt $MAX_WAIT ]; do
    http_code="$(curl -s -o /dev/null -w "%{http_code}" "$STORYBOOK_URL" 2>/dev/null || echo "000")"
    if [ "$http_code" = "200" ]; then
      ready="true"
      break
    fi
    if ! kill -0 "$STORYBOOK_PID" 2>/dev/null; then
      echo "Error: Storybook process exited prematurely" >&2
      exit 1
    fi
    sleep "$INTERVAL"
    elapsed=$((elapsed + INTERVAL))
  done

  if [ "$ready" != "true" ]; then
    echo "Error: Storybook did not become ready within ${MAX_WAIT}s" >&2
    exit 1
  fi

  echo "[storybook-gates] Storybook is ready." >&2
fi

# ---------------------------------------------------------------------------
# Gate 1: test-runner (render + interactions + critical-only a11y)
# ---------------------------------------------------------------------------

echo "[storybook-gates] Running test-runner..." >&2

TEST_RUNNER_EXIT=0
(
  cd "$STORYBOOK_PKG"
  pnpm exec test-storybook --url "$STORYBOOK_URL" --index-json
) || TEST_RUNNER_EXIT=$?

if [ "$TEST_RUNNER_EXIT" -ne 0 ]; then
  echo "[storybook-gates] test-runner FAILED (exit $TEST_RUNNER_EXIT)" >&2
  exit "$TEST_RUNNER_EXIT"
fi

# ---------------------------------------------------------------------------
# Gate 2: docs-pages fragmentation check
# ---------------------------------------------------------------------------

echo "[storybook-gates] Running docs-pages gate..." >&2

DOCS_EXIT=0
(
  cd "$REPO_ROOT"
  STORYBOOK_URL="$STORYBOOK_URL" pnpm exec playwright test --project=docs-pages
) || DOCS_EXIT=$?

exit "$DOCS_EXIT"
