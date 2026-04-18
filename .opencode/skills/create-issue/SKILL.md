---
name: create-issue
description: Structured workflow for creating Linear issues — project selection, labels, priority, descriptions with acceptance criteria, and agentic tool parity consideration. Load when filing new issues or planning work items.
---

# Create Issue

Structured workflow for filing Linear issues in the Repro workspace. Follow these steps in order.

---

## Step 1: Choose the Project

Select the project that best fits the work. When in doubt, prefer the product-area project over a cross-cutting one.

| Project              | Use for                                               |
| -------------------- | ----------------------------------------------------- |
| Platform             | reproctl, infrastructure, CI/CD, developer experience |
| Engineering          | Code style, conventions, tooling, technical hygiene   |
| Design System        | UI components, tokens, patterns for `@repro/design`   |
| Accessibility        | Reusable a11y helpers (`@repro/a11y`)                 |
| Recording & Playback | Session capture, playback engine, DevTools            |
| Authentication       | Auth flows, social login, passkeys                    |
| Agentic              | Agentic debugging experience, agent tools             |
| Billing              | Paid plans, subscriptions, entitlements (Paddle)      |
| Marketing Website    | Public-facing site                                    |

## Step 2: Write the Title

Use a concise, action-oriented title that describes the outcome. Avoid implementation details in the title — save those for the description.

Good: "Add network request grouping to DevTools panel"
Bad: "Update NetworkPanel.tsx to group by domain"

## Step 3: Write the Description

Structure the description with these sections as applicable:

### Context

Explain **why** this issue exists. Link to related issues, discussions, or user reports. One to three sentences is usually enough.

### Requirements

List specific, verifiable outcomes. Each requirement should be testable — someone reviewing the PR should be able to check each one off.

Use a flat list for simple issues. For complex issues, group requirements under sub-headings.

### Decisions (optional)

Document any choices that have already been made (API shape, algorithm, default values). This prevents reviewers and implementers from re-litigating settled questions.

### Considerations (optional)

Flag open questions or trade-offs that the implementer should think about. These are not requirements — they are prompts for judgment.

### Acceptance Criteria

If the requirements section is not sufficient to verify completeness, add explicit acceptance criteria. Use checkboxes:

```markdown
- [ ] Network requests can be grouped by domain
- [ ] Grouping persists across panel re-renders
- [ ] Empty groups are hidden
```

## Step 4: Apply One Type Label

Every issue gets exactly one type label:

| Label       | When to use                            |
| ----------- | -------------------------------------- |
| Bug         | Broken behavior that needs fixing      |
| Feature     | New user-facing functionality          |
| Improvement | Enhancement to existing functionality  |
| Tech Debt   | Internal quality, refactoring, cleanup |

## Step 5: Set Priority

Set priority on every issue:

| Priority   | Meaning                          |
| ---------- | -------------------------------- |
| 1 — Urgent | Drop everything, fix now         |
| 2 — High   | Do this cycle                    |
| 3 — Normal | Standard priority                |
| 4 — Low    | Nice to have, do when convenient |

## Step 6: Agentic Tool Parity

**Before finalizing the issue**, ask this question:

> Does this feature introduce a new way to query, filter, navigate, or analyse recording data?

This applies to work in **any** project — not just Agentic. Capabilities added to the playback engine, source-utils, or DevTools panels are often good candidates for agentic tooling.

Examples of capabilities that map to agentic tools:

- Breakpoint types (e.g. break on network error, break on DOM mutation) -> agent navigation tools
- DevTools panel queries (e.g. filtering console by level, grouping network requests) -> agent data retrieval tools
- New event matchers or source-utils query functions -> agent pattern detection tools

**If the answer is yes:**

1. File a related issue in the **Agentic** project describing the proposed tool API surface.
2. Reference the originating issue in the description.
3. Link the two issues as related using the repo-owned CLI relation flags (`--related`, `--blocks`, `--blocked-by`, or `--duplicate-of`) when appropriate.

**If the answer is no**, move on — not every issue needs an agentic counterpart.

## Step 7: Milestone (Optional)

Only assign a milestone when:

- The project has 3+ issues that form a natural phase or deliverable.
- A milestone already exists that this issue belongs to.

Do not create milestones for one-off issues.

## Step 8: Create the Issue

Use the repo-owned `linear` CLI issue-create flow with all the fields gathered above.

```
linear issue create --title "..." --project "<project name>" --description "<markdown description>" --label "<one type label>" --priority high
```

When creating the issue, add relation flags as needed: `--related <issue-id>`, `--blocks <issue-id>`, `--blocked-by <issue-id>`, or `--duplicate-of <issue-id>`.
