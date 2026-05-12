---
description: Synthesize raw customer feedback into a durable brief for roadmap and issue shaping
---

Arguments (required): `$ARGUMENTS`

- Pass a topic plus one or more feedback sources, excerpts, or corpus references.

## Command contract

1. If `$ARGUMENTS` is empty or whitespace, stop and print `Usage: /feedback <topic + feedback sources>`.
2. Loads the `feedback-synthesis-workflow` skill.
3. Treat the provided input as raw customer-feedback intake, not as shaped issue scope.
4. Produce the synthesis brief and recommendations, then stop; do not create Linear issues directly.
5. If the input is already a shaped issue brief, redirect the user to `/plan` or `/deliver` instead of duplicating work.

Keep this a thin command shim. The workflow owns clustering, evidence handling, and brief structure.
