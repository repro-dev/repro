---
description: Capture upstream UI design intent in a durable context artifact before implementation
---

Arguments (required): `$ARGUMENTS`

- Pass a short UI topic or Linear issue ID.

## Command contract

1. If `$ARGUMENTS` is empty or whitespace, stop and print `Usage: /design-direction <topic | REP-123>`.
2. Load the `design-direction` skill. If the user is asking to preserve already settled UI direction across downstream work, stop and tell them to run `/design-handoff <topic | REP-123>` instead.
3. If the argument matches `REP-\d+`, fetch the issue context before writing notes so the preflight can reuse any already-specified direction.
4. Create or update `tmp/context-<topic>.md` or `tmp/context-<issue-id>.md` with the skill-defined `## Design Direction` artifact shape for the bounded pre-implementation intake.
5. Keep the command thin: it only points to the skill-defined bounded preflight, records already supplied direction instead of re-asking it, and writes the durable context artifact.

Keep the command thin. The direction-capture workflow lives in `design-direction`; this file only defines the entrypoint.
