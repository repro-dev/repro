## Phase 1: Scan and select

Run this phase only when `mode = wave`.

1. Fetch Linear issues in **Todo** and **Backlog** within one resolved Linear project using this exact protocol, then apply `--query <term>` locally if present:

   - Refresh in-flight state first by running `reproctl wt list --json` and `gh pr list --state open --limit 1000 --json number,headRefName,title`; treat those results as the authoritative active-worktree and open-PR snapshots for this phase, using the structured worktree records and returned `headRefName` values for exclusion checks.
   - Resolve `project_filter` to exactly one Linear project before any backlog-discovery call. In wave mode, a project must always be defined; do not scan across all projects and do not treat raw `$ARGUMENTS` as the Linear filter input once parsing is complete.
   - If `project_filter` cannot be resolved to exactly one Linear project, stop with a clear validation error instead of guessing, broadening the scan, or searching by title terms.
   - After project resolution, make exactly two backlog-discovery calls: one `linear issue list --project <project> --status todo --unblocked --leaf --limit 250 --json` call and one `linear issue list --project <project> --status backlog --unblocked --leaf --limit 250 --json` call.
   - Trim each backlog-discovery result with `jq` before bringing it into context so only routing fields survive (for example: `id`, `identifier`, `title`, `state`, `priority`, `project`).
   - Before sending each backlog-discovery `linear issue list` call, perform a self-check on the outgoing flags. If the call includes any filter outside the intentionally selected project, status, limit, and output flags, treat that as a command bug, do not send the call, and rebuild it.
   - Construct each `linear issue list` call by omission, not by empty defaults. Only include flags that intentionally constrain backlog discovery.
   - For backlog discovery, include only `state`, `project`, `limit`, `orderBy`, `includeArchived`, `unblocked`, and `leaf`, where `project` is the single resolved project name or ID from `project_filter`.
   - Do **not** send placeholder values such as `assignee: null`, `priority: 0`, `query: ""`, `team: ""`, `cycle: ""`, `label: ""`, `delegate: ""`, `parentId: ""`, `createdAt: ""`, `updatedAt: ""`, or `cursor: ""`; these can narrow the Linear query instead of acting as no-ops.
   - Example discovery payloads: `{ limit: 250, orderBy: "updatedAt", state: "Todo", project: "Workspace", includeArchived: false, unblocked: true, leaf: true }` and `{ limit: 250, orderBy: "updatedAt", state: "Backlog", project: "Workspace", includeArchived: false, unblocked: true, leaf: true }`.
   - If a tool trace or status line shows any disallowed key on a backlog-discovery call, treat that run as invalid. Retry immediately with the corrected minimal payload and discard the bad result set.
   - If the corrected minimal payload still returns no issues, stop and report that no matching backlog issues were found for the resolved project. Do **not** fall back to alternate project identifiers, cross-project scans, team-wide searches, empty-state probes, or semantic title searches to compensate.
   - Keep later `linear issue show <issue-id> --json` calls full when you need richer issue, blocker, or comment context.
   - If `query_filter` is present, use it only for local fuzzy scoring after the issues are fetched; do not send it as a direct `linear issue list` filter.
   - Do **not** add an assignee filter when scanning the backlog; the wave should include assigned and unassigned issues alike.
   - Deduplicate the combined results by issue ID.
   - For each issue in the full deduplicated set, call `linear issue show <issue-id> --json`.
   - For each issue that has any `relations.blockedBy` entries, call `linear issue show <blocker-id> --json` for each blocker as well so blocker status is known before applying the readiness filter.
   - If the queue health signals point to blocked work, stale parent/spec placement, or duplicate/superseded issues rather than delivery-ready candidates, hand those issues to `/groom` instead of forcing them into the delivery wave.

