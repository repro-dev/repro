#!/usr/bin/env bash
# visual-regression.sh
#
# Bash 3.2-compatible wrapper: serves the PREBUILT Storybook bundle
# (apps/storybook-ui/storybook-static) with a static HTTP server (or reuses
# a running server via REPRO_STORYBOOK_URL), captures screenshots, and runs
# pixel-level diffs against the committed baselines.
#
# Static serving (REP-1648): the wrappers no longer boot the Vite dev server.
# Upstream @storybook/test-runner loses its one-shot setup-page script when
# Vite re-optimizes/reloads mid-run (upstream issue #68), which flaked CI run
# 34275653377 with `page.evaluate: ReferenceError: __test is not defined`.
# Serving the static build removes the reload window. The bundle must be
# built first: `moon run repro/storybook-ui:build` (the moon gate tasks and
# the regenerate-visual-baselines workflow do this automatically).
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
#   REPRO_STORYBOOK_URL  When set (non-empty), skip serving the local bundle
#                        and reuse the running server. This is an opt-in for
#                        manually sharing one Storybook across wrappers; the
#                        CI gate tasks serve their own bundle independently.
#
# When --update-baselines is set: captures straight into the baseline dir
# (committed dir unless --baseline-dir overrides it). Otherwise: diffs against
# the baseline dir, writes diff PNGs to tmp/visual-diffs/.
#
# Outputs the JSON from the capture script to stdout.
# Exits 0 if all pass, non-zero if any fail (or --fail-on-new and any new story).

set -euo pipefail

# Non-fatal darwin warning: baselines are generated on Linux (docs/visual-regression.md),
# and macOS rasterization drift can produce false diffs in both directions.
warn_darwin_baseline_drift() {
  if [ "$(uname -s)" = "Darwin" ]; then
    echo "[visual-regression] WARNING: baselines are generated on Linux to match CI" >&2
    echo "[visual-regression] WARNING: runners rasterize text differently from macOS." >&2
    echo "[visual-regression] WARNING: Diffs taken on macOS may produce false diffs (and macOS captures may produce false diffs in CI)." >&2
    echo "[visual-regression] WARNING: See docs/visual-regression.md to separate a real visual change from platform/runner drift." >&2
  fi
}

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
  --threshold <float>     Pixel diff threshold as fraction (default: 0.001;
                          must be a finite number between 0 and 1)
  --fail-on-new           Exit non-zero when a story has no committed baseline
  --update-baselines      Capture into the baseline dir instead of diffing
  --port <n>              Static Storybook server port (default: 6099;
                          ignored when REPRO_STORYBOOK_URL is set)
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
  # No Storybook setup — fail closed. The visual gate verified nothing, and
  # a gate that checked nothing must not report green (same contract as the
  # zero-story capture check).
  echo "Error: no Storybook package found in $REPO_ROOT — expected apps/storybook-ui, or a .storybook/ dir under apps/ or packages/" >&2
  cat <<EOF
{
  "stories_checked": [],
  "passed": [],
  "failed": [],
  "new_stories": [],
  "error": "No Storybook setup found in $REPO_ROOT — visual gate failed closed"
}
EOF
  exit 1
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
# Static Storybook bundle check (REP-1648): the wrappers serve the PREBUILT
# storybook-static output with a plain static HTTP server instead of booting
# the Vite dev server — the test-runner's one-shot setup-page script is lost
# when Vite re-optimizes/reloads mid-run (upstream issue #68; CI run
# 34275653377 failed 30 stories with `__test is not defined`). A static
# server removes the reload window entirely.
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

  # The capture script and the test-runner drive /, /iframe.html and
  # /index.json; an incomplete build would fail much later with confusing
  # browser errors, so fail closed here instead.
  for required_file in index.html iframe.html index.json; do
    if [ ! -f "$static_dir/$required_file" ]; then
      echo "Error: prebuilt Storybook bundle is incomplete: $static_dir/$required_file is missing" >&2
      echo "  Rebuild it with: moon run repro/storybook-ui:build" >&2
      exit 1
    fi
  done
}

# ---------------------------------------------------------------------------
# Validate the threshold BEFORE any server boot. An invalid value would
# otherwise only fail after a 90s server startup — and NaN would make
# every diff pass. Same contract as the capture script's parseThreshold:
# a finite number in [0, 1]. Bash 3.2 has no float arithmetic, so awk
# enforces both the decimal format and the range in one check.
# ---------------------------------------------------------------------------

