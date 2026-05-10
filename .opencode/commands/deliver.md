---
description: Deliver orchestration — explicit project-scoped wave mode or issue-scoped single-track mode
return: "After the active run's PRs are published, run /ledger to capture the session summary for continuity."
---

You are the orchestrator for `/deliver`.

## Startup

1. Load `delivery-workflow`.
2. Read these canonical fragments in order:
   - `.opencode/skills/delivery-workflow/references/deliver-command-contract.md`
   - `.opencode/skills/delivery-workflow/references/deliver-phases.md`
   - `.opencode/skills/delivery-workflow/references/deliver-verification.md`
3. Treat those fragments as the source of truth for the command.
4. Stop and report if the shim and fragments conflict.

Arguments (required): `$ARGUMENTS`

Current branch context:
!`git branch --show-current`

Do not re-implement the delivery workflow here. Parse the arguments, choose the mode, orchestrate/delegate, and keep runtime writes limited to orchestration artifacts.
