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
- A Blocker must include concrete evidence tied to changed behavior and an actionable fix path; weak or unsupported claims do not enter the fix queue as blockers.
- Prefer specific, testable feedback over broad style commentary.
- Do not cap findings arbitrarily; improve signal with deduplication, relevance, and confidence filtering instead.

## Linear-first context

- Extract issue IDs from the branch name, PR title, and PR body.
- Fetch every referenced Linear issue and read the full description, decisions, requirements, and considerations.
- Fetch the parent project and milestone when they help explain the intended outcome.
- When issue-scoped artifacts exist in `tmp/` (for example `tmp/context-REP-123.md` or `tmp/test-plan-REP-123.md`), use them as supplemental review context rather than ignoring the documented plan/history.
- For UI diffs, consult the matching durable context artifact so review reflects captured intent instead of inventing it.
- For non-Linear work, use the matching topic-scoped artifacts (for example `tmp/context-foo.md` or `tmp/test-plan-foo.md`) when they exist.
- For UI-touching deliveries (REP-1646 audit gate), a missing or incomplete audit artifact — no `tmp/ui-verification/<issue-id>/manifest.json` or `audit.md`, missing rendered evidence or viewport/state/interaction notes, or findings without a fixed/filed disposition — is a **Blocker**, not an ordinary requirement gap. Review does not start without the audit artifact.
- For non-UI diffs, missing or stale handoff artifacts remain ordinary requirement-level gaps rather than mere polish issues.

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

| Checklist item                                        | Default severity |
| ----------------------------------------------------- | ---------------- |
| Type errors or build failures                         | Blocker          |
| Broken or missing acceptance criteria                 | Blocker          |
| Security or auth issues                               | Blocker          |
| Missing audit artifact on a UI-touching PR (REP-1646) | Blocker          |
| Missing test coverage for new behavior                | Major            |
| Architectural deviation from conventions              | Major            |
| Incomplete requirement (partial impl)                 | Major            |
| Naming inconsistency                                  | Minor            |
| Missing comment on non-obvious code                   | Minor            |
| Suboptimal pattern (code still correct)               | Minor            |
| Style preference or formatting                        | Nit              |

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

The adversarial pass is a skeptical second review that assumes the implementation may be wrong and tries to prove it fails. In `/build`, run it only when the explicit high-risk trigger in `delivery-workflow` is met; it is additive and never replaces standard review. Every code change still receives standard review, and every security-sensitive change receives a focused `security-review` even when it is the only aggregate-risk signal. Directly requested adversarial reviews remain available outside `/build` risk routing. The adversarial pass reports only — it never fixes.

### Mindset

- Assume every non-trivial change is broken until shown otherwise.
- Read for what would make the code fail, not what would make it pass.
- Attack failure modes instead of re-verifying requirements coverage — the standard review already covers that.

### Techniques

The following seven techniques are available, not a mandatory checklist. Select only techniques relevant to the changed code and risk profile. For every selected technique, give a concise justification; explicitly list techniques omitted as irrelevant and why. Do not apply a technique mechanically when the code and risk provide no useful target:

1. **Bug-seeking mindset** — hunt for ways the implementation fails with concrete counterexamples.
2. **Edge-case and boundary-value enumeration** — empty, zero, negative, max, and large inputs; off-by-one errors; null and undefined inputs; type coercion surprises.
3. **Happy-path-only logic and untested error paths** — confirm error paths, fallbacks, and failure branches are implemented and exercised, not just decorated.
4. **Acceptance-criterion completeness challenge** — distinguish "met" from "sunny-day slice": does each criterion hold under variations, partial data, and realistic misuse, or only in the ideal case?
5. **Test-quality attacks** — tautological or weak assertions, assertion-free tests, tests that cannot fail, and mocks that assert the mock rather than real behavior.
6. **Hidden coupling** — sibling callsites, shared helpers, alternate code paths, and shared state that a change to one location silently breaks.
7. **Async/time/ordering risks** — Futures vs Promises per project convention, races, retry and ordering assumptions, and time-dependent logic.

### Output framing

- Use the same severity schema (Blocker / Major / Minor / Nit) and `fixable_by_agent: true | false` fields as the standard review, so findings feed the existing Blocker loop and non-blocker sweep unchanged.
- Tag every finding `role: adversarial`; role is provenance, not a deduplication key. `/build` consolidates findings by underlying failure while preserving all reviewer roles, locations, evidence, and rationale.
- Include `## Techniques applied` with selected techniques and justifications plus explicit irrelevant omissions.
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

If the PR touches UI code (classifier verdict `uiTouching: true` recorded in the delivery status table), verify the interactive states, motion, accessibility, copy, and token usage at a review level, and verify the REP-1646 audit artifact:

1. Confirm `tmp/ui-verification/<issue-id>/manifest.json` and `audit.md` exist and are complete for affected surfaces. Require top-level `auditCheckpointCommit` and per-surface `auditedAtCommit` provenance; every changed surface must be audited at the current successful checkpoint, while older evidence may be reused only for surfaces omitted from the changed-surface set after the full delta confirms behavior unchanged. Legacy manifests without provenance are not reusable.
2. Confirm P0 findings in `audit.md` were fixed (disposition `fixed <commit>`).
3. Confirm every P1/P2 finding has a fixed-or-filed disposition (`fixed <commit>` or `filed REP-xxx`).
4. Cite `audit.md` findings as review input for the UI verdict.

If no verdict is recorded, use a valid successful audit checkpoint from the preserved manifest as the classification base; otherwise use `origin/main`. Run `pnpm run ui:classify --base <classification-base>` and inspect the full delta for indirect UI effects — ad-hoc `/review` runs have no delivery status table to read from.

If the PR touches only non-UI code (migrations, API routes, utilities, or skill files — classifier verdict `uiTouching: false`, from the delivery status table or the fallback classification above, not reviewer judgment), skip this gate.
