---
name: debugger-escalation
description: Strict debugger escalation workflow with a durable evidence ledger for repeated failures, flaky repros, conflicting evidence, and stalled root-cause work.
---

# Debugger Escalation

Use this skill when normal debugging is no longer converging and the investigation needs a stricter evidence ledger.

## When to use

- repeated failed fixes or looping hypotheses
- no stable repro after initial debugging
- flaky or non-deterministic behavior
- conflicting evidence or multiple plausible causes
- high-blast-radius production, data, or regression issues
- you cannot state the root cause confidently enough for `bug-rigor`

## When not to use

- simple failures with an obvious repro and root cause
- first-pass `/debug` investigations
- routine implementation or refactor work

## Required artifact

Write the investigation to `tmp/debug-<topic>.md` and keep it durable across turns.

## Ledger template

```md
# Debug Ledger — <topic>

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

- <bug-rigor implementation step or explicit escalation>
```

## Evidence rules

- Every claim should point to code references, logs, command output, docs, or recorded repro evidence.
- Record failed hypotheses as negative evidence instead of dropping them.
- Do not let speculation drive a fix unless an experiment supports it.

## Workflow

1. Capture the observed failure and smallest reliable repro.
2. Separate confirmed facts from assumptions.
3. Build and test hypotheses one at a time.
4. Update the ledger after each experiment.
5. If the investigation still does not converge, keep the same `tmp/debug-<topic>.md` file and continue here instead of starting over.
6. Once the root cause can be stated as `The bug happens because X, triggered by Y`, hand off to `bug-rigor` or escalate explicitly.

## Exit criteria

- the repro is stable enough to trust
- the evidence supports the current root-cause candidate
- assumptions have been reduced to a small, explicit set
- the next step is either `bug-rigor` implementation or user escalation
