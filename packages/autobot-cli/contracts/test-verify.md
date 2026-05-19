# Autobot phase contract — test-verify

## Load before work
- Load `build-and-test` and `testing-workflow` before running checks.
- `build-and-test`
- `testing-workflow`
- `implementation-rigor`

## Inputs
- implementation diff
- approved `run-plan.md`
- any prior smoke-test result
- `implementation-summary.md`

## Responsibilities
- Read the implementation diff, the `run-plan.md`.
- Determine affected packages from `git diff main...HEAD --name-only`.
- For each affected `apps/<name>` or `packages/<name>` path, run the package's focused test command.
- Prefer `moon run repro/<name>:test`; use package-local fallback only when no Moon target is usable.
- Treat a missing package test script as skipped, not failed.
- Run affected package typechecks when the package exposes a typecheck target.
- Execute the focused tests, smoke tests, and typechecks.
- Record evidence; do not edit source files.
- Do not edit source files.
- Write the smoke-test and typecheck evidence.
- Call out missing scripts, harness gaps, or blocked verification explicitly.
- For failures, record package name, failing test file when known, and condensed error output.
- Keep verification failure evidence separate from publishability; review decides whether a failure is caused by this change.

## Output
- `smoke-test-result.md`
- typecheck evidence
- concise pass/fail summary
