# Surface Scoping

Use this reference to decide whether a rule is universal, surface-specific, or out of scope.

## Approved Scope Labels

- `marketing/editorial web` — public site, landing pages, content-led surfaces
- `product/app UI` — authenticated app screens, tools, settings, workflows
- `mobile-first or touch-heavy` — gestures, compact layouts, touch targets, native-like behavior
- `platform-adaptive or native-like` — platform-specific shells, device-aware affordances, app wrappers
- `cross-surface` — genuinely shared guidance that applies across all of the above

## Usage Notes

- Prefer the narrowest label that still captures the rule accurately.
- Mark a rule `cross-surface` only when the guidance is truly invariant across surfaces.
- When a rule needs qualifiers, keep them short and explicit instead of adding a long exception list.
- If a rule does not match the reviewed surface, treat it as non-applicable rather than contradictory.
- Write out-of-scope notes in one sentence: name the surface, then state the boundary.

## Reviewer Heuristic

- First ask: “Which surface am I on?”
- Then ask: “Does this rule declare that surface, or is it broader?”
- If the scope does not match, do not block on that rule.
