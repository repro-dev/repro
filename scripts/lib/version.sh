#!/bin/bash
#
# scripts/lib/version.sh — version output for reproctl
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh to be loaded
# first (provides REPO_ROOT, die).

_get_version_tag() {
  git -C "$REPO_ROOT" describe --tags --abbrev=0 2>/dev/null || echo "v0.0.0"
}

_get_version_string() {
  local tag
  tag="$(_get_version_tag)"
  echo "${tag#v}"
}

_get_commit_sha() {
  git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown"
}

_get_commit_date() {
  git -C "$REPO_ROOT" log -1 --format='%cs' 2>/dev/null || echo "unknown"
}

cmd_version() {
  local json=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --json)
        json=true
        shift
        ;;
      -h|--help)
        printf '%s\n' \
          "Usage: reproctl version [--json]" \
          "" \
          "Print the reproctl version." \
          "" \
          "Options:" \
          "  --json    Output structured JSON"
        return 0
        ;;
      *)
        die "Unknown option: $1\nRun 'reproctl version --help' for usage."
        ;;
    esac
  done

  local version commit date
  version="$(_get_version_string)"
  commit="$(_get_commit_sha)"
  date="$(_get_commit_date)"

  if [[ "$json" = true ]]; then
    python3 -c "import json; print(json.dumps({'version': '$version', 'commit': '$commit', 'date': '$date'}))"
  else
    printf 'reproctl v%s (%s)\n' "$version" "$commit"
  fi
}