validate_threshold() {
  local value="$1"

  if ! awk -v t="$value" 'BEGIN { exit (t ~ /^[0-9]*\.?[0-9]+$/ && t + 0 >= 0 && t + 0 <= 1) ? 0 : 1 }'; then
    echo "[visual-regression] Error: --threshold \"$value\" is invalid: it must be a finite number between 0 and 1 (a fraction of pixels, e.g. 0.001 = 0.1%). See docs/visual-regression.md." >&2
    return 1
  fi
}

if ! validate_threshold "$THRESHOLD"; then
  exit 1
fi

# ---------------------------------------------------------------------------
# Reuse an externally booted Storybook (REPRO_STORYBOOK_URL contract) or boot one
# ---------------------------------------------------------------------------

cleanup() {
  if [ -n "$STORYBOOK_PID" ]; then
    echo "[visual-regression] Stopping static Storybook server (PID $STORYBOOK_PID)..." >&2
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
  # Serve the PREBUILT storybook-static bundle (see the REP-1648 note above).
  # Only the REPRO_STORYBOOK_URL reuse path skips this check — the reused
  # server is external and does not read the local bundle.
  STORYBOOK_STATIC_DIR="$STORYBOOK_PKG/storybook-static"
  require_static_storybook "$STORYBOOK_STATIC_DIR"

  if ! command -v python3 >/dev/null 2>&1; then
    echo "Error: python3 is required to serve the prebuilt Storybook bundle but was not found on PATH" >&2
    exit 1
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

  trap cleanup EXIT

  echo "[visual-regression] Serving prebuilt Storybook static bundle on port $STORYBOOK_PORT..." >&2
  echo "  $STORYBOOK_STATIC_DIR (python3 -m http.server)" >&2
  python3 -m http.server "$STORYBOOK_PORT" --bind 127.0.0.1 --directory "$STORYBOOK_STATIC_DIR" >/dev/null 2>&1 &
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
# Derived from the (possibly --repo-root-overridden) root at use time, so a
# fixture checkout diffs against ITS OWN committed baselines.
BASELINE_DIR="${BASELINE_DIR_ARG:-$REPO_ROOT/tmp/visual-baselines}"

if [ "$UPDATE_BASELINES" = "true" ]; then
  warn_darwin_baseline_drift

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

  # Bash 3.2-compatible indexed array with quoted elements: no word
  # splitting, so the JSON --stories payload and any paths with spaces stay
  # intact (previously an unquoted, word-split string).
  CAPTURE_ARGS=(
    --storybook-url "$STORYBOOK_URL"
    --output-dir "$SCREENSHOT_DIR"
    --threshold "$THRESHOLD"
    --stories "$STORIES"
  )

  # Fail closed when the baseline directory is absent: the committed
  # tmp/visual-baselines dir is tracked in the repo (sentinel .gitkeep), so a
  # missing directory means a broken checkout or a bad --baseline-dir.
  if [ ! -d "$BASELINE_DIR" ]; then
    echo "Error: baseline directory does not exist: $BASELINE_DIR" >&2
    echo "  Baselines are committed under tmp/visual-baselines. Regenerate them" >&2
    echo "  via the regenerate-visual-baselines workflow dispatch" >&2
    echo "  (see docs/visual-regression.md)." >&2
    exit 1
  fi

  warn_darwin_baseline_drift

  # .gitkeep is a tracked placeholder, not a baseline — count only PNGs.
  BASELINE_COUNT="$(find "$BASELINE_DIR" -maxdepth 1 -name '*.png' -type f 2>/dev/null | wc -l | tr -d '[:space:]')"
  if [ "$BASELINE_COUNT" -gt 0 ]; then
    echo "[visual-regression] Diffing against ${BASELINE_COUNT} baseline(s) in $BASELINE_DIR..." >&2
    CAPTURE_ARGS+=(--baseline-dir "$BASELINE_DIR")
  else
    echo "[visual-regression] No baselines found in $BASELINE_DIR — all stories will be treated as new." >&2
  fi

  if [ "$FAIL_ON_NEW" = "true" ]; then
    CAPTURE_ARGS+=(--fail-on-new)
  fi

  # Run capture + diff. Allow non-zero exit (failures) so we can propagate it.
  RESULT_JSON=""
  CAPTURE_EXIT=0

  RESULT_JSON="$(pnpm exec tsx "$CAPTURE_SCRIPT" "${CAPTURE_ARGS[@]}")" || CAPTURE_EXIT=$?

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
