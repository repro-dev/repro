#!/bin/bash
# scripts/lib/tests/test_enrich_issues_command.sh
#
# Static regression tests for the /enrich-issues command contract.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
COMMAND_FILE="$TESTS_DIR/../../../.opencode/commands/enrich-issues.md"

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

assert_contains() {
  local needle="$1"
  local label="$2"

  if grep -qF -- "$needle" "$COMMAND_FILE"; then
    _pass "$label"
  else
    _fail "$label" "missing text: $needle"
  fi
}

test_file_exists() {
  if [ -f "$COMMAND_FILE" ]; then
    _pass "enrich-issues command file exists"
  else
    _fail "enrich-issues command file exists" "file not found: $COMMAND_FILE"
  fi
}

test_contract_mentions_both_modes() {
  assert_contains 'project-scoped backlog scan' 'contract describes project-scoped mode'
  assert_contains '--issue REP-123' 'contract describes single-issue flag'
  assert_contains 'single-issue mode' 'contract names single-issue mode'
  assert_contains 'project-scan mode' 'contract names project-scan mode'
  assert_contains 'These modes are mutually exclusive.' 'contract treats the modes as exclusive'
}

test_candidate_selection_rules_are_explicit() {
  assert_contains 'linear issue list --status backlog --json' 'project-scan backlog query is retained'
  assert_contains 'linear issue list --status todo --json' 'project-scan todo query is retained'
  assert_contains 'linear issue show <target_issue_id> --json' 'single-issue lookup is documented'
  assert_contains 'Reject bare issue IDs' 'bare issue IDs remain unsupported'
  assert_contains 'unknown flags' 'unknown flags are rejected'
}

test_enrichment_and_summary_contract_is_retained() {
  assert_contains 'Append new sections below' 'description updates stay additive'
  assert_contains 'Enriched by agent' 'audit comment idempotency marker is retained'
  assert_contains 'Apply the `needs-spec` label' 'needs-spec labeling path is retained'
  assert_contains 'In single-issue mode, report `Total scanned` as `1`' 'single-issue summary count is explicit'
}

test_file_exists
test_contract_mentions_both_modes
test_candidate_selection_rules_are_explicit
test_enrichment_and_summary_contract_is_retained

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ $FAIL -ne 0 ]; then
  exit 1
fi
