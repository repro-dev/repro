#!/usr/bin/env bash
# visual-regression.sh
#
# Bash 3.2-compatible wrapper: starts (or reuses) Storybook, captures screenshots,
# and runs pixel-level diffs against the committed baselines.
#
# Baseline model (REP-1648): baselines live in the checkout under test at
# $REPO_ROOT/tmp/visual-baselines and are committed to the repo. They must be
# generated on Linux (see docs/visual-regression.md) — rasterization differs
# between runner images and macOS.
#
# Usage:
#   bash scripts/visual-regression.sh \
#     --stories '["button--primary"]' \
#     [--baseline-dir /path/to/baselines] \
#     [--threshold 0.001] \
#     [--fail-on-new] \
#     [--update-baselines]
#
# Environment:
#   REPRO_STORYBOOK_URL  When set (non-empty), skip booting Storybook and reuse
#                        the running server (shared boot contract used by the
#                        moon gate tasks and storybook-gates.sh).
#
# When --update-baselines is set: captures straight into the baseline dir
# (committed dir unless --baseline-dir overrides it). Otherwise: diffs against
# the baseline dir, writes diff PNGs to tmp/visual-diffs/.
#
# Outputs the JSON from the capture script to stdout.
# Exits 0 if all pass, non-zero if any fail (or --fail-on-new and any new story).

set -euo pipefail

# ---------------------------------------------------------------------------
# Argument defaults
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STORIES='[]'
THRESHOLD="0.001"
UPDATE_BASELINES="false"
FAIL_ON_NEW="false"
STORYBOOK_PORT=6099
STORYBOOK_PID=""
COMMITTED_BASELINE_DIR="$REPO_ROOT/tmp/visual-baselines"

# ---------------------------------------------------------------------------
# Parse arguments — Bash 3.2: no associative arrays, no ${var,,}
# ---------------------------------------------------------------------------

while [ $# -gt 0 ]; do
  case "$1" in
    --repo-root)
      REPO_ROOT="$2"
      shift 2
      ;;
    --baseline-dir)
      BASELINE_DIR_ARG="$2"
      shift 2
      ;;
    --stories)
      STORIES="$2"
      shift 2
      ;;
    --threshold)
      THRESHOLD="$2"
      shift 2
      ;;
    --fail-on-new)
      FAIL_ON_NEW="true"
      shift
      ;;
    --update-baselines)
      UPDATE_BASELINES="true"
      shift
      ;;
    --port)
      STORYBOOK_PORT="$2"
      shift 2
      ;;
    --help|-h)
      cat <<'EOF'
Usage: bash scripts/visual-regression.sh [options]

Options:
  --repo-root <path>      Checkout root (default: the script's parent directory).
                          Baselines and tmp output resolve from here.
  --baseline-dir <path>   Baseline directory override (default: committed
                          $REPO_ROOT/tmp/visual-baselines)
  --stories <json>        JSON array of story IDs; empty array = all stories
  --threshold <float>     Pixel diff threshold as fraction (default: 0.001)
  --fail-on-new           Exit non-zero when a story has no committed baseline
  --update-baselines      Capture into the baseline dir instead of diffing
  --port <n>              Storybook port (default: 6099; ignored when
                          REPRO_STORYBOOK_URL is set)
  --help                  Show this message
EOF
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ ! -d "$REPO_ROOT" ]; then
  echo "Error: repo root does not exist: $REPO_ROOT" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Find Storybook package directory
# Priority: apps/storybook-ui, then first package with .storybook/
# ---------------------------------------------------------------------------

find_storybook_pkg() {
  local root="$1"

  # Check the canonical location first
  if [ -d "$root/apps/storybook-ui" ]; then
    echo "$root/apps/storybook-ui"
    return 0
  fi

  # Walk apps/ and packages/ looking for a .storybook/ config dir
  # Use find with -maxdepth to avoid deep traversal; Bash 3.2-safe
  local found=""
  while IFS= read -r dir; do
    if [ -d "$dir/.storybook" ]; then
      found="$dir"
      break
    fi
  done < <(find "$root/apps" "$root/packages" -maxdepth 1 -mindepth 1 -type d 2>/dev/null)

  if [ -n "$found" ]; then
    echo "$found"
    return 0
  fi

  # No Storybook package found
  return 1
}

STORYBOOK_PKG=""
if ! STORYBOOK_PKG="$(find_storybook_pkg "$REPO_ROOT")"; then
  # No Storybook setup — skip with warning, output a skipped result
  cat <<EOF
{
  "stories_checked": [],
  "passed": [],
  "failed": [],
  "new_stories": [],
  "warning": "No Storybook setup found in $REPO_ROOT — visual check skipped"
}
EOF
  exit 0
fi

echo "[visual-regression] Using Storybook package: $STORYBOOK_PKG" >&2

# Check for per-package threshold override
if [ -f "$STORYBOOK_PKG/.visual-threshold" ]; then
  PKG_THRESHOLD="$(cat "$STORYBOOK_PKG/.visual-threshold" | tr -d '[:space:]')"
  if [ -n "$PKG_THRESHOLD" ]; then
    THRESHOLD="$PKG_THRESHOLD"
    echo "[visual-regression] Using per-package threshold: $THRESHOLD" >&2
  fi
fi

# ---------------------------------------------------------------------------
# Reuse an externally booted Storybook (REPRO_STORYBOOK_URL contract) or boot one
# ---------------------------------------------------------------------------

