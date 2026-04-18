---
name: ui-verification
description: Practical post-change UI verification workflow — use after non-trivial UI changes to validate behavior, interactions, accessibility, and evidence capture. Load when checking a changed surface in-browser, via Storybook, or with screenshots and console/network inspection.
---

# UI Verification

Use this skill after you have changed a UI surface and need to confirm it behaves correctly.

## When to load this skill

Load `ui-verification` when the task is to validate a recent UI change, especially after:

- new or revised screens, routes, modals, drawers, forms, or panels
- interaction changes, async flows, or state transitions
- responsive/layout changes that affect visible behavior
- accessibility, focus, keyboard, or form handling changes
- loading, empty, error, or success state updates
- design-system or token changes that need real-browser confirmation

Do **not** use this skill as the default audit/polish workflow. If you need a broad audit, scoring pass, or design-system compliance review, load `audit-ui-quality` instead.

## What counts as non-trivial UI work

Treat a change as non-trivial if it affects user-visible behavior, not just implementation details.

Examples:

- a new component or component variant
- any form with validation, submission, or disabled/loading states
- any modal, drawer, popover, or keyboard-driven interaction
- any data-driven surface that can fail, refresh, or be empty
- any change that can alter focus order, a11y semantics, or network requests

Tiny copy tweaks or isolated token swaps are usually trivial unless they change behavior or state handling.

## Practical verification checklist

1. Open the changed surface in the browser or Storybook.
2. Confirm the happy path renders as expected.
3. Exercise relevant interaction states:
   - hover, focus, active, disabled, loading
   - empty, error, success, and retry states
   - keyboard-only navigation, tab order, escape/close behavior
4. Inspect the console for runtime errors or warnings.
5. Inspect the network panel for unexpected failures, retries, or payload issues.
6. If the surface is reusable, verify it in the smallest realistic host and once in a real consuming screen.

## Evidence and screenshots

Store any screenshots, recordings, notes, or copied logs under `tmp/` at the repo root.

Suggested layout:

- `tmp/ui-verification/<issue-or-surface>/`
- `tmp/ui-verification/<issue-or-surface>/before/`
- `tmp/ui-verification/<issue-or-surface>/after/`

Keep filenames descriptive and short. Include the scenario name, browser or Storybook target, and date if helpful.

## When to load `harden`

If verification reveals brittle async behavior, teardown problems, race conditions, missing loading/error boundaries, or other resilience gaps, switch to `harden` for the repair work.

## ui-verification vs. audit-ui-quality

- `ui-verification` = routine post-change validation of a specific changed surface
- `audit-ui-quality` = broader audit, polish, scoring, and reporting pass across scoped UI surfaces
