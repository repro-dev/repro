#!/bin/bash

set -euo pipefail

TEST_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$TEST_DIR/../../.." && pwd -P)"

_pass() { printf 'ok - %s\n' "$1"; }
_fail() { printf 'not ok - %s\n%s\n' "$1" "${2:-}" >&2; return 1; }

test_reproctl_autobot_uses_thin_ts_wrapper() {
  local tmpdir pnpm_log output rc=0
  tmpdir="$(mktemp -d "$REPO_ROOT/tmp/test_reproctl_autobot.XXXXXX")"
  pnpm_log="$tmpdir/pnpm.log"
  trap 'rm -rf "$tmpdir"' RETURN

  mkdir -p "$tmpdir/bin"
  cat > "$tmpdir/bin/pnpm" <<'EOF'
#!/bin/bash
printf '%s\n' "$@" >> "$PNPM_LOG"
exit 0
EOF
  chmod +x "$tmpdir/bin/pnpm"

  output="$(PATH="$tmpdir/bin:$PATH" PNPM_LOG="$pnpm_log" bash "$REPO_ROOT/scripts/reproctl.sh" autobot --help 2>&1)" || rc=$?

  if [ $rc -eq 0 ] && [ -f "$pnpm_log" ] && grep -q 'src/cli.ts' "$pnpm_log" && grep -q '^autobot$' "$pnpm_log"; then
    _pass 'reproctl autobot dispatches to the TS wrapper'
  else
    local pnpm_contents
    pnpm_contents="$(cat "$pnpm_log" 2>/dev/null || true)"
    _fail 'reproctl autobot dispatches to the TS wrapper' "rc=$rc; output=$output; pnpm_log=$pnpm_contents"
  fi
}

test_reproctl_autobot_uses_thin_ts_wrapper
