#!/bin/bash
# scripts/lib/tests/test_opencode.sh
#
# Unit tests for the opencode command (REP-899): fzf profile picker
# when --profile is not supplied.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
OPENCODE_SH="$TESTS_DIR/../opencode.sh"
PROFILE_DIR="$TESTS_DIR/../../../.opencode/profiles"

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

# Test 4: help text mentions fzf picker (new behaviour from REP-899)
test_help_mentions_fzf_picker() {
  local output rc=0
  output="$(bash -c "
    CLR_BOLD='' CLR_DIM='' CLR_RED='' CLR_GREEN='' CLR_YELLOW='' CLR_RESET=''
    die() { printf 'Error: %b\n' \"\$*\" >&2; exit 1; }
    REPO_ROOT='/tmp/fake'
    source '$OPENCODE_SH'
    cmd_opencode --help
  " 2>&1)" || rc=$?
  if printf '%s\n' "$output" | grep -qi "fzf\|picker"; then
    _pass "help text mentions fzf picker"
  else
    _fail "help text mentions fzf picker" "output did not contain 'fzf' or 'picker': $output"
  fi
}

# Test 5: no profiles in directory → die with helpful message
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

# Test 6: no --profile + 2 profiles + fzf absent → die with install instructions
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

# Test 7: no --profile + exactly 1 profile → auto-selects, sets OPENCODE_CONFIG
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

# Test 8: --profile flag bypasses picker entirely, sets OPENCODE_CONFIG
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

# Test 9: shipped profiles must not blank out deliver's template.
test_profiles_do_not_blank_deliver_template() {
  local profile output rc=0

  for profile in "$PROFILE_DIR"/*.json; do
    [ -f "$profile" ] || continue

    output="$(python3 - "$profile" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path) as f:
    data = json.load(f)

template = data.get('command', {}).get('deliver', {}).get('template')
sys.exit(1 if template == '' else 0)
PY
    )" || rc=$?

    if [ $rc -ne 0 ]; then
      _fail "shipped profiles do not blank deliver template" \
        "empty command.deliver.template override found in: $profile"
      return 1
    fi
  done

  _pass "shipped profiles do not blank deliver template"
}

# ── Run all tests ─────────────────────────────────────────────────────

test_file_exists
test_function_defined
test_help_exits_zero
test_help_mentions_fzf_picker
test_no_profiles_exits_nonzero
test_multi_profile_no_fzf_exits_nonzero
test_single_profile_auto_selects
test_profile_flag_bypasses_picker
test_profiles_do_not_blank_deliver_template

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
