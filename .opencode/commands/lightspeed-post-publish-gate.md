---
description: Observe only the PRs blocking the immediate next queued /lightspeed wave and report when the narrow continuation seam is safe to invoke
---

Monitor the immediate next queued wave recorded in a `/lightspeed` post-publish handoff artifact. This command is intentionally narrow: it observes only the PRs that block that one next wave, never mutates GitHub or git state, never directly launches `/lightspeed`, and never becomes a persistent control plane.

Arguments (required): `$ARGUMENTS` must be an absolute path to a `/lightspeed` post-publish handoff artifact under the current checkout's `tmp/` directory.

---

## Hard boundaries

- Observe only. Use `gh pr view` and `gh pr checks` style reads.
- Watch only the PRs listed in the handoff artifact's `blockingPrs` array.
- Scope is exactly one immediate next queued wave.
- Never call any mutating command from this monitor, including:
  - `gh pr merge`
  - `gh run rerun`
  - `git rebase`
  - `git push`
  - manual `Linear_save_issue(... state: "Done" ...)`
- If the monitor cannot prove it is safe to auto-continue, it must notify and stop.

---

## Step 1: Load and validate the handoff artifact

1. Read the JSON artifact at `$ARGUMENTS`.
2. Confirm the path is absolute and lives under `<current-checkout>/tmp/`.
3. Confirm the artifact contains:
   - `schemaVersion`
   - `nextQueuedWave.waveIndex`
   - `nextQueuedWave.issueIds`
   - `blockingPrs[]`
   - `gate.continueCommand`
4. If validation fails, stop and explain what is missing. Do not guess.

---

## Step 2: Re-observe the blocking PR set only

For each entry in `blockingPrs`:

1. Run `gh pr view <number> --json state,isDraft,mergeStateStatus,mergedAt,url,headRefName`.
2. Run `gh pr checks <number>` to observe CI state.
3. Update an in-memory status table for this command run only.

Treat a PR as still blocking unless it is clearly merged.

Blocking conditions include:

- PR state is open
- PR is draft
- `mergedAt` is empty
- `mergeStateStatus` indicates conflicts or other unmerged state
- `gh pr view` / `gh pr checks` cannot be read reliably

If any listed PR is still blocking, print a concise summary and stop.

Example summary:

```
Immediate next wave: Wave 2 (REP-901, REP-902)

Still blocked by:
- PR #123 for REP-900 — OPEN, checks pending
- PR #124 for REP-899 — OPEN, mergeStateStatus=DIRTY

Do not continue /lightspeed yet.
Re-run /lightspeed-post-publish-gate <absolute-handoff-path> after the blockers are merged.
```

---

## Step 3: Decide between notify-only and continuation

If all listed blocking PRs are merged, the next wave is eligible to start — but continuation remains conservative.

### Preferred background host: `opencode-pty`

If `opencode-pty` is installed and the operator explicitly chooses to use it, it is the preferred place to host this monitor because it can keep the observation loop out of the main interactive session.

Even there, this command remains observe-only and must not mutate GitHub, git, or Linear state. A background host may decide whether to invoke the artifact's `continueCommand`, but only after it applies its own reliable idle-safe heuristic and this command has already reported that all blockers are merged.

### Smallest viable fallback when `opencode-pty` is unavailable

This repository does **not** assume `opencode-pty` exists. If it is unavailable, or if idle detection cannot be made reliable, use **notify-only with explicit manual continuation**:

1. Print that the immediate next wave is now unblocked.
2. Print the exact continuation command from the artifact:

   ```
   /lightspeed --continue-from <absolute-handoff-path>
   ```

3. Stop without attempting any automatic continuation.

This fallback is acceptable and preferred over restoring a foreground poll loop or inventing a persistent coordinator.

---

## Step 4: Idle-aware auto-continuation is optional and must be conservative

There is no guaranteed current-session-id environment variable in this repo, and the installed `opencode` CLI only exposes `run`, `session list`, `export`, `serve`, and `attach`.

Therefore:

- Any idle-session heuristic must be treated as best-effort only.
- If the monitor cannot reliably determine that the user has **not** re-engaged the session, it must notify instead of auto-continuing.
- Notify-only is the default safe behavior.

If a future implementation uses `opencode session list` or other supported observation to infer idleness, it must still fail closed: uncertainty means **do not auto-continue**. This command should still report readiness first; any actual invocation of `/lightspeed --continue-from ...` belongs to the explicitly chosen host, not to the observe-only monitor itself.

---

## Step 5: Manual continuation seam

The continuation seam is intentionally narrow:

- `/lightspeed --continue-from <absolute-handoff-path>`

That continuation must:

1. Re-read the same handoff artifact.
2. Revalidate the listed `blockingPrs` with fresh `gh pr view` / `gh pr checks` observations.
3. Refuse to start the next wave unless all listed blocking PRs are merged.
4. Start only `nextQueuedWave.issueIds` from the artifact.

This keeps the gate auditable and makes silent bypass impossible: the named blocking PRs must be merged before the next wave starts.

---

## Output

Always print:

- the handoff file path
- the immediate next wave being evaluated
- the blocking PR status table
- one of:
  - `still blocked — no continuation`
  - `unblocked — notify with manual continuation command`
  - `unblocked — ready for an explicitly configured idle-safe background host to invoke the continuation command`

Do not write additional artifacts unless a future implementation needs to refresh the artifact's `latestObserved` snapshot in place. Even then, keep the file minimal and scoped to this one next wave only.
