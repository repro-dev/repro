---
name: bugfix
description: Full bug diagnosis and fix pipeline — evidence-first debugging, structured escalation for stalled investigations, and root-cause-first fix discipline. Load when debugging a bug or implementing a bug fix.
---

# Bugfix Workflow

Use this skill when the task is a genuine bug, defect, regression, data issue, or flaky behavior that requires diagnosis and a verifiable fix. It covers the full pipeline from first observation through root-cause confirmation to safe fix and verification.

Write working notes to `tmp/bugfix-<topic>.md` for non-trivial investigations.

## Overview

This skill combines three phases into one unified workflow:

1. **Part A** — Evidence-first debugging: observed failure, repro, assumptions vs facts, hypothesis
2. **Part B** — Escalation ledger: structured evidence tracking when the investigation stalls
3. **Part C** — Root-cause-first fix: state root cause, failing regression test, smallest fix, data damage review, observability, blast radius, verify

Start with Part A. If the investigation converges quickly, move directly to Part C. If it stalls or loops, escalate to Part B before continuing to Part C.

---

## Part A: Evidence-First Debugging

Use this when the immediate task is diagnosis rather than implementation.

### Required sequence

1. **State the observed failure** — describe what actually breaks.
2. **Capture the smallest reliable reproduction** — prefer an automated repro or a failing command over narrative memory.
3. **List current assumptions separately from confirmed facts** — challenge unverified beliefs.
4. **Gather evidence before proposing a root cause** — treat logs, failing tests, and code references as evidence; intuition alone is not enough.
5. **State the root-cause hypothesis** in one sentence.
6. **Verify the hypothesis against the repro**.
7. Only then move into implementation work (Part C).

### Rules

- Do not skip from symptom to fix.
- When a hypothesis fails, record that negative result briefly and move on.

---

## Part B: Escalation Ledger

Use this when the normal debugging flow is no longer converging and the investigation needs a stricter evidence ledger.

### When to use

- repeated failed fixes or looping hypotheses
- no stable repro after initial debugging
- flaky or non-deterministic behavior
- conflicting evidence or multiple plausible causes
- high-blast-radius production, data, or regression issues
- you cannot state the root cause confidently

### When not to use

- simple failures with an obvious repro and root cause
- first-pass investigations

### Required artifact

Write the investigation to `tmp/bugfix-<topic>.md` and keep it durable across turns.

### Ledger template

```md
# Bugfix Ledger — <topic>

## Observed Failure

- <what breaks>

## Reproduction

- <command, test, request, or interaction>

## Scope / Impact

- <users, systems, data, or blast radius>

## Evidence Index

- <links or pointers to logs, commands, code refs, captures>

## Confirmed Facts

- <facts backed by repro, logs, code, docs, or command output>

## Assumptions

- <unverified beliefs to challenge>

## Hypothesis Registry

| hypothesis        | prediction                   | experiment      | evidence           | result      | confidence     | status        |
| ----------------- | ---------------------------- | --------------- | ------------------ | ----------- | -------------- | ------------- |
| <candidate cause> | <what should happen if true> | <test or probe> | <what it produced> | <pass/fail> | <low/med/high> | <open/closed> |

## Experiment Log

| experiment | evidence        | result         | follow-up     |
| ---------- | --------------- | -------------- | ------------- |
| <probe>    | <output or ref> | <what changed> | <next action> |

## Confidence Model

- Verified fact: backed by repro, log, code, docs, or command output.
- Hypothesis: plausible explanation with pending or partial evidence.
- Speculation: unverified idea that must not drive a fix without an experiment.

## Current Root-Cause Candidate

- <best current explanation>

## Negative Results

- <failed hypotheses and what they ruled out>

## Decision Log

- <why the investigation changed direction>

## Conclusion / Next Step

- <root-cause statement or explicit escalation>
```

### Evidence rules

- Every claim should point to code references, logs, command output, docs, or recorded repro evidence.
- Record failed hypotheses as negative evidence instead of dropping them.
- Do not let speculation drive a fix unless an experiment supports it.

### Workflow

1. Capture the observed failure and smallest reliable repro.
2. Separate confirmed facts from assumptions.
3. Build and test hypotheses one at a time.
4. Update the ledger after each experiment.
5. If the investigation still does not converge, keep the same file and continue here instead of starting over.
6. Once the root cause can be stated, proceed to Part C.

---

## Part C: Root-Cause-First Fix Workflow

Use this for **genuine bug work only**. It is intentionally heavier than generic implementation guidance. Do not load for feature work, cleanup, or speculative refactors.

### Load when

- the issue is labeled **Bug**
- the user reports a regression, defect, crash, data corruption, or flaky behavior
- the fix requires proving a root cause before changing code

### Required bug workflow

1. **State the root cause** before coding.

   - Use the exact template:
     > The bug happens because **X**, triggered by **Y**.
   - If you cannot say this yet, keep investigating (go back to Part A or B).

2. **Reproduce before fixing.**

   - Capture the smallest reliable repro.
   - Prefer an automated repro or a failing command over narrative memory.

3. **Write a failing regression test first.**

   - Red should prove the bug exists.
   - If the bug is not directly testable, add the closest durable guard and explain the gap.

4. **Apply the smallest correct fix.**

   - Fix the cause, not just the visible symptom.
   - Avoid unrelated refactors until the regression is covered.

5. **Review data damage and persistence risk.**

   - Check whether bad state already exists in storage, caches, serialized payloads, queues, or external systems.
   - Call out any migration, backfill, cleanup, or compatibility follow-up.

6. **Review observability.**

   - Confirm the failure will be visible through logs, metrics, traces, alerts, or error surfaces.
   - Add or improve signals if the bug was previously silent.

7. **Review blast radius and sibling callsites.**

   - Inspect related callsites, shared helpers, and alternate paths that can trigger the same defect.
   - Confirm the fix covers the sibling paths or document why they are safe.

8. **Verify the fix end to end.**

   - Re-run the repro, the regression test, and the most relevant surrounding tests.
   - Note any manual or post-deploy verification that should happen after release.

---

## Notes/Debug Format

For lightweight bug investigations that don't need the full escalation ledger, use this concise format in `tmp/bugfix-<topic>.md`:

```md
# Bugfix Notes — <topic>

## Observed Failure

- <what breaks>

## Reproduction

- <command, test, request, or interaction>

## Confirmed Facts

- <facts backed by logs, code, or repro output>

## Assumptions

- <unverified beliefs to challenge>

## Hypotheses

- <candidate causes>

## Conclusion

- The bug happens because <x>, triggered by <y>.

## Next Step

- <test to write or file to change>
```

---

## Exit Criteria

Do not declare the bug done until ALL of these are satisfied:

- the repro is understood and no longer reproduces
- the regression test fails before the fix and passes after it
- the repro is stable enough to trust
- the evidence supports the current root-cause candidate
- assumptions have been reduced to a small, explicit set
- data-risk, observability, and blast-radius checks are explicitly reviewed
- post-deploy verification expectations are written down when relevant
- if the investigation escalated: the evidence index, hypothesis registry, and experiment log are complete, and the next step is clearly stated
