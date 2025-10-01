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
