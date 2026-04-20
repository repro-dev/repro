---
description: Debug a bug or failure with an evidence-first workflow and a small `tmp/` artifact
---

Arguments (required): `$ARGUMENTS`

- Pass a short bug topic, issue ID, or failure label.

## Command contract

1. If `$ARGUMENTS` is empty, stop and print `Usage: /debug <topic | REP-123>`.
2. Load the `debug-workflow` skill.
3. If the argument matches `REP-\d+`, fetch the issue context before starting the debug notes.
4. Create or update `tmp/debug-<topic>.md` with the sections required by `debug-workflow`.
5. Stop once the repro, evidence, assumptions, and root-cause hypothesis are captured.

Keep the command thin. The debugging method lives in `debug-workflow`; this file only defines the entrypoint.
