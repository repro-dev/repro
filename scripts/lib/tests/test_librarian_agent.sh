#!/bin/bash
# scripts/lib/tests/test_librarian_agent.sh
#
# Regression tests for REP-1051: the librarian agent must be present,
# read-only, and integrated into the root workflow guidance.

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
LIBRARIAN_AGENT_MD="$TESTS_DIR/../../../.opencode/agents/librarian.md"
PLANNER_AGENT_MD="$TESTS_DIR/../../../.opencode/agents/planner.md"
DEVELOP_AGENT_MD="$TESTS_DIR/../../../.opencode/agents/develop.md"
ROOT_AGENTS_MD="$TESTS_DIR/../../../AGENTS.md"
OPENAI_GPT55_PROFILE="$TESTS_DIR/../../../.opencode/profiles/openai-gpt5.5.json"
OPENAI_GPT54_PROFILE="$TESTS_DIR/../../../.opencode/profiles/openai-gpt5.4.json"
GITHUB_COPILOT_SONNET46_PROFILE="$TESTS_DIR/../../../.opencode/profiles/github-copilot-sonnet4.6.json"
GITHUB_COPILOT_OPUS46_SONNET46_PROFILE="$TESTS_DIR/../../../.opencode/profiles/github-copilot-opus4.6-sonnet4.6.json"
OPENCODE_GO_GLM51_MINIMAX27_PROFILE="$TESTS_DIR/../../../.opencode/profiles/opencode-go-glm5.1-minimax2.7.json"
OPENROUTER_MINIMAX27_PROFILE="$TESTS_DIR/../../../.opencode/profiles/openrouter-minimax2.7.json"
OPENROUTER_GLM51_MINIMAX27_PROFILE="$TESTS_DIR/../../../.opencode/profiles/openrouter-glm5.1-minimax2.7.json"

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

_assert_profile_librarian_model() {
  local file="$1" expected="$2" desc="$3"
  if python3 - "$file" "$expected" <<'PY'
import json
import sys

path, expected = sys.argv[1:3]
with open(path, encoding='utf-8') as fh:
    config = json.load(fh)

sys.exit(0 if config.get('agent', {}).get('librarian', {}).get('model') == expected else 1)
PY
  then
    _pass "$desc"
  else
    _fail "$desc" "librarian model mismatch in $file (expected $expected)"
  fi
}

# ── Tests ─────────────────────────────────────────────────────────────

test_librarian_agent_exists() {
  if [ -f "$LIBRARIAN_AGENT_MD" ]; then
    _pass "librarian agent config exists"
  else
    _fail "librarian agent config exists" "file not found: $LIBRARIAN_AGENT_MD"
  fi
}

test_librarian_agent_is_read_only_and_source_backed() {
  _assert_contains "$LIBRARIAN_AGENT_MD" 'read-only external research agent' 'librarian agent is described as read-only'
  _assert_contains "$LIBRARIAN_AGENT_MD" 'official docs, upstream source, and examples' 'librarian agent is source-backed'
  _assert_contains "$LIBRARIAN_AGENT_MD" 'cited sources' 'librarian agent requires cited sources'
  _assert_contains "$LIBRARIAN_AGENT_MD" 'permission:' 'librarian agent declares permissions'
  _assert_contains "$LIBRARIAN_AGENT_MD" 'tools:' 'librarian agent disables mutation-capable tools'
  _assert_contains "$LIBRARIAN_AGENT_MD" 'write: false' 'librarian agent disables write'
  _assert_contains "$LIBRARIAN_AGENT_MD" 'edit: false' 'librarian agent disables edit'
  _assert_contains "$LIBRARIAN_AGENT_MD" '"*": "deny"' 'librarian agent denies bash by default'
}

test_librarian_agent_documents_research_workflow_and_boundaries() {
  _assert_contains "$LIBRARIAN_AGENT_MD" 'official documentation first, then upstream source, then examples or secondary sources' 'librarian agent documents research priority'
  _assert_contains "$LIBRARIAN_AGENT_MD" 'Do not invent undocumented behavior.' 'librarian agent forbids speculation'
  _assert_contains "$LIBRARIAN_AGENT_MD" 'Do not propose registry sync, install-command generation, or third-party ingestion pipelines.' 'librarian agent forbids v1 out-of-scope behaviors'
  _assert_contains "$LIBRARIAN_AGENT_MD" 'Do not replace repo-local code exploration' 'librarian agent remains external-research only'
  _assert_contains "$LIBRARIAN_AGENT_MD" 'Question' 'librarian agent output format includes Question'
  _assert_contains "$LIBRARIAN_AGENT_MD" 'Open uncertainties' 'librarian agent output format includes open uncertainties'
}

test_root_agents_document_librarian_access() {
  _assert_contains "$ROOT_AGENTS_MD" '| `librarian` | Explorer' 'AGENTS.md adds librarian to the roster'
  _assert_contains "$ROOT_AGENTS_MD" '**`librarian`**: when external dependency behavior is unclear' 'AGENTS.md explains when to use librarian'
  _assert_contains "$ROOT_AGENTS_MD" '| `librarian`          | No' 'AGENTS.md marks librarian as non-mutating'
}

test_planner_and_develop_reference_librarian() {
  _assert_contains "$PLANNER_AGENT_MD" 'consult `librarian`' 'planner guidance references librarian'
  _assert_contains "$DEVELOP_AGENT_MD" 'consult `librarian`' 'develop guidance references librarian'
}

test_profile_agent_maps_include_librarian() {
  _assert_profile_librarian_model "$OPENAI_GPT55_PROFILE" 'openai/gpt-5.4-mini' 'openai gpt5.5 profile maps librarian to gpt-5.4-mini'
  _assert_profile_librarian_model "$OPENAI_GPT54_PROFILE" 'openai/gpt-5.4-mini' 'openai gpt5.4 profile maps librarian to gpt-5.4-mini'
  _assert_profile_librarian_model "$GITHUB_COPILOT_SONNET46_PROFILE" 'github-copilot/claude-sonnet-4.6' 'github copilot sonnet4.6 profile maps librarian to claude-sonnet-4.6'
  _assert_profile_librarian_model "$GITHUB_COPILOT_OPUS46_SONNET46_PROFILE" 'github-copilot/claude-sonnet-4.6' 'github copilot opus4.6/sonnet4.6 profile maps librarian to claude-sonnet-4.6'
  _assert_profile_librarian_model "$OPENCODE_GO_GLM51_MINIMAX27_PROFILE" 'opencode-go/minimax-m2.7' 'opencode-go profile maps librarian to minimax-m2.7'
  _assert_profile_librarian_model "$OPENROUTER_MINIMAX27_PROFILE" 'openrouter/minimax/minimax-m2.7' 'openrouter minimax profile maps librarian to minimax-m2.7'
  _assert_profile_librarian_model "$OPENROUTER_GLM51_MINIMAX27_PROFILE" 'openrouter/minimax/minimax-m2.7' 'openrouter glm5.1/minimax profile maps librarian to minimax-m2.7'
}

# ── Run all tests ─────────────────────────────────────────────────────

test_librarian_agent_exists
test_librarian_agent_is_read_only_and_source_backed
test_librarian_agent_documents_research_workflow_and_boundaries
test_root_agents_document_librarian_access
test_planner_and_develop_reference_librarian
test_profile_agent_maps_include_librarian

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
