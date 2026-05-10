## Phase 4: Plan in bounded batches

Launch `planner` subagents for every issue that has a worktree in batches of up to `--wave-concurrency` within the current phase. In single-track mode, this phase runs once for the singleton ready wave.

Before launching planners in this phase, if an issue is UI-bearing with unresolved visual direction and its worktree-local `tmp/context-<issue-id>.md` does not yet contain the `## Design Direction` block from `.opencode/skills/design-direction/SKILL.md`, pause that issue, resolve design-direction first, and retry this phase after the context artifact is populated. If the issue is a bounded UI follow-up and the context artifact does not yet contain `## Targeted Design Edit` from `.opencode/skills/design-edit/SKILL.md`, pause that issue, resolve design-edit first, and retry this phase after the context artifact is populated. If settled UI decisions must not be reinterpreted, require the context artifact to carry `## Design Handoff Context` as well. Missing UI context here is recoverable: create the artifact, re-read `tmp/context-<issue-id>.md`, and retry planner launch before considering the issue not ready.

For this phase:

1. Partition the worktree-backed issues into sequential batches of at most `--wave-concurrency` issues.
2. Launch each batch in parallel.
3. Wait for the full batch to finish before launching the next batch.
4. Do not stop mid-batch. If a planner launch is throttled, use the shared subagent launch retry policy and keep the batch visible in status output.
5. Make any keep/prune/continue decisions only after normal phase or wave boundaries, not in the middle of a batch.

If a planner launch still fails after exhausting the shared retry policy:

- Report the issue ID and launch failure clearly
- Set the issue state back to **Todo** with `linear issue update <issue-id> --status "Todo" --json`
- Remove the worktree
- Add the issue ID to `escalated_issues`
- Exclude the issue from the current ready wave

### Inline skill matching (before each planner spawn)

Before composing the planner prompt for each issue, run the following matching
inline — do **not** spawn a subagent for this step.

**Scoped skill path-pattern index:**

| Skill file                                     | Path patterns                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.opencode/skills/agentic/SKILL.md`            | `packages/agentic`, `packages/agentic-ui`, `apps/capture` (Agentic.hoc.tsx), agentic routes or services in `apps/api-server`                                                                                        |
| `.opencode/skills/database/SKILL.md`           | `packages/data`, Kysely, migrations, schema changes, database queries                                                                                                                                               |
| `.opencode/skills/design-system/SKILL.md`      | `packages/design`, `@repro/design`, UI components, design tokens                                                                                                                                                    |
| `.opencode/skills/design-direction/SKILL.md`   | UI direction, visual direction, design intent, UI polish, redesign, ambiguous interface, net-new screen                                                                                                             |
| `.opencode/skills/recording-playback/SKILL.md` | `apps/capture`, `packages/recording`, `packages/playback`, `packages/recording-api`, `packages/buffer-utils`, `packages/vdom-renderer`, `packages/source-utils`, `packages/observer-utils`, `packages/wire-formats` |
| `.opencode/skills/build-and-test/SKILL.md`     | build system, moon, pnpm workspaces, CI, reproctl, tool version pinning                                                                                                                                             |

General-purpose skills (`delivery-workflow`, `worktree-workflow`, `implementation-rigor`, `git-workflow`, `harden`,
`create-issue`) are **never** injected — the planner loads them independently as needed.

**Matching steps:**

1. From the fetched issue title and description (available from Phase 1 in wave mode or the single-track preamble in single-track mode),
   extract: package names (`packages/<name>`, `apps/<name>`), any explicit file
   paths, and domain keywords (`migration`, `schema`, `Kysely`, `database`,
   `UI component`, `design token`).
2. For each row in the table above, check whether any extracted term appears in
   that row's Path patterns column.
3. Collect all matching skill file paths.
4. If more than 3 match, keep the 3 most specific (prefer full package-path matches
   over keyword-only matches; prefer longer path segments over shorter ones).
5. If 0 rows match, skip injection — use the prompt template below unchanged.
6. If the issue is a bounded UI follow-up and the current `tmp/context-<issue-id>.md` lacks a `## Targeted Design Edit` block, inject `.opencode/skills/design-edit/SKILL.md` even when no path-pattern row matched; that workflow owns localized edit intake. If the issue is UI-bearing with unresolved visual direction and the current `tmp/context-<issue-id>.md` lacks a `## Design Direction` block, inject `.opencode/skills/design-direction/SKILL.md` even when no path-pattern row matched; that workflow owns upstream intent capture. If direction is already settled and only needs preservation, inject `.opencode/skills/design-handoff/SKILL.md` when the context artifact lacks `## Design Handoff Context`.

Prompt template per issue:

When 1–3 skills matched in the inline skill matching step above, include the
`## Relevant conventions` block (shown below between `[INJECT IF MATCHED]` and
`[END INJECT]`) immediately after the `Worktree:` line. Omit the block entirely
when 0 skills matched.

If the targeted-edit, UI-direction, or design-handoff gate applies, also tell the planner to treat the current `tmp/context-<issue-id>.md` as authoritative UI context and to read its `## Targeted Design Edit` block when present, plus any `## Design Direction` and `## Design Handoff Context` blocks, before planning unless the plan explicitly calls out a strategic mismatch.

