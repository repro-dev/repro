# Eval Fixture — pen-reconcile (REP-1628)

A minimal, self-contained scenario proving the **Detect / Judge relevance**
capability of the `pen-reconcile` skill in isolation: given a pen file with
known design deltas and an issue context, the agent must find the *relevant*
subset without explicit scope input.

## Purpose

The core capability to prove (per REP-1628 Design, locked): the build agent
is tasked with scrutinizing the pen file, finding synchronization gaps, and
judging which are relevant to the current issue. This fixture makes that
judgment observable:

- `test.pen` — a minimal pen file with a Button master, two screens in one
  state family, and **known deltas**:
  - `r-cta` (Eval: Signup content screen): in-vocabulary Button overrides
    (`fill` → `context`, `height` → `size`, Label content → `children`).
  - `r-legacy` (Eval: Signup content screen): **out-of-vocabulary** override
    (`fill: "#FF00FF"`), which must surface as a candidate, never be guessed.
  - `r-loading` (Eval: Signup Loading screen): a second in-vocabulary Button
    in the `loading` state of the same family.
- `Button.tsx` — the baseline component the Apply phase patches.
- `scenario.md` — three eval scenarios with expected agent behavior.

## Setup

```sh
# Regenerate the contract from the fixture (this is the Detect input):
pnpm run pen:contract -- --pen-file tmp/eval-fixture/test.pen
# or directly:
node_modules/.bin/tsx scripts/pen-contract.ts --pen-file tmp/eval-fixture/test.pen
```

The contract output is deterministic. Expected detection results:

- Screen `s-signup` (content) resolves Button → `{ children: 'Create account',
  context: 'success', size: 'large' }` for `r-cta`.
- Screen `s-signup` (content) reports `r-legacy` with warning
  `Button: unmapped override "fill"="#FF00FF"` — out-of-vocabulary, judged by
  the agent, never silently mapped.
- Screen `s-signup-loading` (loading) resolves Button →
  `{ children: 'Working...', context: 'neutral', size: 'small' }` for
  `r-loading`.
- `stateFamilies` = `screens/eval-fixture/signup` with `content` + `loading`.
- `clean: true`, `violations: []`.

## Scenarios

See `scenario.md` for the three eval scenarios (in-vocabulary only,
out-of-vocabulary, scoped relevance) and the expected agent output for each.

## How this fixture is consumed

1. The agent loads the `pen-reconcile` skill.
2. Detect: run the command above, parse the contract, build the candidate
   inventory (each delta with its source location).
3. Judge relevance: given an issue context (from `scenario.md`), decide which
   candidates belong to this delivery; out-of-scope candidates are deferred
   explicitly.
4. Apply in-vocabulary overrides to `Button.tsx` as a patch (never a
   regenerate); surface out-of-vocabulary candidates for judgment.
5. Record the applied screens in `tmp/pen-applied.json`.
