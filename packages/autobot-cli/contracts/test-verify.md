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

## Responsibilities
- Read the implementation diff, the `run-plan.md`.
- execute the focused tests, smoke tests, and typechecks.
- Record evidence; do not edit source files.
- Do not edit source files.
- Write the smoke-test and typecheck evidence.
- Call out missing scripts, harness gaps, or blocked verification explicitly.

## Output
- `smoke-test-result.md`
- typecheck evidence
- concise pass/fail summary
