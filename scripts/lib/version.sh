#!/bin/bash

_get_commit_sha() {
  git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown"
}

_get_commit_date() {
  git -C "$REPO_ROOT" log -1 --format='%cs' 2>/dev/null || echo "unknown"
}

cmd_version() {
  local json="${REPROCTL_JSON:-false}"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --json)
        json=true
        shift
        ;;
      -h|--help)
        printf '%s\n' \
          "Usage: reproctl [--json] version" \
          "" \
          "Print the reproctl commit and date." \
          "" \
          "The --json global flag outputs structured JSON."
        return 0
        ;;
      *)
        die "Unknown option: $1\nRun 'reproctl version --help' for usage."
        ;;
    esac
  done

  local commit date
  commit="$(_get_commit_sha)"
  date="$(_get_commit_date)"

  if [[ "$json" = true ]]; then
    python3 -c "import json; print(json.dumps({'commit': '$commit', 'date': '$date'}))"
  else
    printf 'reproctl (%s) %s\n' "$commit" "$date"
  fi
}
