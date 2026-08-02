#!/bin/bash
# scripts/lib/tests/test_deliver.sh
#
# Unit tests for the deliver.sh script:
#   - REP-1448: --profile and --pick flags for OpenCode profile selection.
#   - REP-1614: --skip-install plumbing into `reproctl.sh wt create`, the
#     two-pane Stage-3 layout (opencode 70% / terminal 30%, no Neovim), and
#     the deferred `pnpm install` sent to the terminal pane.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
DELIVER_SH="$TESTS_DIR/../../deliver.sh"
REPO_ROOT="$(cd "$TESTS_DIR/../../.." && pwd -P)"

# Never leak sandboxes: a test that dies early (set -e) would skip its rm -rf.
trap 'rm -rf "$REPO_ROOT"/tmp/test_deliver.* 2>/dev/null || true' EXIT

# ── Harness ──────────────────────────────────────────────────────────
#
# The sandbox (tmpdir) lives under the real repo's tmp/ and is its own git
# repo, so common.sh resolves REPO_ROOT/MAIN_CHECKOUT to a real git repo
# with a tmp/ directory while the tests fully control .opencode/profiles,
# herdr, and linear. CALLER_PWD points at the sandbox — a directory inside
# the real repo, exactly as common.sh expects.
#
# Directory structure:
#   $tmpdir/scripts/deliver.sh    — copy of real deliver.sh
#   $tmpdir/scripts/reproctl.sh   — stub
#   $tmpdir/scripts/lib/          — copy of real scripts/lib
#   $tmpdir/herdr                 — stub (status/workspace/pane/agent)
#   $tmpdir/linear                — stub
#   $tmpdir/.opencode/profiles/   — profile fixtures
#   $tmpdir/tmp                   — MAIN_CHECKOUT/tmp for herdr mktemp files

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

# Create a temp directory under the real repo's tmp/ (Bash 3.2 safe).
_make_tmpdir() {
  mkdir -p "$REPO_ROOT/tmp"
  mktemp -d "$REPO_ROOT/tmp/test_deliver.XXXXXX"
}

_write_stubs() {
  local tmpdir="$1"

  mkdir -p "$tmpdir/scripts"
  mkdir -p "$tmpdir/.opencode/profiles"
  mkdir -p "$tmpdir/tmp"

  # The sandbox must be a git repo so common.sh can resolve REPO_ROOT.
  git init -q "$tmpdir" || return 1

  # Copy real libs so deliver.sh can source common.sh + worktree.sh.
  cp -R "$REPO_ROOT/scripts/lib" "$tmpdir/scripts/lib" || return 1

  # reproctl.sh stub: print received args plus a worktree Path line (mirrors
  # real reproctl output) so deliver.sh skips its git-worktree fallback scan.
  cat > "$tmpdir/scripts/reproctl.sh" << 'STUB'
#!/bin/bash
echo "REPROCTL_ARGS: $*"
echo "Path: $(dirname "$(dirname "$0")")/repro-wt-rep-123"
STUB
  chmod +x "$tmpdir/scripts/reproctl.sh"

  # linear stub: deterministic JSON, no Bug label.
  cat > "$tmpdir/linear" << 'STUB'
#!/bin/bash
echo '{"item":{"id":"uuid-1","identifier":"REP-123","title":"Test issue","branchName":"feat/rep-123-test","status":{"name":"Todo","type":"unstarted"},"labels":[]}}'
STUB
  chmod +x "$tmpdir/linear"

  # herdr stub: status, workspace open, pane list/split/run, agent start.
  # The pane split case records its arguments so tests can assert the ratio.
  # When HERDR_STUB_WORKTREE_OPEN_FAIL=1, `worktree open` fails (non-zero
  # exit + empty JSON) so the herdr-down fallback path can be exercised.
  cat > "$tmpdir/herdr" << 'STUB'
#!/bin/bash
  case "${1:-}" in
  status) exit 0 ;;
  worktree)
    if [ "${HERDR_STUB_WORKTREE_OPEN_FAIL:-0}" = "1" ]; then
      echo 'herdr: daemon not ready' >&2
      exit 1
    fi
    echo '{"result":{"workspace":{"workspace_id":"ws-123"}}}'
    exit 0
    ;;
  pane)
    case "${2:-}" in
      list) echo '{"result":{"panes":[{"pane_id":"pane-root"}]}}'; exit 0 ;;
      split)
        printf '%s\n' "$*" > "$(dirname "$0")/herdr_split_args.log"
        echo '{"result":{"pane":{"pane_id":"pane-right"}}}'
        exit 0
        ;;
      run) echo "HERDR_PANE_RUN: $*"; exit 0 ;;
      *) echo "HERDR_PANE_UNKNOWN: $*"; exit 0 ;;
    esac
    ;;
  agent) echo "HERDR_AGENT_ARGS: $*"; exit 0 ;;
  *) echo "HERDR_UNKNOWN: $*"; exit 0 ;;
