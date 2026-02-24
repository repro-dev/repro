# Git Conventions

- **Commit messages**: Always use [Conventional Commits](https://www.conventionalcommits.org/) format
  - Examples: `feat: add user avatar upload`, `fix: resolve race condition in session refresh`, `refactor: extract auth middleware`, `chore: update dependencies`, `docs: add API usage guide`
  - Use a scope when relevant: `feat(auth): add SSO login flow`, `fix(player): prevent seek past end of recording`
  - Use `!` for breaking changes: `feat(api)!: rename /sessions endpoint to /recordings`
- **No commits on `main`**: Never commit directly to the `main` branch. **Before writing a single line of code**, check `git status` and `git branch` to confirm you are on a feature branch. If you are on `main` (or any other protected branch), create and switch to a new feature branch first — even if the working tree is clean. Do not begin any implementation until the branch switch is confirmed.
- **Branch names**: Follow the pattern `<type>/<issue?>-<slug>` (e.g., `feat/REP-123-add-auth`, `fix/login-redirect`)
- **Pull requests**: Always reference the Linear issue ID (e.g., `REP-123`) in the PR title or body so the Linear integration links them. Always include a detailed summary of changes in the PR description body.
- **GitHub**: Always use the `gh` CLI to interact with GitHub (e.g., creating PRs, checking CI status, managing releases)

## Linear Issue Status Lifecycle

The available statuses and when to use them:

| Status | When to set it |
|--------|---------------|
| **Backlog** | Issue exists but has not been prioritised for immediate work |
| **Todo** | Prioritised and ready to pick up in the current cycle |
| **In Progress** | A branch exists and code is being written — set this when you start work |
| **In Review** | A PR is open and awaiting review or CI — set this immediately after `gh pr create` |
| **Done** | The PR has been **merged to `main`** — never set this before merge |
| **Canceled** | Issue will not be done; leave a comment explaining why |

**Rules for agents:**
- Move an issue to **In Progress** when you begin writing code, not before.
- Move to **In Review** immediately after opening a PR — do not leave it as In Progress.
- **Never mark an issue Done until the PR is merged.** Code written locally or a branch pushed but not merged is still In Progress.
- Do not skip statuses (e.g. Backlog → Done). Each transition should reflect the actual state of the work.

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

- Verify correctness, style, and consistency with the codebase conventions in `docs/agents/code-style.md` and `docs/agents/conventions.md`.
- Cross-reference the diff against the issue requirements and decisions gathered in step 1.
- Flag deviations from the issue spec — but distinguish intentional improvements (which are fine) from accidental omissions (which need action).

### 3. Structure the Review

- **Lead with context**: briefly note which Linear issues were reviewed and any resolved decisions that informed the review.
- **Separate blocking issues from non-blocking notes**: use clear severity labels (e.g. "must fix", "suggestion", "informational").
- **Reference issue requirements by ID** when noting gaps (e.g. "REP-155 requires `shadow.focus`; not included in this PR").
- **End with a verdict**: approve, request changes, or note what needs discussion.
