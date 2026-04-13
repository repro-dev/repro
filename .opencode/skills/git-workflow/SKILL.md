---
name: git-workflow
description: Git conventions (Conventional Commits, branch naming), PR creation with gh CLI, Linear issue status lifecycle, and code review checklist. Load when committing, creating PRs, reviewing code, or managing Linear issue status.
---

# Git Workflow

## Commit Messages

Always use [Conventional Commits](https://www.conventionalcommits.org/) format:

- Examples: `feat: add user avatar upload`, `fix: resolve race condition in session refresh`, `refactor: extract auth middleware`, `chore: update dependencies`, `docs: add API usage guide`
- Use a scope when relevant: `feat(auth): add SSO login flow`, `fix(player): prevent seek past end of recording`
- Use `!` for breaking changes: `feat(api)!: rename /sessions endpoint to /recordings`

## Branch Rules

- **No commits on `main`**: Never commit directly to the `main` branch. **Before writing a single line of code**, check `git status` and `git branch` to confirm you are on a feature branch. If you are on `main` (or any other protected branch), create and switch to a new feature branch first — even if the working tree is clean. Do not begin any implementation until the branch switch is confirmed.
- **Branch names**: Follow the pattern `<type>/<issue?>-<slug>` (e.g., `feat/REP-123-add-auth`, `fix/login-redirect`)

## Non-Interactive Editor Override

Agent sessions run without a TTY and cannot interact with text editors. Git commands that open an editor (e.g. for commit messages or rebase todo lists) will stall or fail — especially since this repo includes a `.nvim.lua` config that causes Neovim to block on UI input.

**Rule:** Always prefix editor-triggering git commands with `GIT_EDITOR=true` in agent sessions. This accepts the default message silently without opening an editor.

Affected commands:

```sh
# Rebase continue (opens editor for commit message)
GIT_EDITOR=true git rebase --continue

# Commit without -m flag (opens editor for message — prefer `git commit -m` instead)
GIT_EDITOR=true git commit

# Merge when conflicts produce a merge commit message
GIT_EDITOR=true git merge <branch>
```

**Preferred alternatives** that avoid the editor entirely:

- Use `git commit -m "message"` instead of bare `git commit`
- Use `GIT_EDITOR=true git rebase --continue` to accept the default rebase message
- Use `git merge --no-edit <branch>` to accept the default merge message

This guidance applies only to non-interactive agent contexts. Human developers using their terminal are not affected.

## Pull Requests

Before opening a PR:

- **Skill freshness check**: For each domain skill loaded during this task, ask: did you encounter any file paths, function names, API shapes, or patterns that the skill described incorrectly or that were missing? If yes, update the relevant `.opencode/skills/<domain>/SKILL.md` and include those changes in the PR.

When creating the PR:

- Always reference the Linear issue ID (e.g., `REP-123`) in the PR title or body so the Linear integration links them.
- Always include a detailed summary of changes in the PR description body.
- Always use the `gh` CLI to interact with GitHub (e.g., creating PRs, checking CI status, managing releases).

## Linear Issue Status Lifecycle

| Status          | When to set it                                                                     |
| --------------- | ---------------------------------------------------------------------------------- |
| **Backlog**     | Issue exists but has not been prioritised for immediate work                       |
| **Todo**        | Prioritised and ready to pick up in the current cycle                              |
| **In Progress** | A branch exists and code is being written — set this when you start work           |
| **In Review**   | A PR is open and awaiting review or CI — set this immediately after `gh pr create` |
| **Done**        | The PR has been **merged to `main`** — never set this before merge                 |
| **Canceled**    | Issue will not be done; leave a comment explaining why                             |

**Rules:**

- Move an issue to **In Progress** when you begin writing code, not before.
- Move to **In Review** immediately after opening a PR — do not leave it as In Progress.
- **Never mark an issue Done until the PR is merged.** Code written locally or a branch pushed but not merged is still In Progress.
- Do not skip statuses (e.g. Backlog -> Done). Each transition should reflect the actual state of the work.

## Code Review Checklist

When reviewing a PR, follow this checklist in order:

### 1. Gather Linear Context (mandatory)

Before reading the diff:

- **Extract issue IDs** from the branch name, PR title, and PR body (e.g. `REP-155`, `REP-156`).
- **Fetch every referenced issue** and read the full description — not just the title.
- **Look for "Decisions" sections** in the issue. These document choices that have already been made (e.g. which algorithm, which API shape, which default value). Do not flag decided items as open questions in the review.
- **Check requirements** listed in the issue. Verify the PR satisfies each one. Call out any that are missing or only partially addressed.
- **Check considerations** in the issue. These are open questions or trade-offs the author flagged. Note whether the PR resolves them or whether they need follow-up.
- **Fetch the parent project and milestone** if the issue belongs to one, to understand broader goals and constraints.

### 2. Review the Diff

- Verify correctness, style, and consistency with the codebase conventions.
- Cross-reference the diff against the issue requirements and decisions gathered in step 1.
- Flag deviations from the issue spec — but distinguish intentional improvements (which are fine) from accidental omissions (which need action).

### 3. Severity Classification

Classify every finding using one of these four levels before writing the review:

| Severity    | Definition                                                                     | Merge impact                                        |
| ----------- | ------------------------------------------------------------------------------ | --------------------------------------------------- |
| **Blocker** | Correctness bug, type error, security issue, or broken acceptance criterion    | Must fix before merge                               |
| **Major**   | Missing test coverage, architectural concern, or incomplete requirement        | Fix preferred; if deferred, track in a Linear issue |
| **Minor**   | Naming inconsistency, missing comment, suboptimal pattern — code still correct | Fix preferred, not required                         |
| **Nit**     | Style preference with no functional impact                                     | Never blocks merge                                  |

**Merge-readiness criteria**: A PR is mergeable when it has **zero Blockers** and any Majors are either fixed or tracked in a linked Linear issue.

**Checklist item severity map** (use as a starting guide — apply judgment):

| Checklist item                           | Default severity |
| ---------------------------------------- | ---------------- |
| Type errors or build failures            | Blocker          |
| Broken or missing acceptance criteria    | Blocker          |
| Security or auth issues                  | Blocker          |
| Missing test coverage for new behavior   | Major            |
| Architectural deviation from conventions | Major            |
| Incomplete requirement (partial impl)    | Major            |
| Naming inconsistency                     | Minor            |
| Missing comment on non-obvious code      | Minor            |
| Suboptimal pattern (code still correct)  | Minor            |
| Style preference or formatting           | Nit              |

### 4. Structure the Review

- **Lead with context**: briefly note which Linear issues were reviewed and any resolved decisions that informed the review.
- **Classify every finding** using the severity levels defined above (Blocker / Major / Minor / Nit).
- **State merge-readiness explicitly**: note whether the PR meets the merge-readiness criteria (zero Blockers; Majors fixed or tracked).
- **Reference issue requirements by ID** when noting gaps (e.g. "REP-155 requires `shadow.focus`; not included in this PR").
- **End with a verdict**: approve, request changes, or note what needs discussion.

---

## UI Quality Gate

Apply this checklist to every PR that touches UI code. If the PR touches only non-UI code (migrations, API routes, utilities, skill files), skip this section entirely.

### Interaction States

For each interactive element, verify all eight states are implemented:

1. **Default** — renders correctly at rest.
2. **Hover** — visual feedback present (e.g. `hoverBackgroundColor={color.bg.hover}`).
3. **Focus** — focus ring visible. Use `focusRing()` or `focusWithinRing()` from `@repro/design` — not custom outlines.
4. **Active / pressed** — depressed state evident.
5. **Disabled** — visually distinct; `props={{ disabled: true }}` set; no pointer events.
6. **Loading** — spinner shown via `<FX.Spin><LoaderIcon /></FX.Spin>`; triggering control set `props={{ disabled: true }}`.
7. **Error** — error state rendered; message follows the three-part formula (what failed / why / next action) from the `design-system` skill.
8. **Empty** — empty state rendered per the five-part formula (icon / heading / body / CTA / illustration) from the `design-system` skill.

### Transitions & Motion

- Durations: use motion token values (100/200/300 ms). Prefer 100 ms for micro-interactions, 200 ms for standard UI transitions, and 300 ms for panel/modal entrances.
- Transition presets: use named tokens — `transition.default`, `transition.fast`, `transition.transform`.
- `prefers-reduced-motion` support — verify this rule exists at the global stylesheet level before adding per-component overrides:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Code Quality Checklist

Cross-references AGENTS.md rules — treat as a reminder, not a separate system:

- No `console.log` or `debugger` statements.
- No TypeScript `any` (use `unknown` + narrowing).
- No hardcoded colour/spacing tokens (hex, px, rem literals in JSX/TSX props).
- No inline `style={{}}` props (use jsxstyle appearance props or tokens).
- No writes to `/tmp/` — use `tmp/` at repo root.

### Polish Checklist

1.  All interactive elements have all 8 interaction states listed above.
2.  Focus is keyboard-navigable in logical order.
3.  Colour contrast meets WCAG AA (4.5:1 for text, 3:1 for UI components).
4.  Touch targets ≥ 44×44 px.
5.  Text scales correctly up to 200% zoom.
6.  Truncation uses CSS `text-overflow: ellipsis`; no content is clipped silently.
7.  Loading states are shown for all async operations.
8.  Errors are recoverable — every error message has a next action.
9.  Empty states are present on all list/grid surfaces.
10. Transitions feel snappy — no jank; profile in Chrome DevTools if unsure.
11. Spacing uses `spacing.*` tokens throughout — no magic numbers.
12. Colour uses named tokens — no hardcoded hex/rgb.
13. Typography uses `textStyles.*` spread — no raw `<p>` / `<h*>` with style props.
14. Icons are from `@repro/icons` — no ad-hoc SVGs.
15. `aria-label` present on icon-only buttons and inputs without visible labels.
16. Form validation errors use `<FormFieldError>` and are announced to screen readers.
17. Modals trap focus and restore focus on close.
18. Animated elements respect `prefers-reduced-motion`.
19. Tested in Chrome, Firefox, and Safari.
20. No regressions: `moon run repro/<package>:typecheck` passes.

### When to Skip

If the PR touches only non-UI code (migrations, API routes, utilities, skill files), skip the UI Quality Gate entirely.
