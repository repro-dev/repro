# Eval Scenarios — pen-reconcile (REP-1628)

Three eval scenarios proving the agent finds the *right subset* of design
deltas for a given issue context without explicit scope input. Each scenario
lists the issue context, the fixture deltas, and the expected agent behavior.

## Scenario 1 — In-vocabulary only

**Issue context:** "Update the signup CTA button on the signup screen to be a
success-context, large, 'Create account' button."

**Expected Detect:** the `r-cta` instance on screen `s-signup` (content)
resolves with in-vocabulary overrides:
`{ children: 'Create account', context: 'success', size: 'large' }`.

**Expected Apply:** zero LLM involvement. The agent translates via the closed
override vocabulary and patches `Button.tsx` (the CTA usage) to
`<Button context="success" size="large">Create account</Button>`. No guesswork,
no pen re-parsing.

## Scenario 2 — Out-of-vocabulary

**Issue context:** "The legacy CTA button on the signup screen has a magenta
fill; wire it up."

**Expected Detect:** `r-legacy` on screen `s-signup` reports the warning
`Button: unmapped override "fill"="#FF00FF"`. `#FF00FF` is **not** a `$color-*`
token in the v1 vocabulary, so no `context` prop can be derived.

**Expected Apply:** the agent surfaces the violation candidate for judgment
(never guesses a prop). If no mapping exists, the instance is added to the
explicit deferred list with the candidate, and the diff does not touch it.

## Scenario 3 — Scoped relevance

**Issue context:** "Fix the empty-state copy on the signup **content** screen
only."

**Expected Detect:** candidates from both screens in the
`screens/eval-fixture/signup` family are inventoried: `r-cta`, `r-legacy`
(content), and `r-loading` (loading).

**Expected Judge:** the issue names the content screen only. The agent applies
content-screen deltas in scope and **explicitly defers** `r-loading` (loading
state) and any unrelated deltas, listing them in the output. Deferred items are
never silently dropped or swept into the diff.

**Pass criteria:** the reviewable diff contains only the content-screen change;
the deferred list names `r-loading` (and any other out-of-scope delta); the
applied manifest records only the applied screens.
