# Agent Guidelines for Repro Codebase

## Code Style

- **Prettier**: `semi: false`, `singleQuote: true`, `arrowParens: avoid`, `trailingComma: es5`
- **Imports**: Use `prettier-plugin-organize-imports` (auto-sorts imports)
- **Types**: Strict TypeScript with `noUncheckedIndexedAccess`, `noUnusedLocals`, `noImplicitReturns`
- **Paths**: Use `~/*` alias for local imports within packages
- **React**: Functional components with hooks. Inside `@repro/design`, use `@jsxstyle/react` for component styling. In app code, use `@repro/design` components for UI elements and jsxstyle layout primitives (`Row`, `Col`, `Grid`, `Block`, `Inline`) for structural arrangement. Do not use jsxstyle appearance props (backgroundColor, fontSize, color, etc.) to replicate what a design system component should provide.
- **jsxstyle prop precedence**: jsxstyle forwards a fixed set of HTML attributes (`disabled`, `checked`, `value`, `type`, `placeholder`, `href`, `id`, `name`, `src`, `alt`, `title`) directly to the DOM when passed as top-level props. Top-level props **overwrite** values in the `props` bag. Never split the same attribute across both — always use the `props` bag for HTML attributes that need computed or conditional values (e.g. `props={{ disabled: disabled || !hasValue }}`), and omit the top-level prop.
- **Naming**: PascalCase for components/types, camelCase for functions/variables
- **Async**: Use `fluture` (`FutureInstance`) for async operations, **not** Promises. Prefer Future-based signatures in interfaces that may involve I/O.
  - `.pipe()` accepts exactly **one** argument; chain multiple operators with successive `.pipe()` calls
  - Use `tapF` from `@repro/future-utils` to sequence a Future as a side-effect while passing the original value through (e.g. cache invalidation after a mutation). Never call a Future-returning function inside `map` — the Future will never be forked.
- **Error handling**: Use `serialize-error` for serialization
- **Shell scripts (Bash)**: Target **Bash 3.2** (the version shipped with macOS). Do not use Bash 4+ features such as `mapfile`/`readarray`, associative arrays (`declare -A`), or `${var,,}` case-conversion. Use `while IFS= read -r` loops to capture multi-line output into arrays.
- **NO COMMENTS**: Do not add code comments unless explicitly requested

## Conventions

- **Package naming**: `@repro/<name>` with workspace protocol (`workspace:*`)
- Always check existing imports/patterns before adding new dependencies
- **API list endpoints** must return `{ items: Array<T> }` envelope — never bare arrays. Use a generic `items` key (not resource-specific keys). A shared `ListResponse<T>` type exists in `packages/domain`. Existing endpoints currently return bare arrays and are pending uplift in REP-129; new endpoints must follow the envelope convention.

## Environment Variables

**Tilt + Helm is the single source of truth** for environment variable configuration in development. All services receive their env vars through Kubernetes pod environment variables, injected via Helm chart `values.yaml` defaults and Tiltfile `helm(set=[...])` overrides.

- **Canonical source**: `infra/apps/<service>/chart/values.yaml` defines defaults for each service. Tiltfiles apply overrides (e.g. URLs, API keys via `os.getenv()`).
- **Runtime validation**: Each app uses a `createEnv()` function with a Zod schema (`apps/<service>/src/config/createEnv.ts`) that validates `process.env` and provides fallback defaults. This is a safety net, not a configuration source.
- **No `.env` file loading**: No code path loads `.env` files at runtime. The `.env*` files in `apps/` are gitignored local artifacts copied by `reproctl wt create` for convenience — they are not authoritative.
- **Frontend apps**: Webpack `EnvironmentPlugin` / `templateParameters` read `process.env` at build time, set by Kubernetes env vars in the container.

### Adding a new environment variable

1. Add the variable to the Helm chart `values.yaml` for the service (`infra/apps/<service>/chart/values.yaml`).
2. If needed, add a Tiltfile `helm(set=[...])` override for local development.
3. Add the variable to the service's `createEnv()` Zod schema with an appropriate default.
4. Access the variable through the validated env object — never read `process.env` directly in application code.

## Linear as Source of Truth

- All project specifications, implementation plans, and tracked work live in **Linear** as the source of truth. Use Linear projects, milestones, and issues to organize deliverables.
- When the user wants to expand or change the scope of a project, ensure that the Linear issue is updated to reflect this.
- **Code reviews**: When reviewing a PR that references Linear issues (e.g. `REP-123` in the branch name, title, or body), always fetch those issues before completing the review. Check for requirements, resolved decisions, and open considerations documented in the issue — these take precedence over assumptions based on codebase patterns alone. Load the `git-workflow` skill for the full review checklist.

### Workspace structure

One team: **Repro** (key `REP`). All issues use the `REP-<number>` identifier.

**Initiatives** represent product-level goals that span multiple projects (e.g. Starter Edition, Pro Edition). Projects can be linked to one or more initiatives.

**Projects** group related issues into a deliverable scope. Current projects:

| Project | Purpose |
|---------|---------|
| Platform | Infrastructure, developer experience, CI/CD, reproctl |
| Engineering | Code style, conventions, tooling, technical hygiene |
| Design System | UI components, tokens, patterns for `@repro/design` |
| Accessibility | Reusable a11y helpers (`@repro/a11y`) |
| Recording & Playback | Session capture, playback engine, DevTools |
| Authentication | Auth flows, social login, passkeys |
| Agentic | Agentic debugging experience |
| Billing | Paid plans, subscriptions, entitlements (Paddle) |
| Marketing Website | Public-facing site |

**Milestones** are optional sub-goals within a project. Use them when a project has distinct phases or deliverables that benefit from sequencing.

**Labels** categorize issues by type:

| Label | When to use |
|-------|-------------|
| Bug | Broken behavior that needs fixing |
| Feature | New user-facing functionality |
| Improvement | Enhancement to existing functionality |
| Tech Debt | Internal quality, refactoring, cleanup |

**Cycles** are not currently used.

### Agent guidance

- **Filing issues**: Choose the project that best fits the work. Use `Platform` for reproctl, infra, and DX. Use `Engineering` for cross-cutting code quality and conventions. Use the product-area project for product features.
- **Labels**: Apply exactly one type label (Bug, Feature, Improvement, or Tech Debt) per issue.
- **Milestones**: Only create milestones when a project has 3+ issues that form a natural phase. Don't create milestones for one-off issues.
- **Priority**: Set priority on every issue. 1 = Urgent, 2 = High, 3 = Normal, 4 = Low.
- **Issue status lifecycle**: See the `git-workflow` skill for the full status lifecycle and transition rules.

## Learning from Corrections

When the user corrects a code choice, style issue, or any fundamental rule about how the project should be developed, built, run, tested, or deployed, offer to update the relevant skill file in `.opencode/skills/` (or a package-level `AGENTS.md` closer to the relevant code) with the new information so the lesson is retained for future sessions.