esac
STUB
  chmod +x "$tmpdir/herdr"
}

# Write a test runner script into $tmpdir/run_test.sh.
# Copies deliver.sh into the tmpdir scripts/ subdir so SCRIPT_DIR resolves
# to the sandbox. Stubs are found there for reproctl.sh and via PATH for
# herdr and linear. CALLER_PWD points at the sandbox so common.sh resolves
# REPO_ROOT/MAIN_CHECKOUT against the sandbox git repo.
_write_runner() {
  local tmpdir="$1"
  local args="$2"

  cp "$DELIVER_SH" "$tmpdir/scripts/deliver.sh" || return 1

  printf '#!/bin/bash\nexport CALLER_PWD="%s"\nexport PATH="%s:$PATH"\nexec bash "%s/scripts/deliver.sh" %s\n' \
    "$tmpdir" "$tmpdir" "$tmpdir" "$args" > "$tmpdir/run_test.sh"
  chmod +x "$tmpdir/run_test.sh"
}

# ── Tests ─────────────────────────────────────────────────────────────

# Test 1: No flags uses REPRO_OPENCODE_PROFILE default (deepseek-v4)
test_no_flags_uses_default() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "REP-123"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q 'REPROCTL_ARGS: wt create --from-issue REP-123 --skip-install --no-status-update' \
    && printf '%s\n' "$output" | grep -q 'REPRO_OPENCODE_PROFILE='; then
    _pass "no flags uses REPRO_OPENCODE_PROFILE default (deepseek-v4)"
  else
    _fail "no flags uses REPRO_OPENCODE_PROFILE default (deepseek-v4)" "rc=$rc; output: $output"
  fi
}

# Test 2: --profile flag passes profile name to opencode
test_profile_flag_passes_profile() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  echo '{}' > "$tmpdir/.opencode/profiles/beta.json"
  _write_runner "$tmpdir" "REP-123 --profile beta"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q 'REPROCTL_ARGS: wt create --from-issue REP-123 --skip-install --no-status-update' \
    && printf '%s\n' "$output" | grep -qF 'opencode --profile' \
    && printf '%s\n' "$output" | grep -qF -- 'beta'; then
    _pass "--profile beta passes --profile beta to opencode"
  else
    _fail "--profile beta passes --profile beta to opencode" "rc=$rc; output: $output"
  fi
}

# Test 3: --profile flag before issue ID
test_profile_flag_before_issue() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  echo '{}' > "$tmpdir/.opencode/profiles/beta.json"
  _write_runner "$tmpdir" "--profile beta REP-123"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q 'REPROCTL_ARGS: wt create --from-issue REP-123 --skip-install --no-status-update' \
    && printf '%s\n' "$output" | grep -qF 'opencode --profile' \
    && printf '%s\n' "$output" | grep -qF -- 'beta'; then
    _pass "--profile beta before issue ID works"
  else
    _fail "--profile beta before issue ID works" "rc=$rc; output: $output"
  fi
}

# Test 4: --pick auto-selects single profile, passes --profile to opencode
test_pick_autoselects_single() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  echo '{}' > "$tmpdir/.opencode/profiles/beta.json"
  _write_runner "$tmpdir" "REP-123 --pick"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q 'REPROCTL_ARGS: wt create --from-issue REP-123 --skip-install --no-status-update' \
    && printf '%s\n' "$output" | grep -qF 'opencode --profile' \
    && printf '%s\n' "$output" | grep -qF -- 'beta' \
    && ! printf '%s\n' "$output" | grep -q -- '--pick'; then
    _pass "--pick auto-selects single profile, passes --profile beta"
  else
    _fail "--pick auto-selects single profile, passes --profile beta" "rc=$rc; output: $output"
  fi
}

# Test 5: --pick flag before issue ID, auto-selects single profile
test_pick_before_issue_autoselects() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  echo '{}' > "$tmpdir/.opencode/profiles/beta.json"
  _write_runner "$tmpdir" "--pick REP-123"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q 'REPROCTL_ARGS: wt create --from-issue REP-123 --skip-install --no-status-update' \
    && printf '%s\n' "$output" | grep -qF 'opencode --profile' \
    && printf '%s\n' "$output" | grep -qF -- 'beta'; then
    _pass "--pick before issue ID auto-selects single profile"
  else
    _fail "--pick before issue ID auto-selects single profile" "rc=$rc; output: $output"
  fi
}

