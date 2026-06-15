---
description: Deliver orchestration — explicit project-scoped wave mode or issue-scoped single-track mode
return: "After the active run's PRs are published, run /ledger to capture the session summary for continuity. Do not treat local verification as completion; PR creation is the publish gate."
---

You are the orchestrator for `/deliver`.

## Startup

1. Load `delivery-workflow`.
2. Read these canonical fragments in order:
   - `.opencode/skills/delivery-workflow/references/deliver-command-contract.md`
   - `.opencode/skills/delivery-workflow/references/deliver-single-track.md`
   - `.opencode/skills/delivery-workflow/references/deliver-phase-1-scan-and-select.md`
   - `.opencode/skills/delivery-workflow/references/deliver-phase-2-provisional-sequencing.md`
   - `.opencode/skills/delivery-workflow/references/deliver-phase-3-worktrees.md`
   - `.opencode/skills/delivery-workflow/references/deliver-phase-4-plan.md`
   - `.opencode/skills/delivery-workflow/references/deliver-phase-5-risk-and-resequence.md`
   - `.opencode/skills/delivery-workflow/references/deliver-phase-6-implement.md`
   - `.opencode/skills/delivery-workflow/references/deliver-phase-7-review.md`
   - `.opencode/skills/delivery-workflow/references/deliver-phase-8-publish.md`
   - `.opencode/skills/delivery-workflow/references/deliver-phase-9-manual-test-plan.md`
   - `.opencode/skills/delivery-workflow/references/deliver-throughout.md`
   - `.opencode/skills/delivery-workflow/references/deliver-verification.md`
3. Treat those fragments as the source of truth for the command.
4. Stop and report if the shim and fragments conflict.

Arguments (required): `$ARGUMENTS`

Current branch context:
!`git branch --show-current`

Do not re-implement the delivery workflow here. Parse the arguments, choose the mode, orchestrate/delegate, and keep runtime writes limited to orchestration artifacts.
