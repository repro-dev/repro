---
name: debug-workflow
description: Evidence-first debugging workflow with explicit repro, assumptions, and verification artifacts. Load when diagnosing a bug before committing to a fix.
---

# Debug Workflow

Use this skill when the immediate task is diagnosis rather than implementation.

Write the working notes to `tmp/debug-<topic>.md` when the investigation is non-trivial.

## Required sequence

1. State the observed failure.
2. Capture the smallest reliable reproduction.
3. List current assumptions separately from confirmed facts.
4. Gather evidence before proposing a root cause.
5. State the root-cause hypothesis in one sentence.
6. Verify the hypothesis against the repro.
7. Only then move into `bug-rigor` or implementation work.

## Debug note format

```md
# Debug Notes — <topic>

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

## Rules

- Do not skip from symptom to fix.
- Treat logs, failing tests, and code references as evidence; intuition alone is not enough.
- When a hypothesis fails, record that negative result briefly and move on.
