# Storybook Visual Regression

Deterministic screenshot diffs for Storybook stories, wired into CI as the
blocking `ui-gates-visual-regression` moon task (REP-1648).

## How the gate works

- `scripts/visual-regression-capture.ts` — Playwright (chromium) captures every
  story (or a `--stories` subset) from a running Storybook and pixel-diffs each
  against the committed baseline PNGs (`pixelmatch`, default threshold
  `0.001` = 0.1% of pixels changed). JSON summary on stdout, non-zero exit on
  failures.
- `scripts/visual-regression.sh` — wrapper that serves the prebuilt
  Storybook static bundle (or reuses a running server via
  `REPRO_STORYBOOK_URL`) and runs the capture. Baselines always resolve to
  `tmp/visual-baselines/` in the checkout under test — a committed, tracked
  directory.
- CI runs it with `--fail-on-new`: a story without a committed baseline fails
  the gate, so **a new story must ship its baseline in the same PR**.

### Capture resilience

Each story is captured on its own fresh browser page (closed as soon as the
story finishes), so a single story's capture failure — timeout, crashed tab —
is recorded for that story alone and cannot poison the rest of the run. If the
browser session itself dies mid-run (for example the runner kills the headless
chromium process), the capture relaunches it and retries the interrupted story
once; relaunches are bounded (2 after the initial launch). When the budget is
exhausted, the run fails closed: every remaining story is reported in `failed`
with a `browser recovery exhausted` error, so a partially-captured run can
never exit green. Re-running after an isolated browser death is expected to
succeed (this is what happened in the REP-1648 baseline-regeneration failure).

## Static Storybook serving (REP-1648)

Both Storybook-consuming wrappers (`scripts/visual-regression.sh` and
`scripts/storybook-gates.sh`) serve the **prebuilt**
`apps/storybook-ui/storybook-static` output with `python3 -m http.server`
instead of booting the Vite dev server. The test-runner's one-shot setup-page
script is lost when Vite re-optimizes/reloads mid-run (upstream
`@storybook/test-runner` issue #68) — push CI run 34275653377 flaked 30 Select
stories with `page.evaluate: ReferenceError: __test is not defined`
(318/348 passed). A static server has no reload window, so the race cannot
happen.

Consequences:

- The bundle must exist and be current: the moon gate tasks
  (`ui-gates-visual-regression`, `ui-gates-storybook`) depend on
  `repro/storybook-ui:build`, and the `regenerate-visual-baselines` workflow
  builds the bundle before capture. Locally, run
  `moon run repro/storybook-ui:build` first.
- A missing or incomplete bundle (`index.html`, `iframe.html`, `index.json`)
  fails the wrapper immediately with a build-first message — never a slow,
  confusing browser failure later.
- `REPRO_STORYBOOK_URL` reuse is unchanged: point it at any running
  Storybook (static or dev) and both wrappers skip their own server.

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
2. The `regenerate-visual-baselines` job builds the Storybook static bundle,
   serves it with the wrapper, captures all stories, and uploads the
   `visual-baselines` artifact.
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

When running the gates manually, the wrappers can share one running
Storybook: set `REPRO_STORYBOOK_URL` to a running Storybook instance and
they skip their own static server. This is an opt-in for local/manual runs
only — the CI gate tasks do **not** set it and each serves its own bundle
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
