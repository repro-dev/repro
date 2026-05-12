---
description: Shape a high-level goal into a curated Linear issue set with interactive refinement
---

Arguments (required): `$ARGUMENTS`

- Pass a goal, initiative statement, or planning prompt.
- Redirect raw customer-feedback intake to /feedback instead of planning issues directly.

## Command contract

1. If `$ARGUMENTS` is empty or whitespace, stop and print `Usage: /plan <goal | initiative statement>`.
2. Load the `issue-shaping-workflow` skill.
3. Start from the supplied goal, not an existing issue ID.
4. Keep the workflow interactive: gather context, ask refinement questions, and, for UI-heavy or ambiguous work, capture visual direction through the backing workflow before presenting a proposal.
5. Stop once the proposal is reviewed or the approved issue set has been written to Linear.

Keep the command thin. The planning method lives in `issue-shaping-workflow`; this file only defines the entrypoint.
