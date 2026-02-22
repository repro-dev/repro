# Code Style

- **Prettier**: `semi: false`, `singleQuote: true`, `arrowParens: avoid`, `trailingComma: es5`
- **Imports**: Use `prettier-plugin-organize-imports` (auto-sorts imports)
- **Types**: Strict TypeScript with `noUncheckedIndexedAccess`, `noUnusedLocals`, `noImplicitReturns`
- **Paths**: Use `~/*` alias for local imports within packages
- **React**: Functional components with hooks, use `@jsxstyle/react` for styling
- **Naming**: PascalCase for components/types, camelCase for functions/variables
- **Async**: Use `fluture` (`FutureInstance`) for async operations, **not** Promises. Prefer Future-based signatures in interfaces that may involve I/O.
  - `.pipe()` accepts exactly **one** argument; chain multiple operators with successive `.pipe()` calls
  - Use `tapF` from `@repro/future-utils` to sequence a Future as a side-effect while passing the original value through (e.g. cache invalidation after a mutation). Never call a Future-returning function inside `map` — the Future will never be forked.
- **Error handling**: Use `serialize-error` for serialization
- **NO COMMENTS**: Do not add code comments unless explicitly requested
