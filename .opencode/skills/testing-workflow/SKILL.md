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

### State-matrix render tests

Stateful surfaces (billing states, pagination states, health agreement, router catch-alls, detail-route resolution) get a **state-matrix render test**: one matrix with a **positive AND a negative assertion per state** — e.g. the free-plan state must render the plan name AND must NOT render the "Billing period" row, renewal date, or Cancel button.

Conventions (established by REP-1649):

- **Colocation**: add the matrix as a sibling `*.state-matrix.test.tsx` (e.g. `BillingSettingsRoute.state-matrix.test.tsx`), extend the surface's existing test file, or add a new colocated file when the matrix spans multiple components — whichever keeps the file under the ~400-line CI guardrail (`scripts/check-test-file-size.sh`; >500 lines is an error).
- **Fix-gating**: a state-logic fix ships only together with the matrix that fails without it. If a matrix test passes without any production change, that is fine (it documents current behavior); if a fix is included, the matrix must demonstrate the documented failure against the pre-fix behavior first (red → green).
- **Revert-verification**: for behavioral fixes, temporarily revert the one fixed file (`git checkout HEAD -- <file>` before the fix is committed, or `git checkout HEAD~1 -- <file>` after), re-run the matrix, and confirm the documented tests fail — then restore and re-run green. Record per-test results so the PR body can cite them.
- **Realistic fixtures**: live-state fixtures use realistic values (real-looking URLs like `https://vendors.paddle.com/subscription-portal/ps_3xk29f`, plausible ids like `acc_8f42c1e9`). Never present `example.com` or `"foo"`-class placeholders as live state.
- **Negative assertions must be behavioral, not vacuous**: assert the absence of specific UI (a row, a button, a route marker) or that a fetch did not fire — never assert on mock internals. When the surface needs module mocks, prefer mocking local app modules over `@repro/design` (never mock the design system in consumer tests — assert real DOM).
- Examples: `apps/workspace/src/routes/BillingSettingsRoute/BillingSettingsRoute.state-matrix.test.tsx` (4-state billing matrix), `apps/admin/src/routes/RecordingRoute/RecordingRoute.test.tsx` (detail-route resolution matrix), `apps/admin/src/components/HealthStatusAgreement.test.tsx` (chip ↔ page agreement).

## 4. Interpreting failures

- Separate harness/setup failures from product regressions before editing code.
- If a broad typecheck or test run fails in unrelated areas, rerun the narrow package-scoped command first and record the unrelated failure as external noise.
- For DB-backed or infra-backed tests, distinguish a concrete product failure from an environment constraint before changing application code.

### Mocking navigator.clipboard

`navigator.clipboard` is read-only in strict TypeScript. Use `Object.defineProperty` to mock it:

```ts
function setMockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    writable: true,
    configurable: true,
  })
}

// Usage in a test
const originalClipboard = navigator.clipboard
setMockClipboard((text: string) => {
  clipboardText = text
  return Promise.resolve()
})

// Restore after test
Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true })
```

Do NOT directly assign to `navigator.clipboard` — TypeScript strict mode rejects it as read-only, and TypeScript-compatible mocks require `Object.defineProperty`.

## 5. When to add helpers vs docs

- Add docs when the pattern is stable but local to one package or harness.
- Add shared helpers when the same awkward setup or unwrap logic is repeated across multiple tests.
- Do both when the pattern is subtle enough that code reuse alone will not make the intent obvious.
