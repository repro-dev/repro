---
description: Shape a high-level goal into a curated Linear issue set with interactive refinement
---

Arguments (required): `$ARGUMENTS`

- Pass a goal, initiative statement, or planning prompt.

## Command contract

1. If `$ARGUMENTS` is empty or whitespace, stop and print `Usage: /plan <goal | initiative statement>`.
2. Load the `issue-shaping-workflow` skill.
3. Start from the supplied goal, not an existing issue ID.
4. Keep the workflow interactive: gather context, ask refinement questions, present a proposal, and create Linear issues only after explicit approval.
5. Stop once the proposal is reviewed or the approved issue set has been written to Linear.

Keep the command thin. The planning method lives in `issue-shaping-workflow`; this file only defines the entrypoint.
