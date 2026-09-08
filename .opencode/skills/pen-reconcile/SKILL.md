---
name: pen-reconcile
description: Agentic design-to-implementation apply step — consume the pen-contract handoff (REP-1622) to detect design deltas in repro.pen, judge which are relevant to the current issue, apply in-vocabulary overrides as component props, and record applied revisions. Load when implementing code from a pen design, or when an issue is design-touching (Pen label, `## Design (locked)` section, or design deltas in repro.pen).
---

# Pen Reconcile

Use this skill when implementation must consume design intent from `repro.pen` and apply it to code. It is the **agentic apply step** that consumes the deterministic detection layer (REP-1622). Load it via the standalone `/pen-reconcile` command or as part of `/build` for design-touching issues.

## 1. Overview — detection vs application

Two layers, split by determinism:

```
pen-contract (REP-1622)   deterministic detection ──► PenContract JSON (single truth)
pen-reconcile (this skill) agentic application      ──► correct, reviewable git diff
```

- **pen-contract is detection**: same input → byte-identical `PenContract` JSON. It never applies anything. The contract is the single truth for "what changed".
- **pen-reconcile is application**: the agent judges relevance. It translates in-vocabulary overrides via the closed vocabulary (zero LLM guesswork), and patches behavioral components. Its contract is a correct, reviewable diff — not byte-identical regeneration.
- The apply step **never re-parses `repro.pen`**. The contract carries per-screen resolved component identity, `presentationalOverrides`, `stateFamilies`, and violations + candidates. That is the sole input.

Design is necessarily **ahead** of implementation: the pen file may contain many design changes, only a subset relevant to the current issue. Detection of which subset is agentic — never a flag or CLI selector.

**Reverse direction (code → pen)**: token sync stays deterministic — the Rosetta-stone variable naming (`color.bg.surface` ↔ `color-bg-surface`) is mechanical and code-first; component-behavior reverse-encoding (a11y, focus traps, portals) stays agentic and is not this skill's concern. This skill owns pen → code; code → pen token sync is handled by the pen tooling and variable conventions in `pen-design-workflow`.

## 2. Detect — build the candidate inventory

1. Run `pnpm run pen:contract` and capture the `PenContract` JSON to a temp file (e.g. `tmp/pen-contract-REP-xxx.json`). Do not re-parse `repro.pen` directly.
2. Optionally run `pnpm run pen:lint` for drift checks (master path conformance, orphan masters).
3. Build a **candidate inventory** — one entry per design delta, each with its source location in the contract:
   - **New / changed screens** — screens whose resolved component identity or `presentationalOverrides` differ from the applied implementation (compare against the applied-manifest, §6, and the current code).
   - **Changed master overrides** — per-screen `presentationalOverrides` on resolved components.
   - **New state families** — entries in `stateFamilies` not yet wired into the component's loading/empty/error/content rendering.
   - **Unresolved refs / violations** — `violations` with `refId`, `masterName`, `reason`, and `candidates` ("did you mean?").
   - **Override drift** — `warnings` for unmapped descendant overrides and out-of-vocabulary keys.

The candidate-report shape here is **shared with the manual-verification `## Design reconciliation` section** (delivery-workflow §8): in-scope deltas, screens/masters involved, out-of-scope changes listed explicitly.

## 3. Judge relevance — decide which candidates belong to this delivery

Given the current Linear issue, match contract candidates to issue scope:

- Match by **screen name / family** (e.g. the issue names `screens/admin/health`), **component reference** (the issue touches a `Button` on a screen), **state family**, or **affected file paths** in the issue body.
- Design deltas that do **not** belong to this issue are **explicitly deferred** — listed in the output, never swept in. Sweeping unrelated design changes into an implementation PR is a hard failure.
- If the issue carries a `## Design (locked)` section or the `Pen` label, the whole design surface is in scope for relevance judgment.

## 4. Decide — standalone vs build mode

- **Standalone** (`/pen-reconcile`): surface the candidate inventory via the `question` tool — apply all / apply subset / defer / skip — and apply the selection.
- **Build mode** (`/build` phase clause): apply the agent's relevance judgment directly, without a question gate. The `/build` orchestrator has already tasked this skill via the pen-reconcile hand-off mandate.

## 5. Apply — translate and patch

