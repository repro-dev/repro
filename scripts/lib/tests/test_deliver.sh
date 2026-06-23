#!/bin/bash
# scripts/lib/tests/test_deliver.sh
#
# Unit tests for the deliver.sh script (REP-1448): --profile and --pick flags
# for OpenCode profile selection.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
DELIVER_SH="$TESTS_DIR/../../deliver.sh"

# ── Harness ──────────────────────────────────────────────────────────

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

# Create a temp directory (Bash 3.2 safe).
_make_tmpdir() {
  mktemp -d 2>/dev/null || mktemp -d -t test_deliver
}

# Write stubs into a tmpdir.
# Directory structure:
#   $tmpdir/scripts/reproctl.sh   — stub
#   $tmpdir/scripts/deliver.sh     — copy of real deliver.sh
#   $tmpdir/herdr                 — stub
#   $tmpdir/python3               — stub
#   $tmpdir/.opencode/profiles/   — profile fixtures
_write_stubs() {
  local tmpdir="$1"

  mkdir -p "$tmpdir/scripts"
  mkdir -p "$tmpdir/.opencode/profiles"

  # reproctl.sh stub: print received args.
  cat > "$tmpdir/scripts/reproctl.sh" << 'STUB'
#!/bin/bash
echo "REPROCTL_ARGS: $*"
STUB
  chmod +x "$tmpdir/scripts/reproctl.sh"

  # herdr stub: handle status, workspace list, and agent start.
  cat > "$tmpdir/herdr" << 'STUB'
#!/bin/bash
case "${1:-}" in
  status) exit 0 ;;
  workspace) echo '{"result":{"workspaces":[{"label":"REP-123","workspace_id":"ws-123","worktree":{"checkout_path":"/tmp/fake-worktree"}}]}}'; exit 0 ;;
  agent) printf 'HERDR_AGENT_ARGS: %s\n' "$*"; exit 0 ;;
  *) echo "HERDR_UNKNOWN: $*"; exit 0 ;;
esac
STUB
  chmod +x "$tmpdir/herdr"

  # python3 stub: output parsed workspace values (mimics herdr JSON parsing).
  cat > "$tmpdir/python3" << 'STUB'
#!/bin/bash
printf 'ws-123\n/tmp/fake-worktree\n'
STUB
  chmod +x "$tmpdir/python3"
}

# Write a test runner script into $tmpdir/run_test.sh.
# Copies deliver.sh into the tmpdir scripts/ subdir so SCRIPT_DIR resolves
# to the mock environment. Stubs are found there for reproctl.sh and via
# PATH for herdr and python3.
_write_runner() {
  local tmpdir="$1"
  local args="$2"

  cp "$DELIVER_SH" "$tmpdir/scripts/deliver.sh"

  printf '#!/bin/bash\nPATH="%s:$PATH"\nexec bash "%s/scripts/deliver.sh" %s\n' \
    "$tmpdir" "$tmpdir" "$args" > "$tmpdir/run_test.sh"
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

  if printf '%s\n' "$output" | grep -q 'REPROCTL_ARGS: wt create --from-issue REP-123 --open' \
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

  if printf '%s\n' "$output" | grep -q 'REPROCTL_ARGS: wt create --from-issue REP-123 --open' \
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

  if printf '%s\n' "$output" | grep -q 'REPROCTL_ARGS: wt create --from-issue REP-123 --open' \
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

  if printf '%s\n' "$output" | grep -q 'REPROCTL_ARGS: wt create --from-issue REP-123 --open' \
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

  if printf '%s\n' "$output" | grep -q 'REPROCTL_ARGS: wt create --from-issue REP-123 --open' \
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

# Test 9: Invalid issue ID format
test_invalid_issue_id_format() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "invalid"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q 'Invalid issue ID'; then
    _pass "invalid issue ID format fails with error message"
  else
    _fail "invalid issue ID format fails with error message" "rc=$rc; output: $output"
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

  if printf '%s\n' "$output" | grep -q 'REPROCTL_ARGS: wt create --from-issue REP-123 --open' \
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

# Test 17: deliver.sh file exists
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
test_invalid_issue_id_format
test_profile_missing_value
test_profile_nonexistent
test_profile_and_pick_mutually_exclusive
test_pick_and_profile_mutually_exclusive
test_env_var_is_honored
test_profile_overrides_env_var
test_pick_overrides_env_var

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
