#!/bin/bash
# scripts/lib/tests/test_restart_next_assets.sh
#
# Regression test for REP-1091: restarting a Next local service should clear
# stale route assets before triggering Tilt.

set -euo pipefail

WORKTREE_ROOT="$(pwd -P)"
# common.sh prefers CALLER_PWD; force it to stay on this worktree.
CALLER_PWD="$WORKTREE_ROOT"
REPO_ROOT="$WORKTREE_ROOT"

tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_restart_next_assets.XXXXXX")"

mkdir -p "$tmpdir/apps/marketing/.next" "$tmpdir/infra" "$tmpdir/tmp"

cat > "$tmpdir/infra/services.json" <<'JSON'
{
  "marketing": {
    "type": "local",
    "description": "Marketing site",
    "moon_project": "repro/marketing",
    "app_dir": "apps/marketing",
    "serve_cmd": "portless marketing.repro moon run repro/marketing:dev",
    "portless_name": "marketing.repro",
    "deps": []
  }
}
JSON

cat > "$tmpdir/apps/marketing/package.json" <<'JSON'
{
  "dependencies": {
    "next": "^15.3.1"
  }
}
JSON

source "$REPO_ROOT/scripts/lib/common.sh"
source "$REPO_ROOT/scripts/lib/services.sh"

REPO_ROOT="$tmpdir"
MAIN_CHECKOUT="$tmpdir"
WORKSPACE_ROOT="$tmpdir"
TMP_DIR="$tmpdir/tmp"
CONFIG_FILE="$tmpdir/tmp/reproctl_services.json"
SERVICES_JSON="$tmpdir/infra/services.json"
SCRIPTS_DIR="$WORKTREE_ROOT/scripts"

die() { printf 'Error: %b\n' "$*" >&2; exit 1; }
_step() { :; }
_ok() { :; }
_warn() { :; }
print_services() { :; }

tilt() {
  case "$1" in
    get)
      case "$2" in
        session) return 0 ;;
        uiresource) return 0 ;;
      esac
      ;;
    trigger)
      if [ -e "$REPO_ROOT/apps/marketing/.next" ]; then
        printf 'FAIL: .next still existed when Tilt was triggered\n' >&2
        exit 1
      fi
      return 0
      ;;
  esac

  printf 'FAIL: unexpected tilt call: %s\n' "$*" >&2
  exit 1
}

cmd_restart marketing >/dev/null 2>&1 || die "restart command failed"

if [ -d "$REPO_ROOT/apps/marketing/.next" ]; then
  die "expected .next to be removed before restart"
fi