When `prior_agent_context` or `resolved_blocker_prs` is non-empty for the issue,
include the `## Prior context` block (shown below between `[INJECT IF ENRICHED]`
and `[END INJECT]`) immediately after the `Worktree:` line and **before** any
`[INJECT IF MATCHED]` skills block. Omit the block entirely when both values are
empty.

```
Produce an implementation plan for Linear issue REP-xxx in worktree <absolute-worktree-path>.

Issue: REP-xxx
Worktree: <absolute-worktree-path>

[INJECT IF ENRICHED — omit this block when both prior_investigation_context and resolved_blocker_prs are empty]
## Prior context
[INJECT IF prior_investigation_context is non-empty]
Prior investigation findings:
- <bullet 1 from prior_investigation_context>
- <bullet 2 from prior_investigation_context>
(up to 5 bullets)
[END INJECT]
[INJECT IF resolved_blocker_prs is non-empty]
Resolved blockers with linked PRs (review diffs for relevant implementation patterns):
- <PR reference 1 from resolved_blocker_prs>
- <PR reference 2 from resolved_blocker_prs>
(up to 3 entries, matching the cap in Phase 1 Check 2)
[END INJECT]
[END INJECT]

[INJECT IF MATCHED — omit this block when 0 skills matched]
## Relevant conventions
Read these skill files before planning. Incorporate their conventions into your
plan, and document any deviation from them in Risk Notes.
- <matched-skill-path>   ← one entry per matched skill, capped at 3
[END INJECT]

Fetch the issue via `linear issue show <issue-id> --json` to read the full description and acceptance criteria.
Explore the codebase as needed to understand affected files and patterns.

Return a plan document using this structure:

## Readiness
ready | not ready

## Sequence Notes
- likely touched packages/files
- dependency or ordering notes
- list every file this plan will write or modify; for each shared file, specify the edit location (e.g., "Phase 4", "lines 40-60", "Phase 7 agent template") so the orchestrator can judge whether edits will overlap with sibling issues in the current wave

## Risk Notes
- anything that could force resequencing or issue pruning

## Plan
<step-by-step implementation plan>

## Open Questions
<only include this section if readiness is not ready>

Friction logging: if you encounter friction during planning (unclear patterns, missing documentation, ambiguous conventions, surprising codebase state), append an entry to `<absolute-worktree-path>/tmp/friction.md` in this format:
  [Brief description]
  - Phase: planning
  - Root cause: <one of: missing-docs, unclear-pattern, tooling-gap, stale-code>
Do not stop or change your approach — log and continue. (This append is the one exception to "Do NOT write any files." below.)

Do NOT write any files.
```

After each planner finishes, apply QC checks before writing the plan to `tmp/`:

#### QC-A: Missing migration check

Scan the plan text for schema/database signals: `prisma`, `schema`, `migration`, `ALTER TABLE`,
`CREATE TABLE`, `@prisma/client`, `.prisma`.

If one or more signals are found **and** no migration step is present anywhere in the plan:

- Re-prompt the planner — pass the existing plan output plus this targeted message (do not spawn
  a new independent planner; treat this as a revision request on the current plan):

  > "Your plan appears to modify the database schema (signals detected: <list matched signals>).
  > Please revise the plan to either (a) add a migration step or (b) add a note to the Risk Notes
  > section confirming why no migration is required for this change."

- Use the revised plan output in place of the original for the rest of Phase 4.

If no schema signals are found, or if a migration step is already present anywhere in the plan:
proceed without re-prompting.

#### QC-B: PR size warning

Count the distinct file paths listed in the plan's **Sequence Notes** section. Also check for
explicit "large diff" language anywhere in the plan text.

If the file count exceeds 15, or explicit large-diff language is detected:

- Add a visible `⚠️ large diff (N files)` annotation to the status table row for this issue.
- Record a `large-diff` flag on the issue's in-memory risk profile so Phase 5 classification
  has full context.
- Do **not** halt the pipeline — this check is advisory only.

After both QC checks pass (or produce advisory-only results):

- Write the full planner output to `<worktree>/tmp/plan-REP-xxx.md`
- Treat that file as the authoritative develop input

### Phase-local planning failure handling

If the planner returns `not ready` or includes unresolved questions that prevent confident implementation:

- First check whether the blocker is recoverable missing UI context (`## Design Direction`, `## Targeted Design Edit`, or `## Design Handoff Context`). If so, run the matching design workflow, re-read the context artifact, and retry planner launch before escalating. Do **not** add `needs-spec` for this recoverable path.
- If the issue is still not ready after context capture, post a concise Linear comment describing the blocking questions and the next action: tighten the issue scope, create child issues if needed, remove `needs-spec` when the issue is bounded, and rerun `/deliver` on the refined issue.
- Set the issue state back to **Todo** and add the `needs-spec` label with `linear issue update <issue-id> --add-label needs-spec --status "Todo" --json`
- Remove the worktree
- Add the issue ID to `escalated_issues`
- Exclude the issue from the current ready wave

---
