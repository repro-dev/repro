---
description: Debug a bug or failure with the unified bugfix workflow — evidence-first diagnosis, structured escalation, and root-cause-first fix discipline
---

Arguments (required): `$ARGUMENTS`

- Pass a short bug topic, issue ID, or failure label.

## Command contract

1. If `$ARGUMENTS` is empty, stop and print `Usage: /bugfix <topic | REP-123>`.
2. Load `bugfix`.
3. If the topic argument matches `REP-\d+`, fetch the issue context before starting the notes.
4. Create or update `tmp/bugfix-<topic>.md` with the sections required by the workflow.
5. Keep `/bugfix` lightweight by default: stop once the root cause is stated and a failing regression test exists.
6. If the investigation stalls, loops, or produces conflicting evidence, keep the same notes file and follow the escalation ledger pattern within the same `bugfix` skill.

Keep the command thin. The debugging method lives in the `bugfix` skill; this file only defines the entrypoint.
