#!/bin/bash
# scripts/lib/tests/test_opencode.sh
#
# Unit tests for the opencode command (REP-899): profile selection
# with explicit flags, env defaults, and the interactive picker.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
OPENCODE_SH="$TESTS_DIR/../opencode.sh"
PROFILE_DIR="$TESTS_DIR/../../../.opencode/profiles"
SEQ_AGENT_FILE="$TESTS_DIR/../../../.opencode/agents/sequencer.md"

# ── Harness ──────────────────────────────────────────────────────────

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

# Create a temp directory (Bash 3.2 safe).
_make_tmpdir() {
  mktemp -d 2>/dev/null || mktemp -d -t test_opencode
}

# Write stubs for opencode and caffeinate into $1/bin/.
# The opencode stub prints OPENCODE_CONFIG so tests can verify it.
# The caffeinate stub shifts past flag arguments and exec's the rest.
_write_stubs() {
  local bindir="$1/bin"
  mkdir -p "$bindir"

  printf '#!/bin/bash\nprintf "OPENCODE_CONFIG=%%s\\n" "${OPENCODE_CONFIG:-}"\n' \
    > "$bindir/opencode"
  chmod +x "$bindir/opencode"

  # Shift past caffeinate flags (e.g. -dims), then exec the remainder.
  printf '#!/bin/bash\nwhile [[ "${1:-}" == -* ]]; do shift; done\nexec "$@"\n' \
    > "$bindir/caffeinate"
  chmod +x "$bindir/caffeinate"
}

