# Error Recovery & Containment

Use this companion when the UI needs to explain a failure, keep the rest of the surface usable, or offer a safe next step after something breaks.

## Recovery copy

Use the three-part formula:

**What failed** + **why it likely failed** + **what to do next**

- Be specific about the failed action or surface.
- Name the likely cause only when it helps the user act.
- End with a concrete retry, fallback, or support step.

## Containment

- Keep failures local: one broken widget should not block the whole page.
- Prefer partial render, read-only fallback, or cached content over a blank shell.
- Reserve full-page blockers for cases where the entire task truly cannot continue.
- Preserve unrelated navigation and surrounding UI whenever possible.

## Retry and fallback affordances

- Offer a clear retry action in place.
- Provide an alternate path when the primary action fails.
- Use safe fallback content that explains the loss of capability instead of hiding the surface.
- Keep the recovery action close to the error so users do not have to search for it.

## Named patterns

- **Localize the blast radius** — confine the failure to the smallest affected region.
- **Retry in place** — keep the recovery action beside the error.
- **Graceful fallback** — degrade to a usable read-only or cached state.
- **Fail closed, not blank** — show a controlled fallback instead of an empty shell.

## Anti-patterns

- **All-or-nothing shell** — one error hides unrelated content.
- **Generic blocker** — a full-page failure that says nothing about the failed action.
- **Dead-end error** — no retry, fallback, or escape route.
- **Blast-radius bleed** — the error spills into healthy parts of the UI.
