# Storybook Visual Regression

Deterministic screenshot diffs for Storybook stories, wired into CI as the
blocking `ui-gates-visual-regression` moon task (REP-1648).

## How the gate works

- `scripts/visual-regression-capture.ts` — Playwright (chromium) captures every
  story (or a `--stories` subset) from a running Storybook and pixel-diffs each
  against the committed baseline PNGs (`pixelmatch`, default threshold
  `0.001` = 0.1% of pixels changed). JSON summary on stdout, non-zero exit on
  failures.
- `scripts/visual-regression.sh` — wrapper that boots (or reuses) Storybook and
  runs the capture. Baselines always resolve to `tmp/visual-baselines/` in the
  checkout under test — a committed, tracked directory.
- CI runs it with `--fail-on-new`: a story without a committed baseline fails
  the gate, so **a new story must ship its baseline in the same PR**.

## Baseline rules

1. **Baselines are committed to the repo** at `tmp/visual-baselines/*.png`
   (file name = story id + `.png`).
2. **Baselines must be generated on Linux** (GitHub `ubuntu-latest` or a Linux
   container). CI rasterizes text with Linux font shaping; macOS captures
   produce false diffs (the wrapper prints a warning when you try on darwin).
3. A PR that changes a component's rendered output **must** update the
   affected baselines in the same PR — otherwise `ui-gates-visual-regression`
   fails with the changed stories listed (each failure carries a diff PNG in
   `tmp/visual-diffs/`).

## Updating baselines (intentional visual change)

1. Push your branch, then trigger **Actions → Build, test and deploy (split) →
   Run workflow** with the **`regenerate_baselines`** input checked.
2. The `regenerate-visual-baselines` job boots Storybook on the Linux runner,
   captures all stories, and uploads the `visual-baselines` artifact.
3. Download the artifact, copy the PNGs into `tmp/visual-baselines/`, review
   them (the diff must match the intentional change only), and commit them
   alongside your PR.

Locally (Linux machine/container only):

```sh
bash scripts/visual-regression.sh --update-baselines --stories '[]'
```

To share an already-running Storybook between wrappers when running the
gates manually, set `REPRO_STORYBOOK_URL`:

```sh
REPRO_STORYBOOK_URL=http://localhost:6099 \
  bash scripts/visual-regression.sh --update-baselines --stories '[]'
```

## Running the gates locally

All three deterministic UI gates run as moon tasks (affected-only in CI, force
them locally with `--force`):

```sh
eval "$(proto activate bash)"

# Visual regression — diff against committed baselines (fails closed on
# missing baselines unless you populate tmp/visual-baselines first)
moon run repro:ui-gates-visual-regression --force

# Storybook test-runner + docs-pages fragmentation gate
moon run repro:ui-gates-storybook --force

# Playwright route smoke (serves both app dists with smoke env)
moon run repro:ui-gates-route-smoke --force
```

When running the gates manually, the wrappers can share one booted
Storybook: set `REPRO_STORYBOOK_URL` to a running Storybook instance and
they skip their own boot. This is an opt-in for local/manual runs only —
the CI gate tasks do **not** set it and each boots its own server
independently, so no gate depends on another gate's server being up.

## Threshold configuration

Default threshold: `0.001` (0.1% of pixels changed). The value must be a
finite number between 0 and 1 — the wrapper rejects anything else before
booting Storybook, and the capture script validates it again. To override
for a specific package, create a `.visual-threshold` file in the package root
containing just the threshold value (e.g. `0.005`) — `scripts/visual-regression.sh`
picks it up from `apps/storybook-ui/.visual-threshold` (the Storybook host
package root).

## Runner-image drift

CI baseline diffs assume a stable rasterization environment. GitHub can update
the `ubuntu-latest` runner image (fonts, fontconfig, chromium build), which may
shift text rendering enough to trip the 0.001 threshold on unrelated PRs. When
that happens:

1. Confirm the failing diff shows a *global* text-shaping shift rather than a
   component-local change (eyeball the diff PNGs in `tmp/visual-diffs/` or the
   failure's diff artifacts).
2. Re-run the `regenerate-visual-baselines` dispatch job on the current runner
   image and commit the refreshed baselines on their own commit
   (`chore(tooling): refresh visual baselines for runner image <tag>`).

## Related gates

- **Storybook test-runner + a11y** (`ui-gates-storybook`): every story renders,
  play functions pass, and axe runs with a critical-only rule set —
  "zero critical violations" (see
  `apps/storybook-ui/.storybook/preview.js` and
  `apps/storybook-ui/.storybook/a11y-critical-rules.js`). Per-story
  suppressions use named run-time rule disables (never a blanket a11y
  disable) so the rest of the critical rule set stays active; every
  suppression reason carries the REP-1685 tracking id.
- **Route smoke** (`ui-gates-route-smoke`): served dist builds against a
  deterministic intercepted API (see `tests/route-smoke/fixtures.ts`).
