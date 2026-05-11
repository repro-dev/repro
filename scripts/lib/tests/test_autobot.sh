#!/bin/bash
# scripts/lib/tests/test_autobot.sh

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
SCRIPTS_DIR="$TESTS_DIR/../.."
REPO_ROOT="$(dirname "$SCRIPTS_DIR")"
TMP_ROOT="$REPO_ROOT/tmp"

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

_make_tmpdir() {
  mkdir -p "$TMP_ROOT"
  mktemp -d "$TMP_ROOT/test_autobot.XXXXXX"
}

test_help_lists_public_commands() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  output="$(TEST_TMPDIR="$tmpdir" REPO_ROOT="$tmpdir/repro" bash -lc 'mkdir -p "$REPO_ROOT"; source "$1/lib/autobot.sh"; cmd_autobot_help' _ "$SCRIPTS_DIR" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'Usage: autobot <subcommand>' && printf '%s\n' "$output" | grep -q 'config list \[--json\]'; then
    _pass 'cmd_autobot_help shows the public command surface'
  else
    _fail 'cmd_autobot_help shows the public command surface' "rc=$rc; output=$output"
  fi
}

test_config_and_queue_commands_round_trip() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  mkdir -p "$tmpdir/repro/.autobot"
  output="$(TEST_TMPDIR="$tmpdir" REPO_ROOT="$tmpdir/repro" bash -lc 'source "$1/lib/autobot.sh"; cmd_autobot config set engine.auto-discover on --json; cmd_autobot add REP-1; cmd_autobot status --json; cmd_autobot discover -q; cmd_autobot remove REP-1 --json' _ "$SCRIPTS_DIR" 2>&1)" || rc=$?
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q '"value":"on"' && printf '%s\n' "$output" | grep -q '"issue_identifier":"REP-1"' && printf '%s\n' "$output" | grep -qx 'REP-1'; then
    _pass 'autobot config and queue commands stay wired together'
  else
    _fail 'autobot config and queue commands stay wired together' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_help_lists_public_commands
test_config_and_queue_commands_round_trip

printf '\nSummary: %d passed, %d failed, %d total\n' "$PASS" "$FAIL" "$TESTS_RUN"
[ "$FAIL" -eq 0 ]
