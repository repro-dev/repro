---
name: bug-rigor
description: Root-cause-first workflow for genuine bug investigation and fixes — load when the work is a real defect, regression, data issue, or flaky behavior that needs reproduction, root cause, and the smallest safe fix.
---

# Bug Rigor Workflow

Use this skill for **genuine bug work only**. It is intentionally heavier than generic implementation guidance, but it should not be loaded for feature work, cleanup, or speculative refactors.

## Load when

- the issue is labeled **Bug**
- the user reports a regression, defect, crash, data corruption, or flaky behavior
- the fix requires proving a root cause before changing code

Do **not** load it just because a task is hard; if the work is not a bug, use `feature-dev` alone.

## Relationship to `feature-dev`

`feature-dev` still provides the worktree, phased delivery, generic red/green/refactor TDD, verification, and commit workflow.

`bug-rigor` adds the bug-specific diagnosis and safety checks that keep fixes from stopping at the symptom.

## Required bug workflow

1. **State the root cause** before coding.
   - Use the exact template:
     > The bug happens because **X**, triggered by **Y**.
   - If you cannot say this yet, keep investigating.

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

## Exit criteria

Do not declare the bug done until:

- the repro is understood and no longer reproduces
- the regression test fails before the fix and passes after it
- data-risk, observability, and blast-radius checks are explicitly reviewed
- post-deploy verification expectations are written down when relevant
