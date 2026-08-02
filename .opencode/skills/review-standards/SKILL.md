---
name: review-standards
description: Review contract for branch and PR reviews — changed-code focus, signal quality, severity, merge-readiness, and the adversarial review contract. Load when reviewing code, using the review agent, or running an adversarial pass.
---

# Review Standards

## Review contract

- Review changed code only; ignore unrelated files, generated noise, and formatter churn.
- Do not duplicate lint or formatter feedback unless it hides a real bug.
- Omit low-confidence findings.
- Zero-finding reviews are valid.
- Every finding must include an actionable fix path.
- Prefer specific, testable feedback over broad style commentary.
- Do not cap findings arbitrarily; improve signal with deduplication, relevance, and confidence filtering instead.

## Linear-first context

- Extract issue IDs from the branch name, PR title, and PR body.
- Fetch every referenced Linear issue and read the full description, decisions, requirements, and considerations.
- Fetch the parent project and milestone when they help explain the intended outcome.
- When issue-scoped artifacts exist in `tmp/` (for example `tmp/context-REP-123.md` or `tmp/test-plan-REP-123.md`), use them as supplemental review context rather than ignoring the documented plan/history.
- For UI diffs, consult the matching durable context artifact so review reflects captured intent instead of inventing it.
- For non-Linear work, use the matching topic-scoped artifacts (for example `tmp/context-foo.md` or `tmp/test-plan-foo.md`) when they exist.
- Treat missing browser evidence, missing viewport/state/interaction notes, or stale handoff artifacts as ordinary requirement gaps rather than mere polish issues.

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
- Note which `tmp/` artifacts were consulted, or state that none were present.
- Note which `tmp/` artifacts still need updating before the next implementation or handoff step, or state that none do.
- For UI diffs, state whether the context artifact was consulted and which artifact supplied it.
- Classify every finding using the severity levels above.
- State merge-readiness explicitly.
- Reference issue requirements by ID when noting gaps.
- Distinguish authored-polish critique from compliance: a UI can satisfy the explicit requirements while still earning a separate authored-polish note.
- End with a clear verdict: approve, request changes, or discuss.
- If there are no findings, say that explicitly.

## Compliance pass

- For changes governed by repository skills, run a distinct compliance pass after correctness review.
- Load `skill-compliance` when you need to verify that the applicable skills and `AGENTS.md` guidance were actually followed.
- Keep compliance findings separate from general correctness findings so the review stays easy to act on.

## Adversarial review contract

### Purpose

The adversarial pass is a skeptical second review that assumes the implementation is wrong and tries to prove it fails. It runs in addition to the standard review for every issue built via `/build`, regardless of risk level. It does not replace the standard review: `review` remains the merge gate for requirements and conventions, and `security-review` remains the policy/security-boundary lane. The adversarial pass is additive and reports only — it never fixes.

### Mindset

- Assume every non-trivial change is broken until shown otherwise.
- Read for what would make the code fail, not what would make it pass.
- Attack failure modes instead of re-verifying requirements coverage — the standard review already covers that.

### Techniques

Apply all seven, and note which were applied in `## Techniques applied`:

1. **Bug-seeking mindset** — hunt for ways the implementation fails with concrete counterexamples.
2. **Edge-case and boundary-value enumeration** — empty, zero, negative, max, and large inputs; off-by-one errors; null and undefined inputs; type coercion surprises.
3. **Happy-path-only logic and untested error paths** — confirm error paths, fallbacks, and failure branches are implemented and exercised, not just decorated.
4. **Acceptance-criterion completeness challenge** — distinguish "met" from "sunny-day slice": does each criterion hold under variations, partial data, and realistic misuse, or only in the ideal case?
5. **Test-quality attacks** — tautological or weak assertions, assertion-free tests, tests that cannot fail, and mocks that assert the mock rather than real behavior.
6. **Hidden coupling** — sibling callsites, shared helpers, alternate code paths, and shared state that a change to one location silently breaks.
7. **Async/time/ordering risks** — Futures vs Promises per project convention, races, retry and ordering assumptions, and time-dependent logic.

### Output framing

- Use the same severity schema (Blocker / Major / Minor / Nit) and `fixable_by_agent: true | false` fields as the standard review, so findings feed the existing Blocker loop and non-blocker sweep unchanged.
- Tag every finding `role: adversarial`. The `<file-path>:<line-number>:<role>` merge key means adversarial findings do not deduplicate against standard-review findings on the same line — that overlap is expected and accepted.
- Include `## Techniques applied` in the output.
- State merge-readiness for the adversarial pass itself, but note that the standard review remains the merge gate.
- End with a verdict: approve, request changes, or discuss.

### Signal quality

- Bias toward concrete counterexamples (input, state, sequence) over speculative noise.
- Omit low-confidence findings rather than reporting them.
- False positives are expected from an adversarial pass, but only demonstrable findings may reach Blocker severity.
- A zero-finding adversarial review is valid: the pass tried to break the implementation and could not.

### Boundary

- `security-review` = policy and security-boundary lane; the adversarial pass hunts for ways bad input breaks code (bug-seeking, edge cases, error paths, test quality).
- `review` = merge gate for requirements and conventions; the adversarial pass is additive.
- `bugfix` owns root-cause fixes; the adversarial pass only reports.

## UI review gate

If the PR touches UI code, verify the interactive states, motion, accessibility, copy, and token usage at a review level.

If the PR touches only non-UI code (migrations, API routes, utilities, or skill files), skip this gate.
