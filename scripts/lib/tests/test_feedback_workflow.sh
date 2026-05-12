#!/bin/bash
# scripts/lib/tests/test_feedback_workflow.sh
#
# Regression tests for REP-1058: the customer feedback synthesis workflow,
# command shim, and cross-linked guidance must all stay aligned.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT_DIR="$TESTS_DIR/../../.."
WORKFLOW_MD="$ROOT_DIR/.opencode/skills/feedback-synthesis-workflow/SKILL.md"
COMMAND_MD="$ROOT_DIR/.opencode/commands/feedback.md"
ISSUE_SHAPING_MD="$ROOT_DIR/.opencode/skills/issue-shaping-workflow/SKILL.md"
PLAN_COMMAND_MD="$ROOT_DIR/.opencode/commands/plan.md"
CREATE_ISSUE_MD="$ROOT_DIR/.opencode/skills/create-issue/SKILL.md"
ROOT_AGENTS_MD="$ROOT_DIR/AGENTS.md"

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  PASS %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  FAIL %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

assert_contains() {
  local file="$1" needle="$2" label="$3"

  if grep -qF -- "$needle" "$file"; then
    _pass "$label"
  else
    _fail "$label" "missing text: $needle"
  fi
}

test_file_exists() {
  local file="$1" label="$2"

  if [ -f "$file" ]; then
    _pass "$label"
  else
    _fail "$label" "file not found: $file"
  fi
}

test_workflow_contract() {
  test_file_exists "$WORKFLOW_MD" 'feedback synthesis workflow exists'
  assert_contains "$WORKFLOW_MD" 'read-only synthesis lane' 'workflow is read-only'
  assert_contains "$WORKFLOW_MD" 'support notes, user reports, issue comments, call notes, and ad hoc exports' 'workflow names supported sources'
  assert_contains "$WORKFLOW_MD" 'cluster recurring themes' 'workflow clusters recurring themes'
  assert_contains "$WORKFLOW_MD" 'separate systemic patterns from one-offs' 'workflow distinguishes systemic patterns from one-offs'
  assert_contains "$WORKFLOW_MD" 'tmp/feedback-brief-<topic>.md' 'workflow produces a durable feedback brief'
  assert_contains "$WORKFLOW_MD" 'recommend follow-up actions' 'workflow recommends follow-up actions'
  assert_contains "$WORKFLOW_MD" 'complements `issue-shaping-workflow`, `product-planning`, and `create-issue`' 'workflow stays additive to planning workflows'
  assert_contains "$WORKFLOW_MD" 'traceable evidence and explicit uncertainty' 'workflow emphasizes evidence and uncertainty'
}

test_command_contract() {
  test_file_exists "$COMMAND_MD" 'feedback command exists'
  assert_contains "$COMMAND_MD" 'Loads the `feedback-synthesis-workflow` skill' 'command loads the new workflow skill'
  assert_contains "$COMMAND_MD" '/feedback' 'command routes to /feedback'
  assert_contains "$COMMAND_MD" 'thin command shim' 'command stays thin'
}

test_integration_guidance() {
  assert_contains "$ISSUE_SHAPING_MD" 'synthesized feedback briefs' 'issue shaping consumes synthesized briefs'
  assert_contains "$ISSUE_SHAPING_MD" 'Do not redo the upstream clustering work' 'issue shaping avoids re-clustering raw feedback'
  assert_contains "$PLAN_COMMAND_MD" 'Redirect raw customer-feedback intake to /feedback' 'plan command routes feedback intake'
  assert_contains "$CREATE_ISSUE_MD" 'traceable evidence and explicit uncertainty' 'create-issue guidance preserves evidence and uncertainty'
  assert_contains "$ROOT_AGENTS_MD" 'feedback-synthesis-workflow' 'root AGENTS lists the new workflow'
  assert_contains "$ROOT_AGENTS_MD" 'tmp/feedback-brief-<topic>.md' 'root AGENTS lists the new durable artifact'
}

test_workflow_contract
test_command_contract
test_integration_guidance

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
