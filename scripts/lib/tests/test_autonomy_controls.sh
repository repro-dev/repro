#!/bin/bash
# scripts/lib/tests/test_autonomy_controls.sh
#
# Regression tests for autonomy claim/release controls.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
AUTONOMY_SH="$TESTS_DIR/../autonomy.sh"
WORKTREE_SH="$TESTS_DIR/../worktree.sh"

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

_make_tmpdir() {
  mktemp -d 2>/dev/null || mktemp -d -t test_autonomy_controls
}

_write_runner() {
  local tmpdir="$1"
  local extra="${2:-}"

  cat > "$tmpdir/run_test.sh" << RUNNER
#!/bin/bash
set -euo pipefail
die() { printf 'Error: %b\n' "\$*" >&2; exit 1; }
_err() { printf '✖ %s\n' "\$*" >&2; }
_ok() { printf '✔ %s\n' "\$*" >&2; }
_step() { :; }
_warn() { :; }
CLR_BOLD="" CLR_DIM="" CLR_RED="" CLR_GREEN="" CLR_YELLOW="" CLR_RESET=""
REPO_ROOT="$tmpdir/repro"
MAIN_CHECKOUT="$tmpdir/repro"
PARENT_DIR="$tmpdir"
WORKSPACE_ROOT="$tmpdir"
SCRIPTS_DIR="$TESTS_DIR/../.."
TMP_DIR="$tmpdir/tmp"
tmpdir="$tmpdir"
mkdir -p "$tmpdir/repro" "$tmpdir/tmp"
slugify() { printf '%s\n' "\$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "\${WORKSPACE_ROOT:-\$PARENT_DIR}/repro-wt-\$1"; }
source "$WORKTREE_SH"
source "$AUTONOMY_SH"
$extra
RUNNER
  chmod +x "$tmpdir/run_test.sh"
}

test_claim_and_release_sync_assignment_visibility() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
mkdir -p "$tmpdir/workspace"
linear() {
  case "$1 $2 $3" in
    "issue show REP-1094")
      cat <<'"'"'JSON'"'"'
{"item":{"id":"issue-uuid-1"}}
JSON
      ;;
    *)
      return 1
      ;;
  esac
}

_linear_api() {
  printf '%s\n' "$1" >> "$tmpdir/linear-calls.log"
  case "$1" in
    *"viewer { id }"*)
      cat <<'JSON'
{"data":{"viewer":{"id":"viewer-1"}}}
JSON
      ;;
    *"issues(filter:"*)
      cat <<'JSON'
{"data":{"issues":{"nodes":[{"id":"issue-uuid-1","identifier":"REP-1094","title":"Assignment visibility","branchName":"rep-1094-assignment-visibility","state":{"name":"In Progress","type":"started"},"team":{"states":{"nodes":[{"id":"todo-state-id","name":"Todo","type":"todo"},{"id":"in-progress-state-id","name":"In Progress","type":"started"}]}}}]}}}
JSON
      ;;
    *"assigneeId: \"viewer-1\""*)
      cat <<'JSON'
{"data":{"issueUpdate":{"issue":{"id":"issue-uuid-1","identifier":"REP-1094"}}}}
JSON
      ;;
    *"assigneeId: null"*)
      cat <<'JSON'
{"data":{"issueUpdate":{"issue":{"id":"issue-uuid-1","identifier":"REP-1094"}}}}
JSON
      ;;
    *"stateId:"*)
      cat <<'JSON'
{"data":{"issueUpdate":{"issue":{"id":"issue-uuid-1","identifier":"REP-1094"}}}}
JSON
      ;;
    *)
      return 1
      ;;
  esac
}

REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" cmd_autonomy claim REP-1094 --workspace "$tmpdir/workspace" --phase observe --issue-state In-Progress
REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" cmd_autonomy release REP-1094 --reason done
'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'claimed REP-1094' && printf '%s\n' "$output" | grep -q 'released REP-1094'; then
    if grep -q 'assigneeId: "viewer-1"' "$tmpdir/linear-calls.log" && grep -q 'assigneeId: null' "$tmpdir/linear-calls.log"; then
      rm -rf "$tmpdir"
      _pass 'cmd_autonomy claim/release sync assignment ownership'
      return 0
    fi
  fi
  rm -rf "$tmpdir"
  _fail 'cmd_autonomy claim/release sync assignment ownership' "rc=$rc; output=$output"
}

test_invalid_issue_identifier_fails_before_linear_lookup() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
linear() {
  printf "%s\n" "$*" >> "$tmpdir/linear-calls.log"
  return 0
}

mkdir -p "$tmpdir/workspace"
REPRO_AUTONOMY_DB="$tmpdir/state.sqlite" cmd_autonomy claim invalid-id --workspace "$tmpdir/workspace" --phase observe --issue-state In-Progress
'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q 'Invalid issue identifier' && [ ! -s "$tmpdir/linear-calls.log" ]; then
    rm -rf "$tmpdir"
    _pass 'invalid issue identifiers fail before Linear lookup'
  else
    rm -rf "$tmpdir"
    _fail 'invalid issue identifiers fail before Linear lookup' "rc=$rc; output=$output"
  fi
}

test_completions_show_json_for_control_subcommands() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
source "$SCRIPTS_DIR/completions/reproctl.bash"
_init_completion() {
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]:-}"
  words=("${COMP_WORDS[@]}")
  cword="$COMP_CWORD"
}

COMP_WORDS=(reproctl autonomy status --)
COMP_CWORD=3
_reproctl
printf "status:%s\n" "${COMPREPLY[*]}"

COMP_WORDS=(reproctl autonomy release --)
COMP_CWORD=3
_reproctl
printf "release:%s\n" "${COMPREPLY[*]}"

COMP_WORDS=(reproctl autonomy retry --)
COMP_CWORD=3
_reproctl
printf "retry:%s\n" "${COMPREPLY[*]}"
'
  output="$(bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'status:.*--json' && printf '%s\n' "$output" | grep -q 'release:.*--json' && printf '%s\n' "$output" | grep -q 'retry:.*--json'; then
    _pass 'autonomy completions expose --json for control commands'
  else
    _fail 'autonomy completions expose --json for control commands' "rc=$rc; output=$output"
  fi
}

test_claim_and_release_sync_assignment_visibility
test_invalid_issue_identifier_fails_before_linear_lookup
test_completions_show_json_for_control_subcommands

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  printf '%d test(s) FAILED\n' "$FAIL" >&2
  exit 1
fi
