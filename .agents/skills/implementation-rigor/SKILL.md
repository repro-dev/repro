---
name: implementation-rigor
description: Red/green/refactor discipline, verification expectations, and compact QC records for delivery work. Load when implementing or testing changes.
---

# Implementation Rigor

Use this skill for the mechanics of making a change correct and verifiable.

## Red / green / refactor

For each requirement:

1. Write a failing test that captures the behaviour.
2. Run it and confirm the failure is the expected one.
3. Make the smallest implementation that passes.
4. Run the test again and confirm it passes.
5. Refactor while keeping the test green.
6. Run the related test set before moving on.

## Verification

- Run targeted tests for the changed area first, preferring `moon run repro/<package>:test`.
- Run affected-package typechecks before committing with `moon run repro/<package>:typecheck`.
- Run package-scoped formatting before finishing. Use a Moon format target when one exists; otherwise run the package-local formatter from the affected package.
- Use the standard direct test runner only when a package does not define a usable Moon target: `pnpm --dir "<package-dir>" exec tsx --experimental-test-module-mocks --test path/to/file.test.ts`.

## When tests are required

- New behaviour gets a regression test.
- Bug fixes get a regression test that reproduces the bug.
- Public contract changes get coverage for the new contract.
- Docs-only or pure comment changes can skip tests.

## Compact QC registry

For larger work, keep a tiny running record:

| Item | Keep |
| --- | --- |
| Requirement | What is being satisfied |
| Test file | Where it is covered |
| Verification | Pass / fail / rerun notes |
| Risk | Any unresolved edge case |

This record should stay short and only track what helps the next verification step.
