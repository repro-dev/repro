---
name: ui-verification
description: Practical post-change UI verification workflow — use after non-trivial UI changes to run a worktree-local `reproctl start --wait` + `agent-browser` loop, validate behavior, interactions, accessibility, and evidence capture.
---

# UI Verification

Use this skill after you have changed a UI surface and need to confirm it behaves correctly in the browser.

## When to load this skill

Load `ui-verification` when the task is to validate a recent UI change, especially after:

- new or revised screens, routes, modals, drawers, forms, or panels
- interaction changes, async flows, or state transitions
- responsive/layout changes that affect visible behavior
- accessibility, focus, keyboard, or form handling changes
- loading, empty, error, or success state updates
- design-system or token changes that need real-browser confirmation

Use `reproctl start --wait` to bring up the worktree-local app under test. Use `reproctl launch` only for one-off human preview; it opens the system browser and is not the standard `agent-browser` entrypoint.

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

## Practical verification loop

1. Start the worktree-local app under test.
   ```bash
   reproctl start --wait <service>
   ```
2. Open the changed surface in `agent-browser` using the worktree-local URL.
   ```bash
   agent-browser open <url>
   ```
3. Snapshot the initial state before interacting.
4. Exercise relevant interaction states:
   - hover, focus, active, disabled, loading
   - empty, error, success, and retry states
   - keyboard-only navigation, tab order, escape/close behavior
5. Re-snapshot after each meaningful navigation or state change.
6. Capture evidence when the behavior is confirmed.
   ```bash
   agent-browser screenshot tmp/ui-verification/<issue-or-surface>/after/<scenario>.png
   ```
7. Close the browser session when done.

If the surface is reusable, verify it in the smallest realistic host and once in a real consuming screen.

## Evidence and screenshots

Store any screenshots, recordings, notes, or copied logs under `tmp/` at the repo root.

Suggested layout:

- `tmp/ui-verification/<issue-or-surface>/`
- `tmp/ui-verification/<issue-or-surface>/before/`
- `tmp/ui-verification/<issue-or-surface>/after/`
- `tmp/ui-verification/<issue-or-surface>/notes.md`

Keep filenames descriptive and short. Include the scenario name, browser target, and date if helpful. Keep throwaway browser artifacts inside this tree so routine verification stays easy to clean up.

## When to load `harden`

If verification reveals brittle async behavior, teardown problems, race conditions, missing loading/error boundaries, or other resilience gaps, switch to `harden` for the repair work.

## ui-verification vs. audit-ui-quality

- `ui-verification` = routine post-change validation of a specific changed surface using `reproctl start --wait` + `agent-browser`
- `audit-ui-quality` = broader audit, polish, scoring, and reporting pass across scoped UI surfaces
