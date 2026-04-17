---
name: review-standards
description: Review contract for branch and PR reviews — changed-code focus, signal quality, severity, and merge-readiness. Load when reviewing code or using the review agent.
---

# Review Standards

## Review contract

- Review changed code only; ignore unrelated files, generated noise, and formatter churn.
- Do not duplicate lint or formatter feedback unless it hides a real bug.
- Omit low-confidence findings.
- Zero-finding reviews are valid.
- Every finding must include an actionable fix path.
- Prefer specific, testable feedback over broad style commentary.

## Linear-first context

- Extract issue IDs from the branch name, PR title, and PR body.
- Fetch every referenced Linear issue and read the full description, decisions, requirements, and considerations.
- Fetch the parent project and milestone when they help explain the intended outcome.

## Severity classification

Classify every finding using one of these four levels:

| Severity    | Definition                                                                     | Merge impact                                        |
| ----------- | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| **Blocker** | Correctness bug, type error, security issue, or broken acceptance criterion    | Must fix before merge                               |
| **Major**   | Missing test coverage, architectural concern, or incomplete requirement        | Fix preferred; if deferred, track in a Linear issue |
| **Minor**   | Naming inconsistency, missing comment, suboptimal pattern — code still correct | Fix preferred, not required                         |
| **Nit**     | Style preference with no functional impact                                     | Never blocks merge                                  |

**Merge-readiness criteria**: a PR is mergeable when it has **zero Blockers** and any Majors are either fixed or tracked in a linked Linear issue.

**Use this severity map as a starting point**:

| Checklist item                           | Default severity |
| ---------------------------------------- | ---------------- |
| Type errors or build failures            | Blocker          |
| Broken or missing acceptance criteria    | Blocker          |
| Security or auth issues                  | Blocker          |
| Missing test coverage for new behavior   | Major            |
| Architectural deviation from conventions | Major            |
| Incomplete requirement (partial impl)    | Major            |
| Naming inconsistency                     | Minor            |
| Missing comment on non-obvious code      | Minor            |
| Suboptimal pattern (code still correct)  | Minor            |
| Style preference or formatting           | Nit              |

## Review output

- Lead with context: briefly note which Linear issues were reviewed and any decisions that affected the review.
- Classify every finding using the severity levels above.
- State merge-readiness explicitly.
- Reference issue requirements by ID when noting gaps.
- End with a clear verdict: approve, request changes, or discuss.
- If there are no findings, say that explicitly.

## UI review gate

If the PR touches UI code, verify the interactive states, motion, accessibility, copy, and token usage at a review level.

For a deeper scored audit across tokens, components, layout, interaction states, accessibility, copy, type safety, and resilience, load the `audit-ui-quality` skill.

If the PR touches only non-UI code (migrations, API routes, utilities, or skill files), skip this gate.
