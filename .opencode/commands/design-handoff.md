---
description: Capture a settled UI handoff in a durable context artifact
---

Arguments (required): `$ARGUMENTS`

- Pass a short UI topic or Linear issue ID.

## Command contract

1. If `$ARGUMENTS` is empty or whitespace, stop and print `Usage: /design-handoff <topic | REP-123>`.
2. Load the `design-handoff` skill.
3. If the argument matches `REP-\d+`, fetch the Linear issue context before writing notes.
4. Create or update `tmp/context-<topic>.md` or `tmp/context-<issue-id>.md` using the skill-defined `## Design Handoff Context` shape.
5. Stop once the settled handoff is captured.

Keep the command thin. The preservation workflow lives in `design-handoff`; this file only defines the entrypoint.
