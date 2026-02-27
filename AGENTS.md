# Agent Guidelines for Repro Codebase

Detailed references are split by theme under `docs/agents/`:

| File | Topics |
|------|--------|
| [docs/agents/build.md](docs/agents/build.md) | moon, pnpm, test & typecheck commands |
| [docs/agents/code-style.md](docs/agents/code-style.md) | Prettier, TypeScript strictness, async/Future, React, naming |
| [docs/agents/conventions.md](docs/agents/conventions.md) | Package naming, dependency hygiene, design system |
| [docs/agents/design-system.md](docs/agents/design-system.md) | UI implementation: components, tokens, jsxstyle, forms, state, icons |
| [docs/agents/git.md](docs/agents/git.md) | Conventional Commits, branch names, PRs, gh CLI |
| [docs/agents/database.md](docs/agents/database.md) | PostgreSQL version and pinning locations |
| [packages/design/AGENTS.md](packages/design/AGENTS.md) | `@repro/design` package: component inventory, add/modify checklists, commands, pitfalls |

## Learning from Corrections

When the user corrects a code choice, style issue, or any fundamental rule about how the project should be developed, built, run, tested, or deployed, offer to update the relevant file in `docs/agents/` (or a more specific `AGENTS.md` closer to the relevant code) with the new information so the lesson is retained for future sessions.

## Linear as Source of Truth

- All project specifications, implementation plans, and tracked work live in **Linear** as the source of truth. Use Linear projects, milestones, and issues to organize deliverables.
- When the user wants to expand or change the scope of a project, ensure that the Linear issue is updated to reflect this.
- **Code reviews**: When reviewing a PR that references Linear issues (e.g. `REP-123` in the branch name, title, or body), always fetch those issues before completing the review. Check for requirements, resolved decisions, and open considerations documented in the issue — these take precedence over assumptions based on codebase patterns alone. See [docs/agents/git.md](docs/agents/git.md) for the full review checklist.
