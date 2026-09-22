#!/bin/bash
# scripts/lib/tests/test_deliver.sh
#
# Unit tests for the deliver.sh script:
#   - REP-1448: --profile and --pick flags for OpenCode profile selection.
#   - REP-1614: --skip-install plumbing into `reproctl.sh wt create`, the
#     two-pane Stage-3 layout (opencode 70% / terminal 30%, no Neovim), and
#     the deferred `pnpm install` sent to the terminal pane. Fallback paths
#     (herdr-down, split-failure, pane-list-failure) install synchronously.
#   - REP-1655: Stage 4 submits the seeded build prompt — Enter is sent to
#     the opencode pane once the v2 TUI renders AND the seeded prompt is
#     visible in the live viewport without the launch wrapper (the pre-render
#     `pane run` echo must never trigger the submit), the kick-off is
#     confirmed via the pane's agent_status, and submit failures degrade to
#     the manual press-Enter fallback (the seeded prompt is never re-typed
#     or cleared).

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

  # linear stub: deterministic JSON. Labels are injectable via
  # LINEAR_STUB_LABELS_JSON (default: none) so routing tests can simulate
  # Bug / Pen / Feature-labeled issues.
  cat > "$tmpdir/linear" << 'STUB'
#!/bin/bash
labels="${LINEAR_STUB_LABELS_JSON:-[]}"
printf '{"item":{"id":"uuid-1","identifier":"REP-123","title":"Test issue","branchName":"feat/rep-123-test","status":{"name":"Todo","type":"unstarted"},"labels":%s}}\n' "$labels"
STUB
  chmod +x "$tmpdir/linear"

  # gh stub for PR-mode integration tests. GH_STUB_PR_JSON contains the
  # controlled response from `gh pr view`; Git refs themselves are served by
  # each test's local bare origin fixture.
  cat > "$tmpdir/gh" << 'STUB'
#!/bin/bash
if [ "${1:-}" = "pr" ] && [ "${2:-}" = "view" ]; then
  printf '%s\n' "${GH_STUB_PR_JSON:-{}}"
  exit 0
fi
echo "unexpected gh invocation: $*" >&2
exit 1
STUB
  chmod +x "$tmpdir/gh"

  # herdr stub: status, workspace open, pane list/read/split/run/send-keys,
  # agent start.
  # The pane split case records its arguments so tests can assert the ratio.
  # When HERDR_STUB_WORKTREE_OPEN_FAIL=1, `worktree open` fails (non-zero
  # exit + empty JSON) so the herdr-down fallback path can be exercised.
  # When HERDR_STUB_PANE_SPLIT_EMPTY=1, `pane split` returns no pane so the
  # single-pane split-failure fallback is exercised. When
  # HERDR_STUB_PANE_LIST_EMPTY=1, `pane list` returns no panes so the
  # pane-list-failure fallback is exercised.
  # REP-1655 knobs: `pane list` panes carry agent_status
  # (HERDR_STUB_AGENT_STATUS, default working) so the kick-off confirmation
  # can be steered; `pane run` extracts the opencode launch line's
  # `--prompt "<seed>"` value into herdr_prompt_seed.txt (plus the full line
  # into herdr_prompt_launch.txt); `pane read` defaults to a rendered v2 TUI
  # whose viewport shows the seeded prompt WITHOUT the launch wrapper
  # (HERDR_STUB_PANE_READ_NO_TUI=1 shows no seed — the Stage-4 poll must
  # exhaust; HERDR_STUB_PANE_READ_ECHO_ONLY=1 shows the pre-render `pane run`
  # echo, seed text AND `--prompt`, which the detection must reject — with
  # HERDR_STUB_PANE_READ_WRAP=1 that echo is emitted hard-wrapped with the row
  # boundary INSIDE `--prompt` (models terminal hard-wrap splitting a token
  # across rows);
  # `pane send-keys` records the request into herdr_send_keys.log
  # (deliver.sh redirects send-keys output, so tests assert against the log)
  # and exits 1 when HERDR_STUB_SEND_KEYS_FAIL=1.
  # REP-1665 knobs: `worktree list` returns one entry built from
  # HERDR_STUB_WORKTREE_LIST_JSON (a JSON object body, default none) so the
  # already-open workspace guard can be exercised; it fails like a down
  # daemon under HERDR_STUB_WORKTREE_OPEN_FAIL=1 (guard fail-open coverage).
  # HERDR_STUB_WORKTREE_LIST_FAIL=1 fails `worktree list` INDEPENDENTLY of
  # `worktree open` (which keeps working unless its own flag is set), so the
  # guard's fail-open direction — list failure → still call `worktree open` —
  # is observable on its own.
  # `worktree open` records the request into herdr_worktree_open.log so tests
  # can assert it was (or was not) called.
  cat > "$tmpdir/herdr" << 'STUB'
