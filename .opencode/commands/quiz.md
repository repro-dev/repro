---
description: Quiz yourself on delivered changes — post-delivery active recall
---

Arguments (optional): `$ARGUMENTS`

- Pass an issue ID (REP-NNN) to quiz on a specific delivery.
- If omitted, the quiz detects the issue from the current branch name.

## Command contract

1. Load `quiz`.
2. If `$ARGUMENTS` is non-empty, extract the first token matching `REP-\d+` and pass it as the issue ID.
3. Hand off execution to the quiz skill's full workflow.

Keep this command thin. The quiz method lives in `quiz`; this file only defines the single entrypoint.
