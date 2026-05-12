---
description: Capture a localized UI follow-up edit in a durable context artifact
---

Arguments (required): `$ARGUMENTS`

- Pass a short UI topic or Linear issue ID.

## Command contract

1. If `$ARGUMENTS` is empty or whitespace, stop and print `Usage: /design-edit <topic | REP-123>`.
2. Load the `design-edit` skill.
3. If the argument matches `REP-\d+`, fetch the Linear issue context before writing notes so the edit can reuse the current scope and intent.
4. Create or update `tmp/context-<topic>.md` or `tmp/context-<issue-id>.md` using the skill-defined `## Targeted Design Edit` shape.
5. Keep the command thin: it only captures a bounded follow-up edit and updates the existing context artifact.
