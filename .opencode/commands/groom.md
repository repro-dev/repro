---
description: Groom Linear backlog/Todo queues — classify readiness, propose conservative mutations, and optionally apply them with verification
---

Arguments: `$ARGUMENTS`

- Parse a bounded scope first: support a project/filter selector plus an optional `--apply` flag.
- Validate that scope is explicit and that `--apply` is the only mutation switch.
- If the scope is missing or ambiguous, stop with a clear usage error instead of scanning broadly.
- Load `linear-cli` and the `backlog-grooming` skill.
- Hand off the actual queue scan, readiness classification, and write-back flow to the skill.
- In the final output, show the proposed actions first in dry-run mode; in apply mode, include a compact post-write verification summary.
