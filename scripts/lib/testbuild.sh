#!/bin/bash
#
# scripts/lib/testbuild.sh — test, typecheck, and build wrappers
#
# Sourced by reproctl.sh. Expects scripts/lib/common.sh to be loaded
# first (provides REPO_ROOT, SERVICES_JSON, SCRIPTS_DIR, die).

_resolve_moon_project() {
  local name="$1"

  local moon_project
  moon_project=$(python3 -c "
import json, sys
with open('$SERVICES_JSON') as f:
    services = json.load(f)
svc = services.get('$name')
if svc and 'moon_project' in svc:
    print(svc['moon_project'])
")

  if [ -n "$moon_project" ]; then
    echo "$moon_project"
    return 0
  fi

  echo "repro/$name"
}

_usage_test() {
  cat <<'EOF'
Usage: reproctl test [options] [<target>]

Run tests for a service or package.

  <target>              Service or package name (e.g. api-server, design)
  --all                 Run tests across all projects
  --file <path>         Run a single test file with tsx

Examples:
  reproctl test api-server
  reproctl test design
  reproctl test --all
  reproctl test --file apps/api-server/src/routes/auth.test.ts
EOF
}

cmd_test() {
  local target=""
  local all=false
  local file=""

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help)
        _usage_test
        return 0
        ;;
      --all)
        all=true
        shift
        ;;
      --file)
        [ -z "${2:-}" ] && die "Missing argument for --file"
        file="$2"
        shift 2
        ;;
      -*)
        die "Unknown option: $1\nRun 'reproctl test --help' for usage."
        ;;
      *)
        target="$1"
        shift
        ;;
    esac
  done

  if [ -n "$file" ]; then
    exec tsx --experimental-test-module-mocks --test "$file"
  fi

  if [ "$all" = true ]; then
    exec moon run :test
  fi

  if [ -z "$target" ]; then
    die "A target is required.\nRun 'reproctl test --help' for usage."
  fi

  local project
  project="$(_resolve_moon_project "$target")"
  exec moon run "$project:test"
}

_usage_typecheck() {
  cat <<'EOF'
Usage: reproctl typecheck [options] [<target>]

Run type-checking for a service or package.

  <target>              Service or package name (e.g. api-server, design)
  --all                 Run typecheck across all projects

Examples:
  reproctl typecheck api-server
  reproctl typecheck --all
EOF
}

cmd_typecheck() {
  local target=""
  local all=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help)
        _usage_typecheck
        return 0
        ;;
      --all)
        all=true
        shift
        ;;
      -*)
        die "Unknown option: $1\nRun 'reproctl typecheck --help' for usage."
        ;;
      *)
        target="$1"
        shift
        ;;
    esac
  done

  if [ "$all" = true ]; then
    exec moon run :typecheck
  fi

  if [ -z "$target" ]; then
    die "A target is required.\nRun 'reproctl typecheck --help' for usage."
  fi

  local project
  project="$(_resolve_moon_project "$target")"
  exec moon run "$project:typecheck"
}

_usage_build() {
  cat <<'EOF'
Usage: reproctl build [options] [<target>]

Run a build for a service or package.

  <target>              Service or package name (e.g. api-server, design)
  --all                 Run build across all projects

Examples:
  reproctl build api-server
  reproctl build --all
EOF
}

cmd_build() {
  local target=""
  local all=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help)
        _usage_build
        return 0
        ;;
      --all)
        all=true
        shift
        ;;
      -*)
        die "Unknown option: $1\nRun 'reproctl build --help' for usage."
        ;;
      *)
        target="$1"
        shift
        ;;
    esac
  done

  if [ "$all" = true ]; then
    exec moon run :build
  fi

  if [ -z "$target" ]; then
    die "A target is required.\nRun 'reproctl build --help' for usage."
  fi

  local project
  project="$(_resolve_moon_project "$target")"
  exec moon run "$project:build"
}
