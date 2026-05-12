## Phase 3: Create worktrees for the active ready wave

Each `reproctl wt create --from-issue` creates a fresh worktree for the issue branch. It does not currently detect whether that branch already has a local worktree (see REP-893); concurrent sessions may create duplicate worktrees for the same branch without an explicit error.

No prune step is needed before creating worktrees. Do not delete another session's worktrees.

For each issue in the active ready wave, create its worktree **sequentially**:

```sh
reproctl wt create --from-issue REP-xxx
```

Wait for each command to finish before starting the next one.

Once a worktree exists for an issue, treat that worktree root as the home for all issue-scoped `tmp/` artifacts (`tmp/context-*`, `tmp/test-plan-*`, and `tmp/plan-*`). Do not create those artifacts from the main checkout.

### Worktree creation retry policy

- **Retryable**: git lock contention, transient network failures, other one-off non-zero exits
- **Do not retry**: branch already exists remotely, permission/auth failures, repository not found, or obviously inconsistent partial worktree state

Retry up to **3 times** after the initial failure with delays of **5s**, **15s**, and **45s**.

### Phase-local failure handling

If worktree creation still fails for an issue:

- Report the issue ID and the error clearly
- If a partial worktree exists, remove it
- Exclude that issue from the current run
- Add the issue ID to `escalated_issues`

Do not stop the whole run unless every issue in the active ready wave fails here.

---
