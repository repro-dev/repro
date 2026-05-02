---
description: Capture upstream UI design intent in a durable context artifact before implementation
---

Arguments (required): `$ARGUMENTS`

- Pass a short UI topic or Linear issue ID.

## Command contract

1. If `$ARGUMENTS` is empty or whitespace, stop and print `Usage: /design-direction <topic | REP-123>`.
2. Load the `design-direction` skill.
3. If the argument matches `REP-\d+`, fetch the issue context before writing notes.
4. Create or update `tmp/context-<topic>.md` or `tmp/context-<issue-id>.md` with the skill-defined `## Design Direction` artifact shape. Add `## Design Handoff Context` only when the direction is already settled and must survive downstream work unchanged.
5. Stop once the design-direction context is captured and ready for downstream handoff.

Keep the command thin. The direction-capture workflow lives in `design-direction`; this file only defines the entrypoint.
