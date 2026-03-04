# Code Style

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
