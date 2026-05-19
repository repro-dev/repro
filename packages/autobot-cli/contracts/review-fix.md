# Autobot phase contract — review-fix

## Load before work
- Load `implementation-rigor` and `review-standards` before fixing.
- `implementation-rigor`
- `review-standards`

## Inputs
- `review-standard.md`
- `review-correctness-security.md`
- `review-architecture-conventions.md`
- `review-performance.md`
- `review-ui-quality.md`
- `run-plan.md`
- `smoke-test-result.md`

## Responsibilities
- Read the lane-specific review artifacts, the `run-plan.md`, and the `smoke-test-result.md`.
- Run only when every blocking finding to address is `fixable_by_agent: true`.
- Stop and escalate when any blocker is not agent-fixable.
- Apply the smallest follow-up diff that addresses fixable review findings.
- Keep scope bounded to the reviewed change set.
- Update tests only as needed to preserve the contract.
- Write the smallest follow-up diff.
- Do not start a fourth fix attempt after three consecutive unsuccessful fix attempts; escalate for human decision.
- After each fix, return to review with a new committed diff.
- Do not push or create a PR from this phase.

## Output
- follow-up diff
- updated review summary when required
- `.autobot/runs/<issue-id>/attempt-<attempt>/review-fix.md`
- fix-attempt summary tied to the addressed finding IDs