#!/bin/bash
  case "${1:-}" in
  status) exit 0 ;;
  worktree)
    if [ "${2:-}" = "list" ]; then
      if [ "${HERDR_STUB_WORKTREE_LIST_FAIL:-0}" = "1" ]; then
        echo 'herdr: daemon not ready' >&2
        exit 1
      fi
      if [ "${HERDR_STUB_WORKTREE_OPEN_FAIL:-0}" = "1" ]; then
        echo 'herdr: daemon not ready' >&2
        exit 1
      fi
      printf '{"result":{"worktrees":[%s]}}\n' "${HERDR_STUB_WORKTREE_LIST_JSON:-}"
      exit 0
    fi
    printf 'HERDR_WORKTREE_OPEN: %s\n' "$*" >> "$(dirname "$0")/herdr_worktree_open.log"
    if [ "${HERDR_STUB_WORKTREE_OPEN_FAIL:-0}" = "1" ]; then
      echo 'herdr: daemon not ready' >&2
      exit 1
    fi
    echo '{"result":{"workspace":{"workspace_id":"ws-123"}}}'
    exit 0
    ;;
  pane)
    case "${2:-}" in
      list)
        if [ "${HERDR_STUB_PANE_LIST_EMPTY:-0}" = "1" ]; then
          echo '{"result":{"panes":[]}}'
        else
          printf '{"result":{"panes":[{"pane_id":"pane-root","agent_status":"%s"}]}}\n' "${HERDR_STUB_AGENT_STATUS:-working}"
        fi
        exit 0
        ;;
      read)
        # Stage-4 TUI detection signal:
        # - default: the v2 TUI is rendered with the seeded editor — the
        #   viewport shows the seed WITHOUT the launch wrapper.
        # - HERDR_STUB_PANE_READ_NO_TUI=1: the TUI never appears (viewport
        #   has no seed text) — the Stage-4 poll must exhaust.
        # - HERDR_STUB_PANE_READ_ECHO_ONLY=1: the pane still shows the
        #   `herdr pane run` launch echo (seed text AND `--prompt`) — the
        #   pre-render state the detection check must reject. With
        #   HERDR_STUB_PANE_READ_WRAP=1 the echo is emitted hard-wrapped with
        #   the row boundary INSIDE `--prompt` (between `--pro` and `mpt`),
        #   modeling a terminal wrap column landing mid-token.
        read_dir="$(dirname "$0")"
        if [ "${HERDR_STUB_PANE_READ_ECHO_ONLY:-0}" = "1" ]; then
          if [ -f "$read_dir/herdr_prompt_launch.txt" ]; then
            if [ "${HERDR_STUB_PANE_READ_WRAP:-0}" = "1" ]; then
              # awk (not sed): BSD sed does not expand \n in replacements.
              awk '{ sub(/--prompt/, "--pro\nmpt"); print }' "$read_dir/herdr_prompt_launch.txt"
            else
              cat "$read_dir/herdr_prompt_launch.txt"
            fi
          else
            echo 'repro % waiting for a command'
          fi
          exit 0
        fi
        if [ "${HERDR_STUB_PANE_READ_NO_TUI:-0}" = "1" ]; then
          echo 'repro % waiting for a command'
          exit 0
        fi
        if [ -f "$read_dir/herdr_prompt_seed.txt" ]; then
          seeded_prompt="$(cat "$read_dir/herdr_prompt_seed.txt")"
          if [ -n "$seeded_prompt" ]; then
            echo "EDITOR SEEDED: $seeded_prompt"
            exit 0
          fi
        fi
        echo 'repro % waiting for a command'
        exit 0
        ;;
      send-keys)
        # Record the request (deliver.sh redirects send-keys output to
        # /dev/null, so tests assert against this log) and optionally fail
        # the submit.
        printf 'HERDR_PANE_SEND_KEYS: %s\n' "$*" >> "$(dirname "$0")/herdr_send_keys.log"
        if [ "${HERDR_STUB_SEND_KEYS_FAIL:-0}" = "1" ]; then
          exit 1
        fi
        exit 0
        ;;
      split)
        printf '%s\n' "$*" > "$(dirname "$0")/herdr_split_args.log"
        if [ "${HERDR_STUB_PANE_SPLIT_EMPTY:-0}" = "1" ]; then
          echo '{"result":{}}'
        else
          echo '{"result":{"pane":{"pane_id":"pane-right"}}}'
        fi
        exit 0
        ;;
      run)
        # REP-1655: when the pane run carries the opencode launch line,
        # extract the `--prompt "<seed>"` value (the seeded editor text) and
        # record both the seed and the full launch line — `pane read` uses
        # them to simulate the seeded TUI viewport vs the pre-render echo.
        seed="$(printf '%s' "$*" | sed -n 's/.*--prompt "\([^"]*\)".*/\1/p')"
        if [ -n "$seed" ]; then
          printf '%s\n' "$seed" > "$(dirname "$0")/herdr_prompt_seed.txt"
          printf '%s\n' "$*" > "$(dirname "$0")/herdr_prompt_launch.txt"
        fi
        echo "HERDR_PANE_RUN: $*"
        exit 0
        ;;
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
# REPO_ROOT/MAIN_CHECKOUT against the sandbox git repo. The runner also cd's
# there so implicit git commands exercise that same fixture repo.
_write_runner() {
  local tmpdir="$1"
  local args="$2"

  cp "$DELIVER_SH" "$tmpdir/scripts/deliver.sh" || return 1

  # DELIVER_SUBMIT_SETTLE defaults to 0 in the sandbox: the 2s production
  # settle before the Enter submit is asserted by no test and would otherwise
  # slow every test that reaches Stage 4. Individual tests can still override
  # it inline (the :- expansion keeps an inherited value).
  printf '#!/bin/bash\nexport CALLER_PWD="%s"\nexport PATH="%s:$PATH"\nexport DELIVER_SUBMIT_SETTLE="${DELIVER_SUBMIT_SETTLE:-0}"\ncd "%s" || exit 1\nexec bash "%s/scripts/deliver.sh" %s\n' \
    "$tmpdir" "$tmpdir" "$tmpdir" "$tmpdir" "$args" > "$tmpdir/run_test.sh"
  chmod +x "$tmpdir/run_test.sh"
}

# Create a local bare origin and a real PR head ref for PR-mode integration
# tests. Prints the fetched PR commit. No network access is used.
_setup_pr_remote_fixture() {
  local tmpdir="$1"
  local pr_number="$2"

  mkdir -p "$tmpdir/workspaces"
  git -C "$tmpdir" config user.email test@example.com
  git -C "$tmpdir" config user.name Test
  git -C "$tmpdir" commit -q --allow-empty -m "PR fixture base"
  git init -q --bare "$tmpdir/origin.git"
  git -C "$tmpdir" remote add origin "$tmpdir/origin.git"
  git -C "$tmpdir" push -q origin HEAD:refs/heads/main
  git -C "$tmpdir" commit -q --allow-empty -m "PR fixture head"

  local pr_head
  pr_head="$(git -C "$tmpdir" rev-parse HEAD)"
  git -C "$tmpdir" push -q origin "HEAD:refs/heads/pr-fixture-$pr_number"
  git --git-dir="$tmpdir/origin.git" update-ref "refs/pull/${pr_number}/head" "$pr_head"
  printf '%s\n' "$pr_head"
}

_pr_json() {
  local branch="$1"
  local body="$2"
  local title="$3"
  printf '{"headRefName":"%s","body":"%s","title":"%s"}' "$branch" "$body" "$title"
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
# terminal pane, no Neovim split, terminal right pane at 30%.
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
  # Terminal right pane is a single 30% split — no nested vertical split.
  # NOTE: herdr's --ratio sizes the FIRST (original) pane, so 0.7 = opencode 70%
  # left + terminal 30% right. Do not "correct" this back to 0.3.
  printf '%s\n' "$split_args" | grep -q -- '--ratio 0.7' || ok=0
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

# Test 20: split-failure fallback — when `herdr pane split` returns no pane
# there is no terminal pane to defer pnpm install to, so dependencies must
# still be installed synchronously in the worktree path.
test_split_failure_installs_synchronously() {
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
  output="$(HERDR_STUB_PANE_SPLIT_EMPTY=1 bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  local ok=1
  # The split-failure warning is emitted
  printf '%s\n' "$output" | grep -q 'Pane split failed' || ok=0
  # pnpm install ran synchronously in the worktree path
  printf '%s\n' "$output" | grep -q 'SYNC_PNPM_INSTALL: install' || ok=0
  # The install was NOT deferred to a terminal pane
  if printf '%s\n' "$output" | grep -q 'HERDR_PANE_RUN:.*pnpm install'; then ok=0; fi

  if [ $ok -eq 1 ]; then
    _pass "split-failure fallback installs dependencies synchronously in the worktree"
  else
    _fail "split-failure fallback installs dependencies synchronously in the worktree" "rc=$rc; output: $output"
  fi
}

# Test 21: pane-list-failure fallback — when `herdr pane list` returns no
# pane there is no terminal pane to defer pnpm install to, so dependencies
# must still be installed synchronously in the worktree path.
test_pane_list_failure_installs_synchronously() {
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
  output="$(HERDR_STUB_PANE_LIST_EMPTY=1 bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  local ok=1
  # The pane-list-failure warning is emitted
  printf '%s\n' "$output" | grep -q 'Could not find a pane' || ok=0
  # pnpm install ran synchronously in the worktree path
  printf '%s\n' "$output" | grep -q 'SYNC_PNPM_INSTALL: install' || ok=0
  # The install was NOT deferred to a terminal pane
  if printf '%s\n' "$output" | grep -q 'HERDR_PANE_RUN:.*pnpm install'; then ok=0; fi

  if [ $ok -eq 1 ]; then
    _pass "pane-list-failure fallback installs dependencies synchronously in the worktree"
  else
    _fail "pane-list-failure fallback installs dependencies synchronously in the worktree" "rc=$rc; output: $output"
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

# Test 22: Bug label routes to /bugfix (regression for REP-1628 jq path fix)
test_bug_label_routes_to_bugfix() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "REP-123"

  local output
  output="$(LINEAR_STUB_LABELS_JSON='[{"name":"Bug"}]' bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q 'Command: /bugfix'; then
    _pass "Bug label routes to /bugfix"
  else
    _fail "Bug label routes to /bugfix" "rc=$rc; output: $output"
  fi
}

# Test 23: Pen label routes to /pen-reconcile (REP-1628)
test_pen_label_routes_to_pen_reconcile() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "REP-123"

  local output
  output="$(LINEAR_STUB_LABELS_JSON='[{"name":"Pen"}]' bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q 'Command: /pen-reconcile'; then
    _pass "Pen label routes to /pen-reconcile"
  else
    _fail "Pen label routes to /pen-reconcile" "rc=$rc; output: $output"
  fi
}

# Test 24: no matching label routes to /build (fail-open default)
test_no_label_routes_to_build() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "REP-123"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q 'Command: /build'; then
    _pass "no matching label routes to /build (fail-open)"
  else
    _fail "no matching label routes to /build (fail-open)" "rc=$rc; output: $output"
  fi
}

# Test 25: the OpenCode launch must resolve reproctl context from the created
# worktree, not the checkout that invoked deliver. Without this override,
# inherited CALLER_PWD makes common.sh select the wrong REPO_ROOT/profile.
test_opencode_launch_uses_worktree_context() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "REP-123"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  local wt_path="$tmpdir/repro-wt-rep-123"
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -qF "CALLER_PWD=\"$wt_path\""; then
    _pass "OpenCode launch passes the created worktree as CALLER_PWD"
  else
    _fail "OpenCode launch passes the created worktree as CALLER_PWD" "rc=$rc; output: $output"
  fi
}

# Test 25: Stage 4 submits the seeded prompt — once the v2 TUI renders,
# Enter is sent to the opencode pane and the kick-off is confirmed via the
# pane's agent_status (REP-1655). Also pins the no-duplication invariant:
# the seeded prompt must never be re-typed (e.g. via `herdr agent prompt`,
# whose output would carry HERDR_AGENT_ARGS and duplicate the seeded editor
# text) (REP-1655 review fix).
test_stage4_submits_seeded_prompt() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "REP-123"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  local send_keys_record=""
  if [ -f "$tmpdir/herdr_send_keys.log" ]; then
    send_keys_record="$(cat "$tmpdir/herdr_send_keys.log")"
  fi
  rm -rf "$tmpdir"

  if printf '%s\n' "$send_keys_record" | grep -q 'HERDR_PANE_SEND_KEYS: pane send-keys pane-root enter' \
    && printf '%s\n' "$output" | grep -q 'kicked off' \
    && ! printf '%s\n' "$output" | grep -q 'HERDR_AGENT_ARGS'; then
    _pass "Stage 4 sends Enter to the opencode pane and confirms the kick-off"
  else
    _fail "Stage 4 sends Enter to the opencode pane and confirms the kick-off" "rc=$rc; output: $output; send_keys: $send_keys_record"
  fi
}

