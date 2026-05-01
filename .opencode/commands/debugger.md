---
description: Escalate a stalled debug investigation into a strict evidence-ledger workflow
---

Arguments (required): `$ARGUMENTS`

- Pass a short topic, issue ID, or failure label.

## Command contract

1. If `$ARGUMENTS` is empty, stop and print `Usage: /debugger <topic | REP-123>`.
2. Load the `debugger-escalation` skill.
3. If the argument matches `REP-\d+`, fetch the issue context before starting the ledger.
4. Create or update `tmp/debug-<topic>.md` with the `debugger-escalation` ledger template.
5. Keep the command thin and continue until the evidence-backed next step is clear.

Use this entrypoint when `/debug` has stalled, the repro is flaky, or the investigation needs a stricter evidence trail.
