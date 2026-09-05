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

## Story-waiver inventory (38 findings / 27 pages)

Every waived page was eyeballed against the rubric: waive only when the flagged
container is (a) the component's intended edge-to-edge anatomy or (b) a demo
frame; fix the component instead when genuine content crams against a surface
that should inset it. Two verified misfire classes cover all 26 cramped-padding
findings — structural flex-column page/shell roots (`display:flex` column with
surface background, no own padding, padded children provide the inset) and
bordered demo canvases whose flushness is the demonstration.

| Story page(s)                                                                                                                                                                          | Rule                                                   | Reason                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accordion ×4 (Controlled, Disabled, MultiExpand, SingleExpand)                                                                                                                         | cramped-padding                                        | accordion root is a bordered container by design; rows carry their own padding                                                                                                                                                                                                                                      |
| Center ×2 (Default, WithMaxWidth)                                                                                                                                                      | cramped-padding                                        | dashed demo canvas frames the Center primitive; not product UI                                                                                                                                                                                                                                                      |
| DragHandle-AllEdges (2 findings)                                                                                                                                                       | cramped-padding                                        | bordered squares show edge-flush handle placement by design                                                                                                                                                                                                                                                         |
| AppShell conventions ×2 (app-shell, auth-flow)                                                                                                                                         | cramped-padding                                        | shell/viewport root is structural framing; cards and header/body provide inset                                                                                                                                                                                                                                      |
| PageFrame ×4 (Default, ConstrainedWidth, ScrollableContent, InsideAppShell)                                                                                                            | cramped-padding                                        | 100vh demo root is page framing; header/body carry the inset                                                                                                                                                                                                                                                        |
| PageFrame conventions ×6 (page-list, page-list (Empty), page-detail, page-dashboard, page-settings, page-single)                                                                       | cramped-padding                                        | shell root is a structural frame; children carry their own inset                                                                                                                                                                                                                                                    |
| Card-CustomPadding                                                                                                                                                                     | cramped-padding                                        | story deliberately demonstrates `padding: 0`                                                                                                                                                                                                                                                                        |
| Table (Bleed, DensityComparison ×2, StickyHeader)                                                                                                                                      | cramped-padding                                        | edge-to-edge table anatomy / scroll-container demo framing; cell padding provides the real inset                                                                                                                                                                                                                    |
| AdminTable-Default                                                                                                                                                                     | cramped-padding                                        | admin tables are edge-to-edge by convention; bordered wrapper is demo framing                                                                                                                                                                                                                                       |
| Table (Default, MultiSelect, SingleSelect, Sortable)                                                                                                                                   | numbered-section-markers                               | calendar dates (`2024-03-01`) in demo table data                                                                                                                                                                                                                                                                    |
| Table (Bleed, StickyHeader)                                                                                                                                                            | numbered-section-markers                               | same demo dates (pages carry both waivers)                                                                                                                                                                                                                                                                          |
| AdminTable (Default, Overrides)                                                                                                                                                        | numbered-section-markers                               | same demo dates                                                                                                                                                                                                                                                                                                     |
| Pagination-CompactRange                                                                                                                                                                | numbered-section-markers                               | page-number buttons (`10, 11, 12`) are numeric UI data                                                                                                                                                                                                                                                              |
| ProgressOverlay-Example (apps/capture)                                                                                                                                                 | low-contrast                                           | detector flattens the `rgba(0,0,0,0.5)` upload scrim to solid black and scores covered text against it; text behind an active scrim is intentionally obscured — that is the pattern's purpose. (This page began rendering only after the codegen module was built mid-triage; it was absent from the 197 baseline.) |
| AgenticView ×10 (Reasoning, Responding, WithToolCalls, ToolExecuting, AskUserPrompting, WithError, WithScreenshotResult, WithTruncation, WithHypotheses, WithRecordingMeta) — REP-1657 | layout-transition, cramped-padding                     | app-shell root is a structural frame with inset children; input-section raise animates margin/padding by design (pages began rendering after the REP-1657 codegen fix)                                                                                                                                              |
| DevTools ×2 (Default, WithClusteredErrors) — REP-1657                                                                                                                                  | layout-transition, cramped-padding                     | SimpleTimeline collapse animates height by design; timeline/grid shells are structural frames with inset children (pages began rendering after the REP-1657 fixes)                                                                                                                                                  |
| Toolbar-Default — REP-1657                                                                                                                                                             | layout-transition, cramped-padding, monotonous-spacing | edge-to-edge tool strip with intended uniform 4px density; embedded SimpleTimeline collapse animates height by design                                                                                                                                                                                               |
| PlaybackEditor-Default, RangeTimeline (Default, With error markers) — REP-1662                                                                                                         | layout-transition                                      | embedded SimpleTimeline collapse animates height by design (grid-template-rows rework is a follow-up); pages began rendering only after the REP-1662 tdl encoder fix                                                                                                                                                |

## Known gate blind spots

