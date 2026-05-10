## Phase 6: Implement in bounded batches

Launch `develop` subagents for every issue still in the current ready wave in batches of up to `--wave-concurrency` within the current phase. In single-track mode, this phase runs once for the singleton ready wave.

Do not launch `develop` until the issue has a completed planner result plus the required context and test-plan artifacts for its scope. If the issue is UI-bearing and the work is a bounded follow-up edit, the context artifact must already carry the `## Targeted Design Edit` block from `.opencode/skills/design-edit/SKILL.md`; if the issue is UI-bearing with unresolved visual direction, it must carry the `## Design Direction` block from `.opencode/skills/design-direction/SKILL.md`; if settled UI decisions must not be reinterpreted, it must also carry `## Design Handoff Context`. If a required artifact is missing, create it and retry the launch instead of improvising the implementation path.

For this phase:

1. Partition the ready-wave issues into sequential batches of at most `--wave-concurrency` issues.
2. Launch each batch in parallel.
3. Wait for the full batch to finish before launching the next batch.
4. Do not stop mid-batch. If a develop launch is throttled, use the shared subagent launch retry policy and keep the batch visible in status output.
5. Make publishability and stop/continue decisions only at the normal phase or wave boundaries.
6. If an issue is UI-bearing, make sure the develop prompt explicitly asks for an `audit-ui-quality` self-critique before handoff and for a separate authored-polish judgment, plus browser evidence paths, viewport/state/interaction notes, and artifact-lint status in the final summary. For bounded follow-up edits, the prompt must also preserve the `## Targeted Design Edit` scope boundary and verification evidence expectations.

### Smoke tests after each batch

After each batch of `develop` agents finishes, run existing tests for each issue that succeeded in that batch. This step is informational only — test failures do not halt the pipeline.

For each issue whose develop run succeeded in this batch:

1. Determine affected packages from the worktree diff:

   ```sh
   git -C <worktree-path> diff main...HEAD --name-only
   ```

   Extract the first path segment from every line that starts with `apps/` or `packages/` (e.g. `packages/agentic/src/foo.ts` → `agentic`). Deduplicate. Skip all other paths (e.g. `.opencode/`, root config files).

2. For each affected package `<name>`, run:

   ```sh
   pnpm --filter @repro/<name> test
   ```

   If pnpm exits because the package has no `test` script (error output contains "missing script: test"), skip that package — this is not a test failure.

3. **If all tests pass** (or no testable packages were touched): record `smoke_test_result: pass` for this issue. Do not alter the Phase 7 review prompt.

4. **If one or more tests fail**: record `smoke_test_result: fail` for this issue with a structured failure summary:
   - Package name (`@repro/<name>`)
   - Failing test file(s)
   - Condensed error output (first ~10 lines per failing file)

Store the per-issue smoke test result in memory for use in the Phase 7 review prompt.

If a develop launch still fails after exhausting the shared retry policy:

- Report the issue ID and launch failure clearly
- Set the issue state back to **Todo** with `linear issue update <issue-id> --status "Todo" --json`
- Remove the worktree
- Add the issue ID to `escalated_issues`
- Exclude the issue from the publishable set

### Worktree existence guard

Before launching each `develop` subagent, verify the worktree path exists and the branch is correct:

```sh
if [ ! -d "<worktree-path>" ]; then
  echo "ERROR: worktree missing for REP-xxx at <worktree-path>"
  echo "Escalating: set issue to Todo, add to escalated_issues"
fi
branch=$(git -C "<worktree-path>" branch --show-current 2>/dev/null)
if [ -z "$branch" ] || ! echo "$branch" | grep -qE "^gary/rep-[0-9]+-"; then
  echo "ERROR: worktree branch mismatch for REP-xxx (expected gary/rep-<number>-..., got '$branch')"
  echo "Escalating: set issue to Todo, add to escalated_issues"
fi
```

If the guard fails: set the issue state back to **Todo**, add the issue ID to `escalated_issues`, report the error clearly, and do NOT proceed with implementation on `main` or any other branch.

Prompt template per issue:

```
Implement the plan at <worktree>/tmp/plan-REP-xxx.md for Linear issue REP-xxx in worktree <absolute-worktree-path>.

Worktree: <absolute-worktree-path>
Issue: REP-xxx
Plan: <worktree>/tmp/plan-REP-xxx.md

Read the plan first and follow it. The plan file is authoritative.
Do not re-explore the codebase from scratch unless the plan clearly points you there.
Do not push or create a PR.
Read the plan, the current context artifact, and the test plan before coding. For UI-bearing issues, a `## Targeted Design Edit` block is authoritative for localized follow-up scope, a `## Design Direction` block is authoritative upstream intent unless the plan calls out a strategic mismatch, and any `## Design Handoff Context` block must be preserved for settled decisions that must not drift.
For UI-bearing issues, run `audit-ui-quality` on the implementation before returning and keep authored polish separate from design-system compliance; if the audit finds low-polish output, return concrete fixes rather than a ship-as-is handoff. When a `## Targeted Design Edit` block is present, the final handoff must tie back to its scope boundary and verification evidence expectations. The final handoff must include browser evidence paths, the viewport/state/interaction notes, artifact-lint status, and a ship-readiness summary tied back to the consumed context artifact.

Tactical implementation-level deviations are allowed if they still satisfy the plan and issue.
If you discover a strategic mismatch that invalidates the plan, stop and report it instead of improvising a larger redesign.

Write temporary output only under <absolute-worktree-path>/tmp/.

Friction logging: if you encounter friction during implementation (unclear patterns, missing documentation, ambiguous conventions, surprising codebase state), append an entry to `<absolute-worktree-path>/tmp/friction.md` in this format:
  [Brief description]
  - Phase: implementation
  - Root cause: <one of: missing-docs, unclear-pattern, tooling-gap, stale-code>
Do not stop or change your approach — log and continue.

Return the REP-1081 proof bundle first. Required fields: browser evidence paths, viewport/state/interaction notes, artifact-lint status, authored-critique result, and context-linked ship-readiness. The response may also include a short implementation summary.
```

### Phase-local implementation failure handling

If a `develop` run reports an unresolved build failure, typecheck failure, or strategic planning mismatch:

- Post a concise Linear comment with the blocking reason using `linear issue comment <issue-id> "<blocking reason>" --json`
- Set the issue state back to **Todo** with `linear issue update <issue-id> --status "Todo" --json`
- Remove the worktree
- Add the issue ID to `escalated_issues`
- Exclude the issue from the publishable set

---
