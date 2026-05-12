#!/bin/bash
# scripts/lib/tests/test_review_agent_permissions.sh
#
# Regression tests for REP-1088: the review agent may read Linear issue
# context, but must remain read-only.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REVIEW_AGENT_MD="$TESTS_DIR/../../../.opencode/agents/review.md"
ROOT_AGENTS_MD="$TESTS_DIR/../../../AGENTS.md"

# ── Harness ──────────────────────────────────────────────────────────

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

_assert_contains() {
  local file="$1" needle="$2" desc="$3"
  if grep -Fq "$needle" "$file"; then
    _pass "$desc"
  else
    _fail "$desc" "missing: $needle in $file"
  fi
}

_assert_not_contains() {
  local file="$1" needle="$2" desc="$3"
  if grep -Fq "$needle" "$file"; then
    _fail "$desc" "unexpectedly found: $needle in $file"
  else
    _pass "$desc"
  fi
}

# ── Tests ─────────────────────────────────────────────────────────────

test_review_agent_exists() {
  if [ -f "$REVIEW_AGENT_MD" ]; then
    _pass "review agent config exists"
  else
    _fail "review agent config exists" "file not found: $REVIEW_AGENT_MD"
  fi
}

test_review_agent_can_read_linear_issues_without_mutation_access() {
  _assert_contains "$REVIEW_AGENT_MD" '"*": "deny"' 'review agent denies bash by default'
  _assert_contains "$REVIEW_AGENT_MD" '"linear issue show*": "allow"' 'review agent allows linear issue show'
  _assert_not_contains "$REVIEW_AGENT_MD" '"linear*": "allow"' 'review agent does not allow broad linear access'
  _assert_not_contains "$REVIEW_AGENT_MD" '"linear issue update*": "allow"' 'review agent does not allow linear updates'
  _assert_not_contains "$REVIEW_AGENT_MD" '"linear issue comment*": "allow"' 'review agent does not allow linear comments'
  _assert_contains "$REVIEW_AGENT_MD" 'linear issue show <issue-id> --json' 'review agent documents the read-only Linear command'
}

test_root_agents_document_review_permissions() {
  _assert_contains "$ROOT_AGENTS_MD" 'Read-only; restricted bash (git log/diff/show and linear issue show\*)' 'AGENTS.md documents review Linear read access'
}

# ── Run all tests ─────────────────────────────────────────────────────

test_review_agent_exists
test_review_agent_can_read_linear_issues_without_mutation_access
test_root_agents_document_review_permissions

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
