#!/usr/bin/env bash
# visual-regression.sh
#
# Bash 3.2-compatible wrapper: starts Storybook, captures screenshots,
# and runs pixel-level diffs against baselines.
#
# Usage:
#   bash scripts/visual-regression.sh \
#     --worktree /path/to/worktree \
#     --main-checkout /path/to/main \
#     --stories '["button--primary"]' \
#     [--threshold 0.001] \
#     [--update-baselines]
#
# When --update-baselines is set: captures to <main-checkout>/tmp/visual-baselines/.
# Otherwise: copies baselines from main into the worktree, diffs, copies diffs to
# <worktree>/tmp/visual-diffs/.
#
# Outputs the JSON from the capture script to stdout.
# Exits 0 if all pass (or all new/no baselines), non-zero if any fail.

set -euo pipefail

# ---------------------------------------------------------------------------
# Argument defaults
# ---------------------------------------------------------------------------

WORKTREE=""
MAIN_CHECKOUT=""
STORIES='[]'
THRESHOLD="0.001"
UPDATE_BASELINES="false"
STORYBOOK_PORT=6099
STORYBOOK_PID=""

# ---------------------------------------------------------------------------
# Parse arguments — Bash 3.2: no associative arrays, no ${var,,}
# ---------------------------------------------------------------------------

while [ $# -gt 0 ]; do
  case "$1" in
    --worktree)
      WORKTREE="$2"
      shift 2
      ;;
    --main-checkout)
      MAIN_CHECKOUT="$2"
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
  --worktree <path>       Worktree path (branch being tested)
  --main-checkout <path>  Main checkout path (where baselines live)
  --stories <json>        JSON array of story IDs; empty array = all stories
  --threshold <float>     Pixel diff threshold as fraction (default: 0.001)
  --update-baselines      Capture to main-checkout baselines instead of diffing
  --port <n>              Storybook port (default: 6099)
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

# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------

if [ -z "$WORKTREE" ]; then
  echo "Error: --worktree is required" >&2
  exit 1
fi

if [ -z "$MAIN_CHECKOUT" ]; then
  echo "Error: --main-checkout is required" >&2
  exit 1
fi

if [ ! -d "$WORKTREE" ]; then
  echo "Error: worktree path does not exist: $WORKTREE" >&2
  exit 1
fi

if [ ! -d "$MAIN_CHECKOUT" ]; then
  echo "Error: main-checkout path does not exist: $MAIN_CHECKOUT" >&2
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
if ! STORYBOOK_PKG="$(find_storybook_pkg "$WORKTREE")"; then
  # No Storybook setup — skip with warning, output a skipped result
  cat <<EOF
{
  "stories_checked": [],
  "passed": [],
  "failed": [],
  "new_stories": [],
  "warning": "No Storybook setup found in $WORKTREE — visual check skipped"
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

# ---------------------------------------------------------------------------
# Start Storybook and set up EXIT trap to kill it
# ---------------------------------------------------------------------------

cleanup() {
  if [ -n "$STORYBOOK_PID" ]; then
    echo "[visual-regression] Stopping Storybook (PID $STORYBOOK_PID)..." >&2
    kill "$STORYBOOK_PID" 2>/dev/null || true
    wait "$STORYBOOK_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

echo "[visual-regression] Starting Storybook on port $STORYBOOK_PORT..." >&2
(
  cd "$STORYBOOK_PKG"
  pnpm storybook --ci -p "$STORYBOOK_PORT" --no-open >/dev/null 2>&1
) &
STORYBOOK_PID=$!

# ---------------------------------------------------------------------------
# Poll for Storybook readiness (up to 90s, 2s interval)
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Determine output and baseline directories
# ---------------------------------------------------------------------------

CAPTURE_SCRIPT="$WORKTREE/scripts/visual-regression-capture.ts"

if [ "$UPDATE_BASELINES" = "true" ]; then
  # Write directly to main-checkout baselines
  OUTPUT_DIR="$MAIN_CHECKOUT/tmp/visual-baselines"
  mkdir -p "$OUTPUT_DIR"

  echo "[visual-regression] Updating baselines in $OUTPUT_DIR..." >&2

  npx tsx "$CAPTURE_SCRIPT" \
    --storybook-url "$STORYBOOK_URL" \
    --output-dir "$OUTPUT_DIR" \
    --threshold "$THRESHOLD" \
    --stories "$STORIES"

else
  # Diff mode: copy baselines from main into worktree, then run diff
  BASELINE_SRC="$MAIN_CHECKOUT/tmp/visual-baselines"
  BASELINE_REF="$WORKTREE/tmp/visual-baselines-ref"
  SCREENSHOT_DIR="$WORKTREE/tmp/visual-screenshots"
  DIFF_DIR="$WORKTREE/tmp/visual-diffs"

  mkdir -p "$SCREENSHOT_DIR" "$DIFF_DIR"

  # Copy baselines from main checkout if they exist
  if [ -d "$BASELINE_SRC" ] && [ "$(ls -A "$BASELINE_SRC" 2>/dev/null)" ]; then
    echo "[visual-regression] Copying baselines from $BASELINE_SRC..." >&2
    mkdir -p "$BASELINE_REF"
    cp -r "$BASELINE_SRC/." "$BASELINE_REF/"
    BASELINE_ARG="$BASELINE_REF"
  else
    echo "[visual-regression] No baselines found — all stories will be treated as new." >&2
    BASELINE_ARG=""
  fi

  # Run capture + diff
  CAPTURE_ARGS="--storybook-url $STORYBOOK_URL --output-dir $SCREENSHOT_DIR --threshold $THRESHOLD --stories $STORIES"
  if [ -n "$BASELINE_ARG" ]; then
    CAPTURE_ARGS="$CAPTURE_ARGS --baseline-dir $BASELINE_ARG"
  fi

  # Capture output (JSON); allow non-zero exit (failures) so we can propagate it
  RESULT_JSON=""
  CAPTURE_EXIT=0

  # Word-split is intentional here for CAPTURE_ARGS
  # shellcheck disable=SC2086
  RESULT_JSON="$(npx tsx "$CAPTURE_SCRIPT" $CAPTURE_ARGS)" || CAPTURE_EXIT=$?

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