# Test 26: send-keys failure — warn that the prompt is seeded but not
# submitted, with the manual press-Enter recovery (REP-1655).
test_stage4_send_keys_failure_warns() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "REP-123"

  local output
  output="$(HERDR_STUB_SEND_KEYS_FAIL=1 bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q 'seeded but not submitted' \
    && printf '%s\n' "$output" | grep -q 'press Enter in the pane' \
    && ! printf '%s\n' "$output" | grep -q 'kicked off'; then
    _pass "send-keys failure warns seeded-not-submitted with press-Enter fallback"
  else
    _fail "send-keys failure warns seeded-not-submitted with press-Enter fallback" "rc=$rc; output: $output"
  fi
}

# Test 27: TUI never renders — the existing warn is kept and no keys are
# sent (the seeded prompt is never submitted blind) (REP-1655).
test_stage4_no_tui_skips_submit() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "REP-123"

  local output
  output="$(HERDR_STUB_PANE_READ_NO_TUI=1 DELIVER_TUI_POLL_ATTEMPTS=1 DELIVER_TUI_POLL_INTERVAL=1 bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  local send_keys_record=""
  if [ -f "$tmpdir/herdr_send_keys.log" ]; then
    send_keys_record="$(cat "$tmpdir/herdr_send_keys.log")"
  fi
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q 'TUI not detected' \
    && [ -z "$send_keys_record" ]; then
    _pass "no TUI detected means no submit attempt"
  else
    _fail "no TUI detected means no submit attempt" "rc=$rc; output: $output; send_keys: $send_keys_record"
  fi
}

# Test 28: kick-off never confirmed (agent_status never becomes working) —
# warn conservatively with the press-Enter fallback so a false negative is
# harmless (REP-1655).
test_stage4_unconfirmed_kickoff_warns() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "REP-123"

  local output
  output="$(HERDR_STUB_AGENT_STATUS=idle DELIVER_STATE_POLL_ATTEMPTS=2 DELIVER_STATE_POLL_INTERVAL=1 bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q 'Could not confirm' \
    && printf '%s\n' "$output" | grep -q 'press Enter in the pane'; then
    _pass "unconfirmed kick-off warns with press-Enter fallback"
  else
    _fail "unconfirmed kick-off warns with press-Enter fallback" "rc=$rc; output: $output"
  fi
}

# Test 29: pre-render echo false-positive guard — a pane still showing the
# `herdr pane run` launch echo (seed text AND `--prompt`) must NOT count as
# TUI-rendered-and-seeded: the poll exhausts, the warn fires, and no Enter
# is ever sent (the echo false-positive class must never trigger the
# submit) (REP-1655 review fix).
test_stage4_echo_only_does_not_submit() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "REP-123"

  local output
  output="$(HERDR_STUB_PANE_READ_ECHO_ONLY=1 DELIVER_TUI_POLL_ATTEMPTS=1 DELIVER_TUI_POLL_INTERVAL=1 bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  local send_keys_record=""
  if [ -f "$tmpdir/herdr_send_keys.log" ]; then
    send_keys_record="$(cat "$tmpdir/herdr_send_keys.log")"
  fi
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q 'TUI not detected' \
    && [ -z "$send_keys_record" ]; then
    _pass "pre-render echo (seed + --prompt) never triggers the submit"
  else
    _fail "pre-render echo (seed + --prompt) never triggers the submit" "rc=$rc; output: $output; send_keys: $send_keys_record"
  fi
}

# Test 30: hard-wrapped echo guard — a pre-render echo whose row boundary
# falls INSIDE the `--prompt` token (terminal hard-wrap at pane width) must
# still be rejected by the detection check: the capture is joined before
# matching, so the poll exhausts, the warn fires, and no Enter is ever sent
# (REP-1655 review fix).
test_stage4_wrapped_echo_does_not_submit() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "REP-123"

  local output
  output="$(HERDR_STUB_PANE_READ_ECHO_ONLY=1 HERDR_STUB_PANE_READ_WRAP=1 DELIVER_TUI_POLL_ATTEMPTS=1 DELIVER_TUI_POLL_INTERVAL=1 bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  local send_keys_record=""
  if [ -f "$tmpdir/herdr_send_keys.log" ]; then
    send_keys_record="$(cat "$tmpdir/herdr_send_keys.log")"
  fi
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q 'TUI not detected' \
    && [ -z "$send_keys_record" ]; then
    _pass "hard-wrapped echo (wrap inside --prompt) never triggers the submit"
  else
    _fail "hard-wrapped echo (wrap inside --prompt) never triggers the submit" "rc=$rc; output: $output; send_keys: $send_keys_record"
  fi
}

# ── REP-1665: --dry-run must surface the adopt-vs-create decision ─────
#
# The sandbox repo is real git here: one commit on the default branch, plus
# (adopt case) an existing deliver-shaped branch + worktree. reproctl mints
# branches as "<linear-branchName>-<timestamp>"; the linear stub reports
# branchName "feat/rep-123-test".

# Test 31: existing deliver-created worktree → dry-run announces adoption
# ("will resume") and names the existing worktree path.
test_dry_run_announces_adopt_decision() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"

  git -C "$tmpdir" config user.email test@example.com
  git -C "$tmpdir" config user.name Test
  git -C "$tmpdir" commit -q --allow-empty -m init
  local existing_branch="feat/rep-123-test-20260806144124-03fa"
  local existing_wt="$tmpdir/repro-wt-rep-123-test"
  git -C "$tmpdir" worktree add -b "$existing_branch" "$existing_wt" >/dev/null 2>&1

  _write_runner "$tmpdir" "REP-123 --dry-run"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q 'will resume' \
    && printf '%s\n' "$output" | grep -qF "$existing_wt"; then
    _pass "--dry-run announces adopt: existing worktree found, will resume"
  else
    _fail "--dry-run announces adopt: existing worktree found, will resume" "rc=$rc; output: $output"
  fi
}

# Test 32: clean repo → dry-run announces the create decision ("will create").
test_dry_run_announces_create_decision() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"

  git -C "$tmpdir" config user.email test@example.com
  git -C "$tmpdir" config user.name Test
  git -C "$tmpdir" commit -q --allow-empty -m init

  _write_runner "$tmpdir" "REP-123 --dry-run"

  local output
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -q 'will create'; then
    _pass "--dry-run announces create: no existing worktree found"
  else
    _fail "--dry-run announces create: no existing worktree found" "rc=$rc; output: $output"
  fi
}

# Test 33 (REP-1665): Stage 2 must reuse an open herdr workspace already
# registered for the target path instead of calling `worktree open` again —
# herdr's idempotency for an already-registered path is not documented as
# guaranteed. The fail-open direction (list failure → open as before) has its
# own dedicated test below (HERDR_STUB_WORKTREE_LIST_FAIL), independent of
# the herdr-down test where list and open fail together. The reproctl stub
# prints "Path: $tmpdir/repro-wt-rep-123", so that is the path deliver hands
# to _herdr_workspace_add_sibling.
test_herdr_reuses_open_workspace_for_path() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"

  local existing_ws='ws-existing-456'
  local list_json
  list_json="$(printf '{"path":"%s","open_workspace_id":"%s"}' "$tmpdir/repro-wt-rep-123" "$existing_ws")"

  _write_runner "$tmpdir" "REP-123"

  local output
  output="$(HERDR_STUB_WORKTREE_LIST_JSON="$list_json" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?

  local open_log=""
  if [ -f "$tmpdir/herdr_worktree_open.log" ]; then
    open_log="$(cat "$tmpdir/herdr_worktree_open.log")"
  fi
  rm -rf "$tmpdir"

  if printf '%s\n' "$output" | grep -qF "($existing_ws)" && [ -z "$open_log" ]; then
    _pass "Stage 2 reuses the already-open herdr workspace (no worktree open)"
  else
    _fail "Stage 2 reuses the already-open herdr workspace (no worktree open)" "rc=$rc; open log: ${open_log:-<absent>}; output: $output"
  fi
}