cleanup() {
  if [ -n "$STORYBOOK_PID" ]; then
    echo "[visual-regression] Stopping Storybook (PID $STORYBOOK_PID)..." >&2
    kill "$STORYBOOK_PID" 2>/dev/null || true
    wait "$STORYBOOK_PID" 2>/dev/null || true
    # Killing the pnpm wrapper can orphan the node dev server — clear the
    # picked port directly (it was free when we booted).
    lsof -tiTCP:"$STORYBOOK_PORT" -sTCP:LISTEN 2>/dev/null | xargs kill 2>/dev/null || true
  fi
}

if [ -n "${REPRO_STORYBOOK_URL:-}" ]; then
  STORYBOOK_URL="$REPRO_STORYBOOK_URL"
  echo "[visual-regression] Reusing Storybook at $STORYBOOK_URL (REPRO_STORYBOOK_URL)" >&2

  # Readiness check against the reused server (short poll — server should be up)
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
  # ---------------------------------------------------------------------------
  # Check if port is free; if not, increment up to 10 times
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

    echo "" # Could not find a free port
    return 1
  }

  if ! STORYBOOK_PORT="$(find_free_port "$STORYBOOK_PORT")"; then
    echo "Error: Could not find a free port near $STORYBOOK_PORT" >&2
    exit 1
  fi

  echo "[visual-regression] Using Storybook port: $STORYBOOK_PORT" >&2

  trap cleanup EXIT

  echo "[visual-regression] Starting Storybook on port $STORYBOOK_PORT..." >&2
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

  echo "[visual-regression] Waiting for Storybook to be ready at $STORYBOOK_URL..." >&2

  while [ $elapsed -lt $MAX_WAIT ]; do
    http_code="$(curl -s -o /dev/null -w "%{http_code}" "$STORYBOOK_URL" 2>/dev/null || echo "000")"
    if [ "$http_code" = "200" ]; then
      ready="true"
      break
    fi

    # Check if storybook process died
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

  echo "[visual-regression] Storybook is ready." >&2
fi

# ---------------------------------------------------------------------------
# Determine output and baseline directories
# ---------------------------------------------------------------------------

CAPTURE_SCRIPT="$REPO_ROOT/scripts/visual-regression-capture.ts"
BASELINE_DIR="${BASELINE_DIR_ARG:-$COMMITTED_BASELINE_DIR}"

if [ "$UPDATE_BASELINES" = "true" ]; then
  if [ "$(uname -s)" = "Darwin" ]; then
    echo "[visual-regression] WARNING: baselines must be generated on Linux to match CI" >&2
    echo "[visual-regression] WARNING: runners rasterize text differently from macOS." >&2
    echo "[visual-regression] WARNING: Baselines captured here may produce false diffs in CI." >&2
    echo "[visual-regression] WARNING: See docs/visual-regression.md for the Linux capture flow." >&2
  fi

  # Capture straight into the baseline dir (overwrite committed baselines)
  OUTPUT_DIR="$BASELINE_DIR"
  mkdir -p "$OUTPUT_DIR"

  echo "[visual-regression] Updating baselines in $OUTPUT_DIR..." >&2

  pnpm exec tsx "$CAPTURE_SCRIPT" \
    --storybook-url "$STORYBOOK_URL" \
    --output-dir "$OUTPUT_DIR" \
    --threshold "$THRESHOLD" \
    --stories "$STORIES"

else
  SCREENSHOT_DIR="$REPO_ROOT/tmp/visual-screenshots"
  DIFF_DIR="$REPO_ROOT/tmp/visual-diffs"

  mkdir -p "$SCREENSHOT_DIR" "$DIFF_DIR"

  # Diff against the baseline dir. Fail closed when the committed dir is empty
  # and --fail-on-new is set (a new story must ship its baseline).
  CAPTURE_ARGS="--storybook-url $STORYBOOK_URL --output-dir $SCREENSHOT_DIR --threshold $THRESHOLD --stories $STORIES"
  if [ -d "$BASELINE_DIR" ] && [ "$(ls -A "$BASELINE_DIR" 2>/dev/null)" ]; then
    echo "[visual-regression] Diffing against baselines in $BASELINE_DIR..." >&2
    CAPTURE_ARGS="$CAPTURE_ARGS --baseline-dir $BASELINE_DIR"
  else
    echo "[visual-regression] No baselines found in $BASELINE_DIR — all stories will be treated as new." >&2
  fi

  if [ "$FAIL_ON_NEW" = "true" ]; then
    CAPTURE_ARGS="$CAPTURE_ARGS --fail-on-new"
  fi

  # Run capture + diff. Allow non-zero exit (failures) so we can propagate it.
  RESULT_JSON=""
  CAPTURE_EXIT=0

  # Word-split is intentional here for CAPTURE_ARGS
  # shellcheck disable=SC2086
  RESULT_JSON="$(pnpm exec tsx "$CAPTURE_SCRIPT" $CAPTURE_ARGS)" || CAPTURE_EXIT=$?

  # Copy any diff images to the diffs directory
  if [ -d "$SCREENSHOT_DIR" ]; then
    while IFS= read -r diff_file; do
      if [ -n "$diff_file" ]; then
        cp "$diff_file" "$DIFF_DIR/"
      fi
    done < <(find "$SCREENSHOT_DIR" -name "*.diff.png" 2>/dev/null)
  fi

  echo "$RESULT_JSON"
  exit $CAPTURE_EXIT
fi
