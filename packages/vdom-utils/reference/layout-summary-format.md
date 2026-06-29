# Layout Summary Format

A token-efficient plain-text structural map of a recorded page's layout, derived from
ARIA roles, tags, and DOM structure — not pixel geometry.

## Grammar

```
LAYOUT SUMMARY — <framing> (detail: <level>, viewport: <W>x<H>)
────────────────────────────────────────────────────────────
# <region-type> <accessible-name> [ref=<nodeId>]
  └─ <child-region-type> <name> [ref=<nodeId>]
     └─ CTA: <accessible-name> [ref=<nodeId>]
     └─ Grid: <N> columns [ref=<nodeId>]  (+<M> items)
  └─ <region-type> <name> [ref=<nodeId>]
       <text-hint for non-interactive content>
────────────────────────────────────────────────────────────
[token estimate: ~N]
```

## Region Taxonomy

| Role / Tag                          | Layout Label                               |
| ----------------------------------- | ------------------------------------------ |
| `<header>` / `role=banner`          | BANNER                                     |
| `<nav>` / `role=navigation`         | SIDEBAR (desktop) / NAVIGATION (mobile)    |
| `<main>` / `role=main`              | MAIN                                       |
| `<aside>` / `role=complementary`    | SIDEBAR (desktop) / COMPLEMENTARY (mobile) |
| `<footer>` / `role=contentinfo`     | CONTENTINFO                                |
| `<section>` / `role=region` w/ name | SECTION                                    |
| `<form>` / `role=form`              | FORM                                       |
| `role=dialog` + `aria-modal`        | MODAL                                      |
| ≥3 repeated siblings (same tag)     | GRID                                       |

## Detail Levels

| Level      | Max Children/Region | Max Depth | Token Budget |
| ---------- | ------------------- | --------- | ------------ |
| `overview` | 6                   | 1         | ≤500         |
| `regions`  | 6                   | 2         | ≤2000        |
| `detailed` | 12                  | 4         | ≤8000        |

## Bounding

- Per-region child cap: truncated entries shown as `(+N more <type>)`.
- Text hints truncated at 80 characters with `…`.
- CTAs capped at 3 per region, sorted (submit-type first, then shortest name).
- Max nesting depth enforced per detail level; overflow from depth or child caps emits `(+N more <type>)`.

## Desktop vs Mobile Framing

- Viewport width **≥1024** → `DESKTOP` framing.
- Viewport width **<1024** → `MOBILE` framing.
- On desktop, `<nav>` and `<aside>` positioned before `<main>` are labelled **SIDEBAR**.
- On mobile, `<nav>` and `<aside>` are labelled `NAVIGATION` and `COMPLEMENTARY` respectively (no sidebar collapse).

## Heuristics (non-pixel, deterministic)

1. **Region classification**: explicit `role` attribute first, then implicit ARIA role
   from tag name (reuses the `@repro/vdom-utils` a11y role map).
2. **Modal detection**: `role=dialog` + `aria-modal=true` surfaced as top-level MODAL.
3. **Grid detection**: ≥3 direct children with identical tag name are grouped as
   `GRID: N columns` — children are not expanded individually.
4. **CTA detection**: `type=submit` first, then `role=button` / `<a>` with
   action-keyword name (`submit`, `save`, `delete`, `create`, `continue`, etc.)
   or class keywords (`primary`, `cta`). Capped at 3 per region.
5. **Text hints**: collected from child text nodes, truncated at 80 chars.

**Important**: Layout is structurally derived — no pixel geometry (`getBoundingClientRect`,
`offsetWidth`, etc.) is available in the recording format. The summary reflects DOM
structure and ARIA semantics, not visual rendering.

## Examples

### Desktop (1440×900, overview)

```
LAYOUT SUMMARY — DESKTOP (detail: overview, viewport: 1440×900)
────────────────────────────────────────────────────────────
# BANNER "Acme Dashboard" [ref=a1b2c]
  └─ CTA: "Settings" [ref=d3e4f]
# SIDEBAR "Main navigation" [ref=g5h6i]
  └─ (+5 nav items)
# MAIN [ref=j7k8l]
  └─ FORM "Create project" [ref=m9n0o]
     └─ CTA: "Submit" [ref=p1q2r]
  └─ GRID: 3 columns "Project cards" [ref=s3t4u]  (+3 items)
# CONTENTINFO "Footer" [ref=v5w6x]
────────────────────────────────────────────────────────────
[token estimate: ~340]
```

### Mobile (390×844, overview)

```
LAYOUT SUMMARY — MOBILE (detail: overview, viewport: 390×844)
────────────────────────────────────────────────────────────
# BANNER "Acme Dashboard" [ref=a1b2c]
  └─ CTA: "Settings" [ref=d3e4f]
# NAVIGATION "Main navigation" [ref=g5h6i]
# MAIN [ref=j7k8l]
  └─ FORM "Create project" [ref=m9n0o]
     └─ CTA: "Submit" [ref=p1q2r]
  └─ GRID: 3 columns "Project cards" [ref=s3t4u]  (+3 items)
# CONTENTINFO "Footer" [ref=v5w6x]
────────────────────────────────────────────────────────────
[token estimate: ~310]
```

### Modal (desktop, regions)

```
LAYOUT SUMMARY — DESKTOP (detail: regions, viewport: 1440×900)
────────────────────────────────────────────────────────────
# MODAL "Confirm deletion" [ref=x7y8z]
     └─ text: "Are you sure you want to delete this project? This action cannot be undone."
     └─ CTA: "Delete" [ref=a9b0c]
     └─ button "Cancel" [ref=d1e2f]
────────────────────────────────────────────────────────────
[token estimate: ~180]
```

## Canonical Specification

The worked examples above are illustrative. **The executable specification is
`packages/vdom-utils/src/layoutSummary.test.ts`** — its test fixtures are the
authoritative definition of the output format and heuristics.
