#!/usr/bin/env bash
# storybook-gates.sh
#
# Bash 3.2-compatible wrapper: serves the PREBUILT Storybook bundle
# (apps/storybook-ui/storybook-static) with a static HTTP server (or reuses
# a running server via REPRO_STORYBOOK_URL), then runs
#   (a) @storybook/test-runner — every story renders, interactions pass,
#       zero critical a11y violations (critical-only axe rule set in
#       apps/storybook-ui/.storybook/preview.js)
#   (b) the docs-pages Playwright project — docs previews render
#       non-fragmented (REP-1643 class: raw JSDoc leaks, empty previews,
#       test-named stories)
#
# Static serving rationale (REP-1648): the Vite dev server re-optimizes and
# reloads mid-run, and @storybook/test-runner then loses its one-shot
# setup-page script (upstream issue #68). CI run 34275653377 flaked 30 Select
# stories with `page.evaluate: ReferenceError: __test is not defined`
# (318/348 passed). Serving the static build removes the reload window; the
# bundle must exist first — the moon gate tasks and the
# regenerate-visual-baselines workflow build it via
# `moon run repro/storybook-ui:build`.
#
# Exits non-zero when either gate fails.
#
# Environment:
#   REPRO_STORYBOOK_URL  When set (non-empty), skip serving the local bundle
#                        and reuse the running server. This is an opt-in for
#                        manually sharing one Storybook across wrappers
#                        (e.g. running visual-regression.sh and this script
#                        against the same local server); the CI gate tasks
#                        serve their own bundle independently.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STORYBOOK_PKG="$REPO_ROOT/apps/storybook-ui"

STORYBOOK_PORT="${STORYBOOK_PORT:-6099}"
STORYBOOK_PID=""

# ---------------------------------------------------------------------------
# Static Storybook bundle check (REP-1648): serve the PREBUILT
# storybook-static output with a plain static HTTP server instead of the Vite
# dev server — the test-runner's one-shot setup-page script is lost when Vite
# re-optimizes/reloads mid-run (upstream issue #68; CI run 34275653377 failed
# 30 stories with `__test is not defined`). A static server removes the
# reload window entirely.
# ---------------------------------------------------------------------------

require_static_storybook() {
  local static_dir="$1"

  if [ ! -d "$static_dir" ]; then
    echo "Error: prebuilt Storybook bundle not found: $static_dir" >&2
    echo "  The UI-gate wrappers serve the prebuilt apps/storybook-ui/" >&2
    echo "  storybook-static output instead of the Vite dev server. Build" >&2
    echo "  it first with:" >&2
    echo "  moon run repro/storybook-ui:build" >&2
    exit 1
  fi

  # The test-runner and the docs gate drive /, /iframe.html and /index.json;
  # an incomplete build would fail much later with confusing browser errors,
  # so fail closed here instead.
  for required_file in index.html iframe.html index.json; do
    if [ ! -f "$static_dir/$required_file" ]; then
      echo "Error: prebuilt Storybook bundle is incomplete: $static_dir/$required_file is missing" >&2
      echo "  Rebuild it with: moon run repro/storybook-ui:build" >&2
      exit 1
    fi
  done
}

cleanup() {
  if [ -n "$STORYBOOK_PID" ]; then
    echo "[storybook-gates] Stopping static Storybook server (PID $STORYBOOK_PID)..." >&2
    kill "$STORYBOOK_PID" 2>/dev/null || true
    wait "$STORYBOOK_PID" 2>/dev/null || true
    # The static server is a direct python3 child, so killing the PID is
    # normally enough; sweep the picked port as a safety net (it was free
    # when we bound it).
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
  # Serve the PREBUILT storybook-static bundle (see the REP-1648 note above).
  # Only the REPRO_STORYBOOK_URL reuse path skips this check — the reused
  # server is external and does not read the local bundle.
  STORYBOOK_STATIC_DIR="$STORYBOOK_PKG/storybook-static"
  require_static_storybook "$STORYBOOK_STATIC_DIR"

  if ! command -v python3 >/dev/null 2>&1; then
    echo "Error: python3 is required to serve the prebuilt Storybook bundle but was not found on PATH" >&2
    exit 1
  fi

  # Boot the static server on a free port near 6099 (same port family as the
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

  echo "[storybook-gates] Serving prebuilt Storybook static bundle on port $STORYBOOK_PORT..." >&2
  echo "  $STORYBOOK_STATIC_DIR (python3 -m http.server)" >&2
  python3 -m http.server "$STORYBOOK_PORT" --bind 127.0.0.1 --directory "$STORYBOOK_STATIC_DIR" >/dev/null 2>&1 &
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
