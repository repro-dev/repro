---
name: ui-verification
description: Practical post-change UI verification workflow — use after non-trivial UI changes to validate behavior, interactions, accessibility, lightweight visual quality, evidence capture, and authenticated browser sessions.
---

# UI Verification

Use this skill after you have changed a UI surface and need to confirm it behaves correctly and still reads well in the browser. It is for validating implemented UI, not for shaping direction or running a broad audit.

**Extension escape hatch:** if the changed surface is a browser extension, stop here and load `extension-verification` instead.

For the current agent-browser command reference and skill content, load the CLI-served core skill with `agent-browser skills get core --full`.

If the surface is behind login or otherwise requires a signed-in user, use `agent-browser auth` as the standard authenticated path instead of ad hoc manual login steps.

## When to load this skill

Load `ui-verification` when the task is to validate a recent UI change, especially after:

- new or revised screens, routes, modals, drawers, forms, or panels
- interaction changes, async flows, or state transitions
- responsive/layout changes that affect visible behavior
- accessibility, focus, keyboard, or form handling changes
- loading, empty, error, or success state updates
- lightweight visual checks for hierarchy, prominence, and responsive clarity
- design-system or token changes that need real-browser confirmation

For normal app pages, bring up the worktree-local app under test with `reproctl start --wait --full-stack <service>`, then verify it with `agent-browser`.

Use `reproctl launch` only for one-off human preview; it opens the system browser and is not the standard `agent-browser` entrypoint.

