#!/usr/bin/env bash
set -euo pipefail

WARN_THRESHOLD=400
ERROR_THRESHOLD=500
WARN_ONLY=false

usage() {
  echo "Usage: $0 [--warn-only] [--warn-threshold N] [--error-threshold N]" >&2
  exit 2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --warn-only)
      WARN_ONLY=true
      shift
      ;;
    --warn-threshold)
      [ "$#" -ge 2 ] || usage
      WARN_THRESHOLD="$2"
      shift 2
      ;;
    --error-threshold)
      [ "$#" -ge 2 ] || usage
      ERROR_THRESHOLD="$2"
      shift 2
      ;;
    *) usage ;;
  esac
done

exit_code=0
warn_count=0
error_count=0

is_ci=false
if [ -n "${CI:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ]; then
  is_ci=true
fi

get_candidate_files() {
  if [ "$is_ci" = true ]; then
    base_ref="origin/${GITHUB_BASE_REF:-main}"
    if ! git rev-parse --verify --quiet "$base_ref" >/dev/null; then
      base_ref="HEAD~1"
    fi

    git diff --name-only --diff-filter=AM "$base_ref...HEAD" | while IFS= read -r file; do
      case "$file" in
        *.test.ts|*.test.tsx) printf '%s\n' "$file" ;;
      esac
    done
    return
  fi

  find . \
    \( -path './node_modules' -o -path './dist' -o -path './.git' \) -prune -o \
    \( -name "*.test.ts" -o -name "*.test.tsx" \) -print | sort
}

while IFS= read -r file; do
  lines=$(wc -l < "$file" | tr -d ' ')
  if [ "$lines" -gt "$ERROR_THRESHOLD" ]; then
    if [ "$WARN_ONLY" = true ]; then
      echo "WARN: $file has $lines lines (warning threshold: $WARN_THRESHOLD)"
      warn_count=$((warn_count + 1))
    else
      echo "ERROR: $file has $lines lines (limit: $ERROR_THRESHOLD)" >&2
      exit_code=1
      error_count=$((error_count + 1))
    fi
  elif [ "$lines" -gt "$WARN_THRESHOLD" ]; then
    echo "WARN: $file has $lines lines (warning threshold: $WARN_THRESHOLD)"
    warn_count=$((warn_count + 1))
  fi
done < <(get_candidate_files)

echo ""
echo "Test file size check complete: $error_count error(s), $warn_count warning(s)"

exit $exit_code
