# Impeccable rendered-HTML gate — triage record (REP-1656)

This directory holds the detector configuration for the CI design-slop gate:

```
pnpm run render-stories-html          # scripts/render-stories-html.ts → tmp/storybook-html/
npx impeccable detect tmp/storybook-html/ --json   # CI step, blocking (no continue-on-error)
```

`config.json` here is the detector config the CLI picks up automatically.
This README documents why each suppression exists, so the gate stays auditable.

## Baseline and disposition

REP-1650 retargeted the CI detector from TSX source to rendered story HTML.
The first run found **197 findings across 122 rendered pages**. All 197 were
dispositioned under REP-1656 (fixed / suppressed+justified / story waiver):

| Rule                     | Baseline | Disposition                                                                                                                                    |
| ------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| flat-type-hierarchy      | 86       | 35 fixed by the `font-size-xs` 11px→12px token bump; remaining 51 suppressed project-wide via `detector.ignoreRules` (see justification below) |
| tiny-text                | 71       | 70 fixed by the token bump; 1 fixed at source (hardcoded `fontSize={11}` → `fontSize.xs` in `Link-CustomUnderline` demo)                       |
| cramped-padding          | 26       | 26 story-level waivers after container-by-container rubric check (see waiver inventory)                                                        |
| numbered-section-markers | 9        | 9 story-level waivers — detector regex `\b(0[1-9]                                                                                              | 1[0-2])\b` fires on calendar dates (`2024-03-01`) and pagination page numbers (`10, 11, 12`) in demo data, not prose markers |
| tight-leading            | 3        | 3 fixed — `DefinitionList` value element now uses `lineHeight.relaxed` (1.5); terms stay `normal` (1.25)                                       |
| em-dash-overuse          | 1        | 1 fixed — `Card` story copy reworded (colon forms)                                                                                             |
| skipped-heading          | 1        | 1 fixed — `EmptyState.Title` gained `headingLevel?: 'h2' \| 'h3'` (default `h3`); `PageListEmpty` composes `h2` under the page `<h1>`          |

Totals: 111 fixed, 51 suppressed (config), 35 story-waived = 197.

Post-triage proof: `npx impeccable detect tmp/storybook-html/ --json` exits **0**
with zero findings. Working JSON snapshots live in `tmp/` (git-ignored); this
table is the durable record.

**Post-baseline straggler.** Mid-triage, the codegen module for
`apps/capture/ProgressOverlay` got built, its story rendered for the first
time, and the detector found 4× low-contrast (waived, table above) plus
1× tiny-text from the demo wrapper's `fontSize={10}` — fixed at source by
raising the wrapper to the 12px `fontSize.sm` floor.

## Suppression mechanism (why story params, not inline comments)

Inline `impeccable-disable` comments written in **story source files never reach
the detector**: the scan runs over the generated HTML in `tmp/storybook-html/`,
which is regenerated on every render and contains no source comments.

Two render-safe mechanisms exist:

1. **Per-story waiver** — declare on the story export:

   ```ts
   parameters: {
     impeccable: {
       disable: ['cramped-padding'],
       reason: 'why this page is exempt',
     },
   }
   ```

   The render harness (`scripts/render-stories-html.ts` → `buildWaiverDirective`)
   injects a whole-file `<!-- impeccable-disable <rules> -- <reason> -->`
   directive into the generated doc, which the detector's static-html engine
   honors. Gate-tested in `scripts/impeccable-html-gate.test.ts`.

2. **Project-wide rule ignore** — add the rule id to `config.json`
   `detector.ignoreRules`. Used only for `flat-type-hierarchy` (below).

Note: the gate test runs the detector with `--no-config`, which bypasses both
config ignores and injected directives — planted violations must always flag.

## Config suppression: `flat-type-hierarchy` (51 findings)

**Justification.** The rule flags a page with ≥3 distinct computed font sizes
and a max/min ratio < 2.0. After the 12px floor bump, every residual finding
was on a `packages/design` story page whose size set is inherent to a
component-gallery page: the page deliberately displays the type scale
(e.g. `Avatar-Modes`: `12px, 15px, 16px`) alongside browser-default 16px
ambient text from unstyled story wrappers. No scale with a 12px readability
floor can reach max/min ≥ 2.0 on such pages, and the design package's stories
exist precisely to show size variety. A rule-level ignore was chosen over
`ignoreFiles` patterns (which would mask ALL rules on design pages) and over a
type-scale redesign (out of triage scope). **Trade-off:** the rule is also
muted on future app-surface story pages; re-evaluate when the type scale is
reviewed (follow-up). Verified before suppressing: zero non-design pages
triggered FTH after the bump (the two `AskUserPrompt` pages cleared with the
token change).

