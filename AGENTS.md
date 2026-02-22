# Agent Guidelines for Repro Codebase

Detailed references are split by theme under `docs/agents/`:

| File | Topics |
|------|--------|
| [docs/agents/build.md](docs/agents/build.md) | moon, pnpm, test & typecheck commands |
| [docs/agents/code-style.md](docs/agents/code-style.md) | Prettier, TypeScript strictness, async/Future, React, naming |
| [docs/agents/conventions.md](docs/agents/conventions.md) | Package naming, dependency hygiene, design system |
| [docs/agents/git.md](docs/agents/git.md) | Conventional Commits, branch names, PRs, gh CLI |
| [docs/agents/database.md](docs/agents/database.md) | PostgreSQL version and pinning locations |

## Learning from Corrections

When the user corrects a code choice, style issue, or any fundamental rule about how the project should be developed, built, run, tested, or deployed, offer to update the relevant file in `docs/agents/` (or a more specific `AGENTS.md` closer to the relevant code) with the new information so the lesson is retained for future sessions.

## Project Specs & Planning

- All project specifications, implementation plans, and tracked work live in **Linear** as the source of truth. Use Linear projects, milestones, and issues to organize deliverables.
- When the user wants to expand or change the scope of a project, ensure that the Linear issue is updated to reflect this.
