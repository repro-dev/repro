---
name: feedback-synthesis-workflow
description: Read-only customer feedback synthesis lane that clusters recurring themes, preserves evidence, and hands off durable briefs for issue and roadmap shaping.
---

# Feedback Synthesis Workflow

Use this workflow when the input is raw customer feedback and the goal is to turn it into a durable brief for planning work. This is a read-only synthesis lane: it analyzes, clusters, and recommends; it does not create Linear issues directly.

## Load these support skills

- `issue-shaping-workflow` - when a synthesized brief needs to become executable issue shape
- `product-planning` - when the feedback needs sequencing or roadmap framing
- `create-issue` - when the resulting recommendation should become a new issue

## 1. Intake

- Accept support notes, user reports, issue comments, call notes, and ad hoc exports.
- At minimum, require a topic label plus one feedback source or excerpt.
- If the input is a large corpus, keep the raw material intact and identify the dominant sources before summarizing.

## 2. Synthesis

- cluster recurring themes by shared complaint, request, or failure mode.
- separate systemic patterns from one-offs and explicitly call out low-signal anecdotes.
- Note frequency and severity when the source material supports it, but do not invent numbers.
- Keep traceable evidence and explicit uncertainty in every conclusion.

## 3. Durable artifact

- Write the synthesis to `tmp/feedback-brief-<topic>.md`.
- Treat the brief as appendable across passes so follow-up notes can accumulate without losing earlier evidence.
- Keep the brief compact but reviewable: topic, source inventory, theme clusters, evidence, uncertainty, and recommended follow-ups.

## 4. Follow-up recommendations

- recommend follow-up actions as one of:
  - create a new Linear issue
  - update an existing issue
  - request more evidence
  - defer until the signal is stronger
- Prefer propose-first recommendations over direct mutation.
- Hand off shaped opportunities to `issue-shaping-workflow` instead of redoing the clustering there.

## 5. Boundaries

- Do not replace issue-shaping, product-planning, or create-issue workflows.
- This workflow complements `issue-shaping-workflow`, `product-planning`, and `create-issue`.
- Do not re-analyze the same raw corpus in a second workflow when a feedback brief already exists.
- Do not overstate confidence when the evidence is thin.
