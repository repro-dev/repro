---
name: test-plan
description: Create a focused test strategy before or during implementation. Load when new behavior, bug fixes, or public contract changes need deliberate coverage planning.
---

# Test Plan

Use this skill when the work needs more than ad hoc test selection.

Write the artifact to `tmp/test-plan-<issue-id>.md` whenever the work will be delegated to `develop` for a new behavior, bug fix, or public contract change. For non-Linear work, use `tmp/test-plan-<topic>.md` instead. Inline plans are only acceptable for small non-delegated changes handled directly in the outer conversation.

## Testing principles

- Prefer integration-level coverage when it exercises the real behavior without excessive setup.
- Add a regression test for every bug fix.
- Do not test the type system, framework internals, or implementation trivia.
- Avoid duplicate coverage when an existing test already proves the same behavior.
- Fill meaningful neighborhood gaps when you are already in the surrounding test file.
- Keep test effort proportional to risk and surface area.

## Plan format

```md
# Test Plan — <issue-id or topic>

## Behaviors To Cover
- <requirement or bug behavior>

## Test Levels
- Integration: <what to cover here>
- Unit: <only if needed>
- Manual: <only if automation is impractical>

## Files
- `<test file path>` — <why this file is the right home>

## Gaps To Leave Explicitly Uncovered
- <anything intentionally not covered, with rationale>
```

## Review questions

- Does each new requirement map to at least one planned assertion?
- Would the proposed test fail for the pre-fix or pre-feature behavior?
- Is the plan reusing an existing test harness instead of creating a parallel one?
- Is any proposed test merely asserting implementation details?
