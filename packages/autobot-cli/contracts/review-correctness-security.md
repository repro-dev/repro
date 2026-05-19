# Autobot phase contract — review-correctness-security

## Load before work
- Load the `review-standards` skill before judging.
- `review-standards`

## Inputs
- committed branch diff
- `run-plan.md`
- `smoke-test-result.md`
- Linear issue via `linear issue show <issue-id> --json`

## Responsibilities
- Read the diff and evidence before judging.
- Read the diff, the `run-plan.md`, the `smoke-test-result.md`.
- Fetch the Linear issue before reviewing.
- Review the committed branch diff with `git diff main...HEAD`.
- Focus on correctness, edge cases, error paths, and security.
- Evaluate async correctness, auth, permissions, injection, data exposure, and unsafe deserialization when relevant.
- If smoke tests failed, classify each failure as `caused-by-this-change` or `pre-existing`.
- Treat `caused-by-this-change` failures as blocking correctness findings.
- Return the structured output required by `.opencode/agents/review.md`.
- Assign each finding `role: correctness-security`.
- Report findings only; do not repair code here.
- Write `review-output.md` with correctness, safety, and security findings.

## Output
- `review-output.md`
- correctness and security findings with concrete file + line references
- structured findings with `severity`, `category`, `fixable_by_agent`, and `role`
