#!/bin/bash
# scripts/lib/tests/test_pen_reconcile.sh
#
# Unit tests for the REP-1628 pen-reconcile apply step:
#   - skill file exists and documents the five phases (Detect/Judge/Decide/
#     Apply/Record) plus the closed override vocabulary and eval fixture
#   - standalone /pen-reconcile command has valid frontmatter, loads the
#     skill, and parses an optional REP-id argument
#   - delivery-workflow SKILL.md carries the pen-reconcile /build phase clause
#   - eval fixture is present, self-contained, and produces the known deltas
#     (in-vocabulary props, out-of-vocabulary candidate) via pen-contract
#   - deliver.sh routes a Pen-labeled issue to /pen-reconcile

set -euo pipefail

TESTS_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REPO_ROOT="$(cd "$TESTS_DIR/../../.." && pwd -P)"

PASS=0
FAIL=0
TESTS_RUN=0

_pass() { printf '  ✔ %s\n' "$1"; PASS=$((PASS + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }
_fail() { printf '  ✖ %s\n  %s\n' "$1" "${2:-}" >&2; FAIL=$((FAIL + 1)); TESTS_RUN=$((TESTS_RUN + 1)); }

# ── Skill file ────────────────────────────────────────────────────────

test_skill_file_exists_with_five_phases() {
  local skill="$REPO_ROOT/.opencode/skills/pen-reconcile/SKILL.md"
  local ok=1
  [ -f "$skill" ] || ok=0
  # Frontmatter present with name + description
  grep -q '^---' "$skill" || ok=0
  grep -q '^name: pen-reconcile' "$skill" || ok=0
  grep -q '^description:' "$skill" || ok=0
  # Five phases
  for phase in 'Detect' 'Judge' 'Decide' 'Apply' 'Record'; do
    grep -q "$phase" "$skill" || ok=0
  done
  # References the contract input (REP-1622) and the closed vocabulary
  grep -q 'pen:contract' "$skill" || ok=0
  grep -q 'VOCABULARIES' "$skill" || ok=0
  if [ $ok -eq 1 ]; then
    _pass "pen-reconcile SKILL.md exists with frontmatter and five phases"
  else
    _fail "pen-reconcile SKILL.md exists with frontmatter and five phases" "missing or incomplete: $skill"
  fi
}

test_skill_documents_apply_and_record() {
  local skill="$REPO_ROOT/.opencode/skills/pen-reconcile/SKILL.md"
  local ok=1
  # Apply: patch, never regenerate; code-only diff; deferred items list
  grep -qi 'never regenerate\|patch' "$skill" || ok=0
  grep -qi 'deferred' "$skill" || ok=0
  # Record: applied manifest path
  grep -q 'tmp/pen-applied.json' "$skill" || ok=0
  # Eval fixture reference
  grep -q 'eval-fixture' "$skill" || ok=0
  if [ $ok -eq 1 ]; then
    _pass "skill documents Apply (patch/defer) and Record (manifest + fixture)"
  else
    _fail "skill documents Apply (patch/defer) and Record (manifest + fixture)" "missing sections in $skill"
  fi
}

# ── Command file ──────────────────────────────────────────────────────

test_command_file_integrity() {
  local cmd="$REPO_ROOT/.opencode/commands/pen-reconcile.md"
  local ok=1
  [ -f "$cmd" ] || ok=0
  grep -q '^---' "$cmd" || ok=0
  grep -q 'description:' "$cmd" || ok=0
  grep -q '\$ARGUMENTS' "$cmd" || ok=0
  grep -q 'pen-reconcile' "$cmd" || ok=0
  grep -q 'REP-' "$cmd" || ok=0
  if [ $ok -eq 1 ]; then
    _pass "pen-reconcile command has frontmatter, \$ARGUMENTS, and skill reference"
  else
    _fail "pen-reconcile command has frontmatter, \$ARGUMENTS, and skill reference" "missing or incomplete: $cmd"
  fi
}

# ── delivery-workflow phase clause ────────────────────────────────────

test_delivery_workflow_phase_clause() {
  local dw="$REPO_ROOT/.opencode/skills/delivery-workflow/SKILL.md"
  local ok=1
  [ -f "$dw" ] || ok=0
  grep -q 'pen-reconcile' "$dw" || ok=0
  grep -q '## Design (locked)' "$dw" || ok=0
  if [ $ok -eq 1 ]; then
    _pass "delivery-workflow SKILL.md has the pen-reconcile phase clause"
  else
    _fail "delivery-workflow SKILL.md has the pen-reconcile phase clause" "missing in $dw"
  fi
}

# ── Eval fixture ──────────────────────────────────────────────────────

test_eval_fixture_files_present() {
  local ok=1
  for f in README.md test.pen Button.tsx scenario.md; do
    [ -f "$REPO_ROOT/tmp/eval-fixture/$f" ] || ok=0
  done
  if [ $ok -eq 1 ]; then
    _pass "eval fixture files present (README, test.pen, Button.tsx, scenario.md)"
  else
    _fail "eval fixture files present (README, test.pen, Button.tsx, scenario.md)" "missing in $REPO_ROOT/tmp/eval-fixture/"
  fi
}

test_eval_fixture_contract_produces_known_deltas() {
  local pen="$REPO_ROOT/tmp/eval-fixture/test.pen"
  local contract
  contract="$(cd "$REPO_ROOT" && node_modules/.bin/tsx scripts/pen-contract.ts --pen-file "$pen" 2>&1)" || {
    _fail "eval fixture contract produces known deltas" "pen-contract failed on $pen: $contract"
    return
  }
  local ok=1
  # In-vocabulary: Button fill -> context, height -> size, Label -> children
  printf '%s' "$contract" | grep -q '"context": "success"' || ok=0
  printf '%s' "$contract" | grep -q '"size": "large"' || ok=0
  printf '%s' "$contract" | grep -q '"children": "Create account"' || ok=0
  # State family present (content + loading)
  printf '%s' "$contract" | grep -q '"stateFamilies"' || ok=0
  # Out-of-vocabulary instance surfaces as a warning, never silently guessed
  printf '%s' "$contract" | grep -qi 'unmapped override' || ok=0
  if [ $ok -eq 1 ]; then
    _pass "eval fixture contract maps in-vocabulary props and surfaces out-of-vocabulary"
  else
    _fail "eval fixture contract maps in-vocabulary props and surfaces out-of-vocabulary" "contract excerpt: $(printf '%s' "$contract" | head -c 800)"
  fi
}

test_eval_fixture_scenarios_documented() {
  local scen="$REPO_ROOT/tmp/eval-fixture/scenario.md"
  local ok=1
  [ -f "$scen" ] || ok=0
  for kw in 'In-vocabulary' 'Out-of-vocabulary' 'Scoped relevance'; do
    grep -q "$kw" "$scen" || ok=0
  done
  if [ $ok -eq 1 ]; then
    _pass "eval fixture documents three scenarios"
  else
    _fail "eval fixture documents three scenarios" "missing in $scen"
  fi
}

# ── deliver.sh routing (static check; behavioral test in test_deliver.sh) ──

test_deliver_sh_pen_routing_present() {
  local ok=1
  grep -q '"Pen"' "$REPO_ROOT/scripts/deliver.sh" || ok=0
  grep -q '/pen-reconcile' "$REPO_ROOT/scripts/deliver.sh" || ok=0
  if [ $ok -eq 1 ]; then
    _pass "deliver.sh contains Pen -> /pen-reconcile routing"
  else
    _fail "deliver.sh contains Pen -> /pen-reconcile routing" "missing in $REPO_ROOT/scripts/deliver.sh"
  fi
}

# ── Run all tests ──────────────────────────────────────────────────────

test_skill_file_exists_with_five_phases
test_skill_documents_apply_and_record
test_command_file_integrity
test_delivery_workflow_phase_clause
test_eval_fixture_files_present
test_eval_fixture_contract_produces_known_deltas
test_eval_fixture_scenarios_documented
test_deliver_sh_pen_routing_present

echo ""
echo "Results: $PASS passed, $FAIL failed out of $TESTS_RUN tests"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
