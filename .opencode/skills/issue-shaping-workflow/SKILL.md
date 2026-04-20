---
name: issue-shaping-workflow
description: Interactive goal-shaping workflow that turns a high-level goal into a curated Linear issue set. Load when starting from a goal or initiative statement and you need discovery, refinement, proposal, and approved issue creation.
---

# Issue Shaping Workflow

Use this workflow when a user starts from a goal rather than an existing issue. The job is to refine scope, classify the work, propose a reviewable issue set, and write to Linear only after approval.

## Load these support skills

- `product-planning` — goal framing, sequencing, and proposal structure
- `context-gather` — when the discovery thread is scattered or needs a durable `tmp/` artifact
- `linear-cli` — all Linear reads and writes
- `create-issue` — project, label, priority, and description conventions

## 1. Intake

- Start from a goal, initiative statement, or planning prompt.
- Do not accept an existing issue ID as the primary input; that belongs to `/deliver` or `/spec`.
- Capture the goal, constraints, audience, and success signal.
- If the discovery thread is getting broad or fragmented, write a small durable note in `tmp/context-<topic>.md` before going deeper.

## 2. Discovery

- Use the repo-owned `linear` CLI to look for related open or recently completed issues that might overlap.
- Use jcodemunch to ground the goal in the codebase when the target area is known or discoverable.
- Reuse existing planning or refinement patterns only when they help clarify the goal; do not turn this into backlog grooming.

## 3. Refinement questions

- Ask concise, targeted questions about:
  - problem statement
  - intended users
  - scope boundaries
  - sequencing and dependencies
  - acceptance bar
- Keep the questions grouped and reviewable. Do not jump straight to issue creation.

## 4. Classify the work

Use these proposal buckets:

- `tracking/parent` — the goal is broad and should anchor smaller executable issues
- `spec/needs-spec` — the goal is too vague to plan safely
- `executable leaf` — the work is bounded enough for `/deliver`

Rules:

- Prefer a small, high-quality issue set over over-decomposition.
- If the goal is broad, propose a parent issue plus leaf children.
- If the goal is still too vague, propose the spec/needs-spec path and stop before any Linear write.
- Explicitly call out deferred or out-of-scope work in the proposal so it does not get mixed into executable issues.

## 5. Draft the proposal

Before any Linear mutation, present a reviewable proposal containing:

- title
- project
- classification label (`tracking/parent`, `spec/needs-spec`, or `executable leaf`)
- one type label
- priority
- short rationale
- acceptance criteria or requirements
- relation notes (`related`, `blocks`, `blocked-by`, parent/child intent)

Keep the proposal grounded in the original goal and the context gathered so far.

## 6. Approval gate

- If the user rejects or edits the proposal, revise it or stop with no writes.
- If the user approves it, create the issue set in Linear via the repo-owned `linear` CLI only.
- If the approved proposal is classified `spec/needs-spec`, apply the `needs-spec` label to that issue so spec work stays discoverable by the existing `/spec` and enrichment flows.
- Create parent or tracking issues first, then executable children, then relation wiring.
- Use `create-issue` conventions for project selection, type label, priority, and description structure.

## 7. Write and stop

- On approval, write the curated issue set and stop.
- Do not pivot into delivery, implementation, or issue refinement after the write.
- The output should be agent-ready enough that `/deliver` can pick up the executable issues without a second planning pass.
