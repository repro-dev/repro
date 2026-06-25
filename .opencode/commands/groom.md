---
description: Groom Linear backlog — per-project Todo/Backlog scan, or full-workspace status-by-status sweep with closure authority
---

Arguments: `$ARGUMENTS`

## Mode selection

1. If `$ARGUMENTS` is `--full` or starts with `--full`: run **full-sweep mode** — all projects, all statuses, systematic sweep with closure authority.
2. If `$ARGUMENTS` contains only `--apply` or `--full --apply`: same as above, mutations applied.
3. Otherwise: treat `$ARGUMENTS` as a **project name** for per-project Todo/Backlog grooming.
4. `--apply` may be appended in either mode to execute mutations (dry-run is the default).

If scope is missing, ambiguous, or combined with extra unrecognized flags, stop with a clear usage error:
```
Usage:
  /groom <project> [--apply]     Per-project Todo/Backlog scan
  /groom --full [--apply]        Full workspace sweep (all projects, all statuses)
```

## Dispatch

1. Load `linear-cli` and the `backlog-grooming` skill.
2. In per-project mode: follow the skill's "Per-project mode" section — bounded queue scan, readiness classification, and write-back.
3. In full-sweep mode: follow the skill's "Full-sweep mode" section — paginated inventory, six-phase status-by-status audit, and closure execution.
4. In dry-run mode (default), show proposed actions first. In apply mode, include a compact post-write verification summary.