# Write a test runner script into $tmpdir/run_test.sh.
# Stubs die, _err, and _pick (single-candidate auto-select).
# Accepts optional extra lines to append before calling cmd_opencode.
# Usage: _write_runner <tmpdir> [extra_lines]
_write_runner() {
  local tmpdir="$1"
  local extra="${2:-}"

  # Unquoted heredoc: $tmpdir and $OPENCODE_SH expand here;
  # \$1, \$#, \$* become $1, $#, $* in the written file.
  cat > "$tmpdir/run_test.sh" << RUNNER
#!/bin/bash
CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
_err() { printf '✖ %s\n' "\$*" >&2; }
die() { printf 'Error: %b\n' "\$*" >&2; exit 1; }
_pick() {
  local _p="\$1"; shift
  # Mirror _pick: auto-select the single candidate.
  [[ \$# -eq 1 ]] && echo "\$1" && return 0
  # Multiple candidates without fzf: signal cancellation.
  printf 'Error: _pick stub got multiple candidates\n' >&2; return 1
}
REPO_ROOT="$tmpdir"
PATH="$tmpdir/bin:/usr/bin:/bin"
source "$OPENCODE_SH"
$extra
cmd_opencode
RUNNER
  chmod +x "$tmpdir/run_test.sh"
}

# ── Tests ─────────────────────────────────────────────────────────────

# Test 1: opencode.sh file exists
test_file_exists() {
  if [ -f "$OPENCODE_SH" ]; then
    _pass "opencode.sh exists"
  else
    _fail "opencode.sh exists" "file not found: $OPENCODE_SH"
  fi
}

# Test 2: cmd_opencode is defined after sourcing
test_function_defined() {
  local output rc=0
  output="$(bash -c "
    CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
    die() { printf 'Error: %b\n' \"\$*\" >&2; exit 1; }
    REPO_ROOT='/tmp/fake'
    source '$OPENCODE_SH'
    declare -f cmd_opencode >/dev/null 2>&1 && echo PASS || echo FAIL
  " 2>&1)" || rc=$?
  if [ "$output" = "PASS" ]; then
    _pass "cmd_opencode is defined after sourcing"
  else
    _fail "cmd_opencode is defined after sourcing" "rc=$rc output=$output"
  fi
}

# Test 3: --help exits 0
test_help_exits_zero() {
  local output rc=0
  output="$(bash -c "
    CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
    die() { printf 'Error: %b\n' \"\$*\" >&2; exit 1; }
    REPO_ROOT='/tmp/fake'
    source '$OPENCODE_SH'
    cmd_opencode --help
  " 2>&1)" || rc=$?
  if [ $rc -eq 0 ]; then
    _pass "--help exits 0"
  else
    _fail "--help exits 0" "exited with $rc; output: $output"
  fi
}

# Test 4: help text mentions env default profile behavior
test_help_mentions_env_default_profile() {
  local output rc=0
  output="$(bash -c "
    CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
    die() { printf 'Error: %b\n' \"\$*\" >&2; exit 1; }
    REPO_ROOT='/tmp/fake'
    source '$OPENCODE_SH'
    cmd_opencode --help
  " 2>&1)" || rc=$?
  if printf '%s\n' "$output" | grep -q 'REPRO_OPENCODE_PROFILE'; then
    _pass "help text mentions REPRO_OPENCODE_PROFILE"
  else
    _fail "help text mentions REPRO_OPENCODE_PROFILE" "output did not contain the env default reference: $output"
  fi
}

# Test 5: sequencer agent is a primary agent with sequencing guidance
test_sequencer_agent_definition_is_primary() {
  if [ -f "$SEQ_AGENT_FILE" ] \
    && grep -q '^mode: primary$' "$SEQ_AGENT_FILE" \
    && grep -q '^  write: false$' "$SEQ_AGENT_FILE" \
    && grep -q '^  edit: false$' "$SEQ_AGENT_FILE" \
    && grep -q '^    "\*": "deny"$' "$SEQ_AGENT_FILE" \
    && grep -q '^    "rg\*": "allow"$' "$SEQ_AGENT_FILE" \
    && grep -q '^    "sed\*": "allow"$' "$SEQ_AGENT_FILE" \
    && grep -q '^    "cat\*": "allow"$' "$SEQ_AGENT_FILE" \
    && grep -q '^    "ls\*": "allow"$' "$SEQ_AGENT_FILE" \
    && grep -q '^    "linear issue show\*": "allow"$' "$SEQ_AGENT_FILE" \
    && grep -q '^    "linear issue list\*": "allow"$' "$SEQ_AGENT_FILE" \
    && grep -q '^    "linear issue children\*": "allow"$' "$SEQ_AGENT_FILE" \
    && grep -q '^    "linear issue comments\*": "allow"$' "$SEQ_AGENT_FILE" \
    && grep -q '^    "linear issue search\*": "allow"$' "$SEQ_AGENT_FILE" \
    && grep -qi 'discover only' "$SEQ_AGENT_FILE" \
    && grep -qi 'sequence only' "$SEQ_AGENT_FILE" \
    && grep -qi 'discover+sequence' "$SEQ_AGENT_FILE" \
    && grep -qi 'read-only' "$SEQ_AGENT_FILE" \
    && grep -qi 'self-contained' "$SEQ_AGENT_FILE" \
    && grep -qi 'live context' "$SEQ_AGENT_FILE"; then
    _pass "sequencer agent file exists and is primary"
  else
    _fail "sequencer agent file exists and is primary" "file missing or frontmatter/body did not match: $SEQ_AGENT_FILE"
  fi
}

# Test 6: sequencer profile mapping uses the cheaper model in both profiles
test_sequencer_profile_maps_to_cheaper_model() {
  local profile_file
  for profile_file in "$PROFILE_DIR/openai-gpt5.4.json" "$PROFILE_DIR/openai-gpt5.5.json"; do
    if ! grep -q '"sequencer"' "$profile_file" || ! grep -q '"model": "openai/gpt-5.4-mini"' "$profile_file"; then
      _fail "sequencer agent maps to the cheaper model" "missing sequencer mapping in $profile_file"
      return 0
    fi
  done

  _pass "sequencer agent maps to the cheaper model in both OpenAI profiles"
}

# Test 7: env default profile is selected without invoking _pick
test_env_default_profile_selects_without_picker() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  mkdir -p "$tmpdir/.opencode/profiles"
  echo '{}' > "$tmpdir/.opencode/profiles/alpha.json"
  echo '{}' > "$tmpdir/.opencode/profiles/beta.json"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" '
_pick() { printf "Error: _pick should not be called when REPRO_OPENCODE_PROFILE is set\n" >&2; return 99; }
REPRO_OPENCODE_PROFILE=alpha
cmd_opencode
'

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'OPENCODE_CONFIG=.*alpha'; then
    _pass "REPRO_OPENCODE_PROFILE selects alpha without picker"
  else
    _fail "REPRO_OPENCODE_PROFILE selects alpha without picker" "rc=$rc; output: $output"
  fi
}

# Test 8: explicit --profile overrides the env default
test_profile_flag_overrides_env_default() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  mkdir -p "$tmpdir/.opencode/profiles"
  echo '{}' > "$tmpdir/.opencode/profiles/alpha.json"
  echo '{}' > "$tmpdir/.opencode/profiles/beta.json"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" '
REPRO_OPENCODE_PROFILE=alpha cmd_opencode --profile beta
'

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'OPENCODE_CONFIG=.*beta'; then
    _pass "--profile beta overrides REPRO_OPENCODE_PROFILE=alpha"
  else
    _fail "--profile beta overrides REPRO_OPENCODE_PROFILE=alpha" "rc=$rc; output: $output"
  fi
}

# Test 9: invalid env default fails with available profiles
test_invalid_env_default_exits_nonzero() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  mkdir -p "$tmpdir/.opencode/profiles"
  echo '{}' > "$tmpdir/.opencode/profiles/alpha.json"
  echo '{}' > "$tmpdir/.opencode/profiles/beta.json"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" '
_pick() { printf "Error: _pick should not be called when REPRO_OPENCODE_PROFILE is invalid\n" >&2; return 99; }
REPRO_OPENCODE_PROFILE=missing
cmd_opencode
'

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -qi 'available profiles'; then
    _pass "invalid REPRO_OPENCODE_PROFILE fails with available profile list"
  else
    _fail "invalid REPRO_OPENCODE_PROFILE fails with available profile list" "rc=$rc; output: $output"
  fi
}

# Test 10: no profiles in directory → die with helpful message
test_no_profiles_exits_nonzero() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  mkdir -p "$tmpdir/.opencode/profiles"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -qi "no profiles"; then
    _pass "empty profiles dir → dies with 'no profiles' message"
  else
    _fail "empty profiles dir → dies with 'no profiles' message" \
      "rc=$rc; output: $output"
  fi
}

# Test 11: no --profile + 2 profiles + fzf absent → die with install instructions
test_multi_profile_no_fzf_exits_nonzero() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  mkdir -p "$tmpdir/.opencode/profiles"
  echo '{}' > "$tmpdir/.opencode/profiles/alpha.json"
  echo '{}' > "$tmpdir/.opencode/profiles/beta.json"
  _write_stubs "$tmpdir"

  # Exclude fzf from PATH by using only /usr/bin and /bin.
  cat > "$tmpdir/run_test.sh" << RUNNER
#!/bin/bash
CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
_err() { printf '✖ %s\n' "\$*" >&2; }
die() { printf 'Error: %b\n' "\$*" >&2; exit 1; }
_pick() { printf 'Error: _pick should not be reached\n' >&2; return 1; }
REPO_ROOT="$tmpdir"
PATH="/usr/bin:/bin"
source "$OPENCODE_SH"
cmd_opencode
RUNNER
  chmod +x "$tmpdir/run_test.sh"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -qi "fzf"; then
    _pass "2+ profiles + no fzf → dies with fzf install message"
  else
    _fail "2+ profiles + no fzf → dies with fzf install message" \
      "rc=$rc; output: $output"
  fi
}