# Test 34 (REP-1665): the already-open guard's fail-open direction must be
# observable on its own. With `worktree list` failing (a down daemon) and
# `worktree open` still working, the adopt path must NOT stop at the failed
# lookup: it falls through to `worktree open`, records the call, and uses the
# workspace id from its response. A future fail-closed regression (bailing
# out when the lookup fails) would leave the workspace unopened and fail
# this test.
test_herdr_list_failure_fails_open_to_worktree_open() {
  local tmpdir rc=0
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "REP-123"

  local output
  output="$(HERDR_STUB_WORKTREE_LIST_FAIL=1 bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?

  local open_log=""
  if [ -f "$tmpdir/herdr_worktree_open.log" ]; then
    open_log="$(cat "$tmpdir/herdr_worktree_open.log")"
  fi
  rm -rf "$tmpdir"

  local ok=1
  # The guard fell open: `worktree open` was called despite the list failure
  printf '%s\n' "$open_log" | grep -q 'HERDR_WORKTREE_OPEN: worktree open' || ok=0
  # The opened workspace id is used (Stage 2 confirms with it)
  printf '%s\n' "$output" | grep -q 'Workspace: .* (ws-123)' || ok=0
  # No bogus reuse path was taken
  if printf '%s\n' "$output" | grep -q 'Reusing open herdr workspace'; then ok=0; fi

  if [ $ok -eq 1 ]; then
    _pass "herdr worktree list failure fails open to worktree open (workspace still opened)"
  else
    _fail "herdr worktree list failure fails open to worktree open (workspace still opened)" "rc=$rc; open log: ${open_log:-<absent>}; output: $output"
  fi
}

# ── PR worktree adoption regression coverage ───────────────────────────

# Test 35: a worktree attached to the PR branch at the exact fetched head is
# adopted as-is. In particular, the untracked --full-page sentinel must
# survive, herdr must open the existing path, and the usual pane launch runs
# in that path without adding a second worktree.
test_pr_adopts_exact_head_worktree_without_touching_contents() {
  local tmpdir rc=0 branch pr_head existing_wt output open_log split_args launch sentinel worktree_count
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  pr_head="$(_setup_pr_remote_fixture "$tmpdir" 701)"
  branch="feature/pr-adoption"
  existing_wt="$tmpdir/workspaces/existing-pr-worktree"
  git -C "$tmpdir" worktree add -q -b "$branch" "$existing_wt" "$pr_head"
  printf 'keep this untracked file\n' > "$existing_wt/--full-page"
  _write_runner "$tmpdir" "--pr 701"

  output="$(GH_STUB_PR_JSON="$(_pr_json "$branch" "" "Adopt exact head")" \
    REPRO_WORKSPACE_ROOT="$tmpdir/workspaces" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  open_log="$(cat "$tmpdir/herdr_worktree_open.log" 2>/dev/null || true)"
  split_args="$(cat "$tmpdir/herdr_split_args.log" 2>/dev/null || true)"
  launch="$(cat "$tmpdir/herdr_prompt_launch.txt" 2>/dev/null || true)"
  sentinel="$(cat "$existing_wt/--full-page" 2>/dev/null || true)"

  worktree_count="$(git -C "$tmpdir" worktree list --porcelain | grep -c '^worktree ' || true)"
  rm -rf "$tmpdir"

  if [ "$rc" -eq 0 ] \
    && [ "$sentinel" = 'keep this untracked file' ] \
    && printf '%s\n' "$open_log" | grep -qF -- "--path $existing_wt" \
    && printf '%s\n' "$split_args" | grep -qF -- "--cwd $existing_wt" \
    && printf '%s\n' "$launch" | grep -qF -- "cd \"$existing_wt\"" \
    && [ "$worktree_count" -eq 2 ]; then
    _pass "PR adopts exact-head worktree, preserves untracked content, and launches in the existing path"
  else
    _fail "PR adopts exact-head worktree, preserves untracked content, and launches in the existing path" "rc=$rc; worktrees=$worktree_count; sentinel=${sentinel:-<absent>}; open: ${open_log:-<absent>}; split: ${split_args:-<absent>}; launch: ${launch:-<absent>}; output: $output"
  fi
}

# Test 36: an unattached local branch at the fetched PR head can be attached
# directly, then opened in herdr at its new worktree path.
test_pr_attaches_existing_exact_branch_without_worktree() {
  local tmpdir rc=0 branch pr_head wt_path output open_log actual_head actual_branch worktree_count
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  pr_head="$(_setup_pr_remote_fixture "$tmpdir" 702)"
  branch="feature/pr-existing-exact"
  git -C "$tmpdir" branch "$branch" "$pr_head"
  wt_path="$tmpdir/workspaces/repro-wt-pr-702"
  _write_runner "$tmpdir" "--pr 702"

  output="$(GH_STUB_PR_JSON="$(_pr_json "$branch" "" "Attach exact branch")" \
    REPRO_WORKSPACE_ROOT="$tmpdir/workspaces" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  open_log="$(cat "$tmpdir/herdr_worktree_open.log" 2>/dev/null || true)"
  actual_head="$(git -C "$wt_path" rev-parse HEAD 2>/dev/null || true)"
  actual_branch="$(git -C "$wt_path" branch --show-current 2>/dev/null || true)"
  worktree_count="$(git -C "$tmpdir" worktree list --porcelain | grep -c '^worktree ' || true)"
  rm -rf "$tmpdir"

  if [ "$rc" -eq 0 ] \
    && [ "$actual_head" = "$pr_head" ] \
    && [ "$actual_branch" = "$branch" ] \
    && printf '%s\n' "$open_log" | grep -qF -- "--path $wt_path" \
    && [ "$worktree_count" -eq 2 ]; then
    _pass "PR attaches an existing unattached branch only when its head matches"
  else
    _fail "PR attaches an existing unattached branch only when its head matches" "rc=$rc; head=$actual_head expected=$pr_head; branch=$actual_branch; worktrees=$worktree_count; open: ${open_log:-<absent>}; output: $output"
  fi
}

# Test 37: branch ID wins over a different ID in the body/title; when the
# branch has no ID, the body wins over the title. The title-only fallback is
# separately exercised through a real worktree and prompt launch below.
test_pr_issue_id_source_precedence() {
  local tmpdir branch_output body_output
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  _write_runner "$tmpdir" "--dry-run --pr 703"

  branch_output="$(GH_STUB_PR_JSON="$(_pr_json "feature/REP-111-branch" "Closes REP-222" "Title REP-333")" \
    bash "$tmpdir/run_test.sh" 2>&1)"
  body_output="$(GH_STUB_PR_JSON="$(_pr_json "feature/no-issue" "Closes REP-222" "Title REP-333")" \
    bash "$tmpdir/run_test.sh" 2>&1)"
  rm -rf "$tmpdir"

  if printf '%s\n' "$branch_output" | grep -qF 'Workspace label: REP-111' \
    && printf '%s\n' "$body_output" | grep -qF 'Workspace label: REP-222'; then
    _pass "PR issue ID precedence is branch, then body, then title"
  else
    _fail "PR issue ID precedence is branch, then body, then title" "branch output: $branch_output; body output: $body_output"
  fi
}

# Test 38: a local branch checked out at a different commit is rejected before
# an extra worktree or herdr workspace can be created.
test_pr_refuses_mismatched_attached_branch() {
  local tmpdir rc=0 branch pr_head existing_wt output open_log worktree_count remaining_refs
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  pr_head="$(_setup_pr_remote_fixture "$tmpdir" 702)"
  branch="feature/pr-mismatch-attached"
  git -C "$tmpdir" commit -q --allow-empty -m "different local branch head"
  existing_wt="$tmpdir/workspaces/mismatched-pr-worktree"
  git -C "$tmpdir" worktree add -q -b "$branch" "$existing_wt" HEAD
  _write_runner "$tmpdir" "--pr 702"

  output="$(GH_STUB_PR_JSON="$(_pr_json "$branch" "" "Mismatched attached head")" \
    REPRO_WORKSPACE_ROOT="$tmpdir/workspaces" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  open_log="$(cat "$tmpdir/herdr_worktree_open.log" 2>/dev/null || true)"
  worktree_count="$(git -C "$tmpdir" worktree list --porcelain | grep -c '^worktree ' || true)"
  remaining_refs="$(git -C "$tmpdir" for-each-ref --format='%(refname)' refs/deliver/pr)"
  rm -rf "$tmpdir"

  if [ "$rc" -ne 0 ] \
    && printf '%s\n' "$output" | grep -qi 'does not match.*PR' \
    && [ -z "$open_log" ] \
    && [ -z "$remaining_refs" ] \
    && [ "$worktree_count" -eq 2 ]; then
    _pass "PR refuses mismatched attached branch and cleans its fetched temporary ref"
  else
    _fail "PR refuses mismatched attached branch and cleans its fetched temporary ref" "rc=$rc; worktrees=$worktree_count; leftover refs=${remaining_refs:-<none>}; open: ${open_log:-<absent>}; output: $output"
  fi
}