# Test 6: --help prints usage and exits 0
test_help_exits_zero() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "--help"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'Usage: deliver'; then
    _pass "--help prints usage and exits 0"
  else
    _fail "--help prints usage and exits 0" "rc=$rc; output: $output"
  fi
}

# Test 7: -h also prints usage and exits 0
test_h_flag_exits_zero() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "-h"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'Usage: deliver'; then
    _pass "-h prints usage and exits 0"
  else
    _fail "-h prints usage and exits 0" "rc=$rc; output: $output"
  fi
}

# Test 8: Missing args prints usage and exits 1
test_missing_args_exits_one() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" ""

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q 'Usage: deliver'; then
    _pass "missing args prints usage and exits 1"
  else
    _fail "missing args prints usage and exits 1" "rc=$rc; output: $output"
  fi
}

# Test 9: Argument that is not an issue ID / PR / branch errors
test_invalid_argument_errors() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "-bad"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q 'Invalid argument'; then
    _pass "invalid argument fails with error message"
  else
    _fail "invalid argument fails with error message" "rc=$rc; output: $output"
  fi
}

# Test 10: --profile without value errors
test_profile_missing_value() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "REP-123 --profile"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q 'requires a value'; then
    _pass "--profile without value errors with message"
  else
    _fail "--profile without value errors with message" "rc=$rc; output: $output"
  fi
}

# Test 11: --profile with nonexistent profile errors with available list
test_profile_nonexistent() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  # Create some profiles so the "available" list is non-empty
  echo '{}' > "$tmpdir/.opencode/profiles/alpha.json"
  echo '{}' > "$tmpdir/.opencode/profiles/beta.json"
  _write_runner "$tmpdir" "REP-123 --profile nonexistent"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -ne 0 ] \
    && printf '%s\n' "$output" | grep -q "Profile 'nonexistent' not found" \
    && printf '%s\n' "$output" | grep -q "Available profiles:"; then
    _pass "--profile nonexistent errors with profile not found and available list"
  else
    _fail "--profile nonexistent errors with profile not found and available list" "rc=$rc; output: $output"
  fi
}

# Test 12: --profile and --pick are mutually exclusive
test_profile_and_pick_mutually_exclusive() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  echo '{}' > "$tmpdir/.opencode/profiles/beta.json"
  _write_runner "$tmpdir" "REP-123 --profile beta --pick"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q "mutually exclusive"; then
    _pass "--profile and --pick are mutually exclusive"
  else
    _fail "--profile and --pick are mutually exclusive" "rc=$rc; output: $output"
  fi
}

# Test 13: --profile and --pick mutually exclusive (reverse order)
test_pick_and_profile_mutually_exclusive() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  echo '{}' > "$tmpdir/.opencode/profiles/beta.json"
  _write_runner "$tmpdir" "--profile beta REP-123 --pick"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q "mutually exclusive"; then
    _pass "--profile and --pick mutually exclusive (flags around issue ID)"
  else
    _fail "--profile and --pick mutually exclusive (flags around issue ID)" "rc=$rc; output: $output"
  fi
}

# Test 14: REPRO_OPENCODE_PROFILE env var is honored
test_env_var_is_honored() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  echo '{}' > "$tmpdir/.opencode/profiles/gamma.json"
  _write_runner "$tmpdir" "REP-123"

  local output
  output="$(REPRO_OPENCODE_PROFILE=gamma bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q 'REPROCTL_ARGS: wt create --from-issue REP-123 --skip-install --no-status-update' \
    && printf '%s\n' "$output" | grep -q 'gamma'; then
    _pass "REPRO_OPENCODE_PROFILE=gamma is honored"
  else
    _fail "REPRO_OPENCODE_PROFILE=gamma is honored" "rc=$rc; output: $output"
  fi
}

# Test 15: --profile overrides REPRO_OPENCODE_PROFILE env var
test_profile_overrides_env_var() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  echo '{}' > "$tmpdir/.opencode/profiles/beta.json"
  _write_runner "$tmpdir" "REP-123 --profile beta"

  local output
  output="$(REPRO_OPENCODE_PROFILE=gamma bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  # Should contain --profile beta in the herdr command, NOT use the env var
  if printf '%s\n' "$output" | grep -qF 'opencode --profile' \
    && printf '%s\n' "$output" | grep -qF -- 'beta'; then
    _pass "--profile beta overrides REPRO_OPENCODE_PROFILE=gamma"
  else
    _fail "--profile beta overrides REPRO_OPENCODE_PROFILE=gamma" "rc=$rc; output: $output"
  fi
}

