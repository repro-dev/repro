---
description: Groom Linear backlog/Todo queues within an explicit scope, classify readiness, and optionally apply conservative mutations with verification
---

Arguments: `$ARGUMENTS`

1. Parse exactly one explicit scope selector first: a project name or a filter selector.
2. Accept `--apply` as the only mutation switch.
3. If scope is missing, ambiguous, or combined with extra unrecognized flags, stop with a clear usage error instead of scanning broadly.
4. Load `linear-cli` and the `backlog-grooming` skill.
5. Hand off the bounded queue scan, readiness classification, and write-back flow to the skill.
6. In dry-run mode, show proposed actions first. In apply mode, include a compact post-write verification summary.
