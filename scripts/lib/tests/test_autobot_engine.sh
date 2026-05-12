#!/bin/bash
# scripts/lib/tests/test_autobot_engine.sh

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
  mktemp -d "$TMP_ROOT/test_autobot_engine.XXXXXX"
}

test_help_mentions_commands() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  output="$(TEST_TMPDIR="$tmpdir" REPO_ROOT="$tmpdir/repro" bash -lc 'mkdir -p "$REPO_ROOT"; source "$1/lib/autobot-engine.sh"; cmd_autobot_engine --help' _ "$SCRIPTS_DIR" 2>&1)" || rc=$?
  rm -rf "$tmpdir"
  if [ $rc -eq 0 ] && printf '%s\n' "$output" | grep -q 'Usage: autobot-engine <command>'; then
    _pass 'cmd_autobot_engine --help mentions command surface'
  else
    _fail 'cmd_autobot_engine --help mentions command surface' "rc=$rc; output=$output"
  fi
}

test_start_status_and_stop_round_trip() {
  local tmpdir output rc=0
  tmpdir="$(_make_tmpdir)"
  mkdir -p "$tmpdir/repro/.autobot"
  node - "$tmpdir/repro/.autobot/state.sqlite" <<'NODE'
const { DatabaseSync } = require('node:sqlite')

const db = new DatabaseSync(process.argv[2])
db.exec('CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
db.prepare('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
  'queue',
  JSON.stringify({
    items: [
      { issue_identifier: 'REP-1094', claim_state: 'queued', workspace_path: '/work/rep-1094', attempt_count: 0 },
      { issue_identifier: 'REP-1095', claim_state: 'running', workspace_path: '/work/rep-1095', attempt_count: 1 },
    ],
    schema_version: 1,
  })
)
db.close()
NODE
  output="$(TEST_TMPDIR="$tmpdir" REPO_ROOT="$tmpdir/repro" bash -lc 'source "$1/lib/autobot-engine.sh"; cmd_autobot_engine start --once; cmd_autobot_engine status --json; cmd_autobot_engine stop --json' _ "$SCRIPTS_DIR" 2>&1)" || rc=$?
  if [ $rc -eq 0 ] && [ -f "$tmpdir/repro/.autobot/state.sqlite" ] && printf '%s\n' "$output" | grep -q '"current_issue":"REP-1094"' && printf '%s\n' "$output" | grep -q '"running":true' && printf '%s\n' "$output" | grep -q '"running":false'; then
    _pass 'cmd_autobot_engine start/status/stop stay in sync'
  else
    _fail 'cmd_autobot_engine start/status/stop stay in sync' "rc=$rc; output=$output"
  fi
  rm -rf "$tmpdir"
}

test_help_mentions_commands
test_start_status_and_stop_round_trip

printf '\nSummary: %d passed, %d failed, %d total\n' "$PASS" "$FAIL" "$TESTS_RUN"
[ "$FAIL" -eq 0 ]