# Test 39: an unattached local branch may only be attached if its commit equals
# the fetched PR head. A mismatch must fail before `git worktree add`.
test_pr_refuses_mismatched_unattached_branch() {
  local tmpdir rc=0 branch pr_head output open_log worktree_count
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  pr_head="$(_setup_pr_remote_fixture "$tmpdir" 703)"
  branch="feature/pr-mismatch-unattached"
  git -C "$tmpdir" commit -q --allow-empty -m "different local branch head"
  git -C "$tmpdir" branch "$branch" HEAD
  _write_runner "$tmpdir" "--pr 703"

  output="$(GH_STUB_PR_JSON="$(_pr_json "$branch" "" "Mismatched unattached head")" \
    REPRO_WORKSPACE_ROOT="$tmpdir/workspaces" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  open_log="$(cat "$tmpdir/herdr_worktree_open.log" 2>/dev/null || true)"
  worktree_count="$(git -C "$tmpdir" worktree list --porcelain | grep -c '^worktree ' || true)"
  rm -rf "$tmpdir"

  if [ "$rc" -ne 0 ] \
    && printf '%s\n' "$output" | grep -qi 'does not match.*PR' \
    && [ -z "$open_log" ] \
    && [ "$worktree_count" -eq 1 ]; then
    _pass "PR refuses mismatched unattached branch before creating a worktree or workspace"
  else
    _fail "PR refuses mismatched unattached branch before creating a worktree or workspace" "rc=$rc; worktrees=$worktree_count; open: ${open_log:-<absent>}; output: $output"
  fi
}

# Test 40: with no local PR branch or worktree, PR mode still creates the
# branch and worktree at FETCH_HEAD and pushes the fresh branch to origin.
test_pr_creates_fresh_branch_and_worktree() {
  local tmpdir rc=0 branch pr_head output wt_path actual_head actual_branch pushed_head worktree_count
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  pr_head="$(_setup_pr_remote_fixture "$tmpdir" 704)"
  branch="feature/fresh-pr-branch"
  wt_path="$tmpdir/workspaces/repro-wt-pr-704"
  _write_runner "$tmpdir" "--pr 704"

  output="$(GH_STUB_PR_JSON="$(_pr_json "$branch" "" "Fresh PR")" \
    REPRO_WORKSPACE_ROOT="$tmpdir/workspaces" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  actual_head="$(git -C "$wt_path" rev-parse HEAD 2>/dev/null || true)"
  actual_branch="$(git -C "$wt_path" branch --show-current 2>/dev/null || true)"
  pushed_head="$(git --git-dir="$tmpdir/origin.git" rev-parse "refs/heads/$branch" 2>/dev/null || true)"
  worktree_count="$(git -C "$tmpdir" worktree list --porcelain | grep -c '^worktree ' || true)"
  rm -rf "$tmpdir"

  if [ "$rc" -eq 0 ] \
    && [ "$actual_head" = "$pr_head" ] \
    && [ "$actual_branch" = "$branch" ] \
    && [ "$pushed_head" = "$pr_head" ] \
    && [ "$worktree_count" -eq 2 ]; then
    _pass "PR creates a fresh branch/worktree at the fetched head and pushes the branch"
  else
    _fail "PR creates a fresh branch/worktree at the fetched head and pushes the branch" "rc=$rc; head=$actual_head expected=$pr_head; branch=$actual_branch; pushed=$pushed_head; worktrees=$worktree_count; output: $output"
  fi
}

# Test 41: when the PR branch and body have no issue ID, the title is the last
# extraction fallback and supplies both the workspace label and build prompt.
test_pr_title_only_issue_id_routes_label_and_prompt() {
  local tmpdir rc=0 branch pr_head output open_log prompt_seed
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  pr_head="$(_setup_pr_remote_fixture "$tmpdir" 705)"
  branch="feature/title-only-issue"
  _write_runner "$tmpdir" "--pr 705"

  output="$(GH_STUB_PR_JSON="$(_pr_json "$branch" "" "Fix workflow (REP-583)")" \
    REPRO_WORKSPACE_ROOT="$tmpdir/workspaces" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  open_log="$(cat "$tmpdir/herdr_worktree_open.log" 2>/dev/null || true)"
  prompt_seed="$(cat "$tmpdir/herdr_prompt_seed.txt" 2>/dev/null || true)"
  rm -rf "$tmpdir"

  if [ "$rc" -eq 0 ] \
    && printf '%s\n' "$open_log" | grep -qF -- '--label REP-583' \
    && [ "$prompt_seed" = '/build REP-583' ] \
    && printf '%s\n' "$output" | grep -q 'Workspace: REP-583'; then
    _pass "title-only PR issue ID routes the workspace label and /build prompt"
  else
    _fail "title-only PR issue ID routes the workspace label and /build prompt" "rc=$rc; open: ${open_log:-<absent>}; prompt=${prompt_seed:-<absent>}; output: $output"
  fi
}

# Test 42 (REP-1693): the primary checkout must never be adopted for a PR,
# even when its branch is already at the exact fetched head. Refuse before
# opening a herdr workspace or launching the agent, without creating a second
# worktree for the branch.
test_pr_refuses_main_checkout_at_exact_fetched_head() {
  local tmpdir rc=0 branch pr_head output open_log launch split_args worktree_list worktree_count
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  pr_head="$(_setup_pr_remote_fixture "$tmpdir" 706)"
  branch="feature/pr-primary-checkout"
  git -C "$tmpdir" branch -M "$branch"
  _write_runner "$tmpdir" "--pr 706"

  output="$(GH_STUB_PR_JSON="$(_pr_json "$branch" "" "PR branch in primary checkout")" \
    REPRO_WORKSPACE_ROOT="$tmpdir/workspaces" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  open_log="$(cat "$tmpdir/herdr_worktree_open.log" 2>/dev/null || true)"
  launch="$(cat "$tmpdir/herdr_prompt_launch.txt" 2>/dev/null || true)"
  split_args="$(cat "$tmpdir/herdr_split_args.log" 2>/dev/null || true)"
  worktree_list="$(git -C "$tmpdir" worktree list --porcelain)"
  worktree_count="$(printf '%s\n' "$worktree_list" | grep -c '^worktree ' || true)"
  rm -rf "$tmpdir"

  if [ "$rc" -ne 0 ] \
    && printf '%s\n' "$output" | grep -qi 'primary checkout.*isolated worktree' \
    && [ -z "$open_log" ] \
    && [ -z "$launch" ] \
    && [ -z "$split_args" ] \
    && [ "$worktree_count" -eq 1 ] \
    && printf '%s\n' "$worktree_list" | grep -Fxq "worktree $tmpdir" \
    && printf '%s\n' "$worktree_list" | grep -Fxq "HEAD $pr_head" \
    && printf '%s\n' "$worktree_list" | grep -Fxq "branch refs/heads/$branch"; then
    _pass "PR refuses the exact-head primary checkout before herdr or agent launch"
  else
    _fail "PR refuses the exact-head primary checkout before herdr or agent launch" "rc=$rc; worktrees=$worktree_count; open: ${open_log:-<absent>}; split: ${split_args:-<absent>}; launch: ${launch:-<absent>}; output: $output; worktree list: $worktree_list"
  fi
}