# Test 10: no --profile + exactly 1 profile → auto-selects, sets OPENCODE_CONFIG
test_single_profile_auto_selects() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  mkdir -p "$tmpdir/.opencode/profiles"
  echo '{}' > "$tmpdir/.opencode/profiles/solo.json"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q "OPENCODE_CONFIG=.*solo"; then
    _pass "single profile auto-selects and sets OPENCODE_CONFIG"
  else
    _fail "single profile auto-selects and sets OPENCODE_CONFIG" \
      "rc=$rc; output: $output"
  fi
}

# Test 11: --profile flag bypasses picker entirely, sets OPENCODE_CONFIG
test_profile_flag_bypasses_picker() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  mkdir -p "$tmpdir/.opencode/profiles"
  echo '{}' > "$tmpdir/.opencode/profiles/myprofile.json"
  _write_stubs "$tmpdir"

  # _pick must NOT be called; override to fail if it is.
  cat > "$tmpdir/run_test.sh" << RUNNER
#!/bin/bash
CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
_err() { printf '✖ %s\n' "\$*" >&2; }
die() { printf 'Error: %b\n' "\$*" >&2; exit 1; }
_pick() { printf 'Error: _pick should not be called when --profile is given\n' >&2; exit 99; }
REPO_ROOT="$tmpdir"
PATH="$tmpdir/bin:/usr/bin:/bin"
source "$OPENCODE_SH"
cmd_opencode --profile myprofile
RUNNER
  chmod +x "$tmpdir/run_test.sh"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q "OPENCODE_CONFIG=.*myprofile"; then
    _pass "--profile flag bypasses picker and sets OPENCODE_CONFIG"
  else
    _fail "--profile flag bypasses picker and sets OPENCODE_CONFIG" \
      "rc=$rc; output: $output"
  fi
}

# ── Run all tests ─────────────────────────────────────────────────────

test_file_exists
test_function_defined
test_help_exits_zero
test_help_mentions_env_default_profile
test_env_default_profile_selects_without_picker
test_profile_flag_overrides_env_default
test_invalid_env_default_exits_nonzero
test_no_profiles_exits_nonzero
test_multi_profile_no_fzf_exits_nonzero
test_single_profile_auto_selects
test_profile_flag_bypasses_picker

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