- **Render failures — resolved under REP-1657.** The render harness used to
  exit 0 with failures untracked (24 silent zero-coverage stories in the
  REP-1656 baseline). Every failure row is now a closed set: either fixed by
  the harness or explicitly excluded with a reason in
  `.impeccable/render-exclusions.json`. The guard test
  (`scripts/impeccable-html-gate.test.ts` → "REP-1657 render-failure
  blind-spot guard") fails on any uncovered row, so new blind spots cannot
  grow silently.

  **Registry format** — `.impeccable/render-exclusions.json` is an array of
  `{ file, story, reason }`: `file` is repo-relative, `story` is the exact
  story key (`"(module import)"` for module-level failures), and `reason`
  must be non-empty for the entry to count. Unmatched entries are harmless
  but should be pruned during triage.

  **Exit-code contract** — the harness (`pnpm run render-stories-html`)
  exits 1 when nothing rendered, when failures outnumber rendered stories,
  or when any failure is _unexpected_ (neither fixed nor registry-covered);
  it prints each unexpected failure to stderr and records `excluded` /
  `unexpected` in the manifest. Registry-covered failures keep exit 0.

  **Final disposition of the REP-1656 baseline failures** (345 story rows
  across 71 files: 333 rendered, 12 failed — 12 excluded, 0 unexpected):

  | Class                                                                                                        | Rows     | Disposition                                                                                                                                                                                                                                                                                        |
  | ------------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Missing codegen build (`Cannot find module '../generated/*'` + grammar bundle)                               | 13 files | Fixed — the harness builds `@repro/tdl` (grammar bundle) → `@repro/wire-formats` → `@repro/domain` before rendering; idempotent, skipped when the artifacts exist                                                                                                                                  |
  | CSF meta args not inherited (AvatarStackSummary `Default`, `items.slice` crash)                              | 1        | Fixed — harness merges `default.args` under each story's args (Storybook semantics)                                                                                                                                                                                                                |
  | Harness decorator self-recursion (LoadingState ×3, FullPageError `FullPage`, ConfirmDialog `ImperativeHook`) | 5        | Fixed — decorator `Story` closures snapshot the composed tree instead of binding the live accumulator (previously stack-overflowed on any story-level decorator rendering `<Story />`)                                                                                                             |
  | Portal/effect-gated components (ConfirmDialog ×2, Modal ×3, Delay ×2, RefreshProgressBar `Hidden`)           | 8        | Excluded — legitimately unrenderable in static SSR (portal mounts, timer-gated rendering, intentional `null`)                                                                                                                                                                                      |
  | Intentionally-throwing stories (ErrorBoundary `Default` + `CustomFallback`)                                  | 2        | Excluded — the child throws by design; error-boundary recovery is client-side only                                                                                                                                                                                                                 |
  | tdl encoder out-of-bounds on Snapshot-with-VTree (PlaybackEditor, RangeTimeline)                             | 2        | Excluded with **"suspected real issue — needs follow-up"** — `SourceEventView.from` on a Snapshot carrying a `dom` VTree throws `RangeError` inside `@repro/tdl`'s encoder; environment-independent (crashes in the browser too); `tdl` encoder tests are green, so an uncovered encoder edge case |

  **Failure-class taxonomy for the next triage:**

  1. `Cannot find module '../generated/*'` / `'../grammar.ohm-bundle'` —
     gitignored codegen artifact missing; harness-fixable (extend
     `CODEGEN_PREREQS` in `scripts/render-stories-html.ts`).
  2. `DOMParser/Node/ShadowRoot is not defined` — story builds fixture data
     with browser DOM globals at module scope; harness provides jsdom
     constructor globals (no `window`/`document`, which would flip SSR
     branch checks). Extend `DOM_CONSTRUCTOR_GLOBALS` if new globals
     surface.
  3. `renderToStaticMarkup produced empty markup` — portals, effect/timer
     -gated rendering, or intentional `null` returns; legitimately
     unrenderable, exclude with reason.
  4. Intentional throws / error-boundary stories — boundary recovery is
     client-side; exclude with reason.
  5. `Maximum call stack size exceeded` on a decorated story — suspect the
     harness decorator composition first (fixed in REP-1657), then real
     recursion in the component.
  6. `RangeError: Offset is outside the bounds of the DataView` — binary
     encode/decode mismatch in `@repro/tdl`; suspected real bug, exclude
     with "suspected real issue — needs follow-up" and file an issue.
  7. Real story-data bugs (e.g. missing meta args) — fix the story or the
     harness merge; never exclude silently.

- **Baseline drift.** Because module state shifts between builds, per-run
  rendered/failed counts and finding totals can differ slightly from the
  197/122 baseline. Dispositions were keyed off live detector output after
  each mutation batch, per the test plan.
- **Detector text rules on scanned HTML.** The static-html engine runs the
  text-content rules over page text; only whole-file `impeccable-disable`
  directives apply (findings carry no line numbers).
