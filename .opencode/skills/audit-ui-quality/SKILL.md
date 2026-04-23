---
name: audit-ui-quality
description: Systematic UI quality audit workflow — Scope, Scan, Score, Report, Suggest. Load for audits, design-system compliance checks, authored-vs-generic UI review, scoring, and polish passes, not routine post-change verification.
---

# Audit

A repeatable, exhaustive workflow for UI quality review. Consolidates checks from `design-system`, `git-workflow`, and `harden` into a single entry point, and adds judgment for whether the UI feels intentionally authored versus generic.

## When to load this skill

Load when the task involves any of:

- "Audit the UI / design system compliance"
- "Review UI quality"
- "Check for accessibility issues"
- "Find token violations"
- "Score the UI"
- "Polish pass on [feature]"
- "Does this UI feel generic or authored?"

Do **not** use this as the routine verification entrypoint for a recently changed surface. If you need to confirm that a specific UI change behaves correctly, load `ui-verification` and follow the `reproctl start --wait` + `agent-browser` workflow instead. Keep audit judgment separate from browser validation. When you need a compact readiness summary after the full audit, cite `design-system/pre-delivery-ui-checklist.md` rather than repeating the audit logic in a second pass.

This skill assumes UI direction is already set and there is implementation to review. If the direction is still ambiguous, load `design-direction` first.

---

## Workflow: Five Phases

### Phase 1 — Scope

Before scanning anything:

1. **Identify the surfaces** to audit: list specific file paths or component names.
2. **Classify each surface**:
   - Surface type: `marketing/editorial web`, `product/app UI`, `mobile-first or touch-heavy`, `platform-adaptive or native-like`, or `cross-surface`.
   - **New** — high bar; all eight dimensions must pass before shipping.
   - **Existing** — pragmatic bar; fix Critical and Major, note Minor for next iteration.
   - **Legacy** — document only; do not rewrite unless the issue is a Critical a11y or interaction break.
3. **Time-box**: set a maximum number of files per run (suggested: 5–10) to avoid scope creep. Audit in batches if the surface is large.

### Phase 2 — Scan

Work through all eight compliance dimensions for each scoped file, then make one authored-quality pass. Log every finding with file path, line number, lens, and a one-line description.

**Do not fix during this phase — report only.**

#### Authored-quality pass

After the compliance scan, ask whether the UI feels intentionally authored or like a default/generic composition. Use these as judgment prompts, not blanket bans. When the answer turns on surface hierarchy, composition, spacing rhythm, readable type, forms/editing behavior, blocked error recovery, or mobile/app-surface behavior, cross-check `design-system/palette-surface-spacing.md`, `design-system/typography-readability.md`, `design-system/forms-input-interference.md`, `design-system/error-recovery-containment.md`, and `design-system/mobile-touch-app-surface.md` so the critique uses the same named failure modes everywhere:

- Is the aesthetic direction clear, specific, and coherent?
- Does the composition establish a strong focal point and visual dominance where needed?
- Does the eye flow feel deliberate, or is it flat and evenly distributed by default?
- Is the hierarchy strong enough to support the task, or does everything read at the same weight?
- Does spacing support rhythm and hierarchy, or does it feel mechanically even?
- Does the surface show AI-convergent or generic tells (stock layout, default-looking grouping, rote spacing, placeholder-feeling composition)?
- Does the screen feel authored, or merely assembled from compliant parts?

If a surface feels generic, explain why and what visual change would make it feel more authored. When possible, name the pattern using the shared guardrail catalogs in `design-system/anti-patterns.md`, `design-system/palette-surface-spacing.md`, `design-system/interaction-responsive.md`, `design-system/error-recovery-containment.md`, `design-system/typography-readability.md`, and `design-system/mobile-touch-app-surface.md` so downstream design, implementation, and audit work can reuse the same label. Treat those names as critique signals, not automatic violations.

#### Scan Dimensions

1. **Token compliance** — hardcoded hex/px/rem values in JSX props. Every visual value must use a token from `@repro/design` (`color.*`, `spacing.*`, `radius.*`, `textStyles.*`, etc.). Flag ad hoc `fontSize` / `fontWeight` / `lineHeight` when they replace `textStyles.*` instead of supporting a constrained internal exception.

2. **Component substitution** — hand-rolled controls that `@repro/design` already covers. Check for: custom buttons, inputs, toggles, modals, drawers, tooltips, spinners, error/loading states, avatars, cards.

3. **Layout primitives** — `<div style={{ display: 'flex' }}>` or equivalent raw flex/grid divs instead of jsxstyle `Row` / `Col` / `Grid`. Inline `style={{}}` props are also a violation.

4. **Interaction states** — missing hover / focus / active / disabled / loading / error / empty states. Every interactive element needs at minimum a focus ring (`focusRing()` from `@repro/design`) and a disabled state. For feedback timing, hover/touch, modal/reflex cues, and mobile/app-surface behavior, cross-reference `design-system/interaction-responsive.md` and `design-system/mobile-touch-app-surface.md`.

5. **Accessibility** — missing `aria-*` attributes, no keyboard navigation, no focus management in modals/overlays, missing `alt` text, missing semantic HTML (`role`, `aria-live` for dynamic regions).

6. **Microcopy** — placeholder-quality copy, missing error context, non-actionable empty states, passive voice, jargon. Apply the three-part error formula: _[What failed] + [Why it likely failed] + [What to do next]_.