# Test 43 (REP-1693): interleave a second local PR fetch from the same checkout
# after PR 707's fetch but before deliver resolves its head. The first delivery
# must keep using PR 707's OID rather than the shared FETCH_HEAD for PR 708.
test_pr_fetch_head_isolated_between_same_checkout_fetches() {
  local tmpdir rc=0 branch pr_707_head pr_708_head output wt_path actual_head pushed_head worktree_count remaining_refs real_git interleaving
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  pr_707_head="$(_setup_pr_remote_fixture "$tmpdir" 707)"
  git -C "$tmpdir" commit -q --allow-empty -m "PR fixture second head"
  pr_708_head="$(git -C "$tmpdir" rev-parse HEAD)"
  git -C "$tmpdir" push -q origin "HEAD:refs/heads/pr-fixture-708"
  git --git-dir="$tmpdir/origin.git" update-ref refs/pull/708/head "$pr_708_head"
  branch="feature/concurrent-pr-707"
  wt_path="$tmpdir/workspaces/repro-wt-pr-707"
  _write_runner "$tmpdir" "--pr 707"

  real_git="$(command -v git)"
  cat > "$tmpdir/git" <<'STUB'
#!/bin/bash
if [ "${1:-}" = "fetch" ] \
  && [ "${2:-}" = "origin" ] \
  && { [ "${3:-}" = "pull/707/head" ] || [[ "${3:-}" == pull/707/head:* ]]; }; then
  "$REAL_GIT" "$@"
  fetch_status=$?
  if [ "$fetch_status" -ne 0 ]; then
    exit "$fetch_status"
  fi
  "$REAL_GIT" fetch origin pull/708/head >/dev/null 2>&1 || exit $?
  printf 'fetched PR 708 after PR 707\n' >> "$DELIVER_PR_RACE_LOG"
  exit 0
fi
exec "$REAL_GIT" "$@"
STUB
  chmod +x "$tmpdir/git"

  output="$(REAL_GIT="$real_git" DELIVER_PR_RACE_LOG="$tmpdir/pr_fetch_interleaving.log" \
    GH_STUB_PR_JSON="$( _pr_json "$branch" "" "Concurrent PR 707")" \
    REPRO_WORKSPACE_ROOT="$tmpdir/workspaces" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  actual_head="$(git -C "$wt_path" rev-parse HEAD 2>/dev/null || true)"
  pushed_head="$(git --git-dir="$tmpdir/origin.git" rev-parse "refs/heads/$branch" 2>/dev/null || true)"
  worktree_count="$(git -C "$tmpdir" worktree list --porcelain | grep -c '^worktree ' || true)"
  remaining_refs="$(git -C "$tmpdir" for-each-ref --format='%(refname)' refs/deliver/pr)"
  interleaving="$(cat "$tmpdir/pr_fetch_interleaving.log" 2>/dev/null || true)"
  rm -rf "$tmpdir"

  if [ "$rc" -eq 0 ] \
    && [ "$actual_head" = "$pr_707_head" ] \
    && [ "$actual_head" != "$pr_708_head" ] \
    && [ "$pushed_head" = "$pr_707_head" ] \
    && [ "$worktree_count" -eq 2 ] \
    && [ -z "$remaining_refs" ] \
    && [ "$interleaving" = 'fetched PR 708 after PR 707' ]; then
    _pass "same-checkout PR fetch interleaving preserves requested head and cleans its temporary ref"
  else
    _fail "same-checkout PR fetch interleaving preserves requested head and cleans its temporary ref" "rc=$rc; worktree head=$actual_head expected PR 707=$pr_707_head and not PR 708=$pr_708_head; pushed head=$pushed_head; worktrees=$worktree_count; leftover refs=${remaining_refs:-<none>}; interleaving=${interleaving:-<not run>}; output: $output"
  fi
}

