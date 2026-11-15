---
description: Quiz yourself on delivered changes — post-delivery active recall
---

Arguments (optional): `$ARGUMENTS`

- Pass an issue ID (`REP-NNN`) to quiz on a specific delivery.
- Pass a PR number (`#NNNN`) to quiz on someone else's PR.
- If omitted, the quiz detects the issue from the current branch name.

## Command contract

1. Load `quiz`.
2. If `$ARGUMENTS` is non-empty, classify the first token:
   - `REP-\d+` → pass as `issueId`.
   - `#\d+` → pass as `prNumber`.
   - Neither → print `Usage: /quiz [REP-NNN | #PR-number]` and stop.
3. Hand off execution to the quiz skill's full workflow.

Keep this command thin. The quiz method lives in `quiz`; this file only defines the single entrypoint.
