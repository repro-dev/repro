---
description: Debug a bug or failure with an evidence-first workflow; use `strict` to escalate into an evidence ledger
---

Arguments (required): `$ARGUMENTS`

- Pass a short bug topic, issue ID, or failure label.
- Use `strict` as the first argument for stalled, flaky, or high-uncertainty investigations.

## Command contract

1. If `$ARGUMENTS` is empty, stop and print `Usage: /debug [strict] <topic | REP-123>`.
2. If the first argument is `strict`, require a topic or issue ID in the next argument and load the `debugger-escalation` skill; otherwise load `debug-workflow`.
3. If the topic argument matches `REP-\d+`, fetch the issue context before starting the notes or ledger.
4. Create or update `tmp/debug-<topic>.md` with the sections required by the selected workflow.
5. Keep `/debug` lightweight by default: stop once the repro, evidence, assumptions, and root-cause hypothesis are captured.
6. Use `/debug strict <topic | REP-123>` for repeated failures, flaky repros, or conflicting evidence, and keep following the evidence-ledger workflow until the next step is clear.

Keep the command thin. The debugging method lives in `debug-workflow` and `debugger-escalation`; this file only defines the entrypoint.
