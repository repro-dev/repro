---
name: gtm-strategy-workflow
description: GTM strategy workflow for turning a launch goal, audience, and timeframe into a durable plan artifact with scope boundaries, decision points, and follow-on issue proposals.
---

# GTM Strategy Workflow

Use this workflow when a user wants to shape go-to-market strategy before execution. The job is to clarify the launch goal, audience, positioning, channels, constraints, and success criteria, then produce a reviewable plan artifact and optional follow-on issue proposals.

This is a strategy and planning workflow, not a content-generation workflow. Do not write campaign copy, build launch assets, or create Linear issues until the strategy is approved.

## Load these support skills

- `product-planning` — goal framing, sequencing, and trade-off structure
- `issue-shaping-workflow` — when an approved GTM plan should become a curated Linear issue set
- `create-issue` — project, label, priority, and description conventions for approved issue creation
- `linear-cli` — all Linear reads and writes

## 1. Intake

- Start from a launch goal, product/business objective, audience, and timeframe.
- If the prompt is only a vague topic, ask for the minimum missing inputs before drafting a plan.
- Capture known constraints: team capacity, budget, existing launch dates, compliance limits, channel access, and dependencies.
- Choose a stable topic slug and create or update `tmp/gtm-plan-<topic>.md` in the repo root.

## 2. Discovery

- Check for related Linear work when an issue, project, initiative, or roadmap area is named.
- Use repo context only when the GTM plan depends on actual product surface, feature readiness, or launch scope.
- Keep discovery bounded. This first version optimizes for clarity, scope discipline, and actionable outputs rather than exhaustive market research.
- Record assumptions explicitly instead of silently filling gaps with generic market claims.

## 3. Strategy questions

Ask concise questions only where the answer changes the plan. Cover these decision areas:

- launch goal and business outcome
- primary and secondary audiences
- positioning and differentiated promise
- audience pain, trigger, and adoption barrier
- channel mix and why each channel fits
- timeframe and sequencing constraints
- proof points, demos, references, or evidence available now
- success metrics and leading indicators
- explicit out-of-scope GTM execution for this phase

## 4. Plan artifact

Write `tmp/gtm-plan-<topic>.md` with this shape:

```markdown
# GTM Plan: <Topic>

## Goal

## Audience

## Positioning

## Scope Now

## Later / Out Of Scope

## Channel Strategy

## Launch Sequence

## Success Criteria

## Risks And Assumptions

## Open Decisions

## Follow-On Issue Proposals
```

Keep each section specific enough to review. If a section is unknown, write the open decision rather than inventing certainty.

## 5. Review gate

- Present the artifact path and a short summary of the major decisions, open questions, and deferred work.
- Ask for approval, edits, or explicit deferral before creating issues.
- If the user wants another strategy pass, revise the same artifact instead of creating a second plan file.

## 6. Issue handoff

- Only after approval, use `issue-shaping-workflow` and `create-issue` conventions to turn the plan into a curated issue set.
- Prefer a small set of executable issues over a broad backlog dump.
- Each issue proposal should cite the GTM plan artifact path, name the relevant plan section, and preserve the now-vs-later boundary.
- Stop after writing approved issues. Do not pivot into delivery, content drafting, or campaign execution.

## Output contract

- Durable artifact: `tmp/gtm-plan-<topic>.md`
- Summary: audience, positioning, channels, success criteria, and top open decisions
- Optional proposal: follow-on Linear issues for approved execution work