# Test 16: --pick overrides REPRO_OPENCODE_PROFILE env var
test_pick_overrides_env_var() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  echo '{}' > "$tmpdir/.opencode/profiles/beta.json"
  _write_runner "$tmpdir" "REP-123 --pick"

  local output
  output="$(REPRO_OPENCODE_PROFILE=gamma bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  # Should resolve --pick to --profile beta (the single available profile), ignoring env
  if printf '%s\n' "$output" | grep -qF 'opencode --profile' \
    && printf '%s\n' "$output" | grep -qF -- 'beta' \
    && ! printf '%s\n' "$output" | grep -q -- 'gamma'; then
    _pass "--pick ignores REPRO_OPENCODE_PROFILE=gamma, resolves to beta"
  else
    _fail "--pick ignores REPRO_OPENCODE_PROFILE=gamma, resolves to beta" "rc=$rc; output: $output"
  fi
}

# Test 17: Stage-3 layout is two panes — pnpm install deferred to the
# terminal pane, no Neovim split, right pane at 30%.
test_layout_is_two_pane_with_pnpm_install() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "REP-123"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  local split_log="$tmpdir/herdr_split_args.log"
  local split_args=""
  if [ -f "$split_log" ]; then
    split_args="$(cat "$split_log")"
  fi
  rm -rf "$tmpdir"

  local ok=1
  # pnpm install is sent to the terminal (right) pane after layout
  printf '%s\n' "$output" | grep -q 'HERDR_PANE_RUN:.*pane-right' || ok=0
  printf '%s\n' "$output" | grep -q 'pnpm install' || ok=0
  # Neovim is never launched
  if printf '%s\n' "$output" | grep -qi 'nvim'; then ok=0; fi
  # The right pane is a single 30% split — no nested vertical split
  printf '%s\n' "$split_args" | grep -q -- '--ratio 0.3' || ok=0
  if printf '%s\n' "$split_args" | grep -q -- '--direction down'; then ok=0; fi

  if [ $ok -eq 1 ]; then
    _pass "Stage 3 is a 2-pane layout; pnpm install deferred to terminal pane; no nvim"
  else
    _fail "Stage 3 is a 2-pane layout; pnpm install deferred to terminal pane; no nvim" "rc=$rc; output: $output; split_args: $split_args"
  fi
}

# Test 18: herdr-down fallback — when `herdr worktree open` fails there is
# no pane to defer pnpm install to, so dependencies must still be installed
# synchronously in the worktree path.
test_herdr_down_installs_synchronously() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "REP-123"

  # A pnpm stub on the sandbox PATH makes the synchronous install cheap and
  # observable (the reproctl stub reports Path: <tmpdir>/repro-wt-rep-123).
  cat > "$tmpdir/pnpm" << 'STUB'
#!/bin/bash
echo "SYNC_PNPM_INSTALL: $*"
exit 0
STUB
  chmod +x "$tmpdir/pnpm"
  mkdir -p "$tmpdir/repro-wt-rep-123"

  local output
  output="$(HERDR_STUB_WORKTREE_OPEN_FAIL=1 bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  local ok=1
  # The herdr-down warning is emitted
  printf '%s\n' "$output" | grep -q 'Could not open herdr workspace' || ok=0
  # pnpm install ran synchronously in the worktree path
  printf '%s\n' "$output" | grep -q 'SYNC_PNPM_INSTALL: install' || ok=0
  # The install was NOT deferred to a terminal pane
  if printf '%s\n' "$output" | grep -q 'HERDR_PANE_RUN:.*pnpm install'; then ok=0; fi

  if [ $ok -eq 1 ]; then
    _pass "herdr-down fallback installs dependencies synchronously in the worktree"
  else
    _fail "herdr-down fallback installs dependencies synchronously in the worktree" "rc=$rc; output: $output"
  fi
}

# Test 19: deliver.sh file exists
test_file_exists() {
  if [ -f "$DELIVER_SH" ]; then
    _pass "deliver.sh exists"
  else
    _fail "deliver.sh exists" "file not found: $DELIVER_SH"
  fi
}

# ── Run all tests ──────────────────────────────────────────────────────

test_file_exists
test_no_flags_uses_default
test_profile_flag_passes_profile
test_profile_flag_before_issue
test_pick_autoselects_single
test_pick_before_issue_autoselects
test_help_exits_zero
test_h_flag_exits_zero
test_missing_args_exits_one
test_invalid_argument_errors
test_profile_missing_value
test_profile_nonexistent
test_profile_and_pick_mutually_exclusive
test_pick_and_profile_mutually_exclusive
test_env_var_is_honored
test_profile_overrides_env_var
test_pick_overrides_env_var
test_layout_is_two_pane_with_pnpm_install
test_herdr_down_installs_synchronously

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