2. Apply a precision-first selection bar.

   **Hard excludes:**

   - Has any `blockedBy` relation whose fetched blocker issue is not `Done` or `Canceled`
   - If a `blockedBy` relation still exists but every fetched blocker is `Done` or `Canceled`, treat the issue as not blocked and note the stale relation in the rationale instead of excluding it
   - State is already **In Progress** or **In Review**
   - Already has an active worktree (`reproctl wt list`)
   - Issue ID appears in an open PR branch name
   - Issue ID is already in this session's `escalated_issues` set
   - Issue already has the `needs-spec` label; record the rationale as "exclude — needs-spec label (previously escalated for clarification)"
   - The issue does not give the planner enough concrete information to produce a bounded implementation plan without asking for human clarification

   **Scope pre-filter (inline heuristic — no agent spawn):**

   For each issue that passes all hard-exclude checks, count how many of the following 6 signals are present:

   | Signal                                             | Detected when                                                                                                           |
   | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
   | No acceptance criteria                             | Description contains no checkbox list, no "Acceptance Criteria" section, and no verifiable outcome statements           |
   | Description under ~80 words                        | The full issue description body contains fewer than ~80 words                                                           |
   | No named files/packages/components                 | Description names no specific file paths, `@repro/...` package names, component names, function names, or API endpoints |
   | Multiple services with no implementation direction | Description mentions 3+ services or packages but gives no direction on which to change or how                           |
   | Vague noun-phrase title                            | Title is a bare noun phrase with no verb and no measurable change (e.g. "Performance improvements", "Auth cleanup")     |
   | No type label                                      | Issue carries none of the standard labels: Bug, Feature, Improvement, Tech Debt                                         |

   - If **3 or more signals are present**: exclude the issue from the current run. In the candidate table, record the decision as "exclude — scope pre-filter / needs-spec". Post a concise comment with `linear issue comment <issue-id> "Excluded by scope pre-filter: no acceptance criteria, description under 80 words, no named files/packages. Added needs-spec so /deliver will skip this until clarified." --json`, then apply `linear issue update <issue-id> --add-label needs-spec --status "Todo" --json`. Do not create a worktree or spawn a planner for this issue.
   - If **fewer than 3 signals are present**: the issue passes the heuristic — proceed to evaluate supporting signals and the planner as normal.

   **Supporting signals (use as evidence, not fake-precise hard gates):**

   - Clear user or developer outcome
   - Concrete acceptance criteria or other verifiable success conditions
   - Named packages, files, components, APIs, or workflows
   - Obvious bounded scope
   - Useful risk notes or dependency notes already present in the issue

3. Produce a candidate table from the full deduplicated issue set before proceeding. For each issue, show:

   - Issue ID
   - Title
   - Priority
   - Project
   - Include / exclude decision
   - Brief rationale
   - Risk notes that may affect sequencing

4. Write a durable selection note to `tmp/deliver-runs/<run-id>/selection.md` (or the directory provided by `DELIVER_RUN_DIR`) that records:

   - the chosen ready wave
   - why each selected issue is the best ready candidate
   - why each excluded issue was skipped or deferred

   Treat this file as the authoritative rationale for wave selection and resequencing for the current run.

5. Select a small batch for provisional sequencing. Aim for **3–6 issues total**, but prefer fewer if overlap risk is unclear.

6. For issues selected in step 5, apply two inline context enrichment checks:

   **Check 1 — Prior investigation comments:**

   - Trigger: issue has 2 or more comments
   - Action: inspect the issue's `comments` from `linear issue show <issue-id> --json`; scan them for code blocks (triple-backtick fences), file paths (e.g. `packages/foo/src/bar.ts`), or headings such as "Findings", "Investigation", or "Summary"
   - If any such comments are found: extract a concise summary (2–5 bullet points) of the findings; store as `prior_investigation_context` alongside the issue data. Note: author identity is not verified — this matches any substantive prior comment containing the above markers.
   - If no such comments are found: skip; do not store `prior_investigation_context`
   - Cost: one `linear issue show --json` call per qualifying issue if the comments are not already loaded

   **Check 2 — Resolved blocker context:**

   - Trigger: issue has one or more `blockedBy` relations where **every** fetched blocker is in a `Done` or `Canceled` state
   - Action: for each resolved blocker (cap at 3), scan its description (already fetched in step 1) for a PR reference — specifically a GitHub pull URL (`https://github.com/.*/pull/\d+`), `PR #\d+`, or `pull request #\d+`; if the description yields no PR reference, inspect the blocker's `comments` from `linear issue show <blocker-id> --json` for the same patterns
   - If any PR references are found: store them as `resolved_blocker_prs` alongside the issue data
   - If no PR references are found: skip; do not store `resolved_blocker_prs`
   - Cost: zero additional `linear issue show` calls when blocker comments are already loaded; otherwise at most one extra `linear issue show --json` call per blocker whose description lacks a PR reference, capped at 3 blockers

   Store `prior_investigation_context` and `resolved_blocker_prs` in memory alongside the issue data for injection into the planner prompt in Phase 4.

---