## Story-waiver inventory (35 findings / 24 pages)

Every waived page was eyeballed against the rubric: waive only when the flagged
container is (a) the component's intended edge-to-edge anatomy or (b) a demo
frame; fix the component instead when genuine content crams against a surface
that should inset it. Two verified misfire classes cover all 26 cramped-padding
findings — structural flex-column page/shell roots (`display:flex` column with
surface background, no own padding, padded children provide the inset) and
bordered demo canvases whose flushness is the demonstration.

| Story page(s)                                                                                                    | Rule                     | Reason                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accordion ×4 (Controlled, Disabled, MultiExpand, SingleExpand)                                                   | cramped-padding          | accordion root is a bordered container by design; rows carry their own padding                                                                                                                                                                                                                                      |
| Center ×2 (Default, WithMaxWidth)                                                                                | cramped-padding          | dashed demo canvas frames the Center primitive; not product UI                                                                                                                                                                                                                                                      |
| DragHandle-AllEdges (2 findings)                                                                                 | cramped-padding          | bordered squares show edge-flush handle placement by design                                                                                                                                                                                                                                                         |
| AppShell conventions ×2 (app-shell, auth-flow)                                                                   | cramped-padding          | shell/viewport root is structural framing; cards and header/body provide inset                                                                                                                                                                                                                                      |
| PageFrame ×4 (Default, ConstrainedWidth, ScrollableContent, InsideAppShell)                                      | cramped-padding          | 100vh demo root is page framing; header/body carry the inset                                                                                                                                                                                                                                                        |
| PageFrame conventions ×6 (page-list, page-list (Empty), page-detail, page-dashboard, page-settings, page-single) | cramped-padding          | shell root is a structural frame; children carry their own inset                                                                                                                                                                                                                                                    |
| Card-CustomPadding                                                                                               | cramped-padding          | story deliberately demonstrates `padding: 0`                                                                                                                                                                                                                                                                        |
| Table (Bleed, DensityComparison ×2, StickyHeader)                                                                | cramped-padding          | edge-to-edge table anatomy / scroll-container demo framing; cell padding provides the real inset                                                                                                                                                                                                                    |
| AdminTable-Default                                                                                               | cramped-padding          | admin tables are edge-to-edge by convention; bordered wrapper is demo framing                                                                                                                                                                                                                                       |
| Table (Default, MultiSelect, SingleSelect, Sortable)                                                             | numbered-section-markers | calendar dates (`2024-03-01`) in demo table data                                                                                                                                                                                                                                                                    |
| Table (Bleed, StickyHeader)                                                                                      | numbered-section-markers | same demo dates (pages carry both waivers)                                                                                                                                                                                                                                                                          |
| AdminTable (Default, Overrides)                                                                                  | numbered-section-markers | same demo dates                                                                                                                                                                                                                                                                                                     |
| Pagination-CompactRange                                                                                          | numbered-section-markers | page-number buttons (`10, 11, 12`) are numeric UI data                                                                                                                                                                                                                                                              |
| ProgressOverlay-Example (apps/capture)                                                                           | low-contrast             | detector flattens the `rgba(0,0,0,0.5)` upload scrim to solid black and scores covered text against it; text behind an active scrim is intentionally obscured — that is the pattern's purpose. (This page began rendering only after the codegen module was built mid-triage; it was absent from the 197 baseline.) |

## Known gate blind spots (out of REP-1656 scope)

- **Render failures.** A handful of story files fail to render and therefore
  produce no HTML for the detector to scan: missing `../generated/buffer-list`
  codegen imports (devtools, playback, apps/capture), SSR-hostile stories
  (`ConfirmDialog`, `Delay`, `Modal`, `RefreshProgressBar` produce empty
  markup), and intentionally-throwing/recursive stories (`ErrorBoundary`,
  `FullPageError`, `LoadingState`, `AgenticView`). The failed count drifts
  slightly between runs (24–31 observed); the classes are stable. Follow-up
  issue tracks gate coverage for these.
- **Baseline drift.** Because render failures drift and module state shifts
  between builds, per-run rendered/failed counts and finding totals can differ
  slightly from the 197/122 baseline. Dispositions were keyed off live detector
  output after each mutation batch, per the test plan.
- **Detector text rules on scanned HTML.** The static-html engine runs the
  text-content rules over page text; only whole-file `impeccable-disable`
  directives apply (findings carry no line numbers).