# Test 44 (REP-1693): two deliver processes fetching the same PR at once need
# separate refs. Hold the first process after its fetch while the second one
# completes, so its cleanup cannot remove the first process's fetched head.
test_pr_fetch_ref_is_unique_for_simultaneous_same_pr_invocations() {
  local tmpdir first_rc=0 second_rc=0 branch pr_head wt_path real_git barrier attempts first_pid
  local first_refspec second_refspec first_ref second_ref first_output second_output actual_head pushed_head worktree_count remaining_refs
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  pr_head="$(_setup_pr_remote_fixture "$tmpdir" 709)"
  branch="feature/concurrent-pr-709"
  wt_path="$tmpdir/workspaces/repro-wt-pr-709"
  barrier="$tmpdir/pr-fetch-barrier"
  mkdir -p "$barrier"
  _write_runner "$tmpdir" "--pr 709"

  real_git="$(command -v git)"
  cat > "$tmpdir/git" <<'STUB'
#!/bin/bash
if [ "${1:-}" = "fetch" ] \
  && [ "${2:-}" = "origin" ] \
  && { [ "${3:-}" = "pull/709/head" ] || [[ "${3:-}" == pull/709/head:* ]]; }; then
  "$REAL_GIT" "$@"
  fetch_status=$?
  if [ "$fetch_status" -ne 0 ]; then
    exit "$fetch_status"
  fi
  if mkdir "$DELIVER_PR_BARRIER/first-claim" 2>/dev/null; then
    printf '%s\n' "${3:-}" > "$DELIVER_PR_BARRIER/first-refspec"
    touch "$DELIVER_PR_BARRIER/first-ready"
    attempts=0
    while [ ! -f "$DELIVER_PR_BARRIER/release-first" ] && [ "$attempts" -lt 500 ]; do
      sleep 0.01
      attempts=$((attempts + 1))
    done
    if [ ! -f "$DELIVER_PR_BARRIER/release-first" ]; then
      echo 'timed out waiting to release first PR fetch' >&2
      exit 1
    fi
  else
    printf '%s\n' "${3:-}" > "$DELIVER_PR_BARRIER/second-refspec"
    touch "$DELIVER_PR_BARRIER/second-ready"
  fi
  exit 0
fi
exec "$REAL_GIT" "$@"
STUB
  chmod +x "$tmpdir/git"

  REAL_GIT="$real_git" DELIVER_PR_BARRIER="$barrier" \
    GH_STUB_PR_JSON="$(_pr_json "$branch" "" "Concurrent PR 709")" \
    REPRO_WORKSPACE_ROOT="$tmpdir/workspaces" bash "$tmpdir/run_test.sh" > "$tmpdir/first.out" 2>&1 &
  first_pid=$!
  attempts=0
  while [ ! -f "$barrier/first-ready" ] && [ "$attempts" -lt 500 ]; do
    if ! kill -0 "$first_pid" 2>/dev/null; then break; fi
    sleep 0.01
    attempts=$((attempts + 1))
  done

  if [ ! -f "$barrier/first-ready" ]; then
    touch "$barrier/release-first"
    wait "$first_pid" || first_rc=$?
    first_output="$(cat "$tmpdir/first.out" 2>/dev/null || true)"
    rm -rf "$tmpdir"
    _fail "simultaneous same-PR deliveries use distinct temporary refs and clean them independently" "first fetch did not reach the barrier; rc=$first_rc; output: $first_output"
    return
  fi

  REAL_GIT="$real_git" DELIVER_PR_BARRIER="$barrier" \
    GH_STUB_PR_JSON="$(_pr_json "$branch" "" "Concurrent PR 709")" \
    REPRO_WORKSPACE_ROOT="$tmpdir/workspaces" bash "$tmpdir/run_test.sh" > "$tmpdir/second.out" 2>&1 || second_rc=$?
  touch "$barrier/release-first"
  wait "$first_pid" || first_rc=$?

  first_refspec="$(cat "$barrier/first-refspec" 2>/dev/null || true)"
  second_refspec="$(cat "$barrier/second-refspec" 2>/dev/null || true)"
  first_ref="${first_refspec#*:}"
  second_ref="${second_refspec#*:}"
  first_output="$(cat "$tmpdir/first.out" 2>/dev/null || true)"
  second_output="$(cat "$tmpdir/second.out" 2>/dev/null || true)"
  actual_head="$(git -C "$wt_path" rev-parse HEAD 2>/dev/null || true)"
  pushed_head="$(git --git-dir="$tmpdir/origin.git" rev-parse "refs/heads/$branch" 2>/dev/null || true)"
  worktree_count="$(git -C "$tmpdir" worktree list --porcelain | grep -c '^worktree ' || true)"
  remaining_refs="$(git -C "$tmpdir" for-each-ref --format='%(refname)' refs/deliver/pr)"
  rm -rf "$tmpdir"

  if [ "$first_rc" -eq 0 ] \
    && [ "$second_rc" -eq 0 ] \
    && [[ "$first_ref" == refs/deliver/pr/709/* ]] \
    && [[ "$second_ref" == refs/deliver/pr/709/* ]] \
    && [ "$first_ref" != "$second_ref" ] \
    && [ "$actual_head" = "$pr_head" ] \
    && [ "$pushed_head" = "$pr_head" ] \
    && [ "$worktree_count" -eq 2 ] \
    && [ -z "$remaining_refs" ]; then
    _pass "simultaneous same-PR deliveries use distinct temporary refs and clean them independently"
  else
    _fail "simultaneous same-PR deliveries use distinct temporary refs and clean them independently" "rcs=$first_rc/$second_rc; refspecs=${first_refspec:-<absent>} / ${second_refspec:-<absent>}; worktree head=$actual_head expected=$pr_head; pushed head=$pushed_head; worktrees=$worktree_count; leftover refs=${remaining_refs:-<none>}; first output: $first_output; second output: $second_output"
  fi
}

# Test 45 (REP-1693): a same-PR invocation may create the branch/worktree
# after this process's initial scan but before its fresh `worktree add -b`.
# Simulate the competing winner at that exact boundary and require this
# invocation to adopt the winner only after checking its branch and HEAD.
test_pr_recovers_exact_head_worktree_created_after_initial_scan() {
  local tmpdir rc=0 branch pr_head output winner_wt requested_wt real_git
  local open_log split_args launch actual_head actual_branch worktree_list worktree_count add_count
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  pr_head="$( _setup_pr_remote_fixture "$tmpdir" 710)"
  branch="feature/concurrent-pr-710"
  winner_wt="$tmpdir/workspaces/competing-pr-710"
  requested_wt="$tmpdir/workspaces/repro-wt-pr-710"
  real_git="$(command -v git)"
  _write_runner "$tmpdir" "--pr 710"

  cat > "$tmpdir/git" <<'STUB'
#!/bin/bash
if [ "${1:-}" = "worktree" ] && [ "${2:-}" = "add" ] && [ "${3:-}" = "-b" ]; then
  printf '%s\n' "$*" >> "$DELIVER_PR_ADD_LOG"
  if [ ! -f "$DELIVER_PR_RACE_MARKER" ]; then
    if "$REAL_GIT" -C "$DELIVER_PR_RACE_REPO" worktree add -q -b "$4" "$DELIVER_PR_RACE_WINNER" "$6"; then
      touch "$DELIVER_PR_RACE_MARKER"
      echo 'fatal: simulated competing worktree creation won the race' >&2
      exit 1
    fi
    echo 'test setup could not create the competing worktree' >&2
    exit 1
  fi
fi
exec "$REAL_GIT" "$@"
STUB
  chmod +x "$tmpdir/git"

  output="$(REAL_GIT="$real_git" DELIVER_PR_RACE_REPO="$tmpdir" \
    DELIVER_PR_RACE_WINNER="$winner_wt" DELIVER_PR_RACE_MARKER="$tmpdir/race-winner-created" \
    DELIVER_PR_ADD_LOG="$tmpdir/pr-worktree-add.log" \
    GH_STUB_PR_JSON="$(_pr_json "$branch" "" "Concurrent PR 710")" \
    REPRO_WORKSPACE_ROOT="$tmpdir/workspaces" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  open_log="$(cat "$tmpdir/herdr_worktree_open.log" 2>/dev/null || true)"
  split_args="$(cat "$tmpdir/herdr_split_args.log" 2>/dev/null || true)"
  launch="$(cat "$tmpdir/herdr_prompt_launch.txt" 2>/dev/null || true)"
  actual_head="$(git -C "$winner_wt" rev-parse HEAD 2>/dev/null || true)"
  actual_branch="$(git -C "$winner_wt" branch --show-current 2>/dev/null || true)"
  worktree_list="$(git -C "$tmpdir" worktree list --porcelain)"
  worktree_count="$(printf '%s\n' "$worktree_list" | grep -c '^worktree ' || true)"
  add_count="$(wc -l < "$tmpdir/pr-worktree-add.log" 2>/dev/null | tr -d ' ' || true)"
  rm -rf "$tmpdir"

  if [ "$rc" -eq 0 ] \
    && [ "$actual_head" = "$pr_head" ] \
    && [ "$actual_branch" = "$branch" ] \
    && [ "$worktree_count" -eq 2 ] \
    && [ "$add_count" -eq 1 ] \
    && ! printf '%s\n' "$worktree_list" | grep -Fxq "worktree $requested_wt" \
    && printf '%s\n' "$open_log" | grep -qF -- "--path $winner_wt" \
    && printf '%s\n' "$split_args" | grep -qF -- "--cwd $winner_wt" \
    && printf '%s\n' "$launch" | grep -qF -- "cd \"$winner_wt\""; then
    _pass "PR recovers the exact-head isolated worktree created after its initial scan"
  else
    _fail "PR recovers the exact-head isolated worktree created after its initial scan" "rc=$rc; head=$actual_head expected=$pr_head; branch=$actual_branch expected=$branch; worktrees=$worktree_count; add attempts=$add_count; open: ${open_log:-<absent>}; split: ${split_args:-<absent>}; launch: ${launch:-<absent>}; worktree list: $worktree_list; output: $output"
  fi
}

# Exercise the rejection checks in the post-scan race-recovery path itself:
# a worktree at the requested path on another branch, the primary checkout,
# and an isolated same-branch worktree at a different head.
_assert_pr_race_competitor_is_rejected() {
  local scenario="$1" tmpdir pr_head wrong_head branch other_branch requested_wt winner_wt
  local competitor_path competitor_branch competitor_head expected_count output rc=0 real_git
  local open_log launch split_args worktree_list worktree_count actual_head actual_branch
  local add_count pushed_head remaining_refs marker_created=false
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  pr_head="$(_setup_pr_remote_fixture "$tmpdir" 713)"
  wrong_head="$(git -C "$tmpdir" rev-parse "${pr_head}^")"
  branch="feature/concurrent-pr-713"
  other_branch="feature/unrelated-pr-713"
  requested_wt="$tmpdir/workspaces/repro-wt-pr-713"
  winner_wt="$tmpdir/workspaces/competing-pr-713"
  real_git="$(command -v git)"
  case "$scenario" in
    mismatched)
      competitor_path="$requested_wt"
      competitor_branch="$other_branch"
      competitor_head="$pr_head"
      expected_count=2
      ;;
    primary)
      competitor_path="$tmpdir"
      competitor_branch="$branch"
      competitor_head="$pr_head"
      expected_count=1
      ;;
    wrong-head)
      competitor_path="$winner_wt"
      competitor_branch="$branch"
      competitor_head="$wrong_head"
      expected_count=2
      ;;
    *)
      return 2
      ;;
  esac
  _write_runner "$tmpdir" "--pr 713"

  cat > "$tmpdir/git" <<'STUB'
#!/bin/bash
if [ "${1:-}" = "worktree" ] && [ "${2:-}" = "add" ] && [ "${3:-}" = "-b" ]; then
  printf '%s\n' "$*" >> "$DELIVER_PR_ADD_LOG"
  if [ ! -f "$DELIVER_PR_RACE_MARKER" ]; then
    case "$DELIVER_PR_RACE_KIND" in
      mismatched)
        "$REAL_GIT" -C "$DELIVER_PR_RACE_REPO" worktree add -q -b \
          "$DELIVER_PR_RACE_OTHER_BRANCH" "$DELIVER_PR_RACE_REQUESTED" "$6" ;;
      primary)
        "$REAL_GIT" -C "$DELIVER_PR_RACE_REPO" checkout -q -b "$4" "$6" ;;
      wrong-head)
        "$REAL_GIT" -C "$DELIVER_PR_RACE_REPO" worktree add -q -b \
          "$4" "$DELIVER_PR_RACE_WINNER" "$DELIVER_PR_RACE_WRONG_HEAD" ;;
    esac || exit 1
    touch "$DELIVER_PR_RACE_MARKER"
    echo 'fatal: simulated unsafe competing worktree creation' >&2
    exit 1
  fi
fi
exec "$REAL_GIT" "$@"
STUB
  chmod +x "$tmpdir/git"

  output="$(REAL_GIT="$real_git" DELIVER_PR_RACE_KIND="$scenario" \
    DELIVER_PR_RACE_REPO="$tmpdir" DELIVER_PR_RACE_WINNER="$winner_wt" \
    DELIVER_PR_RACE_REQUESTED="$requested_wt" DELIVER_PR_RACE_OTHER_BRANCH="$other_branch" \
    DELIVER_PR_RACE_WRONG_HEAD="$wrong_head" \
    DELIVER_PR_RACE_MARKER="$tmpdir/race-competitor-created" \
    DELIVER_PR_ADD_LOG="$tmpdir/pr-worktree-add.log" \
    GH_STUB_PR_JSON="$(_pr_json "$branch" "" "Concurrent PR 713")" \
    REPRO_WORKSPACE_ROOT="$tmpdir/workspaces" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  open_log="$(cat "$tmpdir/herdr_worktree_open.log" 2>/dev/null || true)"
  launch="$(cat "$tmpdir/herdr_prompt_launch.txt" 2>/dev/null || true)"
  split_args="$(cat "$tmpdir/herdr_split_args.log" 2>/dev/null || true)"
  worktree_list="$(git -C "$tmpdir" worktree list --porcelain)"
  worktree_count="$(printf '%s\n' "$worktree_list" | grep -c '^worktree ' || true)"
  actual_head="$(git -C "$competitor_path" rev-parse HEAD 2>/dev/null || true)"
  actual_branch="$(git -C "$competitor_path" branch --show-current 2>/dev/null || true)"
  add_count="$(wc -l < "$tmpdir/pr-worktree-add.log" 2>/dev/null | tr -d ' ' || true)"
  pushed_head="$(git --git-dir="$tmpdir/origin.git" rev-parse --verify --quiet "refs/heads/$branch" 2>/dev/null || true)"
  remaining_refs="$(git -C "$tmpdir" for-each-ref --format='%(refname)' refs/deliver/pr)"
  if [ -f "$tmpdir/race-competitor-created" ]; then
    marker_created=true
  fi
  rm -rf "$tmpdir"

  if [ "$rc" -ne 0 ] \
    && [ "$marker_created" = true ] \
    && [ "$worktree_count" -eq "$expected_count" ] \
    && [ "$actual_head" = "$competitor_head" ] \
    && [ "$actual_branch" = "$competitor_branch" ] \
    && [ -z "$open_log" ] && [ -z "$launch" ] && [ -z "$split_args" ] \
    && [ -z "$pushed_head" ] && [ -z "$remaining_refs" ] \
    && [ "$add_count" -eq 1 ]; then
    return 0
  fi

  printf 'scenario=%s; rc=%s; marker=%s; competitor=%s (%s at %s); expected head=%s; worktrees=%s; add attempts=%s; pushed=%s; refs=%s; open=%s; split=%s; launch=%s; output=%s\n' \
    "$scenario" "$rc" "$marker_created" \
    "$actual_branch" "$actual_head" "$competitor_path" "$competitor_head" \
    "$worktree_count" "$add_count" "${pushed_head:-<absent>}" "${remaining_refs:-<none>}" \
    "${open_log:-<absent>}" "${split_args:-<absent>}" \
    "${launch:-<absent>}" "$output" >&2
  return 1
}

test_pr_rejects_unsafe_competitors_created_after_initial_scan() {
  local scenario failures=""
  for scenario in mismatched primary wrong-head; do
    if ! _assert_pr_race_competitor_is_rejected "$scenario"; then
      failures="$failures $scenario"
    fi
  done

  if [ -z "$failures" ]; then
    _pass "PR refuses mismatched, primary-checkout, and wrong-head race competitors"
  else
    _fail "PR refuses mismatched, primary-checkout, and wrong-head race competitors" "failed scenarios:$failures"
  fi
}

# Test 46 (REP-1693): distinct PRs with the same title-only issue ID retain
# their shared Herdr label/prompt while using distinct PR-specific worktrees.
test_pr_same_issue_id_uses_distinct_pr_worktrees() {
  local tmpdir first_rc=0 second_rc=0 branch_711 branch_712 head_711 head_712
  local output_711 output_712 open_log first_path second_path actual_head_711 actual_head_712
  local actual_branch_711 actual_branch_712 pushed_head_711 pushed_head_712 worktree_count
  tmpdir="$(_make_tmpdir)"
  _write_stubs "$tmpdir"
  head_711="$( _setup_pr_remote_fixture "$tmpdir" 711)"
  git -C "$tmpdir" commit -q --allow-empty -m "PR 712 fixture head"
  head_712="$(git -C "$tmpdir" rev-parse HEAD)"
  git -C "$tmpdir" push -q origin "HEAD:refs/heads/pr-fixture-712"
  git --git-dir="$tmpdir/origin.git" update-ref refs/pull/712/head "$head_712"
  branch_711="feature/title-only-issue-pr-711"
  branch_712="feature/title-only-issue-pr-712"
  _write_runner "$tmpdir" "--pr 711"

  output_711="$(GH_STUB_PR_JSON="$(_pr_json "$branch_711" "" "PR 711 workflow (REP-583)")" \
    REPRO_WORKSPACE_ROOT="$tmpdir/workspaces" bash "$tmpdir/run_test.sh" 2>&1)" || first_rc=$?
  _write_runner "$tmpdir" "--pr 712"
  output_712="$(GH_STUB_PR_JSON="$(_pr_json "$branch_712" "" "PR 712 workflow (REP-583)")" \
    REPRO_WORKSPACE_ROOT="$tmpdir/workspaces" bash "$tmpdir/run_test.sh" 2>&1)" || second_rc=$?

  open_log="$(cat "$tmpdir/herdr_worktree_open.log" 2>/dev/null || true)"
  first_path="$(sed -n '1s/.*--path \([^ ]*\).*/\1/p' "$tmpdir/herdr_worktree_open.log" 2>/dev/null || true)"
  second_path="$(sed -n '2s/.*--path \([^ ]*\).*/\1/p' "$tmpdir/herdr_worktree_open.log" 2>/dev/null || true)"
  actual_head_711=""
  actual_head_712=""
  actual_branch_711=""
  actual_branch_712=""
  if [ -n "$first_path" ]; then
    actual_head_711="$(git -C "$first_path" rev-parse HEAD 2>/dev/null || true)"
    actual_branch_711="$(git -C "$first_path" branch --show-current 2>/dev/null || true)"
  fi
  if [ -n "$second_path" ]; then
    actual_head_712="$(git -C "$second_path" rev-parse HEAD 2>/dev/null || true)"
    actual_branch_712="$(git -C "$second_path" branch --show-current 2>/dev/null || true)"
  fi
  pushed_head_711="$(git --git-dir="$tmpdir/origin.git" rev-parse --verify --quiet "refs/heads/$branch_711" 2>/dev/null || true)"
  pushed_head_712="$(git --git-dir="$tmpdir/origin.git" rev-parse --verify --quiet "refs/heads/$branch_712" 2>/dev/null || true)"
  worktree_count="$(git -C "$tmpdir" worktree list --porcelain | grep -c '^worktree ' || true)"
  rm -rf "$tmpdir"

  if [ "$first_rc" -eq 0 ] \
    && [ "$second_rc" -eq 0 ] \
    && [ -n "$first_path" ] && [ -n "$second_path" ] \
    && [ "$first_path" != "$second_path" ] \
    && [[ "$first_path" == *711* ]] && [[ "$second_path" == *712* ]] \
    && [ "$actual_head_711" = "$head_711" ] \
    && [ "$actual_head_712" = "$head_712" ] \
    && [ "$actual_branch_711" = "$branch_711" ] \
    && [ "$actual_branch_712" = "$branch_712" ] \
    && [ "$pushed_head_711" = "$head_711" ] \
    && [ "$pushed_head_712" = "$head_712" ] \
    && [ "$worktree_count" -eq 3 ] \
    && [ "$(printf '%s\n' "$open_log" | grep -c -- '--label REP-583' || true)" -eq 2 ] \
    && printf '%s\n' "$output_711" | grep -qF -- '/build REP-583' \
    && printf '%s\n' "$output_712" | grep -qF -- '/build REP-583'; then
    _pass "PRs sharing title-only REP-583 use distinct worktrees and preserve their own heads, pushes, and labels"
  else
    _fail "PRs sharing title-only REP-583 use distinct worktrees and preserve their own heads, pushes, and labels" "rcs=$first_rc/$second_rc; paths=${first_path:-<absent>} / ${second_path:-<absent>}; heads=$actual_head_711/$actual_head_712 expected=$head_711/$head_712; branches=$actual_branch_711/$actual_branch_712 expected=$branch_711/$branch_712; pushed=$pushed_head_711/$pushed_head_712; worktrees=$worktree_count; open log: ${open_log:-<absent>}; first output: $output_711; second output: $output_712"
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
test_split_failure_installs_synchronously
test_pane_list_failure_installs_synchronously
test_bug_label_routes_to_bugfix
test_pen_label_routes_to_pen_reconcile
test_no_label_routes_to_build
test_opencode_launch_uses_worktree_context
test_stage4_submits_seeded_prompt
test_stage4_send_keys_failure_warns
test_stage4_no_tui_skips_submit
test_stage4_unconfirmed_kickoff_warns
test_stage4_echo_only_does_not_submit
test_stage4_wrapped_echo_does_not_submit
test_dry_run_announces_adopt_decision
test_dry_run_announces_create_decision
test_herdr_reuses_open_workspace_for_path
test_herdr_list_failure_fails_open_to_worktree_open
test_pr_adopts_exact_head_worktree_without_touching_contents
test_pr_attaches_existing_exact_branch_without_worktree
test_pr_issue_id_source_precedence
test_pr_refuses_mismatched_attached_branch
test_pr_refuses_mismatched_unattached_branch
test_pr_creates_fresh_branch_and_worktree
test_pr_title_only_issue_id_routes_label_and_prompt
test_pr_refuses_main_checkout_at_exact_fetched_head
test_pr_fetch_head_isolated_between_same_checkout_fetches
test_pr_fetch_ref_is_unique_for_simultaneous_same_pr_invocations
test_pr_recovers_exact_head_worktree_created_after_initial_scan
test_pr_rejects_unsafe_competitors_created_after_initial_scan
test_pr_same_issue_id_uses_distinct_pr_worktrees

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
