#!/bin/bash
# scripts/lib/tests/test_autobot.sh

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SCRIPTS_DIR="$TESTS_DIR/../.."

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

_make_tmpdir() {
  mktemp -d 2>/dev/null || mktemp -d -t test_autobot
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
WORKSPACE_ROOT="$tmpdir/workspaces"
SCRIPTS_DIR="$SCRIPTS_DIR"
TMP_DIR="$tmpdir/tmp"
mkdir -p "$tmpdir/repro" "$tmpdir/workspaces" "$tmpdir/tmp"
slugify() { printf '%s\n' "\$1" | sed 's|/|-|g' | sed 's|\.\.|-|g' | sed 's|[^a-zA-Z0-9._-]|-|g' | tr '[:upper:]' '[:lower:]'; }
worktree_path() { echo "\${WORKSPACE_ROOT:-\$PARENT_DIR}/repro-wt-\$1"; }
source "$SCRIPTS_DIR/lib/common.sh"
source "$SCRIPTS_DIR/lib/worktree.sh"
source "$SCRIPTS_DIR/lib/opencode.sh"
source "$SCRIPTS_DIR/lib/autonomy.sh"
source "$SCRIPTS_DIR/lib/autobot.sh"
SCRIPTS_DIR="$SCRIPTS_DIR"
$extra
RUNNER
  chmod +x "$tmpdir/run_test.sh"
}

test_help_lists_public_commands() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" 'cmd_autobot_help'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'Usage: autobot <subcommand>' && printf '%s\n' "$output" | grep -q 'discover \[--limit N\] \[--project NAME\] \[-q\] \[--json\]' && ! printf '%s\n' "$output" | grep -q 'prepare <issue>'; then
    _pass 'cmd_autobot_help shows only public commands'
  else
    _fail 'cmd_autobot_help shows only public commands' "rc=$rc; output=$output"
  fi
}

test_worktree_guard_rejects_non_main_checkout() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
REPO_ROOT="$MAIN_CHECKOUT/worktree"
mkdir -p "$REPO_ROOT"
cmd_autobot list
'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -ne 0 ] && printf '%s\n' "$output" | grep -q 'worktrees are execution artifacts'; then
    _pass 'autobot refuses to run from a worktree checkout'
  else
    _fail 'autobot refuses to run from a worktree checkout' "rc=$rc; output=$output"
  fi
}

test_discover_q_emits_issue_ids_only() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
cmd_autonomy() {
  case "$*" in
    discover\ --limit\ 2\ --project\ Demo\ --json)
      printf '%s\n' '{"waves":[{"issues":[{"issue_identifier":"REP-1"},{"issue_identifier":"REP-2"}]}],"deferred":[{"issue_identifier":"REP-3"}]}'
      ;;
    *) return 1 ;;
  esac
}
_autobot_queue_helper() {
  case "$*" in
    discover-ids)
      cat <<'EOF'
REP-1
REP-2
REP-3
EOF
      ;;
    *) return 1 ;;
  esac
}
cmd_autobot discover --limit 2 --project Demo -q
'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && [ "$(printf '%s\n' "$output" | sed '/^$/d' | wc -l | tr -d ' ')" -eq 3 ] && printf '%s\n' "$output" | grep -qx 'REP-1' && printf '%s\n' "$output" | grep -qx 'REP-2' && printf '%s\n' "$output" | grep -qx 'REP-3'; then
    _pass 'autobot discover -q emits issue identifiers only'
  else
    _fail 'autobot discover -q emits issue identifiers only' "rc=$rc; output=$output"
  fi
}

test_entrypoints_are_executable() {
  if [ -x "$SCRIPTS_DIR/../bin/autobot" ] && [ -x "$SCRIPTS_DIR/autobot.sh" ]; then
    _pass 'autobot entrypoints are executable'
  else
    _fail 'autobot entrypoints are executable' "bin/autobot or scripts/autobot.sh is not executable"
  fi
}

test_public_item_json_uses_queue_language() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  _write_runner "$tmpdir" '
mkdir -p "$MAIN_CHECKOUT/tmp"
status_json='"'"'{"items":[{"issue_identifier":"REP-1","claim_state":"queued","claimed_by":"autobot"}]}'"'"'
item_json="$(_autobot_public_item_json "$status_json" REP-1)"
printf '%s\n' "$item_json"
'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q '"queued_by": "autobot"' && ! printf '%s\n' "$output" | grep -q 'claimed_by'; then
    _pass 'autobot public item JSON uses queue language'
  else
    _fail 'autobot public item JSON uses queue language' "rc=$rc; output=$output"
  fi
}

test_add_accepts_multiple_issue_identifiers() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
_write_runner "$tmpdir" '
_autobot_add_issue() {
  printf "queued item %s\n" "$1"
}

cmd_autobot add REP-1 REP-2
'
  output="$(TEST_TMPDIR="$tmpdir" TEST_SCRIPTS_DIR="$SCRIPTS_DIR" bash "$tmpdir/run_test.sh" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'queued item REP-1' && printf '%s\n' "$output" | grep -q 'queued item REP-2'; then
    _pass 'autobot add accepts multiple issue identifiers'
  else
    _fail 'autobot add accepts multiple issue identifiers' "rc=$rc; output=$output"
  fi
}

test_help_lists_public_commands
test_worktree_guard_rejects_non_main_checkout
test_discover_q_emits_issue_ids_only
test_entrypoints_are_executable
test_public_item_json_uses_queue_language
test_add_accepts_multiple_issue_identifiers

printf '\nSummary: %d passed, %d failed, %d total\n' "$PASS" "$FAIL" "$TESTS_RUN"
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
