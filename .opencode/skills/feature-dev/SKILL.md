---
name: feature-dev
description: Sequenced workflow for feature development — enforces git rules, Linear lifecycle, code style, and build verification
---

# Feature Development Workflow

Follow these phases in order when implementing a feature or fix.

## Phase 1: Pre-flight

1. **Fetch the Linear issue** for the work item. Read the full description — check for requirements, resolved decisions, and open considerations. These take precedence over assumptions.
2. **Resolve the correct branch.** Run `git branch` to check the current branch, then follow the first matching case:

   **Case A — Already on the correct feature branch for this issue:**
   No action needed. Continue to step 3.

   **Case B — On `main`:**
   Create a feature branch from `main`:
   ```
   git checkout -b <type>/<issue?>-<slug>
   ```

   **Case C — On a different feature branch:**
   Ask the user: is this new work stacked on the current branch?
   - **Yes (stacked):** Create the new branch from the current HEAD:
     ```
     git checkout -b <type>/<issue?>-<slug>
     ```
   - **No (independent):** Switch to latest `main` and branch from there:
     ```
     git checkout main && git pull && git checkout -b <type>/<issue?>-<slug>
     ```

   Branch naming pattern: `<type>/<issue?>-<slug>` (e.g., `feat/REP-123-add-auth`, `fix/REP-456-login-redirect`)

3. **Set the Linear issue to In Progress.**

## Phase 2: Planning

1. Break the issue down into concrete tasks using the todo list.
2. Identify which packages are affected (`apps/*`, `packages/*`).
3. For each affected package, check for an `AGENTS.md` file in the package root. If one exists, read it — it contains package-specific conventions, checklists, and pitfalls that must be followed.

## Phase 3: Implementation

Follow the project conventions below. For full details, read the referenced docs.

### Git rules (docs/agents/git.md)

- NEVER commit on `main`.
- Conventional Commits format: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:` with optional scope.
  - Example: `feat(auth): add SSO login flow`
  - Use `!` for breaking changes: `feat(api)!: rename endpoint`

### Code style (docs/agents/code-style.md)

- TypeScript strict mode: `noUncheckedIndexedAccess`, `noUnusedLocals`, `noImplicitReturns`.
- Use `~/*` path aliases for local imports within packages.
- Functional React components with hooks only.
- Async: use `fluture` (`FutureInstance`), NOT Promises. Use `.pipe()` with one argument per call. Use `tapF` for side-effect Futures. Never call a Future-returning function inside `map`.
- No code comments unless explicitly requested by the user.
- Naming: PascalCase for components/types, camelCase for functions/variables.

### Design system (docs/agents/conventions.md, docs/agents/design-system.md)

- All visual values MUST come from `@repro/design` tokens (`color`, `spacing`, `textStyles`, `shadow`, `radius`, `transition`, `focusRing`). No hardcoded pixels, hex colors, or transition strings.
- Two-layer model:
  - **Component layer** (`@repro/design`): opaque API, domain-specific props only. No className/style props.
  - **Layout layer** (jsxstyle `Row`, `Col`, `Grid`, `Block`, `Inline`): structural layout only. No appearance props that replicate design system functionality.
- Token categories must match CSS property categories (e.g., `color.bg.*` for `backgroundColor`, `color.text.*` for `color`).
- jsxstyle: HTML attributes go in the `props` bag. CSS properties go as top-level props. Never split the same attribute across both.
- New `@repro/design` components require: `forwardRef`, JSDoc, semantic HTML, `focusRing()` on interactive elements, Storybook stories (CSF3).

### Dependencies (docs/agents/conventions.md)

- Package naming: `@repro/<name>` with `workspace:*` protocol.
- Always check existing imports/patterns before adding new dependencies.
- API list endpoints return `{ items: Array<T> }` envelope, never bare arrays.

## Phase 4: Verification

Run these checks before committing. Fix any failures before proceeding.

1. **Typecheck** affected packages:
   ```
   moon run <package>:typecheck
   ```
2. **Run tests** (if tests exist for the changed code):
   ```
   tsx --experimental-test-module-mocks --test path/to/file.test.ts
   ```
3. **Format**:
   ```
   pnpm fmt
   ```

## Phase 5: Commit

1. Stage changes: `git add <files>`
2. Write a Conventional Commit message referencing the issue:
   ```
   feat(scope): description of change (REP-123)
   ```
3. Commit. If a pre-commit hook modifies files, amend ONLY if the commit succeeded and HEAD was created by you.
4. Do NOT push unless the user asks.

## Phase 6: Pull Request

1. Push the branch: `git push -u origin <branch-name>`
2. Create the PR via `gh` CLI:
   ```
   gh pr create --title "feat(scope): description (REP-123)" --body "$(cat <<'EOF'
   ## Summary
   - <bullet points>

   Resolves REP-123
   EOF
   )"
   ```
3. **Set the Linear issue to In Review** immediately after PR creation.
4. Never set the issue to Done — that happens only after merge.

## Quick Reference: Linear Status Lifecycle

| Status | When |
|--------|------|
| Backlog | Not yet prioritised |
| Todo | Ready for current cycle |
| **In Progress** | Branch exists, code being written |
| **In Review** | PR is open |
| Done | PR merged to main (never set manually before merge) |
| Canceled | Won't do — leave a comment explaining why |
