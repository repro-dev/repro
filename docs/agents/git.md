# Git Conventions

- **Commit messages**: Always use [Conventional Commits](https://www.conventionalcommits.org/) format
  - Examples: `feat: add user avatar upload`, `fix: resolve race condition in session refresh`, `refactor: extract auth middleware`, `chore: update dependencies`, `docs: add API usage guide`
  - Use a scope when relevant: `feat(auth): add SSO login flow`, `fix(player): prevent seek past end of recording`
  - Use `!` for breaking changes: `feat(api)!: rename /sessions endpoint to /recordings`
- **No commits on `main`**: Never commit directly to the `main` branch. Before starting any new unit of work, check the current branch and create a new feature branch if not already on one.
- **Branch names**: Follow the pattern `<type>/<issue?>-<slug>` (e.g., `feat/REP-123-add-auth`, `fix/login-redirect`)
- **Pull requests**: Always reference the Linear issue ID (e.g., `REP-123`) in the PR title or body so the Linear integration links them. Always include a detailed summary of changes in the PR description body.
- **GitHub**: Always use the `gh` CLI to interact with GitHub (e.g., creating PRs, checking CI status, managing releases)
