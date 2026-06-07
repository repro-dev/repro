---
name: testing-workflow
description: Repo-specific testing workflow — moon-first verification, harness selection, jsdom conventions, mock shapes, observer payload wrappers, and test triage guidance.
---

# Testing Workflow

Use this skill when you need repo-specific guidance for writing, debugging, or verifying tests beyond a one-line command lookup.

## 1. Pick the narrowest reliable command

- Prefer `moon run repro/<package>:test` for package tests.
- Prefer `moon run repro/<package>:typecheck` for package typechecks.
- Use broader Moon selectors only when you intentionally want cross-package verification.
- Use direct `tsx` or `pnpm exec` commands only when the package has no usable Moon target and you have confirmed the package-local invocation.

## 2. Reuse the existing harness

- Start from the package's existing test files and scripts before inventing a new runner shape.
- Match package-local imports and flags such as `global-jsdom/register` instead of assuming a generic runner is sufficient.
- When a package already has helpers or fixtures, extend them instead of creating a parallel setup.

## 3. Common repo-specific test patterns

### jsdom and browser-like tests

- Browser-like tests often need the same imports and event helpers as existing tests in that package.
- Transition and animation behavior usually needs explicit lifecycle events rather than waiting for jsdom to simulate them implicitly.
- If a package's Moon `test` target already wires the right environment, prefer it over reconstructing the command by hand.
- Drag-and-drop testing: jsdom does NOT implement `DataTransfer` or `DragEvent`. Use `fireEvent.drop(element, { dataTransfer: { files: [file], items: [], types: ['Files'] } })` from `@testing-library/react` to simulate file drops. This bypasses the missing `DataTransfer` constructor by passing the mock through `fireEvent`'s event properties map.

### Mock and module shape conventions

- Some modules require fuller mocks than their surface suggests. Mirror the shape used by nearby tests before trimming.
- When a mock repeatedly needs the same fields or defaults, factor that into a shared helper rather than re-deriving it test-by-test.

### Testing modules with module-level side effects

Modules with module-level code (agent subscriptions, worker initialization, etc.) require special handling:

- Use `mock.module()` with the `--experimental-test-module-mocks` flag to replace imported dependencies before the target module loads. Call `mock.module(...)` before `await import('./targetModule')`.
- ESM caches modules by resolved URL — each test process can only mock a module once. If you need multiple test cases, consolidate all assertions into a single `it()` block after one `import()` call, or use separate test files.
- For `mock.fn()` created mocks, call arguments are typed as `[]` by default. Use type assertions (`c.arguments as unknown as unknown[]`) when accessing arguments by index.
- When mocks need to return `FutureInstance` values, use `resolve(val)` or `reject(err)` from fluture rather than plain values.

### Wrapped payloads and snapshots

- Do not assume observer or recording payloads are plain objects. Check existing tests for wrapper types such as `Box` and use the same access pattern.
- When snapshot or payload access looks awkward, prefer a helper or existing unwrap utility instead of ad hoc property spelunking.

### Shared fixtures

- Be careful when reusing fixtures across projects or packages. Shared recording fixtures can embed assumptions that collide when the consuming project differs.
- If a fixture behaves differently across contexts, keep the divergence explicit in the test rather than hiding it in unrelated setup.

## 4. Interpreting failures

- Separate harness/setup failures from product regressions before editing code.
- If a broad typecheck or test run fails in unrelated areas, rerun the narrow package-scoped command first and record the unrelated failure as external noise.
- For DB-backed or infra-backed tests, distinguish a concrete product failure from an environment constraint before changing application code.

## 5. When to add helpers vs docs

- Add docs when the pattern is stable but local to one package or harness.
- Add shared helpers when the same awkward setup or unwrap logic is repeated across multiple tests.
- Do both when the pattern is subtle enough that code reuse alone will not make the intent obvious.
