---
name: git-workflow
description: Git conventions (Conventional Commits, branch naming), PR creation with gh CLI, and Linear issue status lifecycle. Load when committing, creating PRs, or managing Linear issue status.
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

## Merge Conflict Resolution

### Classifying Conflicts

| Pattern | Symptoms | Typical cause |
| --- | --- | --- |
| Content conflict | `CONFLICT (content): Merge conflict in <file>` | Two branches changed the same lines |
| Add/add conflict | `CONFLICT (add/add): Merge conflict in <file>` | Both branches created the same file |
| Unrelated histories | `fatal: refusing to merge unrelated histories` | No common ancestor — shallow repo or orphaned branch |
| Rebase-in-progress | `.git/rebase-apply` or `.git/rebase-merge` exists | Prior rebase was interrupted |

### Detection: Shallow Repository Check

```sh
# Check if repo is shallow
if [ -f .git/shallow ]; then
  echo "Repository is shallow (depth-limited). Git history may be incomplete."
  cat .git/shallow | wc -l  # number of cut-points
fi

# Fix: unshallow the repo
git fetch --unshallow origin
```

Note: this must be run from the **main checkout**, not from a worktree (worktrees share the `.git/shallow` from the main checkout).

### Strategy Selection

| Scenario | Strategy | Command |
| --- | --- | --- |
| Branch behind origin/main, no conflicts expected | Rebase | `git rebase origin/main` |
| Long-lived branch with many changes, moderate conflicts | Merge (keep both histories) | `git merge origin/main` |
| Need to apply one or few specific commits | Cherry-pick | `git cherry-pick <sha>` |
| Unrelated histories that genuinely share code (after confirming shallow isn't the cause) | Allow unrelated histories | `git merge --allow-unrelated-histories origin/main` |
| Multiple commits need reordering or squashing before push | Interactive rebase | `git rebase -i origin/main` |

### Rebase Recovery

```sh
# Abort a failed rebase and return to pre-rebase state
git rebase --abort

# Skip the current conflicting commit (rarely desired — prefer abort+retry)
git rebase --skip

# After resolving a conflict during rebase
git add <resolved-files>
git rebase --continue
# In agent sessions (no TTY), use:
GIT_EDITOR=true git rebase --continue
```

Note: `git rebase --abort` is always safe and returns you to exactly where you were before the rebase started. If unsure, abort first.

### Keeping Branches Close to origin/main

```sh
# Before starting work for the day
git fetch origin main
git rebase origin/main

# Pre-push guard (referenced from deliver-phase-8-publish.md)
git fetch origin main
if ! git merge-base --is-ancestor origin/main HEAD; then
  git rebase origin/main
fi
```

Guidance: rebase onto `origin/main` frequently — at least before pushing and after any multi-day break. This reduces conflict surface area and catches shallow-state problems early.

### Prevention: Shallow State

Recommendation: check for `.git/shallow` before branch creation and periodically:

```sh
# Run from main checkout
test -f .git/shallow && echo "WARNING: shallow repo detected. Run: git fetch --unshallow origin"
```

The `reproctl wt create` flow (in `scripts/lib/worktree.sh`) does `git fetch origin main` without `--depth`, but it preserves an existing shallow state. Consider adding a shallow-state check to `scripts/lib/worktree.sh` `_latest_main_ref()` or to the worktree creation pre-flight.

### git rerere (Optional Proactive Measure)

```sh
# Enable rerere to record and reuse conflict resolutions
git config --global rerere.enabled true
```

`git rerere` (reuse recorded resolution) remembers how you resolved conflicts and automatically re-applies the same resolution. This is a personal setup — it must be configured per-machine. Mention it as an optional productivity boost, not a required repo setting.

### Cross-References

- **`deliver-phase-8-publish.md`**: Contains the pre-push `origin/main` ancestor guard. This playbook provides the resolution strategies when that guard fails. Do not duplicate the guard here — reference it.
- **`worktree-workflow` skill**: For worktree lifecycle guidance and the shallow-state troubleshooting entry added in this same change.

## Pull Requests

Before opening a PR:

- **Skill freshness check**: For each domain skill loaded during this task, ask: did you encounter any file paths, function names, API shapes, or patterns that the skill described incorrectly or that were missing? If yes, update the relevant `.opencode/skills/<domain>/SKILL.md` and include those changes in the PR.

When creating the PR:

- Always reference the Linear issue ID (e.g., `REP-123`) in the PR title or body so the Linear integration links them.
- Always include a detailed summary of changes in the PR description body.
- Always use the `gh` CLI to interact with GitHub (e.g., creating PRs, checking CI status, managing releases).
- For review policy and signal quality, load `review-standards` instead of treating this skill as the review checklist source.

> 💡 **Blog-worthiness check (optional):** If this PR introduces a novel pattern, an interesting architectural decision, or a non-obvious tradeoff, it's worth capturing. Run `/blog-ideas` for a fast scan, or file directly in the [Blog Posts](https://linear.app/repro/project/blog-posts-d914c9cd0c12) project.

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

## Review Standards

Load `review-standards` for the review contract, severity model, and UI review gate.