1. For each in-scope, in-vocabulary instance: translate overrides into React component props via the **closed override vocabulary** (§7). Zero LLM involvement for in-vocabulary overrides — it is lookup-table work.
2. For each in-scope instance with **out-of-vocabulary or ambiguous overrides**: surface the violation candidates to the agent for judgment. Never silently guess a prop for an unmapped key.
3. **Patch existing behavioral components — never regenerate.** Locate the component that implements the screen's resolved component identity (`@repro/<pkg>` `<Export>`) and patch only the deltas. The output is a **code-only** reviewable git diff plus an explicit deferred-items list.
4. Wire the **state-family map** (`state → screen` per family) into the applied component's rendering: the family's content/loading/empty/error screens drive which state component renders per condition.
5. Implementation PRs **never write `repro.pen`** (two-PR model). If a pen change is missing, file an issue — do not edit the pen file in an implementation PR.

## 6. Record — applied manifest

Write `tmp/pen-applied.json` mapping each applied screen to the pen revision it was applied from, so "design ahead" runs do not re-ask about already-reconciled work:

```json
{
  "screens/admin/health": { "penVersion": "<penVersion from contract>", "appliedAt": "<ISO timestamp>" }
}
```

Keyed by screen id, value `{ penVersion, appliedAt }`. Consult it during Detect to skip already-reconciled screens.

## 7. Closed override vocabulary (v2)

Reference `VOCABULARIES` in `scripts/pen-contract.ts` — the same tables the contract uses (REP-1629 grew v1 from Button/Alert to the set below). v2:

| Master | Override | Prop |
| --- | --- | --- |
| Button | fill token (`$color-*`) | `context` (default `info` omitted) |
| Button | height 28 / 36 / 44 | `size` small / medium / large (default `medium` omitted) |
| Button | transparent fill + stroke | `variant` outlined / text |
| Button | `opacity` 0.5 | `disabled` true |
| Button | `Label` descendant content | `children` |
| Alert | tint fill (`$color-*-tint`) | `type` (default `info` omitted) |
| Alert | Icon / `Message` solid fill (`$color-*`) | `type` (idempotent with tint) |
| Alert | `Message` descendant content | `children` |
| Checkbox | `Box` fill `$color-primary` (+ `strokeWidth` 0) | `checked` true |
| Checkbox | `Check` `enabled` true | `checked` true |
| Checkbox | `Label` descendant content | `label` |
| Stack | own `gap` | `gap` |
| Stack | `Child 1` descendant content | `children` |
| Stack | `Child 2` / `Child 3` `enabled` false | absorbed (structural child-hiding) |
| TextField | `Label` descendant content | `label` |
| TextField | `Value` descendant content | `value` |
| TextField | `Error` `enabled` false | absorbed (no error state) |
| Toggle | `Track` fill `$color-primary` / `Knob` `x` 16 | `checked` true |
| Toggle | `Label` descendant content | `label` |
| FullPageError | `Title` / `Description` descendant content | `title` / `description` |
| Avatar | `Name` descendant content | `name` |
| AvatarStackSummary | `Label` descendant content | `label` |
| Badge | own fill token (`$color-*-subtle`) | `context` (default `neutral` omitted) |
| Badge | `Label` descendant content | `children` |
| Input | own `stroke` `$color-danger` | `context` `'error'` |
| Input | `Placeholder` descendant content | `value` |

Anything outside this table is **out-of-vocabulary** — surface the contract's `warnings`/`candidates` and judge, never guess. Known intentional gaps (masters whose overrides stay warnings because they expose no semantic prop surface): AdminTable, AppShell, Breadcrumbs, EmptyState, Tabs, Accordion, Card, RefreshProgressBar — tracked in the REP-1629 gap set.

## 8. Eval fixture reference

`tmp/eval-fixture/` contains a minimal self-contained scenario for proving the Detect/Judge capability in isolation:

- `test.pen` — a minimal pen with a Button master, two screens in one state family, and known deltas (one in-vocabulary Button instance, one out-of-vocabulary instance).
- `Button.tsx` — baseline Button component (the Apply target).
- `README.md` — fixture purpose, setup, and how to run the contract against it.
- `scenario.md` — three eval scenarios: in-vocabulary only, out-of-vocabulary, scoped relevance.

Use it to verify that an agent finds the relevant subset of design deltas for a given issue context without explicit scope input.
