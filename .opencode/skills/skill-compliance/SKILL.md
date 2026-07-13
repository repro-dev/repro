---
name: skill-compliance
description: Review changed work against the skills and AGENTS guidance that should govern it. Load during review when convention compliance needs a separate pass from correctness.
---

# Skill Compliance

Use this skill as a narrow review pass after correctness review.

## Goal

Check whether the change followed the repository guidance that explicitly applied to the task, without turning the review into generic style policing.

## What to inspect

1. Which skills should have applied.
   - Examples: `design-system` for UI, `database` for migrations, `bugfix` for bug fixes, `build-and-test` for verification work.
2. Relevant `AGENTS.md` guidance.
3. Package-level `AGENTS.md` files for touched packages.

## What to report

- Only report violations that materially affect correctness, maintainability, or reviewability.
- Prefer changed-code findings over repository-wide commentary.
- Omit speculative or low-confidence nitpicks.

## Output shape

```md
## Skill Compliance

### Applicable guidance
- `<skill or AGENTS section>` — why it applied

### Findings
- [path:line] <concrete mismatch>

### Clean passes
- <guidance checked with no issues>
```

## Examples of good findings

- Bug work changed behavior without adding a regression test required by `bugfix`.
- UI code introduced raw appearance styling where `design-system` requires design components or tokens.
- A new command duplicates orchestration logic instead of delegating to a skill.

## Non-goals

- Repeating formatter or linter output.
- Enforcing rules from skills that clearly did not apply.
- Reporting taste-based disagreements as compliance failures.