Do **not** use this skill as the default audit/polish workflow — **except** when executing the REP-1646 audit gate from `delivery-workflow` §5, which mandates the rubric below.

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
   reproctl start --wait --full-stack <service>
   ```
2. If the surface is protected, authenticate first with `agent-browser auth login <profile>`.
3. Open the changed surface in `agent-browser` using the worktree-local URL.
   ```bash
   agent-browser open <url>
   ```
4. Snapshot the initial state before interacting.
5. Exercise relevant interaction states:
   - hover, focus, active, disabled, loading
   - empty, error, success, and retry states
   - keyboard-only navigation, tab order, escape/close behavior
6. Run a lightweight visual-quality pass in the browser:
   - is the primary action visually obvious?
   - does the dominant element stay dominant on desktop and mobile?
   - does hierarchy survive responsive changes?
   - do empty/loading/error/success states still feel visually coherent?
7. Re-snapshot after each meaningful navigation, state change, or viewport resize.
8. Capture evidence when the behavior is confirmed.
   ```bash
   agent-browser screenshot tmp/ui-verification/<issue-or-surface>/after/<scenario>.png
   ```
9. Close the browser session when done.

Keep the evidence bundle under `tmp/ui-verification/<issue-or-surface>/` and include a short `notes.md` or equivalent note file that records the viewport, the UI state, and the interaction path for each captured scenario.

If the surface is reusable, verify it in the smallest realistic host and once in a real consuming screen. For targeted design edits, make sure the captured evidence corresponds to the block's requested before/after states rather than a generic happy path.

## Authenticated sessions

Use the built-in `agent-browser auth` vault for any reusable login state:

- store credentials locally in a named profile with `agent-browser auth save <profile>`
- reuse them with `agent-browser auth login <profile>`
- inspect saved profiles with `agent-browser auth list` and `agent-browser auth show`
- remove an outdated profile with `agent-browser auth delete`; to rotate credentials, delete the old profile and save it again with the updated login details

The auth vault is machine-local, encrypted, and keeps secrets out of LLM context. Prefer a named profile per app/account role, and keep any browser session artifacts worktree-scoped so parallel runs do not share hidden state.

If you need to persist transient browser state for a verification run, write it under `tmp/ui-verification/<issue-or-surface>/auth/` and treat it as disposable secret material. Delete it after the run unless a follow-up note says otherwise.

Use authenticated verification whenever the changed surface cannot be exercised anonymously, when you need state that survives a page reload, or when a login-gated flow is part of the behavior under test. Always pair that flow with `reproctl start --wait --full-stack <service>` so the signed-in session is verified against worktree-local backend state.

## Evidence and screenshots

Store any screenshots, recordings, notes, or copied logs under `tmp/` at the repo root.

Suggested layout:

- `tmp/ui-verification/<issue-or-surface>/`
- `tmp/ui-verification/<issue-or-surface>/before/`
- `tmp/ui-verification/<issue-or-surface>/after/`
- `tmp/ui-verification/<issue-or-surface>/notes.md`

Keep filenames descriptive and short. Include the scenario name, browser target, and date if helpful. Keep throwaway browser artifacts inside this tree so routine verification stays easy to clean up. Use scenario names like `desktop-primary-action`, `mobile-hierarchy`, or `empty-state-contrast` rather than introducing a new directory structure.

## REP-1646 five-pillar audit rubric

The REP-1646 audit gate (`delivery-workflow` §5) mandates a five-pillar analysis of captured browser evidence. Scope rule: affected surfaces + reachable states only — never a full-app sweep. The pillars, applied to what the screenshots actually show:

- **Visual quality** — layout, alignment, spacing, type hierarchy, contrast, polish.
- **Semantic correctness** — labels/icons/states mean the right thing; data plausibility; state logic.
- **Information architecture** — nav structure/grouping/naming, hierarchy, prominence.
- **Correctness** — right content for the right state; no placeholder data rendered as live state.
- **Consistency** — matches sibling surfaces and the design system (components, header/nav patterns).

Findings are evidence-based (each cites a captured screenshot) and severity-tagged.

### Severity calibration (P0/P1/P2)

| Severity | Meaning                                                                       | Calibration examples (2026-09-02 audit)                                                                                             |
| -------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **P0**   | Task-breaking: the flow cannot complete, or the surface self-contradicts      | Blank unmatched route (missing 404 — REP-1636)                                                                                      |
| **P1**   | Major: repeated overlap/clipping, mislabeled state, IA collision              | Member-table role controls overprinting names (**P1 visual**); "Active" pills stamped on pricing "Not included" rows (**P1 semantics**) |
| **P2**   | Minor polish                                                                  | —                                                                                                                                   |

### Capture manifest format

Every audit run writes `tmp/ui-verification/<issue-id>/manifest.json` with this fixed schema and field order (comparability between consecutive deliveries):

```json
{
  "issue": "REP-xxx",
  "generatedAt": "<ISO-8601>",
  "base": "<ref>",
  "agentBrowserVersion": "<x.y.z>",
  "canary": "pass",
  "surfaces": [
    {
      "surface": "<name>",
      "url": "<worktree-local-url>",
      "viewport": "<WxH>",
      "states": [
        {
          "state": "<state-name>",
          "screenshot": "<path>",
          "interactionNotes": "<what was exercised>"
        }
      ]
    }
  ]
}
```

The `state` value is a state name. The standard state family is `affected`, `loading`, `empty`, and `error` — capture those wherever a surface has them. A surface may have other named states worth capturing (e.g. `hover`, `filtered`, `modal-open`); record them under their own name.

Alongside it, `tmp/ui-verification/<issue-id>/audit.md` records the analysis: one row per finding with columns `pillar | severity | evidence screenshot | description | disposition`. The disposition is one of `fixed <commit>`, `filed REP-xxx`, or `none`. Rule: every finding row must carry a disposition — none dropped. An explicit "no findings" row is valid when the audit passes clean — exactly: `| none | none | none | no findings | none |`.

### Known-artifact ignore list

Do not log these as findings:

- white print-to-PDF letter margins (print rendition, not the live surface)
- print-rendition font differences vs live recapture
- duplicate captures of the same surface — dedupe before scoring (2026-09-02 audit caveats)
- REP-1635-class tooling failures (agent-browser input loss): a canary failure is a toolchain problem — stop and fix the tool; never log it as a product finding

### Browser input canary (REP-1635)

agent-browser 0.33.1 silently delivered zero CDP input events — every `click`, `press`, and raw mouse command reported `✓ Done` while dispatching nothing to the page. The audit gate requires real input events, so run this canary before any interaction in an audit pass. REP-1635 (the canary tool) is Backlog — this is the manual recipe until the tool ships:

1. Record the version: `agent-browser --version` goes into the manifest's `agentBrowserVersion` field. Warn when `brew outdated agent-browser` lists it.
2. Install capture-phase listeners via `eval`:
   ```js
   ;['mousedown', 'mouseup', 'click', 'keydown'].forEach(type =>
     window.addEventListener(
       type,
       event => {
         ;(window.__inputCanary ||= []).push(type)
       },
       true
     )
   )
   ```
3. Issue one `click` and one `press` through agent-browser (the real CDP input path).
4. Assert both events arrived: `eval` `window.__inputCanary` and confirm it contains `mousedown`, `mouseup`, `click` (from the click) and `keydown` (from the press).

On canary failure, abort the run with: **"agent-browser input delivery is broken — check version (`brew outdated agent-browser`)"**. The failure signature is "✓ Done with zero events delivered" — commands succeed while the page receives nothing. Upgrading fixed the 0.33.1 incident (0.36.0 delivers events correctly; `brew upgrade agent-browser`).

Eval-driven interaction (`el.click()`, `form.requestSubmit()`, native-setter fill) is **diagnostic-only** — use it to isolate delivery bugs from app bugs, never as a sanctioned workaround. The intended CDP interaction path must work; if the canary fails, fix the toolchain first.

### Audit findings feed /impeccable critique

Audit findings and their evidence feed `/impeccable critique` snapshots so the score-trend history accumulates across deliveries. Commit the critique snapshots per the design-system conventions so later deliveries can compare against a named baseline.

## When to load `harden`

If verification reveals brittle async behavior, teardown problems, race conditions, missing loading/error boundaries, or other resilience gaps, switch to `harden` for the repair work.

## ui-verification vs. extension-verification

- `design-system` = implementation of the captured direction
- `ui-verification` = routine post-change validation of a specific changed surface using `reproctl start --wait --full-stack` + `agent-browser`, including authenticated runs when needed, plus a lightweight browser check that intended hierarchy and visual cues still survive; store browser evidence and notes under `tmp/ui-verification/<issue-or-surface>/`. It also owns the REP-1646 five-pillar audit rubric that the `delivery-workflow` §5 audit gate mandates for UI-touching deliveries
- `extension-verification` = browser-extension verification workflow with `agent-browser`, isolated profiles, and `tmp/extension-verification/...` artifacts
