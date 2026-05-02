---
description: Debug a bug or failure with an evidence-first workflow; escalate within the same `/debug` flow when needed
---

Arguments (required): `$ARGUMENTS`

- Pass a short bug topic, issue ID, or failure label.

## Command contract

1. If `$ARGUMENTS` is empty, stop and print `Usage: /debug <topic | REP-123>`.
2. Load `debug-workflow`.
3. If the topic argument matches `REP-\d+`, fetch the issue context before starting the notes or ledger.
4. Create or update `tmp/debug-<topic>.md` with the sections required by the workflow.
5. Keep `/debug` lightweight by default: stop once the repro, evidence, assumptions, and root-cause hypothesis are captured.
6. If the investigation stalls, loops, or produces conflicting evidence, keep the same notes file and continue the `/debug` flow by loading `debugger-escalation` internally.

Keep the command thin. The debugging method lives in `debug-workflow` and `debugger-escalation`; this file only defines the single entrypoint.
