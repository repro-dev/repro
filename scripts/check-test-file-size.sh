#!/usr/bin/env bash
set -euo pipefail

WARN_THRESHOLD=400
ERROR_THRESHOLD=500

while [ "$#" -gt 0 ]; do
  case "$1" in
    --warn-threshold) WARN_THRESHOLD="$2"; shift 2 ;;
    --error-threshold) ERROR_THRESHOLD="$2"; shift 2 ;;
    *) shift ;;
  esac
done

exit_code=0
warn_count=0
error_count=0

while IFS= read -r file; do
  lines=$(wc -l < "$file" | tr -d ' ')
  if [ "$lines" -gt "$ERROR_THRESHOLD" ]; then
    echo "ERROR: $file has $lines lines (limit: $ERROR_THRESHOLD)" >&2
    exit_code=1
    error_count=$((error_count + 1))
  elif [ "$lines" -gt "$WARN_THRESHOLD" ]; then
    echo "WARN: $file has $lines lines (warning threshold: $WARN_THRESHOLD)"
    warn_count=$((warn_count + 1))
  fi
done < <(find . \( -name "*.test.ts" -o -name "*.test.tsx" \) \
  | grep -v node_modules | grep -v dist | grep -v ".git" | sort)

echo ""
echo "Test file size check complete: $error_count error(s), $warn_count warning(s)"

exit $exit_code
