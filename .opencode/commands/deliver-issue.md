---
description: Single-track delivery — deliver one issue in the current worktree, no branch isolation
return: "After the PR is published, run /ledger to capture the session summary for continuity. Do not treat local verification as completion; PR creation is the publish gate."
---

You are the orchestrator for `/deliver-issue`.

## Startup

1. Load `delivery-workflow`.
2. Read these canonical fragments in order:
   - `.opencode/skills/delivery-workflow/references/deliver-command-contract.md`
   - `.opencode/skills/delivery-workflow/references/deliver-single-track.md`
   - `.opencode/skills/delivery-workflow/references/deliver-phase-4-plan.md`
   - `.opencode/skills/delivery-workflow/references/deliver-phase-5-risk-and-resequence.md`
   - `.opencode/skills/delivery-workflow/references/deliver-phase-6-implement.md`
   - `.opencode/skills/delivery-workflow/references/deliver-phase-7-review.md`
   - `.opencode/skills/delivery-workflow/references/deliver-phase-8-publish.md`
   - `.opencode/skills/delivery-workflow/references/deliver-throughout.md`
   - `.opencode/skills/delivery-workflow/references/deliver-verification.md`
3. Treat those fragments as the source of truth for the command.
4. Stop and report if the shim and fragments conflict.

Arguments (required): a single Linear issue ID (`REP-<number>`) with no flags.

## Pre-flight checks

1. Parse `$ARGUMENTS` as a single issue ID matching `REP-\d+`. Reject any other input with a clear validation error.

2. Run `git branch --show-current`. If the current branch is `main`, ask:

   > "You are on the main checkout. /deliver-issue operates in the same worktree and will commit directly here. Continue? (yes/no)"

   Exit cleanly if the user says no.

3. Run `git status --porcelain`. If there are uncommitted changes, list them and ask:

   > "The current worktree has uncommitted changes shown above. /deliver-issue will stage and commit them as part of delivery. Continue? (yes/no)"

   Exit cleanly if the user says no.

4. Set `target_issue_id` from step 1.

5. Set `worktree_path` to the current working directory. Run `git branch --show-current` and store the result as the worktree branch.

## Mode: single-track, same-worktree

This command runs in **single-track mode, same-worktree**. It delivers exactly one issue.

### Phase skips

- **Skip Phase 1** (backlog scan and select) entirely.
- **Skip Phase 2** (provisional sequencing) entirely.
- **Skip Phase 3** (worktree creation) entirely — the current directory IS the worktree.

### Fragment overrides

When reading the canonical fragments, apply these overrides:

#### `deliver-single-track.md`

Follow the single-track preamble (steps 1–9) with these modifications:

- Step 1 (in-flight state): run `gh pr list --state open --limit 1000 --json number,headRefName,title`. Skip `reproctl wt list --json`. Treat the current worktree as the relevant active worktree.
- Step 6 (stop conditions): skip the "active worktree" and "open PR branch name" checks. The current worktree *is* the delivery worktree. The current branch *will* be the PR branch.
- Step 9: create a singleton `current_ready_wave` containing only `target_issue_id` and continue to Phase 4.

#### All subsequent phases (`deliver-phase-{4,5,6,7,8}.md`)

- Every reference to "worktree root" or "`<absolute-worktree-path>`" means the current working directory.
- Every `tmp/` artifact write goes under `./tmp/` in the current directory.
- Every `git -C <worktree-path>` command runs without `-C` (in the current directory).
- Every worktree-path-dependent step uses the current directory.

#### `deliver-phase-8-publish.md`

- The pre-push `origin/main` guard runs in the current directory (`git fetch origin main` and `git merge-base --is-ancestor origin/main HEAD` without `-C`).

### Failure handling overrides

When a fragment says:

> "Set the issue state back to **Todo** and remove the worktree"

Instead: set the issue state back to **Todo** and stop. Do **not** remove the worktree — it was not created by this command and may contain other work.

When a fragment references `reproctl wt create` or `reproctl wt list`:

Skip it. The worktree already exists and was not created by this command.

### Differences from `/deliver --issue REP-xxx`

| Behaviour                   | `/deliver-issue`                          | `/deliver --issue REP-xxx`               |
| --------------------------- | ----------------------------------------- | ---------------------------------------- |
| Argument format             | `REP-123` (bare ID)                       | `--issue REP-123` (flagged)              |
| Worktree                    | Current directory                         | New isolated worktree                    |
| Branch                      | Current branch                            | Auto-generated branch (`gary/rep-...`)   |
| Phase 3 (worktrees)         | Skipped                                   | Creates worktree via `reproctl wt`       |
| Failure cleanup             | Set issue to Todo, keep worktree          | Set issue to Todo, remove worktree       |
| Main/dirty guard            | Interactive prompt                        | N/A (always creates clean worktree)      |
| `reproctl wt list` checks   | Skipped                                   | Run for exclusion                        |

Do not re-implement the delivery workflow here. After the pre-flight checks, hand off to the delivery-workflow fragments for the plan → implement → review → publish pipeline, applying the overrides above at each phase boundary.
