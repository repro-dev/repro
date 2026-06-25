---
description: Groom Linear backlog interactively — per-project Todo/Backlog scan, or full-workspace status-by-status sweep with closure authority
---

Arguments: `$ARGUMENTS`

## Mode selection

1. If `$ARGUMENTS` is `--full`: run **full-sweep mode** — all projects, all statuses, systematic sweep with closure authority.
2. Otherwise: treat `$ARGUMENTS` as a **project name** for per-project Todo/Backlog grooming.
3. There is no `--apply` flag. The workflow is always conversational — present proposals, get approval, then apply.

If scope is missing, ambiguous, or contains unrecognized flags, stop with a usage error:
```
Usage:
  /groom <project>      Per-project Todo/Backlog scan (conversational)
  /groom --full         Full workspace sweep — all projects, all statuses (conversational)
```

## Dispatch

1. Load `linear-cli` and the `backlog-grooming` skill.
2. Follow the skill's conversational workflow for the selected mode.
3. Never apply mutations without explicit user approval. Present proposals grouped by phase or category, ask for confirmation, apply only what the user approves, and verify each write.
