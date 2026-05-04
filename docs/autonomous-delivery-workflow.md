# Autonomous Delivery Workflow Contract

- **Issue:** REP-1093
- **Parent:** REP-1092
- **Scope:** local-first observe-and-prepare MVP
- **Non-goal:** launching implementation, test, review, or release sessions automatically

This document is the repo-owned contract for future autonomous delivery work. It defines the workflow shape implementation issues must consume without re-planning the policy surface.

## Ownership and file locations

This repo owns the contract for autonomous delivery behavior until a successor document replaces it.

Planned runtime/policy locations are intentionally named here, but not activated yet:

- Workflow config: `.opencode/autonomous-delivery/workflow.yaml`
- Prompt policy: `.opencode/autonomous-delivery/prompt-policy.md`
- Durable state and run artifacts: `tmp/autonomous-delivery/<run-id>/...` within the active worktree only

Future config files should be declarative, reviewed, versioned, and include a top-level `version` field.

## Workflow config shape

The first implementation should use a YAML-shaped contract like this:

```yaml
version: 1
source:
  project: Engineering
  statuses:
    - Todo
    - Backlog
  labels:
    - Improvement
    - Feature
    - Bug

states:
  active:
    - observing
    - candidate_selected
    - workspace_preparing
    - workspace_ready
    - blocked
    - needs_spec
    - operator_paused
  terminal:
    - prepared
    - skipped
    - failed
    - canceled

candidateFilters:
  unblocked: true
  leafIssueOnly: true
  noActiveWorktree: true
  noOpenPr: true
  noNeedsSpec: true
  boundedAcceptanceCriteria: true
  allowStaleResolvedBlockers: true

blockers:
  activeBlockers: exclude
  resolvedBlockers: allowWithRecord
  staleResolvedBlockers: recordAndContinue
  ambiguousScope: needs_spec
  unreadableLinearState: failClosed

concurrency:
  maxConcurrentPrep: 2
  deterministicOrdering:
    - priority
    - updatedAt
    - identifier
  retryPolicy:
    maxAttempts: 3
    backoff: exponential

workspace:
  perIssueWorktree: true
  pathContainment: repoRootOnly
  tmpContainment: worktreeLocalTmpOnly

phases:
  - observe
  - prepare
  - handoff

artifacts:
  required:
    - context
    - testPlan
    - plan
    - stateSnapshot

operatorCommands:
  status: "reproctl autonomous status [--json]"
  observe: "reproctl autonomous observe [--project <project>] [--once]"
  prepare: "reproctl autonomous prepare <issue-id>"
  pause: "reproctl autonomous pause"
  resume: "reproctl autonomous resume"
  cancel: "reproctl autonomous cancel <issue-id>"
  logs: "reproctl autonomous logs [<issue-id>]"
```

## States

Active states cover the observe-and-prepare lifecycle:

- `observing` — scanning Linear for eligible candidates
- `candidate_selected` — a single issue was chosen deterministically
- `workspace_preparing` — worktree and required artifacts are being prepared
- `workspace_ready` — the worktree is ready for handoff
- `blocked` — a live blocker prevents progress
- `needs_spec` — the issue is too ambiguous for safe preparation
- `operator_paused` — the system is paused by operator choice

Terminal states are durable and must explain why the candidate stopped:

- `prepared`
- `skipped`
- `failed`
- `canceled`

## Candidate selection and filters

Linear is the source of truth.

Candidate selection should prefer issues that are:

- in the configured project and source statuses
- unblocked, or only held by stale resolved blockers
- leaf issues with no child work that would need separate orchestration
- not already assigned an active worktree
- not already represented by an open PR containing the issue ID
- not marked `needs-spec`
- sufficiently described for planner consumption

Selection must be deterministic so repeated ticks pick the same issue set. Sort by priority urgency ascending (`1` before `2` before `3` before `4`), then by most recently updated first, then by issue identifier ascending as a stable tie-breaker.

## Blocker handling

- Active blockers: exclude the candidate and preserve blocker IDs.
- Resolved blockers: allow progress, but record the stale relation and any relevant PR/reference context.
- Ambiguous scope: mark `needs_spec` and avoid workspace preparation.
- If Linear cannot be read reliably, fail closed rather than guessing.

## Observe-and-prepare MVP boundary

Allowed in MVP:

- observe Linear candidates
- apply filters and ordering
- prepare/check a per-issue workspace
- create and read durable handoff artifacts
- show operator-visible state

Explicitly deferred:

- automatic `develop`, `test`, `review`, or `release` OpenCode sessions
- PR creation
- merge or land automation
- remote workers
- rich dashboard UI
- autonomous code edits beyond workspace/artifact preparation

## Safety invariants

- OpenCode only; no alternate agent runtime.
- One issue per workspace/worktree.
- All writes stay path-contained under the selected worktree or repo root.
- Scheduling is deterministic and concurrency is bounded.
- Durable handoff artifacts replace conversation continuity.
- `/deliver` remains the manual orchestration path and is not the daemon.

## First-version `reproctl` operator expectations

The first operator surface should name, not yet implement, these commands:

- `reproctl autonomous status [--json]`
- `reproctl autonomous observe [--project <project>] [--once]`
- `reproctl autonomous prepare <issue-id>`
- `reproctl autonomous pause`
- `reproctl autonomous resume`
- `reproctl autonomous cancel <issue-id>`
- `reproctl autonomous logs [<issue-id>]`

JSON output should be available for status/list-style operations.
The exact command names may change only if this contract is updated in the same change.

## Acceptance mapping

- Concrete workflow contract documented in repo: this document.
- Specific enough for implementation issues to consume without replanning: config shape, states, filters, blockers, and boundaries above.
- Observe-and-prepare scope separated from future autonomous execution: see MVP boundary and deferred list.
- `reproctl` operator expectations named: see first-version operator commands.