7. **Type safety** — `any` usages, unchecked indexing without null-guards (`noUncheckedIndexedAccess`), implicit returns in functions that should always return a value.

8. **Resilience** — unhandled async errors, missing loading/error boundaries, unclean teardown (event listeners, subscriptions, pending futures not cancelled on unmount). **Cross-reference**: load the `harden` skill for the full resilience checklist. Do not duplicate its content here.

### Phase 3 — Score

Rate each scoped file on a **1–5 scale** per compliance dimension (5 = fully compliant, 1 = critical violations).

Produce a summary table:

| File | Tokens | Components | Layout | States | A11y | Copy | Types | Resilience | Total | Authored quality note |
| ---- | ------ | ---------- | ------ | ------ | ---- | ---- | ----- | ---------- | ----- | --------------------- |
| ...  | 1–5    | 1–5        | 1–5    | 1–5    | 1–5  | 1–5  | 1–5   | 1–5        | /40   | short verdict / note  |

Maximum total: **40** (8 dimensions × 5).

### Phase 4 — Report

Organise findings by severity:

1. **Critical** — breaks interaction or accessibility on the reviewed surface (e.g. keyboard trap, missing focus management, unhandled crash path, double-submit causing duplicate side effects).
2. **Major** — design system violation on a matching surface that ships visible inconsistency (e.g. hardcoded colour, cramped vertical spacing, inconsistent gap progression, collapsed line-height, weak text hierarchy, missing loading state, hand-rolled component, hover-only control on touch-heavy UI, paste trap, caret jump, hostile formatter).
3. **Minor** — copy/polish issue that doesn't affect functionality and may be acceptable off-surface (e.g. passive voice, placeholder copy, missing empty-state CTA).

For each finding, include:

- **File path + line number**
- **Dimension** (from the eight above)
- **Lens**: either **Compliance/Correctness** or **Visual Direction / Authored Quality**
- **Description** (one sentence: what is wrong)
- **Fix hint** (one sentence: what to do)

When the issue is spacing or typography, call out the design-system rule it violates: spacing should preserve rhythm, and semantic text should usually use `textStyles.*` rather than hand-tuned raw typography tokens. If the finding is specifically about readability, name the matching anti-pattern from `typography-readability.md` when it fits (flat type hierarchy, tiny body text, all-caps body text, wide letter-spacing on body text, or one font treatment everywhere). For composition/surface findings, prefer the named anti-patterns from `design-system/palette-surface-spacing.md` (for example nested cards, everything centered, monotonous spacing, and gray-on-color washout) over vague “looks generic” language. When the issue is feedback, responsiveness, or modality, name the matching interaction anti-pattern from `interaction-responsive.md` when one fits. When the issue is paste blocking, caret jumps, hostile formatting, or wizard-state loss, use the named patterns from `forms-input-interference.md` so the report can say exactly what the editing surface is doing wrong. When the issue is blocked error recovery, use the named patterns from `error-recovery-containment.md` so the report can say exactly what the surface is failing to contain.

If a rule is declared for a different surface, note it as out of scope instead of blocking unless the reviewed surface matches that scope.

Hierarchy and composition problems can still be **Major** even when the tokens, components, and layout primitives are technically compliant.

Treat AI-convergent or generic-looking patterns as critique signals, not blanket violations. Always explain why the surface feels generic and what specific visual change would improve authorship; if typography is the driver, use the shared readability vocabulary rather than vague labels like “better hierarchy.”

**Do not fix during the audit phase.** Mixing audit and fix produces an incomplete report.

### Phase 5 — Suggest

Recommend the next action based on the aggregate score across all scoped files:

| Score band     | Recommendation                                                                                |
| -------------- | --------------------------------------------------------------------------------------------- |
| **≥ 35 / 40**  | Ship as-is. Note Minor issues in a follow-up issue for the next polish pass.                  |
| **25–34 / 40** | Fix all Critical and Major findings before shipping. Minor findings can go to next iteration. |
| **< 25 / 40**  | Load the `design-system` skill and run the full Normalisation Workflow before shipping.       |

If compliance is strong but authored-quality concerns remain, call those out separately instead of burying them inside the numeric total.

When you write the final recommendation, treat `pre-delivery-ui-checklist.md` as the handoff summary: cite the checklist to show the surface is ready or why it still needs a shipping pass, but do not restate every scanned dimension or duplicate the browser-verification workflow. If the main risk is forms or editing friction, point the reader at `design-system/forms-input-interference.md` so the handoff keeps the shared vocabulary for paste handling, caret safety, and draft persistence. If the issue is a generic or blocked error surface, use the recovery vocabulary from `design-system/error-recovery-containment.md` so the report names the blast radius, retry path, and fallback gap explicitly.

---

## Suggested Commands

```bash
# Type-check the audited package
moon run repro/<package>:typecheck

# Run tests
moon run repro/<package>:test

# After fixes: load harden skill for resilience hardening
# (see REP-853)
```

---

## Do / Don't

| Do                                                          | Don't                                         |
| ----------------------------------------------------------- | --------------------------------------------- |
| Time-box the audit to avoid infinite scope                  | Audit the entire codebase in one pass         |
| Report findings before fixing                               | Fix-as-you-go during audit (loses the report) |
| Classify surfaces (new / existing / legacy) before scanning | Apply the same bar to all surfaces            |
| Cross-reference `harden` skill for resilience               | Duplicate resilience checks in this skill     |
| Treat generic-looking patterns as critique prompts          | Turn them into blanket bans or hard rules     |
