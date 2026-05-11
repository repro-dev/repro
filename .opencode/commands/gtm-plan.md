---
description: Shape a launch goal, audience, and timeframe into a durable GTM strategy plan
---

Arguments (required): `$ARGUMENTS`

- Pass a launch goal, GTM topic, or Linear issue ID.

## Command contract

1. If `$ARGUMENTS` is empty or whitespace, stop and print `Usage: /gtm-plan <launch goal | topic | REP-123>`.
2. Load the `gtm-strategy-workflow` skill.
3. Start from the supplied launch goal or issue context. If the argument matches `REP-\d+`, fetch the issue with the repo-owned `linear` CLI before drafting the plan.
4. Create or update `tmp/gtm-plan-<topic>.md` using the skill-defined plan artifact shape.
5. Keep the workflow strategic: produce a reviewable plan and optional follow-on issue proposals, but do not create issues or execution assets without explicit approval.

Keep the command thin. The GTM planning method lives in `gtm-strategy-workflow`; this file only defines the entrypoint.
