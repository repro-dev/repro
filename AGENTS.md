# Agent Guidelines for Repro Codebase

## Build System
- Uses **moon** (monorepo task runner) with pnpm workspace
- Run tasks: `moon run <package>:build|test|typecheck` or `cd <package> && pnpm <script>`
- Build: `moon run <package>:build` (builds dependencies first via `^:build`)
- Test: `moon run <package>:test` or `pnpm test` (uses tsx with `--test` flag)
- Single test: `tsx --experimental-test-module-mocks --test path/to/file.test.ts`
- Typecheck: `moon run <package>:typecheck` or `pnpm typecheck`

## Code Style
- **Prettier**: `semi: false`, `singleQuote: true`, `arrowParens: avoid`, `trailingComma: es5`
- **Imports**: Use `prettier-plugin-organize-imports` (auto-sorts imports)
- **Types**: Strict TypeScript with `noUncheckedIndexedAccess`, `noUnusedLocals`, `noImplicitReturns`
- **Paths**: Use `~/*` alias for local imports within packages
- **React**: Functional components with hooks, use `@jsxstyle/react` for styling
- **Naming**: PascalCase for components/types, camelCase for functions/variables
- **Error handling**: Use `serialize-error` for serialization, `fluture` for async operations
- **NO COMMENTS**: Do not add code comments unless explicitly requested

## Conventions
- Packages: `@repro/<name>` with workspace protocol (`workspace:*`)
- Always check existing imports/patterns before adding new dependencies
- Use existing design system components from `@repro/design`

## Git Conventions
- **Commit messages**: Always use [Conventional Commits](https://www.conventionalcommits.org/) format
  - Examples: `feat: add user avatar upload`, `fix: resolve race condition in session refresh`, `refactor: extract auth middleware`, `chore: update dependencies`, `docs: add API usage guide`
  - Use a scope when relevant: `feat(auth): add SSO login flow`, `fix(player): prevent seek past end of recording`
  - Use `!` for breaking changes: `feat(api)!: rename /sessions endpoint to /recordings`
- **No commits on `main`**: Never commit directly to the `main` branch. Before starting any new unit of work, check the current branch and create a new feature branch if not already on one.
- **Branch names**: Follow the pattern `<type>/<issue?>-<slug>` (e.g., `feat/REP-123-add-auth`, `fix/login-redirect`)
- **Pull requests**: Always reference the Linear issue ID (e.g., `REP-123`) in the PR title or body so the Linear integration links them. Always include a detailed summary of changes in the PR description body.
- **GitHub**: Always use the `gh` CLI to interact with GitHub (e.g., creating PRs, checking CI status, managing releases)

## Learning from Corrections
- When the user corrects a code choice, style issue, or any fundamental rule about how the project should be developed, built, run, tested, or deployed, offer to update `AGENTS.md` (or a more specific `AGENTS.md` closer to the relevant code) with the new information so the lesson is retained for future sessions.

## PostgreSQL
- Target version: **PostgreSQL 17** (supported until November 2029)
- Pinned in: CI (`.github/workflows/ci.yml`), Tilt (`infra/apps/data/Tiltfile`), and local dev (`Brewfile`)

## Project Specs & Planning

- All project specifications, implementation plans, and tracked work live in **Linear** as the source of truth. Use Linear projects, milestones, and issues to organize deliverables.
- When the user wants to expand or change the scope of a project, ensure that the Linear issue is updated to reflect this.
